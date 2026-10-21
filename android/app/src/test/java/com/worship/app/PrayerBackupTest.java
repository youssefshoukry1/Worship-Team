package com.worship.app;

import android.Manifest;
import android.app.*;
import android.content.Context;
import androidx.core.app.NotificationCompat;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.zip.*;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class PrayerBackupTest {
    private Context context; private File root, zip;
    @Before public void setup() throws Exception {
        context = RuntimeEnvironment.getApplication();
        root = Files.createTempDirectory("prayer-archive-test").toFile(); zip = new File(root, "backup.zip");
        write("backup-prayers.json", "{\"userId\":\"alice\",\"prayers\":[{\"_id\":\"p1\",\"words\":\"صلاة\",\"prayType\":\"general\"}]}");
    }
    private void write(String name, String value) throws Exception { File file = new File(root, name); file.getParentFile().mkdirs(); Files.write(file.toPath(), value.getBytes(StandardCharsets.UTF_8)); }
    @Test public void archiveRestoresPrayerTextMetadataAndExactRecordingBytes() throws Exception {
        write("index.json", "{\"guestPrays\":[{\"_id\":\"p1\",\"words\":\"صلاة\"}],\"recordings\":{\"p1\":[{\"id\":\"clip\",\"ext\":\"m4a\",\"duration\":8}],\"orphan\":[{\"id\":\"other\",\"ext\":\"ogg\"}]},\"pendingWords\":{\"orphan\":\"draft words\"}}");
        write("audio/clip.m4a", "actual-audio-bytes"); write("audio/other.ogg", "orphan-audio");
        PrayerBackupArchive.build(root, zip, "alice", percent -> assertTrue(percent >= 5 && percent <= 40));
        try (ZipFile archive = new ZipFile(zip)) {
            JSONObject manifest = new JSONObject(new String(archive.getInputStream(archive.getEntry("prays.json")).readAllBytes(), StandardCharsets.UTF_8));
            assertEquals("my-prays-backup", manifest.getString("type")); assertEquals(1, manifest.getInt("version"));
            JSONObject prayer = manifest.getJSONArray("prays").getJSONObject(0);
            assertEquals("صلاة", prayer.getString("words"));
            assertEquals("audio/p1/clip.m4a", prayer.getJSONArray("recordings").getJSONObject(0).getString("file"));
            assertEquals("actual-audio-bytes", new String(archive.getInputStream(archive.getEntry("audio/p1/clip.m4a")).readAllBytes(), StandardCharsets.UTF_8));
            assertEquals("draft words", manifest.getJSONArray("otherRecordings").getJSONObject(0).getString("pendingWords"));
        }
    }
    @Test public void wrongOwnerMissingAudioCorruptDataAndTraversalFailBeforeUpload() throws Exception {
        assertThrows(IOException.class, () -> PrayerBackupArchive.build(root, zip, "bob", p -> {}));
        write("index.json", "{\"recordings\":{\"p1\":[{\"id\":\"missing\",\"ext\":\"m4a\"}]}}");
        assertThrows(IOException.class, () -> PrayerBackupArchive.build(root, zip, "alice", p -> {}));
        write("index.json", "{\"recordings\":{\"../private\":[{\"id\":\"clip\",\"ext\":\"m4a\"}]}}");
        assertThrows(IOException.class, () -> PrayerBackupArchive.build(root, zip, "alice", p -> {}));
        write("index.json", "not valid json");
        assertThrows(JSONException.class, () -> PrayerBackupArchive.build(root, zip, "alice", p -> {}));
    }
    @Test public void backupNotificationIsSilentShowsRealProgressAndSurvivesAppOpenClearing() {
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        Notification notification = PrayerBackupWorker.notification(context, 67);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        assertNull(manager.getNotificationChannel(PrayerBackupWorker.CHANNEL).getSound());
        assertFalse(manager.getNotificationChannel(PrayerBackupWorker.CHANNEL).shouldVibrate());
        assertFalse(manager.getNotificationChannel(PrayerBackupWorker.CHANNEL).canShowBadge());
        assertEquals(67, notification.extras.getInt(Notification.EXTRA_PROGRESS));
        assertEquals(0, notification.defaults & (Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE));
        manager.notify(PrayerBackupWorker.NOTIFICATION_ID, notification);
        manager.notify("prayer:one", 1, new NotificationCompat.Builder(context, PrayerBackupWorker.CHANNEL).setSmallIcon(R.drawable.ic_stat_wasla).build());
        PrayerNotificationGroup.clear(context);
        assertEquals(1, manager.getActiveNotifications().length);
        assertEquals(PrayerBackupWorker.NOTIFICATION_ID, manager.getActiveNotifications()[0].getId());
        manager.cancelAll();
    }
    @Test public void nextBackupUsesSuccessfulUploadOrEnableDateAndRespectsChosenInterval() throws Exception {
        for (int interval : new int[]{7, 14, 30}) {
            JSONObject cfg = new JSONObject().put("intervalDays", interval).put("enabledAt", 1000).put("lastSuccess", 500);
            assertEquals(1000 + interval * PrayerBackupPlugin.DAY, PrayerBackupPlugin.due(cfg));
            cfg.put("lastSuccess", 5000);
            assertEquals(5000 + interval * PrayerBackupPlugin.DAY, PrayerBackupPlugin.due(cfg));
        }
    }
    @Test public void expandedBackupNotificationShowsStageAndPercentageAboveProgressBar() {
        for (int percent : new int[]{0, 5, 40, 45, 67, 99}) {
            Notification notification = PrayerBackupWorker.notification(context, percent);
            String detail = (percent < 45 ? "Preparing backup" : "Uploading backup") + " (" + percent + "%)";
            assertEquals("Backup in progress", notification.extras.getCharSequence(Notification.EXTRA_TITLE));
            assertEquals(detail, notification.extras.getCharSequence(Notification.EXTRA_TEXT));
            assertEquals(detail, notification.extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
            assertEquals("android.app.Notification$BigTextStyle", notification.extras.getString(Notification.EXTRA_TEMPLATE));
            assertEquals(percent, notification.extras.getInt(Notification.EXTRA_PROGRESS));
            assertEquals(100, notification.extras.getInt(Notification.EXTRA_PROGRESS_MAX));
            assertFalse(notification.extras.getBoolean(Notification.EXTRA_PROGRESS_INDETERMINATE));
        }
    }
}
