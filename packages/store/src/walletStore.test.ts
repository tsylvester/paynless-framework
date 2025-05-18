import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWalletStore, WalletStore } from './walletStore.ts'; // Changed WalletState to WalletStore
import { 
  TokenWallet, 
  TokenWalletTransaction, 
  ApiError as ApiErrorType, 
  ApiResponse, 
  ErrorResponse, 
  SuccessResponse, 
  PurchaseRequest, 
  PaymentInitiationResult 
} from '@paynless/types';

// Import the actual api for type casting, and the reset function from our mock file
import { api as actualApiForTyping } from '@paynless/api'; 
import { resetApiMock, MockApi, MockWalletApiClient } from '../../api/src/mocks/api.mock.ts'; // Assuming MockApi type is exported from api.mock.ts

// Mock the entire @paynless/api module
vi.mock('@paynless/api', async () => {
  const mockModule = await import('../../api/src/mocks/api.mock.ts');
  return { 
    api: mockModule.api // Ensure this 'api' export from the mock file is what we want
  };
});

// This api should now be the mocked version due to vi.mock hoisting and execution.
// We will cast it to our MockApi type for TypeScript intellisense and type checking.
import { api as potentiallyMockedApi } from '@paynless/api';
const api = potentiallyMockedApi as unknown as MockApi;

// We need top-level variables to assign the specific mock functions for tests.
let mockGetWalletInfo: MockWalletApiClient['getWalletInfo'];
let mockGetWalletTransactionHistory: MockWalletApiClient['getWalletTransactionHistory'];
let mockInitiateTokenPurchase: MockWalletApiClient['initiateTokenPurchase'];

describe('useWalletStore', () => {
  beforeEach(() => { // Top-level beforeEach for all tests in this describe block
    useWalletStore.getState()._resetForTesting();
    resetApiMock(); // Reset our shared mock
    
    // Assign the specific mock functions from the (now correctly typed) imported & mocked api
    mockGetWalletInfo = api.wallet().getWalletInfo;
    mockGetWalletTransactionHistory = api.wallet().getWalletTransactionHistory;
    mockInitiateTokenPurchase = api.wallet().initiateTokenPurchase;
  });

  describe('Initial State', () => {
    it('should initialize with the correct default values', () => {
      const state = useWalletStore.getState();
      expect(state.currentWallet).toBeNull();
      expect(state.transactionHistory).toEqual([]);
      expect(state.isLoadingWallet).toBe(false);
      expect(state.isLoadingHistory).toBe(false);
      expect(state.isLoadingPurchase).toBe(false);
      expect(state.walletError).toBeNull();
      expect(state.purchaseError).toBeNull();
    });
  });

  describe('Selectors', () => {
    describe('selectCurrentWalletBalance', () => {
      it("should return '0' if currentWallet is null", () => {
        useWalletStore.setState({ currentWallet: null });
        const balance = useWalletStore.getState().selectCurrentWalletBalance();
        expect(balance).toBe('0');
      });

      it('should return the balance string if currentWallet exists', () => {
        const mockWallet: TokenWallet = {
          walletId: 'w1', balance: '1000', currency: 'AI_TOKEN',
          createdAt: new Date(), updatedAt: new Date()
        };
        useWalletStore.setState({ currentWallet: mockWallet });
        const balance = useWalletStore.getState().selectCurrentWalletBalance();
        expect(balance).toBe('1000');
      });

      it("should return '0' if currentWallet balance is '0'", () => {
        const mockWallet: TokenWallet = {
          walletId: 'w1', balance: '0', currency: 'AI_TOKEN',
          createdAt: new Date(), updatedAt: new Date()
        };
        useWalletStore.setState({ currentWallet: mockWallet });
        const balance = useWalletStore.getState().selectCurrentWalletBalance();
        expect(balance).toBe('0');
      });
    });

    describe('selectWalletTransactions', () => {
      it('should return an empty array if transactionHistory is empty', () => {
        useWalletStore.setState({ transactionHistory: [] });
        const transactions = useWalletStore.getState().selectWalletTransactions();
        expect(transactions).toEqual([]);
      });

      it('should return the transactionHistory array', () => {
        const mockTransactions: TokenWalletTransaction[] = [
          { transactionId: 't1', walletId: 'w1', type: 'CREDIT_PURCHASE', amount: '100', balanceAfterTxn: '100', recordedByUserId: 'u1', timestamp: new Date() },
          { transactionId: 't2', walletId: 'w1', type: 'DEBIT_USAGE', amount: '10', balanceAfterTxn: '90', recordedByUserId: 'u1', timestamp: new Date() },
        ];
        useWalletStore.setState({ transactionHistory: mockTransactions });
        const transactions = useWalletStore.getState().selectWalletTransactions();
        expect(transactions).toEqual(mockTransactions);
      });
    });
  });

  // Action tests will be added here later, they will require mocking the api.wallet() calls.
  // e.g., loadWallet, loadTransactionHistory, initiatePurchase

  describe('Actions', () => {
    describe('loadWallet', () => {
      const mockPersonalWallet: TokenWallet = {
        walletId: 'personal-wallet-id',
        userId: 'user-123',
        balance: '5000',
        currency: 'AI_TOKEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockOrgWallet: TokenWallet = {
        walletId: 'org-wallet-id',
        organizationId: 'org-abc',
        balance: '100000',
        currency: 'AI_TOKEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      it('should load a personal wallet successfully', async () => {
        const response: SuccessResponse<TokenWallet | null> = { data: mockPersonalWallet, error: undefined, status: 200 };
        mockGetWalletInfo.mockResolvedValue(response as ApiResponse<TokenWallet | null>);

        await useWalletStore.getState().loadWallet();

        const state = useWalletStore.getState();
        expect(mockGetWalletInfo).toHaveBeenCalledWith(undefined);
        expect(state.isLoadingWallet).toBe(false);
        expect(state.currentWallet).toEqual(mockPersonalWallet);
        expect(state.walletError).toBeNull();
      });

      it('should load an organization wallet successfully', async () => {
        const orgId = 'org-abc';
        const response: SuccessResponse<TokenWallet | null> = { data: mockOrgWallet, error: undefined, status: 200 };
        mockGetWalletInfo.mockResolvedValue(response as ApiResponse<TokenWallet | null>);

        await useWalletStore.getState().loadWallet(orgId);

        const state = useWalletStore.getState();
        expect(mockGetWalletInfo).toHaveBeenCalledWith(orgId);
        expect(state.isLoadingWallet).toBe(false);
        expect(state.currentWallet).toEqual(mockOrgWallet);
        expect(state.walletError).toBeNull();
      });

      it('should handle API error when loading wallet', async () => {
        const apiError: ApiErrorType = { message: 'API Error', code: 'INTERNAL_SERVER_ERROR' }; 
        const response: ErrorResponse = { data: undefined, error: apiError, status: 500 }; 
        mockGetWalletInfo.mockResolvedValue(response as ApiResponse<TokenWallet | null>);

        await useWalletStore.getState().loadWallet();

        const state = useWalletStore.getState();
        expect(state.isLoadingWallet).toBe(false);
        expect(state.currentWallet).toBeNull();
        expect(state.walletError).toEqual(expect.objectContaining({ message: 'API Error', code: 'INTERNAL_SERVER_ERROR' }));
      });

      it('should handle wallet not found (API returns null data, no error)', async () => {
        const response: SuccessResponse<null> = { data: null, error: undefined, status: 200 };
        mockGetWalletInfo.mockResolvedValue(response as ApiResponse<TokenWallet | null>);

        await useWalletStore.getState().loadWallet();

        const state = useWalletStore.getState();
        expect(state.isLoadingWallet).toBe(false);
        expect(state.currentWallet).toBeNull();
        expect(state.walletError).toEqual(expect.objectContaining({ message: 'Failed to fetch wallet: No data returned' }));
      });

      it('should set isLoadingWallet to true during fetch and false afterwards', async () => {
        const response: SuccessResponse<TokenWallet | null> = { data: mockPersonalWallet, error: undefined, status: 200 };
        mockGetWalletInfo.mockResolvedValue(response as ApiResponse<TokenWallet | null>);
        
        const loadPromise = useWalletStore.getState().loadWallet();
        expect(useWalletStore.getState().isLoadingWallet).toBe(true);

        await loadPromise;
        expect(useWalletStore.getState().isLoadingWallet).toBe(false);
      });
    });

    // Placeholder for loadTransactionHistory tests
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
        expect(state.walletError).toBeNull();
      });

      it('should load transaction history successfully for an organization wallet with pagination', async () => {
        const response: SuccessResponse<TokenWalletTransaction[]> = { data: mockTransactions, error: undefined, status: 200 };
        mockGetWalletTransactionHistory.mockResolvedValue(response as ApiResponse<TokenWalletTransaction[]>);

        await useWalletStore.getState().loadTransactionHistory(orgId, limit, offset);

        const state = useWalletStore.getState();
        expect(mockGetWalletTransactionHistory).toHaveBeenCalledWith(orgId, limit, offset);
        expect(state.isLoadingHistory).toBe(false);
        expect(state.transactionHistory).toEqual(mockTransactions);
        expect(state.walletError).toBeNull();
      });

      it('should handle API error when loading transaction history', async () => {
        const apiError: ApiErrorType = { message: 'History API Error', code: 'HISTORY_FETCH_FAILED' }; 
        const response: ErrorResponse = { data: undefined, error: apiError, status: 500 }; 
        mockGetWalletTransactionHistory.mockResolvedValue(response as ApiResponse<TokenWalletTransaction[]>);

        await useWalletStore.getState().loadTransactionHistory();

        const state = useWalletStore.getState();
        expect(state.isLoadingHistory).toBe(false);
        expect(state.transactionHistory).toEqual([]);
        expect(state.walletError).toEqual(expect.objectContaining(apiError));
      });

      it('should handle empty transaction history (API returns empty array)', async () => {
        const response: SuccessResponse<TokenWalletTransaction[]> = { data: [], error: undefined, status: 200 };
        mockGetWalletTransactionHistory.mockResolvedValue(response as ApiResponse<TokenWalletTransaction[]>);

        await useWalletStore.getState().loadTransactionHistory();

        const state = useWalletStore.getState();
        expect(state.isLoadingHistory).toBe(false);
        expect(state.transactionHistory).toEqual([]);
        expect(state.walletError).toBeNull(); // No error if data is an empty array
      });

      it('should handle history not found (API returns null data, no error)', async () => {
        const response: SuccessResponse<null> = { data: null, error: undefined, status: 200 };
        mockGetWalletTransactionHistory.mockResolvedValue(response as unknown as ApiResponse<TokenWalletTransaction[]>);

        await useWalletStore.getState().loadTransactionHistory();

        const state = useWalletStore.getState();
        expect(state.isLoadingHistory).toBe(false);
        expect(state.transactionHistory).toEqual([]);
        expect(state.walletError).toEqual(expect.objectContaining({ message: 'Failed to fetch transaction history: No data returned', code: 'NOT_FOUND' }));
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
        const apiError: ApiErrorType = { message: 'Purchase Failed', code: 'PURCHASE_ERROR' };
        const response: ErrorResponse = { data: undefined, error: apiError, status: 500 };
        mockInitiateTokenPurchase.mockResolvedValue(response as ApiResponse<PaymentInitiationResult | null>);

        const result = await useWalletStore.getState().initiatePurchase(mockPurchaseRequest);

        const state = useWalletStore.getState();
        expect(state.isLoadingPurchase).toBe(false);
        expect(state.purchaseError).toEqual(expect.objectContaining(apiError));
        expect(result).toBeNull();
      });

      it('should handle null data from API (e.g., specific non-error failure) and return null', async () => {
        const response: SuccessResponse<null> = { data: null, error: undefined, status: 200 }; // Or maybe a 4xx status for specific failures
        mockInitiateTokenPurchase.mockResolvedValue(response as unknown as ApiResponse<PaymentInitiationResult | null>);

        const result = await useWalletStore.getState().initiatePurchase(mockPurchaseRequest);

        const state = useWalletStore.getState();
        expect(state.isLoadingPurchase).toBe(false);
        expect(state.purchaseError).toEqual(expect.objectContaining({ message: 'Failed to initiate purchase: No initiation data returned', code: 'NO_DATA'}));
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