import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initializeApiClient } from '@paynless/api-client';
import { logger } from '@paynless/utils';

// --- Initialize API Client --- 
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  logger.error('CRITICAL: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not defined in environment variables.');
  // Optionally, render an error message to the user
  // document.getElementById('root')!.innerHTML = 'Application configuration error.';
} else {
  initializeApiClient({
    // Construct the Base URL for Edge Functions
    baseUrl: supabaseUrl.replace(/\/$/, '') + '/functions/v1',
    supabaseAnonKey: supabaseAnonKey,
  });
}
// --- End Initialization ---

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
