import { render, screen } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { WalletBalanceDisplay } from './WalletBalanceDisplay';
import { 
  useWalletStore,
  // WalletStore is needed for typing the state in mock
  type WalletStore, 
  // initialWalletStateValues can be useful for base mock state
  initialWalletStateValues 
} from '@paynless/store'; 
import type { ApiError, TokenWallet } from '@paynless/types';

// Mock the entire @paynless/store module
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual, // Spread actual exports to keep types, initial values etc.
    useWalletStore: vi.fn(), // Mock only useWalletStore
    // Actual selectors are functions, so they are spread from actual
  };
});

// mockUseWalletStore is now correctly typed as a Vitest mock function
const mockedUseWalletStore = useWalletStore as Mock;

// Helper to create a complete, typed mock state for the wallet store
// This state should mirror the actual WalletStore state structure
const createMockWalletStoreState = (
  overrides: Partial<WalletStore> = {},
  loadPersonalWalletMock?: Mock
): WalletStore => {
  const baseState: WalletStore = {
    ...initialWalletStateValues, // Start with actual initial values
    // Override specific fields relevant to personal wallet display
    personalWallet: null,
    isLoadingPersonalWallet: false,
    personalWalletError: null,
    loadPersonalWallet: loadPersonalWalletMock || vi.fn(() => Promise.resolve()), // Default mock for the action
    // Ensure all other required fields from WalletStore are present, using defaults from initialWalletStateValues
    organizationWallets: {},
    transactionHistory: [],
    isLoadingOrgWallet: {},
    isLoadingHistory: false,
    isLoadingPurchase: false,
    orgWalletErrors: {},
    purchaseError: null,
    // provide stubs for other actions if necessary, though not used by this component directly
    loadOrganizationWallet: vi.fn(() => Promise.resolve()),
    getOrLoadOrganizationWallet: vi.fn(() => Promise.resolve(null)),
    loadTransactionHistory: vi.fn(() => Promise.resolve()),
    initiatePurchase: vi.fn(() => Promise.resolve(null)),
    determineChatWallet: vi.fn(() => ({ outcome: 'use_personal_wallet' })),
    _resetForTesting: vi.fn(),
    ...overrides, // Apply test-specific overrides
  };
  return baseState;
};


describe('WalletBalanceDisplay', () => {
  let mockLoadPersonalWallet: Mock<[], Promise<void>>;

  beforeEach(() => {
    vi.clearAllMocks(); // Clears all mocks, including useWalletStore and any vi.fn() inside states
    mockLoadPersonalWallet = vi.fn(() => Promise.resolve()); // Create a fresh mock for each test
  });

  const setupMockStore = (stateOverrides: Partial<WalletStore>) => {
    const mockState = createMockWalletStoreState(stateOverrides, mockLoadPersonalWallet);
    mockedUseWalletStore.mockImplementation((selectorFn: (state: WalletStore) => any) => {
      return selectorFn(mockState);
    });
  };

  it('should render loading state when isLoadingWallet is true', () => {
    setupMockStore({ isLoadingPersonalWallet: true });
    render(
      <MemoryRouter>
        <WalletBalanceDisplay />
      </MemoryRouter>
    );
    expect(screen.getByText(/Loading wallet balance.../i)).toBeInTheDocument();
    expect(mockLoadPersonalWallet).toHaveBeenCalled();
  });

  it('should render error message if walletError is present', () => {
    const errorMessage = 'Failed to load balance';
    const testError: ApiError = { message: errorMessage, code: 'TEST_ERROR' };
    setupMockStore({ personalWalletError: testError, isLoadingPersonalWallet: false });
    render(
      <MemoryRouter>
        <WalletBalanceDisplay />
      </MemoryRouter>
    );
    expect(screen.getByText(`Error: ${errorMessage}`)).toBeInTheDocument();
    expect(mockLoadPersonalWallet).toHaveBeenCalled();
  });

  it('should render balance when isLoadingWallet is false and balance is available', () => {
    const dateNow = new Date();
    const mockPersonalWallet: TokenWallet = { 
      walletId: 'p-wallet-123', 
      balance: '1000', 
      currency: 'AI_TOKEN', 
      createdAt: dateNow, 
      updatedAt: dateNow
    };
    setupMockStore({ 
      personalWallet: mockPersonalWallet, 
      isLoadingPersonalWallet: false, 
      personalWalletError: null 
    });
    render(
      <MemoryRouter>
        <WalletBalanceDisplay />
      </MemoryRouter>
    );
    expect(screen.getByText(/1,000 Tokens/i)).toBeInTheDocument();
    expect(mockLoadPersonalWallet).toHaveBeenCalled();
  });

  it('should render N/A if balance is not available (personalWallet is null)', () => {
    setupMockStore({ 
      personalWallet: null, 
      isLoadingPersonalWallet: false, 
      personalWalletError: null 
    });
    render(
      <MemoryRouter>
        <WalletBalanceDisplay />
      </MemoryRouter>
    );
    expect(screen.getByText('N/A')).toBeInTheDocument();
    expect(mockLoadPersonalWallet).toHaveBeenCalled();
  });

  it('should render 0 if balance is "0"', () => {
    const dateNow = new Date();
    const mockPersonalWalletZero: TokenWallet = { 
      walletId: 'p-wallet-0', 
      balance: '0', 
      currency: 'AI_TOKEN', 
      createdAt: dateNow,
      updatedAt: dateNow
    }; 
    setupMockStore({ 
      personalWallet: mockPersonalWalletZero, 
      isLoadingPersonalWallet: false, 
      personalWalletError: null 
    });
    render(
      <MemoryRouter>
        <WalletBalanceDisplay />
      </MemoryRouter>
    );
    expect(screen.getByText(/0 Tokens/i)).toBeInTheDocument();
    expect(mockLoadPersonalWallet).toHaveBeenCalled();
  });
}); 