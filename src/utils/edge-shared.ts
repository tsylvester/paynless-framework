/**
 * This file provides shared utilities and types that can be used
 * both in the frontend application and edge functions.
 * 
 * IMPORTANT: Only include browser-compatible code here, as
 * this file will be used in the browser environment.
 */

/**
 * Check if the application is running in Stripe test mode
 */
export const isStripeTestMode = (): boolean => {
  try {
    // In browser environment
    if (typeof window !== 'undefined' && window.location) {
      return import.meta.env.VITE_STRIPE_TEST_MODE === 'true';
    }
    // In Deno/edge environment (will use Deno.env internally)
    return process.env.STRIPE_TEST_MODE === 'true';
  } catch (e) {
    // Default to test mode if anything fails
    return true;
  }
};

/**
 * Standard API response type
 */
export interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  status: number;
}

/**
 * Common subscription-related types
 */
export interface SubscriptionPlan {
  id: string;
  stripePriceId: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  interval: string;
  intervalCount: number;
  metadata?: Record<string, any>;
}

export interface UserSubscription {
  id: string | null;
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  plan: SubscriptionPlan | null;
}