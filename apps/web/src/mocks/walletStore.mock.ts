import { vi, type Mock } from 'vitest';
import { 
    initialWalletStateValues, 
    WalletStateValues, 
    WalletActions,
    // OrganizationState can be removed if no longer used here after org mock separation
    // OrganizationState 
} from '@paynless/store';

// Define a type for our mock store state + actions for clarity
export type MockableWalletStore = WalletStateValues & WalletActions;

let currentMockWalletStoreState: MockableWalletStore;

// Exported mock functions so tests can spy on them or set return values
export const mockGetOrLoadOrganizationWallet = vi.fn();
export const mockLoadPersonalWallet = vi.fn();
export const mockDetermineChatWallet = vi.fn();
export const mockResetForTesting = vi.fn(); // This is the store's internal reset, might need a different name if we export a reset for the mock itself
export const mockLoadTransactionHistory = vi.fn();
export const mockInitiatePurchase = vi.fn();
export const mockLoadOrganizationWallet = vi.fn();

// New mock functions for consent
export const mockSetUserOrgTokenConsent = vi.fn();
export const mockLoadUserOrgTokenConsent = vi.fn();
export const mockClearUserOrgTokenConsent = vi.fn();

// Mock for the selector used by aiStore
export const selectActiveChatWalletInfo = vi.fn();

// Helper to initialize/reset the mock state for each test
export const initializeMockWalletStore = (initialState?: Partial<WalletStateValues>) => {
  currentMockWalletStoreState = {
    ...initialWalletStateValues,
    ...initialState, // Allow overriding parts of the initial state
    // Assign mock functions to actions part of the store state
    getOrLoadOrganizationWallet: mockGetOrLoadOrganizationWallet,
    loadPersonalWallet: mockLoadPersonalWallet,
    determineChatWallet: mockDetermineChatWallet,
    _resetForTesting: mockResetForTesting, 
    loadTransactionHistory: mockLoadTransactionHistory,
    initiatePurchase: mockInitiatePurchase,
    loadOrganizationWallet: mockLoadOrganizationWallet,
    // Add new consent actions
    setUserOrgTokenConsent: mockSetUserOrgTokenConsent,
    loadUserOrgTokenConsent: mockLoadUserOrgTokenConsent,
    clearUserOrgTokenConsent: mockClearUserOrgTokenConsent,
    // Ensure all other state value fields are here from mockInitialWalletState or overridden
    personalWallet: initialState?.personalWallet !== undefined ? initialState.personalWallet : null,
    organizationWallets: initialState?.organizationWallets || {},
    transactionHistory: initialState?.transactionHistory || [],
    isLoadingPersonalWallet: initialState?.isLoadingPersonalWallet || false,
    isLoadingOrgWallet: initialState?.isLoadingOrgWallet || {},
    isLoadingHistory: initialState?.isLoadingHistory || false,
    isLoadingPurchase: initialState?.isLoadingPurchase || false,
    personalWalletError: initialState?.personalWalletError !== undefined ? initialState.personalWalletError : null,
    orgWalletErrors: initialState?.orgWalletErrors || {},
    purchaseError: initialState?.purchaseError !== undefined ? initialState.purchaseError : null,
    // currentChatWalletDecision is part of WalletStateValues and will be spread from initialWalletStateValues
    // and then potentially overridden by initialState if provided.
    currentChatWalletDecision: initialState?.currentChatWalletDecision !== undefined 
        ? initialState.currentChatWalletDecision 
        : initialWalletStateValues.currentChatWalletDecision, 
  } as MockableWalletStore;
};

// Initialize with default state once
initializeMockWalletStore();

// --- Mock Selectors ---
export const selectPersonalWallet = (state: MockableWalletStore) => state.personalWallet;
export const selectIsLoadingPersonalWallet = (state: MockableWalletStore) => state.isLoadingPersonalWallet;
export const selectPersonalWalletError = (state: MockableWalletStore) => state.personalWalletError;

export const selectOrganizationWallet = (state: MockableWalletStore, orgId: string) => state.organizationWallets[orgId] || null;
export const selectIsLoadingOrgWallet = (state: MockableWalletStore, orgId: string) => state.isLoadingOrgWallet[orgId] || false;
export const selectOrgWalletError = (state: MockableWalletStore, orgId: string) => state.orgWalletErrors[orgId] || null;
// --- End Mock Selectors ---

// The actual mock implementation for useWalletStore
const getMockState = (): MockableWalletStore => {
  if (!currentMockWalletStoreState) {
      // This should ideally not be hit if initializeMockWalletStore is called in beforeEach
      initializeMockWalletStore(); 
  }
  return currentMockWalletStoreState;
};

const mockStoreHook = (selector?: (state: MockableWalletStore) => unknown) => {
  const state = getMockState();
  if (typeof selector === 'function') {
      return selector(state);
  }
  return state;
};

// Create the vi.fn() mock first
const mockedUseWalletStore = vi.fn(mockStoreHook);

// Define a type for the mock that includes getState
interface ZustandMockWithGetState<TState, TArgs extends unknown[] = unknown[], TReturn = unknown> extends Mock<TArgs, TReturn> {
  getState: () => TState;
}

// Attach getState to the vi.fn() mock.
(mockedUseWalletStore as unknown as ZustandMockWithGetState<MockableWalletStore>).getState = getMockState;

// Export the mocked store hook itself
export const useWalletStore = mockedUseWalletStore as unknown as ZustandMockWithGetState<MockableWalletStore>;

// It's often good practice to also export the actual store if other parts of the mock setup need it
// However, since we are mocking the entire module, we only export what the tests/components will consume from the mock.
// For example, if the actual store had other named exports that WalletSelector might try to use,
// we would need to mock them here as well.
// For now, we assume useWalletStore is the primary export used.

// To make this file the definitive mock for '@paynless/store' when vi.mock is called:
// Vitest will automatically pick up a file in a __mocks__ directory adjacent to the module.
// Since we're using a central 'mocks' folder, we'll explicitly point to this file in the test setup.
// No need for vi.mock('@paynless/store', ...) within this file itself. 

// Removed Organization Store Mocking section 