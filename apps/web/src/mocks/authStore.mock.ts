import { vi } from 'vitest';
import { act } from '@testing-library/react';
import type { AuthStore, User, Session, UserProfile, NavigateFunction } from '@paynless/types';

export type MockedUseAuthStoreHook = (<TResult>(
    selector?: (state: AuthStore) => TResult
) => TResult | AuthStore) & {
    getState: () => AuthStore;
    setState: (newState: Partial<AuthStore>) => void;
};

// Reference to the real auth store for integration test sync
let _realAuthStore: { setState: (state: Partial<AuthStore>) => void } | null = null;

// Use the full AuthStore type for the internal state
let internalMockAuthStoreState: AuthStore;

// Initialize all AuthStore properties, with actions as vi.fn()
const initializeMockAuthState = (): AuthStore => ({
  // State properties
  user: null,
  session: null,
  profile: null,
  isLoading: false,
  error: null,
  navigate: null,
  showWelcomeModal: false,

  // Setters
  setUser: vi.fn(),
  setSession: vi.fn(),
  setProfile: vi.fn(),
  setIsLoading: vi.fn(),
  setError: vi.fn(),
  setNavigate: vi.fn(),
  clearError: vi.fn(),
  setShowWelcomeModal: vi.fn((show: boolean) => {
    internalMockAuthStoreState.showWelcomeModal = show;
  }),

  // Core Auth Actions
  login: vi.fn().mockResolvedValue(undefined),
  loginWithGoogle: vi.fn().mockResolvedValue(undefined),
  register: vi.fn().mockResolvedValue(undefined),
  subscribeToNewsletter: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue(null),
  updateEmail: vi.fn().mockResolvedValue(true),
  uploadAvatar: vi.fn().mockResolvedValue(null),
  fetchProfile: vi.fn().mockResolvedValue(null),
  checkEmailExists: vi.fn().mockResolvedValue(false),
  requestPasswordReset: vi.fn().mockResolvedValue(true),
  handleOAuthLogin: vi.fn().mockResolvedValue(undefined),
  updateProfileWithAvatar: vi.fn().mockResolvedValue(undefined),
  updateSubscriptionAndDismissWelcome: vi.fn(),
  toggleNewsletterSubscription: vi.fn().mockResolvedValue(undefined),
  updatePassword: vi.fn().mockResolvedValue(undefined),
  
});

// Initialize the state
internalMockAuthStoreState = initializeMockAuthState();

// Getter for the current state
export const internalMockAuthStoreGetState = (): AuthStore => internalMockAuthStoreState;

/**
 * Captures the real useAuthStore instance (from importOriginal in vi.mock).
 * Call this in vi.mock factories that use importOriginal for @paynless/store.
 * After calling this, every mockSetAuthUser / setState on the mock will
 * also push state to the real store that dialecticStore.ts reads internally.
 * 
 * @example
 * vi.mock('@paynless/store', async (importOriginal) => {
 *   const actual = await importOriginal<typeof import('@paynless/store')>();
 *   captureRealAuthStore(actual.useAuthStore);
 *   return { ...actual, useAuthStore: mockedUseAuthStoreHookLogic };
 * });
 */
export const captureRealAuthStore = (
  realStore: { setState: (state: Partial<AuthStore>) => void },
): void => {
  _realAuthStore = realStore;
};

// The main hook logic, now using AuthStore
export const mockedUseAuthStoreHookLogic: MockedUseAuthStoreHook = <TResult>(
  selector?: (state: AuthStore) => TResult
): TResult | AuthStore => {
  const state = internalMockAuthStoreGetState();
  console.log('[AuthStore Mock] Hook called. Returning profile:', JSON.stringify(state.profile, null, 2));
  return selector ? selector(state) : state;
};

// Attach .getState() to the logic function itself
mockedUseAuthStoreHookLogic.getState = internalMockAuthStoreGetState;
mockedUseAuthStoreHookLogic.setState = (newState: Partial<AuthStore>) => {
    internalMockAuthStoreState = {
        ...internalMockAuthStoreState,
        ...newState,
    };
    // Sync to real auth store if captured (for integration tests using real dialectic store)
    if (_realAuthStore) {
        _realAuthStore.setState(newState);
    }
};

// --- Helper Functions for Test Setup (Update to modify the new internal state structure) ---
export const mockSetAuthUser = (user: User | null) => {
  act(() => {
    mockedUseAuthStoreHookLogic.setState({ user });
  });
};

export const mockSetAuthSession = (session: Session | null) => {
  act(() => {
    mockedUseAuthStoreHookLogic.setState({ session });
  });
};

export const mockSetAuthProfile = (profile: UserProfile | null) => {
  act(() => {
    mockedUseAuthStoreHookLogic.setState({ profile });
  });
};

export const mockSetAuthIsLoading = (isLoading: boolean) => {
  act(() => {
    mockedUseAuthStoreHookLogic.setState({ isLoading });
  });
};

export const mockSetAuthError = (error: Error | null) => {
  act(() => {
    mockedUseAuthStoreHookLogic.setState({ error });
  });
};

export const mockSetAuthNavigate = (navigate: NavigateFunction | null) => {
  act(() => {
    mockedUseAuthStoreHookLogic.setState({ navigate });
  });
};

export const mockSetShowWelcomeModal = (show: boolean) => {
    act(() => {
        mockedUseAuthStoreHookLogic.setState({ showWelcomeModal: show });
    });
};

export const mockUpdateProfile = (profile: UserProfile) => {
  act(() => {
    mockedUseAuthStoreHookLogic.setState({ profile });
  });
};

// --- Reset Function ---
export const resetAuthStoreMock = () => {
  // Re-initialize to get fresh vi.fn() mocks for actions and reset state
  internalMockAuthStoreState = initializeMockAuthState();
  // Clear the captured real store reference
  _realAuthStore = null;
};

// mockAuthStoreActions is no longer strictly necessary if state includes actions,
// but can be kept if direct access to action mocks is preferred by some tests.
// For simplicity, we'll rely on actions being part of the state.
// If needed, it can be reconstructed:
// export const mockAuthStoreActions = {
//   setUser: internalMockAuthStoreState.setUser,
//   setSession: internalMockAuthStoreState.setSession,
//   // ... and so on for all actions
// };

// Note: The previous MockAuthStoreState type is no longer needed.
// The previous mockAuthStoreActions object is also simplified/removed. 

export const useAuthStore: MockedUseAuthStoreHook = mockedUseAuthStoreHookLogic;