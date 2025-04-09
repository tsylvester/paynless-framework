// Export all types from the types package
export * from './auth.types';
export * from './subscription.types';
export * from './theme.types';
export * from './route.types';
export * from './api.types';
export * from './subscription.types';
export * from './ai.types';

// Re-export the Vite environment types (they're ambient declarations)
export {};

// This file serves as a reference to vite-env.d.ts which provides ambient declarations
// for import.meta.env across all packages

// REMOVED: Dummy export is likely no longer needed

// Export specific response types used by api-client
export type { UserSubscription, SubscriptionPlan, SubscriptionUsageMetrics, CheckoutSessionResponse, PortalSessionResponse } from './subscription.types'; 