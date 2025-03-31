import { useContext } from 'react';
import { SubscriptionContext } from '../context/subscription.context';

/**
 * Hook to access subscription context
 */
export function useSubscription() {
  const context = useContext(SubscriptionContext);
  
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  
  return context;
}