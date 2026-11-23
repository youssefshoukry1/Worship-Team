"use client";
import React, { useCallback, useEffect, useState } from "react";
import { parseVersion, compareVersions } from "../utils/appVersion";
import { shouldShowReleaseSplash } from "../services/otaUpdateService";

export default function WaslaSplashIntro() {
    const [showSplash, setShowSplash] = useState(false);
    const [appVersion, setAppVersion] = useState(null);

    const [Animation, setAnimation] = useState(null);

    const finishSplash = () => {
        if (typeof window !== "undefined") {
            window.__wasla_splash_active = false;
            window.__wasla_splash_done = true;
            window.waslaOtaIntro?.finish();
            window.dispatchEvent(new CustomEvent("wasla_splash_done"));
        }
    };

    useEffect(() => {
        let cancelled = false;

        const checkSplashRequirement = async () => {
            try {
                let version;
                const { Capacitor } = await import("@capacitor/core");
                if (Capacitor.isNativePlatform()) {
                    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
                    const { bundle } = await CapacitorUpdater.current();
                    // Only an active OTA bundle counts; queued downloads do not.
                    if (bundle?.id !== "builtin" && bundle?.version !== "builtin") {
                        version = bundle?.version;
                    }
                }

                // On web and for the native built-in bundle, read its local metadata.
                if (!version) {
                    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
                    if (res.ok) version = (await res.json()).version;
                }
                if (cancelled) return;

                const current = parseVersion(version);
                if (current) {
                    const previous = parseVersion(localStorage.getItem("wasla_splash_version"));
                    const savedVersion = localStorage.getItem("wasla_splash_version");
                    if (!previous || !shouldShowReleaseSplash(version)) {
                        // First opening establishes a baseline without announcing an update.
                        // A release with its intro disabled is also marked as seen.
                        if (!previous || compareVersions(version, savedVersion) === 1) {
                            localStorage.setItem("wasla_splash_version", version);
                        }
                    } else if (compareVersions(version, savedVersion) === 1) {
                        const { default: animation } = await import("./ReleaseAnimation");
                        if (cancelled) return;
                        if (window.waslaSkippedOtaIntro === version) {
                            localStorage.setItem("wasla_splash_version", version);
                            finishSplash();
                            return;
                        }
                        setAnimation(() => animation);
                        setAppVersion(version);
                        window.__wasla_splash_active = true;
                        setShowSplash(true);
                        return;
                    }
                }
            } catch {}

            // Missing/invalid version data must never announce an update.
            if (!cancelled) finishSplash();
        };

        checkSplashRequirement();
        return () => { cancelled = true; };
    }, []);

    const onVisible = useCallback(node => {
        if (!node || !appVersion) return;
        try { localStorage.setItem("wasla_splash_version", appVersion); } catch {}
        const gate = window.waslaOtaIntro;
        if (gate) requestAnimationFrame(() => requestAnimationFrame(() => {
            if (window.waslaOtaIntro === gate) gate.finish();
        }));
    }, [appVersion]);

    const handleAnimationComplete = () => {
        // Hold for a moment to enjoy the full splash, then gracefully fade out
        setTimeout(() => {
            setShowSplash(false);
            try {
                localStorage.setItem("wasla_splash_version", appVersion);
            } catch {}
        }, 600);
    };

    return Animation ? <Animation showSplash={showSplash} onVisible={onVisible} onComplete={handleAnimationComplete} onExitComplete={finishSplash} /> : null;
}
