"use client";
import React, { useContext, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, UserPlus, LogIn, Dumbbell, LayoutDashboard, User, X, Lock } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { UserContext } from "../context/User_Context";

export default function TeamsPage() {
    const { t } = useLanguage();
    const router = useRouter();
    const {
        isLogin, setLogin,
        UserRole, setUserRole,
        UserStatus, setUserStatus,
        churchId, setChurchId,
        teams, setTeams
    } = useContext(UserContext);

    const [modalType, setModalType] = useState(null); // "join" | "create" | null
    const [teamNameInput, setTeamNameInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [justUnlocked, setJustUnlocked] = useState(false);

    const hasTeam = UserStatus === "approved";
    const isManager = UserRole && ["ADMIN", "MANEGER", "PROGRAMER"].includes(UserRole);
    const hasChurch = churchId && churchId !== "undefined" && churchId !== "null";

    const handleJoinTeam = async () => {
        if (!teamNameInput) return;
        setLoading(true);
        try {
            const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/users/join-team`, { churchName: teamNameInput }, {
                headers: { Authorization: `Bearer ${isLogin}` }
            });
            alert(res.data.msg);
            setModalType(null);
            setTeamNameInput("");
        } catch (err) {
            alert(err.response?.data?.msg || "Error joining team");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateTeam = async () => {
        if (!teamNameInput) return;
        setLoading(true);
        try {
            const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/team/createTeam`, { name: teamNameInput }, {
                headers: { Authorization: `Bearer ${isLogin}` }
            });

            const { token, role, churchId: newChurchId, status } = res.data || {};
            if (token) {
                localStorage.setItem("user_Taspe7_Token", token);
                setLogin(token);
            }
            if (role) {
                localStorage.setItem("user_Taspe7_Role", role);
                setUserRole(role);
            }
            if (newChurchId) {
                localStorage.setItem("user_Taspe7_ChurchId", newChurchId);
                setChurchId(newChurchId);
            }
            if (status) {
                localStorage.setItem("user_Taspe7_Status", status);
                setUserStatus(status);
            }

            const activeToken = token || isLogin;
            const teamsRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users/my-teams`, {
                headers: { Authorization: `Bearer ${activeToken}` }
            });
            const newTeams = teamsRes.data || [];
            setTeams(newTeams);
            localStorage.setItem("user_Taspe7_Teams", JSON.stringify(newTeams));

            setModalType(null);
            setTeamNameInput("");
            setJustUnlocked(true);
            setTimeout(() => setJustUnlocked(false), 1500);
        } catch (err) {
            alert(err.response?.data?.message || "Error creating team");
        } finally {
            setLoading(false);
        }
    };

    // Redirect if not logged in
    if (!isLogin) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0b0f19] px-4">
                <div className="text-center">
                    <Users size={48} className="mx-auto text-gray-500 mb-4" />
                    <h2 className="text-xl font-bold text-white mb-2">Please log in first</h2>
                    <p className="text-gray-400 mb-6 text-sm">You need to be logged in to access Teams.</p>
                    <Link href="/login" className="inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-6 py-2.5 rounded-xl font-bold transition-all">
                        <LogIn size={18} />
                        Login
                    </Link>
                </div>
            </div>
        );
    }

    const cards = [
        {
            id: "create-join",
            title: "Create / Join Team",
            description: "Start a new team or join an existing one",
            icon: <UserPlus size={28} />,
            color: "sky",
            available: true,
            action: () => {},
            isDouble: true,
        },
        {
            id: "training",
            title: t("training"),
            description: hasTeam ? "Access your training sessions" : "Create or join a team to unlock",
            icon: <Dumbbell size={28} />,
            color: "emerald",
            available: hasTeam,
            action: () => router.push("/Trainings"),
        },
        {
            id: "dashboard",
            title: t("dashboard"),
            description: isManager ? "Manage your team" : "Only available for team managers",
            icon: <LayoutDashboard size={28} />,
            color: "violet",
            available: isManager,
            action: () => router.push("/Dashboard"),
        },
        {
            id: "profile",
            title: hasChurch ? t("church_profile") : t("userProfile"),
            description: hasTeam ? "View your team profile" : "Create or join a team to unlock",
            icon: <User size={28} />,
            color: "amber",
            available: hasTeam,
            action: () => router.push(hasChurch ? "/Church_UserProfile" : "/normal_UserProfile"),
        },
    ];

    const visibleCards = hasTeam ? cards : cards.filter(c => c.id === "create-join");

    const colorMap = {
        sky: { border: "border-sky-500/30", bg: "bg-sky-500/10", text: "text-sky-400", hover: "hover:border-sky-500/50 hover:bg-sky-500/15", shadow: "shadow-sky-500/5" },
        emerald: { border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-400", hover: "hover:border-emerald-500/50 hover:bg-emerald-500/15", shadow: "shadow-emerald-500/5" },
        violet: { border: "border-violet-500/30", bg: "bg-violet-500/10", text: "text-violet-400", hover: "hover:border-violet-500/50 hover:bg-violet-500/15", shadow: "shadow-violet-500/5" },
        amber: { border: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-400", hover: "hover:border-amber-500/50 hover:bg-amber-500/15", shadow: "shadow-amber-500/5" },
    };

    return (
        <div className="min-h-screen bg-[#0b0f19] px-4 py-10 sm:py-16">
            <div className="max-w-2xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-10"
                >
                    <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Teams</h1>
                    <p className="text-gray-400 text-sm">Manage your team, training, and profile</p>
                </motion.div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <AnimatePresence>
                        {visibleCards.map((card, i) => {
                        const c = colorMap[card.color];
                        const disabled = !card.available;

                        if (card.isDouble) {
                            // Create / Join — two buttons side by side
                            return (
                                <motion.div
                                    key={card.id}
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.08 }}
                                    className="sm:col-span-2"
                                >
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => setModalType("create")}
                                            className={`flex flex-col items-center gap-2 p-5 rounded-xl border ${c.border} ${c.bg} ${c.hover} transition-all cursor-pointer group`}
                                        >
                                            <div className={`${c.text} group-hover:scale-110 transition-transform`}>
                                                <Users size={28} />
                                            </div>
                                            <span className="text-white font-semibold text-sm">Create Team</span>
                                        </button>
                                        <button
                                            onClick={() => setModalType("join")}
                                            className={`flex flex-col items-center gap-2 p-5 rounded-xl border ${c.border} ${c.bg} ${c.hover} transition-all cursor-pointer group`}
                                        >
                                            <div className={`${c.text} group-hover:scale-110 transition-transform`}>
                                                <UserPlus size={28} />
                                            </div>
                                            <span className="text-white font-semibold text-sm">Join Team</span>
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        }

                        return (
                            <motion.button
                                key={card.id}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0, scale: justUnlocked && !disabled ? [1, 1.03, 1] : 1 }}
                                transition={{ delay: i * 0.08, scale: { duration: 0.5 } }}
                                onClick={disabled ? undefined : card.action}
                                className={`relative flex flex-col items-start gap-3 p-5 rounded-xl border text-left transition-all overflow-hidden
                                    ${disabled
                                        ? "border-white/5 bg-white/[0.02] cursor-not-allowed opacity-50"
                                        : `${c.border} ${c.bg} ${c.hover} cursor-pointer shadow-lg ${c.shadow}`
                                    }`}
                            >
                                {justUnlocked && !disabled && (
                                    <motion.div
                                        initial={{ x: "-100%", opacity: 0.8 }}
                                        animate={{ x: "200%", opacity: 0 }}
                                        transition={{ duration: 0.8, ease: "easeInOut" }}
                                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none rounded-xl"
                                    />
                                )}
                                <div className={`${disabled ? "text-gray-600" : c.text}`}>
                                    {card.icon}
                                </div>
                                <div>
                                    <h3 className={`font-semibold text-sm ${disabled ? "text-gray-500" : "text-white"}`}>
                                        {card.title}
                                    </h3>
                                    <p className={`text-xs mt-0.5 ${disabled ? "text-gray-600" : "text-gray-400"}`}>
                                        {card.description}
                                    </p>
                                </div>
                                {disabled && (
                                    <Lock size={14} className="absolute top-4 right-4 text-gray-600" />
                                )}
                            </motion.button>
                        );
                    })}
                    </AnimatePresence>
                </div>
            </div>

            {/* Modal */}
            <AnimatePresence>
                {modalType && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                            onClick={() => { setModalType(null); setTeamNameInput(""); }}
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative bg-[#1e293b] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
                        >
                            <button
                                onClick={() => { setModalType(null); setTeamNameInput(""); }}
                                className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                            <h2 className="text-2xl font-bold text-white mb-6">
                                {modalType === "join" ? "Join Team" : "Create Team"}
                            </h2>
                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className="text-sm text-gray-400 mb-1 block">Team Name</label>
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
                                    onClick={modalType === "join" ? handleJoinTeam : handleCreateTeam}
                                    disabled={loading}
                                    className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 rounded-xl shadow-lg transition-all disabled:opacity-50"
                                >
                                    {loading ? "Processing..." : (modalType === "join" ? "Request to Join" : "Create Team")}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
