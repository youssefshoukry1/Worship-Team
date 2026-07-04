"use client";

import axios from "axios";
import { useState } from "react";
import Link from "next/link";

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [isLoading, setLoading] = useState(false);
    const [apiError, setError] = useState("");
    const [success, setSuccess] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!email.trim()) {
            setError("Please enter your email address.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            await axios.post(
                `${process.env.NEXT_PUBLIC_API_URL}/users/forgot-password`,
                { email }
            );
            setSuccess(true);
        } catch (err) {
            setError(err.response?.data?.msg || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="forgot-pw-root">
            {/* Animated background orbs */}
            <div className="orb orb-1" />
            <div className="orb orb-2" />
            <div className="orb orb-3" />

            <div className="forgot-pw-card">
                {/* Logo / Brand */}
                <div className="brand">
                    <div className="brand-icon">✝</div>
                    <h1 className="brand-name"></h1>
                </div>

                {!success ? (
                    <>
                        <div className="card-header">
                            <h2 className="card-title">Forgot Password?</h2>
                            <p className="card-subtitle">
                                No worries. Enter your email and we'll send you a secure reset link.
                            </p>
                        </div>

                        {apiError && (
                            <div className="error-alert" role="alert">
                                <span className="alert-icon">⚠️</span>
                                <span>{apiError}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="fp-form">
                            <div className="field-group">
                                <label htmlFor="fp-email" className="field-label">
                                    Email Address
                                </label>
                                <div className="input-wrapper">
                                    <span className="input-icon">✉</span>
                                    <input
                                        id="fp-email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="fp-input"
                                        placeholder="name@gmail.com"
                                        autoComplete="email"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className={`fp-btn ${isLoading ? "fp-btn-loading" : ""}`}
                            >
                                {isLoading ? (
                                    <span className="btn-inner">
                                        <span className="spinner" />
                                        Sending Reset Link...
                                    </span>
                                ) : (
                                    <span className="btn-inner">
                                        <span>Send Reset Link</span>
                                        <span className="btn-arrow">→</span>
                                    </span>
                                )}
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="success-state">
                        <div className="success-icon-wrap">
                            <div className="success-icon">✉</div>
                            <div className="success-ring" />
                        </div>
                        <h2 className="success-title">Check Your Inbox!</h2>
                        <p className="success-text">
                            We've sent a password reset link to{" "}
                            <strong className="success-email">{email}</strong>.
                            The link will expire in <strong>1 hour</strong>.
                        </p>
                        <p className="success-hint">
                            Didn't receive it? Check your spam folder, or{" "}
                            <button
                                className="resend-link"
                                onClick={() => setSuccess(false)}
                            >
                                try again
                            </button>
                            .
                        </p>
                    </div>
                )}

                <div className="back-link-wrap">
                    <Link href="/login" className="back-link">
                        ← Back to Login
                    </Link>
                </div>
            </div>

            <style jsx>{`
                .forgot-pw-root {
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 24px 16px;
                    background: linear-gradient(135deg, #020617 0%, #0f172a 50%, #172554 100%);
                    position: relative;
                    overflow: hidden;
                    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
                }

                /* animated orbs */
                .orb {
                    position: absolute;
                    border-radius: 50%;
                    filter: blur(80px);
                    animation: orbFloat 8s ease-in-out infinite;
                    pointer-events: none;
                }
                .orb-1 {
                    width: 420px; height: 420px;
                    background: radial-gradient(circle, rgba(56,189,248,0.15) 0%, transparent 70%);
                    top: -100px; right: -100px;
                    animation-delay: 0s;
                }
                .orb-2 {
                    width: 350px; height: 350px;
                    background: radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%);
                    bottom: -80px; left: -80px;
                    animation-delay: -3s;
                }
                .orb-3 {
                    width: 200px; height: 200px;
                    background: radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%);
                    top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    animation-delay: -6s;
                }
                @keyframes orbFloat {
                    0%, 100% { transform: translateY(0) scale(1); }
                    50% { transform: translateY(-20px) scale(1.05); }
                }

                /* card */
                .forgot-pw-card {
                    position: relative;
                    z-index: 10;
                    width: 100%;
                    max-width: 440px;
                    background: rgba(255,255,255,0.04);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255,255,255,0.09);
                    border-radius: 24px;
                    padding: 40px 36px;
                    box-shadow: 0 32px 64px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05);
                }

                /* brand */
                .brand {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    justify-content: center;
                    margin-bottom: 28px;
                }
                .brand-icon {
                    width: 38px; height: 38px;
                    background: linear-gradient(135deg, #0ea5e9, #2563eb);
                    border-radius: 10px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 18px; color: white;
                    box-shadow: 0 4px 16px rgba(14,165,233,0.35);
                }
                .brand-name {
                    font-size: 22px;
                    font-weight: 800;
                    background: linear-gradient(135deg, #38bdf8, #818cf8);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    margin: 0;
                }

                /* header */
                .card-header { text-align: center; margin-bottom: 28px; }
                .card-title {
                    font-size: 26px; font-weight: 800;
                    color: #f1f5f9; margin: 0 0 8px;
                    letter-spacing: -0.5px;
                }
                .card-subtitle {
                    font-size: 14px; color: #94a3b8; margin: 0; line-height: 1.6;
                }

                /* error alert */
                .error-alert {
                    display: flex; align-items: center; gap: 8px;
                    padding: 12px 16px;
                    background: rgba(239,68,68,0.1);
                    border: 1px solid rgba(239,68,68,0.25);
                    border-radius: 12px;
                    color: #fca5a5;
                    font-size: 14px;
                    margin-bottom: 20px;
                }
                .alert-icon { font-size: 16px; flex-shrink: 0; }

                /* form */
                .fp-form { display: flex; flex-direction: column; gap: 20px; }
                .field-group { display: flex; flex-direction: column; gap: 6px; }
                .field-label {
                    font-size: 13px; font-weight: 600;
                    color: #cbd5e1; letter-spacing: 0.3px;
                }
                .input-wrapper {
                    position: relative;
                    display: flex; align-items: center;
                }
                .input-icon {
                    position: absolute; left: 14px;
                    font-size: 16px; color: #475569;
                    pointer-events: none;
                    z-index: 1;
                }
                .fp-input {
                    width: 100%;
                    padding: 13px 14px 13px 42px;
                    background: rgba(0,0,0,0.25);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 12px;
                    color: #f1f5f9;
                    font-size: 15px;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                    font-family: inherit;
                    box-sizing: border-box;
                }
                .fp-input::placeholder { color: #475569; }
                .fp-input:focus {
                    border-color: #0ea5e9;
                    box-shadow: 0 0 0 3px rgba(14,165,233,0.15);
                }

                /* button */
                .fp-btn {
                    width: 100%;
                    padding: 14px 20px;
                    background: linear-gradient(135deg, #0ea5e9, #2563eb);
                    border: none; border-radius: 12px;
                    color: white; font-size: 15px; font-weight: 700;
                    cursor: pointer; font-family: inherit;
                    transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
                    box-shadow: 0 4px 20px rgba(14,165,233,0.3);
                }
                .fp-btn:not(.fp-btn-loading):hover {
                    opacity: 0.9;
                    transform: translateY(-1px);
                    box-shadow: 0 8px 28px rgba(14,165,233,0.4);
                }
                .fp-btn:not(.fp-btn-loading):active { transform: scale(0.98); }
                .fp-btn-loading { opacity: 0.65; cursor: not-allowed; }
                .btn-inner {
                    display: flex; align-items: center;
                    justify-content: center; gap: 8px;
                }
                .btn-arrow { font-size: 18px; }

                /* spinner */
                .spinner {
                    width: 18px; height: 18px;
                    border: 2px solid rgba(255,255,255,0.3);
                    border-top-color: white;
                    border-radius: 50%;
                    animation: spin 0.7s linear infinite;
                    flex-shrink: 0;
                }
                @keyframes spin { to { transform: rotate(360deg); } }

                /* success state */
                .success-state {
                    text-align: center;
                    padding: 8px 0 16px;
                }
                .success-icon-wrap {
                    position: relative;
                    width: 80px; height: 80px;
                    margin: 0 auto 24px;
                    display: flex; align-items: center; justify-content: center;
                }
                .success-icon {
                    width: 80px; height: 80px;
                    background: linear-gradient(135deg, rgba(14,165,233,0.2), rgba(37,99,235,0.2));
                    border: 2px solid rgba(14,165,233,0.4);
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 32px;
                    position: relative; z-index: 1;
                    animation: iconPop 0.4s cubic-bezier(0.175,0.885,0.32,1.275);
                }
                .success-ring {
                    position: absolute; inset: -8px;
                    border: 2px solid rgba(14,165,233,0.2);
                    border-radius: 50%;
                    animation: ringExpand 1.2s ease-out infinite;
                }
                @keyframes iconPop {
                    0% { transform: scale(0); opacity: 0; }
                    100% { transform: scale(1); opacity: 1; }
                }
                @keyframes ringExpand {
                    0% { transform: scale(1); opacity: 0.5; }
                    100% { transform: scale(1.4); opacity: 0; }
                }
                .success-title {
                    font-size: 24px; font-weight: 800;
                    color: #f1f5f9; margin: 0 0 12px;
                }
                .success-text {
                    font-size: 15px; color: #94a3b8;
                    line-height: 1.7; margin: 0 0 16px;
                }
                .success-email { color: #38bdf8; }
                .success-hint {
                    font-size: 13px; color: #64748b; margin: 0;
                }
                .resend-link {
                    background: none; border: none; padding: 0;
                    color: #0ea5e9; cursor: pointer; font-size: 13px;
                    font-family: inherit; text-decoration: underline;
                    transition: color 0.15s;
                }
                .resend-link:hover { color: #38bdf8; }

                /* back link */
                .back-link-wrap {
                    text-align: center;
                    margin-top: 24px;
                    padding-top: 20px;
                    border-top: 1px solid rgba(255,255,255,0.06);
                }
                .back-link {
                    font-size: 14px; color: #64748b;
                    text-decoration: none;
                    transition: color 0.2s;
                    display: inline-flex; align-items: center; gap: 4px;
                }
                .back-link:hover { color: #38bdf8; }
            `}</style>
        </div>
    );
}
