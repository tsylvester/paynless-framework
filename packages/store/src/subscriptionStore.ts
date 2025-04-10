import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SubscriptionPlan, UserSubscription, SubscriptionUsageMetrics } from '@paynless/types';
// Import the global api object instead of StripeApiClient directly
import { api } from '@paynless/api-client'; 
import { logger } from '@paynless/utils';
import { useAuthStore } from './authStore';

interface SubscriptionState {
  userSubscription: UserSubscription | null;
  availablePlans: SubscriptionPlan[];
  isSubscriptionLoading: boolean;
  hasActiveSubscription: boolean;
  isTestMode: boolean;
  error: Error | null;
}

// Export the interface as well
export interface SubscriptionStore extends SubscriptionState {
  // Action setters
  setUserSubscription: (subscription: UserSubscription | null) => void;
  setAvailablePlans: (plans: SubscriptionPlan[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  setTestMode: (isTestMode: boolean) => void;
  setError: (error: Error | null) => void;
  
  // API actions
  loadSubscriptionData: (userId: string) => Promise<void>;
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
      // Revert to default, app will set it
      isTestMode: false,
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
      
      setTestMode: (isTestMode) => set({ isTestMode }),
      
      setError: (error) => set({ error }),
      
      // API actions
      loadSubscriptionData: async (/* userId: string */) => {
        const user = useAuthStore.getState().user;
        const token = useAuthStore.getState().session?.access_token;

        if (!user) {
            logger.warn('loadSubscriptionData called but no authenticated user found.');
            set({ isSubscriptionLoading: false }); // Ensure loading state is reset
            return; // Exit if no user
        }
        if (!token) { // Also exit if no token
            logger.warn('loadSubscriptionData called but no auth token found.');
            set({ isSubscriptionLoading: false, error: new Error('Not authenticated') }); 
            return;
        }
        
        set({ isSubscriptionLoading: true, error: null });
        
        try {
          const [plansResponse, subResponse] = await Promise.all([
            // Pass token explicitly
            api.billing().getSubscriptionPlans({ token }),
            api.billing().getUserSubscription({ token })
          ]);
          
          // ---> Add Logging <---
          logger.info('API Response - Plans:', { data: plansResponse.data, error: plansResponse.error?.message });
          logger.info('API Response - Subscription:', { data: subResponse.data, error: subResponse.error?.message });
          // ---> End Logging <---

          // Handle potential errors from API responses
          if (plansResponse.error || !plansResponse.data) {
            // ---> Log the problematic plan data before throwing <---
            logger.error('Problematic plansResponse data:', { data: plansResponse.data });
            // ---> End Logging <---
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
          
          // ---> Add Logging <---
          // Ensure plansResponse.data.plans is an array before setting state
          const plansArray = plansResponse.data;
          const plansToSet = Array.isArray(plansArray) ? plansArray : []; // Correctly check the .plans property
          if (!Array.isArray(plansArray)) { // Log if the .plans property wasn't an array
             logger.warn('Plans data.plans from API was not an array, setting to empty array.', { receivedData: plansResponse.data });
          }
          logger.info('Setting subscription store state:', { userSubscription, availablePlans: plansToSet, isLoading: false, hasActiveSubscription });
          // ---> End Logging <---
          
          set({
            userSubscription,
            availablePlans: plansToSet, // Use the validated array
            isSubscriptionLoading: false,
            hasActiveSubscription,
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
        const user = useAuthStore.getState().user;
        if (!user) {
          logger.info('refreshSubscription called but user is not logged in.');
          return; 
        }
        // Re-add userId argument
        await get().loadSubscriptionData(user.id);
      },
      
      createCheckoutSession: async (priceId: string): Promise<string | null> => {
        const { user, session } = useAuthStore.getState();
        const token = session?.access_token;
        if (!user?.id || !token) {
          logger.error('User not authenticated for checkout session');
          set({ error: new Error('User not authenticated'), isSubscriptionLoading: false });
          return null;
        }

        set({ isSubscriptionLoading: true, error: null });

        try {
          const isTestMode = get().isTestMode;
          // Construct success and cancel URLs based on current origin
          const currentOrigin = window.location.origin;
          const successUrl = `${currentOrigin}/subscriptionsuccess`;
          const cancelUrl = `${currentOrigin}/`;
          
          const response = await api.billing().createCheckoutSession(
            priceId, 
            isTestMode, 
            successUrl,
            cancelUrl,
            { token }
          );

          // Check for response.data.url (Corrected property name)
          if (response.error || !response.data?.sessionUrl) { 
            const errorMessage = response.error?.message || 'Failed to get checkout session URL from API';
            logger.error('Error response from createCheckoutSession API', {
              error: response.error,
              responseData: response.data
            });
            throw new Error(errorMessage);
          }

          // Log and return the sessionUrl
          logger.info('Received checkout session URL', { url: response.data.sessionUrl }); 
          set({ isSubscriptionLoading: false, error: null });
          return response.data.sessionUrl; 

        } catch (error) {
          const errorToSet = error instanceof Error ? error : new Error('Failed to create checkout session');
          logger.error('Error creating checkout session', { error: errorToSet });
          set({ error: errorToSet, isSubscriptionLoading: false });
          return null; // Return null on error, like other actions
        }
      },
      
      createBillingPortalSession: async (): Promise<string | null> => {
        const { user, session } = useAuthStore.getState();
        const token = session?.access_token;
        if (!user || !token) { 
           logger.error('Create billing portal session: User not logged in or token missing');
           set({ error: new Error('User not authenticated'), isSubscriptionLoading: false }); // Corrected message
           return null;
        }
        
        set({ isSubscriptionLoading: true, error: null });
        
        try {
          const isTestMode = get().isTestMode;
          // Pass token explicitly
          const response = await api.billing().createPortalSession(isTestMode, { token });
          if (response.error || !response.data?.url) {
             throw new Error(response.error?.message || 'Failed to get billing portal URL');
          }
          set({ isSubscriptionLoading: false, error: null }); // Clear loading on success
          return response.data.url;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error creating billing portal';
          logger.error('Error creating billing portal session', {
            error: errorMessage,
            userId: user.id,
          });
          
          set({
            isSubscriptionLoading: false, // Ensure loading is false on error
            error: error instanceof Error ? error : new Error('Failed to create billing portal session'),
          });
          
          return null;
        }
      },
      
      cancelSubscription: async (subscriptionId: string): Promise<boolean> => {
        const { user, session } = useAuthStore.getState();
        const token = session?.access_token;
        if (!user || !token) {
          logger.error('Cancel subscription: User not logged in or token missing');
          set({ error: new Error('User not authenticated'), isSubscriptionLoading: false }); // Corrected message
          return false;
        }
        if (!subscriptionId) {
          logger.error('Cancel subscription: Missing subscription ID');
          set({ error: new Error('Subscription ID is required'), isSubscriptionLoading: false }); // Corrected message
          return false;
        }

        set({ isSubscriptionLoading: true, error: null });

        try {
          // Pass token explicitly
          await api.billing().cancelSubscription(subscriptionId, { token });
          await get().refreshSubscription();
          set({ isSubscriptionLoading: false, error: null }); // Ensure loading/error reset AFTER refresh
          return true;
        } catch (error) {
          const errorToSet = error instanceof Error ? error : new Error('Failed to cancel subscription');
          logger.error('Error cancelling subscription', { error: errorToSet.message, subscriptionId });
          set({ error: errorToSet, isSubscriptionLoading: false });
          return false; // Added missing return false
        }
      },
      
      resumeSubscription: async (subscriptionId: string): Promise<boolean> => {
        const { user, session } = useAuthStore.getState();
        const token = session?.access_token;
        if (!user || !token) {
           logger.error('Resume subscription: User not logged in or token missing');
           set({ error: new Error('User not authenticated'), isSubscriptionLoading: false }); // Corrected message
           return false;
        }
        if (!subscriptionId) {
           logger.error('Resume subscription: Missing subscription ID');
           set({ error: new Error('Subscription ID is required'), isSubscriptionLoading: false }); // Corrected message
           return false;
        }

        set({ isSubscriptionLoading: true, error: null });

        try {
          // Pass token explicitly
          await api.billing().resumeSubscription(subscriptionId, { token });
          await get().refreshSubscription();
          set({ isSubscriptionLoading: false, error: null }); // Ensure loading/error reset AFTER refresh
          return true;
        } catch (error) {
          const errorToSet = error instanceof Error ? error : new Error('Failed to resume subscription');
          logger.error('Error resuming subscription', { error: errorToSet.message, subscriptionId });
          set({ error: errorToSet, isSubscriptionLoading: false });
          return false; // Added missing return false
        }
      },
      
      getUsageMetrics: async (metric: string): Promise<SubscriptionUsageMetrics | null> => {
        const { user, session } = useAuthStore.getState();
        const token = session?.access_token;
        if (!user || !token) {
           logger.error('Get usage metrics: User not logged in or token missing');
           set({ error: new Error('User not authenticated'), isSubscriptionLoading: false }); // Corrected message
           return null;
        }
        set({ isSubscriptionLoading: true, error: null });
        
        try {
          // Pass token explicitly
          const response = await api.billing().getUsageMetrics(metric, { token });
          if (response.error || !response.data) {
            throw new Error(response.error?.message || 'Failed to get usage metrics');
          }
          set({ isSubscriptionLoading: false, error: null });
          return response.data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error getting usage metrics';
          logger.error('Error getting usage metrics', {
            error: errorMessage,
            userId: user.id,
            metric,
          });
          set({
            isSubscriptionLoading: false,
            error: error instanceof Error ? error : new Error('Failed to get usage metrics'),
          });
          return null;
        }
      },
    }),
    {
      name: 'subscription-storage',
      // Persist relevant parts if needed, e.g., maybe plans, but user sub should be fresh
      partialize: (state) => ({ availablePlans: state.availablePlans }),
    }
  )
);

// Initialize subscription data when auth state changes
// Subscribe to the whole auth state and compare the user property manually
useAuthStore.subscribe((state, prevState) => { 
    if (state.user && state.user.id !== prevState.user?.id) {
      // User logged in or changed
      logger.info('Auth state change detected: User logged in/changed. Loading subscription data.', { userId: state.user.id });
      useSubscriptionStore.getState().loadSubscriptionData(state.user.id);
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