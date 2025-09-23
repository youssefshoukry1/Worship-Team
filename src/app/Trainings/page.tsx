"use client";

import React from "react";
import { motion } from "framer-motion";
import { PlayCircle, Mic, Guitar } from "lucide-react";

type Member = {
  name: string;
  role: "vocal" | "instrument";
  youtube: string[];
  performance: string;
};

const members: Member[] = [
  { name: "Joyce Becket", role: "vocal", youtube: ["#"], performance: "Solo hymn" },
  { name: "Shery Adel", role: "vocal", youtube: ["#", "#"], performance: "Choir" },
  { name: "Marly Milad", role: "vocal", youtube: ["#"], performance: "Solo hymn" },
  { name: "Tota Email", role: "vocal", youtube: ["#"], performance: "Choir" },
  { name: "Yara Milad", role: "vocal", youtube: ["#"], performance: "Choir" },
  { name: "Akram Ashraf", role: "vocal", youtube: ["#"], performance: "Solo hymn" },
  { name: "Koko Nader", role: "vocal", youtube: ["#"], performance: "Choir" },
  { name: "Ofaa", role: "instrument", youtube: ["#"], performance: "Guitar" },
  { name: "Jason", role: "instrument", youtube: ["#"], performance: "Drums" },
  { name: "Youssef Saper", role: "instrument", youtube: ["#"], performance: "Keyboard" },
  { name: "Youssef Adel", role: "instrument", youtube: ["#"], performance: "Violin" },
];

const letterVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

export default function Trainings() {
  return (
    <section className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white px-4 sm:px-6 py-12">
      <motion.h1
        className="text-3xl sm:text-4xl font-bold mb-10 text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        🎶 Training Schedule
      </motion.h1>

      <div className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3">
        {members.map((m, i) => (
          <motion.div
            key={i}
            className="bg-gray-800/60 rounded-2xl p-4 sm:p-6 shadow-lg flex flex-col justify-between cursor-pointer"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.03, boxShadow: "0 15px 25px rgba(0,0,0,0.5)" }}
            whileTap={{ scale: 0.97 }}
            transition={{ delay: 0.1 * i, duration: 0.6 }}
          >
            {/* Name & Role with typing effect */}
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <motion.h2
                className="text-lg sm:text-xl font-semibold flex gap-[1px]"
                initial="hidden"
                animate="visible"
                variants={{
                  visible: { transition: { staggerChildren: 0.07 } },
                }}
              >
                {m.name.split("").map((char, idx) => (
                  <motion.span key={idx} variants={letterVariants}>
                    {char}
                  </motion.span>
                ))}
              </motion.h2>

              {m.role === "vocal" ? (
                <div className="flex items-center gap-1 text-pink-400 text-sm sm:text-base">
                  <Mic className="w-4 h-4 sm:w-5 sm:h-5" /> Vocal
                </div>
              ) : (
                <div className="flex items-center gap-1 text-green-400 text-sm sm:text-base">
                  <Guitar className="w-4 h-4 sm:w-5 sm:h-5" /> Instrument
                </div>
              )}
            </div>

            {/* Performance */}
            <p className="text-gray-300 mb-4 sm:mb-6 text-sm sm:text-base">{m.performance}</p>

            {/* YouTube links flying in dramatic */}
            <motion.div
              className="flex flex-wrap gap-2"
              initial="hidden"
              animate="visible"
              variants={{
                visible: { transition: { staggerChildren: 0.15 } },
              }}
            >
              {m.youtube.map((link, idx) => (
                <motion.a
                  key={idx}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 sm:p-3 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center"
                  variants={{
                    hidden: { opacity: 0, x: idx % 2 === 0 ? -20 : 20, scale: 0.5 },
                    visible: { opacity: 1, x: 0, scale: 1 },
                  }}
                  transition={{ duration: 0.5, type: "spring", stiffness: 100 }}
                >
                  <PlayCircle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </motion.a>
              ))}
            </motion.div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
