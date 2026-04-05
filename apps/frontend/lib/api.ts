import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL!;

export const api = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 10000
});

// Request Interceptor: forward cookies for cookie-based auth
api.interceptors.request.use(
    (config) => config,
    (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 & Structured Errors
api.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        const originalRequest = error.config;

        // Handle 401 Unauthorized securely
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                // Attempt refresh
                await axios.post(`${BASE_URL}/auth/refresh/`, {}, { withCredentials: true });

                // Refresh successful, retry original request
                return api(originalRequest);
            } catch (refreshError) {
                // Refresh failed, logout
                useAuthStore.getState().logout();
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }

        // Format structured API Error
        const apiError = {
            code: error.response?.data?.error?.code || 'UNKNOWN_ERROR',
            message: error.response?.data?.error?.message || error.message || 'An unexpected error occurred',
            details: error.response?.data?.error?.details
        };

        return Promise.reject({ error: apiError });
    }
);
