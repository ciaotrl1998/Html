package cn.linecode.game2048;

public class GameEntry {
    public final String title;
    public final String subtitle;
    public final String url;
    public final boolean builtin;

    public GameEntry(String title, String subtitle, String url, boolean builtin) {
        this.title = title;
        this.subtitle = subtitle;
        this.url = url;
        this.builtin = builtin;
    }
}
