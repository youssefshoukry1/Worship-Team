"use client";
import React, { useEffect, useRef, useState, useContext } from "react";
import axios from "axios";
import { motion, AnimatePresence, easeOut } from "framer-motion";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Menu, X, Globe, ChevronDown, Mic, Music, User, LogOut, LogIn, UserPlus, ShieldAlert, Users } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
// Adjust import according to your file structure
import { UserContext } from "../context/User_Context";
import Image from "next/image";

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
    const [teamsMenuOpen, setTeamsMenuOpen] = useState(false);
    const [joinTeamModalOpen, setJoinTeamModalOpen] = useState(false);
    const [createTeamModalOpen, setCreateTeamModalOpen] = useState(false);
    const [teamNameInput, setTeamNameInput] = useState("");
    const [teamActionLoading, setTeamActionLoading] = useState(false);

    const handleJoinTeam = async () => {
        if (!teamNameInput) return;
        setTeamActionLoading(true);
        try {
            const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/users/join-team`, { churchName: teamNameInput }, {
                headers: { Authorization: `Bearer ${isLogin}` }
            });
            alert(res.data.msg);
            setJoinTeamModalOpen(false);
            setTeamNameInput("");
        } catch (err) {
            alert(err.response?.data?.msg || "Error joining team");
        } finally {
            setTeamActionLoading(false);
        }
    };

    const handleCreateTeam = async () => {
        if (!teamNameInput) return;
        setTeamActionLoading(true);
        try {
            const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/church/createChurch`, { name: teamNameInput }, {
                headers: { Authorization: `Bearer ${isLogin}` }
            });
            alert("Team created successfully! You are now the manager. Re-login to apply changes.");
            setCreateTeamModalOpen(false);
            setTeamNameInput("");
        } catch (err) {
            alert(err.response?.data?.message || "Error creating team");
        } finally {
            setTeamActionLoading(false);
        }
    };
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
       <nav className="sticky top-0 z-50 h-20 px-2 flex items-center justify-between bg-[#0b0f19]/60 backdrop-blur-md border-b border-white/10">
            {/* Responsive & Fast Logo */}
            <Link
                href="/"
                className="relative flex items-center transition-transform hover:scale-105 active:scale-95"
            >
                <Image
                    src="/wasla0.svg"
                    alt="Logo"
                    width={110}
                    height={40}
                    priority
                    sizes="(max-width: 640px) 85px, (max-width: 768px) 100px, 110px"
                    className="w-20 sm:w-24 md:w-28 h-auto object-contain "
                />
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
                                title={t("adminTasks")}

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

                {/* Teams Dropdown Desktop */}
                {isLogin && (
                    <div className="relative ml-2">
                        <button
                            onClick={() => setTeamsMenuOpen(!teamsMenuOpen)}
                            className="flex items-center gap-1 text-gray-300 hover:text-sky-400 transition"
                        >
                            <Users size={20} />
                            <span className="text-sm font-medium">Teams</span>
                            <ChevronDown size={14} className={'transition-transform duration-300 ' + (teamsMenuOpen ? 'rotate-180' : '')} />
                        </button>
                        <AnimatePresence>
                            {teamsMenuOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute right-0 mt-2 w-40 bg-[#0f172a] border border-white/10 rounded-lg shadow-xl overflow-hidden py-1"
                                >
                                    <button
                                        onClick={() => { setJoinTeamModalOpen(true); setTeamsMenuOpen(false); }}
                                        className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-sky-400 transition block"
                                    >
                                        Join Team
                                    </button>
                                    <button
                                        onClick={() => { setCreateTeamModalOpen(true); setTeamsMenuOpen(false); }}
                                        className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-sky-400 transition block"
                                    >
                                        Create Team
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {/* Mode Switcher Desktop */}
                <div className="relative">
                    <button
                        onClick={() => setModeMenuOpen(!modeMenuOpen)}
                        className="flex items-center gap-1 text-gray-300 hover:text-sky-400 transition"
                    >
                        {vocalsMode ? <Mic size={20} /> : <Music size={20} />}
                        <span className="text-xs sm:text-sm font-medium">{vocalsMode ? t("vocal") : t("musician")}</span>

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
                                    <span>{t("vocalMode")}</span>
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
                                            : "text-gray-400 cursor-not-allowed opacity-70 "
                                        }`}
                                    title={canUseMusicMode ? t("musicianMode") : t("musicianModeSoon")}
                                >
                                    <Music size={16} />
                                    <span>{canUseMusicMode ? t("musicianMode") : t("musicianModeSoon")}</span>
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
                                {["en", "ar"].map((lang) => (
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
                                        {t("adminTasks")}
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

                            {/* Mobile Teams Dropdown */}
                            {isLogin && (
                                <li className="w-full">
                                    <div className="relative w-full">
                                        <button
                                            onClick={() => setTeamsMenuOpen(!teamsMenuOpen)}
                                            className="flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all font-medium text-sm text-gray-300 hover:bg-white/5 hover:text-white"
                                        >
                                            <span className="flex items-center gap-2">
                                                <Users size={20} />
                                                <span>Teams</span>
                                            </span>
                                            <ChevronDown size={14} className={'transition-transform ' + (teamsMenuOpen ? 'rotate-180' : '')} />
                                        </button>

                                        <AnimatePresence>
                                            {teamsMenuOpen && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: "auto" }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="mt-1 bg-[#0f172a] border border-white/10 rounded-lg shadow-inner overflow-hidden py-1"
                                                >
                                                    <button
                                                        onClick={() => {
                                                            setJoinTeamModalOpen(true);
                                                            setTeamsMenuOpen(false);
                                                            setMenuOpen(false);
                                                        }}
                                                        className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition flex items-center gap-2 text-gray-300"
                                                    >
                                                        Join Team
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setCreateTeamModalOpen(true);
                                                            setTeamsMenuOpen(false);
                                                            setMenuOpen(false);
                                                        }}
                                                        className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition flex items-center gap-2 text-gray-300"
                                                    >
                                                        Create Team
                                                    </button>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
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
                                            <span>{vocalsMode ? t("vocalMode") : t("musicianMode")}</span>
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
                                                    <span>{t("vocalMode")}</span>
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
                                                            : "text-gray-400 cursor-not-allowed opacity-50 "
                                                        }`}
                                                    title={canUseMusicMode ? t("musicianMode") : t("musicianModeSoon")}
                                                >
                                                    <Music size={16} />
                                                    <span>{canUseMusicMode ? t("musicianMode") : t("musicianModeSoon")}</span>
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
                                                {["en", "ar"].map((lang) => (
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

            {/* Modals */}
            <AnimatePresence>
                {(joinTeamModalOpen || createTeamModalOpen) && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                            onClick={() => {
                                setJoinTeamModalOpen(false);
                                setCreateTeamModalOpen(false);
                                setTeamNameInput("");
                            }}
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative bg-[#1e293b] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl overflow-hidden"
                        >
                            <button
                                onClick={() => {
                                    setJoinTeamModalOpen(false);
                                    setCreateTeamModalOpen(false);
                                    setTeamNameInput("");
                                }}
                                className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                            <h2 className="text-2xl font-bold text-white mb-6">
                                {joinTeamModalOpen ? "Join Team" : "Create Team"}
                            </h2>
                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className="text-sm text-gray-400 mb-1 block">Team (Church) Name</label>
                                    <input
                                        type="text"
                                        value={teamNameInput}
                                        onChange={(e) => setTeamNameInput(e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-sky-500/50 transition-colors"
                                        placeholder="Enter team name..."
                                        autoFocus
                                    />
                                </div>
                                <button
                                    onClick={joinTeamModalOpen ? handleJoinTeam : handleCreateTeam}
                                    disabled={teamActionLoading}
                                    className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 rounded-xl shadow-lg transition-all disabled:opacity-50"
                                >
                                    {teamActionLoading ? "Processing..." : (joinTeamModalOpen ? "Request to Join" : "Create Team")}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </nav>
    );
}
