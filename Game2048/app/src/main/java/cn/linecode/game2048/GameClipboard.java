package cn.linecode.game2048;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.webkit.JavascriptInterface;

/** Android text clipboard needs no READ_CLIPBOARD/WRITE_CLIPBOARD manifest permission. */
public final class GameClipboard {
    private final Context context;
    public GameClipboard(Context context) { this.context = context; }
    @JavascriptInterface public boolean writeText(String text) {
        return copy(context, "HTML 游戏", text);
    }
    @JavascriptInterface public String readText() {
        try {
            ClipboardManager manager = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clip = manager == null ? null : manager.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return "";
            CharSequence text = clip.getItemAt(0).coerceToText(context);
            return text == null ? "" : text.toString();
        } catch (Exception ignored) { return ""; }
    }
    static boolean copy(Context context, String label, String text) {
        try {
            ClipboardManager manager = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            if (manager == null || text == null) return false;
            manager.setPrimaryClip(ClipData.newPlainText(label, text));
            return true;
        } catch (Exception ignored) { return false; }
    }
}
