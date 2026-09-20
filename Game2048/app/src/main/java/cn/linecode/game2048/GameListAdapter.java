package cn.linecode.game2048;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.ImageView;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class GameListAdapter extends ArrayAdapter<GameEntry> {
    private static final int ICON_DECODE_SIZE = 128;
    private static final int MAX_ICO_BYTES = 8 * 1024 * 1024;

    private final ExecutorService iconExecutor = Executors.newFixedThreadPool(2);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final LruCache<String, Bitmap> iconCache = new LruCache<String, Bitmap>(8 * 1024) {
        @Override
        protected int sizeOf(String key, Bitmap bitmap) {
            return bitmap.getByteCount() / 1024;
        }
    };
    private volatile boolean closed;

    public GameListAdapter(Context context, List<GameEntry> games) {
        super(context, 0, games);
    }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        ViewHolder holder;
        if (convertView == null) {
            convertView = LayoutInflater.from(getContext()).inflate(R.layout.item_game, parent, false);
            holder = new ViewHolder(convertView);
            convertView.setTag(holder);
        } else {
            holder = (ViewHolder) convertView.getTag();
        }

        GameEntry game = getItem(position);
        if (game == null) {
            return convertView;
        }

        String label = game.title == null ? "" : game.title.trim();
        holder.iconText.setText(label.isEmpty() ? "H" : label.substring(0, 1).toUpperCase());
        holder.title.setText(game.title);
        holder.subtitle.setText(game.subtitle);
        showPlaceholder(holder);

        String iconUrl = game.iconUrl;
        holder.iconImage.setTag(iconUrl);
        if (iconUrl != null && !iconUrl.isEmpty()) {
            Bitmap cached = iconCache.get(iconUrl);
            if (cached != null) {
                showBitmap(holder, cached);
            } else {
                loadIcon(holder.iconImage, holder.iconText, iconUrl);
            }
        }
        return convertView;
    }

    public void shutdown() {
        closed = true;
        iconExecutor.shutdownNow();
        mainHandler.removeCallbacksAndMessages(null);
        iconCache.evictAll();
    }

    private void loadIcon(ImageView imageView, TextView fallbackView, String iconUrl) {
        if (closed) {
            return;
        }
        try {
            iconExecutor.execute(() -> {
                Bitmap bitmap = decodeIcon(iconUrl);
                if (closed || Thread.currentThread().isInterrupted()) {
                    return;
                }
                if (bitmap != null) {
                    iconCache.put(iconUrl, bitmap);
                }
                mainHandler.post(() -> {
                    if (closed || !iconUrl.equals(imageView.getTag())) {
                        return;
                    }
                    if (bitmap != null) {
                        imageView.setImageBitmap(bitmap);
                        imageView.setVisibility(View.VISIBLE);
                        fallbackView.setVisibility(View.GONE);
                    }
                });
            });
        } catch (RuntimeException ignored) {
            // Activity 关闭后线程池可能已停止,保留首字母占位即可。
        }
    }

    private Bitmap decodeIcon(String iconUrl) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            try (InputStream input = openIcon(iconUrl)) {
                if (input == null) {
                    return null;
                }
                BitmapFactory.decodeStream(input, null, bounds);
            }
            if (bounds.outWidth > 0 && bounds.outHeight > 0) {
                BitmapFactory.Options options = new BitmapFactory.Options();
                options.inSampleSize = calculateSampleSize(bounds.outWidth, bounds.outHeight);
                options.inPreferredConfig = Bitmap.Config.ARGB_8888;
                try (InputStream input = openIcon(iconUrl)) {
                    return input == null ? null : BitmapFactory.decodeStream(input, null, options);
                }
            }
            if (iconUrl.toLowerCase().contains(".ico")) {
                return decodePngLayerFromIco(iconUrl);
            }
        } catch (Throwable ignored) {
        }
        return null;
    }

    private Bitmap decodePngLayerFromIco(String iconUrl) {
        try (InputStream input = openIcon(iconUrl);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) {
                return null;
            }
            byte[] buffer = new byte[8192];
            int total = 0;
            int count;
            while ((count = input.read(buffer)) > 0) {
                total += count;
                if (total > MAX_ICO_BYTES) {
                    return null;
                }
                output.write(buffer, 0, count);
            }
            byte[] ico = output.toByteArray();
            if (ico.length < 22 || readLe16(ico, 0) != 0 || readLe16(ico, 2) != 1) {
                return null;
            }
            int imageCount = readLe16(ico, 4);
            int bestOffset = -1;
            int bestSize = 0;
            int bestArea = -1;
            for (int i = 0; i < imageCount; i++) {
                int entry = 6 + i * 16;
                if (entry + 16 > ico.length) {
                    break;
                }
                int width = ico[entry] & 0xFF;
                int height = ico[entry + 1] & 0xFF;
                width = width == 0 ? 256 : width;
                height = height == 0 ? 256 : height;
                int size = readLe32(ico, entry + 8);
                int offset = readLe32(ico, entry + 12);
                if (size <= 8 || offset < 0 || offset > ico.length - size
                        || !hasPngSignature(ico, offset)) {
                    continue;
                }
                int area = width * height;
                if (area > bestArea) {
                    bestArea = area;
                    bestOffset = offset;
                    bestSize = size;
                }
            }
            if (bestOffset < 0) {
                return null;
            }
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(ico, bestOffset, bestSize, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
                return null;
            }
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = calculateSampleSize(bounds.outWidth, bounds.outHeight);
            options.inPreferredConfig = Bitmap.Config.ARGB_8888;
            return BitmapFactory.decodeByteArray(ico, bestOffset, bestSize, options);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static boolean hasPngSignature(byte[] data, int offset) {
        return offset >= 0 && offset + 8 <= data.length
                && (data[offset] & 0xFF) == 0x89
                && data[offset + 1] == 0x50
                && data[offset + 2] == 0x4E
                && data[offset + 3] == 0x47
                && data[offset + 4] == 0x0D
                && data[offset + 5] == 0x0A
                && data[offset + 6] == 0x1A
                && data[offset + 7] == 0x0A;
    }

    private static int readLe16(byte[] data, int offset) {
        return (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8);
    }

    private static int readLe32(byte[] data, int offset) {
        long value = (data[offset] & 0xFFL)
                | ((data[offset + 1] & 0xFFL) << 8)
                | ((data[offset + 2] & 0xFFL) << 16)
                | ((data[offset + 3] & 0xFFL) << 24);
        return value > Integer.MAX_VALUE ? -1 : (int) value;
    }

    private InputStream openIcon(String iconUrl) throws Exception {
        Uri uri = Uri.parse(iconUrl);
        String scheme = uri.getScheme();
        if (scheme == null || "file".equalsIgnoreCase(scheme)) {
            String path = scheme == null ? iconUrl : uri.getPath();
            return path == null ? null : new FileInputStream(new File(path));
        }
        if ("content".equalsIgnoreCase(scheme)) {
            return getContext().getContentResolver().openInputStream(uri);
        }
        return null;
    }

    private static int calculateSampleSize(int width, int height) {
        int sample = 1;
        while (width / (sample * 2) >= ICON_DECODE_SIZE
                && height / (sample * 2) >= ICON_DECODE_SIZE) {
            sample *= 2;
        }
        return sample;
    }

    private static void showPlaceholder(ViewHolder holder) {
        holder.iconImage.setImageDrawable(null);
        holder.iconImage.setVisibility(View.GONE);
        holder.iconText.setVisibility(View.VISIBLE);
    }

    private static void showBitmap(ViewHolder holder, Bitmap bitmap) {
        holder.iconImage.setImageBitmap(bitmap);
        holder.iconImage.setVisibility(View.VISIBLE);
        holder.iconText.setVisibility(View.GONE);
    }

    private static final class ViewHolder {
        final ImageView iconImage;
        final TextView iconText;
        final TextView title;
        final TextView subtitle;

        ViewHolder(View root) {
            iconImage = root.findViewById(R.id.iconImage);
            iconText = root.findViewById(R.id.iconText);
            title = root.findViewById(R.id.title);
            subtitle = root.findViewById(R.id.subtitle);
        }
    }
}
