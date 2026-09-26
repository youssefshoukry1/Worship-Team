"use client";

import React, { useContext, useEffect, useRef, useState } from "react";
import Script from "next/script";
import axios from "axios";
import { UserContext } from "../context/User_Context";
import { useLanguage } from "../context/LanguageContext";
import ClaimUsernameModal from "./ClaimUsernameModal";

export default function AuthForm({ initialMode = "otp" }) {
  const { t } = useLanguage();
  const { setLogin, setTeams, setUsername } = useContext(UserContext);

  const [mode, setMode] = useState(initialMode); // 'otp' | 'password'
  const [otpStep, setOtpStep] = useState(1); // 1: enter email, 2: enter code
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [password, setPassword] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Post-auth username claim
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [pendingToken, setPendingToken] = useState(null);
  const [suggestedUsername, setSuggestedUsername] = useState("");

  const googleBtnRef = useRef(null);
  const cooldownTimer = useRef(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://worship-team-api.onrender.com/api";
  const googleClientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    "984547740511-7rpebq39vq1vife50heqavik47fqh9hc.apps.googleusercontent.com";

  // Handles successful auth response
  const handleAuthSuccess = (data) => {
    const token = data?.token;
    const user = data?.user;

    localStorage.setItem("user_Taspe7_Token", token);
    localStorage.setItem("user_Taspe7_ID", user?.id || user?._id || "");
    localStorage.setItem("user_Taspe7_GlobalRole", user?.global_role || "USER");
    localStorage.setItem("user_Taspe7_SubRole", user?.sub_role || "");
    localStorage.setItem("user_Taspe7_ChurchId", user?.churchId || "");
    localStorage.setItem("user_Taspe7_Status", user?.status || "approved");
    localStorage.setItem("user_Taspe7_Email", user?.email || "");

    const teams = user?.teams || [];
    localStorage.setItem("user_Taspe7_Teams", JSON.stringify(teams));

    if (user?.username) {
      localStorage.setItem("user_Taspe7_Username", user.username);
      if (setUsername) setUsername(user.username);
    }

    setLogin(token);
    if (setTeams) setTeams(teams);

    if (data.needsUsername || !user?.username) {
      setPendingToken(token);
      setSuggestedUsername(user?.Name || user?.email?.split("@")[0] || "");
      setShowUsernameModal(true);
    } else {
      window.location.href = "/";
    }
  };

  // Google credential callback
  const handleGoogleCallback = async (response) => {
    if (!response?.credential) return;
    setIsLoading(true);
    setErrorMsg("");

    try {
      const res = await axios.post(`${apiBase}/users/google-auth`, {
        credential: response.credential,
      });
      handleAuthSuccess(res.data);
    } catch (err) {
      setErrorMsg(err.response?.data?.msg || "Google authentication failed");
      setIsLoading(false);
    }
  };

  // Initialize Google Identity Services
  const setupGoogleButton = () => {
    if (typeof window !== "undefined" && window.google?.accounts?.id && googleBtnRef.current) {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCallback,
      });

      googleBtnRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: "outline",
        size: "large",
        shape: "rectangular",
        width: 340,
        text: "continue_with",
      });
    }
  };

  useEffect(() => {
    setupGoogleButton();
  }, [mode]);

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown > 0) {
      cooldownTimer.current = setTimeout(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(cooldownTimer.current);
  }, [resendCooldown]);

  // Send OTP code
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (!email || !email.includes("@")) {
      setErrorMsg("Please enter a valid email address");
      return;
    }

    setIsLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await axios.post(`${apiBase}/users/send-otp`, { email });
      setSuccessMsg(res.data.msg || "Code sent to your email");
      setOtpStep(2);
      setResendCooldown(60);
    } catch (err) {
      setErrorMsg(err.response?.data?.msg || "Failed to send code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Verify OTP code
  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    if (otpCode.length < 6) {
      setErrorMsg("Please enter the 6-digit code");
      return;
    }

    setIsLoading(true);
    setErrorMsg("");

    try {
      const res = await axios.post(`${apiBase}/users/verify-otp`, {
        email,
        code: otpCode,
      });
      handleAuthSuccess(res.data);
    } catch (err) {
      setErrorMsg(err.response?.data?.msg || "Invalid or expired code");
      setIsLoading(false);
    }
  };

  // Password Login
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg("");

    try {
      const res = await axios.post(`${apiBase}/users/login`, { email, password });
      handleAuthSuccess(res.data);
    } catch (err) {
      setErrorMsg(err.response?.data?.msg || err.response?.data?.message || "Invalid credentials");
      setIsLoading(false);
    }
  };

  const handleOtpInputChange = (val) => {
    const clean = val.replace(/\D/g, "").slice(0, 6);
    setOtpCode(clean);
    if (clean.length === 6) {
      // Auto verify on 6th digit
      setIsLoading(true);
      setErrorMsg("");
      axios
        .post(`${apiBase}/users/verify-otp`, { email, code: clean })
        .then((res) => handleAuthSuccess(res.data))
        .catch((err) => {
          setErrorMsg(err.response?.data?.msg || "Invalid or expired code");
          setIsLoading(false);
        });
    }
  };

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={setupGoogleButton}
      />

      <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 text-white">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold tracking-tight text-white">
            {mode === "otp" ? "Sign in to Taspe7" : "Password Login"}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {mode === "otp"
              ? otpStep === 1
                ? "Fast, passwordless access with Google or Email code"
                : `Enter the 6-digit code sent to ${email}`
              : "Enter your registered email and password"}
          </p>
        </div>

        {/* Status Alerts */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl text-xs font-medium bg-rose-500/10 border border-rose-500/20 text-rose-300">
            {errorMsg}
          </div>
        )}
        {successMsg && !errorMsg && (
          <div className="mb-4 p-3 rounded-xl text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
            {successMsg}
          </div>
        )}

        {/* Google Sign-in */}
        {otpStep === 1 && (
          <div className="mb-5 flex flex-col items-center">
            <div ref={googleBtnRef} id="google-signin-btn" className="min-h-[44px] flex items-center justify-center" />
            <div className="relative w-full my-5 flex items-center justify-center">
              <div className="w-full border-t border-slate-800" />
              <span className="absolute bg-slate-900 px-3 text-[11px] uppercase tracking-wider text-slate-500">
                or continue with email
              </span>
            </div>
          </div>
        )}

        {/* OTP Flow */}
        {mode === "otp" && (
          <>
            {otpStep === 1 ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="name@example.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all shadow-md ${
                    isLoading
                      ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                      : "bg-sky-500 hover:bg-sky-400 text-white cursor-pointer active:scale-98"
                  }`}
                >
                  {isLoading ? "Sending code..." : "Continue with Email Code"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      6-Digit Code
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpStep(1);
                        setOtpCode("");
                        setErrorMsg("");
                      }}
                      className="text-xs text-sky-400 hover:underline"
                    >
                      Change email
                    </button>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otpCode}
                    onChange={(e) => handleOtpInputChange(e.target.value)}
                    maxLength={6}
                    required
                    autoFocus
                    placeholder="123456"
                    className="w-full text-center tracking-[0.4em] font-mono text-xl py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || otpCode.length < 6}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all shadow-md ${
                    isLoading || otpCode.length < 6
                      ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                      : "bg-sky-500 hover:bg-sky-400 text-white cursor-pointer active:scale-98"
                  }`}
                >
                  {isLoading ? "Verifying..." : "Verify & Continue"}
                </button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    disabled={resendCooldown > 0 || isLoading}
                    onClick={handleSendOtp}
                    className="text-xs text-slate-400 hover:text-sky-400 disabled:opacity-50 disabled:hover:text-slate-400 transition-colors"
                  >
                    {resendCooldown > 0
                      ? `Resend code in ${resendCooldown}s`
                      : "Didn't receive a code? Resend"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {/* Legacy Password Flow */}
        {mode === "password" && (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="name@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors text-sm"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Password
                </label>
                <a
                  href="/forgot-password"
                  className="text-xs text-sky-400 hover:underline"
                >
                  Forgot password?
                </a>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-all shadow-md ${
                isLoading
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                  : "bg-sky-500 hover:bg-sky-400 text-white cursor-pointer active:scale-98"
              }`}
            >
              {isLoading ? "Signing in..." : "Sign In with Password"}
            </button>
          </form>
        )}

        {/* Toggle between OTP and Password */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
          {mode === "otp" ? (
            <button
              type="button"
              onClick={() => {
                setMode("password");
                setErrorMsg("");
                setSuccessMsg("");
              }}
              className="text-xs text-slate-400 hover:text-sky-400 transition-colors"
            >
              Prefer traditional password? <span className="text-sky-400 font-semibold">Sign in here</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode("otp");
                setOtpStep(1);
                setErrorMsg("");
                setSuccessMsg("");
              }}
              className="text-xs text-slate-400 hover:text-sky-400 transition-colors"
            >
              Use instant code or Google instead? <span className="text-sky-400 font-semibold">One-click sign in</span>
            </button>
          )}
        </div>
      </div>

      {/* Choose @username Modal */}
      {showUsernameModal && (
        <ClaimUsernameModal
          token={pendingToken}
          initialSuggestion={suggestedUsername}
          onSuccess={() => {
            setShowUsernameModal(false);
            window.location.href = "/";
          }}
        />
      )}
    </>
  );
}
