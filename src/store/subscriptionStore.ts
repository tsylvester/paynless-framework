import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SubscriptionPlan, UserSubscription, SubscriptionUsageMetrics } from '../types/subscription.types';
import { stripeApiClient } from '../api/clients/stripe.api';
import { logger } from '../utils/logger';
import { useAuthStore } from './authStore';
import { isStripeTestMode } from '../utils/stripe';

interface SubscriptionState {
  userSubscription: UserSubscription | null;
  availablePlans: SubscriptionPlan[];
  isSubscriptionLoading: boolean;
  hasActiveSubscription: boolean;
  isTestMode: boolean;
  error: Error | null;
}

interface SubscriptionStore extends SubscriptionState {
  // Action setters
  setUserSubscription: (subscription: UserSubscription | null) => void;
  setAvailablePlans: (plans: SubscriptionPlan[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: Error | null) => void;
  
  // API actions
  loadSubscriptionData: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  createCheckoutSession: (priceId: string) => Promise<string | null>;
  createBillingPortalSession: () => Promise<string | null>;
  cancelSubscription: (subscriptionId: string) => Promise<boolean>;
  resumeSubscription: (subscriptionId: string) => Promise<boolean>;
  getUsageMetrics: (metric: string) => Promise<SubscriptionUsageMetrics | null>;
}

export const useSubscriptionStore = create<SubscriptionStore>()(
  persist(
    (set, get) => ({
      // Initial state
      userSubscription: null,
      availablePlans: [],
      isSubscriptionLoading: false,
      hasActiveSubscription: false,
      isTestMode: isStripeTestMode(),
      error: null,
      
      // State setters
      setUserSubscription: (subscription) => 
        set({ 
          userSubscription: subscription,
          hasActiveSubscription: subscription 
            ? subscription.status === 'active' || subscription.status === 'trialing'
            : false,
        }),
      
      setAvailablePlans: (plans) => set({ availablePlans: plans }),
      
      setIsLoading: (isLoading) => set({ isSubscriptionLoading: isLoading }),
      
      setError: (error) => set({ error }),
      
      // API actions
      loadSubscriptionData: async () => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        
        set({ isSubscriptionLoading: true, error: null });
        
        try {
          // Load plans and subscription in parallel using the API client
          const [plansResponse, subResponse] = await Promise.all([
            stripeApiClient.getSubscriptionPlans(),
            stripeApiClient.getUserSubscription(user.id),
          ]);
          
          // Handle potential errors from API responses
          if (plansResponse.error || !plansResponse.data) {
            throw new Error(plansResponse.error?.message || 'Failed to load plans');
          }
          if (subResponse.error) { // Allow null data for no subscription
             // Don't throw if the error is just that there's no subscription (need to check error code if backend provides one)
             // For now, log warning and proceed with null subscription
             logger.warn('Could not retrieve user subscription', { error: subResponse.error.message });
             // If it was a real error (not 404), re-throw:
             // if (subResponse.status !== 404) throw new Error(subResponse.error.message); 
          }
          
          const userSubscription = subResponse.data || null;
          const hasActiveSubscription = userSubscription 
            ? userSubscription.status === 'active' || userSubscription.status === 'trialing'
            : false;
          
          set({
            userSubscription,
            availablePlans: plansResponse.data,
            isSubscriptionLoading: false,
            hasActiveSubscription,
            isTestMode: isStripeTestMode(),
            error: null,
          });
        } catch (error) {
          logger.error('Failed to load subscription data', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: user?.id, // Use optional chaining as user might be null in race conditions?
          });
          
          set({
            isSubscriptionLoading: false,
            error: error instanceof Error ? error : new Error('Failed to load subscription data'),
          });
        }
      },
      
      refreshSubscription: async () => {
        await get().loadSubscriptionData();
      },
      
      createCheckoutSession: async (priceId) => {
        const user = useAuthStore.getState().user;
        if (!user) {
           logger.error('Create checkout session: User not logged in');
           set({ error: new Error('User not logged in')});
           return null;
        }
        
        try {
          const response = await stripeApiClient.createCheckoutSession(priceId);
          if (response.error || !response.data?.url) {
            throw new Error(response.error?.message || 'Failed to get checkout URL');
          }
          return response.data.url;
        } catch (error) {
          logger.error('Error creating checkout session', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: user.id,
            priceId,
          });
          
          set({
            error: error instanceof Error ? error : new Error('Failed to create checkout session'),
          });
          
          return null;
        }
      },
      
      createBillingPortalSession: async () => {
        const user = useAuthStore.getState().user;
        if (!user) { 
           logger.error('Create billing portal session: User not logged in');
           set({ error: new Error('User not logged in')});
           return null;
        }
        
        try {
          const response = await stripeApiClient.createPortalSession();
          if (response.error || !response.data?.url) {
             throw new Error(response.error?.message || 'Failed to get billing portal URL');
          }
          return response.data.url;
        } catch (error) {
          logger.error('Error creating billing portal session', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: user.id,
          });
          
          set({
            error: error instanceof Error ? error : new Error('Failed to create billing portal session'),
          });
          
          return null;
        }
      },
      
      cancelSubscription: async (subscriptionId) => {
        const user = useAuthStore.getState().user;
        if (!user) { 
           logger.error('Cancel subscription: User not logged in');
           set({ error: new Error('User not logged in')});
           return false;
        } // Add check
        
        try {
          // Call stripeApiClient directly
          const response = await stripeApiClient.cancelSubscription(subscriptionId);
          if (response.error) {
            throw new Error(response.error.message);
          }
          await get().refreshSubscription(); // Refresh state on success
          return true;
        } catch (error) {
          logger.error('Error cancelling subscription', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: user.id,
            subscriptionId,
          });
          
          set({
            error: error instanceof Error ? error : new Error('Failed to cancel subscription'),
          });
          
          return false;
        }
      },
      
      resumeSubscription: async (subscriptionId) => {
        const user = useAuthStore.getState().user;
        if (!user) { 
           logger.error('Resume subscription: User not logged in');
           set({ error: new Error('User not logged in')});
           return false;
        } // Add check
        
        try {
          // Call stripeApiClient directly
          const response = await stripeApiClient.resumeSubscription(subscriptionId);
          if (response.error) {
            throw new Error(response.error.message);
          }
          await get().refreshSubscription(); // Refresh state on success
          return true;
        } catch (error) {
          logger.error('Error resuming subscription', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: user.id,
            subscriptionId,
          });
          
          set({
            error: error instanceof Error ? error : new Error('Failed to resume subscription'),
          });
          
          return false;
        }
      },
      
      getUsageMetrics: async (metric) => {
        const user = useAuthStore.getState().user;
        if (!user) { 
           logger.error('Get usage metrics: User not logged in');
           set({ error: new Error('User not logged in')});
           return null;
        } // Add check
        
        try {
          // Call stripeApiClient directly
          const response = await stripeApiClient.getUsageMetrics(metric);
          if (response.error || !response.data) {
            throw new Error(response.error?.message || 'Failed to get usage metrics');
          }
          return response.data;
        } catch (error) {
          logger.error('Error getting usage metrics', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: user.id,
            metric,
          });
          
          set({
            error: error instanceof Error ? error : new Error('Failed to get usage metrics'),
          });
          
          return null;
        }
      },
    }),
    {
      name: 'subscription-storage',
      partialize: (state) => ({ 
        userSubscription: state.userSubscription,
        availablePlans: state.availablePlans,
        hasActiveSubscription: state.hasActiveSubscription
      }),
    }
  )
);

// Initialize subscription data when auth state changes
// Subscribe to the whole auth state and compare the user property manually
useAuthStore.subscribe((state, prevState) => { 
    if (state.user && state.user.id !== prevState.user?.id) {
      // User logged in or changed
      logger.info('Auth state change detected: User logged in/changed. Loading subscription data.', { userId: state.user.id });
      useSubscriptionStore.getState().loadSubscriptionData();
    } else if (!state.user && prevState.user) {
      // User logged out
      logger.info('Auth state change detected: User logged out. Clearing subscription data.');
      useSubscriptionStore.setState({
        userSubscription: null,
        availablePlans: [],
        isSubscriptionLoading: false,
        hasActiveSubscription: false,
        error: null,
      });
    }
  }
); 