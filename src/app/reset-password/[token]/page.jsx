"use client";

import axios from "axios";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

// Password strength helper
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
    const params = useParams();
    const token = params?.token;

    const [apiError, setError] = useState("");
    const [isLoading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const validationSchema = Yup.object({
        password: Yup.string()
            .required("Password is required")
            .matches(
                /^[A-Z][a-z0-9]{5,7}$/,
                "6–8 chars, starts with capital letter, letters & numbers only"
            ),
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
        <div className="rp-root">
            {/* animated background */}
            <div className="rp-orb rp-orb-1" />
            <div className="rp-orb rp-orb-2" />
            <div className="rp-orb rp-orb-3" />

            <div className="rp-card">
                {/* Brand */}
                <div className="rp-brand">
                    <div className="rp-brand-icon">✝</div>
                    <span className="rp-brand-name">Taspe7</span>
                </div>

                {!success ? (
                    <>
                        <div className="rp-header">
                            <div className="rp-lock-icon">🔐</div>
                            <h2 className="rp-title">Reset Your Password</h2>
                            <p className="rp-subtitle">
                                Create a strong new password for your account.
                            </p>
                        </div>

                        {apiError && (
                            <div className="rp-error" role="alert">
                                <span>⚠️</span>
                                <span>{apiError}</span>
                            </div>
                        )}

                        <form onSubmit={formik.handleSubmit} className="rp-form" noValidate>
                            {/* New Password */}
                            <div className="rp-field">
                                <label htmlFor="rp-password" className="rp-label">
                                    New Password
                                </label>
                                <div className="rp-input-wrap">
                                    <span className="rp-input-icon">🔒</span>
                                    <input
                                        id="rp-password"
                                        name="password"
                                        type={showPassword ? "text" : "password"}
                                        value={formik.values.password}
                                        onChange={formik.handleChange}
                                        onBlur={formik.handleBlur}
                                        placeholder="••••••••"
                                        className={`rp-input ${formik.touched.password && formik.errors.password ? "rp-input-error" : ""}`}
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        className="rp-eye-btn"
                                        onClick={() => setShowPassword(!showPassword)}
                                        aria-label="Toggle password visibility"
                                    >
                                        {showPassword ? "🙈" : "👁"}
                                    </button>
                                </div>

                                {/* Strength bar */}
                                {formik.values.password && (
                                    <div className="strength-wrap">
                                        <div className="strength-bars">
                                            {[1,2,3,4,5].map((n) => (
                                                <div
                                                    key={n}
                                                    className="strength-bar"
                                                    style={{
                                                        background: n <= strength.score
                                                            ? strength.color
                                                            : "rgba(255,255,255,0.08)",
                                                        transition: "background 0.3s ease"
                                                    }}
                                                />
                                            ))}
                                        </div>
                                        <span className="strength-label" style={{ color: strength.color }}>
                                            {strength.label}
                                        </span>
                                    </div>
                                )}

                                {formik.touched.password && formik.errors.password && (
                                    <p className="rp-field-error">{formik.errors.password}</p>
                                )}
                            </div>

                            {/* Confirm Password */}
                            <div className="rp-field">
                                <label htmlFor="rp-confirm" className="rp-label">
                                    Confirm Password
                                </label>
                                <div className="rp-input-wrap">
                                    <span className="rp-input-icon">🔑</span>
                                    <input
                                        id="rp-confirm"
                                        name="confirmPassword"
                                        type={showConfirm ? "text" : "password"}
                                        value={formik.values.confirmPassword}
                                        onChange={formik.handleChange}
                                        onBlur={formik.handleBlur}
                                        placeholder="••••••••"
                                        className={`rp-input ${formik.touched.confirmPassword && formik.errors.confirmPassword ? "rp-input-error" : ""}`}
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        className="rp-eye-btn"
                                        onClick={() => setShowConfirm(!showConfirm)}
                                        aria-label="Toggle confirm password visibility"
                                    >
                                        {showConfirm ? "🙈" : "👁"}
                                    </button>
                                    {formik.values.confirmPassword && formik.values.password === formik.values.confirmPassword && (
                                        <span className="rp-check">✓</span>
                                    )}
                                </div>
                                {formik.touched.confirmPassword && formik.errors.confirmPassword && (
                                    <p className="rp-field-error">{formik.errors.confirmPassword}</p>
                                )}
                            </div>

                            {/* Password rules hint */}
                            <div className="rp-rules">
                                <p className="rp-rules-title">Password must:</p>
                                <ul className="rp-rules-list">
                                    {[
                                        { rule: "Be 6–8 characters long", met: formik.values.password.length >= 6 && formik.values.password.length <= 8 },
                                        { rule: "Start with a capital letter", met: /^[A-Z]/.test(formik.values.password) },
                                        { rule: "Contain only letters & numbers", met: /^[A-Za-z0-9]+$/.test(formik.values.password) && formik.values.password.length > 0 },
                                    ].map(({ rule, met }) => (
                                        <li key={rule} className={`rp-rule ${formik.values.password ? (met ? "rule-met" : "rule-unmet") : ""}`}>
                                            <span className="rule-dot">{formik.values.password ? (met ? "✓" : "✕") : "·"}</span>
                                            {rule}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || !formik.isValid || !formik.dirty}
                                className={`rp-submit-btn ${isLoading || !formik.isValid || !formik.dirty ? "rp-btn-disabled" : ""}`}
                            >
                                {isLoading ? (
                                    <span className="rp-btn-inner">
                                        <span className="rp-spinner" />
                                        Resetting Password...
                                    </span>
                                ) : (
                                    <span className="rp-btn-inner">
                                        <span>Reset Password</span>
                                        <span>→</span>
                                    </span>
                                )}
                            </button>
                        </form>

                        <div className="rp-back">
                            <Link href="/forgot-password" className="rp-back-link">
                                ← Request a new link
                            </Link>
                        </div>
                    </>
                ) : (
                    <div className="rp-success">
                        <div className="rp-success-icon-wrap">
                            <div className="rp-success-icon">✓</div>
                            <div className="rp-success-ring" />
                        </div>
                        <h2 className="rp-success-title">Password Reset!</h2>
                        <p className="rp-success-text">
                            Your password has been successfully updated. You're being redirected to login…
                        </p>
                        <div className="rp-redirect-bar">
                            <div className="rp-redirect-fill" />
                        </div>
                        <Link href="/login" className="rp-login-link">
                            Go to Login →
                        </Link>
                    </div>
                )}
            </div>

            <style jsx>{`
                .rp-root {
                    min-height: 100vh;
                    display: flex; align-items: center; justify-content: center;
                    padding: 24px 16px;
                    background: linear-gradient(135deg, #020617 0%, #0f172a 50%, #172554 100%);
                    position: relative; overflow: hidden;
                    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
                }
                .rp-orb {
                    position: absolute; border-radius: 50%;
                    filter: blur(80px); pointer-events: none;
                    animation: rpOrb 9s ease-in-out infinite;
                }
                .rp-orb-1 {
                    width: 400px; height: 400px;
                    background: radial-gradient(circle, rgba(56,189,248,0.13) 0%, transparent 70%);
                    top: -120px; right: -80px;
                }
                .rp-orb-2 {
                    width: 320px; height: 320px;
                    background: radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%);
                    bottom: -80px; left: -60px;
                    animation-delay: -4s;
                }
                .rp-orb-3 {
                    width: 180px; height: 180px;
                    background: radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 70%);
                    top: 40%; left: 20%;
                    animation-delay: -7s;
                }
                @keyframes rpOrb {
                    0%, 100% { transform: translateY(0) scale(1); }
                    50% { transform: translateY(-18px) scale(1.04); }
                }

                .rp-card {
                    position: relative; z-index: 10;
                    width: 100%; max-width: 460px;
                    background: rgba(255,255,255,0.04);
                    backdrop-filter: blur(24px);
                    -webkit-backdrop-filter: blur(24px);
                    border: 1px solid rgba(255,255,255,0.09);
                    border-radius: 24px;
                    padding: 40px 36px;
                    box-shadow: 0 32px 64px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05);
                }

                /* brand */
                .rp-brand {
                    display: flex; align-items: center; gap: 10px;
                    justify-content: center; margin-bottom: 24px;
                }
                .rp-brand-icon {
                    width: 36px; height: 36px;
                    background: linear-gradient(135deg, #0ea5e9, #2563eb);
                    border-radius: 10px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 16px; color: white;
                    box-shadow: 0 4px 14px rgba(14,165,233,0.35);
                }
                .rp-brand-name {
                    font-size: 20px; font-weight: 800;
                    background: linear-gradient(135deg, #38bdf8, #818cf8);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }

                /* header */
                .rp-header { text-align: center; margin-bottom: 28px; }
                .rp-lock-icon { font-size: 40px; margin-bottom: 12px; }
                .rp-title {
                    font-size: 24px; font-weight: 800;
                    color: #f1f5f9; margin: 0 0 8px; letter-spacing: -0.4px;
                }
                .rp-subtitle { font-size: 14px; color: #94a3b8; margin: 0; }

                /* error */
                .rp-error {
                    display: flex; align-items: center; gap: 8px;
                    padding: 12px 16px;
                    background: rgba(239,68,68,0.1);
                    border: 1px solid rgba(239,68,68,0.25);
                    border-radius: 12px; color: #fca5a5;
                    font-size: 14px; margin-bottom: 20px;
                }

                /* form */
                .rp-form { display: flex; flex-direction: column; gap: 20px; }
                .rp-field { display: flex; flex-direction: column; gap: 6px; }
                .rp-label {
                    font-size: 13px; font-weight: 600;
                    color: #cbd5e1; letter-spacing: 0.3px;
                }
                .rp-input-wrap { position: relative; display: flex; align-items: center; }
                .rp-input-icon {
                    position: absolute; left: 14px;
                    font-size: 15px; z-index: 1; pointer-events: none;
                }
                .rp-input {
                    width: 100%;
                    padding: 13px 44px 13px 42px;
                    background: rgba(0,0,0,0.25);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 12px;
                    color: #f1f5f9; font-size: 15px;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                    font-family: inherit;
                    box-sizing: border-box;
                }
                .rp-input::placeholder { color: #475569; }
                .rp-input:focus {
                    border-color: #0ea5e9;
                    box-shadow: 0 0 0 3px rgba(14,165,233,0.15);
                }
                .rp-input-error { border-color: rgba(239,68,68,0.5) !important; }
                .rp-eye-btn {
                    position: absolute; right: 12px;
                    background: none; border: none; cursor: pointer;
                    font-size: 16px; opacity: 0.5;
                    transition: opacity 0.2s; padding: 4px;
                }
                .rp-eye-btn:hover { opacity: 1; }
                .rp-check {
                    position: absolute; right: 40px;
                    color: #22c55e; font-size: 16px; font-weight: 700;
                }
                .rp-field-error {
                    font-size: 12px; color: #f87171; margin: 0;
                }

                /* strength */
                .strength-wrap {
                    display: flex; align-items: center; gap: 10px; margin-top: 6px;
                }
                .strength-bars { display: flex; gap: 4px; flex: 1; }
                .strength-bar {
                    flex: 1; height: 4px; border-radius: 2px;
                }
                .strength-label { font-size: 12px; font-weight: 600; min-width: 44px; }

                /* rules */
                .rp-rules {
                    background: rgba(0,0,0,0.15);
                    border: 1px solid rgba(255,255,255,0.07);
                    border-radius: 12px;
                    padding: 14px 16px;
                }
                .rp-rules-title {
                    font-size: 12px; color: #64748b;
                    margin: 0 0 8px; font-weight: 600;
                    text-transform: uppercase; letter-spacing: 0.5px;
                }
                .rp-rules-list {
                    list-style: none; padding: 0; margin: 0;
                    display: flex; flex-direction: column; gap: 4px;
                }
                .rp-rule {
                    font-size: 13px; color: #64748b;
                    display: flex; align-items: center; gap: 8px;
                    transition: color 0.2s;
                }
                .rule-met { color: #22c55e; }
                .rule-unmet { color: #f87171; }
                .rule-dot { font-size: 14px; width: 16px; flex-shrink: 0; }

                /* submit button */
                .rp-submit-btn {
                    width: 100%; padding: 14px 20px;
                    background: linear-gradient(135deg, #0ea5e9, #2563eb);
                    border: none; border-radius: 12px;
                    color: white; font-size: 15px; font-weight: 700;
                    cursor: pointer; font-family: inherit;
                    transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
                    box-shadow: 0 4px 20px rgba(14,165,233,0.3);
                }
                .rp-submit-btn:not(.rp-btn-disabled):hover {
                    opacity: 0.9;
                    transform: translateY(-1px);
                    box-shadow: 0 8px 28px rgba(14,165,233,0.4);
                }
                .rp-submit-btn:not(.rp-btn-disabled):active { transform: scale(0.98); }
                .rp-btn-disabled { opacity: 0.45; cursor: not-allowed; }
                .rp-btn-inner {
                    display: flex; align-items: center;
                    justify-content: center; gap: 8px;
                }
                .rp-spinner {
                    width: 18px; height: 18px;
                    border: 2px solid rgba(255,255,255,0.3);
                    border-top-color: white;
                    border-radius: 50%;
                    animation: rpSpin 0.7s linear infinite;
                }
                @keyframes rpSpin { to { transform: rotate(360deg); } }

                /* back link */
                .rp-back { text-align: center; margin-top: 20px; }
                .rp-back-link {
                    font-size: 13px; color: #64748b;
                    text-decoration: none; transition: color 0.2s;
                }
                .rp-back-link:hover { color: #38bdf8; }

                /* success */
                .rp-success { text-align: center; padding: 8px 0 16px; }
                .rp-success-icon-wrap {
                    position: relative;
                    width: 80px; height: 80px;
                    margin: 0 auto 24px;
                    display: flex; align-items: center; justify-content: center;
                }
                .rp-success-icon {
                    width: 80px; height: 80px;
                    background: linear-gradient(135deg, rgba(34,197,94,0.2), rgba(22,163,74,0.2));
                    border: 2px solid rgba(34,197,94,0.4);
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 32px; color: #22c55e; font-weight: 900;
                    animation: rp-iconPop 0.4s cubic-bezier(0.175,0.885,0.32,1.275);
                }
                .rp-success-ring {
                    position: absolute; inset: -8px;
                    border: 2px solid rgba(34,197,94,0.2);
                    border-radius: 50%;
                    animation: rp-ringExpand 1.3s ease-out infinite;
                }
                @keyframes rp-iconPop {
                    0% { transform: scale(0); opacity: 0; }
                    100% { transform: scale(1); opacity: 1; }
                }
                @keyframes rp-ringExpand {
                    0% { transform: scale(1); opacity: 0.5; }
                    100% { transform: scale(1.4); opacity: 0; }
                }
                .rp-success-title {
                    font-size: 24px; font-weight: 800; color: #f1f5f9; margin: 0 0 12px;
                }
                .rp-success-text {
                    font-size: 14px; color: #94a3b8; line-height: 1.7; margin: 0 0 24px;
                }
                .rp-redirect-bar {
                    height: 4px; background: rgba(255,255,255,0.08);
                    border-radius: 2px; overflow: hidden; margin-bottom: 20px;
                }
                .rp-redirect-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #0ea5e9, #22c55e);
                    border-radius: 2px;
                    animation: rp-fillBar 3.5s linear forwards;
                }
                @keyframes rp-fillBar {
                    from { width: 0%; }
                    to { width: 100%; }
                }
                .rp-login-link {
                    display: inline-flex; align-items: center; gap: 6px;
                    padding: 10px 24px;
                    background: rgba(14,165,233,0.12);
                    border: 1px solid rgba(14,165,233,0.25);
                    border-radius: 10px;
                    color: #38bdf8; font-size: 14px; font-weight: 600;
                    text-decoration: none;
                    transition: background 0.2s, border-color 0.2s;
                }
                .rp-login-link:hover {
                    background: rgba(14,165,233,0.2);
                    border-color: rgba(14,165,233,0.4);
                }
            `}</style>
        </div>
    );
}
