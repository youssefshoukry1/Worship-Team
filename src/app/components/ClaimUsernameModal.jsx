"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";

export default function ClaimUsernameModal({ token, initialSuggestion = "", onSuccess }) {
  const [username, setUsername] = useState(
    initialSuggestion.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase().slice(0, 20)
  );
  const [status, setStatus] = useState("idle"); // idle | checking | available | taken | invalid
  const [statusMsg, setStatusMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const checkTimer = useRef(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://worship-team-api.onrender.com/api";

  const checkAvailability = async (name) => {
    if (!name || name.length < 3) {
      setStatus("invalid");
      setStatusMsg("Minimum 3 characters");
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) {
      setStatus("invalid");
      setStatusMsg("Only letters, numbers, and underscores");
      return;
    }

    setStatus("checking");
    setStatusMsg("Checking availability...");

    try {
      const res = await axios.get(`${apiBase}/users/check-username?q=${encodeURIComponent(name)}`);
      if (res.data.available) {
        setStatus("available");
        setStatusMsg("Username is available!");
      } else {
        setStatus("taken");
        setStatusMsg(res.data.reason || "Username is already taken");
      }
    } catch (err) {
      const msg = err.response?.data?.reason || err.response?.data?.msg || "Unavailable";
      setStatus("taken");
      setStatusMsg(msg);
    }
  };

  const handleChange = (e) => {
    const clean = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(clean);

    if (checkTimer.current) clearTimeout(checkTimer.current);

    if (clean.length >= 3) {
      checkTimer.current = setTimeout(() => {
        checkAvailability(clean);
      }, 300);
    } else {
      setStatus("invalid");
      setStatusMsg("Minimum 3 characters");
    }
  };

  useEffect(() => {
    if (username.length >= 3) {
      checkAvailability(username);
    }
    return () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status !== "available" || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await axios.post(
        `${apiBase}/users/set-username`,
        { username },
        {
          headers: {
            Authorization: `Bearer ${token || localStorage.getItem("user_Taspe7_Token")}`,
          },
        }
      );

      const finalUsername = res.data.username || username;
      localStorage.setItem("user_Taspe7_Username", finalUsername);
      if (onSuccess) onSuccess(finalUsername);
    } catch (err) {
      setStatus("taken");
      setStatusMsg(err.response?.data?.msg || "Failed to set username");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-white">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sky-500/10 text-sky-400 font-bold text-xl mb-3 border border-sky-500/20">
            @
          </div>
          <h3 className="text-xl font-bold text-slate-100">Choose your @username</h3>
          <p className="text-sm text-slate-400 mt-1">
            Pick a unique handle so friends and teammates can find you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Username
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-slate-400 font-semibold text-base select-none">
                @
              </span>
              <input
                type="text"
                value={username}
                onChange={handleChange}
                maxLength={20}
                required
                autoFocus
                placeholder="username"
                className="w-full pl-8 pr-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors text-sm"
              />
            </div>

            {statusMsg && (
              <p
                className={`text-xs mt-2 flex items-center gap-1 ${
                  status === "available"
                    ? "text-emerald-400"
                    : status === "checking"
                    ? "text-sky-400"
                    : "text-rose-400"
                }`}
              >
                {statusMsg}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={status !== "available" || isSubmitting}
            className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all shadow-md ${
              status === "available" && !isSubmitting
                ? "bg-sky-500 hover:bg-sky-400 text-white cursor-pointer active:scale-98"
                : "bg-slate-800 text-slate-500 cursor-not-allowed"
            }`}
          >
            {isSubmitting ? "Saving..." : "Confirm @username"}
          </button>
        </form>
      </div>
    </div>
  );
}
