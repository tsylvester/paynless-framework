// src/api/clients/stripe.api.ts
/// <reference types="@paynless/types" />

import { api, FetchOptions } from './apiClient';
import type { ApiResponse, SubscriptionPlan, UserSubscription, SubscriptionUsageMetrics } from '@paynless/types';
import { logger } from '@paynless/utils';
import { ApiError } from './apiClient';

/**
 * API client for Stripe operations
 */
export class StripeApiClient {
  private getToken: () => string | undefined;
  
  constructor(getToken: () => string | undefined) {
    this.getToken = getToken;
    logger.info(`Stripe API client initialized.`);
  }
  
  private getOptions(options: FetchOptions = {}): FetchOptions {
    // Only get token if the request is NOT public
    const token = !options.isPublic ? this.getToken() : undefined;
    return { ...options, token };
  }
  
  /**
   * Create Stripe checkout session
   * @param priceId - The ID of the Stripe Price object
   * @param isTestMode - Whether to create session in test mode
   */
  async createCheckoutSession(priceId: string, isTestMode: boolean): Promise<ApiResponse<{ sessionId: string }>> {
    try {
      logger.info('Creating Stripe checkout session', { priceId, isTestMode });
      const resultData = await api.post<{ sessionId: string }>('api-subscriptions/checkout', { 
        priceId,
        isTestMode: isTestMode 
      }, this.getOptions());
      return { status: 200, data: resultData }; 
    } catch (error) {
      logger.error('Error creating Stripe checkout session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        priceId,
      });
      
      return {
        error: {
          code: error instanceof ApiError ? String(error.code) : 'STRIPE_CLIENT_ERROR',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: error instanceof ApiError && error.status ? error.status : 500,
      };
    }
  }
  
  /**
   * Create Stripe billing portal session
   * @param isTestMode - Whether to create session in test mode
   */
  async createPortalSession(isTestMode: boolean): Promise<ApiResponse<{ url: string }>> {
    try {
      logger.info('Creating portal session', { isTestMode });
      const resultData = await api.post<{ url: string }>('api-subscriptions/billing-portal', { 
        isTestMode: isTestMode 
      }, this.getOptions());
      return { status: 200, data: resultData };
    } catch (error) {
      logger.error('Error creating portal session', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: error instanceof ApiError ? String(error.code) : 'STRIPE_CLIENT_ERROR',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: error instanceof ApiError && error.status ? error.status : 500,
      };
    }
  }
  
  /**
   * Get all available subscription plans
   */
  async getSubscriptionPlans(): Promise<ApiResponse<SubscriptionPlan[]>> {
    try {
      logger.info('Fetching subscription plans (Backend default mode will be used)');
      const resultData = await api.get<SubscriptionPlan[]>('api-subscriptions/plans', this.getOptions({ isPublic: true }));
      return { status: 200, data: resultData };
    } catch (error) {
      logger.error('Error fetching subscription plans', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: error instanceof ApiError ? String(error.code) : 'STRIPE_CLIENT_ERROR',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: error instanceof ApiError && error.status ? error.status : 500,
      };
    }
  }
  
  /**
   * Get user subscription
   */
  async getUserSubscription(userId: string): Promise<ApiResponse<UserSubscription>> {
    try {
      logger.info('Fetching user subscription (Backend default mode will be used)', { userId });
      
      const resultData = await api.get<UserSubscription>(`api-subscriptions/current`, this.getOptions());
      return { status: 200, data: resultData };
    } catch (error) {
      logger.error('Error fetching user subscription', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      
      return {
        error: {
          code: error instanceof ApiError ? String(error.code) : 'STRIPE_CLIENT_ERROR',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: error instanceof ApiError && error.status ? error.status : 500,
      };
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<ApiResponse<void>> {
    try {
      logger.info('Cancelling subscription', { subscriptionId });
      await api.post<void>(`api-subscriptions/${subscriptionId}/cancel`, {}, this.getOptions());
      return { status: 200 };
    } catch (error) {
      logger.error('Error cancelling subscription', {
        error: error instanceof Error ? error.message : 'Unknown error',
        subscriptionId,
      });
      
      return {
        error: {
          code: error instanceof ApiError ? String(error.code) : 'STRIPE_CLIENT_ERROR',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: error instanceof ApiError && error.status ? error.status : 500,
      };
    }
  }

  async resumeSubscription(subscriptionId: string): Promise<ApiResponse<void>> {
    try {
      logger.info('Resuming subscription', { subscriptionId });
      await api.post<void>(`api-subscriptions/${subscriptionId}/resume`, {}, this.getOptions());
      return { status: 200 };
    } catch (error) {
      logger.error('Error resuming subscription', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        subscriptionId,
      });
      return {
        error: {
          code: error instanceof ApiError ? String(error.code) : 'STRIPE_CLIENT_ERROR',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: error instanceof ApiError && error.status ? error.status : 500,
      };
    }
  }

  async getUsageMetrics(metric: string): Promise<ApiResponse<SubscriptionUsageMetrics>> {
    try {
      logger.info('Fetching usage metrics', { metric });
      const resultData = await api.get<SubscriptionUsageMetrics>(`api-subscriptions/usage/${metric}`, this.getOptions());
      return { status: 200, data: resultData };
    } catch (error) {
      logger.error('Error fetching usage metrics', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        metric 
      });
      return {
        error: {
          code: error instanceof ApiError ? String(error.code) : 'STRIPE_CLIENT_ERROR',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: error instanceof ApiError && error.status ? error.status : 500,
      };
    }
  }
}