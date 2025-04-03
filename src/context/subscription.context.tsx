// src/context/subscription.context.tsx
import { createContext, useEffect, useState, useContext, useCallback } from 'react';
import { SubscriptionPlan, UserSubscription } from '../types/subscription.types';
import { subscriptionService } from '../services/subscription.service';
import { logger } from '../utils/logger';
import { useAuthStore } from '../store/authStore';
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

const initialSubscriptionState: SubscriptionState = {
  userSubscription: null,
  availablePlans: [],
  isSubscriptionLoading: false,
  hasActiveSubscription: false,
  isTestMode: isStripeTestMode(),
  error: null,
};

export const SubscriptionContext = createContext<SubscriptionContextType>({
  ...initialSubscriptionState,
  refreshSubscription: async () => {},
  createCheckoutSession: async () => null,
  createBillingPortalSession: async () => null,
  cancelSubscription: async () => false,
  resumeSubscription: async () => false,
  getUsageMetrics: async () => null,
});

interface SubscriptionProviderProps {
  children: React.ReactNode;
}

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const { user } = useAuthStore.getState();
  
  const [state, setState] = useState<SubscriptionState>(initialSubscriptionState);
  
  const loadSubscriptionData = useCallback(async () => {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) {
      logger.error('SubscriptionProvider: loadSubscriptionData called without a user. This should not happen due to AuthenticatedGate.');
      return;
    }

    setState(prev => ({ ...prev, isSubscriptionLoading: true, error: null }));
    
    try {
      logger.info('SubscriptionProvider: Loading plans and user subscription', { userId: currentUser.id });
      const [plans, userSubscription] = await Promise.all([
        subscriptionService.getSubscriptionPlans(),
        subscriptionService.getUserSubscription(currentUser.id),
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
      logger.info('SubscriptionProvider: Data loaded successfully', { userId: currentUser.id });

    } catch (error) {
      logger.error('SubscriptionProvider: Failed to load subscription data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: currentUser.id,
      });
      setState(prev => ({
        ...prev,
        isSubscriptionLoading: false,
        error: error instanceof Error ? error : new Error('Failed to load subscription data'),
      }));
    }
  }, []);
  
  useEffect(() => {
    logger.info('SubscriptionProvider: Mounted, loading subscription data...');
    loadSubscriptionData();
  }, [loadSubscriptionData]);
  
  const refreshSubscription = useCallback(async () => {
    const currentUser = useAuthStore.getState().user;
    if (currentUser) {
      await loadSubscriptionData();
    } else {
        logger.warn('SubscriptionProvider: Attempted to refresh subscription but user is not logged in.');
    }
  }, [loadSubscriptionData]);
  
  const createCheckoutSession = async (
    priceId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<string | null> => {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) {
        logger.warn('Cannot create checkout session, user not logged in');
        return null;
    }
    
    try {
      return await subscriptionService.createCheckoutSession(
        currentUser.id,
        priceId,
        successUrl,
        cancelUrl
      );
    } catch (error) {
      logger.error('Error creating checkout session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: currentUser.id,
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
    const currentUser = useAuthStore.getState().user;
     if (!currentUser) {
        logger.warn('Cannot create billing portal session, user not logged in');
        return null;
    }
    
    try {
      return await subscriptionService.createBillingPortalSession(currentUser.id, returnUrl);
    } catch (error) {
      logger.error('Error creating billing portal session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: currentUser.id,
      });
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to create billing portal session'),
      }));
      return null;
    }
  };
  
  const cancelSubscription = async (subscriptionId: string): Promise<boolean> => {
    const currentUser = useAuthStore.getState().user;
     if (!currentUser) {
        logger.warn('Cannot cancel subscription, user not logged in');
        return false;
    }
    
    try {
      const success = await subscriptionService.cancelSubscription(currentUser.id, subscriptionId);
      if (success) {
        await refreshSubscription();
      }
      return success;
    } catch (error) {
      logger.error('Error cancelling subscription', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: currentUser.id,
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
    const currentUser = useAuthStore.getState().user;
     if (!currentUser) {
        logger.warn('Cannot resume subscription, user not logged in');
        return false;
    }
    
    try {
      const success = await subscriptionService.resumeSubscription(currentUser.id, subscriptionId);
      if (success) {
        await refreshSubscription();
      }
      return success;
    } catch (error) {
      logger.error('Error resuming subscription', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: currentUser.id,
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
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) {
        logger.warn('Cannot get usage metrics, user not logged in');
        return null;
    }
    
    try {
      return await subscriptionService.getUsageMetrics(currentUser.id, metric);
    } catch (error) {
      logger.error('Error getting usage metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: currentUser.id,
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

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  
  return context;
}