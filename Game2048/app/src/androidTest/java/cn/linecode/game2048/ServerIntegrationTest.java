package cn.linecode.game2048;

import static org.junit.Assert.*;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Message;
import android.os.Messenger;
import android.widget.ImageButton;
import android.webkit.WebView;
import android.view.ViewGroup;
import android.net.Uri;
import androidx.core.content.ContextCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ServerIntegrationTest {
    private Context context() { return InstrumentationRegistry.getInstrumentation().getTargetContext(); }
    private void write(File file, String value) throws Exception {
        assertTrue(file.getParentFile().isDirectory() || file.getParentFile().mkdirs());
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(value.getBytes(StandardCharsets.UTF_8)); }
    }
    private File library() throws Exception {
        File directory = new File(context().getFilesDir(), "server-test-library"); assertTrue(directory.isDirectory() || directory.mkdirs());
        write(new File(directory, "index.html"), "<html><title>测试游戏</title><body>test</body></html>");
        context().getSharedPreferences("html_game_box", Context.MODE_PRIVATE).edit().putString("folder_uri", directory.getAbsolutePath()).commit();
        GameCache.clear(context()); return directory;
    }

    @Test public void scannerFindsDifferentProjectsAndQuotedNodeEntries() throws Exception {
        File root = library(), first = new File(root, "古坊示例"), second = new File(root, "另一个目录"), ignored = new File(root, "node_modules/not-a-game");
        write(new File(first, "server.js"), "require('http').createServer().listen(0)");
        write(new File(second, "src/my server.cjs"), "require('http').createServer().listen(0)");
        write(new File(second, "package.json"), "{\"displayName\":\"另一款游戏\",\"scripts\":{\"start\":\"PORT=4567 node --max-old-space-size=128 \\\"src/my server.cjs\\\" --game test\"}}");
        write(new File(ignored, "server.js"), "ignored");
        java.util.List<ServerEntry> found = ServerScanner.scan(root);
        assertTrue(found.stream().anyMatch(entry -> entry.name.equals("古坊示例")));
        ServerEntry entry = found.stream().filter(item -> item.name.equals("另一款游戏")).findFirst().get();
        assertEquals("4567", entry.environment.get("PORT")); assertEquals(2, entry.arguments.size());
        assertTrue(entry.entry.getPath().endsWith("my server.cjs"));
        assertFalse(found.stream().anyMatch(item -> item.directory.getPath().contains("node_modules")));
    }

    @Test public void nativeServerStartsFromArbitraryFoldersSurvivesUiExitAndRestarts() throws Exception {
        File root = library();
        for (int attempt = 0; attempt < 2; attempt++) {
            File project = new File(root, "任意位置 🚀 " + attempt);
            File entryFile = new File(project, attempt == 0 ? "backend.cjs" : "backend.mjs");
            write(new File(project, "value.txt"), "cwd-" + attempt);
            write(entryFile, attempt == 0 ?
                    "if(require.main!==module)throw Error('main');const ws=require('ws');const text=require('fs').readFileSync('value.txt','utf8');require('http').createServer((q,s)=>s.end(text)).listen(0,'0.0.0.0');" :
                    "import http from 'node:http';import {readFileSync} from 'node:fs';import {WebSocketServer} from 'ws';const text=readFileSync('value.txt','utf8');const server=http.createServer((q,s)=>s.end(text));new WebSocketServer({server});server.listen(0,'0.0.0.0');");
            ServerEntry entry = new ServerEntry("测试服务" + attempt, project, entryFile, new ArrayList<>(), new ArrayList<>(), new HashMap<>());
            CountDownLatch ready = new CountDownLatch(1); AtomicReference<Bundle> state = new AtomicReference<>();
            Messenger receiver = new Messenger(new Handler(Looper.getMainLooper(), message -> {
                Bundle update = message.getData(); state.set(new Bundle(update));
                if ("running".equals(update.getString("phase"))) ready.countDown(); return true;
            }));
            ServiceConnection connection = new ServiceConnection() {
                @Override public void onServiceConnected(ComponentName name, IBinder binder) {
                    Message register = Message.obtain(null, GameServerService.REGISTER); register.replyTo = receiver;
                    try { new Messenger(binder).send(register); } catch (Exception error) { throw new AssertionError(error); }
                }
                @Override public void onServiceDisconnected(ComponentName name) {}
            };
            Intent service = new Intent(context(), GameServerService.class);
            try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
                scenario.onActivity(activity -> {
                    ImageButton serverButton = activity.findViewById(R.id.btnServer); assertNotNull(serverButton);
                    assertTrue(serverButton.getLeft() < activity.findViewById(R.id.btnRefresh).getLeft());
                    ContextCompat.startForegroundService(activity, new Intent(service).setAction(GameServerService.ACTION_START).putExtra("project", entry.toBundle()));
                });
                assertTrue(context().bindService(service, connection, Context.BIND_AUTO_CREATE));
                try {
                    assertTrue("Native readiness failed: " + state.get(), ready.await(35, TimeUnit.SECONDS));
                    assertTrue(state.get().getInt("port") > 0);
                    assertEquals("cwd-" + attempt, request(state.get().getInt("port")));
                    scenario.close(); // Foreground server must continue after MainActivity is gone.
                    assertEquals("cwd-" + attempt, request(state.get().getInt("port")));
                } finally { context().unbindService(connection); context().stopService(service); }
            }
            Thread.sleep(800); // Separate process has exited; next iteration starts a fresh engine.
        }
    }
    private String request(int port) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL("http://127.0.0.1:" + port).openConnection();
        connection.setConnectTimeout(3000); connection.setReadTimeout(3000);
        try (java.io.InputStream input = connection.getInputStream(); java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
            byte[] bytes = new byte[4096]; int count; while ((count = input.read(bytes)) >= 0) output.write(bytes, 0, count);
            return output.toString("UTF-8");
        } finally { connection.disconnect(); }
    }

    @Test public void foregroundClipboardCopiesAndPastesWithoutExtraPermission() throws Exception {
        library();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            java.util.concurrent.atomic.AtomicBoolean focused = new java.util.concurrent.atomic.AtomicBoolean();
            for (int i = 0; i < 100 && !focused.get(); i++) {
                scenario.onActivity(activity -> focused.set(activity.hasWindowFocus())); Thread.sleep(50);
            }
            assertTrue("Clipboard requires a focused foreground window", focused.get());
            scenario.onActivity(activity -> {
                GameClipboard clipboard = new GameClipboard(activity);
                assertTrue(clipboard.writeText("http://192.168.1.100:8787 · 古坊🚀"));
                assertEquals("http://192.168.1.100:8787 · 古坊🚀", clipboard.readText());
            });
        }
    }

    @Test public void webViewClipboardBridgeWorksInLocalHtml() throws Exception {
        File page = new File(library(), "clipboard-test.html");
        write(page, "<html><body><input id='room' type='text'></body></html>");
        Intent intent = new Intent(context(), GamePlayerActivity.class)
                .putExtra(GamePlayerActivity.EXTRA_GAME_URL, Uri.fromFile(page).toString());
        try (ActivityScenario<GamePlayerActivity> scenario = ActivityScenario.launch(intent)) {
            AtomicReference<String> ready = new AtomicReference<>();
            for (int i = 0; i < 100 && !"true".equals(ready.get()); i++) {
                scenario.onActivity(activity -> {
                    WebView view = (WebView) ((ViewGroup) activity.findViewById(android.R.id.content)).getChildAt(0);
                    view.requestFocus();
                    view.evaluateJavascript("!!(navigator.clipboard && navigator.clipboard.writeText.toString().indexOf('HtmlBoxClipboard') >= 0)", ready::set);
                });
                Thread.sleep(100);
            }
            assertEquals("WebView clipboard polyfill not installed", "true", ready.get());
            scenario.onActivity(activity -> {
                WebView view = (WebView) ((ViewGroup) activity.findViewById(android.R.id.content)).getChildAt(0);
                view.evaluateJavascript("navigator.clipboard.writeText('本机 http://127.0.0.1:8787 🚀').then(function(){return navigator.clipboard.readText();}).then(function(value){window.clipboardResult=value;document.getElementById('room').value=value;}).catch(function(error){window.clipboardResult='ERROR:'+error;})", null);
            });
            AtomicReference<String> result = new AtomicReference<>();
            for (int i = 0; i < 100 && (result.get() == null || "null".equals(result.get())); i++) {
                scenario.onActivity(activity -> ((WebView) ((ViewGroup) activity.findViewById(android.R.id.content)).getChildAt(0))
                        .evaluateJavascript("window.clipboardResult || null", result::set));
                Thread.sleep(100);
            }
            assertEquals("本机 http://127.0.0.1:8787 🚀", new org.json.JSONTokener(result.get()).nextValue());
        }
    }

    @Test public void serverButtonUsesCurrentHtmlDirectoryWithoutAnotherFolderPicker() throws Exception {
        File project = new File(library(), "自动发现的联机游戏");
        write(new File(project, "server.js"), "require('http').createServer().listen(0)");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.findViewById(R.id.btnServer).performClick());
            android.view.accessibility.AccessibilityNodeInfo root = null;
            for (int i = 0; i < 100; i++) {
                root = InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
                if (root != null && !root.findAccessibilityNodeInfosByText("自动发现的联机游戏").isEmpty()) break;
                Thread.sleep(100);
            }
            assertNotNull(root);
            assertFalse("Server list should use the already selected HTML folder", root.findAccessibilityNodeInfosByText("自动发现的联机游戏").isEmpty());
            assertTrue("No second server-directory selection", root.findAccessibilityNodeInfosByText("选择服务器目录").isEmpty());
        }
    }
}
