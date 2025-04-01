import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { logger } from '../utils/logger';

// Time before expiry when we should trigger a refresh (15 minutes)
const REFRESH_THRESHOLD_MS = 15 * 60 * 1000;

/**
 * Hook to automatically refresh the auth session before it expires
 * Use this in your app layout or a top-level component
 */
export const useAuthSession = () => {
  const { session, refreshSession } = useAuthStore();
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Clean up the timer when component unmounts
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);
  
  // Set up the refresh timer when session changes or when mounted
  useEffect(() => {
    // Clear any existing timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    
    // Only set a timer if we have a valid session with an expiry time
    if (session && session.expiresAt) {
      const now = Date.now();
      const timeUntilExpiry = session.expiresAt - now;
      
      // If already expired or about to expire, refresh immediately
      if (timeUntilExpiry <= REFRESH_THRESHOLD_MS) {
        logger.info('Session expiring soon, refreshing now');
        refreshSession();
        return;
      }
      
      // Otherwise, set timer to refresh before expiry
      const refreshTime = timeUntilExpiry - REFRESH_THRESHOLD_MS;
      logger.info(`Scheduling session refresh in ${Math.round(refreshTime / 1000 / 60)} minutes`);
      
      refreshTimerRef.current = setTimeout(() => {
        logger.info('Auto-refreshing session');
        refreshSession();
      }, refreshTime);
    }
  }, [session, refreshSession]);
  
  return {
    isAuthenticated: !!session,
    session,
    refreshSession,
  };
}; 