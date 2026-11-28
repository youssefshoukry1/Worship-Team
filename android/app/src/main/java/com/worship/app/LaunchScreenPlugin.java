package com.worship.app;

import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WaslaLaunch")
public class LaunchScreenPlugin extends Plugin {
    @PluginMethod
    public void setScrollIndicator(PluginCall call) {
        boolean visible = Boolean.TRUE.equals(call.getBoolean("visible"));
        getActivity().runOnUiThread(() -> {
            getBridge().getWebView().setVerticalScrollBarEnabled(visible);
            call.resolve();
        });
    }

    @PluginMethod
    public void ready(PluginCall call) {
        getActivity().runOnUiThread(() -> getBridge().getWebView().postVisualStateCallback(0,
            new WebView.VisualStateCallback() {
                @Override public void onComplete(long id) {
                    ((MainActivity) getActivity()).dismissLaunchCover();
                    getActivity().reportFullyDrawn();
                    call.resolve();
                }
            }));
    }
}
