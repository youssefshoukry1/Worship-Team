package com.worship.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrayerNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
