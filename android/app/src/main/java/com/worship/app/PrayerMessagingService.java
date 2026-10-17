package com.worship.app;

import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import android.graphics.Bitmap;
import android.os.Build;
import android.util.Log;
import androidx.work.OutOfQuotaPolicy;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class PrayerMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        String type = data.get("type");
        if (!"avatar-v1".equals(data.get("notificationStyle")) ||
            !PrayerNotificationIdentity.supports(type)) {
            super.onMessageReceived(message);
            return;
        }
        String tag = PrayerNotificationIdentity.notificationTag(data, message.getMessageId());
        long timestamp = message.getSentTime() > 0 ? message.getSentTime() : System.currentTimeMillis();
        boolean anonymous = PrayerNotificationIdentity.isAnonymous(data);
        String avatarUrl = data.getOrDefault("avatarUrl", "");
        Bitmap photo = null;
        if (!anonymous && !avatarUrl.isEmpty()) {
            // Usually immediate from cache; a short first attempt avoids displaying an
            // initial for a healthy profile photo while a background worker is deferred.
            try { photo = PrayerAvatarLoader.load(this, avatarUrl, 1500); }
            catch (Exception error) { Log.d("PrayerPush", "Photo deferred: " + error.getClass().getSimpleName()); }
        }
        PrayerNotificationRenderer.show(this, data, tag, timestamp, photo);
        PushNotificationsPlugin.sendRemoteMessage(message);
        if (!anonymous && !avatarUrl.isEmpty() && photo == null) {
            Data.Builder input = new Data.Builder().putString("tag", tag).putLong("timestamp", timestamp);
            for (Map.Entry<String, String> entry : data.entrySet()) input.putString(entry.getKey(), entry.getValue());
            OneTimeWorkRequest.Builder work = new OneTimeWorkRequest.Builder(PrayerAvatarWorker.class).setInputData(input.build());
            if (Build.VERSION.SDK_INT >= 31) work.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST);
            WorkManager.getInstance(this).enqueueUniqueWork(tag, ExistingWorkPolicy.REPLACE, work.build());
        }
    }
}
