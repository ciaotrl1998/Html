package cn.linecode.game2048;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {
    private static final String PREFS = "html_game_box";
    private static final String KEY_FOLDER_URI = "folder_uri";
    private static final String BUILTIN_URL = "file:///android_asset/index.html";

    private TextView folderPathView;
    private TextView emptyView;
    private ListView gameListView;
    private GameListAdapter adapter;
    private final List<GameEntry> games = new ArrayList<>();
    private SharedPreferences prefs;

    private final ActivityResultLauncher<Uri> folderPicker =
            registerForActivityResult(new ActivityResultContracts.OpenDocumentTree(), this::onFolderPicked);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        folderPathView = findViewById(R.id.folderPath);
        emptyView = findViewById(R.id.emptyView);
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

        reloadGames();
    }

    @Override
    protected void onResume() {
        super.onResume();
        reloadGames();
    }

    private void pickFolder() {
        Uri initial = null;
        String saved = prefs.getString(KEY_FOLDER_URI, null);
        if (saved != null && saved.startsWith("content://")) {
            initial = Uri.parse(saved);
        }
        folderPicker.launch(initial);
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
        } catch (SecurityException ignored) {
            try {
                getContentResolver().takePersistableUriPermission(
                        uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                );
            } catch (SecurityException ignoredAgain) {
            }
        }
        prefs.edit().putString(KEY_FOLDER_URI, uri.toString()).apply();
        Toast.makeText(this, "已选择游戏目录", Toast.LENGTH_SHORT).show();
        reloadGames();
    }

    private void reloadGames() {
        games.clear();
        games.add(new GameEntry("2048(内置)", getString(R.string.builtin), BUILTIN_URL, true));

        String savedUri = prefs.getString(KEY_FOLDER_URI, null);
        if (savedUri == null || savedUri.isEmpty()) {
            folderPathView.setText(defaultFolderHint());
            emptyView.setText(R.string.empty_hint);
            emptyView.setVisibility(View.VISIBLE);
        } else {
            folderPathView.setText(HtmlGameScanner.treeDisplayName(this, savedUri));
            List<GameEntry> scanned = HtmlGameScanner.scan(this, savedUri);
            games.addAll(scanned);
            if (scanned.isEmpty()) {
                emptyView.setText(R.string.no_html);
                emptyView.setVisibility(View.VISIBLE);
            } else {
                emptyView.setVisibility(View.GONE);
            }
        }

        adapter.notifyDataSetChanged();
    }

    private String defaultFolderHint() {
        return "未选择目录,点右上角选择";
    }
}
