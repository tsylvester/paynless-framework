import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { routes } from './routes/routes';
import { QueryClient, QueryClientProvider } from 'react-query';
import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { ThemeProvider } from './context/theme.context';
import { useAuthSession } from './hooks/useAuthSession';
import { logger } from './utils/logger';
import { SubscriptionProvider } from './context/subscription.context';

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  const { initialize, refreshSession } = useAuthStore();
  
  // Use the auth session hook to auto-refresh sessions
  useAuthSession();
  
  // Initialize auth state when app loads
  useEffect(() => {
    initialize();
  }, [initialize]);
  
  // Register the refresh session function globally for interceptors
  useEffect(() => {
    if (typeof window !== 'undefined') {
      logger.info('Registering global auth refresh handler');
      window.__AUTH_STORE_REFRESH_SESSION = async () => {
        try {
          logger.info('Global refresh handler called');
          return await refreshSession();
        } catch (error) {
          logger.error('Global refresh handler error', { 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
          return false;
        }
      };
      
      return () => {
        // Clean up on unmount
        delete window.__AUTH_STORE_REFRESH_SESSION;
      };
    }
  }, [refreshSession]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SubscriptionProvider>
          <BrowserRouter>
            <Routes>
              {routes.map((route) => (
                <Route
                  key={route.path}
                  path={route.path}
                  element={route.element}
                />
              ))}
            </Routes>
          </BrowserRouter>
        </SubscriptionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;