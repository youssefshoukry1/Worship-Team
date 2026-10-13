package com.worship.app;

import java.text.BreakIterator;
import java.util.Locale;
import java.util.Map;

final class PrayerNotificationIdentity {
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
