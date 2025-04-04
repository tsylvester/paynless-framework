// src/api/clients/stripe.api.ts
import { api } from '../apiClient';
import { ApiResponse } from '../../types/api.types';
import { SubscriptionPlan, UserSubscription, SubscriptionUsageMetrics } from '../../types/subscription.types';
import { logger } from '../../utils/logger';

// Read the mode from Vite environment variables
const VITE_STRIPE_TEST_MODE_STR = import.meta.env.VITE_STRIPE_TEST_MODE;
// Default to true if the variable is not explicitly 'false'
const IS_FRONTEND_TEST_MODE = VITE_STRIPE_TEST_MODE_STR !== 'false';

/**
 * API client for Stripe operations
 */
export class StripeApiClient {
  private isTestMode: boolean;
  
  constructor() {
    // Use the value derived from the environment variable
    this.isTestMode = IS_FRONTEND_TEST_MODE;
    logger.info(`Stripe API client initialized in ${this.isTestMode ? 'TEST' : 'LIVE'} mode (determined by VITE_STRIPE_TEST_MODE)`);
  }
  
  /**
   * Create Stripe checkout session
   */
  async createCheckoutSession(planId: string): Promise<ApiResponse<{ url: string }>> {
    try {
      logger.info('Creating Stripe checkout session', { planId, isTestMode: this.isTestMode });
      // Include isTestMode in the request body
      const resultData = await api.post<{ url: string }>('/api-subscriptions/checkout', { 
        planId, 
        isTestMode: this.isTestMode 
      }); 
      return { data: resultData, status: 200 };
    } catch (error) {
      logger.error('Error creating Stripe checkout session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        planId,
      });
      
      return {
        error: {
          code: 'stripe_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Create Stripe billing portal session
   */
  async createPortalSession(): Promise<ApiResponse<{ url: string }>> {
    try {
      logger.info('Creating portal session', { isTestMode: this.isTestMode });
      // Include isTestMode in the request body
      const resultData = await api.post<{ url: string }>('/api-subscriptions/billing-portal', { 
        isTestMode: this.isTestMode 
      });
      return { data: resultData, status: 200 };
    } catch (error) {
      logger.error('Error creating portal session', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'stripe_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Get all available subscription plans
   */
  async getSubscriptionPlans(): Promise<ApiResponse<SubscriptionPlan[]>> {
    try {
      // No change needed here - GET requests don't send a body.
      // Backend will use its default mode.
      logger.info('Fetching subscription plans (Backend default mode will be used)');
      const resultData = await api.get<SubscriptionPlan[]>('/api-subscriptions/plans');
      return { data: resultData, status: 200 };
    } catch (error) {
      logger.error('Error fetching subscription plans', {
        error: error instanceof Error ? error.message : 'Unknown error',
        mode: this.isTestMode ? 'TEST' : 'LIVE'
      });
      
      return {
        error: {
          code: 'stripe_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Get user subscription
   */
  async getUserSubscription(userId: string): Promise<ApiResponse<UserSubscription>> {
    try {
      // No change needed here - GET requests don't send a body.
      // Backend will use its default mode.
      logger.info('Fetching user subscription (Backend default mode will be used)', { userId });
      
      const resultData = await api.get<UserSubscription>(`/api-subscriptions/current`);
      return { data: resultData, status: 200 };
    } catch (error) {
      logger.error('Error fetching user subscription', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        mode: this.isTestMode ? 'TEST' : 'LIVE'
      });
      
      return {
        error: {
          code: 'stripe_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<ApiResponse<void>> {
    try {
      logger.info('Cancelling subscription', { subscriptionId });
      // Use the specific endpoint from the backend router
      await api.post<void>(`/api-subscriptions/${subscriptionId}/cancel`, {});
      return { status: 200 };
    } catch (error) {
      logger.error('Error cancelling subscription', {
        error: error instanceof Error ? error.message : 'Unknown error',
        subscriptionId,
      });
      
      return {
        error: {
          code: 'stripe_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }

  async resumeSubscription(subscriptionId: string): Promise<ApiResponse<void>> {
    try {
      logger.info('Resuming subscription', { subscriptionId });
      // Use the specific endpoint from the backend router
      await api.post<void>(`/api-subscriptions/${subscriptionId}/resume`, {});
      return { status: 200 };
    } catch (error) {
      logger.error('Error resuming subscription', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        subscriptionId,
      });
      return {
        error: {
          code: 'stripe_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }

  async getUsageMetrics(metric: string): Promise<ApiResponse<SubscriptionUsageMetrics>> {
    try {
      logger.info('Fetching usage metrics', { metric });
      // Use the specific endpoint from the backend router
      const resultData = await api.get<SubscriptionUsageMetrics>(`/api-subscriptions/usage/${metric}`);
      return { data: resultData, status: 200 };
    } catch (error) {
      logger.error('Error fetching usage metrics', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        metric 
      });
      return {
        error: {
          code: 'stripe_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}

export const stripeApiClient = new StripeApiClient();