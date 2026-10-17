package com.worship.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
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
public class FriendNotificationTest {
    private Context context;
    private NotificationManager manager;
    @Before public void setup() {
        context = RuntimeEnvironment.getApplication();
        manager = context.getSystemService(NotificationManager.class);
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        PrayerNotificationRenderer.clear(context);
    }

    private Map<String, String> data(String type, String actor) {
        Map<String, String> data = new HashMap<>();
        data.put("notificationStyle", "avatar-v1"); data.put("type", type);
        data.put("actorId", actor); data.put("title", "Alice"); data.put("body", "Friend activity");
        return data;
    }

    @Test public void firebaseServiceRendersFriendRequestsAndAcceptancesInOneGroupWithCorrectTapData() {
        var service = Robolectric.buildService(PrayerMessagingService.class).create().get();
        for (String type : new String[] { "FRIEND_REQUEST_RECEIVED", "FRIEND_REQUEST_ACCEPTED" }) {
            service.onMessageReceived(new RemoteMessage.Builder("device").setMessageId(type).setData(data(type, "alice")).build());
        }
        assertEquals(3, manager.getActiveNotifications().length);
        for (var active : manager.getActiveNotifications()) {
            Notification notification = active.getNotification();
            assertEquals(PrayerNotificationGroup.KEY, notification.getGroup());
            if (NotificationCompat.isGroupSummary(notification)) {
                assertEquals(2, notification.number);
            } else {
                Intent intent = Shadows.shadowOf(notification.contentIntent).getSavedIntent();
                assertEquals("/friends", intent.getStringExtra("url"));
                assertEquals("alice", intent.getStringExtra("actorId"));
                assertTrue(PrayerNotificationIdentity.isFriendActivity(intent.getStringExtra("type")));
                assertNotNull(notification.getLargeIcon());
            }
        }
    }

    @Test public void friendAndPrayerNotificationsShareOneSummaryAndClearOnNormalAppOpen() {
        var controller = Robolectric.buildActivity(PrayerNotificationRenderingTest.NativeLifecycleActivity.class).create().start();
        Map<String, String> prayer = data("PRAY_SHARED", "alice"); prayer.put("shareId", "prayer");
        PrayerNotificationRenderer.show(context, prayer, "prayer:1", 1000, null);
        PrayerNotificationRenderer.show(context, data("FRIEND_REQUEST_RECEIVED", "bob"), "friend:1", 2000, null);
        assertEquals(3, manager.getActiveNotifications().length);
        assertEquals(1, Arrays.stream(manager.getActiveNotifications()).filter(n -> NotificationCompat.isGroupSummary(n.getNotification())).count());
        controller.resume(); assertEquals(0, manager.getActiveNotifications().length);
        controller.pause().stop().destroy();
    }

    @Test public void friendIdentityDoesNotUsePrayerAnonymityOrCollideWithAnotherActor() {
        Map<String, String> first = data("FRIEND_REQUEST_RECEIVED", "alice"); first.put("isAnonymous", "true");
        assertFalse(PrayerNotificationIdentity.isAnonymous(first));
        assertEquals("Alice", PrayerNotificationIdentity.title(first));
        assertNotEquals(PrayerNotificationIdentity.notificationTag(first, "id"),
            PrayerNotificationIdentity.notificationTag(data("FRIEND_REQUEST_RECEIVED", "bob"), "id"));
        assertFalse(PrayerNotificationIdentity.supports("OTHER"));
    }
}
