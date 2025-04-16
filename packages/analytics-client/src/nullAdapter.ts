import { AnalyticsClient } from '@paynless/types';
import { logger } from '@paynless/utils';

/**
 * A no-operation implementation of the AnalyticsClient interface.
 * Used when no analytics provider is configured or enabled.
 */
export class NullAnalyticsAdapter implements AnalyticsClient {
  constructor() {
    // Optional: Log that the null adapter is being used. Keep this minimal.
    // logger.debug('[Analytics] Null adapter initialized. Analytics calls will be no-ops.');
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
  identify(userId: string, traits?: Record<string, any>): void {
    // No operation
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
  track(eventName: string, properties?: Record<string, any>): void {
    // No operation
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  reset(): void {
    // No operation
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  optInTracking?(): void {
    // No operation
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  optOutTracking?(): void {
    // No operation
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isFeatureEnabled?(key: string): boolean {
    // Default to false or handle as needed if feature flags are used without a provider
    return false;
  }
} 