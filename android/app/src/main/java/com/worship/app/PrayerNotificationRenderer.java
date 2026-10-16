package com.worship.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Shader;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.content.ContextCompat;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;
import java.util.Map;
import java.util.Locale;

final class PrayerNotificationRenderer {
    static final String CHANNEL = "prays_channel";
    static final int ID = 1;

    static synchronized void show(Context context, Map<String, String> data, String tag, long timestamp, Bitmap photo) {
        // A message/photo finishing after the app opens must not bring its alert back.
        // The service still forwards the message to the page for silent refresh.
        if (MainActivity.isForeground()) return;
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,
            Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Prayers & Replies", NotificationManager.IMPORTANCE_HIGH);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
        String title = PrayerNotificationIdentity.title(data);
        String body = data.getOrDefault("body", "Shared a prayer with you");
        boolean anonymous = PrayerNotificationIdentity.isAnonymous(data);
        Bitmap avatar = avatar(context, title, anonymous, anonymous ? null : photo);
        Person sender = new Person.Builder().setName(title).setKey(tag)
            .setIcon(IconCompat.createWithBitmap(avatar)).build();
        Intent intent = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_VIEW).setData(Uri.parse("wasla://prayer/" + Uri.encode(tag)))
            .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        for (Map.Entry<String, String> entry : data.entrySet()) intent.putExtra(entry.getKey(), entry.getValue());
        intent.putExtra("google.message_id", tag);
        // Fixed internal destination, handled by Capacitor's existing push-tap listener.
        intent.putExtra("url", "/pray");
        // A valid long-lived conversation shortcut makes Android use the sender's avatar
        // in the collapsed notification and add the application's own badge to it.
        String shortcutId = "prayer-" + tag;
        ShortcutInfoCompat shortcut = new ShortcutInfoCompat.Builder(context, shortcutId)
            .setShortLabel(title).setLongLived(true).setPerson(sender)
            .setIcon(IconCompat.createWithAdaptiveBitmap(avatar)).setIntent(intent).build();
        ShortcutManagerCompat.pushDynamicShortcut(context, shortcut);
        PendingIntent tap = PendingIntent.getActivity(context, tag.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(
            new Person.Builder().setName("You").build()).setGroupConversation(false)
            .addMessage(body, timestamp, sender);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_wasla).setColor(Color.rgb(0, 194, 255))
            .setContentTitle(title).setContentText(body).setLargeIcon(avatar).setStyle(style)
            .setShortcutId(shortcutId).addPerson(sender)
            .setGroup(PrayerNotificationGroup.KEY)
            .setSortKey(String.format(Locale.ROOT, "%019d", Long.MAX_VALUE - timestamp))
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE).setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(tap).setAutoCancel(true).setOnlyAlertOnce(true)
            .setDeleteIntent(PrayerNotificationGroup.deleteIntent(context, tag))
            .setWhen(timestamp).setShowWhen(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE);
        PrayerNotificationGroup.post(context, tag, builder.build());
    }

    static synchronized void dismiss(Context context, String tag) {
        PrayerNotificationGroup.dismiss(context, tag);
    }

    static synchronized void clear(Context context) {
        PrayerNotificationGroup.clear(context);
    }

    static Bitmap avatar(Context context, String title, boolean anonymous, Bitmap photo) {
        final int size = 128;
        Bitmap result = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(result);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.rgb(16, 47, 66));
        canvas.drawCircle(64, 64, 64, paint);
        if (photo != null && !anonymous) {
            float scale = Math.max(128f / photo.getWidth(), 128f / photo.getHeight());
            android.graphics.Matrix matrix = new android.graphics.Matrix();
            matrix.setScale(scale, scale);
            matrix.postTranslate((128 - photo.getWidth() * scale) / 2, (128 - photo.getHeight() * scale) / 2);
            BitmapShader shader = new BitmapShader(photo, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
            shader.setLocalMatrix(matrix);
            paint.setShader(shader);
            canvas.drawCircle(64, 64, 64, paint);
            paint.setShader(null);
        } else if (anonymous) {
            paint.setColor(Color.WHITE);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(6);
            paint.setStrokeCap(Paint.Cap.ROUND);
            Path eye = new Path();
            eye.moveTo(25, 62); eye.cubicTo(45, 33, 83, 33, 103, 62);
            eye.cubicTo(83, 91, 45, 91, 25, 62);
            canvas.drawPath(eye, paint);
            canvas.drawCircle(64, 62, 12, paint);
            // Clear space under the slash makes the eye-off silhouette legible at small sizes.
            paint.setColor(Color.rgb(16, 47, 66)); paint.setStrokeWidth(13);
            canvas.drawLine(30, 28, 99, 97, paint);
            paint.setColor(Color.WHITE); paint.setStrokeWidth(6);
            canvas.drawLine(30, 28, 99, 97, paint);
            paint.setStyle(Paint.Style.FILL);
        } else {
            paint.setColor(Color.WHITE);
            paint.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
            paint.setTextSize(58);
            paint.setTextAlign(Paint.Align.CENTER);
            canvas.drawText(PrayerNotificationIdentity.initial(title), 64,
                64 - (paint.ascent() + paint.descent()) / 2, paint);
        }
        // Android adds the Wasla app badge for a conversation. Baking it into the
        // person's photo as well would produce two badges and shrink the portrait.
        return result;
    }
}
