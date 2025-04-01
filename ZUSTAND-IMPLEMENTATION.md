# Zustand Implementation Guide

## Overview

This document outlines the implementation of Zustand for state management in our application, with a focus on robust authentication and session handling.

## Why Zustand?

1. **Lightweight**: Zustand is a minimal state management solution with a small footprint
2. **Simple API**: Easy to learn and use with minimal boilerplate
3. **Middleware Support**: Built-in persistence with `persist` middleware
4. **TypeScript Support**: Excellent TypeScript integration
5. **Performance**: Uses the React concurrent mode friendly `useSyncExternalStore`

## Key Components

### Authentication Store

The `authStore.ts` file defines our authentication state using Zustand:

```typescript
// src/store/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AuthState, User, Session } from '../types/auth.types';
import { authService } from '../services/auth';

interface AuthStore extends AuthState {
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  login: (email: string, password: string) => Promise<User | null>;
  // ... other methods
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // state and methods
    }),
    {
      name: 'auth-storage', // localStorage key
      partialize: (state) => ({ user: state.user, session: state.session }),
    }
  )
);
```

### Subscription Store

The `subscriptionStore.ts` file manages subscription state using Zustand:

```typescript
// src/store/subscriptionStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SubscriptionPlan, UserSubscription } from '../types/subscription.types';
import { subscriptionService } from '../services/subscription.service';

interface SubscriptionStore {
  userSubscription: UserSubscription | null;
  availablePlans: SubscriptionPlan[];
  isSubscriptionLoading: boolean;
  hasActiveSubscription: boolean;
  // ... state properties
  
  // API actions
  refreshSubscription: () => Promise<void>;
  createCheckoutSession: (priceId: string, successUrl: string, cancelUrl: string) => Promise<string | null>;
  // ... other methods
}

export const useSubscriptionStore = create<SubscriptionStore>()(
  persist(
    (set, get) => ({
      // state and methods that interact with subscription services
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
```

### Session Management Hook

The `useAuthSession` hook manages automatic token refreshes:

```typescript
// src/hooks/useAuthSession.ts
export const useAuthSession = () => {
  const { session, refreshSession } = useAuthStore();
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Set up refresh timer based on session expiry
  useEffect(() => {
    // ... timer setup logic
  }, [session, refreshSession]);
  
  return { isAuthenticated: !!session, session, refreshSession };
};
```

### Global Refresh Integration

The App component integrates with the BaseApiClient by exposing the refresh handler globally:

```typescript
// src/App.tsx
function App() {
  const { initialize, refreshSession } = useAuthStore();
  
  // Register global refresh handler
  useEffect(() => {
    window.__AUTH_STORE_REFRESH_SESSION = async () => {
      try {
        return await refreshSession();
      } catch (error) {
        return false;
      }
    };
    
    return () => {
      delete window.__AUTH_STORE_REFRESH_SESSION;
    };
  }, [refreshSession]);
  
  // ...
}
```

### API Client Integration

The BaseApiClient has been updated to work with Zustand:

```typescript
// In response interceptor
if (error.response?.status === 401) {
  // First try to use the global refresh handler
  if (window.__AUTH_STORE_REFRESH_SESSION) {
    const refreshSuccessful = await window.__AUTH_STORE_REFRESH_SESSION();
    if (refreshSuccessful) {
      // Retry original request with new token
    }
  }
  
  // Fall back to direct refresh if needed
}
```

## Implementation Steps

1. **Create Auth Store**: Implement the authentication store with Zustand
2. **Setup Session Types**: Define proper types for auth session
3. **Persist Middleware**: Add persistence to keep authentication state
4. **Auto-Refresh Mechanism**: Implement token refreshing based on expiry time
5. **Error Handling**: Add robust error handling for failed requests
6. **Global Integration**: Connect the store to API client for authentication
7. **Redirect Logic**: Properly handle redirects after auth state changes

### 5. Subscription Store Implementation

1. **Create the Subscription Store**:
   - Define the subscription state interface
   - Implement state getters and setters
   - Create API-calling actions that interact with the subscription service
   - Use Zustand's persist middleware to maintain subscription data across page reloads

2. **Add User-Based Subscription Loading**:
   - Subscribe to auth store changes to load subscription data when user changes
   - Clear subscription data on logout
   - Automatically refresh subscription data when needed

3. **Create Compatibility Layer**:
   - Update the existing `useSubscription` hook to return the Zustand store
   - This allows existing components to continue working without changes
   - Remove the context-based subscription provider from the application

## Benefits of This Approach

1. **Single Source of Truth**: Authentication state is managed in one place
2. **Persistence**: State is automatically persisted across page reloads
3. **Auto-Refresh**: Tokens are refreshed before they expire
4. **Error Recovery**: Robust handling of authentication errors
5. **Cross-Component Access**: Any component can access auth state directly
6. **Reactive Updates**: Components automatically update when auth state changes
7. **Coordinated State Management**: Authentication and subscription states work together seamlessly, with subscription data loading automatically when user state changes.

## Usage Examples

### Authentication Check in Components

```typescript
function ProfilePage() {
  const { user, isLoading } = useAuthStore();
  
  if (isLoading) return <Spinner />;
  if (!user) return <Redirect to="/login" />;
  
  return <Profile user={user} />;
}
```

### Making Authenticated Requests

```typescript
function SettingsPage() {
  const { session } = useAuthStore();
  
  const updateSettings = async (settings) => {
    // API client handles token automatically
    const response = await settingsApiClient.updateSettings(settings);
    // ...
  };
  
  // ...
}
```

### Logout Handling

```typescript
function NavBar() {
  const { logout } = useAuthStore();
  
  const handleLogout = async () => {
    await logout();
    // Redirect happens automatically after state update
  };
  
  // ...
}
```

### Checking Subscription Status

```jsx
import { useSubscription } from '../hooks/useSubscription';

function SubscriptionCheck() {
  const { hasActiveSubscription, isSubscriptionLoading } = useSubscription();
  
  if (isSubscriptionLoading) {
    return <div>Loading subscription status...</div>;
  }
  
  return (
    <div>
      {hasActiveSubscription 
        ? 'You have an active subscription!' 
        : 'You need to subscribe to access this content.'}
    </div>
  );
}
```

## Best Practices

1. **Selective Persistence**: Only persist essential data (user, session)
2. **Proper Cleanup**: Always clean up timers and event listeners
3. **Error Handling**: Implement proper error handling for all async operations
4. **Type Safety**: Use TypeScript to ensure type safety throughout
5. **State Normalization**: Keep state normalized and minimal
6. **Logging**: Add comprehensive logging for debugging
7. **Security**: Never store sensitive information in state 