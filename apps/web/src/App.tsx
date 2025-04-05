import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { routes } from './routes/routes';
import { QueryClient, QueryClientProvider } from 'react-query';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@paynless/store';
import { ThemeProvider } from './context/theme.context';
import { AuthenticatedGate } from './components/auth/AuthenticatedGate';

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
  const { initialize } = useAuthStore();
  const initializedRef = useRef(false);
  
  // Initialize auth state when app loads, preventing double run in StrictMode
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      initialize();
    }
  }, [initialize]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
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