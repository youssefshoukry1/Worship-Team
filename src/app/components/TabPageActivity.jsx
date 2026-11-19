'use client';
import { createContext, useContext } from 'react';
// The authenticated provider remounts the pager when the account changes.
export const TabViewMemory = createContext(null);
export const useTabViewMemory = () => useContext(TabViewMemory);
// A pending destination can load data before its tab is selected. Visual measurements wait for selection.
export const TabPageSelected = createContext(true);
export const TabPageActivity = createContext(true);
export const useTabPageActive = () => useContext(TabPageActivity);
