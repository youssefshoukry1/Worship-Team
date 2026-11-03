"use client";
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { translations } from "../i18n/translations";

const LanguageContext = createContext(undefined);

export function LanguageProvider({ children }) {
    // Default to English initially to avoid hydration mismatch,
    // or use a more complex logic if server-side detection is needed.
    // For now, we'll stick to 'en' and update on mount if needed.
    const [language, setLanguage] = useState("ar");

    // Load saved language on mount
    useEffect(() => {
        const savedLang = localStorage.getItem("app-language");
        const activeLang = (savedLang && ["en", "ar", "de"].includes(savedLang)) ? savedLang : "ar";
        setLanguage(activeLang);
        if (!savedLang) {
            localStorage.setItem("app-language", "ar");
        }
        document.documentElement.dir = "ltr";
        document.documentElement.lang = activeLang;
    }, []);

    const handleSetLanguage = useCallback((lang) => {
        setLanguage(lang);
        localStorage.setItem("app-language", lang);
        document.documentElement.dir = "ltr";
        document.documentElement.lang = lang;
    }, []);

    const t = useCallback((key) => {
        // @ts-ignore
        return translations[language][key] || translations["en"][key] || key;
    }, [language]);
    const value = useMemo(() => ({ language, setLanguage: handleSetLanguage, t, dir: 'ltr' }), [language, handleSetLanguage, t]);

    return (
        <LanguageContext.Provider
            value={value}
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
