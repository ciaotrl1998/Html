package cn.linecode.game2048;

import static org.junit.Assert.*;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ServerScannerTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    private void write(File directory, String path, String content) throws Exception {
        File file = new File(directory, path); assertTrue(file.getParentFile().isDirectory() || file.getParentFile().mkdirs());
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(content.getBytes(StandardCharsets.UTF_8)); }
    }

    @Test public void recursiveScanUsesOnlyTheSelectedHtmlDirectory() throws Exception {
        File html = temporary.newFolder("html"), other = temporary.newFolder("其他目录");
        write(html, "古坊奇谭/server.js", "require('http').createServer().listen(8787)");
        write(html, "另一款游戏/server.mjs", "import http from 'node:http';http.createServer().listen(3000)");
        write(other, "别的游戏/server.cjs", "require('http').createServer().listen(9090)");
        List<ServerEntry> result = ServerScanner.scan(html);
        assertEquals(2, result.size()); assertTrue(result.stream().anyMatch(entry -> entry.name.equals("古坊奇谭")));
        assertTrue(result.stream().anyMatch(entry -> entry.name.equals("另一款游戏")));
        assertEquals("别的游戏", ServerScanner.scan(other).get(0).name);
    }

    @Test public void packageStartPreservesQuotedPathArgumentsOptionsAndEnvironment() throws Exception {
        File root = temporary.newFolder("游戏");
        write(root, "src/my server.cjs", "require('http').createServer().listen(0)");
        write(root, "package.json", "{\"displayName\":\"自定义服务\",\"scripts\":{\"start\":\"cross-env PORT=8787 node --max-old-space-size=128 \\\"src/my server.cjs\\\" --game coop\"}}");
        ServerEntry entry = ServerScanner.scan(root).get(0);
        assertEquals("自定义服务", entry.name); assertEquals("8787", entry.environment.get("PORT"));
        assertEquals("my server.cjs", entry.entry.getName());
        assertEquals("--max-old-space-size=128", entry.nodeOptions.get(0));
        assertEquals(java.util.Arrays.asList("--game", "coop"), entry.arguments);
    }

    @Test public void skipsDependencyFoldersAndDoesNotTreatHtmlAsServerCode() throws Exception {
        File root = temporary.newFolder();
        write(root, "2048.html", "<html>single file game</html>");
        write(root, "node_modules/helper/server.js", "dependency, not a game server");
        write(root, ".git/server.js", "ignored");
        assertTrue(ServerScanner.scan(root).isEmpty());
    }

    @Test public void optionalDescriptorAndNodeDirectoryEntryBothResolveCorrectly() throws Exception {
        File root = temporary.newFolder();
        write(root, "游戏甲/backend.cjs", "require('http').createServer().listen(0)");
        write(root, "游戏甲/htmlbox-server.json", "{\"name\":\"联机甲\",\"entry\":\"backend.cjs\",\"port\":5678,\"args\":[\"--coop\"]}");
        write(root, "游戏乙/app.js", "require('http').createServer().listen(0)");
        write(root, "游戏乙/package.json", "{\"main\":\"app.js\",\"scripts\":{\"start\":\"node .\"}}");
        List<ServerEntry> result = ServerScanner.scan(root); assertEquals(2, result.size());
        ServerEntry first = result.stream().filter(entry -> entry.name.equals("联机甲")).findFirst().get();
        assertEquals("5678", first.environment.get("PORT")); assertEquals("--coop", first.arguments.get(0));
        assertTrue(result.stream().anyMatch(entry -> entry.entry.getName().equals("app.js")));
    }
}
