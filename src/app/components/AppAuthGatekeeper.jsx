"use client";

import React, { useContext, useRef, useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import axios from "axios";
import { UserContext } from "../context/User_Context";
import AuthForm from "./AuthForm";
import ClaimUsernameModal from "./ClaimUsernameModal";
import Navbar from "../Navbar/Navbar";
import Footer from "../Footer/Footer";
import PageTransition from "../page-transition/page-transition";

const PUBLIC_ROUTES = ["/privacy-policy"];

// React 19 recommended hydration check
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export default function AppAuthGatekeeper({ children }) {
  const isMounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { isLogin, username, setUsername } = useContext(UserContext);
  const pathname = usePathname();
  const isCheckingRef = useRef(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://worship-team-api.onrender.com/api";

  // Sync username from backend if missing in context but token exists
  useEffect(() => {
    if (isLogin && !username && !isCheckingRef.current) {
      const storedUsername = localStorage.getItem("user_Taspe7_Username");
      if (storedUsername) {
        setUsername(storedUsername);
        return;
      }

      isCheckingRef.current = true;
      axios
        .get(`${apiBase}/users/my-profile`, {
          headers: { Authorization: `Bearer ${isLogin}` },
        })
        .then((res) => {
          const profileUser = res.data?.user;
          if (profileUser?.username) {
            localStorage.setItem("user_Taspe7_Username", profileUser.username);
            setUsername(profileUser.username);
          }
        })
        .catch((err) => {
          console.error("Profile sync error:", err);
        });
    }
  }, [isLogin, username, setUsername, apiBase]);

  // Initial SSR / mount loader
  if (!isMounted) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Allow public routes without authentication
  if (PUBLIC_ROUTES.includes(pathname)) {
    return <PageTransition>{children}</PageTransition>;
  }

  // Case 1: User has no account or logged out -> Show ONLY sign-in page (No Navbar, No hymns)
  if (!isLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#020617] via-[#0f172a] to-[#172554] p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.1),transparent_50%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.1),transparent_50%)] pointer-events-none" />
        <div className="relative z-10 w-full flex justify-center py-8">
          <AuthForm />
        </div>
      </div>
    );
  }

  // Case 2: Logged in, but has not chosen an @username -> Global Gatekeeper Modal (unclosable, locks app)
  if (!username) {
    return (
      <div className="fixed inset-0 z-[99999] bg-[#020617] flex items-center justify-center p-4">
        <ClaimUsernameModal
          token={isLogin}
          onSuccess={(handle) => {
            localStorage.setItem("user_Taspe7_Username", handle);
            setUsername(handle);
          }}
        />
      </div>
    );
  }

  // Case 3: Fully authenticated with @username -> Full App access
  return (
    <>
      <Navbar />
      <PageTransition>{children}</PageTransition>
      <Footer />
    </>
  );
}
