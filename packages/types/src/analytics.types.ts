/**
 * Generic interface for an Analytics Client.
 * Defines common methods needed by the application.
 */
export interface AnalyticsClient {
  /**
   * Initializes the analytics provider if needed (some may init on import).
   * Configuration should typically be handled via environment variables read during service instantiation.
   */
  // init?(): void; // REMOVED - Initialization is internal to the service

  /**
   * Associates the current user with a unique ID and sets user properties (traits).
   * @param userId - The unique identifier for the user.
   * @param traits - Optional key-value pairs of user properties.
   */
  identify(userId: string, traits?: Record<string, any>): void;

  /**
   * Tracks a custom event occurrence.
   * @param eventName - The name of the event to track.
   * @param properties - Optional key-value pairs providing context for the event.
   */
  track(eventName: string, properties?: Record<string, any>): void;

  /**
   * Clears the identified user and resets analytics state (e.g., on logout).
   */
  reset(): void;

  /**
   * (Optional) Opts the user into tracking. Behavior depends on provider implementation.
   */
  optInTracking?(): void;

  /**
   * (Optional) Opts the user out of tracking. Behavior depends on provider implementation.
   */
  optOutTracking?(): void;

  /**
   * (Optional) Checks if a specific feature flag is enabled for the current user.
   * NOTE: Feature flag abstraction can be complex. This is a placeholder.
   * @param key - The key of the feature flag.
   * @returns True if the feature is enabled, false otherwise.
   */
  isFeatureEnabled?(key: string): boolean;

  // Potentially add other common methods like group, setPeopleProperties, etc. if needed
}

/**
 * Configuration options for the analytics service.
 */
export interface AnalyticsConfig {
  provider: 'posthog' | 'mixpanel' | 'none'; // Extend as needed
  posthogApiKey?: string;
  posthogApiHost?: string;
  mixpanelToken?: string;
  // Add other provider-specific config keys
} 