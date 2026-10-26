package com.worship.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ShortcutManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.BitmapDrawable;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.RemoteMessage;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class TestimonyNotificationTest {
    private static final String NOTE = "aaaaaaaaaaaaaaaaaaaaaaaa";
    private static final String OTHER_NOTE = "bbbbbbbbbbbbbbbbbbbbbbbb";
    private Context context;
    private NotificationManager manager;

    @Before public void setup() {
        context = RuntimeEnvironment.getApplication();
        manager = context.getSystemService(NotificationManager.class);
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        PrayerNotificationRenderer.clear(context);
    }

    private Map<String, String> data(String note, String actor) {
        Map<String, String> data = new HashMap<>();
        data.put("notificationStyle", "avatar-v1"); data.put("type", "TESTIMONY_LOVED");
        data.put("testimonyId", note); data.put("actorId", actor);
        data.put("title", "Youssef"); data.put("body", "Loved your note");
        return data;
    }

    @Test public void serviceUsesThePrayerRendererWithPhotoAppIconConversationShortcutAndExactNoteTap() throws Exception {
        Bitmap photo = Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888);
        photo.eraseColor(Color.RED);
        String url = "https://example.test/note-reactor.jpg";
        PrayerAvatarLoader.store(context, url, photo);
        Map<String, String> data = data(NOTE, "youssef"); data.put("avatarUrl", url);
        var service = Robolectric.buildService(PrayerMessagingService.class).create().get();
        service.onMessageReceived(new RemoteMessage.Builder("device").setMessageId("love").setData(data).build());
        assertEquals(1, manager.getActiveNotifications().length);
        Notification notification = manager.getActiveNotifications()[0].getNotification();
        assertEquals(R.drawable.ic_stat_wasla, notification.getSmallIcon().getResId());
        assertEquals(PrayerNotificationGroup.KEY, notification.getGroup());
        assertEquals("Youssef", notification.extras.getCharSequence(Notification.EXTRA_TITLE));
        assertEquals("Loved your note", notification.extras.getCharSequence(Notification.EXTRA_TEXT));
        var style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(notification);
        assertNotNull(style);
        assertEquals("Youssef", style.getMessages().get(0).getPerson().getName());
        Bitmap avatar = ((BitmapDrawable) style.getMessages().get(0).getPerson().getIcon().loadDrawable(context)).getBitmap();
        assertEquals(Color.RED, avatar.getPixel(64, 64));
        assertTrue(context.getSystemService(ShortcutManager.class).getDynamicShortcuts().stream()
            .anyMatch(shortcut -> shortcut.getId().equals(notification.getShortcutId())));
        Intent tap = Shadows.shadowOf(notification.contentIntent).getSavedIntent();
        assertEquals("/normal_UserProfile/?note=" + NOTE, tap.getStringExtra("url"));
        assertEquals(NOTE, tap.getStringExtra("testimonyId"));
        assertEquals("youssef", tap.getStringExtra("actorId"));
        assertEquals("TESTIMONY_LOVED", tap.getStringExtra("type"));
    }

    @Test public void reactionsAndPrayersShareOneSummaryWithoutReplacingOtherFriendsOrNotes() {
        Map<String, String> first = data(NOTE, "youssef"), second = data(NOTE, "mary"), third = data(OTHER_NOTE, "youssef");
        long timestamp = 1000;
        for (Map<String, String> item : Arrays.asList(first, second, third)) {
            PrayerNotificationRenderer.show(context, item, PrayerNotificationIdentity.notificationTag(item, "fallback"), timestamp++, null);
        }
        Map<String, String> prayer = new HashMap<>();
        prayer.put("type", "PRAY_SHARED"); prayer.put("shareId", "prayer"); prayer.put("title", "Friend");
        PrayerNotificationRenderer.show(context, prayer, "prayer:prayer", timestamp, null);
        assertEquals(5, manager.getActiveNotifications().length);
        assertEquals(1, Arrays.stream(manager.getActiveNotifications()).filter(item -> NotificationCompat.isGroupSummary(item.getNotification())).count());
        Notification summary = Arrays.stream(manager.getActiveNotifications()).filter(item -> NotificationCompat.isGroupSummary(item.getNotification()))
            .findFirst().orElseThrow().getNotification();
        assertEquals(4, summary.number);
        assertNull(summary.contentIntent);
        // A deferred avatar update replaces its own child rather than adding a duplicate.
        String tag = PrayerNotificationIdentity.notificationTag(first, "fallback");
        PrayerNotificationRenderer.show(context, first, tag, 1000, null);
        assertEquals(5, manager.getActiveNotifications().length);
        PrayerNotificationRenderer.dismiss(context, tag);
        assertEquals(4, manager.getActiveNotifications().length);
    }

    @Test public void invalidTargetsCannotRedirectAndOpeningTheAppClearsReactionsLikePrayers() {
        Map<String, String> invalid = data("https://outside.test/", "youssef");
        assertEquals("/normal_UserProfile/", PrayerNotificationIdentity.destination(invalid));
        var activity = Robolectric.buildActivity(PrayerNotificationRenderingTest.NativeLifecycleActivity.class).create().start();
        Map<String, String> item = data(NOTE, "youssef");
        PrayerNotificationRenderer.show(context, item, PrayerNotificationIdentity.notificationTag(item, "id"), 1000, null);
        assertEquals(1, manager.getActiveNotifications().length);
        activity.resume();
        assertEquals(0, manager.getActiveNotifications().length);
        activity.pause().stop().destroy();
    }
}
