// src/api/clients/stripe.api.ts
/// <reference types="@paynless/types" />

import type { ApiClient } from './apiClient';
import type { ApiResponse, SubscriptionPlan, UserSubscription, SubscriptionUsageMetrics, CheckoutSessionResponse, PortalSessionResponse, FetchOptions } from '@paynless/types';
import { logger } from '@paynless/utils';

/**
 * API client for Stripe operations
 */
export class StripeApiClient {
  private apiClient: ApiClient;
  
  constructor(apiClient: ApiClient) { 
    this.apiClient = apiClient;
  }
  
  /**
   * Create Stripe checkout session
   */
  async createCheckoutSession(priceId: string, isTestMode: boolean, options?: FetchOptions): Promise<ApiResponse<CheckoutSessionResponse>> {
    try {
      logger.info('Creating Stripe checkout session', { priceId, isTestMode });
      const result = await this.apiClient.post<CheckoutSessionResponse, { priceId: string, isTestMode: boolean }>(
        'api-subscriptions/checkout',
        { priceId, isTestMode },
        options
      );
      if (result.error) {
         logger.warn('Checkout session creation API returned an error', { error: result.error });
         return result;
      }
      return result;
    } catch (error) {
      logger.error('Unexpected error creating Stripe checkout session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        priceId,
      });
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      return { status: 500, error: { code: 'CLIENT_EXCEPTION', message } };
    }
  }
  
  /**
   * Create Stripe billing portal session
   */
  async createPortalSession(isTestMode: boolean, options?: FetchOptions): Promise<ApiResponse<PortalSessionResponse>> {
    try {
      logger.info('Creating portal session', { isTestMode });
      const result = await this.apiClient.post<PortalSessionResponse, { isTestMode: boolean }>(
        'api-subscriptions/billing-portal',
        { isTestMode },
        options
      );
      if (result.error) {
         logger.warn('Portal session creation API returned an error', { error: result.error });
      }
      return result;
    } catch (error) {
      logger.error('Unexpected error creating portal session', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      return { status: 500, error: { code: 'CLIENT_EXCEPTION', message } };
    }
  }
  
  /**
   * Get all available subscription plans (Assumed Public? ApiClient handles token logic)
   */
  async getSubscriptionPlans(options?: FetchOptions): Promise<ApiResponse<SubscriptionPlan[]>> {
    try {
      logger.info('Fetching subscription plans');
      const result = await this.apiClient.get<SubscriptionPlan[]>('api-subscriptions/plans', options);
       if (result.error) {
         logger.warn('Fetching plans API returned an error', { error: result.error });
      }
      return result;
    } catch (error) {
      logger.error('Unexpected error fetching subscription plans', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      return { status: 500, error: { code: 'CLIENT_EXCEPTION', message } };
    }
  }
  
  /**
   * Get user subscription
   */
  async getUserSubscription(options?: FetchOptions): Promise<ApiResponse<UserSubscription>> {
    try {
      logger.info('Fetching user subscription');
      const result = await this.apiClient.get<UserSubscription>(`api-subscriptions/current`, options);
       if (result.error) {
         logger.warn('Fetching user subscription API returned an error', { error: result.error });
      }
      return result;
    } catch (error) {
      logger.error('Unexpected error fetching user subscription', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      return { status: 500, error: { code: 'CLIENT_EXCEPTION', message } };
    }
  }

  async cancelSubscription(subscriptionId: string, options?: FetchOptions): Promise<ApiResponse<void>> {
    try {
      logger.info('Cancelling subscription', { subscriptionId });
      const result = await this.apiClient.post<void, {}>(`api-subscriptions/${subscriptionId}/cancel`, {}, options);
       if (result.error) {
         logger.warn('Cancelling subscription API returned an error', { error: result.error, subscriptionId });
      }
      return result;
    } catch (error) {
      logger.error('Unexpected error cancelling subscription', {
        error: error instanceof Error ? error.message : 'Unknown error',
        subscriptionId,
      });
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      return { status: 500, error: { code: 'CLIENT_EXCEPTION', message } };
    }
  }

  async resumeSubscription(subscriptionId: string, options?: FetchOptions): Promise<ApiResponse<void>> {
    try {
      logger.info('Resuming subscription', { subscriptionId });
      const result = await this.apiClient.post<void, {}>(`api-subscriptions/${subscriptionId}/resume`, {}, options);
      if (result.error) {
         logger.warn('Resuming subscription API returned an error', { error: result.error, subscriptionId });
      }
      return result;
    } catch (error) {
      logger.error('Unexpected error resuming subscription', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        subscriptionId,
      });
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      return { status: 500, error: { code: 'CLIENT_EXCEPTION', message } };
    }
  }

  async getUsageMetrics(metric: string, options?: FetchOptions): Promise<ApiResponse<SubscriptionUsageMetrics>> {
    try {
      logger.info('Fetching usage metrics', { metric });
      const result = await this.apiClient.get<SubscriptionUsageMetrics>(`api-subscriptions/usage/${metric}`, options);
      if (result.error) {
         logger.warn('Fetching usage metrics API returned an error', { error: result.error, metric });
      }
      return result;
    } catch (error) {
      logger.error('Unexpected error fetching usage metrics', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        metric 
      });
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      return { status: 500, error: { code: 'CLIENT_EXCEPTION', message } };
    }
  }
}