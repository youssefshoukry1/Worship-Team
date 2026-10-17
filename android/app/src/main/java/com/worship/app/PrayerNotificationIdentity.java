package com.worship.app;

import java.text.BreakIterator;
import java.util.Locale;
import java.util.Map;

final class PrayerNotificationIdentity {
    static boolean isFriendActivity(String type) {
        return "FRIEND_REQUEST_RECEIVED".equals(type) || "FRIEND_REQUEST_ACCEPTED".equals(type);
    }

    static boolean supports(String type) {
        return isFriendActivity(type) || "PRAY_SHARED".equals(type) || "PRAY_CONFIRMED".equals(type);
    }

    static String destination(Map<String, String> data) {
        return isFriendActivity(data.get("type")) ? "/friends" : "/pray";
    }

    static String notificationTag(Map<String, String> data, String fallback) {
        boolean friend = isFriendActivity(data.get("type"));
        return (friend ? "friend:" : "prayer:") + data.get("type") + ":"
            + data.getOrDefault(friend ? "actorId" : "shareId", fallback);
    }

    static boolean isAnonymous(Map<String, String> data) {
        return "PRAY_SHARED".equals(data.get("type")) && Boolean.parseBoolean(data.get("isAnonymous"));
    }

    static String title(Map<String, String> data) {
        if (isAnonymous(data)) return "anonymously user";
        String name = data.getOrDefault("title", "A friend").trim();
        return name.isEmpty() ? "A friend" : name;
    }

    static String initial(String name) {
        String value = name.trim().replaceFirst("^@+", "");
        if (value.isEmpty()) return "?";
        BreakIterator iterator = BreakIterator.getCharacterInstance(Locale.ROOT);
        iterator.setText(value);
        return value.substring(0, iterator.next()).toUpperCase(Locale.ROOT);
    }
}
