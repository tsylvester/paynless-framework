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
      
      logger.info('Created checkout session', {
        sessionId: session.session_id,
        planId
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

  // Poll for subscription updates as a fallback
  const pollSubscriptionStatus = useCallback(async (attempts = 5, delay = 2000) => {
    logger.debug('Starting subscription polling');
    
    for (let i = 0; i < attempts; i++) {
      try {
        const data = await getCurrentSubscription();
        logger.debug(`Poll attempt ${i+1}/${attempts}:`, {
          planId: data?.subscription_plan_id,
          status: data?.subscription_status
        });
        
        // Update subscription state
        if (data) {
          setSubscription(data);
        }
      
        // If subscription is updated to non-free, we're done
        if (data && data.subscription_plan_id !== 'free') {
          logger.info('Subscription updated successfully via polling');
          return true;
        }
      } catch (error) {
        logger.error(`Error in poll attempt ${i+1}:`, error);
      }
      
      // Wait before trying again
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    logger.warn('Failed to detect subscription update after polling');
    return false;
  }, []);

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
    };
    
    eventEmitter.on('subscription-loaded', subscriptionLoadListener);
    
    return () => {
      eventEmitter.off('subscription-loaded', subscriptionLoadListener);
    };
  }, [authStatus, user, loadSubscription, loadSubscriptionEvents, loadPlans]);

  // Handle URL params when returning from checkout
  useEffect(() => {
    const handleCheckoutRedirect = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const sessionStatus = urlParams.get('session_status');
      const sessionId = urlParams.get('session_id');
      
      if (sessionStatus === 'success' || sessionId) {
        logger.info('Detected return from Stripe checkout', { 
          sessionStatus, 
          sessionId: sessionId || 'not provided'
        });
        
        // Clear the URL params without refreshing
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Immediately load current data
        await loadSubscription();
        await loadSubscriptionEvents();
        
        // Notify other components about the subscription change
        eventEmitter.emit('subscription-loaded', { subscription: true });
        
        // Add a small delay and poll for updates in case webhook processing is delayed
        setTimeout(async () => {
          const updated = await pollSubscriptionStatus(3, 2000);
          
          if (updated) {
            // Notify again if polling found updates
            eventEmitter.emit('subscription-loaded', { subscription: true });
          }
        }, 500);
      }
    };
    
    handleCheckoutRedirect();
  }, [loadSubscription, loadSubscriptionEvents, pollSubscriptionStatus]);

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