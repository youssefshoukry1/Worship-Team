'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/apiBase';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import localforage from 'localforage';

const API_URL = getApiBaseUrl();
const SOCKET_URL = (process.env.NEXT_PUBLIC_SOCKET_URL || API_URL.replace(/\/api\/?$/, '')).replace(/\/+$/, '');

const isNative = Capacitor.isNativePlatform();
const getCacheFilename = (teamId) => `messages_${teamId}.json`;
const getCacheKey = (teamId) => `messages_${teamId}`;

const saveLocalMessages = async (teamId, messages) => {
    try {
        if (isNative) {
            try {
                await Filesystem.mkdir({
                    path: 'wasla_chats',
                    directory: Directory.Data,
                    recursive: true
                });
            } catch (e) { }

            await Filesystem.writeFile({
                path: `wasla_chats/${getCacheFilename(teamId)}`,
                directory: Directory.Data,
                data: JSON.stringify(messages),
                encoding: Encoding.UTF8
            });
        } else {
            await localforage.setItem(getCacheKey(teamId), messages);
        }
    } catch (err) {
        console.error("Failed to save local messages", err);
    }
};

const loadLocalMessages = async (teamId) => {
    try {
        if (isNative) {
            const contents = await Filesystem.readFile({
                path: `wasla_chats/${getCacheFilename(teamId)}`,
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            return JSON.parse(contents.data);
        } else {
            return (await localforage.getItem(getCacheKey(teamId))) || [];
        }
    } catch (err) {
        return [];
    }
};

export function useChatSocket(teamId, user_id, user_name, token) {
    const socketRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);

    // Initial fetch of messages with offline-first support
    useEffect(() => {
        if (!teamId) return;

        let isMounted = true;

        const syncMessages = async () => {
            // 1. Load offline cache first
            setLoading(true);
            const cached = await loadLocalMessages(teamId);
            if (isMounted && cached.length > 0) {
                setMessages(cached);
                setLoading(false); // Stop loading spinner if we have cached messages
            }

            // 2. Fetch fresh updates in the background
            if (!token) {
                if (isMounted) setLoading(false);
                return;
            }

            try {
                const res = await axios.get(`${API_URL}/chat/messages?teamId=${teamId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                const remoteMsgs = res.data.messages || [];

                if (isMounted) {
                    setMessages((prev) => {
                        const msgMap = new Map();
                        // Put cached ones first
                        prev.forEach(msg => {
                            if (msg._id) msgMap.set(msg._id, msg);
                        });
                        // Override with fresh updates from backend
                        remoteMsgs.forEach(msg => {
                            if (msg._id) msgMap.set(msg._id, msg);
                        });

                        const merged = Array.from(msgMap.values());
                        // Sort chronologically
                        merged.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                        // Persist combined list
                        saveLocalMessages(teamId, merged);
                        return merged;
                    });
                }
            } catch (err) {
                console.error("Failed to sync messages with server", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        syncMessages();

        return () => {
            isMounted = false;
        };
    }, [teamId, token]);

    // Socket Connection
    useEffect(() => {
        if (!teamId || !user_id) return;

        // Connect to the specific /chat namespace
        const socket = io(`${SOCKET_URL}/chat`, {
            transports: ['websocket'],
            autoConnect: true,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            setIsConnected(true);
            socket.emit('join-team', { teamId, userId: user_id });
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
        });

        socket.on('new-message', (msg) => {
            setMessages((prev) => {
                if (prev.some(m => m._id === msg._id)) return prev;
                const updated = [...prev, msg];
                saveLocalMessages(teamId, updated);
                return updated;
            });
        });

        socket.on('message-updated', (updatedMsg) => {
            setMessages((prev) => {
                const updated = prev.map((m) => (m._id === updatedMsg._id ? updatedMsg : m));
                saveLocalMessages(teamId, updated);
                return updated;
            });
        });

        return () => {
            socket.emit('leave-team', { teamId });
            socket.disconnect();
        };
    }, [teamId, user_id]);

    const sendMessage = (text, type = 'text', mediaUrl = null, pollData = null) => {
        if (!socketRef.current || !isConnected || !teamId || !user_id || !user_name) return;

        // Basic validation
        if (type === 'text' && !text.trim()) return;
        if ((type === 'audio' || type === 'image') && !mediaUrl) return;
        if (type === 'poll' && !pollData) return;

        socketRef.current.emit('send-message', {
            teamId,
            senderId: user_id,
            senderName: user_name,
            text: type === 'poll' ? (pollData.question || '') : text,
            type,
            mediaUrl,
            pollData: type === 'poll' ? pollData : null
        });
    };

    return { messages, sendMessage, isConnected, loading, socket: socketRef };
}
