import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { routes } from './routes/routes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@paynless/store';
import { ThemeProvider } from './context/theme.context';
import { AuthenticatedGate } from './components/auth/AuthenticatedGate';
import { logger } from '@paynless/utils';

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

function App() {
  const { initialize } = useAuthStore();
  const initializedRef = useRef(false);
  
  // Initialize auth state when app loads, preventing double run in StrictMode
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      logger.info('App initializing auth store...');
      initialize();
    }
  }, [initialize]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
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
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;