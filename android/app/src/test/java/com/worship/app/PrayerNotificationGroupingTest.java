package com.worship.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.ComponentName;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
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
public class PrayerNotificationGroupingTest {
    private Context context;
    private NotificationManager manager;

    @Before public void setup() throws Exception {
        context = RuntimeEnvironment.getApplication();
        manager = context.getSystemService(NotificationManager.class);
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        PrayerNotificationRenderer.clear(context);
        assertFalse(context.getPackageManager().getReceiverInfo(
            new ComponentName(context, PrayerNotificationDismissReceiver.class), 0).exported);
    }

    private void post(String id, boolean reply, boolean anonymous, long timestamp) {
        Map<String, String> data = new HashMap<>();
        data.put("type", reply ? "PRAY_CONFIRMED" : "PRAY_SHARED");
        data.put("title", anonymous ? "Private identity" : "Friend " + id);
        data.put("body", reply ? "Replied to your prayer" : "Shared a prayer with you");
        data.put("shareId", id);
        data.put("isAnonymous", String.valueOf(anonymous));
        PrayerNotificationRenderer.show(context, data, "prayer:" + id, timestamp, null);
    }

    private Notification child(String id) {
        return Arrays.stream(manager.getActiveNotifications()).filter(item -> ("prayer:" + id).equals(item.getTag()))
            .findFirst().orElseThrow().getNotification();
    }

    private Notification summary() {
        return Arrays.stream(manager.getActiveNotifications())
            .filter(item -> PrayerNotificationGroup.SUMMARY_TAG.equals(item.getTag()))
            .findFirst().orElseThrow().getNotification();
    }

    private void swipe(String id) throws Exception {
        Notification notification = child(id);
        manager.cancel("prayer:" + id, PrayerNotificationRenderer.ID);
        deliverDeleteIntent(notification);
    }

    private void deliverDeleteIntent(Notification notification) {
        Intent intent = Shadows.shadowOf(notification.deleteIntent).getSavedIntent();
        assertEquals(PrayerNotificationDismissReceiver.class.getName(), intent.getComponent().getClassName());
        // Robolectric doesn't instantiate manifest receivers without intent filters.
        // Exercise the declared receiver with the actual immutable pending intent.
        new PrayerNotificationDismissReceiver().onReceive(context, intent);
    }

    @Test public void multiplePrayersAndRepliesHaveOneExpandableSummaryAndKeepIndividualTapTargets() {
        post("first", false, false, 1000);
        assertEquals(1, manager.getActiveNotifications().length);
        post("second", true, false, 2000);
        assertEquals(3, manager.getActiveNotifications().length);
        long summaries = Arrays.stream(manager.getActiveNotifications())
            .filter(item -> NotificationCompat.isGroupSummary(item.getNotification())).count();
        assertEquals(1, summaries);
        Notification summary = summary();
        assertEquals(2, summary.number);
        assertEquals("Friend second", summary.extras.getCharSequence(Notification.EXTRA_TITLE));
        assertEquals(PrayerNotificationGroup.KEY, summary.getGroup());
        assertEquals(NotificationCompat.GROUP_ALERT_CHILDREN, summary.getGroupAlertBehavior());
        assertNull(summary.contentIntent); // The native group header expands instead of opening an arbitrary prayer.
        for (String id : new String[] { "first", "second" }) {
            Notification child = child(id);
            assertEquals(PrayerNotificationGroup.KEY, child.getGroup());
            assertFalse(NotificationCompat.isGroupSummary(child));
            Intent tap = Shadows.shadowOf(child.contentIntent).getSavedIntent();
            assertEquals(id, tap.getStringExtra("shareId"));
            assertEquals(id.equals("second") ? "PRAY_CONFIRMED" : "PRAY_SHARED", tap.getStringExtra("type"));
        }
        assertTrue(child("second").getSortKey().compareTo(child("first").getSortKey()) < 0);
    }

    @Test public void avatarRefreshDoesNotIncrementCountOrReplaceTheNewestSender() {
        post("first", false, false, 1000);
        post("second", true, false, 2000);
        post("first", false, false, 1000);
        assertEquals(3, manager.getActiveNotifications().length);
        assertEquals(2, summary().number);
        assertEquals("Friend second", summary().extras.getCharSequence(Notification.EXTRA_TITLE));
    }

    @Test public void dismissalUpdatesTheCountAndRemovesTheSummaryAfterTheLastChild() throws Exception {
        post("first", false, false, 1000);
        post("second", false, false, 2000);
        swipe("second");
        assertEquals(1, summary().number);
        assertEquals("Friend first", summary().extras.getCharSequence(Notification.EXTRA_TITLE));
        assertNotNull(child("first").contentIntent);
        swipe("first");
        assertEquals(0, manager.getActiveNotifications().length);
        post("third", false, false, 3000);
        assertEquals(1, manager.getActiveNotifications().length);
    }

    @Test public void swipingTheGroupRemovesAllItsChildrenWithoutRemovingUnrelatedNotifications() throws Exception {
        post("first", false, false, 1000);
        post("second", true, false, 2000);
        manager.notify("other", 99, new NotificationCompat.Builder(context, PrayerNotificationRenderer.CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_wasla).setContentTitle("Other notification").build());
        deliverDeleteIntent(summary());
        assertEquals(1, manager.getActiveNotifications().length);
        assertEquals("other", manager.getActiveNotifications()[0].getTag());
    }

    @Test public void processRestartRestoresExistingChildrenInsteadOfResettingTheirCount() throws Exception {
        post("first", false, false, 1000);
        post("second", false, false, 2000);
        var field = PrayerNotificationGroup.class.getDeclaredField("children");
        field.setAccessible(true);
        field.set(null, null); // Only process memory is lost; delivered system notifications survive.
        post("third", true, false, 3000);
        assertEquals(3, summary().number);
        assertEquals(4, manager.getActiveNotifications().length);
    }

    @Test public void anonymousIdentityIsProtectedInTheSummaryAsWellAsTheChild() {
        post("first", true, false, 1000);
        post("anonymous", false, true, 2000);
        assertEquals("anonymously user", summary().extras.getCharSequence(Notification.EXTRA_TITLE));
        assertEquals("anonymously user", child("anonymous").extras.getCharSequence(Notification.EXTRA_TITLE));
        for (CharSequence line : summary().extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)) {
            assertFalse(line.toString().contains("Private identity"));
        }
    }
}
