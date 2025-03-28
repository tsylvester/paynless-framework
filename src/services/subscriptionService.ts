import { supabase } from './supabase';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { 
  SubscriptionPlan, 
  Subscription, 
  SubscriptionEvent, 
  SubscriptionWithPlan,
  CheckoutSessionResponse,
  ManageSubscriptionResponse
} from '../types/subscription.types';

// Fetch subscription plans
export const getSubscriptionPlans = async (): Promise<SubscriptionPlan[]> => {
  try {
    const { data, error } = await withRetry(
      async () => {
        return supabase
          .from('subscription_plans')
          .select('*')
          .eq('is_active', true)
          .order('subscription_price', { ascending: true });
      },
      { maxRetries: 2 }
    );

    if (error) {
      logger.error('Error fetching subscription plans:', error);
      throw error;
    }

    return data as SubscriptionPlan[];
  } catch (error) {
    logger.error('Unexpected error in getSubscriptionPlans:', error);
    throw error;
  }
};

// Fetch current user subscription with plan details
export const getCurrentSubscription = async (): Promise<SubscriptionWithPlan | null> => {
  try {
    // Check if user is authenticated
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      logger.warn('Tried to get subscription without authentication');
      return null;
    }

    // Get subscription with plan join
    const { data, error } = await withRetry(
      async () => {
        return supabase
          .from('subscriptions')
          .select(`
            *,
            plan:subscription_plans(*)
          `)
          .eq('user_id', sessionData.session!.user.id)
          .single();
      },
      { maxRetries: 2 }
    );

    if (error) {
      logger.error('Error fetching current subscription:', error);
      throw error;
    }

    // Format the result to match our SubscriptionWithPlan type
    if (data) {
      const plan = data.plan as SubscriptionPlan;
      delete data.plan;
      
      const subscription = data as Subscription;
      return {
        ...subscription,
        plan
      };
    }

    return null;
  } catch (error) {
    logger.error('Unexpected error in getCurrentSubscription:', error);
    throw error;
  }
};

// Fetch subscription events for current user
export const getSubscriptionEvents = async (limit: number = 10): Promise<SubscriptionEvent[]> => {
  try {
    // Check if user is authenticated
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      logger.warn('Tried to get subscription events without authentication');
      return [];
    }

    const { data, error } = await withRetry(
      async () => {
        return supabase
          .from('subscription_events')
          .select('*')
          .eq('user_id', sessionData.session!.user.id)
          .order('created_at', { ascending: false })
          .limit(limit);
      },
      { maxRetries: 2 }
    );

    if (error) {
      logger.error('Error fetching subscription events:', error);
      throw error;
    }

    return data as SubscriptionEvent[];
  } catch (error) {
    logger.error('Unexpected error in getSubscriptionEvents:', error);
    throw error;
  }
};

// Create a Stripe checkout session to subscribe to a plan
export const createCheckoutSession = async (
  planId: string,
  successUrl: string,
  cancelUrl: string
): Promise<CheckoutSessionResponse> => {
  try {
    // Check if user is authenticated
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      throw new Error('Authentication required');
    }

    // Call the Supabase Edge Function to create a checkout session
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_DATABASE_URL}/functions/v1/create-checkout`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          planId,
          successUrl,
          cancelUrl,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checkout session');
    }

    const data = await response.json();
    return data as CheckoutSessionResponse;
  } catch (error) {
    logger.error('Error creating checkout session:', error);
    throw error;
  }
};

// Manage subscription: cancel, resume, or change plan
export const manageSubscription = async (
  action: 'cancel' | 'resume' | 'change_plan',
  planId?: string
): Promise<ManageSubscriptionResponse> => {
  try {
    // Check if user is authenticated
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      throw new Error('Authentication required');
    }

    // Call the Supabase Edge Function to manage the subscription
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_DATABASE_URL}/functions/v1/manage-subscription`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          action,
          planId,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to manage subscription');
    }

    const data = await response.json();
    return data as ManageSubscriptionResponse;
  } catch (error) {
    logger.error(`Error managing subscription (${action}):`, error);
    throw error;
  }
};

// Check if a feature is enabled based on subscription limits
export const isFeatureEnabled = (
  subscription: SubscriptionWithPlan | null,
  featureName: string
): boolean => {
  if (!subscription || !subscription.plan) {
    return false;
  }

  // For premium plans, most features are available
  if (subscription.subscription_plan_id !== 'free') {
    return true;
  }

  // For the free plan, check specific limitations
  const limits = subscription.plan.subscription_limits || {};
  switch (featureName) {
    case 'unlimited_messages':
      return limits.messages_per_day === null;
    case 'message_history':
      return !!limits.history_days;
    case 'export_chat':
      return subscription.subscription_plan_id !== 'free';
    // Add more feature checks as needed
    default:
      return false;
  }
};

// Calculate remaining usage for the day (for limited features)
export const getRemainingUsage = async (
  subscription: SubscriptionWithPlan | null,
  usageType: string
): Promise<number | null> => {
  if (!subscription || !subscription.plan) {
    return null;
  }

  const limits = subscription.plan.subscription_limits || {};

  // If unlimited, return null (meaning no limit)
  if (limits[usageType] === null) {
    return null;
  }

  // For message limits, calculate how many are left today
  if (usageType === 'messages_per_day') {
    try {
      // Get today's message count from the user_events table
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        return limits[usageType] || 0;
      }

      const { count, error } = await supabase
        .from('user_events')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', sessionData.session.user.id)
        .eq('event_type', 'chat')
        .gte('created_at', today.toISOString());

      if (error) {
        logger.error('Error counting today\'s messages:', error);
        return limits[usageType] || 0;
      }

      const used = count || 0;
      const limit = limits[usageType] || 0;
      return Math.max(0, limit - used);
    } catch (error) {
      logger.error('Error calculating remaining usage:', error);
      return limits[usageType] || 0;
    }
  }

  // For other usage types
  return limits[usageType] || null;
};