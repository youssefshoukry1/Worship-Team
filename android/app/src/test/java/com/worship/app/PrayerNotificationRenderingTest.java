package com.worship.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.BitmapDrawable;
import android.Manifest;
import androidx.core.app.NotificationCompat;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Robolectric;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.ProtocolException;
import java.net.URL;
import java.net.URLConnection;
import java.net.URLStreamHandler;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class PrayerNotificationRenderingTest {
    private Context context;

    @Before public void setup() {
        context = RuntimeEnvironment.getApplication();
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
    }

    private Map<String, String> data(boolean anonymous) {
        Map<String, String> data = new HashMap<>();
        data.put("type", "PRAY_SHARED"); data.put("title", "Paula");
        data.put("body", "Shared a prayer with you"); data.put("shareId", "test-share");
        data.put("isAnonymous", String.valueOf(anonymous));
        return data;
    }

    private Bitmap photo() {
        Bitmap bitmap = Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888);
        bitmap.eraseColor(Color.RED);
        return bitmap;
    }

    // Skip WebView setup while exercising MainActivity's actual lifecycle behavior.
    public static class NativeLifecycleActivity extends MainActivity {
        @Override protected void load() { }
    }

    @Test public void normalLaunchAndForegroundReturnClearDeliveredNotifications() {
        var activity = Robolectric.buildActivity(NativeLifecycleActivity.class).create().start();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        PrayerNotificationRenderer.show(context, data(false), "before-launch", 1234, photo());
        assertEquals(1, manager.getActiveNotifications().length);
        activity.resume();
        assertEquals(0, manager.getActiveNotifications().length);
        PrayerNotificationRenderer.show(context, data(false), "late-photo-update", 1234, photo());
        assertEquals(0, manager.getActiveNotifications().length);
        activity.pause().stop();
        PrayerNotificationRenderer.show(context, data(false), "while-backgrounded", 1234, photo());
        assertEquals(1, manager.getActiveNotifications().length);
        activity.restart().start().resume();
        assertEquals(0, manager.getActiveNotifications().length);
        activity.pause().stop().destroy();
    }

    @Test public void photoAndShortcutAreAttachedForCollapsedAndExpandedNotification() {
        PrayerNotificationRenderer.show(context, data(false), "test-photo", 1234, photo());
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        Notification notification = manager.getActiveNotifications()[0].getNotification();
        assertEquals("prayer-test-photo", notification.getShortcutId());
        ShortcutManager shortcuts = context.getSystemService(ShortcutManager.class);
        ShortcutInfo shortcut = shortcuts.getDynamicShortcuts().stream()
            .filter(item -> item.getId().equals(notification.getShortcutId())).findFirst().orElseThrow();
        assertEquals("Paula", shortcut.getShortLabel());
        assertEquals("test-share", shortcut.getIntent().getStringExtra("shareId"));
        NotificationCompat.MessagingStyle style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(notification);
        Bitmap avatar = ((BitmapDrawable) style.getMessages().get(0).getPerson().getIcon().loadDrawable(context)).getBitmap();
        assertEquals(Color.RED, avatar.getPixel(64, 64));
        assertEquals(Color.RED, avatar.getPixel(100, 100)); // no baked-in second app badge
    }

    @Test public void anonymousNotificationIgnoresRealPhotoAndNameEverywhere() {
        PrayerNotificationRenderer.show(context, data(true), "test-anon", 1234, photo());
        Notification notification = context.getSystemService(NotificationManager.class).getActiveNotifications()[0].getNotification();
        NotificationCompat.MessagingStyle style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(notification);
        assertEquals("anonymously user", style.getMessages().get(0).getPerson().getName());
        Bitmap avatar = ((BitmapDrawable) style.getMessages().get(0).getPerson().getIcon().loadDrawable(context)).getBitmap();
        assertTrue(avatar.sameAs(PrayerNotificationRenderer.avatar(context, "anonymously user", true, null)));
        assertFalse(avatar.sameAs(PrayerNotificationRenderer.avatar(context, "Paula", false, photo())));
        assertEquals("anonymously user", context.getSystemService(ShortcutManager.class).getDynamicShortcuts().get(0).getShortLabel());
    }

    @Test public void cachedProfilePhotoIsReadyWithoutNetwork() throws Exception {
        String url = "https://example.test/avatar-test.png";
        PrayerAvatarLoader.store(context, url, photo());
        assertEquals(Color.RED, PrayerAvatarLoader.load(context, url, 1).getPixel(16, 16));
    }

    @Test public void redirectsAndServerSupportedPhotoSizesAreAccepted() throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); photo().compress(Bitmap.CompressFormat.PNG, 100, output);
        byte[] image = Arrays.copyOf(output.toByteArray(), 3 * 1024 * 1024);
        URL url = fakeUrl(image, "/image");
        byte[] downloaded = PrayerAvatarLoader.download(url, 5000);
        assertEquals(image.length, downloaded.length);
        assertNotNull(PrayerAvatarLoader.decode(downloaded));
    }

    @Test public void redirectsCannotDowngradeToHttpAndOversizedImagesAreRejected() throws Exception {
        try { PrayerAvatarLoader.download(fakeUrl(new byte[0], "http://example.test/image"), 1000); fail(); }
        catch (ProtocolException expected) { }
        try { PrayerAvatarLoader.download(fakeUrl(new byte[PrayerAvatarLoader.MAX_BYTES + 1], "/image"), 1000); fail(); }
        catch (ProtocolException expected) { }
    }

    private URL fakeUrl(byte[] bytes, String redirect) throws Exception {
        return new URL(null, "https://example.test/start", new URLStreamHandler() {
            @Override protected URLConnection openConnection(URL url) throws IOException {
                return new HttpURLConnection(url) {
                    @Override public int getResponseCode() { return url.getPath().equals("/start") ? 302 : 200; }
                    @Override public String getHeaderField(String name) { return name.equals("Location") ? redirect : null; }
                    @Override public long getContentLengthLong() { return bytes.length; }
                    @Override public InputStream getInputStream() { return new ByteArrayInputStream(bytes); }
                    @Override public void disconnect() { }
                    @Override public boolean usingProxy() { return false; }
                    @Override public void connect() { }
                };
            }
        });
    }
}
