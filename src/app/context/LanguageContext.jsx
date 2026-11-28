"use client";
import React, { createContext, useContext, useState, useLayoutEffect, useCallback, useMemo } from "react";
import { translations } from "../i18n/translations";

const LanguageContext = createContext(undefined);

export function LanguageProvider({ children }) {
    // Match the static export during hydration, then adopt the head script's
    // language before the hydrated screen paints.
    const [language, setLanguage] = useState("ar");

    useLayoutEffect(() => {
        setLanguage(document.documentElement.dataset.startupLanguage || "en");
        document.documentElement.dir = "ltr";
    }, []);

    const handleSetLanguage = useCallback((lang) => {
        setLanguage(lang);
        try { localStorage.setItem("app-language", lang); } catch { /* Storage can be unavailable. */ }
        document.documentElement.dataset.startupLanguage = lang;
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
