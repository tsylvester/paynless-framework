import { AnalyticsClient } from '@paynless/types';
// import { logger } from '@paynless/utils'; // Removed unused import

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
  identify(_userId: string, _traits?: Record<string, unknown>): void {
    // No operation
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
  track(_eventName: string, _properties?: Record<string, unknown>): void {
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
  isFeatureEnabled?(_key: string): boolean {
    // Default to false or handle as needed if feature flags are used without a provider
    return false;
  }
} 