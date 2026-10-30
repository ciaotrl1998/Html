package cn.linecode.game2048;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * 游戏列表缓存(持久化)。
 *
 * 目的:App 退出、重启或回到界面时直接展示上次扫描结果,避免每次自动重新扫描目录。
 * 仅在用户手动刷新或重新选择目录后才重新扫描并覆盖缓存。
 *
 * 持久化说明:
 * - 文件写在应用内部存储(getFilesDir),系统会跨进程退出/重启保留,
 *   只有“卸载应用”或“清除应用数据”才会删除。
 * - 写入采用“先写临时文件 + fsync + 原子重命名”,进程被强杀也不会得到半截文件。
 * - 若主文件缺失或损坏,会尝试从残留的临时文件恢复。
 */
public final class GameCache {
    private static final String FILE_NAME = "game_cache.json";
    private static final String TEMP_NAME = FILE_NAME + ".tmp";

    private GameCache() {}

    /** 缓存快照:记录扫描所用目录地址与对应的游戏列表。 */
    public static final class Snapshot {
        public final String folderUri;
        public final List<GameEntry> games;

        Snapshot(String folderUri, List<GameEntry> games) {
            this.folderUri = folderUri;
            this.games = games;
        }
    }

    /** 保存缓存。仅在有游戏时落盘,空列表不写,以便下次启动能重新扫描。 */
    public static void save(Context context, String folderUri, List<GameEntry> games) {
        if (context == null || folderUri == null || games == null || games.isEmpty()) {
            return;
        }
        try {
            JSONObject root = new JSONObject();
            root.put("folderUri", folderUri);
            JSONArray array = new JSONArray();
            for (GameEntry game : games) {
                if (game == null) {
                    continue;
                }
                JSONObject item = new JSONObject();
                item.put("title", game.title == null ? "" : game.title);
                item.put("subtitle", game.subtitle == null ? "" : game.subtitle);
                item.put("url", game.url == null ? "" : game.url);
                item.put("packagePath", game.packagePath == null ? JSONObject.NULL : game.packagePath);
                item.put("iconUrl", game.iconUrl == null ? JSONObject.NULL : game.iconUrl);
                item.put("archiveEntry", game.archiveEntry == null ? JSONObject.NULL : game.archiveEntry);
                array.put(item);
            }
            root.put("games", array);
            writeAtomic(context, root.toString());
        } catch (Throwable ignored) {
            // 缓存写入失败不影响正常使用,下次仍会重新扫描。
        }
    }

    /** 读取缓存,不存在或损坏时返回 null。 */
    public static Snapshot load(Context context) {
        if (context == null) {
            return null;
        }
        File dir = context.getFilesDir();
        if (dir == null) {
            return null;
        }
        File target = new File(dir, FILE_NAME);
        Snapshot snapshot = readFile(target);
        if (snapshot != null) {
            // 主文件可用,清理上次可能残留的临时文件。
            try {
                new File(dir, TEMP_NAME).delete();
            } catch (Throwable ignored) {
            }
            return snapshot;
        }
        // 主文件缺失或损坏:尝试从上次未完成的临时文件恢复。
        File temp = new File(dir, TEMP_NAME);
        Snapshot recovered = readFile(temp);
        if (recovered != null) {
            try {
                temp.renameTo(target);
            } catch (Throwable ignored) {
            }
            return recovered;
        }
        return null;
    }

    /** 删除缓存(暂未使用,保留以便未来“清除缓存”入口)。 */
    public static void clear(Context context) {
        if (context == null) {
            return;
        }
        File dir = context.getFilesDir();
        if (dir == null) {
            return;
        }
        try {
            new File(dir, FILE_NAME).delete();
        } catch (Throwable ignored) {
        }
        try {
            new File(dir, TEMP_NAME).delete();
        } catch (Throwable ignored) {
        }
    }

    private static Snapshot readFile(File file) {
        if (file == null || !file.isFile()) {
            return null;
        }
        InputStream in = null;
        try {
            in = new FileInputStream(file);
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int read;
            while ((read = in.read(chunk)) > 0) {
                buffer.write(chunk, 0, read);
            }
            JSONObject root = new JSONObject(buffer.toString("UTF-8"));
            JSONArray array = root.optJSONArray("games");
            if (array == null) {
                return null;
            }
            List<GameEntry> games = new ArrayList<>();
            for (int i = 0; i < array.length(); i++) {
                JSONObject item = array.optJSONObject(i);
                if (item == null) {
                    continue;
                }
                games.add(new GameEntry(
                        item.optString("title", ""),
                        item.optString("subtitle", ""),
                        item.optString("url", ""),
                        item.isNull("packagePath") ? null : item.optString("packagePath", null),
                        item.isNull("iconUrl") ? null : item.optString("iconUrl", null),
                        item.isNull("archiveEntry") ? null : item.optString("archiveEntry", null)
                ));
            }
            return new Snapshot(root.optString("folderUri", null), games);
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

    /**
     * 先写临时文件并 fsync 落盘,再原子重命名到目标文件。
     * 这样即使进程在写入过程中被系统强杀,也不会读到半截 JSON。
     */
    private static void writeAtomic(Context context, String content) {
        File dir = context.getFilesDir();
        if (dir == null) {
            return;
        }
        File target = new File(dir, FILE_NAME);
        File temp = new File(dir, TEMP_NAME);
        FileOutputStream out = null;
        try {
            out = new FileOutputStream(temp);
            out.write(content.getBytes(StandardCharsets.UTF_8));
            out.flush();
            // 强制刷入磁盘,避免系统缓存尚未落盘时进程被杀导致数据丢失。
            out.getFD().sync();
            out.close();
            out = null;
            if (!temp.renameTo(target)) {
                // 某些文件系统下目标已存在会导致重命名失败,先删除再重试。
                target.delete();
                temp.renameTo(target);
            }
        } catch (Throwable ignored) {
        } finally {
            if (out != null) {
                try {
                    out.close();
                } catch (Throwable ignored) {
                }
            }
        }
    }
}
