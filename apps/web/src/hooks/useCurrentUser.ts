import { useAuthStore } from '@paynless/store';
// Remove Supabase User type if not directly needed, or keep if profile structure matches
// import { User } from '@supabase/supabase-js';

// Use the UserProfile type from the store if available and preferred
// Or adjust the return type based on what authStore actually provides
import type { UserProfile } from '@paynless/types'; // Assuming this path is correct

// Remove placeholder TODO comments
// interface UseCurrentUserReturn {
//   user: User | null; // Keep Supabase User type?
//   // Add other relevant user state/functions if needed, e.g., isLoading
// }

// Updated return type to match store structure (adjust as needed)
interface UseCurrentUserReturn {
  user: UserProfile | null; // Use UserProfile or the actual type from store
  isLoading: boolean; // Reflect loading state from store
}

/**
 * Hook to provide current user information from the auth store.
 */
export const useCurrentUser = (): UseCurrentUserReturn => {
  // Retrieve user and loading state from the Zustand auth store
  const user = useAuthStore((state) => state.profile);
  const isLoading = useAuthStore((state) => state.isLoading); // Or appropriate loading state

  // Return the user profile and loading status
  return { user, isLoading };

  // Example: return a static mock user for now
  // const mockUser: User = {
  //   id: 'mock-user-id',
  //   app_metadata: {}, 
  //   user_metadata: { name: 'Mock User' },
  //   aud: 'authenticated',
  //   created_at: new Date().toISOString(),
  // };
  // return { user: mockUser };

  // Or return null if no user is assumed initially
  // return { user: null }; 
}; 