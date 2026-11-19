package com.worship.app;

import android.content.Context;
import android.view.Gravity;
import android.widget.FrameLayout;
import android.widget.ImageView;

final class LaunchCover extends FrameLayout {
    LaunchCover(Context context) {
        super(context);
        setBackgroundColor(getResources().getColor(R.color.splash_bg, null));
        setClickable(true);
        ImageView logo = new ImageView(context);
        logo.setImageResource(R.drawable.wasla_vector_logo);
        addView(logo, new LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.CENTER));
    }
}
