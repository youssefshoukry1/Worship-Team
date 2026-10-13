package com.worship.app;

import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.service.notification.StatusBarNotification;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;

public class PrayerAvatarWorker extends Worker {
    public PrayerAvatarWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    @NonNull @Override
    public Result doWork() {
        Map<String, String> data = new HashMap<>();
        for (Map.Entry<String, Object> entry : getInputData().getKeyValueMap().entrySet()) {
            if (entry.getValue() instanceof String) data.put(entry.getKey(), (String) entry.getValue());
        }
        if (PrayerNotificationIdentity.isAnonymous(data)) return Result.success();
        String tag = data.get("tag");
        HttpURLConnection connection = null;
        try {
            URL url = new URL(data.getOrDefault("avatarUrl", ""));
            if (!"https".equals(url.getProtocol())) return Result.success();
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(4000); connection.setReadTimeout(4000);
            connection.setInstanceFollowRedirects(false);
            if (connection.getResponseCode() != 200 || connection.getContentLengthLong() > 2 * 1024 * 1024) return Result.success();
            byte[] bytes;
            long deadline = android.os.SystemClock.elapsedRealtime() + 8000;
            try (InputStream stream = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = stream.read(buffer)) != -1) {
                    if (isStopped() || android.os.SystemClock.elapsedRealtime() > deadline ||
                        output.size() + count > 2 * 1024 * 1024) return Result.success();
                    output.write(buffer, 0, count);
                }
                bytes = output.toByteArray();
            }
            BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            if (options.outWidth <= 0 || options.outHeight <= 0) return Result.success();
            options.inSampleSize = 1;
            while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 512) options.inSampleSize *= 2;
            options.inJustDecodeBounds = false;
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            if (bitmap == null || isStopped()) return Result.success();
            // Never resurrect an alert the user already dismissed or tapped.
            NotificationManager manager = getApplicationContext().getSystemService(NotificationManager.class);
            for (StatusBarNotification active : manager.getActiveNotifications()) {
                if (tag != null && tag.equals(active.getTag()) && active.getId() == PrayerNotificationRenderer.ID) {
                    PrayerNotificationRenderer.show(getApplicationContext(), data, tag,
                        getInputData().getLong("timestamp", System.currentTimeMillis()), bitmap);
                    break;
                }
            }
        } catch (Exception ignored) {
            // Keep the already-visible initial avatar when the photo is unavailable.
        } finally {
            if (connection != null) connection.disconnect();
        }
        return Result.success();
    }
}
