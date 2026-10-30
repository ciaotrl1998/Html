package cn.linecode.game2048;

import java.io.File;
import java.nio.charset.StandardCharsets;

/** Loaded only in :game_server; stopping/restarting never terminates the launcher. */
final class NodeRuntime {
    static { System.loadLibrary("node"); System.loadLibrary("htmlbox_node"); }
    private static native int startNative(byte[][] arguments, byte[] configuration, byte[] directory);
    static int start(String[] arguments, File configuration, File directory) {
        byte[][] encoded = new byte[arguments.length][];
        for (int i = 0; i < arguments.length; i++) encoded[i] = arguments[i].getBytes(StandardCharsets.UTF_8);
        return startNative(encoded, configuration.getAbsolutePath().getBytes(StandardCharsets.UTF_8), directory.getAbsolutePath().getBytes(StandardCharsets.UTF_8));
    }
}
