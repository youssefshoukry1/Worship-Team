package com.worship.app;

import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.*;

/** Produces the same prays.json/audio ZIP schema as the existing restore flow. */
final class PrayerBackupArchive {
    interface Progress { void update(int percent) throws Exception; }
    static String part(String value) throws IOException {
        if (value.isEmpty() || value.equals(".") || value.equals("..") || value.contains("/") || value.contains("\\")) throw new IOException("Invalid recording path");
        return value;
    }
    static JSONObject read(File f) throws Exception {
        try (InputStream in = new FileInputStream(f); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int size;
            while ((size = in.read(buffer)) != -1) out.write(buffer, 0, size);
            return new JSONObject(out.toString("UTF-8"));
        }
    }
    static File build(File root, File output, String userId, Progress progress) throws Exception {
        JSONObject snapshot = read(new File(root, "backup-prayers.json"));
        if (!userId.equals(snapshot.optString("userId"))) throw new IOException("Open your prayer page before backing up this account");
        JSONObject index = read(new File(root, "index.json"));
        JSONObject recordings = index.optJSONObject("recordings"); if (recordings == null) recordings = new JSONObject();
        Map<String, JSONObject> prayers = new LinkedHashMap<>();
        for (JSONArray list : new JSONArray[]{ index.optJSONArray("guestPrays") }) {
            if (list != null) for (int i = 0; i < list.length(); i++) { JSONObject p = list.getJSONObject(i); if (p.has("_id")) prayers.put(p.getString("_id"), p); }
        }
        if (prayers.isEmpty() && recordings.length() == 0) throw new IOException("No prayers to back up yet");
        JSONObject manifest = new JSONObject().put("type", "my-prays-backup").put("version", 1).put("createdAt", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US) {{ setTimeZone(TimeZone.getTimeZone("UTC")); }}.format(new Date()));
        JSONObject withFiles = new JSONObject(); int total = 0, done = 0;
        for (Iterator<String> it = recordings.keys(); it.hasNext();) total += recordings.getJSONArray(it.next()).length();
        try (ZipOutputStream zip = new ZipOutputStream(new BufferedOutputStream(new FileOutputStream(output)))) {
            zip.setLevel(Deflater.NO_COMPRESSION); // Audio is already compressed; avoid wasting battery.
            byte[] buffer = new byte[65536];
            for (Iterator<String> it = recordings.keys(); it.hasNext();) {
                String id = part(it.next()); JSONArray list = recordings.getJSONArray(id), copies = new JSONArray();
                for (int i = 0; i < list.length(); i++) {
                    JSONObject rec = new JSONObject(list.getJSONObject(i).toString());
                    String name = part(rec.getString("id")) + "." + part(rec.getString("ext"));
                    String entry = "audio/" + id + "/" + name;
                    // Fail on missing recordings: never replace a good cloud backup with a partial archive.
                    try (InputStream in = new FileInputStream(new File(root, "audio/" + name))) {
                        zip.putNextEntry(new ZipEntry(entry)); int count;
                        while ((count = in.read(buffer)) != -1) { progress.update(5 + done * 35 / Math.max(1, total)); zip.write(buffer, 0, count); }
                        zip.closeEntry();
                    }
                    rec.put("file", entry); copies.put(rec); done++; progress.update(5 + done * 35 / Math.max(1, total));
                }
                withFiles.put(id, copies);
            }
            JSONArray prays = new JSONArray(), others = new JSONArray();
            for (Map.Entry<String, JSONObject> item : prayers.entrySet()) {
                JSONObject p = item.getValue(), copy = new JSONObject();
                for (String field : new String[]{"_id", "words", "feeling", "prayType", "churchId", "date", "sharedWith", "sharedFrom"}) if (p.has(field)) copy.put(field, p.get(field));
                copy.put("recordings", withFiles.optJSONArray(item.getKey()) == null ? new JSONArray() : withFiles.getJSONArray(item.getKey())); prays.put(copy);
            }
            for (Iterator<String> it = recordings.keys(); it.hasNext();) {
                String id = it.next(); if (!prayers.containsKey(id)) {
                    JSONObject group = new JSONObject().put("prayId", id).put("recordings", withFiles.getJSONArray(id));
                    JSONObject pending = index.optJSONObject("pendingWords"); if (pending != null && pending.has(id)) group.put("pendingWords", pending.get(id)); others.put(group);
                }
            }
            manifest.put("prays", prays).put("otherRecordings", others);
            zip.setLevel(Deflater.DEFAULT_COMPRESSION);
            zip.putNextEntry(new ZipEntry("prays.json")); zip.write(manifest.toString().getBytes(StandardCharsets.UTF_8)); zip.closeEntry();
        }
        return output;
    }
}
