package cn.linecode.game2048;

public class GameEntry {
    public final String title;
    public final String subtitle;
    public final String url;
    /** 相对已选根目录的游戏包路径;null 表示普通单文件游戏。 */
    public final String packagePath;
    /** 可选的本地图标地址,支持 file:// 和 content://。 */
    public final String iconUrl;

    public GameEntry(String title, String subtitle, String url) {
        this(title, subtitle, url, null, null);
    }

    public GameEntry(String title, String subtitle, String url, String packagePath) {
        this(title, subtitle, url, packagePath, null);
    }

    public GameEntry(String title, String subtitle, String url,
                     String packagePath, String iconUrl) {
        this.title = title;
        this.subtitle = subtitle;
        this.url = url;
        this.packagePath = packagePath;
        this.iconUrl = iconUrl;
    }
}
