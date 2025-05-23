import { vi } from 'vitest';
import type { AuthStore, User, Session, UserProfile, NavigateFunction, UserProfileUpdate } from '@paynless/types';

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

  // Setters
  setUser: vi.fn((user: User | null) => { internalMockAuthStoreState.user = user; }),
  setSession: vi.fn((session: Session | null) => { internalMockAuthStoreState.session = session; }),
  setProfile: vi.fn((profile: UserProfile | null) => { internalMockAuthStoreState.profile = profile; }),
  setIsLoading: vi.fn((isLoading: boolean) => { internalMockAuthStoreState.isLoading = isLoading; }),
  setError: vi.fn((error: Error | null) => { internalMockAuthStoreState.error = error; }),
  setNavigate: vi.fn((navigateFn: NavigateFunction) => { internalMockAuthStoreState.navigate = navigateFn; }),

  // Core Auth Actions
  login: vi.fn().mockResolvedValue(undefined),
  register: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue(null as UserProfile | null),
  updateEmail: vi.fn().mockResolvedValue(true),
  uploadAvatar: vi.fn().mockResolvedValue(null as string | null),
  fetchProfile: vi.fn().mockResolvedValue(null as UserProfile | null),
  checkEmailExists: vi.fn().mockResolvedValue(false),
  requestPasswordReset: vi.fn().mockResolvedValue(true),
  handleOAuthLogin: vi.fn().mockResolvedValue(undefined),
});

// Initialize the state
internalMockAuthStoreState = initializeMockAuthState();

// Getter for the current state
export const internalMockAuthStoreGetState = (): AuthStore => internalMockAuthStoreState;

// The main hook logic, now using AuthStore
export const mockedUseAuthStoreHookLogic = <TResult>(
  selector?: (state: AuthStore) => TResult,
  _equalityFn?: (a: TResult, b: TResult) => boolean // Added for zustand spyOn compatibility
): TResult | AuthStore => {
  const state = internalMockAuthStoreGetState();
  return selector ? selector(state) : state;
};

// Attach .getState() to the logic function itself
(mockedUseAuthStoreHookLogic as any).getState = internalMockAuthStoreGetState;

// --- Helper Functions for Test Setup (Update to modify the new internal state structure) ---
export const mockSetAuthUser = (user: User | null) => {
  internalMockAuthStoreState.user = user;
};

export const mockSetAuthSession = (session: Session | null) => {
  internalMockAuthStoreState.session = session;
};

export const mockSetAuthProfile = (profile: UserProfile | null) => {
  internalMockAuthStoreState.profile = profile;
};

export const mockSetAuthIsLoading = (isLoading: boolean) => {
  internalMockAuthStoreState.isLoading = isLoading;
};

export const mockSetAuthError = (error: Error | null) => {
  internalMockAuthStoreState.error = error;
};

export const mockSetAuthNavigate = (navigate: NavigateFunction | null) => {
  internalMockAuthStoreState.navigate = navigate;
};

// --- Reset Function ---
export const resetAuthStoreMock = () => {
  // Re-initialize to get fresh vi.fn() mocks for actions and reset state
  internalMockAuthStoreState = initializeMockAuthState();
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