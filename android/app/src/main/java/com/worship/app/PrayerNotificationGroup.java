package com.worship.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Called under PrayerNotificationRenderer's lock, including lifecycle and dismissal callbacks. */
final class PrayerNotificationGroup {
    static final String KEY = "com.wasla.wasla.PRAYERS";
    static final String SUMMARY_TAG = "prayer:summary";
    static final int SUMMARY_ID = 2;
    // Restore from Android after process death. Tracking posts also avoids a race
    // with NotificationManager's asynchronously updated active-notification list.
    private static Map<String, Notification> children;
    private static boolean hasSummary;

    private static void restore(NotificationManager manager) {
        if (children != null) return;
        children = new LinkedHashMap<>();
        hasSummary = false;
        for (StatusBarNotification active : manager.getActiveNotifications()) {
            if (!KEY.equals(active.getNotification().getGroup())) continue;
            if (NotificationCompat.isGroupSummary(active.getNotification())) hasSummary = true;
            else if (active.getId() == PrayerNotificationRenderer.ID && active.getTag() != null) {
                children.put(active.getTag(), active.getNotification());
            }
        }
    }

    static PendingIntent deleteIntent(Context context, String tag) {
        Intent intent = new Intent(context, PrayerNotificationDismissReceiver.class)
            .setData(Uri.parse("wasla://notification-dismiss/" + Uri.encode(tag)))
            .putExtra("tag", tag);
        return PendingIntent.getBroadcast(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void post(Context context, String tag, Notification notification) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        restore(manager);
        children.put(tag, notification);
        manager.notify(tag, PrayerNotificationRenderer.ID, notification);
        updateSummary(context, manager);
    }

    static void dismiss(Context context, String tag) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        restore(manager);
        if (SUMMARY_TAG.equals(tag)) {
            for (String childTag : children.keySet()) manager.cancel(childTag, PrayerNotificationRenderer.ID);
            children.clear();
        } else if (children.remove(tag) != null) {
            manager.cancel(tag, PrayerNotificationRenderer.ID);
        }
        updateSummary(context, manager);
    }

    static void clear(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        for (android.service.notification.StatusBarNotification notification : manager.getActiveNotifications()) {
            if (notification.getId() != PrayerBackupWorker.NOTIFICATION_ID) manager.cancel(notification.getTag(), notification.getId());
        }
        children = null;
        hasSummary = false;
    }

    private static void updateSummary(Context context, NotificationManager manager) {
        if (children.isEmpty()) {
            manager.cancel(SUMMARY_TAG, SUMMARY_ID);
            hasSummary = false;
            return;
        }
        if (children.size() == 1 && !hasSummary) return;
        // Keep an existing summary when one child remains: cancelling a group
        // summary can also cancel that remaining child on Android.
        List<Notification> ordered = new ArrayList<>(children.values());
        ordered.sort(Comparator.comparingLong((Notification item) -> item.when).reversed());
        Notification latest = ordered.get(0);
        String count = children.size() + (children.size() == 1 ? " notification" : " notifications");
        NotificationCompat.InboxStyle style = new NotificationCompat.InboxStyle()
            .setBigContentTitle("Wasla").setSummaryText(count);
        for (Notification child : ordered) {
            style.addLine(child.extras.getCharSequence(Notification.EXTRA_TITLE, "A friend")
                + ": " + child.extras.getCharSequence(Notification.EXTRA_TEXT, ""));
        }
        Notification summary = new NotificationCompat.Builder(context, PrayerNotificationRenderer.CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_wasla).setColor(latest.color)
            .setContentTitle(latest.extras.getCharSequence(Notification.EXTRA_TITLE, "Wasla"))
            .setContentText(latest.extras.getCharSequence(Notification.EXTRA_TEXT, count))
            .setLargeIcon(latest.getLargeIcon()).setStyle(style).setNumber(children.size())
            .setGroup(KEY).setGroupSummary(true)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setOnlyAlertOnce(true).setWhen(latest.when).setShowWhen(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setDeleteIntent(deleteIntent(context, SUMMARY_TAG))
            // No content intent: the native group header expands the children;
            // individual child content intents still open their exact prayers.
            .build();
        manager.notify(SUMMARY_TAG, SUMMARY_ID, summary);
        hasSummary = true;
    }
}
