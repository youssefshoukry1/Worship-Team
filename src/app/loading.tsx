"use client";
import { motion } from "framer-motion";

export default function Loading() {
  return (
    <div className="flex items-center justify-center h-screen bg-[#001a2b]">
      {/* دوائر متحركة */}
      <div className="flex space-x-3">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-4 h-4 rounded-full"
            style={{
              background: "linear-gradient(180deg, #0a3d62, #6a0dad)", // أزرق سمواوي مع موف
            }}
            animate={{
              y: ["0%", "-50%", "0%"],
            }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}
