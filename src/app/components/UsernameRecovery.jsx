"use client";

import { useContext, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import axios from "axios";
import { UserContext } from "../context/User_Context";
import { useLanguage } from "../context/LanguageContext";
import { getApiBaseUrl } from "../utils/apiBase";

function LoadingAccount() {
  const { t } = useLanguage();
  return <p data-launch-username role="status">{t("openingAccount")}</p>;
}

const ClaimUsernameModal = dynamic(() => import("./ClaimUsernameModal"), { loading: LoadingAccount });

export default function UsernameRecovery({ token }) {
  const { setUsername, user_id, profilePhoto, setProfilePhoto, logout } = useContext(UserContext);
  const { t } = useLanguage();
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && localStorage.getItem("user_Taspe7_Token") === token;
    async function recover() {
      const cached = localStorage.getItem("user_Taspe7_Username");
      if (!current()) return;
      if (cached) { setUsername(cached); return; }
      if (!navigator.onLine) {
        setStatus("error");
        return;
      }
      setStatus("loading");
      try {
        const { data } = await axios.get(getApiBaseUrl() + "/users/my-profile", {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, timeout: 8000,
        });
        if (!current()) return;
        const user = data?.user;
        if (!user?._id || (user_id && user._id !== user_id)) {
          setStatus("error");
          return;
        }
        if (user.profilePhoto) {
          localStorage.setItem("user_Taspe7_ProfilePhoto", user.profilePhoto);
          setProfilePhoto(user.profilePhoto);
        }
        if (user.username) {
          localStorage.setItem("user_Taspe7_Username", user.username);
          setUsername(user.username);
        } else {
          setStatus("claim");
        }
      } catch (error) {
        if (current()) setStatus(error.response?.status === 401 ? "expired" : "error");
      }
    }
    void recover();
    return () => controller.abort();
  }, [attempt, setProfilePhoto, setUsername, token, user_id]);

  useEffect(() => {
    if (status !== "error") return;
    const retry = () => setAttempt(n => n + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [status]);

  if (status === "claim") return (
    <div className="fixed inset-0 z-[99999] bg-app-page flex items-center justify-center p-4">
      <ClaimUsernameModal token={token} initialPhoto={profilePhoto} onCancel={logout} onSuccess={data => {
        if (localStorage.getItem("user_Taspe7_Token") !== token) return;
        if (data?.profilePhoto) {
          localStorage.setItem("user_Taspe7_ProfilePhoto", data.profilePhoto);
          setProfilePhoto(data.profilePhoto);
        }
        const handle = data?.username || data;
        localStorage.setItem("user_Taspe7_Username", handle);
        setUsername(handle);
      }} />
    </div>
  );

  return <main data-launch-username className="app-page grid min-h-dvh place-content-center gap-4 px-6 text-center">
    <p role="status">{t(status === "expired" ? "sessionSignInAgain" : status === "error" ? "accountRecoveryError" : "openingAccount")}</p>
    <div className="flex justify-center gap-3">
      {status === "error" && <button type="button" className="min-h-11 px-4 text-sky-400" onClick={() => setAttempt(n => n + 1)}>{t("tryAgainBtn")}</button>}
      <button type="button" className="min-h-11 px-4" onClick={logout}>{t(status === "expired" ? "signIn" : "logout")}</button>
    </div>
  </main>;
}
