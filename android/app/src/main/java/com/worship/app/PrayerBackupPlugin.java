package com.worship.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.work.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.TimeUnit;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** Credentials stay in Keystore-encrypted storage, never in WorkManager's input database. */
@CapacitorPlugin(name = "PrayerBackup")
public class PrayerBackupPlugin extends Plugin {
    @PluginMethod public void setOwner(PluginCall call) {
        try {
            java.io.File root = new java.io.File(getContext().getFilesDir(), "my_prays"); root.mkdirs();
            JSONObject value = new JSONObject().put("userId", call.getString("userId"));
            android.util.AtomicFile file = new android.util.AtomicFile(new java.io.File(root, "backup-prayers.json"));
            java.io.FileOutputStream stream = file.startWrite();
            try { stream.write(value.toString().getBytes(StandardCharsets.UTF_8)); file.finishWrite(stream); }
            catch (Exception e) { file.failWrite(stream); throw e; }
            call.resolve();
        } catch (Exception e) { call.reject("Could not prepare prayer backup data", e); }
    }
    static final String WORK = "wasla.prayer.backup", MANUAL = WORK + ".manual";
    static final long DAY = 86400000L;
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(WORK, Context.MODE_PRIVATE); }
    static synchronized javax.crypto.SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (!ks.containsAlias(WORK)) {
            KeyGenerator gen = KeyGenerator.getInstance("AES", "AndroidKeyStore");
            gen.init(new KeyGenParameterSpec.Builder(WORK, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            gen.generateKey();
        }
        return (javax.crypto.SecretKey)ks.getKey(WORK, null);
    }
    static String encrypt(String token) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, key());
        return Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(c.doFinal(token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
    }
    static String token(Context context) throws Exception {
        String[] parts = prefs(context).getString("credential", "").split(":");
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(c.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }
    static String configKey(Context c) { return "config:" + prefs(c).getString("userId", ""); }
    static JSONObject config(Context c) throws Exception { return new JSONObject(prefs(c).getString(configKey(c), "{}")); }
    static long due(JSONObject cfg) { return Math.max(cfg.optLong("lastSuccess"), cfg.optLong("enabledAt")) + cfg.optInt("intervalDays") * DAY; }
    static void schedule(Context c, JSONObject cfg, boolean append) {
        if (cfg.optInt("intervalDays") == 0) return;
        OneTimeWorkRequest request = request(c, cfg, false, Math.max(0, due(cfg) - System.currentTimeMillis()));
        WorkManager.getInstance(c).enqueueUniqueWork(WORK, append ? ExistingWorkPolicy.APPEND_OR_REPLACE : ExistingWorkPolicy.KEEP, request);
    }
    static OneTimeWorkRequest request(Context c, JSONObject cfg, boolean manual, long delay) {
        return new OneTimeWorkRequest.Builder(PrayerBackupWorker.class)
            .setInputData(new Data.Builder().putString("userId", prefs(c).getString("userId", ""))
                .putString("email", cfg.optString("email")).putBoolean("manual", manual).build())
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(cfg.optBoolean("wifiOnly", true) ? NetworkType.UNMETERED : NetworkType.CONNECTED).setRequiresBatteryNotLow(true).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build();
    }
    @PluginMethod public void configure(PluginCall call) {
        try {
            String user = call.getString("userId", ""), token = call.getString("token", ""), api = call.getString("apiBase", "");
            int interval = call.getInt("intervalDays", 0);
            if (user.isEmpty() || token.isEmpty() || !api.startsWith("https://") || !(interval == 0 || interval == 7 || interval == 14 || interval == 30)) throw new Exception("Invalid backup settings");
            SharedPreferences p = prefs(getContext());
            String oldUser = p.getString("userId", "");
            JSONObject previous = new JSONObject(p.getString("config:" + user, "{}"));
            String email = call.getString("email", "");
            boolean changed = !user.equals(oldUser) || interval != previous.optInt("intervalDays") || !email.equals(previous.optString("email")) || call.getBoolean("wifiOnly", true) != previous.optBoolean("wifiOnly", true);
            JSONObject cfg = new JSONObject(previous.toString()).put("intervalDays", interval).put("email", email).put("wifiOnly", call.getBoolean("wifiOnly", true));
            if (previous.optInt("intervalDays") == 0 && interval != 0) cfg.put("enabledAt", System.currentTimeMillis());
            if (call.getDouble("lastSuccess", 0.0) > cfg.optLong("lastSuccess")) cfg.put("lastSuccess", call.getDouble("lastSuccess", 0.0).longValue());
            p.edit().putString("userId", user).putString("apiBase", api).putString("credential", encrypt(token)).putString("config:" + user, cfg.toString()).apply();
            if (changed) {
                WorkManager.getInstance(getContext()).cancelUniqueWork(WORK);
                WorkManager.getInstance(getContext()).cancelUniqueWork(MANUAL);
                p.edit().putString("state", "idle").apply();
            }
            schedule(getContext(), cfg, false);
            getStatus(call);
        } catch (Exception e) { call.reject("Could not save backup settings", e); }
    }
    @PluginMethod public void getStatus(PluginCall call) {
        try {
            SharedPreferences p = prefs(getContext()); JSONObject cfg = config(getContext());
            JSObject result = new JSObject(cfg.toString());
            result.put("state", p.getString("state", "idle")); result.put("progress", p.getInt("progress", 0)); result.put("error", p.getString("error", ""));
            result.put("nextBackupAt", cfg.optInt("intervalDays") == 0 ? 0 : due(cfg)); call.resolve(result);
        } catch (Exception e) { call.reject("Could not read backup settings", e); }
    }
    @PluginMethod public void runNow(PluginCall call) {
        try {
            if (prefs(getContext()).getString("userId", "").isEmpty()) throw new Exception("Sign in first");
            prefs(getContext()).edit().putString("state", "queued").putString("error", "").apply();
            WorkManager.getInstance(getContext()).enqueueUniqueWork(MANUAL, ExistingWorkPolicy.KEEP, request(getContext(), config(getContext()), true, 0));
            call.resolve();
        } catch (Exception e) { call.reject("Could not start backup", e); }
    }
    @PluginMethod public void suspend(PluginCall call) {
        WorkManager.getInstance(getContext()).cancelUniqueWork(WORK); WorkManager.getInstance(getContext()).cancelUniqueWork(MANUAL);
        prefs(getContext()).edit().remove("credential").remove("userId").putString("state", "idle").apply(); call.resolve();
    }
}
