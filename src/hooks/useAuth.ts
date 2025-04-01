import { useAuthStore } from '../store/authStore';

/**
 * Hook to access authentication state and actions
 * This is a compatibility layer for components still using the old useAuth hook
 */
export function useAuth() {
  return useAuthStore();
}