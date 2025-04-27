import { /* Remove StrictMode */ } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { initializeApiClient } from '@paynless/api'
import { logger/*, LogLevel*/ } from '@paynless/utils'
import ReactGA from 'react-ga4'
import { api } from '@paynless/api'
import { initAuthListener } from '@paynless/store'
import { PlatformCapabilitiesProvider } from '@paynless/platform';

// --- Configure Logger Early ---
// Only show errors in the console for now to reduce noise
//logger.configure({ minLevel: LogLevel.ERROR });
//logger.info("Logger configured to minimum level: ERROR"); // This line itself won't show now

// --- Initialize API Client ---
const supabaseUrl = import.meta.env['VITE_SUPABASE_URL']
const supabaseAnonKey = import.meta.env['VITE_SUPABASE_ANON_KEY']
//console.log('supabaseUrl', supabaseUrl)
//console.log('supabaseAnonKey', supabaseAnonKey)
if (!supabaseUrl || !supabaseAnonKey) {
  logger.error('Supabase URL or Anon Key is missing in environment variables.')
  // Potentially render an error message or throw an error
} else {
  // ---> Log before initializing <---
  logger.info(`[main.tsx] About to call initializeApiClient...`, { urlProvided: !!supabaseUrl, keyProvided: !!supabaseAnonKey });
  initializeApiClient({ supabaseUrl, supabaseAnonKey })
  // --- Initialize Auth Listener Immediately After API Client --- 
  try {
    logger.info('[main.tsx] Initializing auth state listener...');
    const supabaseClient = api.getSupabaseClient();
    // TODO: Manage this unsubscribe function properly on app unmount
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const unsubscribe = initAuthListener(supabaseClient); 
    logger.info('[main.tsx] Auth state listener initialized.');
    // You could assign to window for dev debugging if needed:
    // window.unsubscribeAuth = unsubscribe;
  } catch (error) {
    // ---> Temporarily comment out logger call <--- 
    // logger.error('[main.tsx] Failed to initialize auth state listener'); 
    // console.error('[main.tsx] Failed to initialize auth state listener:', error); // Use console for now
  }
}

// Initialize Google Analytics (GA4)
const gaMeasurementId = import.meta.env['VITE_GA_MEASUREMENT_ID']
if (gaMeasurementId) {
  ReactGA.initialize(gaMeasurementId)
  logger.info('Google Analytics initialized with ID:', { gaMeasurementId })
  // Initial pageview is usually sent automatically by ReactGA.initialize
} else {
  logger.warn('VITE_GA_MEASUREMENT_ID is not set. Google Analytics disabled.')
}

createRoot(document.getElementById('root')!).render(
  // ---> Remove StrictMode wrapper <--- 
  // <StrictMode>
    <PlatformCapabilitiesProvider>
      <App />
    </PlatformCapabilitiesProvider>
  // </StrictMode>
)
