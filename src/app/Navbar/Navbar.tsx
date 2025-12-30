"use client";
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, easeOut } from "framer-motion";
import { useRouter, usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

interface NavItem {
  name: string;
  path: string;
  id: string;
}

export default function Navbar() {
  const navItems: NavItem[] = [
    { name: "Home", path: "/", id: "home-section" },
    { name: "Hymns", path: "/Category_Humns", id: "Category_Humns" },
    { name: "Training", path: "/Trainings", id: "training-section" },
    { name: "WorkSpace", path: "/WorkSpace", id: "WorkSpace-section" },
    { name: "Contact", path: "/Contact", id: "contact-section" },
  ];

  const router = useRouter();
  const pathname = usePathname();
  const pendingSection = useRef<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNavClick = (path: string, sectionId: string) => {
    if (pathname === path) {
      const section = document.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      pendingSection.current = sectionId;
      router.push(path);
    }
    setMenuOpen(false);
  };

  useEffect(() => {
    if (pendingSection.current) {
      const sectionId = pendingSection.current;
      const timer = setTimeout(() => {
        const section = document.getElementById(sectionId);
        if (section) {
          section.scrollIntoView({ behavior: "smooth" });
        }
        pendingSection.current = null;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [pathname]);

  const containerVariants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.15 },
    },
  };

  const itemVariants = {
    hidden: { y: -20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.6, ease: easeOut },
    },
  };

  return (
    <nav className="sticky w-full flex justify-between items-center py-3 px-6 top-0 z-50 bg-blue-950/20 backdrop-blur-xl border-b border-sky-500/10 transition-all duration-300">
      {/* Logo */}
      <div
        className="relative text-white font-bold text-2xl tracking-tight bg-gradient-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent drop-shadow-sm cursor-pointer"
        onClick={() => router.push("/")}
      >
        PraiseTeam
      </div>

      {/* Desktop Menu */}
      <motion.ul
        className="relative hidden md:flex gap-8 items-center"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {navItems.map(({ name, path, id }) => (
          <motion.li key={name} variants={itemVariants} className="list-none">
            <button
              onClick={() => handleNavClick(path, id)}
              className={`text-sm lg:text-base font-medium cursor-pointer transition-all duration-300 px-3 py-2 rounded-lg hover:bg-white/5
                ${
                  pathname === path
                    ? "text-sky-400 bg-white/5"
                    : "text-gray-300 hover:text-sky-300"
                }`}
            >
              {name}
            </button>
          </motion.li>
        ))}
      </motion.ul>

      {/* Mobile Hamburger */}
      <div className="relative md:hidden">
        <button
          onClick={() => setMenuOpen((prev) => !prev)}
          className="text-white hover:text-sky-400 p-2 transition"
        >
          {menuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.ul
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.2, ease: easeOut }}
              className="absolute right-0 mt-4 w-56 bg-[#0f172a]/95 backdrop-blur-2xl text-white flex flex-col p-2 gap-1 rounded-2xl z-50 border border-white/10 shadow-2xl origin-top-right"
            >
              {navItems.map(({ name, path, id }) => (
                <li key={name}>
                  <button
                    onClick={() => handleNavClick(path, id)}
                    className={`block w-full text-left px-4 py-3 rounded-xl transition-all font-medium text-sm
                      ${
                        pathname === path
                          ? "bg-sky-500/20 text-sky-400"
                          : "text-gray-300 hover:bg-white/5 hover:text-white"
                      }`}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
