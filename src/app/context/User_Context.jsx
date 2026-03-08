"use client";

import { createContext, useEffect, useState } from "react";

// اعملنا الكونتكست هنا مباشرة
export const UserContext = createContext();

// ✅ In User_Context.jsx — replace all the separate useEffects with this:

export default function UserContextProvider({ children }) {

  const [isLogin, setLogin] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_Token") || null;
  });

  const [UserRole, setUserRole] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_Role")?.trim() || null;
  });

  const [user_id, setUser_id] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_ID") || null;
  });

  const [churchId, setChurchId] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_ChurchId") || null;
  });

  const [HymnIds, setHymnIds] = useState(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("user_Taspe7_HymnIds");
    return saved ? JSON.parse(saved) : [];
  });

  const [UserStatus, setUserStatus] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_Status")?.trim() || null;
  });

  const [vocalsMode, setVocalsMode] = useState(false);

  // ✅ Remove ALL the old useEffects — no longer needed

  return (
    <UserContext.Provider value={{ isLogin, setLogin, UserRole, setUserRole, user_id, setUser_id, churchId, setChurchId, HymnIds, setHymnIds, vocalsMode, setVocalsMode, UserStatus, setUserStatus }}>
      {children}
    </UserContext.Provider>
  );
}