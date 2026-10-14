package com.worship.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.ProtocolException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Locale;

/** Bounded photo downloads and a small URL-keyed cache shared by FCM and WorkManager. */
final class PrayerAvatarLoader {
    // Matches the server's supported profile-photo upload size.
    static final int MAX_BYTES = 5 * 1024 * 1024;

    static Bitmap cached(Context context, String url) {
        if (url == null || url.isEmpty()) return null;
        try {
            File file = cacheFile(context, url);
            if (!file.isFile()) return null;
            file.setLastModified(System.currentTimeMillis());
            return BitmapFactory.decodeFile(file.getPath());
        } catch (Exception ignored) { return null; }
    }

    static Bitmap load(Context context, String url, int budgetMs) throws IOException {
        Bitmap cached = cached(context, url);
        if (cached != null) return cached;
        Bitmap bitmap = decode(download(new URL(url), budgetMs));
        if (bitmap == null) throw new IOException("Avatar image could not be decoded");
        store(context, url, bitmap);
        return bitmap;
    }

    static byte[] download(URL url, int budgetMs) throws IOException {
        long deadline = System.nanoTime() + budgetMs * 1_000_000L;
        for (int redirects = 0; redirects <= 3; redirects++) {
            if (!"https".equalsIgnoreCase(url.getProtocol())) throw new ProtocolException("Avatar requires HTTPS");
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            try {
                connection.setConnectTimeout(remainingMs(deadline));
                connection.setReadTimeout(remainingMs(deadline));
                connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("Accept", "image/*");
                int status = connection.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IOException("Avatar redirect missing location");
                    url = new URL(url, location);
                    continue;
                }
                if (status != 200) throw new IOException("Avatar HTTP " + status);
                if (connection.getContentLengthLong() > MAX_BYTES) throw new ProtocolException("Avatar exceeds upload limit");
                try (InputStream stream = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192]; int count;
                    while (true) {
                        connection.setReadTimeout(remainingMs(deadline));
                        count = stream.read(buffer);
                        if (count == -1) break;
                        if (output.size() + count > MAX_BYTES) throw new ProtocolException("Avatar exceeds upload limit");
                        output.write(buffer, 0, count);
                    }
                    return output.toByteArray();
                }
            } finally { connection.disconnect(); }
        }
        throw new ProtocolException("Too many avatar redirects");
    }

    static Bitmap decode(byte[] bytes) {
        BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        if (options.outWidth <= 0 || options.outHeight <= 0) return null;
        options.inSampleSize = 1;
        while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 512) options.inSampleSize *= 2;
        options.inJustDecodeBounds = false;
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
    }

    static synchronized void store(Context context, String url, Bitmap bitmap) {
        try {
            File file = cacheFile(context, url);
            File directory = file.getParentFile();
            if (!directory.isDirectory() && !directory.mkdirs()) return;
            try (FileOutputStream output = new FileOutputStream(file)) {
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, output);
            }
            File[] files = directory.listFiles();
            if (files != null && files.length > 32) {
                Arrays.sort(files, Comparator.comparingLong(File::lastModified));
                for (int i = 0; i < files.length - 32; i++) files[i].delete();
            }
        } catch (Exception ignored) {
            // A cache-write failure must not prevent displaying a downloaded photo.
        }
    }

    private static int remainingMs(long deadline) throws IOException {
        long remaining = (deadline - System.nanoTime()) / 1_000_000L;
        if (remaining <= 0) throw new java.net.SocketTimeoutException("Avatar download timed out");
        return (int) Math.max(1, remaining);
    }

    private static File cacheFile(Context context, String url) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(url.getBytes(StandardCharsets.UTF_8));
        StringBuilder key = new StringBuilder();
        for (byte value : hash) key.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return new File(new File(context.getCacheDir(), "notification-avatars"), key + ".png");
    }
}
