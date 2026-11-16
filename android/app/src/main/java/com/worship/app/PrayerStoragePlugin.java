package com.worship.app;

import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

@CapacitorPlugin(name = "PrayerStorage")
public class PrayerStoragePlugin extends Plugin {
    private final ExecutorService queue = Executors.newSingleThreadExecutor();
    private File root() { return new File(getContext().getFilesDir(), "my_prays"); }
    private void resolve(PluginCall call, PrayerIndexStorage.Snapshot value) {
        JSObject result = new JSObject();
        result.put("data", value.data == null ? JSONObject.NULL : value.data);
        result.put("fingerprint", value.fingerprint); call.resolve(result);
    }
    @PluginMethod public void readIndex(PluginCall call) {
        queue.execute(() -> {
            try { resolve(call, PrayerIndexStorage.read(root())); }
            catch (Exception e) { call.reject("Could not read saved prayers", "PRAYER_STORAGE_READ", e); }
        });
    }
    @PluginMethod public void writeIndex(PluginCall call) {
        queue.execute(() -> {
            try { resolve(call, PrayerIndexStorage.write(root(), call.getString("expectedFingerprint"), call.getString("data"))); }
            catch (PrayerIndexStorage.Conflict e) { call.reject(e.getMessage(), "PRAYER_STORAGE_CONFLICT", e); }
            catch (Exception e) { call.reject("Could not commit saved prayers", "PRAYER_STORAGE_WRITE", e); }
        });
    }
    @Override protected void handleOnDestroy() { queue.shutdown(); super.handleOnDestroy(); }
}
