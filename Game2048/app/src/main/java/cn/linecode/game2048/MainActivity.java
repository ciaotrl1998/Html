package cn.linecode.game2048;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.widget.AdapterView;
import android.widget.Button;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {
    private static final String PREFS = "html_game_box";
    private static final String KEY_FOLDER_URI = "folder_uri";

    private TextView folderPathView;
    private TextView emptyView;
    private TextView crashView;
    private Button grantButton;
    private ListView gameListView;
    private GameListAdapter adapter;
    private final List<GameEntry> games = new ArrayList<>();
    private SharedPreferences prefs;

    private final ExecutorService scanExecutor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // 每次重新扫描递增,用于丢弃过期的后台扫描结果,避免列表出现重复项
    private int scanGeneration = 0;

    private final ActivityResultLauncher<Uri> folderPicker =
            registerForActivityResult(new ActivityResultContracts.OpenDocumentTree(), this::onFolderPicked);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        folderPathView = findViewById(R.id.folderPath);
        emptyView = findViewById(R.id.emptyView);
        crashView = findViewById(R.id.crashView);
        grantButton = findViewById(R.id.btnGrant);
        gameListView = findViewById(R.id.gameList);

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
                if (url != null && url.startsWith("content://")) {
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                }
                startActivity(intent);
            }
        });

        findViewById(R.id.btnPick).setOnClickListener(v -> pickFolder());
        findViewById(R.id.btnRefresh).setOnClickListener(v -> reloadGames());
        grantButton.setOnClickListener(v -> openAllFilesAccessSettings());

        showLastCrashIfAny();
        updatePermissionUi();
        reloadGames();
    }

    @Override
    protected void onResume() {
        super.onResume();
        updatePermissionUi();
        reloadGames();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        scanExecutor.shutdownNow();
    }

    /** 展示上次崩溃的简短堆栈,便于定位闪退原因(读取后即清除)。 */
    private void showLastCrashIfAny() {
        String crash = CrashLog.read(this);
        if (crash == null || crash.isEmpty()) {
            crashView.setVisibility(View.GONE);
            return;
        }
        crashView.setText("上次崩溃日志:\n" + crash);
        crashView.setVisibility(View.VISIBLE);
        CrashLog.clear(this);
    }

    private void updatePermissionUi() {
        boolean need = HtmlGameScanner.needsAllFilesAccess(this);
        grantButton.setVisibility(need ? View.VISIBLE : View.GONE);
    }

    private void openAllFilesAccessSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Exception e) {
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
            } catch (Exception e2) {
                Toast.makeText(this, "无法打开权限设置,请手动到系统设置中授予", Toast.LENGTH_LONG).show();
            }
        }
    }

    private void pickFolder() {
        Uri initial = null;
        String saved = prefs.getString(KEY_FOLDER_URI, null);
        if (saved != null && saved.startsWith("content://")) {
            try {
                initial = Uri.parse(saved);
            } catch (Exception ignored) {
            }
        }
        try {
            folderPicker.launch(initial);
        } catch (Exception e) {
            Toast.makeText(this, "无法打开目录选择器", Toast.LENGTH_SHORT).show();
        }
    }

    private void onFolderPicked(Uri uri) {
        if (uri == null) {
            return;
        }
        try {
            getContentResolver().takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            );
        } catch (Throwable ignored) {
            try {
                getContentResolver().takePersistableUriPermission(
                        uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                );
            } catch (Throwable ignoredAgain) {
            }
        }
        prefs.edit().putString(KEY_FOLDER_URI, uri.toString()).apply();
        Toast.makeText(this, "已选择游戏目录", Toast.LENGTH_SHORT).show();
        reloadGames();
    }

    /** 重新扫描目录。扫描在后台线程执行,避免大目录阻塞主线程导致闪退/ANR。 */
    private void reloadGames() {
        final String savedUri = prefs.getString(KEY_FOLDER_URI, null);
        final int generation = ++scanGeneration;

        games.clear();

        if (savedUri == null || savedUri.isEmpty()) {
            folderPathView.setText("未选择目录,点右上角选择");
            emptyView.setText(R.string.empty_hint);
            emptyView.setVisibility(View.VISIBLE);
            adapter.notifyDataSetChanged();
            return;
        }

        folderPathView.setText(HtmlGameScanner.treeDisplayName(this, savedUri));
        emptyView.setText(R.string.scanning);
        emptyView.setVisibility(View.VISIBLE);
        adapter.notifyDataSetChanged();

        final String finalUri = savedUri;
        scanExecutor.execute(new Runnable() {
            @Override
            public void run() {
                final List<GameEntry> scanned;
                try {
                    scanned = HtmlGameScanner.scan(getApplicationContext(), finalUri);
                } catch (Throwable t) {
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (generation != scanGeneration) {
                                return;
                            }
                            emptyView.setText(R.string.scan_failed);
                            emptyView.setVisibility(View.VISIBLE);
                        }
                    });
                    return;
                }
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        // 已有更新的扫描发起,丢弃本次结果
                        if (generation != scanGeneration) {
                            return;
                        }
                        games.addAll(scanned);
                        adapter.notifyDataSetChanged();
                        if (scanned.isEmpty()) {
                            emptyView.setText(R.string.no_html);
                            emptyView.setVisibility(View.VISIBLE);
                        } else {
                            emptyView.setVisibility(View.GONE);
                        }
                    }
                });
            }
        });
    }
}
