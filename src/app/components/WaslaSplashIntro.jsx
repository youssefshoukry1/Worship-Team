"use client";
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import WaslaLogo from "../Navbar/WaslaLogo";

export default function WaslaSplashIntro() {
    const [showSplash, setShowSplash] = useState(false);
    const [appVersion, setAppVersion] = useState("1.0.0");

    const finishSplash = () => {
        if (typeof window !== "undefined") {
            window.__wasla_splash_active = false;
            window.__wasla_splash_done = true;
            window.dispatchEvent(new CustomEvent("wasla_splash_done"));
        }
    };

    useEffect(() => {
        const checkSplashRequirement = async () => {
            try {
                const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
                if (res.ok) {
                    const data = await res.json();
                    const ver = data.version || "1.0.0";
                    setAppVersion(ver);
                    const savedVer = localStorage.getItem("wasla_splash_version");
                    if (savedVer !== ver) {
                        window.__wasla_splash_active = true;
                        setShowSplash(true);
                        return;
                    }
                }
            } catch (_) {}

            const savedVer = localStorage.getItem("wasla_splash_version");
            if (!savedVer) {
                window.__wasla_splash_active = true;
                setShowSplash(true);
            } else {
                finishSplash();
            }
        };

        checkSplashRequirement();
    }, []);

    const handleAnimationComplete = () => {
        // Hold for a moment to enjoy the full splash, then gracefully fade out
        setTimeout(() => {
            setShowSplash(false);
            try {
                localStorage.setItem("wasla_splash_version", appVersion);
                // Also align 3-day navbar timer so animations don't conflict
                localStorage.setItem("wasla_intro_last_time", Date.now().toString());
            } catch (_) {}
        }, 600);
    };

    return (
        <AnimatePresence onExitComplete={finishSplash}>
            {showSplash && (
                <motion.div
                    id="wasla-splash-screen"
                    key="wasla-full-splash"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: "easeInOut" }}
                    className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#0b0f19] pointer-events-auto overflow-hidden"
                >
                    {/* Ambient Glow */}
                    <div className="absolute w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none -top-10 -left-10 animate-pulse" />
                    <div className="absolute w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none -bottom-10 -right-10 animate-pulse" />

                    <motion.div
                        initial={{ scale: 0.85, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className="relative z-10 flex flex-col items-center px-4"
                    >
                        <div className="w-56 sm:w-72 md:w-88 h-auto">
                            <WaslaLogo
                                animated={true}
                                className="w-full h-auto drop-shadow-[0_0_35px_rgba(47,196,201,0.4)]"
                                onComplete={handleAnimationComplete}
                            />
                        </div>

                        {/* Slogan */}
                        <motion.p
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 0.85, y: 0 }}
                            transition={{ duration: 0.5, delay: 1.4, ease: "easeOut" }}
                            className="mt-6 text-sm sm:text-base text-gray-300 font-medium tracking-wide text-center"
                        >
                            تسبيحنا يرتفع للسماء
                        </motion.p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

