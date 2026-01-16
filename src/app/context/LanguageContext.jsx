"use client";
import React, { createContext, useContext, useState, useEffect } from "react";
import { translations } from "../i18n/translations";

const LanguageContext = createContext(undefined);

export function LanguageProvider({ children }) {
    // Default to English initially to avoid hydration mismatch,
    // or use a more complex logic if server-side detection is needed.
    // For now, we'll stick to 'en' and update on mount if needed.
    const [language, setLanguage] = useState("en");

    // Load saved language on mount
    useEffect(() => {
        const savedLang = localStorage.getItem("app-language");
        if (savedLang && ["en", "ar", "de"].includes(savedLang)) {
            setLanguage(savedLang);
            document.documentElement.dir = "ltr";
            document.documentElement.lang = savedLang;
        }
    }, []);

    const handleSetLanguage = (lang) => {
        setLanguage(lang);
        localStorage.setItem("app-language", lang);
        document.documentElement.dir = "ltr";
        document.documentElement.lang = lang;
    };

    const t = (key) => {
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
