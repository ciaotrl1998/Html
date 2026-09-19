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

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public class GamePlayerActivity extends AppCompatActivity {
    public static final String EXTRA_GAME_URL = "game_url";
    public static final String EXTRA_GAME_TITLE = "game_title";

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemBars();

        String url = getIntent().getStringExtra(EXTRA_GAME_URL);
        String title = getIntent().getStringExtra(EXTRA_GAME_TITLE);
        if (title != null) {
            setTitle(title);
        }
        if (url == null || url.trim().isEmpty()) {
            finish();
            return;
        }

        String playUrl = preparePlayUrl(url);
        if (playUrl == null) {
            Toast.makeText(this, "无法打开该游戏文件", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        webView = new WebView(this);
        webView.setBackgroundColor(0xFFFAF8EF);
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
        webView.loadUrl(playUrl);
    }

    private String preparePlayUrl(String url) {
        if (url.startsWith("http://")
                || url.startsWith("https://")) {
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
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
