package cn.linecode.game2048;

import android.annotation.SuppressLint;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.documentfile.provider.DocumentFile;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class GamePlayerActivity extends AppCompatActivity {
    public static final String EXTRA_GAME_URL = "game_url";
    public static final String EXTRA_GAME_TITLE = "game_title";
    public static final String EXTRA_LIBRARY_URI = "library_uri";
    public static final String EXTRA_PACKAGE_PATH = "package_path";
    public static final String EXTRA_ARCHIVE_ENTRY = "archive_entry";

    private static final int MAX_PACKAGE_DEPTH = 12;
    private static final int MAX_PACKAGE_FILES = 5000;
    private static final long MAX_PACKAGE_BYTES = 256L * 1024L * 1024L;

    private WebView webView;
    private final ExecutorService packageExecutor = Executors.newSingleThreadExecutor();

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemBars();

        String url = getIntent().getStringExtra(EXTRA_GAME_URL);
        String title = getIntent().getStringExtra(EXTRA_GAME_TITLE);
        String libraryUri = getIntent().getStringExtra(EXTRA_LIBRARY_URI);
        String packagePath = getIntent().getStringExtra(EXTRA_PACKAGE_PATH);
        String archiveEntry = getIntent().getStringExtra(EXTRA_ARCHIVE_ENTRY);
        if (title != null) {
            setTitle(title);
        }
        if (url == null || url.trim().isEmpty()) {
            finish();
            return;
        }

        webView = new WebView(this);
        // HTML 尚未绘制时使用与应用一致的浅灰底色,游戏页面加载后仍使用自身样式。
        webView.setBackgroundColor(0xFFF2F3F5);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setOnLongClickListener(v -> true);
        webView.setLongClickable(false);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                if (target == null) {
                    return true;
                }
                String scheme = target.getScheme();
                return !(scheme != null && (
                        scheme.equals("file")
                                || scheme.equals("content")
                                || scheme.equals("https")
                                || scheme.equals("http")
                                || scheme.equals("about")
                ));
            }
        });
        webView.setWebChromeClient(new WebChromeClient());

        setContentView(webView);

        // zip 压缩包:先在后台解压,再加载包内入口 HTML。
        if (archiveEntry != null && !archiveEntry.trim().isEmpty()) {
            loadArchiveInBackground(url, archiveEntry);
            return;
        }

        String playable = HtmlGameScanner.playableUrl(url);
        boolean needsPackageCopy = packagePath != null
                && libraryUri != null && libraryUri.startsWith("content://")
                && (playable == null || !playable.startsWith("file://"));
        if (needsPackageCopy) {
            loadPackageInBackground(Uri.parse(libraryUri), packagePath);
            return;
        }

        String playUrl = preparePlayUrl(url);
        if (playUrl == null) {
            showLoadErrorAndFinish();
            return;
        }
        webView.loadUrl(playUrl);
    }

    private void loadPackageInBackground(Uri treeUri, String packagePath) {
        packageExecutor.execute(() -> {
            File entry = copyPackageToCache(treeUri, packagePath);
            if (Thread.currentThread().isInterrupted()) {
                return;
            }
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed() || webView == null) {
                    return;
                }
                if (entry == null) {
                    showLoadErrorAndFinish();
                    return;
                }
                webView.loadUrl(Uri.fromFile(entry).toString());
            });
        });
    }

    private void showLoadErrorAndFinish() {
        Toast.makeText(this, "无法打开该游戏文件或资源包", Toast.LENGTH_LONG).show();
        finish();
    }

    /** 解压 zip 到缓存目录后加载包内入口 HTML。 */
    private void loadArchiveInBackground(String url, String entryName) {
        packageExecutor.execute(() -> {
            File entry = extractArchiveToCache(url, entryName);
            if (Thread.currentThread().isInterrupted()) {
                return;
            }
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed() || webView == null) {
                    return;
                }
                if (entry == null) {
                    showLoadErrorAndFinish();
                    return;
                }
                webView.loadUrl(Uri.fromFile(entry).toString());
            });
        });
    }

    private File extractArchiveToCache(String url, String entryName) {
        try {
            File cacheRoot = new File(getCacheDir(), "html-game-archives");
            if (!cacheRoot.exists() && !cacheRoot.mkdirs()) {
                return null;
            }
            File targetDir = new File(cacheRoot, "zip-" + Integer.toHexString(url.hashCode()));
            deleteTree(targetDir);
            if (!targetDir.mkdirs()) {
                return null;
            }

            boolean ok;
            File zipFile = HtmlGameScanner.resolveToFile(url);
            if (zipFile != null && zipFile.isFile()) {
                ok = ZipGames.extract(zipFile, targetDir);
            } else {
                // content:// 或无法解析为本地路径:改用内容解析器流式解压。
                InputStream in = null;
                try {
                    in = getContentResolver().openInputStream(Uri.parse(url));
                    ok = ZipGames.extract(in, targetDir);
                } finally {
                    if (in != null) {
                        try {
                            in.close();
                        } catch (Throwable ignored) {
                        }
                    }
                }
            }
            if (!ok) {
                deleteTree(targetDir);
                return null;
            }

            File entry = new File(targetDir, entryName);
            return isInside(targetDir, entry) && entry.isFile() ? entry : null;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private String preparePlayUrl(String url) {
        if (url.startsWith("http://") || url.startsWith("https://")) {
            return url;
        }

        String playable = HtmlGameScanner.playableUrl(url);
        if (playable != null && playable.startsWith("file://")) {
            return playable;
        }

        if (url.startsWith("content://")) {
            File cached = copyContentToCache(Uri.parse(url));
            if (cached != null) {
                return Uri.fromFile(cached).toString();
            }
            return url;
        }
        return playable;
    }

    private File copyPackageToCache(Uri treeUri, String packagePath) {
        try {
            DocumentFile root = DocumentFile.fromTreeUri(this, treeUri);
            DocumentFile sourceDir = findPackageDirectory(root, packagePath);
            if (sourceDir == null || !sourceDir.isDirectory()) {
                return null;
            }

            DocumentFile index = findIndex(sourceDir);
            if (index == null) {
                return null;
            }

            File cacheRoot = new File(getCacheDir(), "html-game-packages");
            if (!cacheRoot.exists() && !cacheRoot.mkdirs()) {
                return null;
            }
            String cacheKey = treeUri.toString() + "\n" + packagePath;
            File targetDir = new File(cacheRoot, "game-" + Integer.toHexString(cacheKey.hashCode()));
            deleteTree(targetDir);
            if (!targetDir.mkdirs()) {
                return null;
            }

            CopyState state = new CopyState();
            if (!copyDocumentTree(sourceDir, targetDir, 0, state)) {
                deleteTree(targetDir);
                return null;
            }
            File entry = new File(targetDir, safeName(index.getName(), "index.html"));
            return entry.isFile() ? entry : null;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private DocumentFile findPackageDirectory(DocumentFile root, String packagePath) {
        if (root == null || !root.isDirectory()) {
            return null;
        }
        DocumentFile current = root;
        if (packagePath.isEmpty()) {
            return current;
        }
        String[] parts = packagePath.replace('\\', '/').split("/");
        for (String part : parts) {
            if (part.isEmpty() || ".".equals(part) || "..".equals(part)) {
                return null;
            }
            DocumentFile next = null;
            try {
                for (DocumentFile child : current.listFiles()) {
                    if (child.isDirectory() && part.equals(child.getName())) {
                        next = child;
                        break;
                    }
                }
            } catch (Throwable ignored) {
                return null;
            }
            if (next == null) {
                return null;
            }
            current = next;
        }
        return current;
    }

    private DocumentFile findIndex(DocumentFile directory) {
        try {
            for (DocumentFile child : directory.listFiles()) {
                if (child.isFile() && "index.html".equalsIgnoreCase(child.getName())) {
                    return child;
                }
            }
        } catch (Throwable ignored) {
        }
        return null;
    }

    private boolean copyDocumentTree(DocumentFile source, File target, int depth, CopyState state) {
        if (depth > MAX_PACKAGE_DEPTH) {
            return false;
        }
        DocumentFile[] children;
        try {
            children = source.listFiles();
        } catch (Throwable ignored) {
            return false;
        }
        for (DocumentFile child : children) {
            String childName = safeName(child.getName(), null);
            if (childName == null) {
                return false;
            }
            File output = new File(target, childName);
            try {
                if (!isInside(target, output)) {
                    return false;
                }
                if (child.isDirectory()) {
                    if (!output.exists() && !output.mkdirs()) {
                        return false;
                    }
                    if (!copyDocumentTree(child, output, depth + 1, state)) {
                        return false;
                    }
                } else if (child.isFile()) {
                    state.files++;
                    if (state.files > MAX_PACKAGE_FILES || !copyDocumentFile(child, output, state)) {
                        return false;
                    }
                }
            } catch (Throwable ignored) {
                return false;
            }
        }
        return true;
    }

    private boolean copyDocumentFile(DocumentFile source, File target, CopyState state) {
        try (InputStream in = getContentResolver().openInputStream(source.getUri());
             OutputStream out = new FileOutputStream(target)) {
            if (in == null) {
                return false;
            }
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                state.bytes += read;
                if (state.bytes > MAX_PACKAGE_BYTES) {
                    return false;
                }
                out.write(buffer, 0, read);
            }
            out.flush();
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isInside(File parent, File child) throws IOException {
        String parentPath = parent.getCanonicalPath() + File.separator;
        return child.getCanonicalPath().startsWith(parentPath);
    }

    private String safeName(String name, String fallback) {
        if (name == null || name.trim().isEmpty()) {
            return fallback;
        }
        if (".".equals(name) || "..".equals(name)
                || name.indexOf('/') >= 0 || name.indexOf('\\') >= 0) {
            return fallback;
        }
        return name;
    }

    private void deleteTree(File file) {
        if (file == null || !file.exists()) {
            return;
        }
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteTree(child);
                }
            }
        }
        file.delete();
    }

    private File copyContentToCache(Uri uri) {
        InputStream in = null;
        OutputStream out = null;
        try {
            File dir = new File(getCacheDir(), "html-games");
            if (!dir.exists() && !dir.mkdirs()) {
                return null;
            }
            String name = uri.getLastPathSegment();
            if (name == null || name.trim().isEmpty()) {
                name = "game.html";
            }
            name = name.replace('/', '_').replace(':', '_');
            if (!name.toLowerCase().endsWith(".html") && !name.toLowerCase().endsWith(".htm")) {
                name = name + ".html";
            }
            File outFile = new File(dir, name);
            in = getContentResolver().openInputStream(uri);
            if (in == null) {
                return null;
            }
            out = new FileOutputStream(outFile);
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            out.flush();
            return outFile;
        } catch (Exception ignored) {
            return null;
        } finally {
            try {
                if (in != null) {
                    in.close();
                }
            } catch (Exception ignored) {
            }
            try {
                if (out != null) {
                    out.close();
                }
            } catch (Exception ignored) {
            }
        }
    }

    private static final class CopyState {
        int files;
        long bytes;
    }

    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemBars();
        }
    }

    @Override
    public void onBackPressed() {
        finish();
    }

    @Override
    protected void onDestroy() {
        packageExecutor.shutdownNow();
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
