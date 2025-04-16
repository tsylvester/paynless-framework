import { AnalyticsClient } from '@paynless/types';
import { logger } from '@paynless/utils';
import { NullAnalyticsAdapter } from './nullAdapter';
// Import PostHogAdapter
import { PostHogAdapter } from './posthogAdapter';

let analyticsInstance: AnalyticsClient;

const initializeAnalytics = (): AnalyticsClient => {
  // Read config from environment variables
  // Use import.meta.env for Vite environments
  const provider = import.meta.env.VITE_ANALYTICS_PROVIDER?.toLowerCase() || 'none';
  const posthogApiKey = import.meta.env.VITE_POSTHOG_KEY;
  const posthogApiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';
  // Add other provider keys here (e.g., mixpanelToken)

  logger.debug('[Analytics] Initializing analytics service...', { provider, hasPosthogKey: !!posthogApiKey });

  // --- Provider Selection Logic ---
  if (provider === 'posthog' && posthogApiKey) {
    try {
      logger.info(`[Analytics] PostHog provider selected. Initializing with host: ${posthogApiHost}`);
      const posthogAdapter = new PostHogAdapter();
      posthogAdapter.init(posthogApiKey, posthogApiHost); // Initialize PostHog
      analyticsInstance = posthogAdapter;
    } catch (initError: any) {
        logger.error('[Analytics] Failed to initialize PostHog Adapter. Falling back to NullAdapter.', {
            error: initError.message
        });
        analyticsInstance = new NullAnalyticsAdapter();
    }
  } else {
    // Default to Null Adapter
    if (provider !== 'none') {
      logger.warn(`[Analytics] Provider '${provider}' configured but requirements not met (e.g., missing key or unsupported). Using NullAdapter.`);
    } else {
      logger.info('[Analytics] No analytics provider configured or provider is "none". Using NullAdapter.');
    }
    analyticsInstance = new NullAnalyticsAdapter();
  }

  return analyticsInstance;
};

// Initialize on import and export the singleton instance
export const analytics: AnalyticsClient = initializeAnalytics();

// Optional: Export adapters if needed for specific testing scenarios
export { NullAnalyticsAdapter, PostHogAdapter }; 