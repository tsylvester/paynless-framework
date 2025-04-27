import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { logger/*, LogLevel*/ } from '@paynless/utils'
import ReactGA from 'react-ga4'
import { PlatformProvider } from '@paynless/platform';
import { ApiProvider } from '@paynless/api';

// --- Configure Logger Early ---
// Only show errors in the console for now to reduce noise
//logger.configure({ minLevel: LogLevel.ERROR });
//logger.info("Logger configured to minimum level: ERROR"); // This line itself won't show now

// --- Get Supabase config from environment variables --- 
const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'];
const supabaseAnonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'];

// Initialize Google Analytics (GA4)
const gaMeasurementId = import.meta.env['VITE_GA_MEASUREMENT_ID']
if (gaMeasurementId) {
  ReactGA.initialize(gaMeasurementId)
  logger.info('Google Analytics initialized with ID:', { gaMeasurementId })
  // Initial pageview is usually sent automatically by ReactGA.initialize
} else {
  logger.warn('VITE_GA_MEASUREMENT_ID is not set. Google Analytics disabled.')
}

// ---> Wrap App with ApiProvider and PlatformCapabilitiesProvider <--- 
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Pass config to ApiProvider. Handle missing keys potentially with fallback UI */}
    {supabaseUrl && supabaseAnonKey ? (
      <ApiProvider supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey}>
        <PlatformProvider>
          <App />
        </PlatformProvider>
      </ApiProvider>
    ) : (
      // Render an error message or fallback if config is missing
      <div>Error: Supabase configuration is missing.</div>
    )}
  </StrictMode>
)
