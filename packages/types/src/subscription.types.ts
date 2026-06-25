// src/types/subscription.types.ts
import type { Database } from '@paynless/db-types';

// --- Database Table Aliases ---

/**
 * Represents a subscription plan offered.
 * Derived from the `subscription_plans` table.
 */
export type SubscriptionPlan = Omit<Database['public']['Tables']['subscription_plans']['Row'], 'stripe_price_id'> & {
  stripe_price_id: string | null;
};

/**
 * Represents a user's specific subscription status and details.
 * Derived from the `user_subscriptions` table.
 * Note: The `plan` property is manually added/resolved in application logic, 
 * as the DB type only contains `plan_id`.
 */
export type UserSubscription = Database['public']['Tables']['user_subscriptions']['Row'] & {
  plan?: SubscriptionPlan | null; // Keep application-level enrichment separate
};
// TODO: Revisit if a View combining user_subscriptions and subscription_plans is created later.

/**
 * Represents a record of a subscription-related financial transaction.
 * Derived from the `subscription_transactions` table.
 */
export type SubscriptionTransaction = Database['public']['Tables']['subscription_transactions']['Row'];

// --- Application/API Specific Types ---

// Keep status types - Assuming these are TEXT fields with CHECK constraints in DB,
// not ENUM types that would be generated in Database['public']['Enums'].
/**
 * Stripe subscription status strings that may appear on subscription objects from the payment system.
 *
 * Members such as `'trialing'` and other non-`'active'` values are valid on the wire when present
 * on subscription payloads from Stripe or the billing API.
 *
 * Application billing logic in `@paynless/store` currently treats only `'active'` as “has active
 * subscription” (`hasActiveSubscription`). Statuses not implemented by Paynless handlers (including
 * `'trialing'`) must not be assumed to grant active paid access.
 */
export type SubscriptionStatus = 
  | 'free'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing';

export type TransactionStatus = 
  | 'succeeded'
  | 'processing'
  | 'requires_payment_method'
  | 'requires_action'
  | 'canceled'
  | 'failed';

/**
 * API endpoint request/response types
 */
export interface SubscriptionUsageMetrics {
  metric: string;
  usage: number;
  limit: number;
  period_start: string; // ISO Date string
  period_end: string; // ISO Date string
}

export interface CancelSubscriptionRequest {
  subscriptionId: string;
}

export interface ResumeSubscriptionRequest {
  subscriptionId: string;
}

// Define response type for creating a portal session
export interface PortalSessionResponse {
  url: string; // Expecting the Stripe Billing Portal URL
}

// Define response type for fetching subscription plans
export interface SubscriptionPlansResponse {
  plans: SubscriptionPlan[]; // Uses the aliased DB type
}

// --- Subscription API Specific Types (Moved from _shared/types.ts) ---

export interface BillingPortalRequest {
  returnUrl: string;
}

export interface SessionResponse {
  sessionId?: string; // Make optional as it might not always be present (e.g., portal)
  url: string;
}

// Renamed from _shared/types.ts to avoid conflict with the other SubscriptionUsageMetrics
export interface ApiSubscriptionUsageMetrics {
  current: number;
  limit: number;
  reset_date?: string | null;
}

// --- Store Specific State Types ---

/**
 * Defines the shape of the subscription slice in the Zustand reselect store.
 */
export interface SubscriptionState {
  userSubscription: UserSubscription | null;
  availablePlans: SubscriptionPlan[];
  isSubscriptionLoading: boolean;
  hasActiveSubscription: boolean;
  error: Error | null;
  // Add other relevant state properties here if they exist
}