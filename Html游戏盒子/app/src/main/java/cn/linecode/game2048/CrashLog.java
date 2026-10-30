package cn.linecode.game2048;

import android.content.Context;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;

/**
 * 记录未捕获异常的简短堆栈,便于在无法连电脑看 logcat 时定位闪退原因。
 * 日志写入应用私有目录,下次启动时由界面读出并展示。
 */
public final class CrashLog {
    private static final String FILE_NAME = "last_crash.txt";
    private static final int MAX_LINES = 80;

    private CrashLog() {}

    private static File file(Context ctx) {
        return new File(ctx.getFilesDir(), FILE_NAME);
    }

    /** 安装全局未捕获异常处理器,应尽早调用。 */
    public static void install(final Context ctx) {
        final Context app = ctx.getApplicationContext();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread t, Throwable e) {
                try {
                    write(app, t, e);
                } catch (Throwable ignored) {
                    // 记录失败时不得再抛异常,否则会掩盖原始崩溃
                }
                if (previous != null) {
                    previous.uncaughtException(t, e);
                }
            }
        });
    }

    private static void write(Context ctx, Thread t, Throwable e) {
        StringWriter sw = new StringWriter();
        PrintWriter pw = new PrintWriter(sw);
        pw.println("time=" + System.currentTimeMillis());
        pw.println("thread=" + (t == null ? "?" : t.getName()));
        e.printStackTrace(pw);
        pw.flush();
        FileOutputStream out = null;
        try {
            out = new FileOutputStream(file(ctx));
            out.write(sw.toString().getBytes(StandardCharsets.UTF_8));
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

    /** 读取上次崩溃日志,无则返回 null。 */
    public static String read(Context ctx) {
        File f = file(ctx);
        if (!f.exists()) {
            return null;
        }
        BufferedReader reader = null;
        try {
            reader = new BufferedReader(
                    new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            int count = 0;
            while ((line = reader.readLine()) != null && count < MAX_LINES) {
                sb.append(line).append('\n');
                count++;
            }
            return sb.toString().trim();
        } catch (Throwable ex) {
            return null;
        } finally {
            if (reader != null) {
                try {
                    reader.close();
                } catch (Throwable ignored) {
                }
            }
        }
    }

    public static void clear(Context ctx) {
        try {
            file(ctx).delete();
        } catch (Throwable ignored) {
        }
    }
}
