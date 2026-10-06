"use client";
import React, { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext(undefined);

const THEME_STORAGE_KEY = "taspe7_theme";

function applyThemeToDom(mode) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (mode === "dark") {
        root.classList.add("dark");
        root.setAttribute("data-theme", "dark");
        document.body?.classList.add("dark");
    } else {
        root.classList.remove("dark");
        root.setAttribute("data-theme", "light");
        document.body?.classList.remove("dark");
    }
}

export function ThemeProvider({ children }) {
    const [theme, setThemeState] = useState(() => {
        if (typeof window === "undefined") return "light";
        try {
            const saved = localStorage.getItem(THEME_STORAGE_KEY);
            return saved === "dark" ? "dark" : "light";
        } catch {
            return "light";
        }
    });

    useEffect(() => {
        applyThemeToDom(theme);
    }, [theme]);

    const setTheme = (mode) => {
        const next = mode === "dark" ? "dark" : "light";
        setThemeState(next);
        applyThemeToDom(next);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {}
    };

    const toggleTheme = () => {
        setTheme(theme === "dark" ? "light" : "dark");
    };

    return (
        <ThemeContext.Provider
            value={{
                theme,
                isDark: theme === "dark",
                setTheme,
                toggleTheme,
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
};
