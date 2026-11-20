"use client";

import React, { useContext, useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import UsernameRecovery from "./UsernameRecovery";
import { UserContext } from "../context/User_Context";
import useNativeLaunchHandoff from '../hooks/useNativeLaunchHandoff';
import AppStartupShell from './AppStartupShell';
import PageSkeleton, { pageSkeletonVariant } from './PageSkeleton';
import Navbar from "../Navbar/Navbar";
import PageTransition from "../page-transition/page-transition";
import BottomNav from "./BottomNav";
// Logout must render sign-in immediately, even before another chunk can load.
import AuthForm from './AuthForm';

const PUBLIC_ROUTES = ["/privacy-policy", "/subscription-terms"];
// React 19 recommended hydration check
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export default function AppAuthGatekeeper({ children }) {
  const isMounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { isLogin, username } = useContext(UserContext);
  const pathname = usePathname();
  const isPrayerEntry = ['/', '/index.html', '/pray', '/pray/', '/pray/index.html'].includes(pathname);
  const router = useRouter();
  const redirecting = isLogin && ["/login", "/Register"].includes(pathname?.replace(/\/$/, ''));
  const previewOpen = useNativeLaunchHandoff({
    mounted: isMounted && !redirecting,
    waitForPrayer: isPrayerEntry && Boolean(isLogin && username),
    waitForUsername: Boolean(isLogin && !username) && !PUBLIC_ROUTES.includes(pathname?.replace(/\/$/, '')),
  });

  // Logout can happen at the bottom of a long profile page. Reset before paint
  // so sign-in never inherits that scroll position or jumps into view later.
  useLayoutEffect(() => {
    if (isMounted && !isLogin) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [isMounted, isLogin]);

  // Redirect authenticated user if they land on sign-in routes
  useEffect(() => {
    if (isLogin && (pathname === "/login" || pathname === "/Register")) {
      router.replace("/");
    }
  }, [isLogin, pathname, router]);

  // Static public layout is ready before hydration; private data remains gated.
  const shell = (!isMounted || (previewOpen && isPrayerEntry)) &&
    <AppStartupShell key="launch" prayerEntry={isPrayerEntry} variant={pageSkeletonVariant(pathname)} publicPage={PUBLIC_ROUTES.includes(pathname.replace(/\/$/, ''))} />;
  if (!isMounted) return <>{shell}</>;

  // Allow public routes without authentication
  if (PUBLIC_ROUTES.includes(pathname.replace(/\/$/, ''))) {
    return <PageTransition>{children}</PageTransition>;
  }

  // Case 1: User has no account or logged out -> Show ONLY sign-in page (No Navbar, No hymns)
  if (!isLogin) {
    return (
      <div className="app-page min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="app-ambient-glow absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.1),transparent_50%)] pointer-events-none" />
        <div className="app-ambient-glow absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.1),transparent_50%)] pointer-events-none" />
        <div className="relative z-10 w-full flex justify-center py-8">
          <AuthForm />
        </div>
      </div>
    );
  }

  // Brief loading spinner while redirecting away from sign-in routes
  if (pathname === "/login" || pathname === "/Register") {
    return <PageSkeleton variant="form" fullPage />;
  }

  if (!username) return <UsernameRecovery key={isLogin} token={isLogin} />;

  // Case 3: Fully authenticated with @username -> Full App access
  return (
    <>
      {shell}
      <Navbar />
      <PageTransition>{children}</PageTransition>
      <BottomNav />
    </>
  );
}
