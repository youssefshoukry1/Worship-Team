package com.worship.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Native capability marker: old APKs must continue receiving ordinary FCM alerts. */
@CapacitorPlugin(name = "PrayerNotifications")
public class PrayerNotificationsPlugin extends Plugin {
    @PluginMethod public void getCapabilities(PluginCall call) {
        call.resolve(new JSObject().put("friendAvatar", true).put("testimonyAvatar", true));
    }
}
