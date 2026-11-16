package com.worship.app;

import androidx.core.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.security.MessageDigest;

/** Shared by the bridge and backup worker in this app process. */
final class PrayerIndexStorage {
    private static final Object LOCK = new Object();
    static final String MISSING = "missing";
    static final class Conflict extends IOException { Conflict() { super("Prayer storage changed. Please retry."); } }
    static final class Snapshot {
        final String data, fingerprint;
        Snapshot(String data, String fingerprint) { this.data = data; this.fingerprint = fingerprint; }
    }
    interface Writer { void write(FileOutputStream stream, byte[] data) throws IOException; }

    static Snapshot read(File root) throws Exception {
        synchronized (LOCK) { return readLocked(root); }
    }
    static JSONObject readObject(File root) throws Exception {
        Snapshot value = read(root);
        if (value.data == null) throw new FileNotFoundException("No prayer index");
        return new JSONObject(value.data);
    }
    private static Snapshot readLocked(File root) throws Exception {
        File base = new File(root, "index.json");
        byte[] bytes;
        try { bytes = new AtomicFile(base).readFully(); }
        catch (FileNotFoundException e) {
            if (!base.exists() && !new File(root, "index.json.bak").exists()
                && (!root.exists() || (root.isDirectory() && root.canRead() && root.canExecute()))) return new Snapshot(null, MISSING);
            throw e;
        }
        String data = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        validate(data);
        return new Snapshot(data, fingerprint(bytes));
    }
    static String fingerprint(byte[] bytes) throws Exception {
        StringBuilder result = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes)) result.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return result.toString();
    }
    static void validate(String data) throws Exception {
        JSONObject value = new JSONObject(data);
        if (value.has("version") && (!(value.get("version") instanceof Number) || value.getDouble("version") != 1)) throw new IOException("Unsupported prayer index version");
        if (value.has("guestPrays")) {
            JSONArray prayers = value.getJSONArray("guestPrays");
            for (int i = 0; i < prayers.length(); i++) if (prayers.getJSONObject(i).isNull("_id")) throw new IOException("Invalid prayer ID");
        }
        for (String key : new String[]{"recordings", "pendingWords", "revokedPrayerShares", "prayerDeletionCursors"}) {
            if (value.has(key)) value.getJSONObject(key);
        }
        JSONObject recordings = value.optJSONObject("recordings");
        if (recordings != null) for (java.util.Iterator<String> keys = recordings.keys(); keys.hasNext();) {
            JSONArray clips = recordings.getJSONArray(keys.next());
            for (int i = 0; i < clips.length(); i++) if (clips.getJSONObject(i).isNull("id")) throw new IOException("Invalid recording ID");
        }
    }
    static Snapshot write(File root, String expected, String data) throws Exception {
        return write(root, expected, data, (stream, bytes) -> stream.write(bytes));
    }
    // Package-private injection exercises real AtomicFile rollback, not a fake filesystem.
    static Snapshot write(File root, String expected, String data, Writer writer) throws Exception {
        if (expected == null || data == null) throw new IOException("Missing prayer transaction parameters");
        validate(data);
        byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
        synchronized (LOCK) {
            Snapshot current = readLocked(root);
            if (!expected.equals(current.fingerprint)) throw new Conflict();
            if (data.equals(current.data)) return current;
            if (!root.isDirectory() && !root.mkdirs()) throw new IOException("Could not create prayer directory");
            AtomicFile file = new AtomicFile(new File(root, "index.json"));
            FileOutputStream stream = file.startWrite();
            try {
                writer.write(stream, bytes);
                stream.getFD().sync();
                file.finishWrite(stream);
            } catch (Exception e) { file.failWrite(stream); throw e; }
            // AtomicFile logs some commit failures; never turn those into success.
            Snapshot committed = readLocked(root);
            if (!fingerprint(bytes).equals(committed.fingerprint)) throw new IOException("Prayer index commit could not be verified");
            return committed;
        }
    }
}
