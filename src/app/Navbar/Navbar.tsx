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
    { name: "Setlist", path: "/", id: "setlist-section" },
    { name: "Training", path: "/Trainings", id: "training-section" },
    { name: "Resources", path: "/", id: "resources-section" },
    { name: "Contact", path: "/", id: "contact-section" },
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
    <nav className="relative w-full flex justify-between items-center py-4 px-6 sticky top-0 z-50">
      {/* خلفية بلون + شفافية + blur */}
      <div className="absolute inset-0 bg-[#001a2b] backdrop-blur-md border-b border-white/10"></div>

      {/* Logo */}
      <div className="relative text-white font-bold text-xl drop-shadow-lg">
        PraiseTeam
      </div>

      {/* Desktop Menu */}
      <motion.ul
        className="relative hidden md:flex gap-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {navItems.map(({ name, path, id }) => (
          <motion.li key={name} variants={itemVariants} className="list-none">
            <button
              onClick={() => handleNavClick(path, id)}
              className="text-white lg:text-lg font-semibold cursor-pointer transition-all duration-300 hover:text-cyan-400 hover:scale-110 px-2 py-1"
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
          className="text-white bg-cyan-500 hover:bg-cyan-600 p-2 rounded-full transition"
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.ul
              initial={{ opacity: 0, y: -40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.3, ease: easeOut }}
              className="absolute right-0 mt-3 w-48 bg-[#001a2b] text-white flex flex-col p-3 gap-2 rounded-xl z-50 border border-cyan-400 shadow-lg"
            >
              {navItems.map(({ name, path, id }) => (
                <li key={name}>
                  <button
                    onClick={() => handleNavClick(path, id)}
                    className="block w-full text-left px-4 py-2 rounded-md hover:bg-cyan-500 transition"
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
