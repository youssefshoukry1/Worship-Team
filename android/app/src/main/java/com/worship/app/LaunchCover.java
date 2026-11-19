package com.worship.app;

import android.animation.Keyframe;
import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;

final class LaunchCover extends FrameLayout {
    private final ObjectAnimator[] pulses = new ObjectAnimator[5];

    LaunchCover(Context context) {
        super(context);
        setBackgroundColor(getResources().getColor(R.color.splash_bg, null));
        setClickable(true);
        float density = getResources().getDisplayMetrics().density;
        LayoutParams bounds = new LayoutParams(Math.round(190 * density), Math.round(130 * density), Gravity.CENTER);
        Bitmap atlas = BitmapFactory.decodeResource(getResources(), R.drawable.launch_letters);
        int width = atlas.getWidth() / 6;
        boolean animate = Settings.Global.getFloat(context.getContentResolver(),
                Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0;
        for (int i = 0; i < 6; i++) {
            Rect source = new Rect(i * width, 0, (i + 1) * width, atlas.getHeight());
            View layer = new View(context) {
                final Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG);
                final Rect destination = new Rect();
                @Override protected void onDraw(Canvas canvas) {
                    destination.set(0, 0, getWidth(), getHeight());
                    canvas.drawBitmap(atlas, source, destination, paint);
                }
            };
            addView(layer, bounds);
            if (i == 0 || !animate) continue;
            layer.setAlpha(0);
            PropertyValuesHolder opacity = PropertyValuesHolder.ofKeyframe(View.ALPHA,
                Keyframe.ofFloat(0, 0), Keyframe.ofFloat(.01f, 0), Keyframe.ofFloat(.014f, .92f),
                Keyframe.ofFloat(.024f, .52f), Keyframe.ofFloat(.036f, 0), Keyframe.ofFloat(.054f, 0),
                Keyframe.ofFloat(.059f, 1), Keyframe.ofFloat(.07f, .86f), Keyframe.ofFloat(.12f, 0),
                Keyframe.ofFloat(1, 0));
            ObjectAnimator pulse = ObjectAnimator.ofPropertyValuesHolder(layer, opacity);
            pulse.setInterpolator(new LinearInterpolator());
            pulse.setDuration(3600);
            pulse.setStartDelay((i - 1) * 600L);
            pulse.setRepeatCount(ObjectAnimator.INFINITE);
            pulses[i - 1] = pulse;
        }
    }

    @Override protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        for (ObjectAnimator pulse : pulses) if (pulse != null) pulse.start();
    }

    @Override protected void onDetachedFromWindow() {
        for (ObjectAnimator pulse : pulses) if (pulse != null) pulse.cancel();
        super.onDetachedFromWindow();
    }
}
