package cn.linecode.game2048;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Message;
import android.os.Messenger;
import android.os.PowerManager;
import android.os.Process;
import android.os.RemoteException;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** A foreground service in a separate process: the real server survives closing the WebView. */
public final class GameServerService extends Service {
    static final String ACTION_START = "cn.linecode.game2048.START_SERVER";
    static final String ACTION_STOP = "cn.linecode.game2048.STOP_SERVER";
    static final int REGISTER = 1, UNREGISTER = 2, STATUS = 3;
    private static final String CHANNEL = "local-game-server";
    private static final int NOTIFICATION = 8787;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ArrayList<Messenger> clients = new ArrayList<>();
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private final Messenger messenger = new Messenger(new Handler(Looper.getMainLooper(), message -> {
        if (message.what == REGISTER && message.replyTo != null) {
            if (!clients.contains(message.replyTo)) clients.add(message.replyTo);
            send(message.replyTo);
        } else if (message.what == UNREGISTER) clients.remove(message.replyTo);
        return true;
    }));
    private Bundle state = idle();
    private PowerManager.WakeLock wakeLock;
    private boolean launched;
    private volatile boolean stopping;
    private File statusFile;
    private String nonce, lastReport;
    private long startedAt;

    private static Bundle idle() { Bundle result = new Bundle(); result.putString("phase", "idle"); return result; }
    @Override public IBinder onBind(Intent intent) { return messenger.getBinder(); }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        if (ACTION_STOP.equals(intent.getAction())) { stopServer(); return START_NOT_STICKY; }
        if (!ACTION_START.equals(intent.getAction())) return START_NOT_STICKY;
        if (launched) { broadcast(); return START_NOT_STICKY; }
        Bundle project = intent.getBundleExtra("project");
        if (project == null) { stopSelf(); return START_NOT_STICKY; }
        launched = true;
        state = new Bundle(project); state.putString("phase", "starting");
        state.putInt("pid", Process.myPid());
        state.putString("message", "正在准备服务器运行环境…");
        try {
            NotificationManager notifications = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26) notifications.createNotificationChannel(new NotificationChannel(CHANNEL, "游戏联机服务器", NotificationManager.IMPORTANCE_LOW));
            if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(NOTIFICATION, notification());
            PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "HtmlBox:GameServer");
            wakeLock.acquire();
            broadcast();
            worker.execute(() -> prepare(project));
        } catch (Throwable error) { fail(error.getMessage()); }
        return START_NOT_STICKY;
    }

    private void prepare(Bundle project) {
        try {
            File directory = new File(project.getString("directory", "")).getCanonicalFile();
            File entry = new File(project.getString("entry", "")).getCanonicalFile();
            if (!directory.isDirectory() || !entry.isFile() || !entry.canRead()) throw new Exception("服务器入口不存在或没有文件读取权限");
            File runtime = installRuntime();
            statusFile = new File(getFilesDir(), "server-status.json");
            statusFile.delete(); nonce = UUID.randomUUID().toString();
            JSONObject environment = new JSONObject(); Bundle env = project.getBundle("env");
            if (env != null) for (String key : env.keySet()) {
                environment.put(key, env.getString(key));
                android.system.Os.setenv(key, env.getString(key), true);
            }
            JSONObject config = new JSONObject().put("cwd", directory.getAbsolutePath())
                    .put("title", project.getString("name")).put("statusFile", statusFile.getAbsolutePath())
                    .put("nonce", nonce).put("env", environment).put("interfaces", ServerAddresses.interfaces(this));
            File configuration = new File(getFilesDir(), "server-config.json");
            try (FileOutputStream output = new FileOutputStream(configuration)) { output.write(config.toString().getBytes(StandardCharsets.UTF_8)); }
            ArrayList<String> arguments = new ArrayList<>(); arguments.add("node");
            arguments.add("--require"); arguments.add(new File(runtime, "prelude.js").getAbsolutePath());
            if (isModule(entry)) {
                arguments.add("--experimental-loader"); arguments.add(new File(runtime, "esm-loader.mjs").toURI().toString());
            }
            ArrayList<String> options = project.getStringArrayList("options");
            if (options != null) arguments.addAll(options);
            arguments.add(entry.getAbsolutePath());
            ArrayList<String> extra = project.getStringArrayList("arguments"); if (extra != null) arguments.addAll(extra);
            startedAt = SystemClock.elapsedRealtime();
            main.post(() -> { state.putString("message", "正在等待服务器监听端口…"); broadcast(); });
            if (stopping) return;
            new Thread(() -> {
                try {
                    int code = NodeRuntime.start(arguments.toArray(new String[0]), configuration, directory);
                    if (!stopping) main.post(() -> fail("服务器程序已结束（返回码 " + code + "），请检查启动入口"));
                } catch (Throwable error) { if (!stopping) main.post(() -> fail("无法运行服务器：" + error)); }
            }, "HtmlBox-Node").start();
            worker.scheduleWithFixedDelay(this::pollReadiness, 100, 300, TimeUnit.MILLISECONDS);
        } catch (Throwable error) { main.post(() -> fail(error.getMessage())); }
    }

    private void pollReadiness() {
        if (stopping) return;
        try {
            JSONObject report = ServerScanner.json(statusFile);
            if (!nonce.equals(report.optString("nonce"))) {
                if (SystemClock.elapsedRealtime() - startedAt > 30000) main.post(() -> fail("30 秒内没有检测到 HTTP/HTTPS 监听，请检查入口及依赖。运行日志可在 adb logcat 的 HtmlBoxServer 中查看。"));
                return;
            }
            String text = report.toString(); if (text.equals(lastReport)) return; lastReport = text;
            main.post(() -> {
                if (stopping) return;
                if ("failed".equals(report.optString("phase"))) { fail(report.optString("error", "服务器启动失败")); return; }
                state.putString("phase", "running"); state.putInt("port", report.optInt("port"));
                state.putString("protocol", report.optString("protocol", "http")); state.putBoolean("localOnly", report.optBoolean("localOnly"));
                state.putString("bindAddress", report.optString("bindAddress"));
                state.putString("message", state.getString("name") + "联机服务已启动");
                ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION, notification());
                broadcast();
            });
        } catch (Exception ignored) { /* Atomic readiness file may not exist yet. */ }
    }

    private File installRuntime() throws Exception {
        File target = new File(getFilesDir(), "node-runtime");
        String version = String.valueOf(getPackageManager().getPackageInfo(getPackageName(), 0).lastUpdateTime);
        File marker = new File(target, ".version");
        if (marker.isFile() && new File(target, "prelude.js").isFile()
                && version.equals(ServerScanner.readText(marker))) return target;
        copyAssets("node-runtime", target);
        try (FileOutputStream output = new FileOutputStream(marker)) { output.write(version.getBytes(StandardCharsets.UTF_8)); }
        return target;
    }
    private boolean isModule(File entry) throws Exception {
        if (entry.getName().endsWith(".mjs")) return true;
        if (!entry.getName().endsWith(".js")) return false;
        for (File parent = entry.getParentFile(); parent != null; parent = parent.getParentFile()) {
            File pkg = new File(parent, "package.json");
            if (pkg.isFile()) return "module".equals(ServerScanner.json(pkg).optString("type"));
        }
        return false;
    }
    private void copyAssets(String source, File target) throws Exception {
        String[] children = getAssets().list(source);
        if (children != null && children.length > 0) {
            if (!target.isDirectory() && !target.mkdirs()) throw new Exception("无法建立运行环境目录");
            for (String child : children) copyAssets(source + "/" + child, new File(target, child));
        } else {
            try (InputStream input = getAssets().open(source); FileOutputStream output = new FileOutputStream(target)) {
                byte[] bytes = new byte[8192]; int count;
                while ((count = input.read(bytes)) >= 0) output.write(bytes, 0, count);
            }
        }
    }
    private Notification notification() {
        Intent open = new Intent(this, MainActivity.class).putExtra("show_server", true)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stop = new Intent(this, GameServerService.class).setAction(ACTION_STOP);
        PendingIntent action = PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_server_notification)
                .setContentTitle(state.getString("name", "游戏") + "服务器")
                .setContentText("running".equals(state.getString("phase")) ? "端口 " + state.getInt("port") + " · 点击查看地址" : "正在启动…")
                .setContentIntent(content).setOngoing(true).addAction(0, "停止服务器", action).build();
    }
    private void send(Messenger target) {
        Message message = Message.obtain(null, STATUS); message.setData(new Bundle(state));
        try { target.send(message); } catch (RemoteException ignored) {}
    }
    private void broadcast() {
        for (Iterator<Messenger> iterator = clients.iterator(); iterator.hasNext();) {
            Messenger client = iterator.next(); Message message = Message.obtain(null, STATUS); message.setData(new Bundle(state));
            try { client.send(message); } catch (RemoteException ignored) { iterator.remove(); }
        }
    }
    private void fail(String error) {
        if (stopping) return;
        state.putString("phase", "failed"); state.putString("message", error == null ? "服务器启动失败" : error);
        broadcast(); shutdown();
    }
    private void stopServer() {
        state.putString("phase", "stopped"); broadcast(); shutdown();
    }
    private void shutdown() {
        stopping = true; worker.shutdownNow();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(true); stopSelf();
        // node::Start is one-shot. A fresh service process enables a genuine subsequent restart.
        main.postDelayed(() -> Process.killProcess(Process.myPid()), 300);
    }
    @Override public void onDestroy() {
        stopping = true; worker.shutdownNow();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
        if (launched) Process.killProcess(Process.myPid());
    }
}
