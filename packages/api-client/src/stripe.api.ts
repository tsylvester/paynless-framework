// src/api/clients/stripe.api.ts
/// <reference types="@paynless/types" />

import { api, FetchOptions } from './apiClient';
import type { ApiResponse, SubscriptionPlan, UserSubscription, SubscriptionUsageMetrics } from '@paynless/types';
import { logger } from '@paynless/utils';
import { ApiError } from './apiClient';

// Type for options passed to StripeApiClient methods, extending FetchOptions
// to potentially include the token directly if needed.
interface StripeApiOptions extends FetchOptions {}

/**
 * API client for Stripe operations
 */
export class StripeApiClient {
  private api = api; // Use the configured base api client
  private getToken: () => string | undefined; // Store the token getter
  
  constructor(getToken: () => string | undefined) { 
    this.getToken = getToken;
  }
  
  private getOptions(options: StripeApiOptions = {}): FetchOptions {
    const token = !options.isPublic ? this.getToken() : undefined; 
    const finalOptions = { ...options };
    if (token) {
        finalOptions.token = token;
    }
    return finalOptions;
  }
  
  /**
   * Create Stripe checkout session
   * @param priceId - The ID of the Stripe Price object
   * @param isTestMode - Whether to create session in test mode
   */
  async createCheckoutSession(priceId: string, isTestMode: boolean): Promise<ApiResponse<{ sessionId: string }>> {
    try {
      logger.info('Creating Stripe checkout session', { priceId, isTestMode });
      const fetchOptions = this.getOptions(); 
      const resultData = await this.api.post<{ sessionId: string }>(
        'api-subscriptions/checkout',
        { priceId, isTestMode },
        fetchOptions
      );
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
      const fetchOptions = this.getOptions();
      const resultData = await this.api.post<{ url: string }>(
        'api-subscriptions/billing-portal',
        { isTestMode },
        fetchOptions
      );
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
   * Get all available subscription plans (Assumed Public)
   */
  async getSubscriptionPlans(): Promise<ApiResponse<SubscriptionPlan[]>> {
    try {
      logger.info('Fetching subscription plans');
      const fetchOptions = this.getOptions(); 
      const resultData = await this.api.get<SubscriptionPlan[]>('api-subscriptions/plans', fetchOptions);
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
      logger.info('Fetching user subscription', { userId });
      const fetchOptions = this.getOptions(); 
      const resultData = await this.api.get<UserSubscription>(`api-subscriptions/current`, fetchOptions);
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
      const fetchOptions = this.getOptions(); 
      await this.api.post<void>(`api-subscriptions/${subscriptionId}/cancel`, {}, fetchOptions);
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
      const fetchOptions = this.getOptions(); 
      await this.api.post<void>(`api-subscriptions/${subscriptionId}/resume`, {}, fetchOptions);
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
      const fetchOptions = this.getOptions();
      const resultData = await this.api.get<SubscriptionUsageMetrics>(`api-subscriptions/usage/${metric}`, fetchOptions);
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