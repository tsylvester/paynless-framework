// src/context/subscription.context.tsx
import { createContext, ReactNode, useEffect, useState, useContext } from 'react';
import { SubscriptionPlan, UserSubscription } from '../types/subscription.types';
import { subscriptionService } from '../services/subscription.service';
import { logger } from '../utils/logger';
import { useAuth } from '../hooks/useAuth';
import { isStripeTestMode } from '../utils/stripe';

interface SubscriptionState {
  userSubscription: UserSubscription | null;
  availablePlans: SubscriptionPlan[];
  isSubscriptionLoading: boolean;
  hasActiveSubscription: boolean;
  isTestMode: boolean;
  error: Error | null;
}

interface SubscriptionContextType extends SubscriptionState {
  refreshSubscription: () => Promise<void>;
  createCheckoutSession: (priceId: string, successUrl: string, cancelUrl: string) => Promise<string | null>;
  createBillingPortalSession: (returnUrl: string) => Promise<string | null>;
  cancelSubscription: (subscriptionId: string) => Promise<boolean>;
  resumeSubscription: (subscriptionId: string) => Promise<boolean>;
  getUsageMetrics: (metric: string) => Promise<any>;
}

export const SubscriptionContext = createContext<SubscriptionContextType>({
  userSubscription: null,
  availablePlans: [],
  isSubscriptionLoading: true,
  hasActiveSubscription: false,
  isTestMode: false,
  error: null,
  refreshSubscription: async () => {},
  createCheckoutSession: async () => null,
  createBillingPortalSession: async () => null,
  cancelSubscription: async () => false,
  resumeSubscription: async () => false,
  getUsageMetrics: async () => null,
});

interface SubscriptionProviderProps {
  children: ReactNode;
}

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const { user } = useAuth();
  const [state, setState] = useState<SubscriptionState>({
    userSubscription: null,
    availablePlans: [],
    isSubscriptionLoading: true,
    hasActiveSubscription: false,
    isTestMode: isStripeTestMode(),
    error: null,
  });
  
  useEffect(() => {
    if (user) {
      loadSubscriptionData();
    } else {
      setState({
        userSubscription: null,
        availablePlans: [],
        isSubscriptionLoading: false,
        hasActiveSubscription: false,
        isTestMode: isStripeTestMode(),
        error: null,
      });
    }
  }, [user]);
  
  const loadSubscriptionData = async () => {
    if (!user) return;
    
    setState(prev => ({ ...prev, isSubscriptionLoading: true, error: null }));
    
    try {
      // Load plans and subscription in parallel
      const [plans, userSubscription] = await Promise.all([
        subscriptionService.getSubscriptionPlans(),
        subscriptionService.getUserSubscription(user.id),
      ]);
      
      const hasActiveSubscription = userSubscription 
        ? userSubscription.status === 'active' || userSubscription.status === 'trialing'
        : false;
      
      setState({
        userSubscription,
        availablePlans: plans,
        isSubscriptionLoading: false,
        hasActiveSubscription,
        isTestMode: isStripeTestMode(),
        error: null,
      });
    } catch (error) {
      logger.error('Failed to load subscription data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: user.id,
      });
      
      setState(prev => ({
        ...prev,
        isSubscriptionLoading: false,
        error: error instanceof Error ? error : new Error('Failed to load subscription data'),
      }));
    }
  };
  
  const refreshSubscription = async () => {
    await loadSubscriptionData();
  };
  
  const createCheckoutSession = async (
    priceId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<string | null> => {
    if (!user) return null;
    
    try {
      return await subscriptionService.createCheckoutSession(
        user.id,
        priceId,
        successUrl,
        cancelUrl
      );
    } catch (error) {
      logger.error('Error creating checkout session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: user.id,
        priceId,
      });
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to create checkout session'),
      }));
      return null;
    }
  };
  
  const createBillingPortalSession = async (returnUrl: string): Promise<string | null> => {
    if (!user) return null;
    
    try {
      return await subscriptionService.createBillingPortalSession(user.id, returnUrl);
    } catch (error) {
      logger.error('Error creating billing portal session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: user.id,
      });
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to create billing portal session'),
      }));
      return null;
    }
  };
  
  const cancelSubscription = async (subscriptionId: string): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const success = await subscriptionService.cancelSubscription(user.id, subscriptionId);
      if (success) {
        await refreshSubscription();
      }
      return success;
    } catch (error) {
      logger.error('Error cancelling subscription', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: user.id,
        subscriptionId,
      });
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to cancel subscription'),
      }));
      return false;
    }
  };
  
  const resumeSubscription = async (subscriptionId: string): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const success = await subscriptionService.resumeSubscription(user.id, subscriptionId);
      if (success) {
        await refreshSubscription();
      }
      return success;
    } catch (error) {
      logger.error('Error resuming subscription', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: user.id,
        subscriptionId,
      });
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to resume subscription'),
      }));
      return false;
    }
  };
  
  const getUsageMetrics = async (metric: string): Promise<any> => {
    if (!user) return null;
    
    try {
      return await subscriptionService.getUsageMetrics(user.id, metric);
    } catch (error) {
      logger.error('Error getting usage metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: user.id,
        metric,
      });
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to get usage metrics'),
      }));
      return null;
    }
  };
  
  const contextValue = {
    ...state,
    refreshSubscription,
    createCheckoutSession,
    createBillingPortalSession,
    cancelSubscription,
    resumeSubscription,
    getUsageMetrics,
  };
  
  return (
    <SubscriptionContext.Provider value={contextValue}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// Custom hook to use the subscription context
export function useSubscription() {
  const context = useContext(SubscriptionContext);
  
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  
  return context;
}