"use client";
import React from "react";
import { FaWhatsapp } from "react-icons/fa";

export default function Footer() {
  return (
    <footer className="w-full  bg-blue-950/20 backdrop-blur-xl border-t border-sky-500/10 py-8 relative overflow-hidden">
      {/* Glow Effect */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-px bg-linear-to-r from-transparent via-sky-500/50 to-transparent opacity-50" />

      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between px-6 text-gray-400 gap-6">
        {/* Branding / Copyright */}
        <div className="flex flex-col items-center md:items-start text-center md:text-left gap-1">
          <p className="font-light text-sm tracking-wide">
            Designed & Developed by{" "}
            <a
              href="https://youssef-portfolio-1.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 ml-1 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_15px_rgba(56,189,248,0.15)] group"
            >
              <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-300 group-hover:from-white group-hover:to-white transition-all">
                Youssef Shoukry
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-3.5 h-3.5 text-white/50 group-hover:text-white transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
            </a>
          </p>
          <p className="text-xs text-gray-600">
            © {new Date().getFullYear()} PraiseTeam. All rights reserved.
          </p>
        </div>

      </div>
    </footer>
  );
}
