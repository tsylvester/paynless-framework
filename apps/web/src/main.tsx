import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/theme.context';
import { initializeApiClient } from '@paynless/api-client';
import { logger, LogLevel } from '@paynless/utils';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter as Router } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useSubscriptionStore } from '@paynless/store';

// Initialize Logger
logger.configure({ minLevel: LogLevel.DEBUG, enableConsole: true });
logger.info('Application starting...');

// Initialize API Client
const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'];
const supabaseAnonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Error: Supabase URL or Anon Key is missing. Check your .env file.');
} else {
    logger.info('Initializing API client with URL:', { url: supabaseUrl });
    initializeApiClient({ supabaseUrl, supabaseAnonKey });
    logger.info('API client initialized.');
}

// Initialize React Query Client
const queryClient = new QueryClient();

// Initialize Stripe Test Mode from Env Var
const isStripeTestMode = import.meta.env['VITE_STRIPE_TEST_MODE'] === 'true';
useSubscriptionStore.getState().setTestMode(isStripeTestMode);
logger.info(`Stripe Test Mode initialized: ${isStripeTestMode}`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <Router>
        <QueryClientProvider client={queryClient}>
          <App />
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </Router>
    </ThemeProvider>
  </StrictMode>
);
