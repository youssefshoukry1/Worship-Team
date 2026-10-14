package com.worship.app;

import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.net.ProtocolException;
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
        if (PrayerNotificationIdentity.isAnonymous(data) || isStopped()) return Result.success();
        String tag = data.get("tag");
        NotificationManager manager = getApplicationContext().getSystemService(NotificationManager.class);
        if (!isVisible(manager, tag)) return Result.success();
        try {
            Bitmap bitmap = PrayerAvatarLoader.load(getApplicationContext(), data.getOrDefault("avatarUrl", ""), 8000);
            // Never resurrect an alert that was dismissed or tapped during the download.
            if (!isStopped() && isVisible(manager, tag)) {
                PrayerNotificationRenderer.show(getApplicationContext(), data, tag,
                    getInputData().getLong("timestamp", System.currentTimeMillis()), bitmap);
            }
        } catch (Exception error) {
            // Log the failure kind, without exposing the user's photo URL.
            Log.w("PrayerPush", "Avatar update failed: " + error.getClass().getSimpleName());
            if (!(error instanceof ProtocolException) && getRunAttemptCount() < 2 && !isStopped() && isVisible(manager, tag)) {
                return Result.retry();
            }
        }
        return Result.success();
    }

    private boolean isVisible(NotificationManager manager, String tag) {
        if (tag == null) return false;
        for (StatusBarNotification active : manager.getActiveNotifications()) {
            if (tag.equals(active.getTag()) && active.getId() == PrayerNotificationRenderer.ID) return true;
        }
        return false;
    }
}
