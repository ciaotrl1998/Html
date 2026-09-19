package cn.linecode.game2048;

import android.app.Application;

/**
 * 应用入口:尽早安装崩溃日志捕获,确保扫描等流程中的异常能被记录。
 */
public class GameApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        CrashLog.install(this);
    }
}
