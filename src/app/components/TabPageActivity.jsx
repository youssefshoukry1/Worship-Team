'use client';
import { createContext, useContext } from 'react';
export const TabPageActivity = createContext(true);
export const useTabPageActive = () => useContext(TabPageActivity);
