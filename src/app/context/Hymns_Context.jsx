"use client";

import { createContext, useEffect, useState } from "react";

// اعملنا الكونتكست هنا مباشرة
export const HymnsContext = createContext();

export default function HymnsContextProvider({ children }) {
    const [workspace, setWorkspace] = useState([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('workspace');
        if (saved) {
            try {
                setWorkspace(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse workspace from localStorage", e);
            }
        }
        setIsLoaded(true);
    }, []);

    // Save to localStorage when workspace changes (only after initial load)
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem('workspace', JSON.stringify(workspace));
        }
    }, [workspace, isLoaded]);

    // Check if a hymn is already in the workspace
    const isHymnInWorkspace = (id) => {
        return workspace.some(h => h._id === id);
    };

    // Add hymn to workspace
    const addToWorkspace = (hymn) => {
        if (!isHymnInWorkspace(hymn._id)) {
            setWorkspace(prev => [...prev, hymn]);
            return true; // Success
        }
        return false; // Already exists
    };

    // Remove hymn from workspace
    const removeFromWorkspace = (id) => {
        setWorkspace(prev => prev.filter(h => h._id !== id));
    };

    return (
        <HymnsContext.Provider value={{ workspace, addToWorkspace, removeFromWorkspace, isHymnInWorkspace }}>
            {children}
        </HymnsContext.Provider>
    );
}
