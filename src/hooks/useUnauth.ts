import { useContext } from 'react';
import { UnauthContext } from '../context/unauth.context';

/**
 * Hook to access unauthenticated operations context
 */
export function useUnauth() {
  const context = useContext(UnauthContext);
  
  if (context === undefined) {
    throw new Error('useUnauth must be used within an UnauthProvider');
  }
  
  return context;
} 