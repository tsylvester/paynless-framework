import { useSubscriptionStore } from '../store/subscriptionStore';

/**
 * Hook to access subscription state and actions
 * Acts as a compatibility layer for components still using the old hook
 */
export function useSubscription() {
  return useSubscriptionStore();
}