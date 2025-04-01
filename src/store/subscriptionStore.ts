import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SubscriptionPlan, UserSubscription } from '../types/subscription.types';
import { subscriptionService } from '../services/subscription.service';
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
  createCheckoutSession: (priceId: string, successUrl: string, cancelUrl: string) => Promise<string | null>;
  createBillingPortalSession: (returnUrl: string) => Promise<string | null>;
  cancelSubscription: (subscriptionId: string) => Promise<boolean>;
  resumeSubscription: (subscriptionId: string) => Promise<boolean>;
  getUsageMetrics: (metric: string) => Promise<any>;
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
          // Load plans and subscription in parallel
          const [plans, userSubscription] = await Promise.all([
            subscriptionService.getSubscriptionPlans(),
            subscriptionService.getUserSubscription(user.id),
          ]);
          
          const hasActiveSubscription = userSubscription 
            ? userSubscription.status === 'active' || userSubscription.status === 'trialing'
            : false;
          
          set({
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
          
          set({
            isSubscriptionLoading: false,
            error: error instanceof Error ? error : new Error('Failed to load subscription data'),
          });
        }
      },
      
      refreshSubscription: async () => {
        await get().loadSubscriptionData();
      },
      
      createCheckoutSession: async (priceId, successUrl, cancelUrl) => {
        const user = useAuthStore.getState().user;
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
          
          set({
            error: error instanceof Error ? error : new Error('Failed to create checkout session'),
          });
          
          return null;
        }
      },
      
      createBillingPortalSession: async (returnUrl) => {
        const user = useAuthStore.getState().user;
        if (!user) return null;
        
        try {
          return await subscriptionService.createBillingPortalSession(user.id, returnUrl);
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
        if (!user) return false;
        
        try {
          const success = await subscriptionService.cancelSubscription(user.id, subscriptionId);
          if (success) {
            await get().refreshSubscription();
          }
          return success;
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
        if (!user) return false;
        
        try {
          const success = await subscriptionService.resumeSubscription(user.id, subscriptionId);
          if (success) {
            await get().refreshSubscription();
          }
          return success;
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
        if (!user) return null;
        
        try {
          return await subscriptionService.getUsageMetrics(user.id, metric);
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
useAuthStore.subscribe(
  (state) => state.user,
  (user) => {
    if (user) {
      useSubscriptionStore.getState().loadSubscriptionData();
    } else {
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