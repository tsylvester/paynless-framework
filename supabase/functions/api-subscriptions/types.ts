/**
 * Type definitions for the subscription API endpoints
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

export interface CheckoutSessionRequest {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface BillingPortalRequest {
  returnUrl: string;
}

export interface SessionResponse {
  sessionId: string;
  url: string;
}

export interface SubscriptionUsageMetrics {
  current: number;
  limit: number;
  reset_date?: string | null;
}

// CORS headers for API responses
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};