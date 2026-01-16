"use client";
import React, { createContext, useContext, useState, useEffect } from "react";
import { translations } from "../i18n/translations";

type Language = "en" | "ar" | "de";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof (typeof translations)["en"]) => string;
  dir: "ltr" | "rtl";
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined
);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Default to English initially to avoid hydration mismatch,
  // or use a more complex logic if server-side detection is needed.
  // For now, we'll stick to 'en' and update on mount if needed.
  const [language, setLanguage] = useState<Language>("en");

  // Load saved language on mount
  useEffect(() => {
    const savedLang = localStorage.getItem("app-language") as Language;
    if (savedLang && ["en", "ar", "de"].includes(savedLang)) {
      setLanguage(savedLang);
      document.documentElement.dir = "ltr";
      document.documentElement.lang = savedLang;
    }
  }, []);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("app-language", lang);
    document.documentElement.dir = "ltr";
    document.documentElement.lang = lang;
  };

  const t = (key: keyof (typeof translations)["en"]) => {
    // @ts-ignore
    return translations[language][key] || translations["en"][key] || key;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage: handleSetLanguage,
        t,
        dir: "ltr",
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
