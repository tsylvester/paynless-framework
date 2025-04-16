import { AnalyticsClient } from '@paynless/types';
import { logger } from '@paynless/utils';
import { NullAnalyticsAdapter } from './nullAdapter';
// Import PostHogAdapter later in Phase 2
// import { PostHogAdapter } from './posthogAdapter';

let analyticsInstance: AnalyticsClient;

const initializeAnalytics = (): AnalyticsClient => {
  // Read config from environment variables
  // Use import.meta.env for Vite environments
  const provider = import.meta.env.VITE_ANALYTICS_PROVIDER?.toLowerCase() || 'none';
  const posthogApiKey = import.meta.env.VITE_POSTHOG_KEY;
  const posthogApiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';
  // Add other provider keys here (e.g., mixpanelToken)

  logger.debug('[Analytics] Initializing analytics service...', { provider, hasPosthogKey: !!posthogApiKey });

  // --- Provider Selection Logic (Stub for Phase 1) ---
  // In Phase 2, this logic will be expanded
  if (provider === 'posthog' && posthogApiKey) {
    // Phase 2: Instantiate and init PostHog
    logger.warn('[Analytics] PostHog provider selected but adapter not implemented yet. Using NullAdapter.');
    analyticsInstance = new NullAnalyticsAdapter(); 
  } else {
    // Default to Null Adapter
    if (provider !== 'none') {
      logger.warn(`[Analytics] Provider '${provider}' configured but requirements not met (e.g., missing key or unsupported). Using NullAdapter.`);
    }
    analyticsInstance = new NullAnalyticsAdapter();
  }

  return analyticsInstance;
};

// Initialize on import and export the singleton instance
export const analytics: AnalyticsClient = initializeAnalytics();

// Optional: Export adapters if needed for specific testing scenarios
// export { NullAnalyticsAdapter, PostHogAdapter }; 