package com.worship.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.app.NotificationManager;

public class MainActivity extends BridgeActivity {
    private static volatile boolean foreground;

    static boolean isForeground() {
        return foreground;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrayerNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        foreground = true;
        super.onResume();
        // Opening normally and returning from the background both clear delivered alerts.
        getSystemService(NotificationManager.class).cancelAll();
    }

    @Override
    public void onPause() {
        foreground = false;
        super.onPause();
    }
}
