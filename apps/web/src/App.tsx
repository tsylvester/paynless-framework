import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { routes } from './routes/routes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@paynless/store';
import { ThemeProvider } from './context/theme.context';
import { AuthenticatedGate } from './components/auth/AuthenticatedGate';
import { logger } from '@paynless/utils';
import { useSubscriptionStore } from '@paynless/store';
import { ChatwootIntegration } from './components/integrations/ChatwootIntegration';

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Component to handle navigation injection
function NavigateInjector() {
  const navigate = useNavigate();
  const setNavigate = useAuthStore(state => state.setNavigate);

  useEffect(() => {
    logger.info('Injecting navigate function into authStore.');
    setNavigate(navigate);
  }, [navigate, setNavigate]); // Re-run if navigate instance changes (shouldn't usually)

  return null; // This component doesn't render anything
}

// NEW: Separate App Content component
export function AppContent() {
  const { initialize, isLoading } = useAuthStore(state => ({
    initialize: state.initialize,
    isLoading: state.isLoading,
  }));
  const initializedRef = useRef(false);
  const setTestMode = useSubscriptionStore((state) => state.setTestMode); // Get action
  
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      logger.info('App initializing auth store...');
      initialize();
    }
  }, [initialize]);

  // Add useEffect for Test Mode Initialization
  useEffect(() => {
    const isStripeTestMode = import.meta.env['VITE_STRIPE_TEST_MODE'] === 'true';
    setTestMode(isStripeTestMode);
    logger.info(`Stripe Test Mode initialized via useEffect: ${isStripeTestMode}`);
  }, [setTestMode]); // Run once on mount

  if (isLoading) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  }

  // Return everything that was inside BrowserRouter
  return (
    <>
      <NavigateInjector />
      <AuthenticatedGate>
          <></>
      </AuthenticatedGate>
      <Routes>
        {routes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={route.element}
          />
        ))}
      </Routes>
      {/* <ChatwootIntegration /> */}{/* Temporarily commented out */}
    </>
  );
}

// Original App component now provides Router and renders AppContent
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;