import posthog from 'posthog-js';
import { AnalyticsClient } from '@paynless/types';
import { logger } from '@paynless/utils';

/**
 * Adapter for PostHog analytics, implementing the AnalyticsClient interface.
 */
export class PostHogAdapter implements AnalyticsClient {
  private isInitialized = false;

  /**
   * Initializes the PostHog library.
   * @param apiKey - The PostHog project API key.
   * @param apiHost - The PostHog instance host.
   */
  init(apiKey: string, apiHost: string): void {
    if (this.isInitialized) {
      logger.warn('[PostHogAdapter] Already initialized.');
      return;
    }
    try {
      posthog.init(apiKey, {
        api_host: apiHost,
        // Recommended PostHog config:
        autocapture: true, // Capture clicks, inputs, and pageviews automatically
        session_recording: {
          // Optional: Adjust recording options if needed
          // maskAllInputs: true,
          // blockAllMedia: false,
        },
        capture_pageview: true, // Automatically capture page views
        loaded: (ph) => {
          logger.info('[PostHogAdapter] PostHog loaded successfully.');
          this.isInitialized = true;
          // You could potentially call identify here if user info is available early,
          // but usually it's better called explicitly after login/user load.
        },
      });
    } catch (error: any) {
      logger.error('[PostHogAdapter] Failed to initialize PostHog:', {
        error: error.message,
      });
      // Depending on severity, you might want to fallback to NullAnalyticsAdapter
      // or just let subsequent calls fail (PostHog SDK might handle this internally).
    }
  }

  identify(userId: string, traits?: Record<string, any>): void {
    if (!this.isInitialized) {
      logger.warn('[PostHogAdapter] identify called before initialization.');
      return;
    }
    try {
      logger.debug('[PostHogAdapter] identify called', { userId, traits });
      posthog.identify(userId, traits);
    } catch (error: any) {
      logger.error('[PostHogAdapter] Error during identify call:', { error: error.message });
    }
  }

  track(eventName: string, properties?: Record<string, any>): void {
    if (!this.isInitialized) {
      logger.warn('[PostHogAdapter] track called before initialization.');
      return;
    }
    try {
      logger.debug('[PostHogAdapter] track called', { eventName, properties });
      posthog.capture(eventName, properties);
    } catch (error: any) {
      logger.error('[PostHogAdapter] Error during track (capture) call:', { error: error.message });
    }
  }

  reset(): void {
    if (!this.isInitialized) {
      // No need to warn on reset if not initialized
      return;
    }
    try {
      logger.debug('[PostHogAdapter] reset called');
      posthog.reset();
    } catch (error: any) {
      logger.error('[PostHogAdapter] Error during reset call:', { error: error.message });
    }
  }

  optInTracking?(): void {
     if (!this.isInitialized) {
      logger.warn('[PostHogAdapter] optInTracking called before initialization.');
      return;
    }
    try {
      logger.debug('[PostHogAdapter] optInTracking called');
      posthog.opt_in_capturing();
    } catch (error: any) {
      logger.error('[PostHogAdapter] Error during optInTracking call:', { error: error.message });
    }
  }

  optOutTracking?(): void {
     if (!this.isInitialized) {
      // No need to warn on optOut if not initialized
      return;
    }
    try {
      logger.debug('[PostHogAdapter] optOutTracking called');
      posthog.opt_out_capturing();
    } catch (error: any) {
      logger.error('[PostHogAdapter] Error during optOutTracking call:', { error: error.message });
    }
  }

  isFeatureEnabled?(key: string): boolean {
     if (!this.isInitialized) {
      logger.warn('[PostHogAdapter] isFeatureEnabled called before initialization.');
      return false;
    }
    try {
      const isEnabled = posthog.isFeatureEnabled(key);
      logger.debug('[PostHogAdapter] isFeatureEnabled called', { key, isEnabled });
      return !!isEnabled; // Ensure boolean return
    } catch (error: any) {
      logger.error('[PostHogAdapter] Error during isFeatureEnabled call:', { error: error.message });
      return false;
    }
  }
} 