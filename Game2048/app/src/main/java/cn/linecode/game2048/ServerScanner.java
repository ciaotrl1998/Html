package cn.linecode.game2048;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Finds runnable Node projects in any selected folder, including nested game folders. */
public final class ServerScanner {
    private static final Set<String> SKIP = new HashSet<>(Arrays.asList(
            "node_modules", ".git", ".gradle", ".idea", "build", ".cache"));
    private ServerScanner() {}

    public static List<ServerEntry> scan(File root) {
        List<ServerEntry> result = new ArrayList<>();
        if (root == null || !root.isDirectory()) return result;
        ArrayDeque<File> queue = new ArrayDeque<>();
        Set<String> visited = new HashSet<>();
        queue.add(root);
        while (!queue.isEmpty() && visited.size() < 3000) {
            File directory = queue.remove();
            try {
                if (!visited.add(directory.getCanonicalPath())) continue;
                ServerEntry entry = inspect(directory);
                if (entry != null) result.add(entry);
                File[] children = directory.listFiles();
                if (children == null) continue;
                for (File child : children) if (child.isDirectory() && !SKIP.contains(child.getName())
                        && queue.size() < 3000) queue.add(child);
            } catch (Exception ignored) { /* An unreadable folder does not hide other servers. */ }
        }
        Collections.sort(result, (a, b) -> a.name.compareToIgnoreCase(b.name));
        return result;
    }

    private static ServerEntry inspect(File directory) throws Exception {
        JSONObject explicit = json(new File(directory, "htmlbox-server.json"));
        JSONObject pkg = json(new File(directory, "package.json"));
        String name = explicit.optString("name", pkg.optString("displayName", directory.getName()));
        if (name.trim().isEmpty()) name = directory.getName();
        ArrayList<String> options = new ArrayList<>(), arguments = new ArrayList<>();
        HashMap<String, String> environment = new HashMap<>();
        String path = explicit.optString("entry", "");
        if (!path.isEmpty()) {
            JSONArray args = explicit.optJSONArray("args");
            if (args != null) for (int i = 0; i < args.length(); i++) arguments.add(args.getString(i));
            JSONObject env = explicit.optJSONObject("env");
            if (env != null) for (java.util.Iterator<String> keys = env.keys(); keys.hasNext();) {
                String key = keys.next(); environment.put(key, env.getString(key));
            }
            if (explicit.has("port")) environment.put("PORT", String.valueOf(explicit.getInt("port")));
        } else {
            JSONObject scripts = pkg.optJSONObject("scripts");
            List<String> tokens = tokenize(scripts == null ? "" : scripts.optString("start", ""));
            int i = 0;
            if (!tokens.isEmpty() && "cross-env".equals(tokens.get(0))) i++;
            while (i < tokens.size() && tokens.get(i).matches("[A-Za-z_][A-Za-z0-9_]*=.*")) {
                String token = tokens.get(i++); int equal = token.indexOf('=');
                environment.put(token.substring(0, equal), token.substring(equal + 1));
            }
            if (i < tokens.size() && ("node".equals(tokens.get(i)) || "node.exe".equals(tokens.get(i)))) {
                i++;
                while (i < tokens.size() && tokens.get(i).startsWith("-")) {
                    String flag = tokens.get(i++); options.add(flag);
                    if ("--".equals(flag)) { options.remove(options.size() - 1); break; }
                    if (Arrays.asList("-r", "--require", "--loader", "--import", "--max-old-space-size").contains(flag) && i < tokens.size()) options.add(tokens.get(i++));
                }
                if (i < tokens.size()) { path = tokens.get(i++); while (i < tokens.size()) arguments.add(tokens.get(i++)); }
            }
            if (path.isEmpty()) for (String candidate : Arrays.asList("server.js", "server.cjs", "server.mjs")) {
                if (new File(directory, candidate).isFile()) { path = candidate; break; }
            }
        }
        if (path.isEmpty()) return null;
        File entry = new File(directory, path).getCanonicalFile();
        if (entry.isDirectory()) {
            JSONObject nested = json(new File(entry, "package.json"));
            entry = new File(entry, nested.optString("main", "index.js")).getCanonicalFile();
        }
        String fileName = entry.getName();
        if (fileName.contains(".") && !fileName.matches("(?i).+\\.(js|cjs|mjs)$")) return null;
        if (!entry.isFile() || !entry.canRead()) return null;
        return new ServerEntry(name, directory.getCanonicalFile(), entry, options, arguments, environment);
    }

    static List<String> tokenize(String command) {
        List<String> result = new ArrayList<>(); StringBuilder token = new StringBuilder();
        char quote = 0; boolean escape = false;
        for (char c : command.toCharArray()) {
            if (escape) { token.append(c); escape = false; continue; }
            if (c == '\\' && quote != '\'') { escape = true; continue; }
            if (quote != 0) { if (c == quote) quote = 0; else token.append(c); continue; }
            if (c == '\'' || c == '"') { quote = c; continue; }
            if (";&|<>`".indexOf(c) >= 0) return Collections.emptyList();
            if (Character.isWhitespace(c)) { if (token.length() > 0) { result.add(token.toString()); token.setLength(0); } }
            else token.append(c);
        }
        if (quote != 0 || escape) return Collections.emptyList();
        if (token.length() > 0) result.add(token.toString());
        return result;
    }

    static JSONObject json(File file) throws Exception {
        if (!file.isFile()) return new JSONObject();
        return new JSONObject(readText(file));
    }
    static String readText(File file) throws Exception {
        if (file.length() > 1024 * 1024) throw new Exception("JSON 文件过大");
        try (FileInputStream input = new FileInputStream(file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = input.read(buffer)) >= 0) output.write(buffer, 0, count);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
