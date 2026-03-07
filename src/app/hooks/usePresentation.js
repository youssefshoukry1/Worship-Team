'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

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

    // Initial setup cleanup reference
    const cleanupWebRTC = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        Object.values(peersRef.current).forEach(pc => {
            pc.close();
        });
        peersRef.current = {};
        setIsAudioActive(false);

        if (viewerPeerRef.current) {
            viewerPeerRef.current.close();
            viewerPeerRef.current = null;
        }
        setRemoteAudioStream(null);
        currentControllerIdRef.current = null;
    }, []);

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
            cleanupWebRTC();
        });

        // Display / remote roles listen for updates
        socket.on('display-update', (state) => {
            console.log(`[Socket] received display-update:`, state);
            setDisplayState(state);
        });

        // --- WebRTC signaling ---

        // Viewer hears that audio started -> Requests audio
        socket.on('audio-started', ({ controllerId }) => {
            if (role === 'controller') return;
            currentControllerIdRef.current = controllerId;
            socket.emit('request-audio', { targetId: controllerId });
        });

        // Viewer hears that audio stopped -> Clear remote audio
        socket.on('audio-stopped', () => {
            if (role === 'controller') return;
            setRemoteAudioStream(null);
            currentControllerIdRef.current = null;
            if (viewerPeerRef.current) {
                viewerPeerRef.current.close();
                viewerPeerRef.current = null;
            }
        });

        // Controller hears a request to join audio from a viewer
        socket.on('request-audio', async ({ from }) => {
            if (role !== 'controller') return;
            if (!localStreamRef.current) return; // Audio not active

            // Create PC for this viewer
            const pc = new RTCPeerConnection(ICE_SERVERS);
            peersRef.current[from] = pc;

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('webrtc-ice-candidate', { targetId: from, candidate: event.candidate });
                }
            };

            // Add local tracks to PC
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current);
            });

            // Create and send offer
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('webrtc-offer', { targetId: from, offer });
            } catch (err) {
                console.error("Error creating offer", err);
            }
        });

        // Viewer receives an offer from Controller
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
                console.error("Error setting up remote offer and answering", err);
            }
        });

        // Controller receives answer from Viewer
        socket.on('webrtc-answer', async ({ from, answer }) => {
            if (role !== 'controller') return;
            const pc = peersRef.current[from];
            if (pc) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(answer));
                } catch (err) {
                    console.error("Error setting remote description from answer", err);
                }
            }
        });

        // Both receive ICE candidates
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
                console.error("Error adding ice candidate", err);
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
            // Stop audio
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
                localStreamRef.current = null;
            }
            Object.values(peersRef.current).forEach(pc => pc.close());
            peersRef.current = {};
            setIsAudioActive(false);
            socketRef.current.emit('audio-stopped', { dataShowId });
        } else {
            // Start audio
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                localStreamRef.current = stream;
                setIsAudioActive(true);
                socketRef.current.emit('audio-started', { dataShowId, controllerId: socketRef.current.id });

                // Also listen for viewers that are already in the room:
                // If they are missing the audio-started event, it's safer if we broadcast it to the room.
            } catch (err) {
                console.error("Failed to get microphone:", err);
                alert("Could not access microphone.");
            }
        }
    }, [isAudioActive, dataShowId, role]);

    /** Tell all displays a new hymn is being presented */
    const broadcastHymn = useCallback((hymn, slides) => {
        if (!socketRef.current || !dataShowId) return;
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
        socketRef.current.emit('slide-change', { dataShowId, slideIndex });
    }, [dataShowId]);

    /** Blank the display for everyone */
    const clearDisplay = useCallback(() => {
        if (!socketRef.current || !dataShowId) return;
        socketRef.current.emit('clear-display', { dataShowId });
    }, [dataShowId]);

    return {
        isConnected,
        broadcastHymn,
        broadcastSlide,
        clearDisplay,
        displayState,
        toggleAudio,
        isAudioActive,
        remoteAudioStream
    };
}
