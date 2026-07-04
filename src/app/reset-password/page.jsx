"use client";

import axios from "axios";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

// Password strength helper
function getPasswordStrength(pw: string) {
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
            } catch (err: any) {
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
                                            {[1, 2, 3, 4, 5].map((n) => (
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
        </div>
    );
}