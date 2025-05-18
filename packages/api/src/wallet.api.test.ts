import { vi, describe, beforeEach, it, expect } from 'vitest';
import { ApiClient } from './apiClient'; // Path relative to src/ folder
import { WalletApiClient } from './wallet.api'; // Path relative to src/ folder
import type {
  ApiResponse,
  TokenWallet,
  TokenWalletTransaction,
  PurchaseRequest,
  PaymentInitiationResult,
  FetchOptions,
} from '@paynless/types';

// Mock the base ApiClient methods that WalletApiClient will use
const mockGet = vi.fn();
const mockPost = vi.fn();

// Mock ApiClient constructor and its methods needed by WalletApiClient
vi.mock('./apiClient', () => { // Adjusted path for sibling test
  return {
    ApiClient: vi.fn().mockImplementation(() => ({
      get: mockGet,
      post: mockPost,
    })),
  };
});

describe('WalletApiClient', () => {
  let walletApiClient: WalletApiClient;
  // let mockBaseApiClientInstance: ApiClient; // Not strictly needed to be stored if not used elsewhere

  beforeEach(() => {
    // Provide dummy values for ApiClient constructor options to avoid runtime error
    const mockApiClientOptions = {
      supabase: {} as any, // Dummy supabase client
      supabaseUrl: 'http://dummy.url',
      supabaseAnonKey: 'dummy-key',
    };
    // Since ApiClient is mocked, new ApiClient() will return the mock constructor's instance
    // but we still call it as if we are instantiating the real one to satisfy its constructor call within the mock setup.
    // The instance itself is not the real ApiClient, but an object with mocked get/post.
    const mockBaseApiClientInstance = new ApiClient(mockApiClientOptions);
    walletApiClient = new WalletApiClient(mockBaseApiClientInstance);
    mockGet.mockReset();
    mockPost.mockReset();
  });

  describe('getWalletInfo', () => {
    it('should call client.get with /wallet-info for personal wallet', async () => {
      const mockResponse: ApiResponse<TokenWallet | null> = { status: 200, data: {} as TokenWallet, error: undefined }; // Changed error to undefined
      mockGet.mockResolvedValue(mockResponse);

      await walletApiClient.getWalletInfo();
      expect(mockGet).toHaveBeenCalledWith('/wallet-info', undefined);
    });

    it('should call client.get with /wallet-info and organizationId for org wallet', async () => {
      const orgId = 'org123';
      const mockResponse: ApiResponse<TokenWallet | null> = { status: 200, data: {} as TokenWallet, error: undefined }; // Changed error to undefined
      mockGet.mockResolvedValue(mockResponse);

      await walletApiClient.getWalletInfo(orgId);
      expect(mockGet).toHaveBeenCalledWith(`/wallet-info?organizationId=${orgId}`, undefined);
    });

    it('should pass FetchOptions to client.get', async () => {
        const options: FetchOptions = { headers: { 'X-Custom': 'Test' } };
        mockGet.mockResolvedValue({ status: 200, data: null, error: undefined }); // Changed error to undefined
        await walletApiClient.getWalletInfo(null, options);
        expect(mockGet).toHaveBeenCalledWith('/wallet-info', options);
    });
  });

  describe('getWalletTransactionHistory', () => {
    it('should call client.get with /wallet-history and correctly formatted query parameters', async () => {
      const mockResponse: ApiResponse<TokenWalletTransaction[]> = { status: 200, data: [], error: undefined }; // Changed error to undefined
      mockGet.mockResolvedValue(mockResponse);

      await walletApiClient.getWalletTransactionHistory('org456', 10, 5);
      expect(mockGet).toHaveBeenCalledWith('/wallet-history?organizationId=org456&limit=10&offset=5', undefined);
    });

    it('should call client.get with /wallet-history when no params are provided', async () => {
      mockGet.mockResolvedValue({ status: 200, data: [], error: undefined }); // Changed error to undefined
      await walletApiClient.getWalletTransactionHistory();
      expect(mockGet).toHaveBeenCalledWith('/wallet-history', undefined);
    });

    it('should handle only limit and offset', async () => {
        mockGet.mockResolvedValue({ status: 200, data: [], error: undefined }); // Changed error to undefined
        await walletApiClient.getWalletTransactionHistory(null, 20, 0);
        expect(mockGet).toHaveBeenCalledWith('/wallet-history?limit=20&offset=0', undefined);
    });

    it('should pass FetchOptions to client.get', async () => {
        const options: FetchOptions = { cache: 'no-cache' };
        mockGet.mockResolvedValue({ status: 200, data: [], error: undefined }); // Changed error to undefined
        await walletApiClient.getWalletTransactionHistory(null, undefined, undefined, options);
        expect(mockGet).toHaveBeenCalledWith('/wallet-history', options);
    });
  });

  describe('initiateTokenPurchase', () => {
    it('should return a placeholder success response and log a warning (temporary)', async () => {
      const purchaseRequest: PurchaseRequest = {
        userId: 'user-test-id', // Added missing userId
        itemId: 'item_abc',
        quantity: 1,
        currency: 'USD',
        paymentGatewayId: 'stripe',
      };
      const consoleWarnSpy = vi.spyOn(console, 'warn');

      const response = await walletApiClient.initiateTokenPurchase(purchaseRequest);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'initiateTokenPurchase is a placeholder and does not make an API call yet.',
        purchaseRequest,
        undefined // For options, which is undefined in this call
      );
      expect(response.data?.success).toBe(true);
      expect(response.error).toBeNull();
      expect(mockPost).not.toHaveBeenCalled(); // Ensure the actual post isn't called yet

      consoleWarnSpy.mockRestore();
    });

    // it('should call client.post with /initiate-payment and the request body (when implemented)', async () => {
    //   const purchaseRequest: PurchaseRequest = { /* ... */ } as PurchaseRequest;
    //   const mockPaymentResult: PaymentInitiationResult = { success: true, transactionId: 'txn_xyz' };
    //   const mockApiResponse: ApiResponse<PaymentInitiationResult> = { status: 200, data: mockPaymentResult, error: null };
    //   mockPost.mockResolvedValue(mockApiResponse);

    //   // Update WalletApiClient to actually call this.client.post for this test when ready
    //   // await walletApiClient.initiateTokenPurchase(purchaseRequest);
    //   // expect(mockPost).toHaveBeenCalledWith('/initiate-payment', purchaseRequest, undefined);
    // });
  });
}); 