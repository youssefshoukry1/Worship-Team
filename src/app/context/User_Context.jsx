"use client";

import { createContext, useEffect, useState } from "react";

// اعملنا الكونتكست هنا مباشرة
export const UserContext = createContext();

export default function UserContextProvider({ children }) {
  const [isLogin, setLogin] = useState(null);
  const [UserRole, setUserRole] = useState(null)

  // Check token stored in browser
  useEffect(() => {
    const token = localStorage.getItem("user_Taspe7_Token");
    if (token) {
      setLogin(token);
    }
  }, []);

  useEffect(()=>{
    const Role = localStorage.getItem("user_Taspe7_Role");
    if (Role) {
      setUserRole(Role);
    }
  })

  return (
    <UserContext.Provider value={{ isLogin, setLogin, UserRole, setUserRole }}>
      {children}
    </UserContext.Provider>
  );
}
