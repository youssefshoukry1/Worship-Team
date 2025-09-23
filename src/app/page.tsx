"use client";

import React, { useEffect, useState } from "react";
import { motion, easeOut } from "framer-motion";
import Image from "next/image";

type TimeLeft = {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  finished?: boolean;
};

export default function Home() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({});
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const eventDate: Date = new Date("2025-10-03T16:00:00+02:00");

    const timer = setInterval(() => {
      const now: Date = new Date();
      const diff: number = eventDate.getTime() - now.getTime();

      if (diff <= 0) {
        clearInterval(timer);
        setTimeLeft({ finished: true });
      } else {
        const days: number = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours: number = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes: number = Math.floor((diff / 1000 / 60) % 60);
        const seconds: number = Math.floor((diff / 1000) % 60);

        if (days > 0) {
          setTimeLeft({ days, hours, minutes });
        } else {
          setTimeLeft({ hours, minutes, seconds });
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative w-full h-screen flex items-center justify-center text-white overflow-hidden">
      {loading && <div className="absolute inset-0 bg-gray-800 animate-pulse" />}

      <Image
        src="/worship-bg.webp"
        alt="Background"
        fill
        priority
        className="absolute inset-0 object-cover"
        onLoadingComplete={() => setLoading(false)}
      />
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative z-10 text-center space-y-6 px-4">
        <motion.h1
          className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold leading-tight"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: easeOut }}
        >
          ! اهلا بيك في فريق التسبيح
        </motion.h1>

        {/* 👇 هنا عملنا fade in */}
        <motion.h2
          className="text-lg sm:text-xl md:text-3xl lg:text-4xl font-semibold text-cyan-300"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.5, ease: easeOut }}
        >
          : حفلتنا الجاية بعد
        </motion.h2>

        <motion.div
          className="time-out text-lg sm:text-xl md:text-3xl lg:text-4xl font-semibold bg-white/10 px-4 sm:px-6 py-2 sm:py-4 rounded-2xl backdrop-blur-md inline-block shadow-lg"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1, duration: 0.8, ease: easeOut }}
        >
          {timeLeft.finished ? (
            <span>الحفلة بدأت 🎉</span>
          ) : timeLeft.days ? (
            <span>
              {timeLeft.days} day {timeLeft.hours} hour {timeLeft.minutes} minuts
            </span>
          ) : (
            <span>
              {timeLeft.hours} ساعة {timeLeft.minutes} دقيقة {timeLeft.seconds}{" "}
              ثانية
            </span>
          )}
        </motion.div>
      </div>
    </section>
  );
}
