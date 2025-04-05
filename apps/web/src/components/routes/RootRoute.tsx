import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@paynless/store';
import { HomePage } from '../../pages/Home';

// Root route component that handles both authenticated and unauthenticated states
export function RootRoute() {
  const user = useAuthStore(state => state.user); // Get user state from store
  return user ? <Navigate to="/dashboard" replace /> : <HomePage />;
} 