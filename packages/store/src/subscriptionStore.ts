import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SubscriptionPlan, UserSubscription, SubscriptionUsageMetrics } from '@paynless/types';
import { StripeApiClient } from '@paynless/api-client';
import { logger } from '@paynless/utils';
import { useAuthStore } from './authStore';

// Define the function to get the token from the authStore
const getToken = () => useAuthStore.getState().session?.access_token;

// Instantiate the client, passing the getToken function
const stripeApiClient = new StripeApiClient(getToken);

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
  setError: (error: Error | null) => void;
  
  // API actions
  loadSubscriptionData: (userId: string) => Promise<void>;
  refreshSubscription: () => Promise<void>;
  createCheckoutSession: (priceId: string) => Promise<string>;
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
      // Default test mode to false; client app should determine actual mode if needed
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
      
      setError: (error) => set({ error }),
      
      // API actions
      loadSubscriptionData: async (/* userId: string */) => {
        const user = useAuthStore.getState().user;
        // Get token INSIDE the action
        const token = getToken();

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
          // Pass token explicitly in options
          const apiOptions = { token };
          
          // Load plans and subscription in parallel using the API client
          const [plansResponse, subResponse] = await Promise.all([
            // Plans might be public, check if token is needed?
            // Assuming protected for now:
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
        await get().loadSubscriptionData(useAuthStore.getState().user?.id || '');
      },
      
      createCheckoutSession: async (priceId: string): Promise<string> => {
        const { user, session } = useAuthStore.getState();
        const token = session?.access_token;
        if (!user?.id || !token) {
          logger.error('User not authenticated for checkout session');
          throw new Error('User not authenticated');
        }
        
        try {
          const isTestMode = get().isTestMode;
          const response = await stripeApiClient.createCheckoutSession(priceId, isTestMode);
          
          if (response.error || !response.data?.sessionId) {
            logger.error('Error response from createCheckoutSession API', { 
              error: response.error, 
              responseData: response.data 
            });
            throw new Error(response.error?.message || 'Failed to get checkout session ID from API');
          }
          
          logger.info('Received checkout session ID', { sessionId: response.data.sessionId });
          return response.data.sessionId; // Return only the session ID
          
        } catch (error) {
          logger.error('Error creating checkout session in store', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: user.id,
            priceId,
          });
          throw error; // Re-throw error to be caught by UI
        }
      },
      
      createBillingPortalSession: async (): Promise<string | null> => {
        const { user, session } = useAuthStore.getState();
        const token = session?.access_token;
        if (!user || !token) { 
           logger.error('Create billing portal session: User not logged in or token missing');
           set({ error: new Error('User not logged in')});
           return null;
        }
        
        try {
          const isTestMode = get().isTestMode;
          const response = await stripeApiClient.createPortalSession(isTestMode);
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
      
      cancelSubscription: async (subscriptionId: string): Promise<boolean> => {
        const { user, session } = useAuthStore.getState();
        const token = session?.access_token;
        if (!user || !token) { 
           logger.error('Cancel subscription: User not logged in or token missing');
           set({ error: new Error('User not logged in')});
           return false;
        } 
        
        try {
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
      
      resumeSubscription: async (subscriptionId: string): Promise<boolean> => {
        const { user, session } = useAuthStore.getState();
        const token = session?.access_token;
        if (!user || !token) { 
           logger.error('Resume subscription: User not logged in or token missing');
           set({ error: new Error('User not logged in')});
           return false;
        } 
        
        try {
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
      
      getUsageMetrics: async (metric: string): Promise<SubscriptionUsageMetrics | null> => {
        const { user, session } = useAuthStore.getState();
        const token = session?.access_token;
        if (!user || !token) {
          logger.error('Get usage metrics: User not logged in or token missing');
          set({ error: new Error('User not logged in') });
          return null;
        }
        try {
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
          set({ error: error instanceof Error ? error : new Error('Failed to get usage metrics') });
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