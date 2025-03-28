// Path: src/context/SubscriptionContext.tsx
import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { logger } from '../utils/logger';
import {
  getSubscriptionPlans,
  getCurrentSubscription,
  getSubscriptionEvents,
  createCheckoutSession,
  manageSubscription,
  isFeatureEnabled,
  getRemainingUsage
} from '../services/subscriptionService';
import {
  SubscriptionPlan,
  SubscriptionEvent,
  SubscriptionWithPlan,
  SubscriptionContextType
} from '../types/subscription.types';
import { eventEmitter } from '../utils/eventEmitter';

export const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, authStatus } = useAuth();
  
  // State
  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [subscriptionEvents, setSubscriptionEvents] = useState<SubscriptionEvent[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<{
    url: string | null;
    sessionId: string | null;
    isCreating: boolean;
    error: Error | null;
  }>({
    url: null,
    sessionId: null,
    isCreating: false,
    error: null
  });

  // Load subscription info
  const loadSubscription = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await getCurrentSubscription();
      setSubscription(data);
      logger.debug('Subscription loaded:', data);
    } catch (err) {
      setError(err as Error);
      logger.error('Error loading subscription:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Load subscription events
  const loadSubscriptionEvents = useCallback(async () => {
    if (!user) return;
    
    try {
      const events = await getSubscriptionEvents();
      setSubscriptionEvents(events);
      logger.debug('Subscription events loaded:', events.length);
    } catch (err) {
      logger.error('Error loading subscription events:', err);
    }
  }, [user]);

  // Load subscription plans
  const loadPlans = useCallback(async () => {
    try {
      const planList = await getSubscriptionPlans();
      setPlans(planList);
      logger.debug('Subscription plans loaded:', planList.length);
    } catch (err) {
      logger.error('Error loading subscription plans:', err);
    }
  }, []);

  // Create checkout session for upgrading
  const createCheckout = useCallback(async (planId: string) => {
    if (!user) {
      logger.warn('Cannot create checkout without user');
      return null;
    }
    
    setCheckoutSession(prev => ({ ...prev, isCreating: true, error: null }));
    
    try {
      // Build the success and cancel URLs
      const baseUrl = window.location.origin;
      const successUrl = `${baseUrl}/subscription?session_status=success`;
      const cancelUrl = `${baseUrl}/subscription?session_status=cancel`;
      
      const session = await createCheckoutSession(planId, successUrl, cancelUrl);
      
      setCheckoutSession({
        url: session.url,
        sessionId: session.session_id,
        isCreating: false,
        error: null
      });
      
      return { url: session.url };
    } catch (err) {
      setCheckoutSession({
        url: null,
        sessionId: null,
        isCreating: false,
        error: err as Error
      });
      
      logger.error('Error creating checkout session:', err);
      return null;
    }
  }, [user]);

  // Cancel subscription
  const cancelSubscription = useCallback(async () => {
    if (!user || !subscription) {
      logger.warn('Cannot cancel without user or subscription');
      return false;
    }
    
    setIsLoading(true);
    
    try {
      await manageSubscription('cancel');
      await loadSubscription();
      await loadSubscriptionEvents();
      return true;
    } catch (err) {
      setError(err as Error);
      logger.error('Error canceling subscription:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, subscription, loadSubscription, loadSubscriptionEvents]);

  // Resume subscription
  const resumeSubscription = useCallback(async () => {
    if (!user || !subscription) {
      logger.warn('Cannot resume without user or subscription');
      return false;
    }
    
    setIsLoading(true);
    
    try {
      await manageSubscription('resume');
      await loadSubscription();
      await loadSubscriptionEvents();
      return true;
    } catch (err) {
      setError(err as Error);
      logger.error('Error resuming subscription:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, subscription, loadSubscription, loadSubscriptionEvents]);

  // Change plan
  const changePlan = useCallback(async (planId: string) => {
    if (!user || !subscription) {
      logger.warn('Cannot change plan without user or subscription');
      return false;
    }
    
    setIsLoading(true);
    
    try {
      const result = await manageSubscription('change_plan', planId);
      
      // If checkout is required, direct user to checkout
      if (result.require_checkout) {
        await createCheckout(planId);
        return false;
      }
      
      await loadSubscription();
      await loadSubscriptionEvents();
      return true;
    } catch (err) {
      setError(err as Error);
      logger.error('Error changing subscription plan:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, subscription, loadSubscription, loadSubscriptionEvents, createCheckout]);

  // Check if a subscription feature is enabled
  const isSubscriptionFeatureEnabled = useCallback((featureName: string) => {
    return isFeatureEnabled(subscription, featureName);
  }, [subscription]);

  // Get remaining usage for a given feature
  const getRemUsage = useCallback(async (usageType: string) => {
    return await getRemainingUsage(subscription, usageType);
  }, [subscription]);

  // Initialize on auth state change
  useEffect(() => {
    if (authStatus === 'authenticated' && user) {
      loadSubscription();
      loadSubscriptionEvents();
      loadPlans();
    } else if (authStatus === 'unauthenticated') {
      // Clear subscription data if user is logged out
      setSubscription(null);
      setSubscriptionEvents([]);
    }
    const subscriptionLoadListener = ({ subscription }: { subscription: boolean }) => {
        if (subscription) {
            loadSubscription();
            loadSubscriptionEvents();
            loadPlans();
        }
    }
    eventEmitter.on('subscription-loaded', subscriptionLoadListener);
    return () => {
      eventEmitter.off('subscription-loaded', subscriptionLoadListener);
    }
  }, [authStatus, user, loadSubscription, loadSubscriptionEvents, loadPlans]);

  // Handle URL params when returning from checkout
  useEffect(() => {
    const handleCheckoutRedirect = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const sessionStatus = urlParams.get('session_status');
      
      if (sessionStatus) {
        // Clear the URL params without refreshing
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Reload subscription data to reflect changes
        await loadSubscription();
        await loadSubscriptionEvents();
      }
    };
    
    handleCheckoutRedirect();
  }, [loadSubscription, loadSubscriptionEvents]);

  const value = {
    subscription,
    subscriptionEvents,
    plans,
    isLoading,
    error,
    checkoutSession,
    loadSubscription,
    loadSubscriptionEvents,
    loadPlans,
    createCheckoutSession: createCheckout,
    cancelSubscription,
    resumeSubscription,
    changePlan,
    isSubscriptionFeatureEnabled,
    getRemainingUsage: getRemUsage
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};
