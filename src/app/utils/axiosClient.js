import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://worship-team-api.onrender.com/api';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    },
    validateStatus: (status) => status >= 200 && status < 500,
});

apiClient.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token = window.localStorage.getItem('user_Taspe7_Token');
        if (token) {
            config.headers = config.headers ?? {};
            config.headers.Authorization = `Bearer ${token}`;
        }
    }

    if (config.params) {
        config.params = Object.fromEntries(
            Object.entries(config.params).filter(([, value]) => value !== undefined && value !== null && value !== '')
        );
    }

    return config;
});

apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            console.warn('API request timed out. Please retry.');
        }

        return Promise.reject(error);
    }
);

export default apiClient;
