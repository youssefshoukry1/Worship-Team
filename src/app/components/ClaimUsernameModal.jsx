"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import axios from "axios";

// Validation rules: only letters, numbers, and underscores (no spaces, @, ^, ~, !, ?, etc.)
const validateUsernameFormat = (name) => {
  if (!name || name.trim().length === 0) {
    return { valid: false, reason: "Please enter or pick a username" };
  }
  if (name.length > 30) {
    return { valid: false, reason: "Username cannot exceed 30 characters" };
  }
  if (!/^[a-z0-9_]+$/.test(name)) {
    return {
      valid: false,
      reason: "Spaces and symbols (@, !, ?, ^, ~, etc.) are not allowed. Only letters, numbers, and underscores (_).",
    };
  }
  return { valid: true };
};

export default function ClaimUsernameModal({ token, initialSuggestion = "", onSuccess }) {
  // Generate initial base handle from suggestion or fallback
  const baseSuggestion = useMemo(() => {
    const cleaned = (initialSuggestion || "")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .toLowerCase()
      .slice(0, 20);
    return cleaned || "user_wasla";
  }, [initialSuggestion]);

  // Quick recommendation chips for the user
  const recommendedHandles = useMemo(() => {
    return [
      baseSuggestion,
      `${baseSuggestion}_1`,
      `${baseSuggestion}_7`,
    ];
  }, [baseSuggestion]);

  const [username, setUsername] = useState(baseSuggestion);
  const [status, setStatus] = useState("idle"); // idle | checking | available | taken | invalid
  const [statusMsg, setStatusMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const checkTimer = useRef(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://worship-team-api.onrender.com/api";

  const checkAvailability = useCallback(async (name) => {
    const check = validateUsernameFormat(name);
    if (!check.valid) {
      setStatus("invalid");
      setStatusMsg(check.reason);
      return;
    }

    setStatus("checking");
    setStatusMsg("Checking availability...");

    try {
      const res = await axios.get(`${apiBase}/users/check-username?q=${encodeURIComponent(name)}`);
      if (res.data.available) {
        setStatus("available");
        setStatusMsg(`@${name} is available!`);
      } else {
        setStatus("taken");
        setStatusMsg(res.data.reason || `@${name} is already taken`);
      }
    } catch (err) {
      const msg = err.response?.data?.reason || err.response?.data?.msg || "Unavailable";
      setStatus("taken");
      setStatusMsg(msg);
    }
  }, [apiBase]);

  const handleInputChange = (e) => {
    // Automatically sanitize spaces and convert to lowercase
    const val = e.target.value.toLowerCase().replace(/\s+/g, "");
    setUsername(val);

    if (checkTimer.current) clearTimeout(checkTimer.current);

    const check = validateUsernameFormat(val);
    if (!check.valid) {
      setStatus("invalid");
      setStatusMsg(check.reason);
      return;
    }

    checkTimer.current = setTimeout(() => {
      checkAvailability(val);
    }, 300);
  };

  const handlePickSuggestion = (handle) => {
    setUsername(handle);
    if (checkTimer.current) clearTimeout(checkTimer.current);
    checkAvailability(handle);
  };

  // Automatically check the pre-filled recommendation on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (username) {
        checkAvailability(username);
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
  }, [checkAvailability, username]);

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
          <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
            Spaces and symbols (@, !, ?, ^, ~, etc.) are not allowed. You can only use letters, numbers, and underscores (_).
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
                onChange={handleInputChange}
                maxLength={30}
                required
                autoFocus
                placeholder="username"
                className="w-full pl-8 pr-10 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors text-sm font-mono"
              />
              {status === "checking" && (
                <div className="absolute right-3 w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
              )}
            </div>

            {statusMsg && (
              <p
                className={`text-xs mt-2 flex items-center gap-1 font-medium ${
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

            {/* Recommended suggestions chips */}
            <div className="mt-3.5 pt-3 border-t border-slate-800/80">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Recommended for you:
              </span>
              <div className="flex flex-wrap gap-2">
                {recommendedHandles.map((handle) => (
                  <button
                    key={handle}
                    type="button"
                    onClick={() => handlePickSuggestion(handle)}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-mono transition-colors ${
                      username === handle
                        ? "bg-sky-500/20 border-sky-500 text-sky-300 font-semibold"
                        : "bg-slate-800/80 border-slate-700 hover:border-slate-600 text-slate-300"
                    }`}
                  >
                    @{handle}
                  </button>
                ))}
              </div>
            </div>
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
