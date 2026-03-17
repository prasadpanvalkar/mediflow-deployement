import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { authApi, clearAuthToken } from './apiClient'
import { useAuthStore } from '../store/authStore'
import { useSettingsStore } from '../store/settingsStore'

export async function handleLogout(router?: AppRouterInstance) {
    try {
        await authApi.logout()
    } catch {
        // ignore — always proceed to logout client side
    } finally {
        useAuthStore.getState().logout()
        useSettingsStore.setState({ selectedOutletId: null })
        clearAuthToken()
        
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem('mediflow_mock_auth')
            
            // Explicitly destroy frontend cookies so middleware catches the unauthenticated state
            document.cookie = 'access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
            document.cookie = 'refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
            document.cookie = 'mediflow_mock_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'

            if (router) {
                router.push('/login')
            } else {
                window.location.href = '/login'
            }
        }
    }
}
