package com.worship.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.os.Trace;

public class MainActivity extends BridgeActivity {
    private static volatile boolean foreground;
    private LaunchCover launchCover;

    static boolean isForeground() {
        return foreground;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        androidx.core.splashscreen.SplashScreen.installSplashScreen(this);
        registerPlugin(LaunchScreenPlugin.class);
        registerPlugin(PrayerNotificationsPlugin.class);
        registerPlugin(PrayerBackupPlugin.class);
        registerPlugin(PrayerStoragePlugin.class);
        Trace.beginSection("Wasla.createBridgeActivity");
        try {
            super.onCreate(savedInstanceState);
        } finally {
            Trace.endSection();
        }
        if (bridge == null) return;
        launchCover = new LaunchCover(this);
        addContentView(launchCover, new android.view.ViewGroup.LayoutParams(-1, -1));
        // Older OTA bundles and failed WebView loads must still expose their recovery UI.
        launchCover.postDelayed(this::dismissLaunchCover, 10000);
    }

    void dismissLaunchCover() {
        if (launchCover == null) return;
        ((android.view.ViewGroup) launchCover.getParent()).removeView(launchCover);
        launchCover = null;
    }

    @Override
    public void onResume() {
        foreground = true;
        super.onResume();
        // Opening normally and returning from the background both clear delivered alerts.
        Trace.beginSection("Wasla.clearDeliveredNotifications");
        try {
            PrayerNotificationRenderer.clear(this);
        } finally {
            Trace.endSection();
        }
    }

    @Override
    public void onPause() {
        foreground = false;
        super.onPause();
    }
}
