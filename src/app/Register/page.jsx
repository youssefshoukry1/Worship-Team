"use client";

import axios from "axios";
import { useFormik } from "formik";
import React, { useCallback, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Yup from "yup";
import { UserContext } from "../context/User_Context";
import Link from "next/link";

// Email check states
const EMAIL_STATUS = {
    IDLE: "idle",
    CHECKING: "checking",
    VALID: "valid",
    INVALID: "invalid",
};

export default function Register() {
    let { setLogin, setUser_id, setUserRole } = useContext(UserContext);
    const [apiError, setError] = useState("");
    const [isLoading, setLoading] = useState(false);
    const [emailStatus, setEmailStatus] = useState(EMAIL_STATUS.IDLE);
    const [emailStatusMsg, setEmailStatusMsg] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const router = useRouter();
    const emailCheckTimeout = useRef(null);

    // Debounced backend email check
    const checkEmailDomain = useCallback(async (email) => {
        if (!email || !email.includes("@") || !email.split("@")[1]) return;
        setEmailStatus(EMAIL_STATUS.CHECKING);
        setEmailStatusMsg("Verifying email...");
        try {
            const res = await axios.post(
                `${process.env.NEXT_PUBLIC_API_URL}/users/check-email`,
                { email }
            );
            if (res.data.valid) {
                setEmailStatus(EMAIL_STATUS.VALID);
                setEmailStatusMsg("✓ Email domain verified");
            } else {
                setEmailStatus(EMAIL_STATUS.INVALID);
                setEmailStatusMsg(res.data.reason || "Invalid email domain");
            }
        } catch {
            setEmailStatus(EMAIL_STATUS.IDLE);
            setEmailStatusMsg("");
        }
    }, []);

    function handleEmailChange(e) {
        formik.handleChange(e);
        const email = e.target.value;
        setEmailStatus(EMAIL_STATUS.IDLE);
        setEmailStatusMsg("");
        // Debounce: check 600ms after user stops typing
        if (emailCheckTimeout.current) clearTimeout(emailCheckTimeout.current);
        if (email && email.includes("@") && email.split("@")[1]?.length > 2) {
            emailCheckTimeout.current = setTimeout(() => {
                checkEmailDomain(email);
            }, 600);
        }
    }

    function handleEmailBlur(e) {
        formik.handleBlur(e);
        if (emailCheckTimeout.current) clearTimeout(emailCheckTimeout.current);
        const email = e.target.value;
        if (email && email.includes("@") && email.split("@")[1]?.length > 2) {
            checkEmailDomain(email);
        }
    }

    function handleRegister(formsData) {
        if (emailStatus === EMAIL_STATUS.INVALID) {
            setError("Please enter a valid, real email address.");
            return;
        }
        setLoading(true);
        axios
            .post(`${process.env.NEXT_PUBLIC_API_URL}/users/register`, formsData)
            .then((response) => {
                if (response.data.msg === "User created successfully") {
                    localStorage.setItem("user_Taspe7_Token", response?.data?.token);
                    localStorage.setItem("user_Taspe7_Role", response?.data?.user?.role);
                    localStorage.setItem("user_Taspe7_ID", response?.data?.user?._id);
                    setLogin(response.data.token);
                    setLoading(false);
                    router.push("/login");
                }
            })
            .catch((error) => {
                setError(error.response?.data?.msg || error.response?.data?.message || "Something went wrong");
                setLoading(false);
            });
    }

    let validationSchema = Yup.object().shape({
        Name: Yup.string()
            .required("Name is required")
            .min(3, "Minimum 3 characters")
            .max(30, "Maximum 30 characters"), // زودتها لـ 30 عشان الأسماء المركبة

        email: Yup.string()
            .required("Email is required")
            .email("Enter a valid email"),

        password: Yup.string()
            .required("Password is required")
            .min(6, "Password must be at least 6 characters"),
        accountType: Yup.string(),

        ChurchName: Yup.string().when("accountType", {
            is: "church",
            then: (schema) => schema.required("Church Name is required"),
            otherwise: (schema) => schema.notRequired(),
        }),
    });
    let formik = useFormik({
        initialValues: {
            Name: "",
            email: "",
            password: "",
            ChurchName: "",
            accountType: "normal",
        },
        validationSchema: validationSchema,
        onSubmit: handleRegister,
    });

    // Determine email input border color
    const emailBorderClass =
        emailStatus === EMAIL_STATUS.VALID
            ? "input-email-valid"
            : emailStatus === EMAIL_STATUS.INVALID
                ? "input-email-invalid"
                : "";

    return (
        <div className="reg-root">
            {/* Background Decoration */}
            <div className="reg-orb reg-orb-1" />
            <div className="reg-orb reg-orb-2" />

            <div className="reg-card">
                {/* Brand */}
                <div className="reg-brand">
                    <div className="reg-brand-icon">✝</div>
                    <span className="reg-brand-name"></span>
                </div>

                <h2 className="reg-title">Create Account</h2>
                <p className="reg-subtitle">Join the worship team community</p>

                {apiError && (
                    <div className="reg-error" role="alert">
                        <span>⚠️</span>
                        <span>{apiError}</span>
                    </div>
                )}

                <form onSubmit={formik.handleSubmit} className="reg-form">
                    {/* Account Type Tabs */}
                    <div className="reg-tabs">
                        <button
                            type="button"
                            onClick={() => {
                                formik.setFieldValue("accountType", "normal");
                                formik.setFieldValue("ChurchName", "");
                            }}
                            className={`reg-tab ${formik.values.accountType === "normal" ? "reg-tab-active" : ""}`}
                        >
                            👤 Normal User
                        </button>
                        <button
                            type="button"
                            onClick={() => formik.setFieldValue("accountType", "church")}
                            className={`reg-tab ${formik.values.accountType === "church" ? "reg-tab-active" : ""}`}
                        >
                            ⛪ Church User
                        </button>
                    </div>

                    {/* Name */}
                    <div className="reg-field">
                        <label htmlFor="Name" className="reg-label">Full Name</label>
                        <div className="reg-input-wrap">
                            <span className="reg-icon">👤</span>
                            <input
                                onChange={formik.handleChange}
                                onBlur={formik.handleBlur}
                                value={formik.values.Name}
                                name="Name"
                                id="Name"
                                type="text"
                                required
                                className="reg-input"
                                placeholder="Your Name"
                            />
                        </div>
                        {formik.errors.Name && formik.touched.Name && (
                            <p className="reg-field-error">{formik.errors.Name}</p>
                        )}
                    </div>

                    {/* Email */}
                    <div className="reg-field">
                        <label htmlFor="email" className="reg-label">
                            Email Address
                            {emailStatus === EMAIL_STATUS.CHECKING && (
                                <span className="email-checking-badge">checking…</span>
                            )}
                        </label>
                        <div className="reg-input-wrap">
                            <span className="reg-icon">✉</span>
                            <input
                                onChange={handleEmailChange}
                                onBlur={handleEmailBlur}
                                value={formik.values.email}
                                name="email"
                                id="email"
                                type="email"
                                required
                                className={`reg-input ${emailBorderClass}`}
                                placeholder="name@gmail.com"
                            />
                            {/* Inline status indicator */}
                            {emailStatus === EMAIL_STATUS.CHECKING && (
                                <span className="email-spinner" />
                            )}
                            {emailStatus === EMAIL_STATUS.VALID && (
                                <span className="email-valid-check">✓</span>
                            )}
                            {emailStatus === EMAIL_STATUS.INVALID && (
                                <span className="email-invalid-x">✕</span>
                            )}
                        </div>

                        {/* Formik validation error */}
                        {formik.errors.email && formik.touched.email && (
                            <p className="reg-field-error">{formik.errors.email}</p>
                        )}
                        {/* Email domain check feedback (only when no formik error) */}
                        {!(formik.errors.email && formik.touched.email) && emailStatusMsg && (
                            <p className={`email-status-msg ${emailStatus === EMAIL_STATUS.VALID ? "email-status-valid" : emailStatus === EMAIL_STATUS.INVALID ? "email-status-invalid" : "email-status-neutral"}`}>
                                {emailStatusMsg}
                            </p>
                        )}
                    </div>

                    {/* Password */}
                    <div className="reg-field">
                        <label htmlFor="password" className="reg-label">Password</label>
                        <div className="reg-input-wrap">
                            <span className="reg-icon">🔒</span>
                            <input
                                onChange={formik.handleChange}
                                onBlur={formik.handleBlur}
                                value={formik.values.password}
                                name="password"
                                id="password"
                                type={showPassword ? "text" : "password"}
                                required
                                className="reg-input"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                className="reg-eye-btn"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label="Toggle password"
                            >
                                {showPassword ? "🙈" : "👁"}
                            </button>
                        </div>
                        {formik.errors.password && formik.touched.password && (
                            <p className="reg-field-error">{formik.errors.password}</p>
                        )}
                    </div>

                    {/* Church Name (conditional) */}
                    {formik.values.accountType === "church" && (
                        <div className="reg-field">
                            <label htmlFor="ChurchName" className="reg-label">Church Name</label>
                            <div className="reg-input-wrap">
                                <span className="reg-icon">⛪</span>
                                <input
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    value={formik.values.ChurchName}
                                    name="ChurchName"
                                    id="ChurchName"
                                    type="text"
                                    className="reg-input"
                                    placeholder="Enter your church name"
                                />
                            </div>
                            {formik.errors.ChurchName && formik.touched.ChurchName && (
                                <p className="reg-field-error">{formik.errors.ChurchName}</p>
                            )}
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={isLoading || emailStatus === EMAIL_STATUS.INVALID || emailStatus === EMAIL_STATUS.CHECKING}
                        className={`reg-submit ${isLoading || emailStatus === EMAIL_STATUS.INVALID || emailStatus === EMAIL_STATUS.CHECKING ? "reg-submit-disabled" : ""}`}
                    >
                        {isLoading ? (
                            <span className="reg-btn-inner">
                                <span className="reg-spinner" />
                                Creating Account…
                            </span>
                        ) : (
                            <span className="reg-btn-inner">
                                Create Account →
                            </span>
                        )}
                    </button>
                </form>

                <div className="reg-footer">
                    <p className="reg-footer-text">
                        Already have an account?{" "}
                        <Link href="/login" className="reg-login-link">Sign in</Link>
                    </p>
                </div>
            </div>

            <style jsx>{`
                .reg-root {
                    display: flex; align-items: center; justify-content: center;
                    min-height: 100vh; padding: 24px 16px;
                    background: linear-gradient(135deg, #020617 0%, #0f172a 50%, #172554 100%);
                    position: relative; overflow: hidden;
                    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
                }
                .reg-orb {
                    position: absolute; border-radius: 50%;
                    filter: blur(80px); pointer-events: none;
                    animation: regOrb 9s ease-in-out infinite;
                }
                .reg-orb-1 {
                    width: 420px; height: 420px;
                    background: radial-gradient(circle, rgba(56,189,248,0.1) 0%, transparent 70%);
                    top: -100px; right: -100px;
                }
                .reg-orb-2 {
                    width: 360px; height: 360px;
                    background: radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 70%);
                    bottom: -80px; left: -80px;
                    animation-delay: -5s;
                }
                @keyframes regOrb {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-16px); }
                }

                .reg-card {
                    position: relative; z-index: 10;
                    width: 100%; max-width: 440px;
                    background: rgba(255,255,255,0.04);
                    backdrop-filter: blur(24px);
                    -webkit-backdrop-filter: blur(24px);
                    border: 1px solid rgba(255,255,255,0.09);
                    border-radius: 24px;
                    padding: 36px 32px;
                    box-shadow: 0 32px 64px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05);
                }

                /* brand */
                .reg-brand {
                    display: flex; align-items: center; gap: 10px;
                    justify-content: center; margin-bottom: 20px;
                }
                .reg-brand-icon {
                    width: 36px; height: 36px;
                    background: linear-gradient(135deg, #0ea5e9, #2563eb);
                    border-radius: 10px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 16px; color: white;
                    box-shadow: 0 4px 14px rgba(14,165,233,0.35);
                }
                .reg-brand-name {
                    font-size: 20px; font-weight: 800;
                    background: linear-gradient(135deg, #38bdf8, #818cf8);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }
                .reg-title {
                    text-align: center; font-size: 26px; font-weight: 800;
                    color: #f1f5f9; margin: 0 0 6px; letter-spacing: -0.4px;
                }
                .reg-subtitle {
                    text-align: center; font-size: 14px; color: #94a3b8; margin: 0 0 24px;
                }

                /* error */
                .reg-error {
                    display: flex; align-items: center; gap: 8px;
                    padding: 12px 16px;
                    background: rgba(239,68,68,0.1);
                    border: 1px solid rgba(239,68,68,0.25);
                    border-radius: 12px; color: #fca5a5; font-size: 14px;
                    margin-bottom: 20px;
                }

                /* tabs */
                .reg-tabs {
                    display: flex; gap: 4px; padding: 4px;
                    background: rgba(0,0,0,0.2);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 14px;
                    margin-bottom: 4px;
                }
                .reg-tab {
                    flex: 1; padding: 10px 8px;
                    background: none; border: none; cursor: pointer;
                    font-size: 13px; font-weight: 600; color: #64748b;
                    border-radius: 10px; font-family: inherit;
                    transition: background 0.2s, color 0.2s;
                }
                .reg-tab:hover { color: #94a3b8; }
                .reg-tab-active {
                    background: rgba(255,255,255,0.1);
                    color: #f1f5f9;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                }

                /* form */
                .reg-form { display: flex; flex-direction: column; gap: 18px; }
                .reg-field { display: flex; flex-direction: column; gap: 6px; }
                .reg-label {
                    font-size: 13px; font-weight: 600;
                    color: #cbd5e1; display: flex; align-items: center; gap: 8px;
                }
                .email-checking-badge {
                    font-size: 11px; color: #94a3b8;
                    background: rgba(255,255,255,0.07);
                    padding: 2px 8px; border-radius: 20px; font-weight: 400;
                    animation: pulse 1s ease-in-out infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                .reg-input-wrap {
                    position: relative; display: flex; align-items: center;
                }
                .reg-icon {
                    position: absolute; left: 14px;
                    font-size: 15px; z-index: 1; pointer-events: none;
                }
                .reg-input {
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
                .reg-input::placeholder { color: #475569; }
                .reg-input:focus {
                    border-color: #0ea5e9;
                    box-shadow: 0 0 0 3px rgba(14,165,233,0.15);
                }
                .input-email-valid {
                    border-color: rgba(34,197,94,0.5) !important;
                    box-shadow: 0 0 0 2px rgba(34,197,94,0.12) !important;
                }
                .input-email-invalid {
                    border-color: rgba(239,68,68,0.5) !important;
                    box-shadow: 0 0 0 2px rgba(239,68,68,0.1) !important;
                }
                .reg-eye-btn {
                    position: absolute; right: 12px;
                    background: none; border: none; cursor: pointer;
                    font-size: 15px; opacity: 0.5;
                    transition: opacity 0.2s; padding: 4px;
                }
                .reg-eye-btn:hover { opacity: 1; }

                /* email status icons */
                .email-spinner {
                    position: absolute; right: 14px;
                    width: 16px; height: 16px;
                    border: 2px solid rgba(148,163,184,0.3);
                    border-top-color: #94a3b8;
                    border-radius: 50%;
                    animation: regSpin 0.7s linear infinite;
                }
                @keyframes regSpin { to { transform: rotate(360deg); } }
                .email-valid-check {
                    position: absolute; right: 14px;
                    color: #22c55e; font-size: 16px; font-weight: 700;
                }
                .email-invalid-x {
                    position: absolute; right: 14px;
                    color: #ef4444; font-size: 16px; font-weight: 700;
                }
                .email-status-msg { font-size: 12px; margin: 0; }
                .email-status-valid { color: #4ade80; }
                .email-status-invalid { color: #f87171; }
                .email-status-neutral { color: #94a3b8; }

                .reg-field-error { font-size: 12px; color: #f87171; margin: 0; text-align: right; }

                /* submit */
                .reg-submit {
                    width: 100%; padding: 14px 20px;
                    background: linear-gradient(135deg, #0ea5e9, #2563eb);
                    border: none; border-radius: 12px;
                    color: white; font-size: 15px; font-weight: 700;
                    cursor: pointer; font-family: inherit;
                    transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
                    box-shadow: 0 4px 20px rgba(14,165,233,0.3);
                    margin-top: 4px;
                }
                .reg-submit:not(.reg-submit-disabled):hover {
                    opacity: 0.9; transform: translateY(-1px);
                    box-shadow: 0 8px 28px rgba(14,165,233,0.4);
                }
                .reg-submit:not(.reg-submit-disabled):active { transform: scale(0.98); }
                .reg-submit-disabled { opacity: 0.45; cursor: not-allowed; }
                .reg-btn-inner {
                    display: flex; align-items: center;
                    justify-content: center; gap: 8px;
                }
                .reg-spinner {
                    width: 18px; height: 18px;
                    border: 2px solid rgba(255,255,255,0.3);
                    border-top-color: white;
                    border-radius: 50%;
                    animation: regSpin 0.7s linear infinite;
                }

                /* footer */
                .reg-footer {
                    margin-top: 20px; padding-top: 18px;
                    border-top: 1px solid rgba(255,255,255,0.06);
                    text-align: center;
                }
                .reg-footer-text { font-size: 14px; color: #64748b; margin: 0; }
                .reg-login-link {
                    color: #0ea5e9; text-decoration: none; font-weight: 600;
                    transition: color 0.2s;
                }
                .reg-login-link:hover { color: #38bdf8; }
            `}</style>
        </div>
    );
}
