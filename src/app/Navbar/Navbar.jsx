"use client";
import React, { useEffect, useRef, useState, useContext } from "react";
import axios from "axios";
import { motion, AnimatePresence, easeOut } from "framer-motion";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Menu, X, Globe, ChevronDown, Mic, Music, User, LogOut, LogIn, UserPlus, ShieldAlert } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
// Adjust import according to your file structure
import { translations } from "../i18n/translations";
import { UserContext } from "../context/User_Context";

export default function Navbar() {
    const { t, language, setLanguage } = useLanguage();
    const {
        isLogin, setLogin,
        UserRole, setUserRole,
        UserStatus, setUserStatus,
        user_id, setUser_id,
        churchId, setChurchId,
        HymnIds, setHymnIds,
        vocalsMode, setVocalsMode
    } = useContext(UserContext);
    const canUseMusicMode = ["MUSIC_ADMIN", "PROGRAMER"].includes(UserRole);
    const [langMenuOpen, setLangMenuOpen] = useState(false);
    const [modeMenuOpen, setModeMenuOpen] = useState(false);
    const [authMenuOpen, setAuthMenuOpen] = useState(false);

    // Default Items
    const navItems = [
        { name: "hymns", path: "/", id: "home-section" },
        { name: "workspace", path: "/WorkSpace/", id: "WorkSpace-section" },
    ];

    const router = useRouter();
    const pathname = usePathname();
    const pendingSection = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);

    const handleNavClick = (e, path, sectionId) => {
        if (pathname === path) {
            e.preventDefault();
            const section = document.getElementById(sectionId);
            if (section) {
                section.scrollIntoView({ behavior: "smooth" });
            }
        } else {
            pendingSection.current = sectionId;
        }
        setMenuOpen(false);
    };

    useEffect(() => {
        if (pendingSection.current) {
            const sectionId = pendingSection.current;

            // requestAnimationFrame بتضمن إن الصفحة اترسمت في المتصفح بدون أي تأخير ملحوظ
            requestAnimationFrame(() => {
                const section = document.getElementById(sectionId);
                if (section) {
                    section.scrollIntoView({ behavior: "smooth" });
                }
                pendingSection.current = null;
            });
        }
    }, [pathname]);

    const handleLogout = () => {
        localStorage.removeItem("user_Taspe7_Token");
        localStorage.removeItem("user_Taspe7_Role");
        localStorage.removeItem("user_Taspe7_ID");
        localStorage.removeItem("user_Taspe7_ChurchId");
        localStorage.removeItem("user_Taspe7_HymnIds");
        localStorage.removeItem("user_Taspe7_Status");

        setLogin(null);
        setUserRole(null);
        setUser_id(null);
        setChurchId(null);
        setHymnIds([]);
        setUserStatus(null);

        router.push("/");
    };

    useEffect(() => {
        // Ping Render backend to wake it up (Free Tier Cold Start)
        const wakeUpServer = async () => {
            try {
                await axios.get("https://worship-team-api.onrender.com/api/ping");
                console.log("🚀 Server woke up!");
            } catch (err) {
                console.error("Wake up ping failed:", err);
            }
        };
        wakeUpServer();
    }, []);

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

    if (pathname?.startsWith('/presentation')) {
        return null;
    }

    return (
        <nav className="sticky w-full flex justify-between items-center py-3 px-6 top-0 z-50 bg-blue-950/20 backdrop-blur-xl border-b border-sky-500/10 transition-all duration-300">
            {/* Logo */}
            <Link
                href="/"
                className="relative font-bold text-2xl tracking-tight bg-gradient-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent drop-shadow-sm cursor-pointer"
            >
                {t("praiseTeam")}
            </Link>

            {/* Desktop Menu */}
            <motion.ul
                className="relative hidden md:flex gap-8 items-center"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {navItems.map(({ name, path, id }) => (
                    <motion.li key={name} variants={itemVariants} className="list-none">
                        <Link
                            href={path}
                            onClick={(e) => handleNavClick(e, path, id)}
                            className={`text-sm lg:text-base font-medium cursor-pointer transition-all duration-300 px-3 py-2 rounded-lg hover:bg-white/5 block
                            ${pathname === path
                                    ? "text-sky-400 bg-white/5"
                                    : "text-gray-300 hover:text-sky-300"
                                }`}
                        >
                            {/* @ts-ignore */}
                            {t(name)}
                        </Link>
                    </motion.li>
                ))}

                {/* Training Link (Approved Users) */}
                {isLogin && UserStatus === "approved" && (
                    <motion.li variants={itemVariants} className="list-none">
                        <Link
                            href="/Trainings"
                            className={`text-sm lg:text-base font-bold cursor-pointer transition-all duration-300 px-3 py-2 rounded-lg border border-sky-500/30 block
                            ${pathname === "/Trainings"
                                    ? "text-sky-400 bg-sky-500/20 shadow-[0_0_15px_rgba(14,165,233,0.3)]"
                                    : "text-sky-300 hover:text-white hover:bg-sky-500/20 hover:shadow-[0_0_10px_rgba(14,165,233,0.2)]"
                                }`}
                        >
                            {t("training")}
                        </Link>
                    </motion.li>
                )}

                {/* Dashboard Link (Admin/Manager/Programmers) */}
                {isLogin && UserRole &&
                    ["ADMIN", "MANEGER", "PROGRAMER"].includes(UserRole) && (
                        <motion.li variants={itemVariants} className="list-none">
                            <Link
                                href="/Dashboard"
                                className={`text-sm lg:text-base font-bold cursor-pointer transition-all duration-300 px-3 py-2 rounded-lg border border-sky-500/30 block
                                ${pathname === "/Dashboard"
                                        ? "text-sky-400 bg-sky-500/20 shadow-[0_0_15px_rgba(14,165,233,0.3)]"
                                        : "text-sky-300 hover:text-white hover:bg-sky-500/20 hover:shadow-[0_0_10px_rgba(14,165,233,0.2)]"
                                    }`}
                            >
                                {/* @ts-ignore */}
                                {t("dashboard")}
                            </Link>
                        </motion.li>
                    )}

                {/* Admin Tasks Link (WEBSITE_ADMIN or PROGRAMER) */}
                {isLogin && UserRole &&
                    ["WEBSITE_ADMIN", "PROGRAMER", "MUSIC_ADMIN"].includes(UserRole) && (
                        <motion.li variants={itemVariants} className="list-none ml-2">
                            <Link
                                href="/Website_Admin_Profile"
                                className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full transition-all duration-300 border border-white/10
                                ${pathname === "/Website_Admin_Profile"
                                        ? "bg-rose-500/20 text-rose-400 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                                        : "bg-white/5 text-gray-300 hover:text-white hover:bg-rose-500/20 hover:border-rose-500/30 hover:shadow-[0_0_10px_rgba(244,63,94,0.2)]"
                                    }`}
                                title={"Admin Tasks"}
                            >
                                <ShieldAlert size={18} />
                            </Link>
                        </motion.li>
                    )}

                {/* User Profile Link (All Logged-in Users) */}
                {isLogin && (
                    <motion.li variants={itemVariants} className="list-none ml-2">
                        <Link
                            href={churchId && churchId !== 'undefined' && churchId !== 'null' ? "/Church_UserProfile" : "/normal_UserProfile"}
                            className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full transition-all duration-300 border border-white/10
                            ${pathname === "/Church_UserProfile" || pathname === "/normal_UserProfile"
                                    ? "bg-sky-500/20 text-sky-400 border-sky-500/30 shadow-[0_0_15px_rgba(14,165,233,0.3)]"
                                    : "bg-white/5 text-gray-300 hover:text-white hover:bg-sky-500/20 hover:border-sky-500/30 hover:shadow-[0_0_10px_rgba(14,165,233,0.2)]"
                                }`}
                            title={churchId && churchId !== 'undefined' && churchId !== 'null' ? t("church_profile") : t("userProfile")}
                        >
                            <User size={18} />
                        </Link>
                    </motion.li>
                )}

                {/* Mode Switcher Desktop */}
                <div className="relative">
                    <button
                        onClick={() => setModeMenuOpen(!modeMenuOpen)}
                        className="flex items-center gap-1 text-gray-300 hover:text-sky-400 transition"
                    >
                        {vocalsMode ? <Mic size={20} /> : <Music size={20} />}
                        <span className="text-xs sm:text-sm font-medium">{vocalsMode ? "Vocal" : "Musician"}</span>
                        <ChevronDown size={14} />
                    </button>

                    <AnimatePresence>
                        {modeMenuOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="absolute right-0 mt-2 w-48 bg-[#0f172a] border border-white/10 rounded-lg shadow-xl overflow-hidden py-1"
                            >
                                <button
                                    onClick={() => {
                                        setVocalsMode(true);
                                        setModeMenuOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition flex items-center gap-2
                                    ${vocalsMode ? "text-sky-400 font-bold bg-white/5" : "text-gray-300"}
                                    `}
                                >
                                    <Mic size={16} />
                                    <span>Vocal Mode</span>
                                </button>
                                <button
                                    onClick={() => {
                                        if (canUseMusicMode) {
                                            setVocalsMode(false);
                                        }
                                        setModeMenuOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-3 text-sm transition flex items-center gap-2
                                    ${canUseMusicMode
                                            ? !vocalsMode
                                                ? "text-sky-400 font-bold bg-white/5"
                                                : "text-gray-300 hover:bg-white/5"
                                            : "text-gray-400 cursor-not-allowed opacity-50 "
                                        }`}
                                    title={canUseMusicMode ? "Musician Mode" : "Musician mode coming soon"}
                                >
                                    <Music size={16} />
                                    <span>{canUseMusicMode ? "Musician Mode" : "Musician Mode (Soon)"}</span>
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Auth Section Desktop */}
                <div className="relative ml-2">
                    {!isLogin ? (
                        <div className="relative">
                            <button
                                onClick={() => setAuthMenuOpen(!authMenuOpen)}
                                className="flex items-center gap-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 px-4 py-2 rounded-full border border-sky-500/20 transition-all duration-300"
                            >
                                <User size={18} />
                                <span className="text-sm font-bold">{t("login")} / {t("register")}</span>
                                <ChevronDown size={14} className={'transition-transform duration-300 ' + (authMenuOpen ? 'rotate-180' : '')} />
                            </button>
                            <AnimatePresence>
                                {authMenuOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        className="absolute right-0 mt-2 w-48 bg-[#0f172a] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 z-50"
                                    >
                                        <Link
                                            href="/login"
                                            onClick={() => setAuthMenuOpen(false)}
                                            className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-sky-400 transition flex items-center gap-3"
                                        >
                                            <LogIn size={16} />
                                            <span>{t("login")}</span>
                                        </Link>
                                        <Link
                                            href="/Register"
                                            onClick={() => setAuthMenuOpen(false)}
                                            className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-sky-400 transition flex items-center gap-3"
                                        >
                                            <UserPlus size={16} />
                                            <span>{t("register")}</span>
                                        </Link>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ) : (
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-full border border-red-500/20 transition-all duration-300"
                            title={t("logout")}
                        >
                            <LogOut size={18} />
                            <span className="text-sm font-bold">{t("logout")}</span>
                        </button>
                    )}
                </div>

                {/* Language Switcher Desktop */}
                <div className="relative ml-2">
                    <button
                        onClick={() => setLangMenuOpen(!langMenuOpen)}
                        className="flex items-center gap-1 text-gray-300 hover:text-sky-400 transition"
                    >
                        <Globe size={20} />
                        <span className="uppercase text-sm font-medium">{language}</span>
                        <ChevronDown size={14} />
                    </button>

                    <AnimatePresence>
                        {langMenuOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="absolute right-0 mt-2 w-32 bg-[#0f172a] border border-white/10 rounded-lg shadow-xl overflow-hidden py-1"
                            >
                                {["en", "ar", "de"].map((lang) => (
                                    <button
                                        key={lang}
                                        onClick={() => {
                                            setLanguage(lang);
                                            setLangMenuOpen(false);
                                        }}
                                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-white/5 transition
                                        ${language === lang ? "text-sky-400 font-bold" : "text-gray-300"}
                                        `}
                                    >
                                        {lang === "en" ? "English" : lang === "ar" ? "العربية" : "Deutsch"}
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
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
                            {/* Mobile nav items */}
                            {navItems.map(({ name, path, id }) => (
                                <li key={name}>
                                    <Link
                                        href={path}
                                        onClick={(e) => handleNavClick(e, path, id)}
                                        className={`block w-full text-left px-4 py-3 rounded-xl transition-all font-medium text-sm
                                        ${pathname === path
                                                ? "bg-sky-500/20 text-sky-400"
                                                : "text-gray-300 hover:bg-white/5 hover:text-white"
                                            }`}
                                    >
                                        {t(name)}
                                    </Link>
                                </li>
                            ))}

                            {/* Mobile Training Button */}
                            {isLogin && UserStatus === "approved" && (
                                <li>
                                    <Link
                                        href="/Trainings"
                                        onClick={() => setMenuOpen(false)}
                                        className={`block w-full text-left px-4 py-3 rounded-xl transition-all font-bold text-sm border border-sky-500/30
                                        ${pathname === "/Trainings"
                                                ? "bg-sky-500/20 text-sky-400"
                                                : "text-sky-300 hover:bg-sky-500/20 hover:text-white"
                                            }`}
                                    >
                                        {t("training")}
                                    </Link>
                                </li>
                            )}

                            {/* Mobile Dashboard Button */}
                            {isLogin && UserRole && ["ADMIN", "MANEGER", "PROGRAMER"].includes(UserRole) && (
                                <li>
                                    <Link
                                        href="/Dashboard"
                                        onClick={() => setMenuOpen(false)}
                                        className={`block w-full text-left px-4 py-3 rounded-xl transition-all font-bold text-sm border border-sky-500/30
                                        ${pathname === "/Dashboard"
                                                ? "bg-sky-500/20 text-sky-400"
                                                : "text-sky-300 hover:bg-sky-500/20 hover:text-white"
                                            }`}
                                    >
                                        {t("dashboard")}
                                    </Link>
                                </li>
                            )}

                            {/* Mobile Admin Tasks Button */}
                            {isLogin && UserRole && ["WEBSITE_ADMIN", "PROGRAMER", "MUSIC_ADMIN"].includes(UserRole) && (
                                <li>
                                    <Link
                                        href="/Website_Admin_Profile"
                                        onClick={() => setMenuOpen(false)}
                                        className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl transition-all font-bold text-sm border border-transparent
                                        ${pathname === "/Website_Admin_Profile"
                                                ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                                                : "text-gray-300 hover:bg-white/5 hover:text-white"
                                            }`}
                                    >
                                        <ShieldAlert size={18} />
                                        Admin Tasks
                                    </Link>
                                </li>
                            )}

                            {/* Mobile User Profile Button */}
                            {isLogin && (
                                <li>
                                    <Link
                                        href={churchId && churchId !== 'undefined' && churchId !== 'null' ? "/Church_UserProfile" : "/normal_UserProfile"}
                                        onClick={() => setMenuOpen(false)}
                                        className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl transition-all font-bold text-sm border border-transparent
                                        ${pathname === "/Church_UserProfile" || pathname === "/normal_UserProfile"
                                                ? "bg-sky-500/20 text-sky-400 border-sky-500/30"
                                                : "text-gray-300 hover:bg-white/5 hover:text-white"
                                            }`}
                                    >
                                        <User size={18} />
                                        {churchId && churchId !== 'undefined' && churchId !== 'null' ? t("church_profile") : t("userProfile")}
                                    </Link>
                                </li>
                            )}

                            {/* Mobile Mode Switcher */}
                            <li className="w-full">
                                <div className="relative w-full">
                                    <button
                                        onClick={() => setModeMenuOpen(!modeMenuOpen)}
                                        className="flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all font-medium text-sm text-gray-300 hover:bg-white/5 hover:text-white"
                                    >
                                        <span className="flex items-center gap-2">
                                            {vocalsMode ? <Mic size={20} /> : <Music size={20} />}
                                            <span>{vocalsMode ? "Vocal Mode" : "Musician Mode"}</span>
                                        </span>
                                        <ChevronDown size={14} className={'transition-transform ' + (modeMenuOpen ? 'rotate-180' : '')} />
                                    </button>

                                    <AnimatePresence>
                                        {modeMenuOpen && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                exit={{ opacity: 0, height: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="mt-1 bg-[#0f172a] border border-white/10 rounded-lg shadow-inner overflow-hidden py-1"
                                            >
                                                <button
                                                    onClick={() => {
                                                        setVocalsMode(true);
                                                        setModeMenuOpen(false);
                                                        setMenuOpen(false);
                                                    }}
                                                    className={`w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition flex items-center gap-2
                                                    ${vocalsMode ? "text-sky-400 font-bold bg-white/5" : "text-gray-300"}
                                                    `}
                                                >
                                                    <Mic size={16} />
                                                    <span>Vocal Mode</span>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (canUseMusicMode) {
                                                            setVocalsMode(false);
                                                        }
                                                        setModeMenuOpen(false);
                                                        setMenuOpen(false);
                                                    }}
                                                    className={`w-full text-left px-4 py-3 text-sm transition flex items-center gap-2
                                                    ${canUseMusicMode
                                                            ? !vocalsMode
                                                                ? "text-sky-400 font-bold bg-white/5"
                                                                : "text-gray-300 hover:bg-white/5"
                                                            : "text-gray-400 cursor-not-allowed opacity-70 blur-sm"
                                                        }`}
                                                    title={canUseMusicMode ? "Musician Mode" : "Musician mode coming soon"}
                                                >
                                                    <Music size={16} />
                                                    <span>{canUseMusicMode ? "Musician Mode" : "Musician Mode (Soon)"}</span>
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </li>

                            {/* Mobile Language Switcher */}
                            <li className="w-full">
                                <div className="relative w-full">
                                    <button
                                        onClick={() => setLangMenuOpen(!langMenuOpen)}
                                        className="flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all font-medium text-sm text-gray-300 hover:bg-white/5 hover:text-white"
                                    >
                                        <span className="flex items-center gap-2">
                                            <Globe size={20} />
                                            <span className="uppercase">{language}</span>
                                        </span>
                                        <ChevronDown size={14} className={'transition-transform ' + (langMenuOpen ? 'rotate-180' : '')} />
                                    </button>

                                    <AnimatePresence>
                                        {langMenuOpen && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                exit={{ opacity: 0, height: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="mt-1 bg-[#0f172a] border border-white/10 rounded-lg shadow-inner overflow-hidden py-1"
                                            >
                                                {["en", "ar", "de"].map((lang) => (
                                                    <button
                                                        key={lang}
                                                        onClick={() => {
                                                            setLanguage(lang);
                                                            setLangMenuOpen(false);
                                                            setMenuOpen(false);
                                                        }}
                                                        className={
                                                            'block w-full text-left px-4 py-2 text-sm hover:bg-white/5 transition ' +
                                                            (language === lang ? 'text-sky-400 font-bold' : 'text-gray-300')
                                                        }
                                                    >
                                                        {lang === "en" ? "English" : lang === "ar" ? "العربية" : "Deutsch"}
                                                    </button>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </li>

                            {/* Mobile Auth Buttons */}
                            <li className="w-full mt-2 pt-2 border-t border-white/10">
                                {!isLogin ? (
                                    <div className="flex flex-col gap-2 p-2">
                                        <Link
                                            href="/login"
                                            onClick={() => setMenuOpen(false)}
                                            className="flex items-center justify-center gap-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 px-4 py-2 rounded-xl border border-sky-500/20 transition-all duration-300"
                                        >
                                            <LogIn size={18} />
                                            <span className="text-sm font-bold">{t("login")}</span>
                                        </Link>
                                        <Link
                                            href="/Register"
                                            onClick={() => setMenuOpen(false)}
                                            className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-gray-300 px-4 py-2 rounded-xl border border-transparent transition-all duration-300"
                                        >
                                            <UserPlus size={18} />
                                            <span className="text-sm font-bold">{t("register")}</span>
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="p-2">
                                        <button
                                            onClick={() => {
                                                handleLogout();
                                                setMenuOpen(false);
                                            }}
                                            className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-xl border border-red-500/20 transition-all duration-300"
                                        >
                                            <LogOut size={18} />
                                            <span className="text-sm font-bold">{t("logout")}</span>
                                        </button>
                                    </div>
                                )}
                            </li>
                        </motion.ul>
                    )}
                </AnimatePresence>
            </div>
        </nav>
    );
}
