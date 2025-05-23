import { describe, it, expect, beforeEach, vi, MockedFunction } from 'vitest';
import { useWalletStore, WalletStore, initialWalletStateValues } from './walletStore';
import {
  selectPersonalWalletBalance,
  selectWalletTransactions,
  selectOrganizationWalletBalance,
  selectIsLoadingPersonalWallet,
  selectPersonalWalletError,
  selectIsLoadingOrgWallet,
  selectOrgWalletError,
  selectPersonalWallet,
  selectOrganizationWallet
} from './walletStore.selectors';
import { 
  TokenWallet, 
  TokenWalletTransaction, 
  ApiError, 
  ApiResponse, 
  ErrorResponse, 
  SuccessResponse, 
  PurchaseRequest, 
  PaymentInitiationResult, 
  Organization 
} from '@paynless/types';

// Import the actual api for type casting, and the reset function from our mock file
import { api as actualApiForTyping } from '@paynless/api'; 
import { resetApiMock, MockApi, MockWalletApiClient } from '../../api/src/mocks/api.mock.ts'; // Assuming MockApi type is exported from api.mock.ts

// Import actual stores to get their types, but they will be mocked.
// We will mock their actual source files './aiStore' and './organizationStore' below
// import { useAiStore as actualUseAiStore, useOrganizationStore as actualUseOrganizationStore } from '@paynless/store';

// Import utilities from OUR OWN mock files for AiStore and OrganizationStore
import { 
  getAiStoreState as getMockAiState, 
  resetAiStoreMock,
  mockSetState as mockSetAiState // Provides fine-grained control if needed
} from '../../../apps/web/src/mocks/aiStore.mock';
import { 
  internalMockOrgStoreGetState as getMockOrgState, 
  resetAllStoreMocks as resetOrgAndAuthMocks, // Resets org store mock state
  mockSetCurrentOrganizationDetails,
  mockSetOrgIsLoading,
  createMockActions as createOrgMockActions // Import to provide full action set for OrganizationStore mock
} from '../../../apps/web/src/mocks/organizationStore.mock';
// Import default mock organization to satisfy Organization type
import { defaultMockOrganization } from '../../api/src/mocks/organizations.mock';

// Mock the entire @paynless/api module
vi.mock('@paynless/api', async () => {
  const mockModule = await import('../../api/src/mocks/api.mock.ts');
  return { 
    api: mockModule.api // Ensure this 'api' export from the mock file is what we want
  };
});

// Mock the direct local dependencies of walletStore.ts
vi.mock('./aiStore', () => ({
  useAiStore: {
    getState: vi.fn(() => {
      console.log('****** MEGA DEBUG: ./aiStore MOCK CALLED VIA WALLETSTORE TEST ******');
      const state = getMockAiState();
      console.log('--- AiStore.getState() (./aiStore mock) --- newChatContext:', state.newChatContext);
      return state;
    })
  }
}));

vi.mock('./organizationStore', () => ({
  useOrganizationStore: {
    getState: vi.fn(() => {
      console.log('****** MEGA DEBUG: ./organizationStore MOCK CALLED VIA WALLETSTORE TEST ******');
      const state = {
        ...getMockOrgState(),
        ...createOrgMockActions()
      };
      console.log('--- OrgStore.getState() (./organizationStore mock) --- isLoading:', state.isLoading, 'currentOrg.id:', state.currentOrganizationDetails?.id, 'policy:', state.currentOrganizationDetails?.token_usage_policy);
      return state;
    })
  }
}));

// This api should now be the mocked version due to vi.mock hoisting and execution.
// We will cast it to our MockApi type for TypeScript intellisense and type checking.
import { api as potentiallyMockedApi } from '@paynless/api';
const api = potentiallyMockedApi as unknown as MockApi;

// These are now correctly typed and point to the vi.fn instances within the vi.mock above.
// REMOVED: const mockedUseAiStoreGetState = actualUseAiStore.getState as MockedFunction<typeof actualUseAiStore.getState>;
// REMOVED: const mockedUseOrganizationStoreGetState = actualUseOrganizationStore.getState as MockedFunction<typeof actualUseOrganizationStore.getState>;

// We need top-level variables to assign the specific mock functions for tests.
let mockGetWalletInfo: MockWalletApiClient['getWalletInfo'];
let mockGetWalletTransactionHistory: MockWalletApiClient['getWalletTransactionHistory'];
let mockInitiateTokenPurchase: MockWalletApiClient['initiateTokenPurchase'];

describe('useWalletStore', () => {
  beforeEach(() => { // Top-level beforeEach for all tests in this describe block
    // Reset the store to its initial state before each test
    // REMOVED: useWalletStore.setState(initialWalletStateValues, true); // This was wiping actions
    useWalletStore.getState()._resetForTesting(); // Call the store's own reset method
    resetApiMock(); // Reset our shared mock
    
    // Assign the specific mock functions from the (now correctly typed) imported & mocked api
    mockGetWalletInfo = api.wallet().getWalletInfo;
    mockGetWalletTransactionHistory = api.wallet().getWalletTransactionHistory;
    mockInitiateTokenPurchase = api.wallet().initiateTokenPurchase;
  });

  describe('Initial State', () => {
    it('should initialize with the correct default values', () => {
      const state = useWalletStore.getState();
      expect(state.personalWallet).toBeNull();
      expect(state.organizationWallets).toEqual({});
      expect(state.transactionHistory).toEqual([]);
      expect(state.isLoadingPersonalWallet).toBe(false);
      expect(state.isLoadingOrgWallet).toEqual({});
      expect(state.isLoadingHistory).toBe(false);
      expect(state.isLoadingPurchase).toBe(false);
      expect(state.personalWalletError).toBeNull();
      expect(state.orgWalletErrors).toEqual({});
      expect(state.purchaseError).toBeNull();
    });
  });

  describe('Selectors', () => {
    describe('selectPersonalWalletBalance', () => {
      it("should return null if personalWallet is null", () => {
        useWalletStore.setState({ personalWallet: null });
        const balance = selectPersonalWalletBalance(useWalletStore.getState());
        expect(balance).toBeNull();
      });

      it('should return the balance string if personalWallet exists', () => {
        const mockWallet: TokenWallet = {
          walletId: 'w1', balance: '1000', currency: 'AI_TOKEN',
          createdAt: new Date(), updatedAt: new Date()
        };
        useWalletStore.setState({ personalWallet: mockWallet });
        const balance = selectPersonalWalletBalance(useWalletStore.getState());
        expect(balance).toBe('1000');
      });

      it("should return '0' if personalWallet balance is '0'", () => {
        const mockWallet: TokenWallet = {
          walletId: 'w1', balance: '0', currency: 'AI_TOKEN',
          createdAt: new Date(), updatedAt: new Date()
        };
        useWalletStore.setState({ personalWallet: mockWallet });
        const balance = selectPersonalWalletBalance(useWalletStore.getState());
        expect(balance).toBe('0');
      });
    });

    describe('selectWalletTransactions', () => {
      it('should return an empty array if transactionHistory is empty', () => {
        useWalletStore.setState({ transactionHistory: [] });
        const transactions = selectWalletTransactions(useWalletStore.getState());
        expect(transactions).toEqual([]);
      });

      it('should return the transactionHistory array', () => {
        const mockTransactions: TokenWalletTransaction[] = [
          { transactionId: 't1', walletId: 'w1', type: 'CREDIT_PURCHASE', amount: '100', balanceAfterTxn: '100', recordedByUserId: 'u1', timestamp: new Date() },
          { transactionId: 't2', walletId: 'w1', type: 'DEBIT_USAGE', amount: '10', balanceAfterTxn: '90', recordedByUserId: 'u1', timestamp: new Date() },
        ];
        useWalletStore.setState({ transactionHistory: mockTransactions });
        const transactions = selectWalletTransactions(useWalletStore.getState());
        expect(transactions).toEqual(mockTransactions);
      });
    });

    describe('selectPersonalWallet', () => {
      it('should return the personalWallet object', () => {
        const mockWallet: TokenWallet = { walletId: 'pw1', balance: '50', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date() };
        useWalletStore.setState({ personalWallet: mockWallet });
        expect(selectPersonalWallet(useWalletStore.getState())).toEqual(mockWallet);
      });
      it('should return null if personalWallet is null', () => {
        useWalletStore.setState({ personalWallet: null });
        expect(selectPersonalWallet(useWalletStore.getState())).toBeNull();
      });
    });

    describe('selectOrganizationWallet', () => {
      const orgId = 'orgTest1';
      const mockWallet: TokenWallet = { walletId: 'ow1', organizationId: orgId, balance: '500', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date() };
      it('should return the specific organization wallet object', () => {
        useWalletStore.setState({ organizationWallets: { [orgId]: mockWallet } });
        expect(selectOrganizationWallet(useWalletStore.getState(), orgId)).toEqual(mockWallet);
      });
      it('should return null if the specific organization wallet does not exist', () => {
        useWalletStore.setState({ organizationWallets: {} });
        expect(selectOrganizationWallet(useWalletStore.getState(), orgId)).toBeNull();
      });
    });

    describe('selectOrganizationWalletBalance', () => {
      const orgId = 'orgTest1';
      it("should return '0' if the specific organization wallet does not exist", () => {
        useWalletStore.setState({ organizationWallets: {} });
        const balance = selectOrganizationWalletBalance(useWalletStore.getState(), orgId);
        expect(balance).toBe('0');
      });
      it('should return the balance string if the specific organization wallet exists', () => {
        const mockWallet: TokenWallet = { walletId: 'ow1', organizationId: orgId, balance: '5000', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date() };
        useWalletStore.setState({ organizationWallets: { [orgId]: mockWallet } });
        const balance = selectOrganizationWalletBalance(useWalletStore.getState(), orgId);
        expect(balance).toBe('5000');
      });
    });

    describe('selectIsLoadingPersonalWallet', () => {
      it('should return the isLoadingPersonalWallet state', () => {
        useWalletStore.setState({ isLoadingPersonalWallet: true });
        expect(selectIsLoadingPersonalWallet(useWalletStore.getState())).toBe(true);
        useWalletStore.setState({ isLoadingPersonalWallet: false });
        expect(selectIsLoadingPersonalWallet(useWalletStore.getState())).toBe(false);
      });
    });

    describe('selectPersonalWalletError', () => {
      it('should return the personalWalletError object', () => {
        const mockError: ApiError = { code: 'ERR', message: 'Personal error' };
        useWalletStore.setState({ personalWalletError: mockError });
        expect(selectPersonalWalletError(useWalletStore.getState())).toEqual(mockError);
      });
      it('should return null if personalWalletError is null', () => {
        useWalletStore.setState({ personalWalletError: null });
        expect(selectPersonalWalletError(useWalletStore.getState())).toBeNull();
      });
    });

    describe('selectIsLoadingOrgWallet', () => {
      const orgId = 'orgLoadTest';
      it('should return true if the specific org wallet is loading', () => {
        useWalletStore.setState({ isLoadingOrgWallet: { [orgId]: true } });
        expect(selectIsLoadingOrgWallet(useWalletStore.getState(), orgId)).toBe(true);
      });
      it('should return false if the specific org wallet is not loading', () => {
        useWalletStore.setState({ isLoadingOrgWallet: { [orgId]: false } });
        expect(selectIsLoadingOrgWallet(useWalletStore.getState(), orgId)).toBe(false);
      });
      it('should return false if the orgId is not in isLoadingOrgWallet map', () => {
        useWalletStore.setState({ isLoadingOrgWallet: {} });
        expect(selectIsLoadingOrgWallet(useWalletStore.getState(), orgId)).toBe(false);
      });
    });

    describe('selectOrgWalletError', () => {
      const orgId = 'orgErrTest';
      const mockError: ApiError = { code: 'ORG_ERR', message: 'Org error' };
      it('should return the error object for the specific org wallet', () => {
        useWalletStore.setState({ orgWalletErrors: { [orgId]: mockError } });
        expect(selectOrgWalletError(useWalletStore.getState(), orgId)).toEqual(mockError);
      });
      it('should return null if there is no error for the specific org wallet', () => {
        useWalletStore.setState({ orgWalletErrors: { [orgId]: null } });
        expect(selectOrgWalletError(useWalletStore.getState(), orgId)).toBeNull();
      });
      it('should return null if the orgId is not in orgWalletErrors map', () => {
        useWalletStore.setState({ orgWalletErrors: {} });
        expect(selectOrgWalletError(useWalletStore.getState(), orgId)).toBeNull();
      });
    });

    describe('determineChatWallet', () => {
      beforeEach(() => {
        resetAiStoreMock();
        resetOrgAndAuthMocks(); 
        // REMOVED: mockedUseAiStoreGetState.mockImplementation(...);
        // REMOVED: mockedUseOrganizationStoreGetState.mockImplementation(...);
        // Reset relevant parts of the mock stores before each determineChatWallet test
        resetOrgAndAuthMocks(); // This should reset organizationStore mock state including details and loading
        // Ensure personal wallet is null by default for these tests unless specified
        useWalletStore.setState({ personalWallet: null });
      });

      it('should return loading outcome if org details are loading for a specific org context', () => {
        mockSetAiState({ newChatContext: 'org123' });
        mockSetOrgIsLoading(true);
        mockSetCurrentOrganizationDetails({ ...defaultMockOrganization, id: 'org123' } as Organization);
        
        // ***** START PRE-CALL DEBUG LOGS *****
        const preAiState = getMockAiState();
        const preOrgState = getMockOrgState();
        console.log('PRE-CALL DEBUG - Ai State newChatContext:', preAiState.newChatContext);
        console.log('PRE-CALL DEBUG - Org State isLoading:', preOrgState.isLoading);
        console.log('PRE-CALL DEBUG - Org State currentOrgId:', preOrgState.currentOrganizationDetails?.id);
        console.log('PRE-CALL DEBUG - Org State currentOrg token_usage_policy:', preOrgState.currentOrganizationDetails?.token_usage_policy);
        // ***** END PRE-CALL DEBUG LOGS *****

        const result = useWalletStore.getState().determineChatWallet();
        expect(result).toEqual({ outcome: 'loading' });
      });

      it('should return use_personal_wallet if newChatContext is null', () => {
        mockSetAiState({ newChatContext: null });
        const result = useWalletStore.getState().determineChatWallet();
        expect(result).toEqual({ outcome: 'use_personal_wallet' });
      });

      it('should return error if org details are not available or not matching context for a specific orgId', () => {
        mockSetAiState({ newChatContext: 'org123' });
        mockSetCurrentOrganizationDetails(null);
        mockSetOrgIsLoading(false);
        let result = useWalletStore.getState().determineChatWallet();
        expect(result.outcome).toBe('error');
        if (result.outcome === 'error') {
          expect(result.message).toBe('Organization details for org123 not available or not matching context.');
        }

        // Case: Org details available but ID does not match newChatContext
        mockSetCurrentOrganizationDetails({ ...defaultMockOrganization, id: 'org456' } as Organization);
        result = useWalletStore.getState().determineChatWallet();
        expect(result.outcome).toBe('error');
        if (result.outcome === 'error') {
          expect(result.message).toBe('Organization details for org123 not available or not matching context.');
        }
      });

      it("should return org_wallet_not_available_policy_org if policy is 'organization_tokens'", () => {
        mockSetAiState({ newChatContext: 'org123' });
        mockSetCurrentOrganizationDetails({
            ...defaultMockOrganization,
            id: 'org123',
            token_usage_policy: 'organization_tokens' 
        } as Organization);
        mockSetOrgIsLoading(false);
        // Personal wallet exists but has no balance
        useWalletStore.setState({
          personalWallet: { walletId: 'pw', balance: '0', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date() }, 
          organizationWallets: {}
        });

        const result = useWalletStore.getState().determineChatWallet();
        expect(result.outcome).toBe('org_wallet_not_available_policy_org');
      });

      it("should return user_consent_required if policy is 'member_tokens'", () => {
        mockSetAiState({ newChatContext: 'org123' });
        mockSetCurrentOrganizationDetails({
            ...defaultMockOrganization,
            id: 'org123',
            token_usage_policy: 'member_tokens' 
        } as Organization);
        mockSetOrgIsLoading(false);
        useWalletStore.setState({ 
          personalWallet: { walletId: 'pw', balance: '100', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date() },
          organizationWallets: {}
        });
        const result = useWalletStore.getState().determineChatWallet();
        expect(result.outcome).toBe('user_consent_required');
      });

      it('should return error for unexpected token_usage_policy', () => {
        mockSetAiState({ newChatContext: 'org123' });
        mockSetCurrentOrganizationDetails({
            ...defaultMockOrganization,
            id: 'org123',
            token_usage_policy: 'unexpected_policy' as any // Cast to any to test unexpected policy
        } as Organization);
        mockSetOrgIsLoading(false);
        const result = useWalletStore.getState().determineChatWallet();
        expect(result.outcome).toBe('error');
        if (result.outcome === 'error') {
          expect(result.message).toContain('Unexpected token usage policy');
        }
      });
    });
  });

  // Action tests will be added here later, they will require mocking the api.wallet() calls.
  // e.g., loadWallet, loadTransactionHistory, initiatePurchase

  describe('Actions', () => {
    describe('loadPersonalWallet', () => {
      const mockPersonalWallet: TokenWallet = {
        walletId: 'personal-wallet-id',
        userId: 'user-123',
        balance: '5000',
        currency: 'AI_TOKEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      it('should load a personal wallet successfully', async () => {
        const response: SuccessResponse<TokenWallet | null> = { data: mockPersonalWallet, error: undefined, status: 200 };
        mockGetWalletInfo.mockResolvedValue(response as ApiResponse<TokenWallet | null>);

        await useWalletStore.getState().loadPersonalWallet();

        const state = useWalletStore.getState();
        expect(mockGetWalletInfo).toHaveBeenCalledWith(null);
        expect(state.isLoadingPersonalWallet).toBe(false);
        expect(state.personalWallet).toEqual(mockPersonalWallet);
        expect(state.personalWalletError).toBeNull();
      });

      it('should handle API error when loading personal wallet', async () => {
        const apiError: ApiError = { message: 'API Error', code: 'INTERNAL_SERVER_ERROR' }; 
        const response: ErrorResponse = { data: undefined, error: apiError, status: 500 }; 
        mockGetWalletInfo.mockResolvedValue(response as ApiResponse<TokenWallet | null>);

        await useWalletStore.getState().loadPersonalWallet();

        const state = useWalletStore.getState();
        expect(state.isLoadingPersonalWallet).toBe(false);
        expect(state.personalWallet).toBeNull();
        expect(state.personalWalletError).toEqual(expect.objectContaining(apiError));
      });

      it('should handle personal wallet not found (API returns null data, no error)', async () => {
        const response: SuccessResponse<null> = { data: null, error: undefined, status: 200 };
        mockGetWalletInfo.mockResolvedValue(response as ApiResponse<TokenWallet | null>);

        await useWalletStore.getState().loadPersonalWallet();

        const state = useWalletStore.getState();
        expect(state.isLoadingPersonalWallet).toBe(false);
        expect(state.personalWallet).toBeNull();
        expect(state.personalWalletError).toBeNull();
      });

      it('should set isLoadingPersonalWallet to true during fetch and false afterwards', async () => {
        const response: SuccessResponse<TokenWallet | null> = { data: mockPersonalWallet, error: undefined, status: 200 };
        mockGetWalletInfo.mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve(response as ApiResponse<TokenWallet | null>), 0))
        );
        
        const loadPromise = useWalletStore.getState().loadPersonalWallet();
        expect(useWalletStore.getState().isLoadingPersonalWallet).toBe(true);

        await loadPromise;
        expect(useWalletStore.getState().isLoadingPersonalWallet).toBe(false);
      });
    });

    describe('loadOrganizationWallet', () => {
      const orgId = 'org-abc';
      const mockOrgWallet: TokenWallet = {
        walletId: 'org-wallet-id',
        organizationId: orgId,
        balance: '100000',
        currency: 'AI_TOKEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      it('should load an organization wallet successfully', async () => {
        const response: SuccessResponse<TokenWallet | null> = { data: mockOrgWallet, error: undefined, status: 200 };
        mockGetWalletInfo.mockResolvedValue(response as ApiResponse<TokenWallet | null>);

        await useWalletStore.getState().loadOrganizationWallet(orgId);

        const state = useWalletStore.getState();
        expect(mockGetWalletInfo).toHaveBeenCalledWith(orgId);
        expect(state.isLoadingOrgWallet[orgId]).toBe(false);
        expect(state.organizationWallets[orgId]).toEqual(mockOrgWallet);
        expect(state.orgWalletErrors[orgId]).toBeNull();
      });

      it('should handle API error when loading an organization wallet', async () => {
        const apiError: ApiError = { message: 'Org API Error', code: 'ORG_SERVER_ERROR' };
        const response: ErrorResponse = { data: undefined, error: apiError, status: 500 };
        mockGetWalletInfo.mockResolvedValue(response as ApiResponse<TokenWallet | null>);

        await useWalletStore.getState().loadOrganizationWallet(orgId);

        const state = useWalletStore.getState();
        expect(state.isLoadingOrgWallet[orgId]).toBe(false);
        expect(state.organizationWallets[orgId]).toBeNull();
        expect(state.orgWalletErrors[orgId]).toEqual(expect.objectContaining(apiError));
      });

      it('should handle organization wallet not found (API returns null data, no error)', async () => {
        const response: SuccessResponse<null> = { data: null, error: undefined, status: 200 };
        mockGetWalletInfo.mockResolvedValue(response as ApiResponse<TokenWallet | null>);

        await useWalletStore.getState().loadOrganizationWallet(orgId);

        const state = useWalletStore.getState();
        expect(state.isLoadingOrgWallet[orgId]).toBe(false);
        expect(state.organizationWallets[orgId]).toBeNull();
        expect(state.orgWalletErrors[orgId]).toBeNull();
      });

      it('should set isLoadingOrgWallet[orgId] to true during fetch and false afterwards', async () => {
        const response: SuccessResponse<TokenWallet | null> = { data: mockOrgWallet, error: undefined, status: 200 };
        mockGetWalletInfo.mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve(response as ApiResponse<TokenWallet | null>), 0))
        );

        const loadPromise = useWalletStore.getState().loadOrganizationWallet(orgId);
        expect(useWalletStore.getState().isLoadingOrgWallet[orgId]).toBe(true);

        await loadPromise;
        expect(useWalletStore.getState().isLoadingOrgWallet[orgId]).toBe(false);
      });
    });

    describe('getOrLoadOrganizationWallet', () => {
      const orgId = 'org-get-load';
      const mockOrgWallet: TokenWallet = {
        walletId: 'org-gl-wallet-id',
        organizationId: orgId,
        balance: '75000',
        currency: 'AI_TOKEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      it('should return existing wallet if already loaded', async () => {
        useWalletStore.setState(state => ({
          organizationWallets: { ...state.organizationWallets, [orgId]: mockOrgWallet },
        }));
        mockGetWalletInfo.mockClear(); // Ensure loadOrganizationWallet is not called

        const wallet = await useWalletStore.getState().getOrLoadOrganizationWallet(orgId);
        expect(wallet).toEqual(mockOrgWallet);
        expect(mockGetWalletInfo).not.toHaveBeenCalled();
      });

      it('should call loadOrganizationWallet and return the wallet if not loaded', async () => {
        const response: SuccessResponse<TokenWallet | null> = { data: mockOrgWallet, error: undefined, status: 200 };
        mockGetWalletInfo.mockResolvedValue(response as ApiResponse<TokenWallet | null>);
        
        // Ensure wallet is not in state initially by setting to null or ensuring key is absent
        useWalletStore.setState(state => ({
          organizationWallets: { ...state.organizationWallets, [orgId]: null }, // Changed undefined to null
          isLoadingOrgWallet: { ...state.isLoadingOrgWallet, [orgId]: false }
        }));

        const wallet = await useWalletStore.getState().getOrLoadOrganizationWallet(orgId);

        expect(mockGetWalletInfo).toHaveBeenCalledWith(orgId);
        expect(wallet).toEqual(mockOrgWallet);
        expect(useWalletStore.getState().organizationWallets[orgId]).toEqual(mockOrgWallet);
      });

      it('should call loadOrganizationWallet if wallet is not loaded, even if an error occurs', async () => {
        const apiError: ApiError = { message: 'Load Error', code: 'LOAD_ERR' };
        const response: ErrorResponse = { data: undefined, error: apiError, status: 500 };
        mockGetWalletInfo.mockResolvedValue(response as ApiResponse<TokenWallet | null>);

        useWalletStore.setState(state => ({
          organizationWallets: { ...state.organizationWallets, [orgId]: null }, // Changed undefined to null
          isLoadingOrgWallet: { ...state.isLoadingOrgWallet, [orgId]: false }
        }));

        const wallet = await useWalletStore.getState().getOrLoadOrganizationWallet(orgId);

        expect(mockGetWalletInfo).toHaveBeenCalledWith(orgId);
        expect(wallet).toBeNull(); // loadOrganizationWallet would set it to null on error
        expect(useWalletStore.getState().organizationWallets[orgId]).toBeNull();
        expect(useWalletStore.getState().orgWalletErrors[orgId]).toEqual(apiError);
      });

      // Current implementation re-triggers load even if isLoading is true.
      // This test verifies that behavior. A more advanced implementation might return a promise or subscribe.
      it('should re-call loadOrganizationWallet if called while already loading (current behavior)', async () => {
        const response: SuccessResponse<TokenWallet | null> = { data: mockOrgWallet, error: undefined, status: 200 };
        // Use mockImplementationOnce to return a Promise that resolves later
        mockGetWalletInfo.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(response as ApiResponse<TokenWallet | null>), 50)))
                         .mockResolvedValueOnce(response as ApiResponse<TokenWallet | null>); // Second call resolves immediately with the value

        useWalletStore.setState(state => ({
            organizationWallets: { ...state.organizationWallets, [orgId]: null }, // Changed undefined to null
            isLoadingOrgWallet: { ...state.isLoadingOrgWallet, [orgId]: true } // Simulate already loading
        }));
        
        // First call (simulates call while loading)
        const walletPromise = useWalletStore.getState().getOrLoadOrganizationWallet(orgId);
        // loadOrganizationWallet will be called by getOrLoad. Let it run.
        
        // The implementation of getOrLoadOrganizationWallet awaits its internal call to loadOrganizationWallet,
        // so the mockGetWalletInfo should have been called.
        await walletPromise;

        expect(mockGetWalletInfo).toHaveBeenCalledWith(orgId);
        // Depending on timing and specific mock setup, it might be called once or twice.
        // The key is that it *is* called even if isLoadingOrgWallet was initially true.
        // For this test, verifying it was called at least once is sufficient to show it proceeds to load.
        expect(mockGetWalletInfo.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(useWalletStore.getState().organizationWallets[orgId]).toEqual(mockOrgWallet);
      });
    });

    describe('loadTransactionHistory', () => {
      const mockTransactions: TokenWalletTransaction[] = [
        { transactionId: 't1', walletId: 'w1', type: 'CREDIT_PURCHASE', amount: '100', balanceAfterTxn: '100', recordedByUserId: 'u1', timestamp: new Date() },
        { transactionId: 't2', walletId: 'w1', type: 'DEBIT_USAGE', amount: '10', balanceAfterTxn: '90', recordedByUserId: 'u1', timestamp: new Date() },
      ];
      const orgId = 'org-xyz';
      const limit = 10;
      const offset = 5;

      it('should load transaction history successfully for personal wallet', async () => {
        const response: SuccessResponse<TokenWalletTransaction[]> = { data: mockTransactions, error: undefined, status: 200 };
        mockGetWalletTransactionHistory.mockResolvedValue(response as ApiResponse<TokenWalletTransaction[]>);

        await useWalletStore.getState().loadTransactionHistory();

        const state = useWalletStore.getState();
        expect(mockGetWalletTransactionHistory).toHaveBeenCalledWith(undefined, undefined, undefined);
        expect(state.isLoadingHistory).toBe(false);
        expect(state.transactionHistory).toEqual(mockTransactions);
        expect(state.personalWalletError).toBeNull();
      });

      it('should load transaction history successfully for an organization wallet with pagination', async () => {
        const response: SuccessResponse<TokenWalletTransaction[]> = { data: mockTransactions, error: undefined, status: 200 };
        mockGetWalletTransactionHistory.mockResolvedValue(response as ApiResponse<TokenWalletTransaction[]>);

        await useWalletStore.getState().loadTransactionHistory(orgId, limit, offset);

        const state = useWalletStore.getState();
        expect(mockGetWalletTransactionHistory).toHaveBeenCalledWith(orgId, limit, offset);
        expect(state.isLoadingHistory).toBe(false);
        expect(state.transactionHistory).toEqual(mockTransactions);
        expect(state.personalWalletError).toBeNull();
      });

      it('should handle API error when loading transaction history', async () => {
        const apiError: ApiError = { message: 'History API Error', code: 'HISTORY_FETCH_FAILED' }; 
        const response: ErrorResponse = { data: undefined, error: apiError, status: 500 }; 
        mockGetWalletTransactionHistory.mockResolvedValue(response as ApiResponse<TokenWalletTransaction[]>);

        await useWalletStore.getState().loadTransactionHistory();

        const state = useWalletStore.getState();
        expect(state.isLoadingHistory).toBe(false);
        expect(state.transactionHistory).toEqual([]);
        expect(state.personalWalletError).toEqual(expect.objectContaining(apiError));
      });

      it('should handle empty transaction history (API returns empty array)', async () => {
        const response: SuccessResponse<TokenWalletTransaction[]> = { data: [], error: undefined, status: 200 };
        mockGetWalletTransactionHistory.mockResolvedValue(response as ApiResponse<TokenWalletTransaction[]>);

        await useWalletStore.getState().loadTransactionHistory();

        const state = useWalletStore.getState();
        expect(state.isLoadingHistory).toBe(false);
        expect(state.transactionHistory).toEqual([]);
        expect(state.personalWalletError).toBeNull();
      });

      it('should handle history not found (API returns null data, no error)', async () => {
        const response: SuccessResponse<null> = { data: null, error: undefined, status: 200 };
        mockGetWalletTransactionHistory.mockResolvedValue(response as unknown as ApiResponse<TokenWalletTransaction[]>);

        await useWalletStore.getState().loadTransactionHistory();

        const state = useWalletStore.getState();
        expect(state.isLoadingHistory).toBe(false);
        expect(state.transactionHistory).toEqual([]);
        expect(state.personalWalletError).toEqual(expect.objectContaining({ message: 'Failed to fetch transaction history: No data returned', code: 'NOT_FOUND' }));
      });

      it('should set isLoadingHistory to true during fetch and false afterwards', async () => {
        const response: SuccessResponse<TokenWalletTransaction[]> = { data: mockTransactions, error: undefined, status: 200 };
        mockGetWalletTransactionHistory.mockResolvedValue(response as ApiResponse<TokenWalletTransaction[]>);
        
        const loadPromise = useWalletStore.getState().loadTransactionHistory();
        expect(useWalletStore.getState().isLoadingHistory).toBe(true);

        await loadPromise;
        expect(useWalletStore.getState().isLoadingHistory).toBe(false);
      });
    });

    describe('initiatePurchase', () => {
      const mockPurchaseRequest: PurchaseRequest = {
        itemId: 'test_item_1000_tokens',
        quantity: 1,
        paymentGatewayId: 'stripe',
        currency: 'USD',
        userId: 'test-user-id',
        // organizationId would typically be set by the backend or context
      };

      const mockPaymentInitiationResult: PaymentInitiationResult = {
        success: true,
        transactionId: 'txn_123',
        paymentGatewayTransactionId: 'pi_stripe_123',
        redirectUrl: 'https://stripe.com/pay/session_123',
      };

      it('should initiate purchase successfully and return initiation result', async () => {
        const response: SuccessResponse<PaymentInitiationResult | null> = { data: mockPaymentInitiationResult, error: undefined, status: 200 };
        mockInitiateTokenPurchase.mockResolvedValue(response as ApiResponse<PaymentInitiationResult | null>);

        const result = await useWalletStore.getState().initiatePurchase(mockPurchaseRequest);

        const state = useWalletStore.getState();
        expect(mockInitiateTokenPurchase).toHaveBeenCalledWith(mockPurchaseRequest);
        expect(state.isLoadingPurchase).toBe(false);
        expect(state.purchaseError).toBeNull();
        expect(result).toEqual(mockPaymentInitiationResult);
      });

      it('should handle API error during purchase initiation and return null', async () => {
        const apiError: ApiError = { message: 'Purchase Failed', code: 'PURCHASE_ERROR' };
        const response: ErrorResponse = { data: undefined, error: apiError, status: 500 };
        mockInitiateTokenPurchase.mockResolvedValue(response as ApiResponse<PaymentInitiationResult | null>);

        const result = await useWalletStore.getState().initiatePurchase(mockPurchaseRequest);

        const state = useWalletStore.getState();
        expect(state.isLoadingPurchase).toBe(false);
        expect(state.purchaseError).toEqual(expect.objectContaining(apiError));
        expect(result).toBeNull();
      });

      it('should handle null data from API (e.g., specific non-error failure) and return null', async () => {
        mockInitiateTokenPurchase.mockResolvedValue({ success: false, data: null, error: null } as unknown as ApiResponse<PaymentInitiationResult | null>);

        const result = await useWalletStore.getState().initiatePurchase(mockPurchaseRequest);

        const state = useWalletStore.getState();
        expect(state.isLoadingPurchase).toBe(false);
        expect(state.purchaseError).toEqual(expect.objectContaining({ message: 'Failed to initiate purchase: No initiation data returned from API', code: 'NO_DATA_FROM_API'}));
        expect(result).toBeNull();
      });

      it('should set isLoadingPurchase to true during fetch and false afterwards', async () => {
        const response: SuccessResponse<PaymentInitiationResult | null> = { data: mockPaymentInitiationResult, error: undefined, status: 200 };
        mockInitiateTokenPurchase.mockResolvedValue(response as ApiResponse<PaymentInitiationResult | null>);
        
        const purchasePromise = useWalletStore.getState().initiatePurchase(mockPurchaseRequest);
        expect(useWalletStore.getState().isLoadingPurchase).toBe(true);

        await purchasePromise;
        expect(useWalletStore.getState().isLoadingPurchase).toBe(false);
      });
    });
  });
}); 