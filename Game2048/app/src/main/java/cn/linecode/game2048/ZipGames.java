package cn.linecode.game2048;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Enumeration;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipInputStream;

/**
 * ZIP 游戏包处理。
 *
 * 规则:压缩包内只要包含 .html / .htm,就视为一个游戏,入口选取规则为
 * “最浅层的 index.html 优先,其次最浅层的任意 html,同名再按字典序”。
 *
 * 安全:解压时拒绝路径穿越(../)、绝对路径与超量文件/超量字节,防止恶意包写出目标目录。
 */
public final class ZipGames {
    private static final int MAX_FILES = 8000;
    private static final long MAX_TOTAL_BYTES = 512L * 1024 * 1024;
    private static final long MAX_SCAN_BYTES = 256L * 1024 * 1024;

    private ZipGames() {}

    /** 是否为 zip 压缩包(按扩展名判断)。 */
    public static boolean isZip(String name) {
        return name != null && name.toLowerCase(Locale.US).endsWith(".zip");
    }

    private static boolean isHtmlName(String name) {
        if (name == null) {
            return false;
        }
        String lower = name.toLowerCase(Locale.US);
        return lower.endsWith(".html") || lower.endsWith(".htm");
    }

    /** 本地文件快速路径:借中央目录枚举,无需读入文件内容。 */
    public static String findEntry(File zip) {
        if (zip == null || !zip.isFile()) {
            return null;
        }
        ZipFile zipFile = null;
        try {
            zipFile = new ZipFile(zip);
            return chooseBest(zipFile.entries());
        } catch (Throwable t) {
            return null;
        } finally {
            if (zipFile != null) {
                try {
                    zipFile.close();
                } catch (Throwable ignored) {
                }
            }
        }
    }

    /** 流式路径(content:// 或已打开的文件流),顺序扫描并设有字节/条目上限。 */
    public static String findEntry(InputStream in) {
        if (in == null) {
            return null;
        }
        CountingInputStream counter = new CountingInputStream(in);
        try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(counter))) {
            String best = null;
            int bestRank = Integer.MAX_VALUE;
            int count = 0;
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (++count > MAX_FILES || counter.count > MAX_SCAN_BYTES) {
                    break;
                }
                if (entry.isDirectory()) {
                    continue;
                }
                String normalized = normalize(entry.getName());
                if (normalized.isEmpty() || !isHtmlName(normalized)) {
                    continue;
                }
                int rank = rank(normalized);
                if (rank < bestRank || (rank == bestRank
                        && (best == null || normalized.compareTo(best) < 0))) {
                    bestRank = rank;
                    best = normalized;
                }
            }
            return best;
        } catch (Throwable t) {
            return null;
        }
    }

    /** 解压本地 zip 到目标目录;成功返回 true。 */
    public static boolean extract(File zip, File targetDir) {
        if (zip == null || targetDir == null) {
            return false;
        }
        InputStream in = null;
        try {
            in = new BufferedInputStream(new FileInputStream(zip));
            return extract(in, targetDir);
        } catch (Throwable t) {
            return false;
        } finally {
            if (in != null) {
                try {
                    in.close();
                } catch (Throwable ignored) {
                }
            }
        }
    }

    /** 解压 zip 流到目标目录;成功返回 true。调用方负责关闭流。 */
    public static boolean extract(InputStream in, File targetDir) {
        if (in == null || targetDir == null) {
            return false;
        }
        int files = 0;
        long total = 0;
        byte[] buffer = new byte[8192];
        try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(in))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                String normalized = normalize(entry.getName());
                if (normalized.isEmpty()) {
                    continue;
                }
                File output = new File(targetDir, normalized);
                if (!isInside(targetDir, output)) {
                    return false;
                }
                if (entry.isDirectory()) {
                    if (!output.exists() && !output.mkdirs()) {
                        return false;
                    }
                    continue;
                }
                File parent = output.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) {
                    return false;
                }
                if (++files > MAX_FILES) {
                    return false;
                }
                try (OutputStream os = new FileOutputStream(output)) {
                    int read;
                    while ((read = zis.read(buffer)) > 0) {
                        total += read;
                        if (total > MAX_TOTAL_BYTES) {
                            return false;
                        }
                        os.write(buffer, 0, read);
                    }
                }
            }
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    private static String chooseBest(Enumeration<? extends ZipEntry> entries) {
        if (entries == null) {
            return null;
        }
        String best = null;
        int bestRank = Integer.MAX_VALUE;
        int count = 0;
        while (entries.hasMoreElements()) {
            if (++count > MAX_FILES) {
                break;
            }
            ZipEntry entry = entries.nextElement();
            if (entry == null || entry.isDirectory()) {
                continue;
            }
            String normalized = normalize(entry.getName());
            if (normalized.isEmpty() || !isHtmlName(normalized)) {
                continue;
            }
            int rank = rank(normalized);
            if (rank < bestRank || (rank == bestRank
                    && (best == null || normalized.compareTo(best) < 0))) {
                bestRank = rank;
                best = normalized;
            }
        }
        return best;
    }

    /** 越小越优先:index.html 优先,其次层级越浅越优先。 */
    private static int rank(String normalizedName) {
        int depth = 0;
        for (int i = 0; i < normalizedName.length(); i++) {
            if (normalizedName.charAt(i) == '/') {
                depth++;
            }
        }
        int slash = normalizedName.lastIndexOf('/');
        String base = slash >= 0 ? normalizedName.substring(slash + 1) : normalizedName;
        boolean index = base.equalsIgnoreCase("index.html");
        return (index ? 0 : 1000) + Math.min(depth, 999);
    }

    /** 规范化条目名:统一分隔符、去掉首部斜杠与 ./,拒绝 .. 穿越;非法时返回空串。 */
    private static String normalize(String name) {
        if (name == null) {
            return "";
        }
        String value = name.replace('\\', '/');
        while (value.startsWith("/")) {
            value = value.substring(1);
        }
        if (value.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (String part : value.split("/")) {
            if (part.isEmpty() || ".".equals(part)) {
                continue;
            }
            if ("..".equals(part)) {
                return "";
            }
            if (sb.length() > 0) {
                sb.append('/');
            }
            sb.append(part);
        }
        return sb.toString();
    }

    private static boolean isInside(File parent, File child) {
        try {
            String parentPath = parent.getCanonicalPath() + File.separator;
            return child.getCanonicalPath().startsWith(parentPath);
        } catch (Throwable ignored) {
            return false;
        }
    }

    /** 统计已读取字节数,用于给流式扫描设置上限。 */
    private static final class CountingInputStream extends FilterInputStream {
        private long count;

        CountingInputStream(InputStream in) {
            super(in);
        }

        @Override
        public int read() throws IOException {
            int value = super.read();
            if (value >= 0) {
                count++;
            }
            return value;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            int value = super.read(buffer, offset, length);
            if (value > 0) {
                count += value;
            }
            return value;
        }

        @Override
        public long skip(long byteCount) throws IOException {
            long skipped = super.skip(byteCount);
            if (skipped > 0) {
                count += skipped;
            }
            return skipped;
        }
    }
}
