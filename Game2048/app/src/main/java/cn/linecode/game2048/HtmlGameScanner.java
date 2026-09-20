package cn.linecode.game2048;

import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;

import androidx.documentfile.provider.DocumentFile;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
    private static final int MAX_ICON_HTML_BYTES = 64 * 1024;
    private static final String[] SINGLE_ICON_EXTENSIONS = {
            ".png", ".jpg", ".jpeg", ".webp", ".ico"
    };
    private static final Pattern LINK_TAG_PATTERN = Pattern.compile(
            "<link\\b[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern REL_ATTRIBUTE_PATTERN = Pattern.compile(
            "(?:^|\\s)rel\\s*=\\s*(?:(['\"])(.*?)\\1|([^\\s>]+))", Pattern.CASE_INSENSITIVE);
    private static final Pattern HREF_ATTRIBUTE_PATTERN = Pattern.compile(
            "(?:^|\\s)href\\s*=\\s*(?:(['\"])(.*?)\\1|([^\\s>]+))", Pattern.CASE_INSENSITIVE);

    private HtmlGameScanner() {}

    public static List<GameEntry> scan(Context context, String folderUri) {
        return scanWithDiagnostics(context, folderUri).games;
    }

    /** 扫描结果 + 诊断信息,便于在界面直接显示扫描过程,定位“扫不到游戏”的原因。 */
    public static final class ScanOutcome {
        public final List<GameEntry> games;
        public final String diagnostics;

        ScanOutcome(List<GameEntry> games, String diagnostics) {
            this.games = games;
            this.diagnostics = diagnostics;
        }
    }

    public static ScanOutcome scanWithDiagnostics(Context context, String folderUri) {
        List<GameEntry> games = new ArrayList<>();
        StringBuilder log = new StringBuilder();

        if (folderUri == null || folderUri.trim().isEmpty()) {
            log.append("目录地址为空:尚未选择或保存失败\n");
            return new ScanOutcome(games, log.toString());
        }

        log.append("URI: ").append(folderUri).append('\n');
        boolean contentUri = folderUri.startsWith("content://");
        boolean hasAllFilesAccess = !needsAllFilesAccess(context);
        log.append("全部文件访问权限=").append(hasAllFilesAccess).append('\n');

        // 1) 文件系统路径诊断
        File dir = null;
        try {
            dir = resolveToFile(folderUri);
        } catch (Throwable t) {
            log.append("解析路径异常: ").append(t).append('\n');
        }
        if (dir != null) {
            log.append("路径: ").append(dir.getAbsolutePath()).append('\n');
            log.append("exists=").append(dir.exists())
                    .append(" isDir=").append(dir.isDirectory())
                    .append(" canRead=").append(dir.canRead()).append('\n');
            try {
                File[] fs = dir.listFiles();
                log.append("listFiles=").append(fs == null ? "null" : String.valueOf(fs.length)).append('\n');
            } catch (Throwable t) {
                log.append("listFiles 异常: ").append(t).append('\n');
            }
        } else {
            log.append("路径: 无法解析为本地文件路径\n");
        }

        // 2) 文件系统扫描
        try {
            if (dir != null && dir.isFile()) {
                // 用户直接选中了单个 HTML 或 zip 文件(而非文件夹),也应当能加入列表。
                if (isHtml(dir.getName())) {
                    games.add(new GameEntry(
                            displayName(dir.getName()),
                            dir.getName(),
                            Uri.fromFile(dir).toString(),
                            null,
                            safeFindFileIcon(dir, dir.getParentFile())
                    ));
                } else if (ZipGames.isZip(dir.getName())) {
                    String zipEntry = ZipGames.findEntry(dir);
                    if (zipEntry != null) {
                        games.add(new GameEntry(
                                displayName(dir.getName()),
                                dir.getName() + " / " + zipEntry,
                                Uri.fromFile(dir).toString(),
                                null,
                                null,
                                zipEntry
                        ));
                    }
                }
            } else if (dir != null && dir.isDirectory() && dir.canRead()) {
                scanFileTree(context, dir, games);
            }
        } catch (Throwable t) {
            log.append("文件扫描异常: ").append(t).append('\n');
        }
        log.append("文件扫描结果: ").append(games.size()).append('\n');

        // 3) SAF 兜底扫描
        if (games.isEmpty() && contentUri) {
            try {
                DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(folderUri));
                if (root == null) {
                    root = DocumentFile.fromSingleUri(context, Uri.parse(folderUri));
                }
                log.append("SAF root=").append(root == null ? "null" : root.getName())
                        .append(" isDir=").append(root != null && root.isDirectory()).append('\n');
                if (root != null && root.isFile()) {
                    // 选中的是单个 HTML 或 zip 文件。
                    String docName = root.getName();
                    if (docName != null && isHtml(docName)) {
                        games.add(new GameEntry(
                                displayName(docName),
                                docName,
                                playableDocumentUrl(root),
                                null,
                                safeFindDocumentIcon(context, root, root.getParentFile())
                        ));
                    } else if (docName != null && ZipGames.isZip(docName)) {
                        String zipEntry = findDocumentZipEntry(context, root);
                        if (zipEntry != null) {
                            games.add(new GameEntry(
                                    displayName(docName),
                                    docName + " / " + zipEntry,
                                    playableDocumentUrl(root),
                                    null,
                                    null,
                                    zipEntry
                            ));
                        }
                    }
                } else if (root != null && root.isDirectory()) {
                    try {
                        DocumentFile[] kids = root.listFiles();
                        log.append("SAF listFiles=")
                                .append(kids == null ? "null" : String.valueOf(kids.length)).append('\n');
                    } catch (Throwable t) {
                        log.append("SAF listFiles 异常: ").append(t).append('\n');
                    }
                    String rootName = root.getName() == null ? "游戏目录" : root.getName();
                    scanDocumentTree(context, root, rootName, games);
                }
            } catch (Throwable t) {
                log.append("SAF 异常: ").append(t).append('\n');
            }
            log.append("SAF 扫描结果: ").append(games.size()).append('\n');
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

        if (games.isEmpty() && !hasAllFilesAccess && dir != null && dir.isDirectory()) {
            log.append("\n未找到游戏,且本应用缺少“所有文件访问权限”。\n");
            log.append("系统可能只列出了子文件夹而隐藏了 .html 文件(常见现象:listFiles 数量少于实际)。\n");
            log.append("请点击下方按钮授予全部文件访问权限后重试。\n");
        }

        log.append("最终数量: ").append(games.size()).append('\n');
        return new ScanOutcome(games, log.toString());
    }

    public static String treeDisplayName(Context context, String folderUri) {
        if (folderUri == null || folderUri.isEmpty()) {
            return "未选择目录";
        }
        try {
            Uri uri = Uri.parse(folderUri);
            if (folderUri.startsWith("content://")) {
                DocumentFile root = DocumentFile.fromTreeUri(context, uri);
                if (root != null && root.getName() != null
                        && !root.getName().trim().isEmpty()) {
                    return root.getName();
                }
            }
        } catch (Throwable ignored) {
        }
        try {
            File dir = resolveToFile(folderUri);
            if (dir != null && dir.getName() != null && !dir.getName().isEmpty()) {
                return dir.getName();
            }
        } catch (Throwable ignored) {
        }
        try {
            String docId = DocumentsContract.getTreeDocumentId(Uri.parse(folderUri));
            if (docId != null && !docId.isEmpty()) {
                String normalized = docId.replace('\\', '/');
                int slash = normalized.lastIndexOf('/');
                int colon = normalized.lastIndexOf(':');
                int separator = Math.max(slash, colon);
                return separator >= 0 && separator + 1 < normalized.length()
                        ? normalized.substring(separator + 1) : normalized;
            }
        } catch (Throwable ignored) {
        }
        return "游戏目录";
    }

    public static String playableUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.isEmpty()) {
            return rawUrl;
        }
        if (rawUrl.startsWith("content://") || rawUrl.startsWith("file://")
                || rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
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
        if (docId == null || docId.isEmpty()) {
            return null;
        }
        // 形如 raw:/storage/emulated/0/xxx,部分 provider(如下载目录)使用该形式。
        if (docId.startsWith("raw:")) {
            String rawPath = docId.substring("raw:".length());
            return rawPath.isEmpty() ? null : new File(rawPath);
        }
        if (!docId.contains(":")) {
            // 少数 provider 直接返回绝对路径。
            return docId.startsWith("/") ? new File(docId) : null;
        }
        String[] parts = docId.split(":", 2);
        String type = parts[0];
        String rel = parts.length > 1 ? parts[1] : "";
        File root;
        if ("primary".equalsIgnoreCase(type)) {
            root = Environment.getExternalStorageDirectory();
        } else if (type.startsWith("/")) {
            root = new File(type);
        } else {
            root = new File("/storage/" + type);
        }
        if (rel == null || rel.isEmpty()) {
            return root;
        }
        return new File(root, rel);
    }

    /** 诊断用:把已保存的目录地址转换为可读的本地绝对路径,无法解析时返回 SAF 提示。 */
    public static String describeTarget(String folderUri) {
        try {
            File dir = resolveToFile(folderUri);
            if (dir != null) {
                return dir.getAbsolutePath();
            }
        } catch (Throwable ignored) {
        }
        return folderUri != null && folderUri.startsWith("content://")
                ? "SAF 文档目录" : String.valueOf(folderUri);
    }

    /** 迭代式扫描,避免递归栈溢出;并对每个条目单独容错。 */
    private static void scanFileTree(Context context, File root, List<GameEntry> games) {
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

            // 含 index.html 的目录视为游戏包。根目录仍继续扫描其他独立游戏。
            File packageIndex = findFileIndex(children);
            if (packageIndex != null) {
                String packagePath = current.equals(root) ? "" : relativePath(root, current);
                String subtitle = packagePath.isEmpty()
                        ? "index.html" : packagePath + " / index.html";
                games.add(new GameEntry(
                        current.getName(),
                        subtitle,
                        Uri.fromFile(packageIndex).toString(),
                        packagePath,
                        safeFindFileIcon(packageIndex, current)
                ));
                if (!current.equals(root)) {
                    continue;
                }
            }

            for (File child : children) {
                if (games.size() >= MAX_ENTRIES) {
                    return;
                }
                try {
                    if (packageIndex != null && child.equals(packageIndex)) {
                        continue;
                    }
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
                                Uri.fromFile(child).toString(),
                                null,
                                safeFindFileIcon(child, child.getParentFile())
                        ));
                    } else if (ZipGames.isZip(name)) {
                        // 压缩包内只要含 html 就识别为一个游戏。
                        String zipEntry = ZipGames.findEntry(child);
                        if (zipEntry != null) {
                            games.add(new GameEntry(
                                    displayName(name),
                                    relativePath(root, child) + " / " + zipEntry,
                                    Uri.fromFile(child).toString(),
                                    null,
                                    null,
                                    zipEntry
                            ));
                        }
                    }
                } catch (Throwable ignored) {
                    // 单个条目失败不影响整体
                }
            }
        }
    }

    private static void scanDocumentTree(Context context, DocumentFile root, String rootName,
                                         List<GameEntry> games) {
        ArrayDeque<Object[]> stack = new ArrayDeque<>();
        stack.push(new Object[]{root, 0, ""});

        while (!stack.isEmpty() && games.size() < MAX_ENTRIES) {
            Object[] item = stack.pop();
            DocumentFile current = (DocumentFile) item[0];
            int depth = (Integer) item[1];
            String currentPath = (String) item[2];

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

            DocumentFile packageIndex = findDocumentIndex(children);
            if (packageIndex != null) {
                String title = current.getName();
                if (title == null || title.isEmpty()) {
                    title = currentPath.isEmpty() ? rootName : currentPath;
                }
                String subtitle = currentPath.isEmpty()
                        ? "index.html" : currentPath + " / index.html";
                games.add(new GameEntry(
                        title,
                        subtitle,
                        playableDocumentUrl(packageIndex),
                        currentPath,
                        safeFindDocumentIcon(context, packageIndex, current)
                ));
                if (!currentPath.isEmpty()) {
                    continue;
                }
            }

            for (DocumentFile child : children) {
                if (games.size() >= MAX_ENTRIES) {
                    return;
                }
                try {
                    if (packageIndex != null && child.getUri().equals(packageIndex.getUri())) {
                        continue;
                    }
                    String name = child.getName();
                    if (name == null || name.startsWith(".")) {
                        continue;
                    }
                    String childPath = currentPath.isEmpty() ? name : currentPath + "/" + name;
                    if (child.isDirectory()) {
                        if (depth < MAX_DEPTH) {
                            stack.push(new Object[]{child, depth + 1, childPath});
                        }
                    } else if (isHtml(name)) {
                        games.add(new GameEntry(
                                displayName(name),
                                rootName + " / " + childPath,
                                playableDocumentUrl(child),
                                null,
                                safeFindDocumentIcon(context, child, current)
                        ));
                    } else if (ZipGames.isZip(name)) {
                        // 压缩包内只要含 html 就识别为一个游戏。
                        String zipEntry = findDocumentZipEntry(context, child);
                        if (zipEntry != null) {
                            games.add(new GameEntry(
                                    displayName(name),
                                    rootName + " / " + childPath + " / " + zipEntry,
                                    playableDocumentUrl(child),
                                    null,
                                    null,
                                    zipEntry
                            ));
                        }
                    }
                } catch (Throwable ignored) {
                }
            }
        }
    }

    /** 打开 SAF 文档对应的 zip 流,找出包内入口 HTML 相对路径;失败返回 null。 */
    private static String findDocumentZipEntry(Context context, DocumentFile zip) {
        if (context == null || zip == null) {
            return null;
        }
        InputStream in = null;
        try {
            in = context.getContentResolver().openInputStream(zip.getUri());
            return ZipGames.findEntry(in);
        } catch (Throwable ignored) {
            return null;
        } finally {
            if (in != null) {
                try {
                    in.close();
                } catch (Throwable ignored) {
                }
            }
        }
    }

    private static String safeFindFileIcon(File html, File baseDir) {
        try {
            return findFileIcon(html, baseDir);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static String safeFindDocumentIcon(Context context, DocumentFile html,
                                               DocumentFile baseDir) {
        try {
            return findDocumentIcon(context, html, baseDir);
        } catch (Throwable ignored) {
            return null;
        }
    }

    /**
     * 先看 HTML 内是否用 &lt;link rel="...icon..."&gt; 显式声明图标;
     * 未声明时,回退到目录下与 HTML 同名的 png(如 2048.html -&gt; 2048.png)。
     * 两者都没有则返回 null,由列表使用首字母占位。
     */
    private static String findFileIcon(File html, File baseDir) {
        if (html == null || baseDir == null) {
            return null;
        }
        List<String> declaredIcons = readDeclaredIcons(new InputStreamOpener() {
            @Override
            public InputStream open() throws Exception {
                return new FileInputStream(html);
            }
        });
        for (String declared : declaredIcons) {
            File icon = resolveFileIcon(baseDir, declared);
            if (icon != null) {
                return Uri.fromFile(icon).toString();
            }
        }
        File sameName = findSameNamePng(baseDir, displayName(html.getName()));
        return sameName == null ? null : Uri.fromFile(sameName).toString();
    }

    /** 与 findFileIcon 同理:link 声明优先,同名 png 兜底。 */
    private static String findDocumentIcon(Context context, DocumentFile html,
                                           DocumentFile baseDir) {
        if (context == null || html == null || baseDir == null) {
            return null;
        }
        List<String> declaredIcons = readDeclaredIcons(new InputStreamOpener() {
            @Override
            public InputStream open() throws Exception {
                return context.getContentResolver().openInputStream(html.getUri());
            }
        });
        for (String declared : declaredIcons) {
            DocumentFile icon = resolveDocumentIcon(baseDir, declared);
            if (icon != null) {
                return icon.getUri().toString();
            }
        }
        DocumentFile sameName = findSameNamePngDocument(baseDir, displayName(html.getName()));
        return sameName == null ? null : sameName.getUri().toString();
    }

    /** 目录下与 HTML 同名的 png 文件;直接构造路径,不遍历目录。 */
    private static File findSameNamePng(File directory, String stem) {
        if (directory == null || stem == null || stem.isEmpty()) {
            return null;
        }
        try {
            File candidate = new File(directory, stem + ".png");
            return candidate.isFile() && isInsideDirectory(directory, candidate) ? candidate : null;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static DocumentFile findSameNamePngDocument(DocumentFile directory, String stem) {
        if (directory == null || stem == null || stem.isEmpty()) {
            return null;
        }
        DocumentFile candidate = findDocumentChild(directory, stem + ".png");
        return candidate != null && candidate.isFile() ? candidate : null;
    }

    private static boolean isInsideDirectory(File directory, File child) {
        try {
            String directoryPath = directory.getCanonicalPath();
            String childPath = child.getCanonicalPath();
            return childPath.startsWith(directoryPath + File.separator);
        } catch (Throwable ignored) {
            return false;
        }
    }

    private static List<String> readDeclaredIcons(InputStreamOpener opener) {
        List<String> icons = new ArrayList<>();
        try (InputStream input = opener.open();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) {
                return icons;
            }
            byte[] buffer = new byte[4096];
            int total = 0;
            int count;
            while (total < MAX_ICON_HTML_BYTES
                    && (count = input.read(buffer, 0,
                    Math.min(buffer.length, MAX_ICON_HTML_BYTES - total))) > 0) {
                output.write(buffer, 0, count);
                total += count;
            }
            String html = output.toString("UTF-8");
            Matcher tags = LINK_TAG_PATTERN.matcher(html);
            while (tags.find()) {
                String tag = tags.group();
                Matcher rel = REL_ATTRIBUTE_PATTERN.matcher(tag);
                Matcher href = HREF_ATTRIBUTE_PATTERN.matcher(tag);
                if (!rel.find() || !href.find()) {
                    continue;
                }
                String relValue = attributeValue(rel);
                if (relValue == null
                        || !relValue.toLowerCase(Locale.US).contains("icon")) {
                    continue;
                }
                String iconPath = cleanIconPath(attributeValue(href));
                if (iconPath != null) {
                    icons.add(iconPath);
                }
            }
        } catch (Throwable ignored) {
        }
        return icons;
    }

    private static String attributeValue(Matcher matcher) {
        String quoted = matcher.group(2);
        return quoted != null ? quoted : matcher.group(3);
    }

    private static String cleanIconPath(String path) {
        if (path == null) {
            return null;
        }
        String value = path.trim();
        int query = value.indexOf('?');
        int fragment = value.indexOf('#');
        int end = value.length();
        if (query >= 0) {
            end = Math.min(end, query);
        }
        if (fragment >= 0) {
            end = Math.min(end, fragment);
        }
        value = Uri.decode(value.substring(0, end)).replace('\\', '/');
        String lower = value.toLowerCase(Locale.US);
        if (value.isEmpty() || value.startsWith("/") || value.startsWith("//")
                || lower.startsWith("data:") || lower.contains("://")) {
            return null;
        }
        return value;
    }

    private static File resolveFileIcon(File baseDir, String relativePath) {
        if (relativePath == null || !isSupportedIcon(relativePath)) {
            return null;
        }
        try {
            File base = baseDir.getCanonicalFile();
            File candidate = new File(base, relativePath).getCanonicalFile();
            String basePath = base.getPath();
            String candidatePath = candidate.getPath();
            boolean inside = candidatePath.equals(basePath)
                    || candidatePath.startsWith(basePath + File.separator);
            return inside && candidate.isFile() ? candidate : null;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static DocumentFile resolveDocumentIcon(DocumentFile baseDir, String relativePath) {
        if (relativePath == null || !isSupportedIcon(relativePath)) {
            return null;
        }
        DocumentFile current = baseDir;
        String[] parts = relativePath.split("/");
        for (int i = 0; i < parts.length; i++) {
            String part = parts[i];
            if (part.isEmpty() || ".".equals(part)) {
                continue;
            }
            if ("..".equals(part)) {
                return null;
            }
            DocumentFile next = findDocumentChild(current, part);
            if (next == null) {
                return null;
            }
            if (i < parts.length - 1 && !next.isDirectory()) {
                return null;
            }
            current = next;
        }
        return current != null && current.isFile() ? current : null;
    }

    private static DocumentFile findDocumentChild(DocumentFile directory, String name) {
        try {
            for (DocumentFile child : directory.listFiles()) {
                if (name.equalsIgnoreCase(child.getName())) {
                    return child;
                }
            }
        } catch (Throwable ignored) {
        }
        return null;
    }

    private static boolean isSupportedIcon(String name) {
        String lower = name.toLowerCase(Locale.US);
        for (String extension : SINGLE_ICON_EXTENSIONS) {
            if (lower.endsWith(extension)) {
                return true;
            }
        }
        return false;
    }

    private interface InputStreamOpener {
        InputStream open() throws Exception;
    }

    private static File findFileIndex(File[] children) {
        for (File child : children) {
            try {
                if (child.isFile() && "index.html".equalsIgnoreCase(child.getName())) {
                    return child;
                }
            } catch (Throwable ignored) {
            }
        }
        return null;
    }

    private static DocumentFile findDocumentIndex(DocumentFile[] children) {
        for (DocumentFile child : children) {
            try {
                if (child.isFile() && "index.html".equalsIgnoreCase(child.getName())) {
                    return child;
                }
            } catch (Throwable ignored) {
            }
        }
        return null;
    }

    private static String playableDocumentUrl(DocumentFile document) {
        return document.getUri().toString();
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
