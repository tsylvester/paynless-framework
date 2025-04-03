import { stripeApiClient } from '../api/clients/stripe.api';
import { SubscriptionPlan, UserSubscription } from '../types/subscription.types';
import { logger } from '../utils/logger';
import { useAuthStore } from '../store/authStore';

/**
 * Service for handling subscription operations
 */
export class SubscriptionService {
  /**
   * Get all available subscription plans
   */
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    try {
      logger.info('Fetching subscription plans');
      
      const response = await stripeApiClient.getSubscriptionPlans();
      
      if (response.error || !response.data) {
        logger.error('Failed to get subscription plans', { 
          error: response.error,
        });
        return [];
      }
      
      return response.data;
    } catch (error) {
      logger.error('Unexpected error fetching subscription plans', { 
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }
  
  /**
   * Get user subscription
   */
  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    try {
      logger.info('Fetching user subscription', { userId });
      
      const response = await stripeApiClient.getUserSubscription(userId);
      
      if (response.error || !response.data) {
        logger.error('Failed to get user subscription', { 
          error: response.error,
          userId,
        });
        return null;
      }
      
      return response.data;
    } catch (error) {
      logger.error('Unexpected error fetching user subscription', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return null;
    }
  }
  
  /**
   * Create checkout session for subscription
   */
  async createCheckoutSession(
    userId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<string | null> {
    try {
      logger.info('Creating checkout session', { userId, priceId });
      
      const response = await stripeApiClient.createCheckoutSession(priceId);
      
      if (response.error || !response.data) {
        logger.error('Failed to create checkout session', { 
          error: response.error,
          userId,
          priceId,
        });
        return null;
      }
      
      return response.data.url;
    } catch (error) {
      logger.error('Unexpected error creating checkout session', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        priceId,
      });
      return null;
    }
  }
  
  /**
   * Create billing portal session
   */
  async createBillingPortalSession(userId: string, returnUrl: string): Promise<string | null> {
    try {
      logger.info('Creating billing portal session', { userId });
      
      const response = await stripeApiClient.createPortalSession();
      
      if (response.error || !response.data) {
        logger.error('Failed to create billing portal session', { 
          error: response.error,
          userId,
        });
        return null;
      }
      
      return response.data.url;
    } catch (error) {
      logger.error('Unexpected error creating billing portal session', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return null;
    }
  }
  
  /**
   * Check if user has an active subscription
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    try {
      const subscription = await this.getUserSubscription(userId);
      
      return subscription?.status === 'active' || subscription?.status === 'trialing';
    } catch (error) {
      logger.error('Error checking active subscription', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return false;
    }
  }
  
  /**
   * Cancel a subscription
   */
  async cancelSubscription(userId: string, subscriptionId: string): Promise<boolean> {
    try {
      logger.info('Cancelling subscription', { userId, subscriptionId });
      const token = useAuthStore.getState().session?.access_token;
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`,
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        logger.error('Failed to cancel subscription', { 
          error: error.message,
          userId,
          subscriptionId,
        });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Unexpected error cancelling subscription', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        subscriptionId,
      });
      return false;
    }
  }
  
  /**
   * Resume a subscription
   */
  async resumeSubscription(userId: string, subscriptionId: string): Promise<boolean> {
    try {
      logger.info('Resuming subscription', { userId, subscriptionId });
      const token = useAuthStore.getState().session?.access_token;
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-subscriptions/${subscriptionId}/resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`,
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        logger.error('Failed to resume subscription', { 
          error: error.message,
          userId,
          subscriptionId,
        });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Unexpected error resuming subscription', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        subscriptionId,
      });
      return false;
    }
  }
  
  /**
   * Get subscription usage metrics
   */
  async getUsageMetrics(userId: string, metric: string): Promise<any> {
    try {
      logger.info('Fetching usage metrics', { userId, metric });
      const token = useAuthStore.getState().session?.access_token;
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-subscriptions/usage/${metric}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token || ''}`,
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        logger.error('Failed to fetch usage metrics', { 
          error: error.message,
          userId,
          metric,
        });
        return null;
      }
      
      return await response.json();
    } catch (error) {
      logger.error('Unexpected error fetching usage metrics', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        metric,
      });
      return null;
    }
  }
}

// Export singleton instance
export const subscriptionService = new SubscriptionService();