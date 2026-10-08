package cn.linecode.game2048;

import android.os.Bundle;
import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;

/** A real entry on disk, not a list of hard-coded game names. */
public final class ServerEntry {
    public final String name;
    public final File directory;
    public final File entry;
    public final ArrayList<String> nodeOptions;
    public final ArrayList<String> arguments;
    public final HashMap<String, String> environment;

    ServerEntry(String name, File directory, File entry, ArrayList<String> options,
                ArrayList<String> arguments, HashMap<String, String> environment) {
        this.name = name; this.directory = directory; this.entry = entry;
        this.nodeOptions = options; this.arguments = arguments; this.environment = environment;
    }

    Bundle toBundle() {
        Bundle bundle = new Bundle();
        bundle.putString("name", name); bundle.putString("directory", directory.getAbsolutePath());
        bundle.putString("entry", entry.getAbsolutePath());
        bundle.putStringArrayList("options", nodeOptions); bundle.putStringArrayList("arguments", arguments);
        Bundle env = new Bundle();
        for (String key : environment.keySet()) env.putString(key, environment.get(key));
        bundle.putBundle("env", env);
        return bundle;
    }
}
