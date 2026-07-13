"use client";

import axios from "axios";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function getPasswordStrength(pw) {
    if (!pw) return { score: 0, label: "", color: "" };
    let score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (score <= 2) return { score, label: "Weak", color: "#ef4444" };
    if (score === 3) return { score, label: "Fair", color: "#f59e0b" };
    if (score === 4) return { score, label: "Good", color: "#3b82f6" };
    return { score, label: "Strong", color: "#22c55e" };
}

export default function ResetPassword() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const [apiError, setError] = useState("");
    const [isLoading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const validationSchema = Yup.object({
        password: Yup.string()
            .required("Password is required")
            .min(6, "Password must be at least 6 characters"),

        confirmPassword: Yup.string()
            .required("Please confirm your password")
            .oneOf([Yup.ref("password")], "Passwords do not match"),
    });

    const formik = useFormik({
        initialValues: { password: "", confirmPassword: "" },
        validationSchema,
        onSubmit: async (values) => {
            if (!token) {
                setError("Invalid reset link. Please request a new one.");
                return;
            }
            setLoading(true);
            setError("");
            try {
                await axios.post(
                    `${process.env.NEXT_PUBLIC_API_URL}/users/reset-password/${token}`,
                    { password: values.password }
                );
                setSuccess(true);
                setTimeout(() => router.push("/login"), 3500);
            } catch (err) {
                setError(err.response?.data?.msg || "Something went wrong. Please try again.");
            } finally {
                setLoading(false);
            }
        },
    });

    const strength = getPasswordStrength(formik.values.password);

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#030712]">
            {/* 🌌 الخلفية المضيئة المتناسقة مع الـ Layout */}
            <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-82 h-82 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />

            {/* 💳 الكارت الزجاجي المعزول بلون نص واضح جداً */}
            <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10 text-slate-100">

                {/* Brand */}
                <div className="flex items-center justify-center gap-2 mb-8">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">✝</div>
                    <span className="text-xl font-extrabold tracking-wider text-white"></span>
                </div>

                {!success ? (
                    <>
                        <div className="text-center mb-6">
                            <div className="text-3xl mb-2">🔐</div>
                            <h2 className="text-2xl font-bold text-white mb-2">Reset Your Password</h2>
                            <p className="text-sm text-slate-400">
                                Create a strong new password for your account.
                            </p>
                        </div>

                        {apiError && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg flex items-center gap-2 text-sm mb-4" role="alert">
                                <span>⚠️</span>
                                <span>{apiError}</span>
                            </div>
                        )}

                        <form onSubmit={formik.handleSubmit} className="space-y-5" noValidate>
                            {/* New Password */}
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="rp-password" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                    New Password
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔒</span>
                                    <input
                                        id="rp-password"
                                        name="password"
                                        type={showPassword ? "text" : "password"}
                                        value={formik.values.password}
                                        onChange={formik.handleChange}
                                        onBlur={formik.handleBlur}
                                        placeholder="••••••••"
                                        className={`w-full bg-slate-950/50 border ${formik.touched.password && formik.errors.password ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-blue-500'} rounded-lg py-2.5 pl-10 pr-10 text-white placeholder-slate-600 outline-none transition-all text-sm`}
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                                        onClick={() => setShowPassword(!showPassword)}
                                        aria-label="Toggle password visibility"
                                    >
                                        {showPassword ? "🙈" : "👁"}
                                    </button>
                                </div>

                                {/* Strength bar */}
                                {formik.values.password && (
                                    <div className="mt-2 flex items-center gap-2">
                                        <div className="flex gap-1 flex-1">
                                            {[1, 2, 3, 4, 5].map((n) => (
                                                <div
                                                    key={n}
                                                    className="h-1 flex-1 rounded-full transition-all duration-300"
                                                    style={{
                                                        background: n <= strength.score ? strength.color : "rgba(255,255,255,0.08)",
                                                    }}
                                                />
                                            ))}
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: strength.color }}>
                                            {strength.label}
                                        </span>
                                    </div>
                                )}

                                {formik.touched.password && formik.errors.password && (
                                    <p className="text-xs text-red-400 mt-1">{formik.errors.password}</p>
                                )}
                            </div>

                            {/* Confirm Password */}
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="rp-confirm" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                    Confirm Password
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔑</span>
                                    <input
                                        id="rp-confirm"
                                        name="confirmPassword"
                                        type={showConfirm ? "text" : "password"}
                                        value={formik.values.confirmPassword}
                                        onChange={formik.handleChange}
                                        onBlur={formik.handleBlur}
                                        placeholder="••••••••"
                                        className={`w-full bg-slate-950/50 border ${formik.touched.confirmPassword && formik.errors.confirmPassword ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-blue-500'} rounded-lg py-2.5 pl-10 pr-10 text-white placeholder-slate-600 outline-none transition-all text-sm`}
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                                        onClick={() => setShowConfirm(!showConfirm)}
                                        aria-label="Toggle confirm password visibility"
                                    >
                                        {showConfirm ? "🙈" : "👁"}
                                    </button>
                                    {formik.values.confirmPassword && formik.values.password === formik.values.confirmPassword && (
                                        <span className="absolute right-9 top-1/2 -translate-y-1/2 text-emerald-400 text-xs">✓</span>
                                    )}
                                </div>
                                {formik.touched.confirmPassword && formik.errors.confirmPassword && (
                                    <p className="text-xs text-red-400 mt-1">{formik.errors.confirmPassword}</p>
                                )}
                            </div>

                            {/* Password rules hint */}
                            <div className="bg-slate-950/40 border border-white/5 rounded-lg p-3 text-xs">
                                <p className="text-slate-400 font-medium mb-2">Password must:</p>
                                <ul className="space-y-1.5 text-slate-300">
                                    {[
                                        { rule: "Be 6–8 characters long", met: formik.values.password.length >= 6 && formik.values.password.length <= 8 },
                                        { rule: "Start with a capital letter", met: /^[A-Z]/.test(formik.values.password) },
                                        { rule: "Contain only letters & numbers", met: /^[A-Za-z0-9]+$/.test(formik.values.password) && formik.values.password.length > 0 },
                                    ].map(({ rule, met }) => (
                                        <li key={rule} className={`flex items-center gap-2 ${formik.values.password ? (met ? "text-emerald-400" : "text-red-400/80") : "text-slate-500"}`}>
                                            <span className="font-bold">{formik.values.password ? (met ? "✓" : "✕") : "·"}</span>
                                            <span>{rule}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || !formik.isValid || !formik.dirty}
                                className={`w-full py-3 px-4 rounded-lg font-bold text-sm text-white transition-all ${isLoading || !formik.isValid || !formik.dirty
                                        ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5"
                                        : "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/20 active:scale-[0.98]"
                                    }`}
                            >
                                {isLoading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Resetting Password...
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-1">
                                        Reset Password →
                                    </span>
                                )}
                            </button>
                        </form>

                        <div className="mt-6 text-center">
                            <Link href="/forgot-password" className="text-xs text-slate-400 hover:text-blue-400 transition-colors">
                                ← Request a new link
                            </Link>
                        </div>
                    </>
                ) : (
                    <div className="text-center py-6">
                        <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-2xl mx-auto mb-4 animate-bounce">
                            ✓
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Password Reset!</h2>
                        <p className="text-sm text-slate-400 mb-6">
                            Your password has been successfully updated. You're being redirected to login…
                        </p>
                        <Link href="/login" className="inline-block w-full py-2.5 bg-white/10 hover:bg-white/10 text-white rounded-lg text-sm font-semibold transition-colors border border-white/10">
                            Go to Login →
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}