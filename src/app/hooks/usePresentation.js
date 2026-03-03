'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';

// The socket server is now part of the backend. We use the backend URL.
// If process.env.NEXT_PUBLIC_API_URL is mostly used for the Vercel URL, locally it should fall back to port 5000
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');


/**
 * usePresentation
 * Manages a Socket.io connection for the real-time hymn presentation system.
 *
 * @param {string|null} dataShowId  - Room identifier (e.g. "sunday-01"). Pass null to stay disconnected.
 * @param {'controller'|'display'|'remote'} role - Who is this client?
 *
 * Returns:
 *   isConnected        boolean
 *   broadcastHymn      (hymn, slides) => void   — called when presenter picks a hymn
 *   broadcastSlide     (slideIndex)  => void   — called when slide changes
 *   clearDisplay       ()            => void   — blank screen signal
 *   displayState       { currentHymnId, currentHymnTitle, slides, currentSlide } | null
 *                      (populated for 'display'/'remote' roles that listen)
 */
export function usePresentation(dataShowId, role = 'controller') {
    const socketRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [displayState, setDisplayState] = useState(null);

    useEffect(() => {
        if (!dataShowId) return;

        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            setIsConnected(true);
            socket.emit('join-session', { dataShowId, role });
            console.log(`[Socket] Connected as ${role} to show:${dataShowId}`);
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
            console.log('[Socket] Disconnected');
        });

        // Display / remote roles listen for updates
        socket.on('display-update', (state) => {
            console.log(`[Socket] received display-update:`, state);
            setDisplayState(state);
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
            setIsConnected(false);
        };
    }, [dataShowId, role]);

    /** Tell all displays a new hymn is being presented */
    const broadcastHymn = useCallback((hymn, slides) => {
        if (!socketRef.current || !dataShowId) return;
        console.log(`[Socket] emitting hymn-change`, { hymnTitle: hymn.title, slides: slides.length });
        socketRef.current.emit('hymn-change', {
            dataShowId,
            hymnId: hymn._id,
            hymnTitle: hymn.title,
            slides,
        });
    }, [dataShowId]);

    /** Tell all displays to jump to a specific slide */
    const broadcastSlide = useCallback((slideIndex) => {
        if (!socketRef.current || !dataShowId) return;
        console.log(`[Socket] emitting slide-change:`, slideIndex);
        socketRef.current.emit('slide-change', { dataShowId, slideIndex });
    }, [dataShowId]);

    /** Blank the display for everyone */
    const clearDisplay = useCallback(() => {
        if (!socketRef.current || !dataShowId) return;
        socketRef.current.emit('clear-display', { dataShowId });
    }, [dataShowId]);

    return { isConnected, broadcastHymn, broadcastSlide, clearDisplay, displayState };
}
