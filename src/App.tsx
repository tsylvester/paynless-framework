import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/auth.context';
import { UnauthProvider } from './context/unauth.context';
import { SubscriptionProvider } from './context/subscription.context';
import { ThemeProvider } from './context/theme.context';
import { routes } from './routes/routes';
import { QueryClient, QueryClientProvider } from 'react-query';

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
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <UnauthProvider>
          <AuthProvider>
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
          </AuthProvider>
        </UnauthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;