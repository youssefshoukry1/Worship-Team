package com.worship.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class PrayerNotificationDismissReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String tag = intent.getStringExtra("tag");
        if (tag != null) PrayerNotificationRenderer.dismiss(context, tag);
    }
}
