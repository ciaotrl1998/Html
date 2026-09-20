package cn.linecode.game2048;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.widget.AdapterView;
import android.widget.Button;
import android.widget.GridView;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {
    private static final String PREFS = "html_game_box";
    private static final String KEY_FOLDER_URI = "folder_uri";

    // 未选择目录但已具备“所有文件访问权限”时,自动尝试扫描这些常见游戏目录,
    // 避免因系统目录选择器在某些 ROM 上不可用而导致列表始终为空。
    private static final String[] DEFAULT_SCAN_DIR_NAMES = {
            "模拟器游戏",
            "Games",
            "games",
            "Download",
    };

    private TextView folderButton;
    private GridView gameListView;
    private ScrollView diagnosticPanel;
    private TextView diagnosticText;
    private Button grantButton;
    private GameListAdapter adapter;
    private final List<GameEntry> games = new ArrayList<>();
    private SharedPreferences prefs;

    private final ExecutorService scanExecutor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // 每次重新扫描递增,用于丢弃过期的后台扫描结果,避免列表出现重复项
    private int scanGeneration = 0;

    // 仅在首次因缺少“所有文件访问权限”导致空结果时自动跳转授权页一次
    private boolean autoPermissionLaunched = false;

    // 改用应用内目录浏览器,不再调用系统 SAF 选择器。
    private final ActivityResultLauncher<Intent> folderPicker =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),
                    result -> onFolderPicked(result.getResultCode(), result.getData()));

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        folderButton = findViewById(R.id.btnPick);
        gameListView = findViewById(R.id.gameList);
        diagnosticPanel = findViewById(R.id.diagnosticPanel);
        diagnosticText = findViewById(R.id.diagnosticText);
        grantButton = findViewById(R.id.btnGrant);
        grantButton.setOnClickListener(v -> requestAllFilesAccess());

        adapter = new GameListAdapter(this, games);
        gameListView.setAdapter(adapter);
        gameListView.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                GameEntry game = adapter.getItem(position);
                if (game == null) {
                    return;
                }
                String url = HtmlGameScanner.playableUrl(game.url);
                Intent intent = new Intent(MainActivity.this, GamePlayerActivity.class);
                intent.putExtra(GamePlayerActivity.EXTRA_GAME_URL, url);
                intent.putExtra(GamePlayerActivity.EXTRA_GAME_TITLE, game.title);
                if (game.packagePath != null) {
                    intent.putExtra(GamePlayerActivity.EXTRA_LIBRARY_URI,
                            prefs.getString(KEY_FOLDER_URI, null));
                    intent.putExtra(GamePlayerActivity.EXTRA_PACKAGE_PATH, game.packagePath);
                }
                if (game.isArchive()) {
                    intent.putExtra(GamePlayerActivity.EXTRA_ARCHIVE_ENTRY, game.archiveEntry);
                }
                if ((url != null && url.startsWith("content://"))
                        || game.packagePath != null
                        || game.isArchive()) {
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                }
                startActivity(intent);
            }
        });

        folderButton.setOnClickListener(v -> pickFolder());
        findViewById(R.id.btnRefresh).setOnClickListener(v -> {
            Toast.makeText(this, "正在刷新...", Toast.LENGTH_SHORT).show();
            performScan();
        });

        CrashLog.clear(this);
        loadCachedOrScan();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 不再自动刷新目录:列表保持上次结果,仅“刷新”按钮或重新选择目录时才重新扫描。
        // 唯一例外:刚从系统设置授予“所有文件访问权限”返回且列表仍为空时,补扫一次。
        if (autoPermissionLaunched && games.isEmpty()
                && !HtmlGameScanner.needsAllFilesAccess(this)) {
            autoPermissionLaunched = false;
            performScan();
        }
    }

    @Override
    protected void onDestroy() {
        scanExecutor.shutdownNow();
        if (adapter != null) {
            adapter.shutdown();
        }
        super.onDestroy();
    }

    private void pickFolder() {
        Intent intent = new Intent(this, FolderPickerActivity.class);
        String saved = prefs.getString(KEY_FOLDER_URI, null);
        if (saved != null && !saved.trim().isEmpty()) {
            intent.putExtra(FolderPickerActivity.EXTRA_START_PATH, saved);
        }
        try {
            folderPicker.launch(intent);
        } catch (Exception e) {
            Toast.makeText(this, "无法打开目录选择界面", Toast.LENGTH_SHORT).show();
        }
    }

    private void onFolderPicked(int resultCode, Intent data) {
        if (resultCode != RESULT_OK || data == null) {
            return;
        }
        String path = data.getStringExtra(FolderPickerActivity.EXTRA_SELECTED_PATH);
        if (path == null || path.trim().isEmpty()) {
            showDiagnostics("目录选择返回了空地址,请重新选择。", false);
            return;
        }

        // 用 commit() 同步落盘,避免进程被系统回收时异步写入丢失,导致“选了却像没选”。
        boolean saved;
        try {
            saved = prefs.edit().putString(KEY_FOLDER_URI, path).commit();
        } catch (Throwable t) {
            saved = false;
        }
        String verify = prefs.getString(KEY_FOLDER_URI, null);
        if (!saved || verify == null || !path.equals(verify)) {
            showDiagnostics("目录地址保存失败:\n" + path
                    + "\n\n请重试;若持续失败,请在系统设置中为本应用开启存储权限。");
            return;
        }

        Toast.makeText(this, "已选择游戏目录", Toast.LENGTH_SHORT).show();
        performScan();
    }

    /** 启动时优先展示缓存,无缓存才扫描一次,避免每次启动/返回都自动刷新目录。 */
    private void loadCachedOrScan() {
        GameCache.Snapshot snapshot = GameCache.load(this);
        if (snapshot != null && snapshot.games != null && !snapshot.games.isEmpty()) {
            games.clear();
            games.addAll(snapshot.games);
            adapter.notifyDataSetChanged();
            String folderUri = snapshot.folderUri;
            if (folderUri == null || folderUri.trim().isEmpty()) {
                folderUri = prefs.getString(KEY_FOLDER_URI, null);
            }
            String base = HtmlGameScanner.treeDisplayName(this, folderUri);
            if (base == null || base.trim().isEmpty()) {
                base = getString(R.string.pick_folder);
            }
            folderButton.setText(base + " (" + games.size() + ")");
            hideDiagnostics();
            // 明确提示来自缓存,便于确认“退出后仍保留”已生效。
            Toast.makeText(this, "已加载缓存:" + games.size() + " 个游戏", Toast.LENGTH_SHORT).show();
            return;
        }
        performScan();
    }

    /** 重新扫描目录。扫描在后台线程执行,避免大目录阻塞主线程导致闪退/ANR。 */
    private void performScan() {
        String savedUri = prefs.getString(KEY_FOLDER_URI, null);
        final int generation = ++scanGeneration;

        games.clear();

        // 未选择目录时:若已具备“所有文件访问权限”,自动扫描常见游戏目录,
        // 避免系统目录选择器在部分设备上不可用时列表始终为空。
        if (savedUri == null || savedUri.trim().isEmpty()) {
            File auto = findDefaultScanDir();
            if (auto != null) {
                savedUri = auto.getAbsolutePath();
            }
        }

        if (savedUri == null || savedUri.trim().isEmpty()) {
            folderButton.setText(R.string.pick_folder);
            adapter.notifyDataSetChanged();
            showDiagnostics(buildNoFolderHint(), true);
            return;
        }

        final String finalUri = savedUri;
        String folderName = HtmlGameScanner.treeDisplayName(this, finalUri);
        folderButton.setText(folderName == null || folderName.trim().isEmpty()
                ? getString(R.string.pick_folder) : folderName);
        adapter.notifyDataSetChanged();
        scanExecutor.execute(new Runnable() {
            @Override
            public void run() {
                final HtmlGameScanner.ScanOutcome outcome;
                try {
                    outcome = HtmlGameScanner.scanWithDiagnostics(
                            getApplicationContext(), finalUri);
                } catch (Throwable t) {
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (generation != scanGeneration || isFinishing() || isDestroyed()) {
                                return;
                            }
                            showDiagnostics("扫描异常:" + t);
                        }
                    });
                    return;
                }
                // 后台线程写入缓存,避免主线程做文件 I/O;失败不影响使用。
                GameCache.save(getApplicationContext(), finalUri, outcome.games);
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        // 已有更新的扫描发起,丢弃本次结果
                        if (generation != scanGeneration || isFinishing() || isDestroyed()) {
                            return;
                        }
                        games.addAll(outcome.games);
                        adapter.notifyDataSetChanged();

                        String base = HtmlGameScanner.treeDisplayName(MainActivity.this, finalUri);
                        if (base == null || base.trim().isEmpty()) {
                            base = getString(R.string.pick_folder);
                        }
                        folderButton.setText(base + " (" + outcome.games.size() + ")");

                        if (outcome.games.isEmpty()) {
                            showDiagnostics(outcome.diagnostics, true);
                            // 首次因缺少“所有文件访问权限”而扫不到文件时,自动跳转授权页,
                            // 避免用户反复看到空列表却不知道要去哪里开启权限。
                            if (HtmlGameScanner.needsAllFilesAccess(MainActivity.this)
                                    && !autoPermissionLaunched) {
                                autoPermissionLaunched = true;
                                Toast.makeText(MainActivity.this,
                                        "需要授予“所有文件访问权限”才能读取 HTML 文件",
                                        Toast.LENGTH_LONG).show();
                                requestAllFilesAccess();
                            }
                        } else {
                            hideDiagnostics();
                        }
                    }
                });
            }
        });
    }

    private void showDiagnostics(String message) {
        showDiagnostics(message, false);
    }

    private void showDiagnostics(String message, boolean allowGrant) {
        if (diagnosticText == null || diagnosticPanel == null) {
            return;
        }
        diagnosticText.setText(message);
        diagnosticPanel.setVisibility(View.VISIBLE);
        if (grantButton != null) {
            boolean show = allowGrant && HtmlGameScanner.needsAllFilesAccess(this);
            grantButton.setVisibility(show ? View.VISIBLE : View.GONE);
        }
    }

    private void hideDiagnostics() {
        if (diagnosticPanel != null) {
            diagnosticPanel.setVisibility(View.GONE);
        }
    }

    /** 在常见位置中挑选第一个存在的目录,作为未手动选择时的默认扫描目标。 */
    private File findDefaultScanDir() {
        File base;
        try {
            base = Environment.getExternalStorageDirectory();
        } catch (Throwable t) {
            return null;
        }
        if (base == null) {
            return null;
        }
        for (String name : DEFAULT_SCAN_DIR_NAMES) {
            try {
                File dir = new File(base, name);
                if (dir.isDirectory() && dir.canRead()) {
                    return dir;
                }
            } catch (Throwable ignored) {
            }
        }
        return null;
    }

    private String buildNoFolderHint() {
        if (HtmlGameScanner.needsAllFilesAccess(this)) {
            return "尚未选择游戏目录。\n\n"
                    + "本应用尚未获得“所有文件访问权限”,直接读取存储中的 HTML 可能失败。\n"
                    + "可点击下方按钮授予权限,或点击左上角按钮用目录选择器授权具体文件夹。";
        }
        return "尚未选择游戏目录。请点击左上角按钮,选择一个存放 HTML 游戏的文件夹。";
    }

    /** 引导用户到系统设置授予“所有文件访问权限”(Android 11+)。 */
    private void requestAllFilesAccess() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            Toast.makeText(this, "当前系统无需该权限", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Throwable e) {
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
            } catch (Throwable e2) {
                Toast.makeText(this, "无法打开权限设置页面", Toast.LENGTH_SHORT).show();
            }
        }
    }
}
