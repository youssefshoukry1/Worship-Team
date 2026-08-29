'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
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
                await Filesystem.mkdir({ path: 'wasla_chats', directory: Directory.Data, recursive: true });
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
        console.error('Failed to save local messages', err);
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
    const isConnectedRef = useRef(false); // Use ref to avoid stale closure in sendMessage
    const [isConnected, setIsConnected] = useState(false);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [typingUsers, setTypingUsers] = useState([]);
    const [prevTeamId, setPrevTeamId] = useState(teamId);

    // Reset immediately on team switch
    if (teamId !== prevTeamId) {
        setPrevTeamId(teamId);
        setMessages([]);
        setLoading(true);
        setIsConnected(false);
        isConnectedRef.current = false;
    }

    // Initial fetch: offline-first
    useEffect(() => {
        if (!teamId) return;
        let isMounted = true;

        const syncMessages = async () => {
            setLoading(true);
            const cached = await loadLocalMessages(teamId);
            if (isMounted && cached.length > 0) {
                // Filter out any stale pending messages from cache
                setMessages(cached.filter(m => m.status !== 'pending'));
                setLoading(false);
            }

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
                        // Add confirmed messages first (existing non-pending)
                        prev.forEach(msg => {
                            if (msg._id) msgMap.set(String(msg._id), msg);
                        });
                        // Override with fresh server data
                        remoteMsgs.forEach(msg => {
                            if (msg._id) msgMap.set(String(msg._id), msg);
                        });

                        const merged = Array.from(msgMap.values());
                        merged.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                        // Re-attach any still-pending optimistic messages at the end
                        const pending = prev.filter(m => m.status === 'pending');

                        saveLocalMessages(teamId, merged);
                        return [...merged, ...pending];
                    });
                }
            } catch (err) {
                console.error('Failed to sync messages with server', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        syncMessages();
        return () => { isMounted = false; };
    }, [teamId, token]);

    // Socket connection
    useEffect(() => {
        if (!teamId || !user_id) return;

        const socket = io(`${SOCKET_URL}/chat`, {
            transports: ['websocket'],
            autoConnect: true,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            isConnectedRef.current = true;
            setIsConnected(true);
            socket.emit('join-team', { teamId, userId: user_id });
        });

        socket.on('disconnect', () => {
            isConnectedRef.current = false;
            setIsConnected(false);
        });

        socket.on('user-typing', ({ userId, userName, isTyping }) => {
            if (!userId || String(userId) === String(user_id)) return;
            setTypingUsers(prev => {
                const withoutUser = prev.filter(user => String(user.userId) !== String(userId));
                return isTyping ? [...withoutUser, { userId, userName: userName || 'Someone' }] : withoutUser;
            });
        });

        socket.on('new-message', (msg) => {
            setMessages((prev) => {
                // 1. Try exact tempId match (if server echoes it)
                if (msg.tempId) {
                    const idx = prev.findIndex(m => m._tempId === msg.tempId);
                    if (idx !== -1) {
                        const updated = [...prev];
                        updated[idx] = msg;
                        saveLocalMessages(teamId, updated);
                        return updated;
                    }
                }

                // 2. Replace oldest pending from same sender+type (FIFO)
                //    Normalize missing type to 'text' (server may omit it for default type)
                const msgType = msg.type || 'text';
                const pendingIdx = prev.findIndex(m =>
                    m.status === 'pending' &&
                    String(m.senderId) === String(msg.senderId) &&
                    m.type === msgType
                );
                if (pendingIdx !== -1) {
                    const updated = [...prev];
                    updated[pendingIdx] = msg;
                    saveLocalMessages(teamId, updated);
                    return updated;
                }

                // 3. Skip exact duplicate by _id
                if (prev.some(m => m._id && String(m._id) === String(msg._id))) {
                    return prev;
                }

                // 4. New message from someone else
                const updated = [...prev, msg];
                saveLocalMessages(teamId, updated);
                return updated;
            });
        });

        socket.on('message-updated', (updatedMsg) => {
            setMessages((prev) => {
                const updated = prev.map(m =>
                    m._id && String(m._id) === String(updatedMsg._id) ? updatedMsg : m
                );
                saveLocalMessages(teamId, updated);
                return updated;
            });
        });

        socket.on('message-deleted', (updatedMsg) => {
            setMessages((prev) => {
                const updated = prev.map(m =>
                    m._id && String(m._id) === String(updatedMsg._id) ? updatedMsg : m
                );
                saveLocalMessages(teamId, updated);
                return updated;
            });
        });

        return () => {
            socket.emit('leave-team', { teamId });
            socket.disconnect();
            socketRef.current = null;
            setTypingUsers([]);
        };
    }, [teamId, user_id]);

    const sendMessage = async (text, type = 'text', mediaUrl = null, pollData = null, localPreviewUrl = null, uploadFn = null, fileMeta = {}, replyTo = null) => {
        if (!teamId || !user_id || !user_name) return;
        if (type === 'text' && !text.trim()) return;
        if (['audio', 'image', 'sticker', 'file', 'document'].includes(type) && !mediaUrl && !uploadFn) return;
        if (type === 'poll' && !pollData) return;

        const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        const optimisticMsg = {
            _tempId: tempId,
            _id: null,
            teamId,
            senderId: user_id,
            senderName: user_name,
            text: type === 'poll' ? (pollData?.question || '') : text,
            type,
            mediaUrl: localPreviewUrl || mediaUrl, // local blob URL for instant 0ms playback on sender UI
            fileName: fileMeta.fileName || null,
            mimeType: fileMeta.mimeType || null,
            replyTo,
            pollData: type === 'poll' ? pollData : null,
            createdAt: new Date().toISOString(),
            status: 'pending',
        };

        setMessages(prev => [...prev, optimisticMsg]);

        let finalMediaUrl = mediaUrl;
        if (uploadFn) {
            try {
                finalMediaUrl = await uploadFn();
            } catch (err) {
                console.error('Upload failed for message:', tempId, err);
                setMessages(prev => prev.map(m => m._tempId === tempId ? { ...m, status: 'error' } : m));
                return;
            }
        }

        if (socketRef.current && isConnectedRef.current) {
            socketRef.current.emit('send-message', {
                tempId,
                teamId,
                senderId: user_id,
                senderName: user_name,
                text: type === 'poll' ? (pollData.question || '') : text,
                type,
                mediaUrl: finalMediaUrl, // send real CDN URL to server
                pollData: type === 'poll' ? pollData : null,
                fileName: fileMeta.fileName || null,
                mimeType: fileMeta.mimeType || null
                , replyTo
            });

        }
    };

    const setTyping = useCallback((isTyping) => {
        if (socketRef.current && isConnectedRef.current && teamId && user_id) {
            socketRef.current.emit('typing', { teamId, userId: user_id, userName: user_name, isTyping });
        }
    }, [teamId, user_id, user_name]);

    return { messages, sendMessage, isConnected, loading, socket: socketRef, typingUsers, setTyping };
}
