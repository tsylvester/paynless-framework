// src/api/clients/stripe.api.ts
import { api } from '../apiClient';
import { ApiResponse } from '../../types/api.types';
import { SubscriptionPlan, UserSubscription } from '../../types/subscription.types';
import { logger } from '../../utils/logger';
import { isStripeTestMode } from '../../utils/stripe';

/**
 * API client for Stripe operations
 */
export class StripeApiClient {
  private isTestMode: boolean;
  
  constructor() {
    this.isTestMode = isStripeTestMode();
    logger.info(`Stripe API client initialized in ${this.isTestMode ? 'TEST' : 'LIVE'} mode`);
  }
  
  /**
   * Create Stripe checkout session
   */
  async createCheckoutSession(planId: string): Promise<ApiResponse<{ url: string }>> {
    try {
      logger.info('Creating Stripe checkout session', { planId });
      const resultData = await api.post<{ url: string }>('/checkout', { planId });
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
      logger.info('Creating portal session');
      const resultData = await api.post<{ url: string }>('/portal', {});
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
      logger.info('Fetching subscription plans', {
        mode: this.isTestMode ? 'TEST' : 'LIVE'
      });
      const resultData = await api.get<SubscriptionPlan[]>('/plans');
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
      logger.info('Fetching user subscription', { 
        userId,
        mode: this.isTestMode ? 'TEST' : 'LIVE'
      });
      
      const resultData = await api.get<UserSubscription>(`/current`);
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

  async cancelSubscription(): Promise<ApiResponse<void>> {
    try {
      logger.info('Cancelling subscription');
      await api.post<void>('/cancel', {});
      return { status: 200 };
    } catch (error) {
      logger.error('Error cancelling subscription', {
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
}

export const stripeApiClient = new StripeApiClient();