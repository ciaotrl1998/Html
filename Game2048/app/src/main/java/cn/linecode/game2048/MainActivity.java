package cn.linecode.game2048;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.AdapterView;
import android.widget.Button;
import android.widget.ListView;
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

    private Button folderButton;
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
        folderButton = findViewById(R.id.btnPick);
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
                if (game.packagePath != null) {
                    intent.putExtra(GamePlayerActivity.EXTRA_LIBRARY_URI,
                            prefs.getString(KEY_FOLDER_URI, null));
                    intent.putExtra(GamePlayerActivity.EXTRA_PACKAGE_PATH, game.packagePath);
                }
                if ((url != null && url.startsWith("content://"))
                        || game.packagePath != null) {
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                }
                startActivity(intent);
            }
        });

        folderButton.setOnClickListener(v -> pickFolder());
        findViewById(R.id.btnRefresh).setOnClickListener(v -> reloadGames());

        CrashLog.clear(this);
    }

    @Override
    protected void onResume() {
        super.onResume();
        reloadGames();
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
            folderButton.setText(R.string.pick_folder);
            adapter.notifyDataSetChanged();
            return;
        }

        String folderName = HtmlGameScanner.treeDisplayName(this, savedUri);
        folderButton.setText(folderName == null || folderName.trim().isEmpty()
                ? getString(R.string.pick_folder) : folderName);
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
                            if (generation != scanGeneration || isFinishing() || isDestroyed()) {
                                return;
                            }
                            Toast.makeText(MainActivity.this, R.string.scan_failed,
                                    Toast.LENGTH_SHORT).show();
                        }
                    });
                    return;
                }
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        // 已有更新的扫描发起,丢弃本次结果
                        if (generation != scanGeneration || isFinishing() || isDestroyed()) {
                            return;
                        }
                        games.addAll(scanned);
                        adapter.notifyDataSetChanged();
                        if (scanned.isEmpty()) {
                            String target = HtmlGameScanner.describeTarget(finalUri);
                            Toast.makeText(MainActivity.this,
                                    getString(R.string.no_html) + "\n" + target,
                                    Toast.LENGTH_LONG).show();
                        }
                    }
                });
            }
        });
    }
}
