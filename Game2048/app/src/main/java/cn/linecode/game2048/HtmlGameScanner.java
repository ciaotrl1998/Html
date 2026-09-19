package cn.linecode.game2048;

import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.provider.DocumentsContract;

import androidx.documentfile.provider.DocumentFile;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

public final class HtmlGameScanner {
    private HtmlGameScanner() {}

    public static List<GameEntry> scan(Context context, String folderUri) {
        List<GameEntry> games = new ArrayList<>();
        if (folderUri == null || folderUri.trim().isEmpty()) {
            return games;
        }

        File dir = resolveToFile(folderUri);
        if (dir != null && dir.isDirectory()) {
            scanFileTree(dir, dir, games, 0);
        } else if (folderUri.startsWith("content://")) {
            DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(folderUri));
            if (root != null && root.isDirectory()) {
                String rootName = root.getName() == null ? "游戏目录" : root.getName();
                scanDocumentTree(root, rootName, games, 0);
            }
        }

        Collections.sort(games, new Comparator<GameEntry>() {
            @Override
            public int compare(GameEntry a, GameEntry b) {
                return a.title.compareToIgnoreCase(b.title);
            }
        });
        return games;
    }

    public static String treeDisplayName(Context context, String folderUri) {
        if (folderUri == null || folderUri.isEmpty()) {
            return "未选择目录";
        }
        File dir = resolveToFile(folderUri);
        if (dir != null) {
            return dir.getAbsolutePath();
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
        } catch (Exception ignored) {
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
        File file = resolveToFile(rawUrl);
        if (file != null && file.isFile()) {
            return Uri.fromFile(file).toString();
        }
        return rawUrl;
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
            } catch (Exception ignored) {
            }
            if (docId == null) {
                try {
                    docId = DocumentsContract.getDocumentId(uri);
                } catch (Exception ignored) {
                }
            }
            File file = fileFromDocumentId(docId);
            if (file != null) {
                return file;
            }
        } catch (Exception ignored) {
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

    private static void scanFileTree(File root, File current, List<GameEntry> games, int depth) {
        if (current == null || !current.isDirectory() || depth > 3) {
            return;
        }
        File[] children = current.listFiles();
        if (children == null) {
            return;
        }
        for (File child : children) {
            if (child.isDirectory()) {
                if (child.getName().startsWith(".")) {
                    continue;
                }
                scanFileTree(root, child, games, depth + 1);
            } else if (isHtml(child.getName())) {
                games.add(new GameEntry(
                        displayName(child.getName()),
                        relativePath(root, child),
                        Uri.fromFile(child).toString(),
                        false
                ));
            }
        }
    }

    private static void scanDocumentTree(DocumentFile current, String rootName, List<GameEntry> games, int depth) {
        if (current == null || !current.isDirectory() || depth > 3) {
            return;
        }
        DocumentFile[] children = current.listFiles();
        if (children == null) {
            return;
        }
        for (DocumentFile child : children) {
            String name = child.getName();
            if (name != null && name.startsWith(".")) {
                continue;
            }
            if (child.isDirectory()) {
                scanDocumentTree(child, rootName, games, depth + 1);
            } else if (isHtml(name)) {
                String url = child.getUri().toString();
                File file = resolveToFile(url);
                if (file != null && file.isFile()) {
                    url = Uri.fromFile(file).toString();
                }
                games.add(new GameEntry(
                        displayName(name),
                        rootName + " / " + name,
                        url,
                        false
                ));
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
        String rootPath = root.getAbsolutePath();
        String filePath = file.getAbsolutePath();
        if (filePath.startsWith(rootPath)) {
            String rel = filePath.substring(rootPath.length());
            if (rel.startsWith(File.separator)) {
                rel = rel.substring(1);
            }
            return rel.replace(File.separatorChar, '/');
        }
        return file.getName();
    }
}
