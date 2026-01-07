"use client";

import { createContext, useEffect, useState } from "react";

// اعملنا الكونتكست هنا مباشرة
export const UserContext = createContext();

export default function UserContextProvider({ children }) {
  const [isLogin, setLogin] = useState(null);
  const [UserRole, setUserRole] = useState(null)
  const [user_id, setUser_id] = useState(null)

  const [churchId, setChurchId] = useState(null);
  const [HymnIds, setHymnIds] = useState([])

  // Check token stored in browser

  useEffect(() => {
    const user_id = localStorage.getItem("user_Taspe7_ID");
    if (user_id) {
      setUser_id(user_id);
    }
    const church_id = localStorage.getItem("user_Taspe7_ChurchId");
    if (church_id) {
      setChurchId(church_id);
    }
  }, []);


  useEffect(() => {
    const token = localStorage.getItem("user_Taspe7_Token");
    if (token) {
      setLogin(token);
    }
  }, []);

  useEffect(() => {
    const hymnIds = localStorage.getItem("user_Taspe7_HymnIds");
    if (hymnIds) {
      setHymnIds(JSON.parse(hymnIds));
    }
  }, []);


  useEffect(() => {
    const Role = localStorage.getItem("user_Taspe7_Role");
    if (Role) {
      setUserRole(Role);
    }
  })

  return (
    <UserContext.Provider value={{ isLogin, setLogin, UserRole, setUserRole, user_id, setUser_id, churchId, setChurchId, HymnIds, setHymnIds }}>
      {children}
    </UserContext.Provider>
  );
}
