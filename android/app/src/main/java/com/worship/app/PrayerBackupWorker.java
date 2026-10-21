package com.worship.app;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.locks.ReentrantLock;

public final class PrayerBackupWorker extends Worker {
    static final String CHANNEL = "prayer_backup_progress";
    static final int NOTIFICATION_ID = 8301;
    private static final ReentrantLock LOCK = new ReentrantLock();
    private final Context context;
    private int lastProgress = -1;
    public PrayerBackupWorker(@NonNull Context c, @NonNull WorkerParameters params) { super(c, params); context = c; }
    private void check() throws IOException {
        if (isStopped() || !getInputData().getString("userId").equals(PrayerBackupPlugin.prefs(context).getString("userId", ""))) throw new IOException("Backup cancelled");
    }
    static Notification notification(Context context, int progress) {
        int percent = Math.max(0, Math.min(100, progress));
        String detail = (percent < 45 ? "Preparing backup" : "Uploading backup") + " (" + percent + "%)";
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Prayer backup", NotificationManager.IMPORTANCE_LOW);
            channel.setSound(null, null); channel.enableVibration(false); channel.setShowBadge(false); nm.createNotificationChannel(channel);
        }
        return new NotificationCompat.Builder(context, CHANNEL).setSmallIcon(R.drawable.ic_stat_wasla)
            .setContentTitle("Backup in progress").setContentText(detail)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(detail))
            .setProgress(100, percent, false).setOngoing(true).setSilent(true).setOnlyAlertOnce(true).setShowWhen(false).build();
    }
    private void progress(int value) throws Exception {
        check(); if (value == lastProgress) return; lastProgress = value;
        PrayerBackupPlugin.prefs(context).edit().putString("state", "running").putInt("progress", value).putString("error", "").apply();
        context.getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, notification(context, value));
    }
    @NonNull @Override public Result doWork() {
        if (!LOCK.tryLock()) return Result.retry();
        File zip = new File(context.getCacheDir(), "prayer-backup.zip");
        try {
            check(); JSONObject cfg = PrayerBackupPlugin.config(context);
            if (!cfg.optString("email").equals(getInputData().getString("email"))) return Result.success();
            boolean manual = getInputData().getBoolean("manual", false);
            if (!manual && (cfg.optInt("intervalDays") == 0 || PrayerBackupPlugin.due(cfg) > System.currentTimeMillis() + 1000)) {
                PrayerBackupPlugin.schedule(context, cfg, true); return Result.success();
            }
            ForegroundInfo info = Build.VERSION.SDK_INT >= 29 ? new ForegroundInfo(NOTIFICATION_ID, notification(context, 0), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) : new ForegroundInfo(NOTIFICATION_ID, notification(context, 0));
            setForegroundAsync(info).get(); progress(0);
            String api = PrayerBackupPlugin.prefs(context).getString("apiBase", "");
            JSONObject auth = json("GET", api + "/backup/drive-token?email=" + enc(cfg.optString("email")), PrayerBackupPlugin.token(context), null);
            String access = auth.getString("access_token"); progress(5);
            PrayerBackupArchive.build(new File(context.getFilesDir(), "my_prays"), zip, getInputData().getString("userId"), this::progress);
            progress(40);
            JSONObject folder = find(access, "name='my-prays-backups' and mimeType='application/vnd.google-apps.folder' and trashed=false");
            if (folder == null) folder = json("POST", "https://www.googleapis.com/drive/v3/files?fields=id", access, new JSONObject().put("name", "my-prays-backups").put("mimeType", "application/vnd.google-apps.folder"));
            JSONObject existing = find(access, "name='my prays.zip' and '" + folder.getString("id") + "' in parents and trashed=false");
            JSONObject metadata = new JSONObject().put("name", "my prays.zip"); if (existing == null) metadata.put("parents", new JSONArray().put(folder.getString("id")));
            String url = "https://www.googleapis.com/upload/drive/v3/files" + (existing == null ? "" : "/" + existing.getString("id")) + "?uploadType=resumable";
            HttpURLConnection session = connection(url, existing == null ? "POST" : "PATCH", access);
            session.setRequestProperty("X-Upload-Content-Type", "application/zip"); session.setRequestProperty("X-Upload-Content-Length", String.valueOf(zip.length()));
            sendJson(session, metadata); ensureSuccess(session);
            String location = session.getHeaderField("Location"); session.disconnect();
            URL uploadUrl = new URL(location);
            if (!uploadUrl.getProtocol().equals("https") || !uploadUrl.getHost().endsWith(".googleapis.com")) throw new IOException("Invalid Google Drive upload URL");
            progress(45); HttpURLConnection upload = connection(location, "PUT", null);
            upload.setRequestProperty("Content-Type", "application/zip"); upload.setDoOutput(true); upload.setFixedLengthStreamingMode(zip.length());
            try (InputStream in = new FileInputStream(zip); OutputStream out = upload.getOutputStream()) {
                byte[] buffer = new byte[65536]; int count; long sent = 0;
                while ((count = in.read(buffer)) != -1) { check(); out.write(buffer, 0, count); sent += count; progress(45 + (int)(54 * sent / Math.max(1, zip.length()))); }
            }
            ensureSuccess(upload); upload.disconnect(); check();
            cfg.put("lastSuccess", System.currentTimeMillis());
            PrayerBackupPlugin.prefs(context).edit().putString(PrayerBackupPlugin.configKey(context), cfg.toString()).putString("state", "complete").putInt("progress", 100).apply();
            if (manual) WorkManager.getInstance(context).cancelUniqueWork(PrayerBackupPlugin.WORK);
            PrayerBackupPlugin.schedule(context, cfg, !manual); return Result.success();
        } catch (Exception e) {
            if (!isStopped()) PrayerBackupPlugin.prefs(context).edit().putString("state", "error").putString("error", e.getMessage() == null ? "Backup failed. Open backup settings to try again." : e.getMessage()).apply();
            // Retry transient failures with bounded backoff. Authentication/storage errors need user action.
            if (!isStopped() && e instanceof IOException && !(e instanceof PermanentFailure) && getRunAttemptCount() < 4) return Result.retry();
            return Result.failure();
        } finally {
            zip.delete(); context.getSystemService(NotificationManager.class).cancel(NOTIFICATION_ID); LOCK.unlock();
        }
    }
    private static String enc(String value) throws Exception { return URLEncoder.encode(value, "UTF-8"); }
    static class PermanentFailure extends IOException { PermanentFailure(String s) { super(s); } }
    private static HttpURLConnection connection(String url, String method, String bearer) throws Exception {
        HttpURLConnection c = (HttpURLConnection)new URL(url).openConnection(); c.setRequestMethod(method); c.setConnectTimeout(30000); c.setReadTimeout(60000); c.setInstanceFollowRedirects(false);
        if (bearer != null) c.setRequestProperty("Authorization", "Bearer " + bearer); return c;
    }
    private static void sendJson(HttpURLConnection c, JSONObject body) throws Exception {
        c.setDoOutput(true); c.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        try (OutputStream out = c.getOutputStream()) { out.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
    }
    private static void ensureSuccess(HttpURLConnection c) throws Exception {
        int status = c.getResponseCode(); if (status >= 200 && status < 300) return;
        if (status == 401 || status == 404) throw new PermanentFailure("Reconnect your Google Drive account in backup settings.");
        if (status == 403) throw new PermanentFailure("Google Drive denied the backup. Check account permissions and available storage.");
        throw new IOException("Backup connection failed (" + status + "). Please try again.");
    }
    private static JSONObject json(String method, String url, String bearer, JSONObject body) throws Exception {
        HttpURLConnection c = connection(url, method, bearer);
        try { if (body != null) sendJson(c, body); ensureSuccess(c);
            try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192]; int count; while ((count = in.read(buffer)) != -1) { if (out.size() > 2097152) throw new IOException("Drive response is too large"); out.write(buffer, 0, count); }
                return new JSONObject(out.toString("UTF-8"));
            }
        } finally { c.disconnect(); }
    }
    private static JSONObject find(String bearer, String query) throws Exception {
        JSONArray files = json("GET", "https://www.googleapis.com/drive/v3/files?fields=files(id)&orderBy=modifiedTime%20desc&q=" + enc(query), bearer, null).getJSONArray("files");
        return files.length() == 0 ? null : files.getJSONObject(0);
    }
}
