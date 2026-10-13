package com.worship.app;

import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
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
            !("PRAY_SHARED".equals(type) || "PRAY_CONFIRMED".equals(type))) {
            super.onMessageReceived(message);
            return;
        }
        String tag = "prayer:" + type + ":" + data.getOrDefault("shareId", message.getMessageId());
        long timestamp = message.getSentTime() > 0 ? message.getSentTime() : System.currentTimeMillis();
        // Post the initial/anonymous avatar immediately; photo loading must not delay the alert.
        PrayerNotificationRenderer.show(this, data, tag, timestamp, null);
        PushNotificationsPlugin.sendRemoteMessage(message);
        if (!PrayerNotificationIdentity.isAnonymous(data) && !data.getOrDefault("avatarUrl", "").isEmpty()) {
            Data.Builder input = new Data.Builder().putString("tag", tag).putLong("timestamp", timestamp);
            for (Map.Entry<String, String> entry : data.entrySet()) input.putString(entry.getKey(), entry.getValue());
            WorkManager.getInstance(this).enqueueUniqueWork(tag, ExistingWorkPolicy.REPLACE,
                new OneTimeWorkRequest.Builder(PrayerAvatarWorker.class).setInputData(input.build()).build());
        }
    }
}
