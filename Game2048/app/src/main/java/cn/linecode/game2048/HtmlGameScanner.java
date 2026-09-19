package cn.linecode.game2048;

import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;

import androidx.documentfile.provider.DocumentFile;

import java.io.File;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * 扫描指定目录下的 .html / .htm 游戏文件。
 *
 * 设计要点:
 * - 所有文件与 ContentResolver 操作都包在 try/catch 内,任何单个条目失败都不得导致整体崩溃。
 * - 使用显式栈代替递归,避免深层目录导致栈溢出。
 * - 设有最大深度与最大条目上限,防止选中全盘目录时耗尽内存。
 */
public final class HtmlGameScanner {
    private static final int MAX_DEPTH = 4;
    private static final int MAX_ENTRIES = 3000;

    private HtmlGameScanner() {}

    public static List<GameEntry> scan(Context context, String folderUri) {
        List<GameEntry> games = new ArrayList<>();
        if (folderUri == null || folderUri.trim().isEmpty()) {
            return games;
        }

        try {
            File dir = resolveToFile(folderUri);
            if (dir != null && dir.isDirectory() && dir.canRead()) {
                scanFileTree(dir, games);
            } else if (folderUri.startsWith("content://")) {
                DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(folderUri));
                if (root != null && root.isDirectory()) {
                    String rootName = root.getName() == null ? "游戏目录" : root.getName();
                    scanDocumentTree(root, rootName, games);
                }
            }
        } catch (Throwable ignored) {
            // 扫描中的任何异常都不应让应用崩溃,返回已收集到的部分结果
        }

        try {
            Collections.sort(games, new Comparator<GameEntry>() {
                @Override
                public int compare(GameEntry a, GameEntry b) {
                    return a.title.compareToIgnoreCase(b.title);
                }
            });
        } catch (Throwable ignored) {
        }
        return games;
    }

    public static String treeDisplayName(Context context, String folderUri) {
        if (folderUri == null || folderUri.isEmpty()) {
            return "未选择目录";
        }
        try {
            File dir = resolveToFile(folderUri);
            if (dir != null) {
                return dir.getAbsolutePath();
            }
        } catch (Throwable ignored) {
        }
        try {
            Uri uri = Uri.parse(folderUri);
            String docId = DocumentsContract.getTreeDocumentId(uri);
            if (docId != null && !docId.isEmpty()) {
                return docId;
            }
            DocumentFile root = DocumentFile.fromTreeUri(context, uri);
            if (root != null && root.getName() != null) {
                return root.getName();
            }
        } catch (Throwable ignored) {
        }
        return folderUri;
    }

    public static String playableUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.isEmpty()) {
            return rawUrl;
        }
        if (rawUrl.startsWith("file://") || rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
            return rawUrl;
        }
        try {
            File file = resolveToFile(rawUrl);
            if (file != null && file.isFile()) {
                return Uri.fromFile(file).toString();
            }
        } catch (Throwable ignored) {
        }
        return rawUrl;
    }

    /**
     * 是否需要引导用户授予“所有文件访问权限”。
     * Android 11+ 下直接以 File 方式访问外部存储需要该权限;Android 10 及以下不需要。
     */
    public static boolean needsAllFilesAccess(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return false;
        }
        try {
            return !Environment.isExternalStorageManager();
        } catch (Throwable t) {
            return true;
        }
    }

    static File resolveToFile(String uriOrPath) {
        if (uriOrPath == null || uriOrPath.isEmpty()) {
            return null;
        }
        if (uriOrPath.startsWith("/")) {
            return new File(uriOrPath);
        }
        if (uriOrPath.startsWith("file://")) {
            return new File(Uri.parse(uriOrPath).getPath());
        }
        if (!uriOrPath.startsWith("content://")) {
            return null;
        }

        try {
            Uri uri = Uri.parse(uriOrPath);
            String docId = null;
            try {
                docId = DocumentsContract.getTreeDocumentId(uri);
            } catch (Throwable ignored) {
            }
            if (docId == null) {
                try {
                    docId = DocumentsContract.getDocumentId(uri);
                } catch (Throwable ignored) {
                }
            }
            File file = fileFromDocumentId(docId);
            if (file != null) {
                return file;
            }
        } catch (Throwable ignored) {
        }
        return null;
    }

    private static File fileFromDocumentId(String docId) {
        if (docId == null || !docId.contains(":")) {
            return null;
        }
        String[] parts = docId.split(":", 2);
        String type = parts[0];
        String rel = parts.length > 1 ? parts[1] : "";
        File root;
        if ("primary".equalsIgnoreCase(type)) {
            root = Environment.getExternalStorageDirectory();
        } else {
            root = new File("/storage/" + type);
        }
        if (rel == null || rel.isEmpty()) {
            return root;
        }
        return new File(root, rel);
    }

    /** 迭代式扫描,避免递归栈溢出;并对每个条目单独容错。 */
    private static void scanFileTree(File root, List<GameEntry> games) {
        ArrayDeque<Object[]> stack = new ArrayDeque<>();
        stack.push(new Object[]{root, 0});

        while (!stack.isEmpty() && games.size() < MAX_ENTRIES) {
            Object[] item = stack.pop();
            File current = (File) item[0];
            int depth = (Integer) item[1];

            File[] children;
            try {
                if (!current.isDirectory() || !current.canRead()) {
                    continue;
                }
                children = current.listFiles();
            } catch (Throwable t) {
                continue;
            }
            if (children == null) {
                continue;
            }

            for (File child : children) {
                if (games.size() >= MAX_ENTRIES) {
                    return;
                }
                try {
                    String name = child.getName();
                    if (child.isDirectory()) {
                        if (name.startsWith(".")) {
                            continue;
                        }
                        if (depth < MAX_DEPTH) {
                            stack.push(new Object[]{child, depth + 1});
                        }
                    } else if (isHtml(name)) {
                        games.add(new GameEntry(
                                displayName(name),
                                relativePath(root, child),
                                Uri.fromFile(child).toString()
                        ));
                    }
                } catch (Throwable ignored) {
                    // 单个条目失败不影响整体
                }
            }
        }
    }

    private static void scanDocumentTree(DocumentFile root, String rootName, List<GameEntry> games) {
        ArrayDeque<Object[]> stack = new ArrayDeque<>();
        stack.push(new Object[]{root, 0});

        while (!stack.isEmpty() && games.size() < MAX_ENTRIES) {
            Object[] item = stack.pop();
            DocumentFile current = (DocumentFile) item[0];
            int depth = (Integer) item[1];

            DocumentFile[] children;
            try {
                if (current == null || !current.isDirectory()) {
                    continue;
                }
                children = current.listFiles();
            } catch (Throwable t) {
                continue;
            }
            if (children == null) {
                continue;
            }

            for (DocumentFile child : children) {
                if (games.size() >= MAX_ENTRIES) {
                    return;
                }
                try {
                    String name = child.getName();
                    if (name != null && name.startsWith(".")) {
                        continue;
                    }
                    if (child.isDirectory()) {
                        if (depth < MAX_DEPTH) {
                            stack.push(new Object[]{child, depth + 1});
                        }
                    } else if (isHtml(name)) {
                        String url = child.getUri().toString();
                        File file = resolveToFile(url);
                        if (file != null && file.isFile()) {
                            url = Uri.fromFile(file).toString();
                        }
                        games.add(new GameEntry(
                                displayName(name),
                                rootName + " / " + name,
                                url
                        ));
                    }
                } catch (Throwable ignored) {
                }
            }
        }
    }

    private static boolean isHtml(String name) {
        if (name == null) {
            return false;
        }
        String lower = name.toLowerCase(Locale.US);
        return lower.endsWith(".html") || lower.endsWith(".htm");
    }

    private static String displayName(String fileName) {
        if (fileName == null) {
            return "未命名游戏";
        }
        int dot = fileName.lastIndexOf('.');
        return dot > 0 ? fileName.substring(0, dot) : fileName;
    }

    private static String relativePath(File root, File file) {
        try {
            String rootPath = root.getAbsolutePath();
            String filePath = file.getAbsolutePath();
            if (filePath.startsWith(rootPath)) {
                String rel = filePath.substring(rootPath.length());
                if (rel.startsWith(File.separator)) {
                    rel = rel.substring(1);
                }
                return rel.replace(File.separatorChar, '/');
            }
        } catch (Throwable ignored) {
        }
        return file.getName();
    }
}
