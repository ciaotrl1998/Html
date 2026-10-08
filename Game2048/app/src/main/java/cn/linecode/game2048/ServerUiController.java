package cn.linecode.game2048;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Message;
import android.os.Messenger;
import android.os.RemoteException;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AlertDialog;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import java.io.File;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** Server picker and status dialogs, independent of the scanned HTML game catalogue. */
final class ServerUiController {
    private final MainActivity activity;
    private final ExecutorService scanner = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private Bundle state = new Bundle();
    private boolean bound, wantStatus;
    private long startRequest;
    private Messenger remote;
    private AlertDialog statusDialog;
    private final Messenger receiver = new Messenger(new Handler(Looper.getMainLooper(), message -> {
        if (message.what != GameServerService.STATUS) return false;
        Bundle next = message.getData();
        if ("idle".equals(next.getString("phase")) && "starting".equals(state.getString("phase"))) return true;
        state = new Bundle(next);
        if (wantStatus && !"idle".equals(state.getString("phase"))) showStatus();
        return true;
    }));
    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            remote = new Messenger(binder); communicate(GameServerService.REGISTER);
        }
        @Override public void onServiceDisconnected(ComponentName name) {
            remote = null;
            if (!"running".equals(state.getString("phase")) && !"starting".equals(state.getString("phase"))) return;
            state.putString("phase", "failed"); state.putString("message", "服务器进程已结束，可重新建立服务器");
            try {
                JSONObject report = ServerScanner.json(new File(activity.getFilesDir(), "server-status.json"));
                if ("failed".equals(report.optString("phase"))) state.putString("message", report.optString("error"));
            } catch (Exception ignored) {}
            if (wantStatus) showStatus();
        }
        @Override public void onBindingDied(ComponentName name) { unbind(); bind(); }
    };

    ServerUiController(MainActivity activity) {
        this.activity = activity; state.putString("phase", "idle");
    }
    void bind() {
        if (!bound) bound = activity.bindService(new Intent(activity, GameServerService.class), connection, Context.BIND_AUTO_CREATE);
    }
    void unbind() {
        if (bound) { communicate(GameServerService.UNREGISTER); activity.unbindService(connection); }
        bound = false; remote = null;
    }
    void destroy() {
        scanner.shutdownNow(); unbind();
        if (statusDialog != null) statusDialog.dismiss();
    }
    private void communicate(int type) {
        if (remote == null) return;
        Message message = Message.obtain(null, type); message.replyTo = receiver;
        try { remote.send(message); } catch (RemoteException ignored) {}
    }
    void showRunning() {
        wantStatus = true;
        if (!"idle".equals(state.getString("phase"))) showStatus();
    }

    void open(String rootPath) {
        if ("starting".equals(state.getString("phase"))) { showRunning(); return; }
        View button = activity.findViewById(R.id.btnServer); button.setEnabled(false);
        Toast.makeText(activity, "正在查找可用服务器…", Toast.LENGTH_SHORT).show();
        scanner.execute(() -> {
            File root = HtmlGameScanner.resolveToFile(rootPath);
            List<ServerEntry> entries = ServerScanner.scan(root);
            main.post(() -> {
                if (activity.isFinishing() || activity.isDestroyed()) return;
                button.setEnabled(true);
                AlertDialog.Builder dialog = new AlertDialog.Builder(activity).setTitle(R.string.create_server)
                        .setNegativeButton("取消", null);
                if (entries.isEmpty()) dialog.setMessage("当前 HTML 游戏目录中未找到可运行的 Node.js 服务。\n游戏文件夹需包含 server.js、server.cjs、server.mjs 或 package.json 中的 Node 启动入口。");
                else {
                    String[] names = new String[entries.size()];
                    for (int i = 0; i < names.length; i++) names[i] = entries.get(i).name;
                    dialog.setItems(names, (d, which) -> start(entries.get(which)));
                }
                if ("running".equals(state.getString("phase"))) dialog.setPositiveButton("查看运行服务", (d, which) -> showRunning());
                dialog.show();
            });
        });
    }

    private void start(ServerEntry entry) {
        if (("stopped".equals(state.getString("phase")) || "failed".equals(state.getString("phase"))) && remote != null && state.containsKey("pid")) {
            Toast.makeText(activity, "正在关闭上一个服务器，请稍候再启动", Toast.LENGTH_SHORT).show(); return;
        }
        if ("running".equals(state.getString("phase"))) {
            if (!entry.entry.getAbsolutePath().equals(state.getString("entry"))) Toast.makeText(activity, "请先停止当前服务器，再启动其他服务", Toast.LENGTH_LONG).show();
            showRunning(); return;
        }
        state = entry.toBundle(); state.putString("phase", "starting"); state.putString("message", "正在准备服务器…");
        long request = ++startRequest;
        main.postDelayed(() -> {
            if (request != startRequest || !"starting".equals(state.getString("phase"))) return;
            state.putString("phase", "failed"); state.putString("message", "未收到服务器启动结果，请重新建立服务并检查入口及依赖。");
            if (wantStatus) showStatus();
        }, 35000);
        wantStatus = true; showStatus();
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(activity, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7301);
        }
        try {
            Intent intent = new Intent(activity, GameServerService.class).setAction(GameServerService.ACTION_START).putExtra("project", entry.toBundle());
            ContextCompat.startForegroundService(activity, intent);
        } catch (Exception error) {
            state.putString("phase", "failed"); state.putString("message", "无法启动服务：" + error.getMessage()); showStatus();
        }
    }

    private void showStatus() {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        if (statusDialog != null) { statusDialog.setOnDismissListener(null); statusDialog.dismiss(); }
        String phase = state.getString("phase", "idle");
        boolean running = "running".equals(phase);
        LinearLayout content = new LinearLayout(activity); content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(20), dp(8), dp(20), dp(6));
        if (running) {
            address(content, "本机", localUrl());
            List<String> addresses = ServerAddresses.lan(activity);
            if (state.getBoolean("localOnly")) text(content, "此服务只监听本机地址；需要局域网联机时请将服务监听地址设为 0.0.0.0。", true);
            else if (addresses.isEmpty()) text(content, "局域网：尚未获得地址，请连接 Wi-Fi 或开启热点后查看。", true);
            else for (String ip : addresses) address(content, "局域网", state.getString("protocol", "http") + "://" + ip + ":" + state.getInt("port"));
        } else text(content, state.getString("message", "服务器已停止"), false);
        AlertDialog.Builder builder = new AlertDialog.Builder(activity)
                .setTitle(running ? state.getString("name", "游戏") + "联机服务已启动" : "starting".equals(phase) ? "正在建立服务器" : "failed".equals(phase) ? "服务器启动失败" : "服务器已停止")
                .setView(content).setNegativeButton("关闭", (d, which) -> wantStatus = false);
        if (running) builder.setPositiveButton("进入游戏", (d, which) -> {
            wantStatus = false;
            activity.startActivity(new Intent(activity, GamePlayerActivity.class)
                    .putExtra(GamePlayerActivity.EXTRA_GAME_URL, localUrl())
                    .putExtra(GamePlayerActivity.EXTRA_GAME_TITLE, state.getString("name")));
        });
        if (running || "starting".equals(phase)) builder.setNeutralButton("停止服务器", (d, which) -> {
            wantStatus = false;
            activity.startService(new Intent(activity, GameServerService.class).setAction(GameServerService.ACTION_STOP));
            Toast.makeText(activity, "服务器已停止", Toast.LENGTH_SHORT).show();
        });
        statusDialog = builder.create();
        statusDialog.setOnCancelListener(d -> wantStatus = false);
        statusDialog.show();
    }
    private void address(LinearLayout parent, String label, String url) {
        text(parent, label + "：", true);
        LinearLayout row = new LinearLayout(activity); row.setGravity(android.view.Gravity.CENTER_VERTICAL);
        TextView address = new TextView(activity); address.setText(url); address.setTextColor(ContextCompat.getColor(activity, R.color.text));
        address.setTextSize(13); address.setTextIsSelectable(true);
        row.addView(address, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        Button copy = new Button(activity); copy.setText("复制"); copy.setTextSize(12); copy.setTextColor(ContextCompat.getColor(activity, R.color.text));
        copy.setMinWidth(0); copy.setMinimumWidth(0); copy.setPadding(0, 0, 0, 0); copy.setBackgroundResource(R.drawable.bg_secondary_button);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(48), dp(36)); params.leftMargin = dp(8); row.addView(copy, params);
        copy.setContentDescription("复制" + label + "地址");
        copy.setOnClickListener(v -> Toast.makeText(activity, GameClipboard.copy(activity, label + "地址", url) ? "地址已复制" : "复制失败", Toast.LENGTH_SHORT).show());
        parent.addView(row);
    }
    private void text(LinearLayout parent, String value, boolean muted) {
        TextView text = new TextView(activity); text.setText(value); text.setTextSize(14);
        text.setTextColor(ContextCompat.getColor(activity, muted ? R.color.text_muted : R.color.text));
        text.setPadding(0, dp(10), 0, dp(5)); parent.addView(text);
    }
    private int dp(int value) { return Math.round(value * activity.getResources().getDisplayMetrics().density); }
    private String localUrl() {
        String host = "::1".equals(state.getString("bindAddress")) ? "[::1]" : "127.0.0.1";
        return state.getString("protocol", "http") + "://" + host + ":" + state.getInt("port");
    }
    String runningUrlFor(String gameUrl) {
        if (!"running".equals(state.getString("phase"))) return null;
        try {
            File game = HtmlGameScanner.resolveToFile(gameUrl); if (game == null) return null;
            String directory = new File(state.getString("directory", "")).getCanonicalPath() + File.separator;
            return game.getCanonicalPath().startsWith(directory) ? localUrl() : null;
        } catch (Exception ignored) { return null; }
    }
}
