package com.worship.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    private static volatile boolean foreground;

    static boolean isForeground() {
        return foreground;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrayerNotificationsPlugin.class);
        registerPlugin(PrayerBackupPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        foreground = true;
        super.onResume();
        // Opening normally and returning from the background both clear delivered alerts.
        PrayerNotificationRenderer.clear(this);
    }

    @Override
    public void onPause() {
        foreground = false;
        super.onPause();
    }
}
