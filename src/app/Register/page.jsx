"use client";

import { useEffect, useContext } from "react";
import { useRouter } from "next/navigation";
import { UserContext } from "../context/User_Context";
import AuthForm from "../components/AuthForm";

export default function Register() {
  const { isLogin } = useContext(UserContext);
  const router = useRouter();

  useEffect(() => {
    if (isLogin) {
      router.replace("/");
    }
  }, [isLogin, router]);

  if (isLogin) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4">
        <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#020617] via-[#0f172a] to-[#172554] relative overflow-hidden py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.1),transparent_50%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.1),transparent_50%)] pointer-events-none" />
      <div className="relative z-10 w-full flex justify-center">
        <AuthForm />
      </div>
    </div>
  );
}