import { useContext } from 'react';
import { SubscriptionContext } from '../context/SubscriptionContext';
import { SubscriptionContextType } from '../types/subscription.types';

export const useSubscription = (): SubscriptionContextType => {
  const context = useContext(SubscriptionContext);
  
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  
  return context;
};