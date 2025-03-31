// src/api/clients/stripe.api.ts
import { BaseApiClient } from './base.api';
import { ApiResponse, CreateCheckoutSessionRequest, CreateBillingPortalRequest, StripeSessionResponse } from '../../types/api-types';
import { SubscriptionPlan, UserSubscription } from '../../types/subscription.types';
import { logger } from '../../utils/logger';
import { getSupabaseClient } from '../../utils/supabase';
import { isStripeTestMode } from '../../utils/stripe';

/**
 * API client for Stripe operations
 */
export class StripeApiClient {
  private baseClient: BaseApiClient;
  private supabase = getSupabaseClient();
  private isTestMode: boolean;
  
  constructor() {
    this.baseClient = new BaseApiClient(`${import.meta.env.VITE_API_URL}/stripe`);
    this.isTestMode = isStripeTestMode();
    logger.info(`Stripe API client initialized in ${this.isTestMode ? 'TEST' : 'LIVE'} mode`);
  }
  
  /**
   * Create Stripe checkout session
   */
  async createCheckoutSession(
    request: CreateCheckoutSessionRequest
  ): Promise<ApiResponse<StripeSessionResponse>> {
    try {
      logger.info('Creating Stripe checkout session', { 
        priceId: request.priceId,
        mode: this.isTestMode ? 'TEST' : 'LIVE'
      });
      
      // Include the test mode flag in the request
      const requestWithMode = {
        ...request,
        isTestMode: this.isTestMode,
      };
      
      return await this.baseClient.post<StripeSessionResponse>(
        '/create-checkout-session',
        requestWithMode
      );
    } catch (error) {
      logger.error('Error creating Stripe checkout session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        priceId: request.priceId,
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
   * Create Stripe billing portal session
   */
  async createBillingPortalSession(
    request: CreateBillingPortalRequest
  ): Promise<ApiResponse<StripeSessionResponse>> {
    try {
      logger.info('Creating Stripe billing portal session', {
        mode: this.isTestMode ? 'TEST' : 'LIVE'
      });
      
      // Include the test mode flag in the request
      const requestWithMode = {
        ...request,
        isTestMode: this.isTestMode,
      };
      
      return await this.baseClient.post<StripeSessionResponse>(
        '/create-billing-portal-session',
        requestWithMode
      );
    } catch (error) {
      logger.error('Error creating Stripe billing portal session', {
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
   * Get all available subscription plans
   */
  async getSubscriptionPlans(): Promise<ApiResponse<SubscriptionPlan[]>> {
    try {
      logger.info('Fetching subscription plans', {
        mode: this.isTestMode ? 'TEST' : 'LIVE'
      });
      
      const { data, error } = await this.supabase
        .from('subscription_plans')
        .select('*')
        .eq('active', true)
        .order('amount', { ascending: true });
      
      if (error) {
        logger.error('Error fetching subscription plans', { 
          error: error.message,
          mode: this.isTestMode ? 'TEST' : 'LIVE'
        });
        
        return {
          error: {
            code: 'database_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      // Filter plans based on the test_mode field in metadata if it exists
      const filteredPlans = data.filter(plan => {
        const metadata = plan.metadata || {};
        // If no test_mode specified in metadata, include the plan in both modes
        if (metadata.test_mode === undefined) return true;
        // Otherwise, only include if the test_mode matches the current mode
        return metadata.test_mode === this.isTestMode;
      });
      
      return {
        data: filteredPlans.map(plan => ({
          id: plan.id,
          stripePriceId: plan.stripe_price_id,
          name: plan.name,
          description: plan.description,
          amount: plan.amount,
          currency: plan.currency,
          interval: plan.interval,
          intervalCount: plan.interval_count,
          metadata: plan.metadata,
        })),
        status: 200,
      };
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
      
      const { data, error } = await this.supabase
        .from('user_subscriptions')
        .select(`
          *,
          subscription_plans:plan_id (*)
        `)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        logger.error('Error fetching user subscription', { 
          error: error.message,
          userId,
          mode: this.isTestMode ? 'TEST' : 'LIVE'
        });
        
        return {
          error: {
            code: 'database_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      // If no subscription or the subscription doesn't match our test mode, return free status
      if (!data || (data.subscription_plans?.metadata?.test_mode !== undefined && 
                   data.subscription_plans.metadata.test_mode !== this.isTestMode)) {
        return {
          data: {
            id: null,
            userId,
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            status: 'free',
            currentPeriodStart: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            plan: null,
          },
          status: 200,
        };
      }
      
      return {
        data: {
          id: data.id,
          userId: data.user_id,
          stripeCustomerId: data.stripe_customer_id,
          stripeSubscriptionId: data.stripe_subscription_id,
          status: data.status,
          currentPeriodStart: data.current_period_start,
          currentPeriodEnd: data.current_period_end,
          cancelAtPeriodEnd: data.cancel_at_period_end,
          plan: data.subscription_plans ? {
            id: data.subscription_plans.id,
            stripePriceId: data.subscription_plans.stripe_price_id,
            name: data.subscription_plans.name,
            description: data.subscription_plans.description,
            amount: data.subscription_plans.amount,
            currency: data.subscription_plans.currency,
            interval: data.subscription_plans.interval,
            intervalCount: data.subscription_plans.interval_count,
            metadata: data.subscription_plans.metadata,
          } : null,
        },
        status: 200,
      };
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
}

export const stripeApiClient = new StripeApiClient();