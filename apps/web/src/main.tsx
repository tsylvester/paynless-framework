import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { initializeApiClient } from '@paynless/api-client'
import { logger/*, LogLevel*/ } from '@paynless/utils'
import ReactGA from 'react-ga4'
import '@paynless/analytics-client'

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
  initializeApiClient({ supabaseUrl, supabaseAnonKey })
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
  <StrictMode>
    <App />
  </StrictMode>
)
