import { vi } from 'vitest';
import type { AuthStore, User, Session, UserProfile, NavigateFunction } from '@paynless/types';

// Define the shape of our mock AuthStore's state values
type MockAuthStoreState = Pick<AuthStore, 'user' | 'session' | 'profile' | 'isLoading' | 'error' | 'navigate'>;

// Minimal complete initial state for AuthStore (actions will be part of the hook logic or spied)
const initialAuthState: MockAuthStoreState = {
  user: null,
  session: null,
  profile: null,
  isLoading: false,
  error: null,
  navigate: null,
};

let internalMockAuthStoreState: MockAuthStoreState = { ...initialAuthState };

const internalMockAuthStoreGetState = (): MockAuthStoreState => internalMockAuthStoreState;

export const mockedUseAuthStoreHookLogic = <TResult>(
  selector?: (state: MockAuthStoreState) => TResult
): TResult | MockAuthStoreState => {
  const state = internalMockAuthStoreGetState();
  return selector ? selector(state) : state;
};

// Attach .getState() to the logic function itself if tests/selectors expect it on the hook function
// This is primarily for compatibility with how the actual useStore().getState() works.
(mockedUseAuthStoreHookLogic as any).getState = internalMockAuthStoreGetState;

// --- Helper Functions for Test Setup ---
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
  internalMockAuthStoreState = { ...initialAuthState };
};

// Export an object containing all actions, mocked, if direct action calls are needed from tests
// For ChatItem, we mostly care about the state, so this might be overkill for now.
// If actions were dispatched directly from components using useAuthStore.getState().someAction(),
// then those actions would need to be mocked here.
export const mockAuthStoreActions = {
  setUser: vi.fn(),
  setSession: vi.fn(),
  setProfile: vi.fn(),
  setIsLoading: vi.fn(),
  setError: vi.fn(),
  setNavigate: vi.fn(),
  login: vi.fn().mockResolvedValue(undefined),
  register: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue(null),
  updateEmail: vi.fn().mockResolvedValue(true),
  uploadAvatar: vi.fn().mockResolvedValue(null),
  fetchProfile: vi.fn().mockResolvedValue(null),
  checkEmailExists: vi.fn().mockResolvedValue(false),
  requestPasswordReset: vi.fn().mockResolvedValue(true),
  handleOAuthLogin: vi.fn().mockResolvedValue(undefined),
  // clearError is not in AuthStore type
};

// To make the mockedUseAuthStoreHookLogic return actions as well if needed:
// Modify MockAuthStoreState to be the full AuthStore type
// Modify internalMockAuthStoreGetState to return { ...internalMockAuthStoreState, ...mockAuthStoreActions }
// Modify initialAuthState to include all actions from AuthStore, mocked.
// For now, keeping it simple as ChatItem mostly consumes state. 