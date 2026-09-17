package com.worship.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.ImageView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.vectordrawable.graphics.drawable.AnimatedVectorDrawableCompat;

public class SplashActivity extends AppCompatActivity {

    // Last letter finishes at 1130+320=1450ms + 600ms hold = 2050ms total
    private static final int SPLASH_DURATION_MS = 2050;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Dismiss the Android 12 system splash immediately
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        // Edge-to-edge (hides status/nav bars visually)
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        setContentView(R.layout.activity_splash);

        ImageView logoView = findViewById(R.id.splash_logo);

        // Load and start the animated vector (scale 0.82→1 + alpha 0→1, 700ms)
        AnimatedVectorDrawableCompat avd = AnimatedVectorDrawableCompat.create(
                this, R.drawable.wasla_animated_splash);
        if (avd != null) {
            logoView.setImageDrawable(avd);
            avd.start();
        }

        // After SPLASH_DURATION_MS, launch MainActivity with a fade transition
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            Intent intent = new Intent(SplashActivity.this, MainActivity.class);
            startActivity(intent);
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
            finish();
        }, SPLASH_DURATION_MS);
    }
}
