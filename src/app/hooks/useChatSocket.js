'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/apiBase';

const API_URL = getApiBaseUrl();
const SOCKET_URL = (process.env.NEXT_PUBLIC_SOCKET_URL || API_URL.replace(/\/api\/?$/, '')).replace(/\/+$/, '');

export function useChatSocket(teamId, user_id, user_name, token) {
    const socketRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);

    // Initial fetch of messages
    useEffect(() => {
        if (!teamId || !token) return;

        const fetchMessages = async () => {
            try {
                setLoading(true);
                const res = await axios.get(`${API_URL}/chat/messages?teamId=${teamId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setMessages(res.data.messages || []);
            } catch (err) {
                console.error("Failed to fetch messages", err);
            } finally {
                setLoading(false);
            }
        };

        fetchMessages();
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
                // Prevent duplicates if needed, but typically trust the server broadcast
                if (prev.some(m => m._id === msg._id)) return prev;
                return [...prev, msg];
            });
        });

        socket.on('message-updated', (updatedMsg) => {
            setMessages((prev) =>
                prev.map((m) => (m._id === updatedMsg._id ? updatedMsg : m))
            );
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
        if (type === 'audio' && !mediaUrl) return;
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

    // السطر الأخير
    return { messages, sendMessage, isConnected, loading, socket: socketRef };
}
