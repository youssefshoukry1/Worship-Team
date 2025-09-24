"use client";

import React from "react";
import { PlayCircle, Mic, Guitar, Music2, Drum, Piano } from "lucide-react"; // أيقونات

type Performance = {
  song: string;
  scale?: string; // vocal
  solo?: string; // instrument
};

type Member = {
  name: string;
  role: "vocal" | "instrument";
  youtube: string[];
  performances: Performance[];
};

const members: Member[] = [
  { name: "Joyce Becket", role: "vocal", youtube: ["#"], performances: [{ song: "انت تقول اسمي ايه", scale: "A" }] },
  { name: "Shery Adel", role: "vocal", youtube: ["#", "#"], performances: [{ song: "اسندني في ضعفي", scale: "Gm" }] },
  { name: "Marly Milad", role: "vocal", youtube: ["#"], performances: [{ song: "انت تقول اسمي ايه", scale: "A" }, { song: "بتحبني", scale: "unknow!" }] },
  { name: "Tota Email", role: "vocal", youtube: ["#"], performances: [{ song: "من لاصير من شعبك", scale: "unknow!" }] },
  { name: "Yara Milad", role: "vocal", youtube: ["#"], performances: [{ song: "من لاصير من شعبك", scale: "unknow!" }, { song: "انا الرب قد دعوتك", scale: "A" }] },
  { name: "Akram Ashraf", role: "vocal", youtube: ["#"], performances: [{ song: "أحاط بي", scale: "Cm" }] },
  { name: "Koko Nader", role: "vocal", youtube: ["#"], performances: [{ song: "انا الرب قد دعوتك", scale: "A" }] },

  // Instruments
  { name: "Ofaa", role: "instrument", youtube: ["#"], performances: [{ solo: "", song: "انت تقول اسمي ايه" }] },
  { name: "Jason", role: "instrument", youtube: ["#"], performances: [{ solo: "", song: "اسندني في ضعفي" }] },
  { name: "Youssef Saper", role: "instrument", youtube: ["#"], performances: [{ solo: "", song: "بتحبني" }] },
  { name: "Youssef Adel", role: "instrument", youtube: ["#"], performances: [{ solo: "", song: "انا الرب قد دعوتك" }] },
];

export default function Trainings() {
  // أيقونات لكل Instrument
  const getInstrumentIcon = (solo?: string) => {
    if (!solo) return <Music2 className="w-4 h-4 text-indigo-300" />;
    if (solo.toLowerCase().includes("acoustic")) return <Guitar className="w-4 h-4 text-amber-400" />;
    if (solo.toLowerCase().includes("electric")) return <Guitar className="w-4 h-4  text-amber-400" />;
    if (solo.toLowerCase().includes("drum")) return <Drum className="w-4 h-4 text-red-400" />;
    if (solo.toLowerCase().includes("piano")) return <Piano className="w-4 h-4 text-emerald-400" />;
    return <Music2 className="w-4 h-4 text-indigo-300" />;
  };

  return (
    <section className="min-h-screen bg-gradient-to-br from-[#050510] via-[#0a0a1a] to-[#141432] text-white px-4 sm:px-6 py-16 relative overflow-hidden">
      {/* خلفية Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(167,139,250,0.1),transparent_70%)]" />

      {/* العنوان */}
      <h1 className="text-4xl sm:text-5xl font-extrabold mb-14 text-center bg-gradient-to-r from-sky-300 via-indigo-300 to-purple-400 text-transparent bg-clip-text drop-shadow-lg">
        🎶 Training Schedule
      </h1>

      {/* Cards */}
      <div className="grid gap-8 sm:gap-10 md:grid-cols-2 lg:grid-cols-3 relative z-10">
        {members.map((m, i) => (
          <div
            key={i}
            className="relative bg-white/5 backdrop-blur-md rounded-2xl p-6 sm:p-7 shadow-xl hover:shadow-sky-500/20 border border-white/10 transition"
          >
            {/* Badge */}
            <div className="absolute top-4 right-4">
              {m.role === "vocal" ? (
                <span className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium 
                                bg-sky-500/20 text-sky-300 border border-sky-400/40 shadow-sm shadow-sky-500/30">
                  <Mic className="w-4 h-4" /> Vocal
                </span>
              ) : (
                <span className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium shadow-sm
                  ${
                    m.performances[0]?.solo?.toLowerCase().includes("acoustic")
                      ? "bg-gray-200/10 text-gray-100 border border-gray-300/30 shadow-gray-400/20"
                    : m.performances[0]?.solo?.toLowerCase().includes("electric")
                      ? "bg-gray-200/10 text-gray-100 border border-gray-300/30 shadow-gray-400/20"
                    : m.performances[0]?.solo?.toLowerCase().includes("drum")
                      ? "bg-gray-200/10 text-gray-100 border border-gray-300/30 shadow-gray-400/20"
                    : m.performances[0]?.solo?.toLowerCase().includes("piano")
                      ? "bg-gray-200/10 text-gray-100 border border-gray-300/30 shadow-gray-400/20"
                    : "bg-violet-500/20 text-violet-300 border border-violet-400/40 shadow-violet-500/30"
                  }`}>
                  Instrument
                </span>
              )}
            </div>

            {/* Member name */}
            <h2 className="text-xl sm:text-2xl font-semibold mb-6 bg-gradient-to-r from-gray-100 to-gray-300 bg-clip-text text-transparent">
              {m.name}
            </h2>

            {/* Performances */}
            <div className="mb-6 flex flex-wrap gap-2">
              {m.performances.map((p, idx) => (
                <div
                  key={idx}
                  className={`px-3 py-2 rounded-full flex items-center gap-2 text-sm sm:text-base border backdrop-blur-md shadow-sm
                    ${m.role === "instrument" 
                      ? "bg-white/5 border-white/10 hover:shadow-md" 
                      : "bg-gradient-to-r from-indigo-900/40 to-sky-900/30 border border-indigo-500/20"
                    }`}
                >
                  {m.role === "instrument" ? (
                    <span className="flex items-center gap-2 text-gray-200">
                      {getInstrumentIcon(p.solo)} {p.solo}  {p.song}
                    </span>
                  ) : (
                    <>
                      <span className="text-sky-300">🎼 {p.song}</span>
                      <span className="text-purple-300">🎵 {p.scale}</span>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* YouTube Links */}
            <div className="flex flex-wrap gap-2 mt-auto">
              {m.youtube.map((link, j) => (
                <a
                  key={j}
                  href={link}
                  target="_blank"
                  className="flex items-center gap-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 px-3 py-1.5 rounded-lg text-xs sm:text-sm transition border border-red-500/20"
                >
                  <PlayCircle className="w-4 h-4" /> Play {j + 1}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
