"use client";

import Link from "next/link";

export default function ResetPassword() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#030712]">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10 text-slate-100 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sky-500/10 text-sky-400 font-bold text-xl mb-4 border border-sky-500/20">
          ✨
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Passwordless Authentication</h2>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          Wasla has transitioned to 100% passwordless sign-in. You no longer need a password — simply sign in with Google or a quick 6-digit email code.
        </p>
        <Link
          href="/login"
          className="inline-block w-full py-3 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-sm font-semibold transition-colors shadow-md"
        >
          Go to Sign In
        </Link>
      </div>
    </div>
  );
}