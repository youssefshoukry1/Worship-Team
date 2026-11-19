'use client';
import { createContext, useContext } from 'react';
// The authenticated provider remounts the pager when the account changes.
export const TabViewMemory = createContext(null);
export const useTabViewMemory = () => useContext(TabViewMemory);
export const TabPageActivity = createContext(true);
export const useTabPageActive = () => useContext(TabPageActivity);
