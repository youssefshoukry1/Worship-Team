'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';
import { getApiBaseUrl } from '../utils/apiBase';

const API_URL = getApiBaseUrl();
const SOCKET_URL = (process.env.NEXT_PUBLIC_SOCKET_URL || API_URL.replace(/\/api\/?$/, '')).replace(/\/+$/, '');

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

/**
 * usePresentation
 * Manages a Socket.io connection for the real-time hymn presentation system & WebRTC audio.
 */
export function usePresentation(dataShowId, role = 'controller') {
    const socketRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [displayState, setDisplayState] = useState(null);

    // WebRTC logic
    const [isAudioActive, setIsAudioActive] = useState(false);
    const [remoteAudioStream, setRemoteAudioStream] = useState(null);

    // Controller specific
    const localStreamRef = useRef(null);
    const peersRef = useRef({}); // { viewerId: RTCPeerConnection }

    // Viewer specific
    const viewerPeerRef = useRef(null);
    const currentControllerIdRef = useRef(null);

    // Session timer & Limit exceeded state
    const [remainingSeconds, setRemainingSeconds] = useState(null);
    const [limitModalInfo, setLimitModalInfo] = useState({ show: false, message: '', resetAt: null });

    const closeLimitModal = useCallback(() => {
        setLimitModalInfo({ show: false, message: '', resetAt: null });
    }, []);

    const cleanupWebRTC = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        Object.values(peersRef.current).forEach(pc => { pc.close(); });
        peersRef.current = {};
        setIsAudioActive(false);

        if (viewerPeerRef.current) {
            viewerPeerRef.current.close();
            viewerPeerRef.current = null;
        }
        setRemoteAudioStream(null);
        currentControllerIdRef.current = null;
    }, []);

    // Countdown interval for presenter timer
    useEffect(() => {
        if (remainingSeconds === null || remainingSeconds === Infinity || remainingSeconds <= 0) return;

        const timer = setInterval(() => {
            setRemainingSeconds(prev => {
                if (prev === null || prev <= 1) {
                    clearInterval(timer);
                    localStorage.removeItem('myLivePresentationId');
                    cleanupWebRTC();
                    if (socketRef.current) socketRef.current.disconnect();
                    setLimitModalInfo(modalPrev => ({
                        ...modalPrev,
                        show: true,
                        message: modalPrev.message || 'لقد انتهت مهلة الجلسة المباشرة المسموح بها.'
                    }));
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [remainingSeconds, cleanupWebRTC]);

    // Keep-alive: ping the server every 10 minutes while a session is active.
    useEffect(() => {
        if (!dataShowId) return;
        const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
        const keepAlive = setInterval(() => {
            fetch(`${SOCKET_URL}/api/ping`).catch(() => {}); // silent — best-effort
        }, PING_INTERVAL_MS);
        return () => clearInterval(keepAlive);
    }, [dataShowId]);

    useEffect(() => {
        if (!dataShowId) return;

        const socket = io(SOCKET_URL, {
            transports: ['websocket'], // Force WebSocket
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            setIsConnected(true);
            socket.emit('join-session', { dataShowId, role });
            console.log(`[Socket] Connected as ${role} to show:${dataShowId}`);
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
            cleanupWebRTC();
        });

        socket.on('session-timer-init', ({ remainingMinutes, resetAt }) => {
            if (remainingMinutes === Infinity) {
                setRemainingSeconds(Infinity);
            } else if (typeof remainingMinutes === 'number') {
                setRemainingSeconds(Math.floor(remainingMinutes * 60));
            }
            if (resetAt) {
                setLimitModalInfo(prev => ({ ...prev, resetAt }));
            }
        });

        socket.on('session-limit-exceeded', ({ message, resetAt }) => {
            localStorage.removeItem('myLivePresentationId');
            cleanupWebRTC();
            setIsConnected(false);
            setLimitModalInfo({
                show: true,
                message: message || 'لقد انتهت مهلة الجلسة المباشرة.',
                resetAt: resetAt || null
            });
        });

        // Display / remote roles listen for updates.
        socket.on('display-update', (state) => {
            setDisplayState(prev => {
                if (
                    prev &&
                    prev.currentHymnId === state.currentHymnId &&
                    prev.currentSlide  === state.currentSlide  &&
                    prev.type          === state.type
                ) return prev;

                return {
                    ...prev,
                    ...state,
                    slides: state.slides !== undefined ? state.slides : (prev ? prev.slides : [])
                };
            });
        });

        // --- WebRTC signaling ---

        socket.on('audio-started', ({ controllerId }) => {
            if (role === 'controller') return;
            currentControllerIdRef.current = controllerId;
            socket.emit('request-audio', { targetId: controllerId });
        });

        socket.on('audio-stopped', () => {
            if (role === 'controller') return;
            setRemoteAudioStream(null);
            currentControllerIdRef.current = null;
            if (viewerPeerRef.current) {
                viewerPeerRef.current.close();
                viewerPeerRef.current = null;
            }
        });

        socket.on('request-audio', async ({ from }) => {
            if (role !== 'controller') return;
            if (!localStreamRef.current) return;

            const pc = new RTCPeerConnection(ICE_SERVERS);
            peersRef.current[from] = pc;

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('webrtc-ice-candidate', { targetId: from, candidate: event.candidate });
                }
            };

            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current);
            });

            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('webrtc-offer', { targetId: from, offer });
            } catch (err) {
                console.error('Error creating offer', err);
            }
        });

        socket.on('webrtc-offer', async ({ from, offer }) => {
            if (role === 'controller') return;

            if (viewerPeerRef.current) {
                viewerPeerRef.current.close();
            }

            const pc = new RTCPeerConnection(ICE_SERVERS);
            viewerPeerRef.current = pc;

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('webrtc-ice-candidate', { targetId: from, candidate: event.candidate });
                }
            };

            pc.ontrack = (event) => {
                if (event.streams && event.streams[0]) {
                    setRemoteAudioStream(event.streams[0]);
                } else {
                    const inboundStream = new MediaStream([event.track]);
                    setRemoteAudioStream(inboundStream);
                }
            };

            try {
                await pc.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('webrtc-answer', { targetId: from, answer });
            } catch (err) {
                console.error('Error setting up remote offer and answering', err);
            }
        });

        socket.on('webrtc-answer', async ({ from, answer }) => {
            if (role !== 'controller') return;
            const pc = peersRef.current[from];
            if (pc) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(answer));
                } catch (err) {
                    console.error('Error setting remote description from answer', err);
                }
            }
        });

        socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
            try {
                if (role === 'controller') {
                    const pc = peersRef.current[from];
                    if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } else {
                    const pc = viewerPeerRef.current;
                    if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
            } catch (err) {
                console.error('Error adding ice candidate', err);
            }
        });

        return () => {
            cleanupWebRTC();
            socket.disconnect();
            socketRef.current = null;
            setIsConnected(false);
        };
    }, [dataShowId, role, cleanupWebRTC]);

    const toggleAudio = useCallback(async () => {
        if (!socketRef.current || !dataShowId || role !== 'controller') return;

        if (isAudioActive) {
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
                localStreamRef.current = null;
            }
            Object.values(peersRef.current).forEach(pc => pc.close());
            peersRef.current = {};
            setIsAudioActive(false);
            socketRef.current.emit('audio-stopped', { dataShowId });
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                localStreamRef.current = stream;
                setIsAudioActive(true);
                socketRef.current.emit('audio-started', { dataShowId, controllerId: socketRef.current.id });
            } catch (err) {
                console.error('Failed to get microphone:', err);
                alert('Could not access microphone.');
            }
        }
    }, [isAudioActive, dataShowId, role]);

    const broadcastHymn = useCallback((hymn, slides) => {
        if (!socketRef.current || !dataShowId) return;
        socketRef.current.emit('hymn-change', {
            dataShowId,
            hymnId: hymn._id,
            hymnTitle: hymn.title,
            slides,
        });
    }, [dataShowId]);

    const broadcastSlide = useCallback((slideIndex) => {
        if (!socketRef.current || !dataShowId) return;
        socketRef.current.emit('slide-change', { dataShowId, slideIndex });
    }, [dataShowId]);

    const clearDisplay = useCallback(() => {
        if (!socketRef.current || !dataShowId) return;
        socketRef.current.emit('clear-display', { dataShowId });
    }, [dataShowId]);

    const formattedRemainingTime = remainingSeconds === null ? null : (
        remainingSeconds === Infinity ? 'غير محدود' : `${Math.floor(remainingSeconds / 60).toString().padStart(2, '0')}:${(remainingSeconds % 60).toString().padStart(2, '0')}`
    );

    return {
        isConnected,
        broadcastHymn,
        broadcastSlide,
        clearDisplay,
        displayState,
        toggleAudio,
        isAudioActive,
        remoteAudioStream,
        remainingSeconds,
        formattedRemainingTime,
        limitModalInfo,
        closeLimitModal,
        setRemainingSeconds
    };
}
