"use client";
import { motion } from "framer-motion";
import { Guitar } from "lucide-react";

export default function Loading() {
  // Guitar strings configuration (thickness relative to varying weights)
  const strings = [
    {
      id: 1,
      thickness: "w-1",
      color: "from-yellow-700 via-yellow-600 to-yellow-800",
      delay: 0.05,
    }, // Low E (Thickest)
    {
      id: 2,
      thickness: "w-0.5",
      color: "from-yellow-600 via-yellow-500 to-yellow-700",
      delay: 0.1,
    }, // A
    {
      id: 3,
      thickness: "w-0.5",
      color: "from-yellow-500 via-yellow-400 to-yellow-600",
      delay: 0.15,
    }, // D
    {
      id: 4,
      thickness: "w-[1px]",
      color: "from-gray-400 via-gray-300 to-gray-500",
      delay: 0.2,
    }, // G
    {
      id: 5,
      thickness: "w-[1px]",
      color: "from-gray-300 via-gray-200 to-gray-400",
      delay: 0.25,
    }, // B
    {
      id: 6,
      thickness: "w-[1px]",
      color: "from-gray-200 via-gray-100 to-gray-300",
      delay: 0.3,
    }, // High e (Thinnest)
  ];

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#020617] relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.1),transparent_70%)] pointer-events-none" />

      <div className="relative">
        {/* Floating Music Notes */}
        {[0, 1].map((i) => (
          <motion.div
            key={i}
            className="absolute -top-8 right-0 text-sky-400/60"
            initial={{ opacity: 0, y: 10, x: 0 }}
            animate={{
              opacity: [0, 1, 0],
              y: -30,
              x: i === 0 ? 20 : -20,
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 1,
              ease: "easeOut",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </motion.div>
        ))}

        {/* Glass Container for Guitar */}
        <div className="w-32 h-32 rounded-full bg-sky-500/10 backdrop-blur-xl border border-sky-500/20 flex items-center justify-center shadow-[0_0_40px_rgba(14,165,233,0.15)] relative z-10 box-decoration-clone">
          {/* Modern Simple Guitar Icon */}
          <motion.div
            initial={{ rotate: -15 }}
            animate={{ rotate: [15, -10, 15] }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              repeatType: "mirror",
              ease: "easeInOut",
            }}
          >
            <Guitar
              className="w-16 h-16 text-sky-400 drop-shadow-[0_0_15px_rgba(56,189,248,0.5)]"
              strokeWidth={1.5}
            />
          </motion.div>
        </div>
      </div>

      <motion.p
        initial={{ opacity: 0.5 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, repeat: Infinity, repeatType: "reverse" }}
        className="mt-6 text-sm font-medium text-sky-400/80 tracking-widest uppercase"
      >
        Loading...
      </motion.p>
    </div>
  );
}
