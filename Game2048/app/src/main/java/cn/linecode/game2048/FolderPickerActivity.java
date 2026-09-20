package cn.linecode.game2048;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.View;
import android.widget.AdapterView;
import android.widget.Button;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * 应用内目录浏览器,替代系统 SAF 目录选择器。
 *
 * 依赖已声明的 “所有文件访问权限”(MANAGE_EXTERNAL_STORAGE),直接用 {@link File} 列目录,
 * 交互更可控、风格与应用一致。选中结果通过 {@link #EXTRA_SELECTED_PATH} 回传。
 */
public class FolderPickerActivity extends AppCompatActivity {
    public static final String EXTRA_START_PATH = "start_path";
    public static final String EXTRA_SELECTED_PATH = "selected_path";

    private Button upButton;
    private Button chooseButton;
    private Button grantButton;
    private TextView pathText;
    private TextView noticeText;
    private ListView listView;

    private FolderListAdapter adapter;
    private final List<File> entries = new ArrayList<>();
    private File currentDir;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_folder_picker);

        upButton = findViewById(R.id.pickerUp);
        chooseButton = findViewById(R.id.pickerChoose);
        grantButton = findViewById(R.id.pickerGrant);
        pathText = findViewById(R.id.pickerPath);
        noticeText = findViewById(R.id.pickerNotice);
        listView = findViewById(R.id.pickerList);

        adapter = new FolderListAdapter(this, entries);
        listView.setAdapter(adapter);
        listView.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                File item = adapter.getItem(position);
                if (item == null) {
                    return;
                }
                if (item.isDirectory()) {
                    loadDirectory(item);
                } else {
                    // 直接点选单个游戏文件(html / zip)时,直接返回该文件路径。
                    returnPath(item.getAbsolutePath());
                }
            }
        });

        upButton.setOnClickListener(v -> navigateUp());
        chooseButton.setOnClickListener(v -> {
            if (currentDir != null) {
                returnPath(currentDir.getAbsolutePath());
            }
        });
        grantButton.setOnClickListener(v -> requestAllFilesAccess());
        grantButton.setVisibility(
                HtmlGameScanner.needsAllFilesAccess(this) ? View.VISIBLE : View.GONE);

        loadDirectory(initialDirectory());
    }

    @Override
    public void onBackPressed() {
        if (!navigateUp()) {
            setResult(RESULT_CANCELED);
            super.onBackPressed();
        }
    }

    private File initialDirectory() {
        String start = getIntent().getStringExtra(EXTRA_START_PATH);
        if (start != null && !start.trim().isEmpty()) {
            File file = new File(start);
            if (file.isDirectory()) {
                return file;
            }
        }
        try {
            File base = Environment.getExternalStorageDirectory();
            if (base != null && base.isDirectory()) {
                return base;
            }
        } catch (Throwable ignored) {
        }
        return new File("/");
    }

    private void loadDirectory(File dir) {
        if (dir == null || !dir.isDirectory()) {
            return;
        }
        currentDir = dir;
        pathText.setText(dir.getAbsolutePath());
        upButton.setEnabled(dir.getParentFile() != null);

        entries.clear();
        File[] children = null;
        try {
            children = dir.listFiles();
        } catch (Throwable ignored) {
        }

        if (children == null) {
            adapter.notifyDataSetChanged();
            showNotice(readFailureNotice());
            updateGrantVisibility();
            return;
        }

        for (File child : children) {
            if (child == null) {
                continue;
            }
            String name = child.getName();
            if (name == null || name.startsWith(".")) {
                continue;
            }
            try {
                if (child.isDirectory()) {
                    entries.add(child);
                } else if (isSelectableFile(name)) {
                    entries.add(child);
                }
            } catch (Throwable ignored) {
            }
        }
        Collections.sort(entries, new Comparator<File>() {
            @Override
            public int compare(File a, File b) {
                boolean da = a.isDirectory();
                boolean db = b.isDirectory();
                if (da != db) {
                    return da ? -1 : 1;
                }
                return a.getName().compareToIgnoreCase(b.getName());
            }
        });
        adapter.notifyDataSetChanged();

        if (entries.isEmpty()) {
            showNotice(getString(R.string.picker_empty));
        } else {
            hideNotice();
        }
        updateGrantVisibility();
    }

    /** 返回是否成功上移一级。 */
    private boolean navigateUp() {
        if (currentDir == null) {
            return false;
        }
        File parent = currentDir.getParentFile();
        if (parent == null || !parent.isDirectory()) {
            return false;
        }
        loadDirectory(parent);
        return true;
    }

    private void returnPath(String path) {
        Intent data = new Intent();
        data.putExtra(EXTRA_SELECTED_PATH, path);
        setResult(RESULT_OK, data);
        finish();
    }

    private static boolean isSelectableFile(String name) {
        String lower = name.toLowerCase(Locale.US);
        return lower.endsWith(".html") || lower.endsWith(".htm") || lower.endsWith(".zip");
    }

    private void showNotice(String message) {
        noticeText.setText(message);
        noticeText.setVisibility(View.VISIBLE);
    }

    private void hideNotice() {
        noticeText.setVisibility(View.GONE);
    }

    private void updateGrantVisibility() {
        boolean need = HtmlGameScanner.needsAllFilesAccess(this);
        grantButton.setVisibility(need ? View.VISIBLE : View.GONE);
        if (need && entries.isEmpty()) {
            showNotice(getString(R.string.picker_need_permission));
        }
    }

    private String readFailureNotice() {
        if (HtmlGameScanner.needsAllFilesAccess(this)) {
            return getString(R.string.picker_need_permission);
        }
        return getString(R.string.picker_read_failed);
    }

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

    @Override
    protected void onResume() {
        super.onResume();
        // 从权限设置返回后刷新当前目录,让刚获得的权限立即生效。
        loadDirectory(currentDir == null ? initialDirectory() : currentDir);
    }
}
