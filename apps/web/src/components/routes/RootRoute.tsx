import { HomePage } from '../../pages/Home';

// Root route component that handles both authenticated and unauthenticated states
export function RootRoute() {
  // const user = useAuthStore(state => state.user); // No longer needed
  // return user ? <Navigate to="/dashboard" replace /> : <HomePage />;
  // Always render HomePage for the root route
  return <HomePage />;
} 