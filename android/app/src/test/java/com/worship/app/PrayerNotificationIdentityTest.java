package com.worship.app;

import org.junit.Test;
import java.util.HashMap;
import java.util.Map;
import static org.junit.Assert.*;

public class PrayerNotificationIdentityTest {
    @Test public void anonymousShareNeverUsesSenderName() {
        Map<String, String> data = new HashMap<>();
        data.put("type", "PRAY_SHARED"); data.put("isAnonymous", "true");
        data.put("title", "Private Sender"); data.put("avatarUrl", "https://example.com/private.jpg");
        assertTrue(PrayerNotificationIdentity.isAnonymous(data));
        assertEquals("anonymously user", PrayerNotificationIdentity.title(data));
    }

    @Test public void repliesUseResponderIdentity() {
        Map<String, String> data = new HashMap<>();
        data.put("type", "PRAY_CONFIRMED"); data.put("isAnonymous", "true"); data.put("title", "Paula");
        assertFalse(PrayerNotificationIdentity.isAnonymous(data));
        assertEquals("Paula", PrayerNotificationIdentity.title(data));
    }

    @Test public void initialsSupportArabicHandlesAndEmptyNames() {
        assertEquals("P", PrayerNotificationIdentity.initial(" paula "));
        assertEquals("Y", PrayerNotificationIdentity.initial("@youssef"));
        assertEquals("ي", PrayerNotificationIdentity.initial("يوسف"));
        assertEquals("?", PrayerNotificationIdentity.initial(" "));
        Map<String, String> data = new HashMap<>(); data.put("title", " ");
        assertEquals("A friend", PrayerNotificationIdentity.title(data));
    }
}
