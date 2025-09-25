"use client";
import React from "react";
import { FaWhatsapp } from "react-icons/fa";

export default function Footer() {
  return (
    <footer className="w-full bg-[#001a2b] backdrop-blur-md border-t border-white/10 py-4">
      <div className="max-w-6xl mx-auto  flex flex-col md:flex-row items-center justify-between px-6 text-white">
        
        {/* Text */}
        <p className="text-sm md:text-base font-light">
          Developed by:{" "}
          <span className="font-semibold text-[#3e60d0]">Youssef Shoukry</span>
        </p>

        {/* WhatsApp Link */}
        <a
          href="https://wa.me/201204470794"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 mt-3 md:mt-0 text-sm md:text-base bg-[#0a3d62]/70 hover:bg-[#0a3d62]/90 px-4 py-2 rounded-xl transition-all duration-300 backdrop-blur-lg"
        >
          <FaWhatsapp className="text-green-400 text-lg" />
          <span>Contact me on WhatsApp</span>
        </a>
      </div>
    </footer>
  );
}
