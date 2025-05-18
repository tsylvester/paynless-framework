import { vi } from 'vitest';
import { ApiResponse, TokenWallet, TokenWalletTransaction, PaymentInitiationResult, ApiError, PurchaseRequest } from '@paynless/types';

// Define the type for the object returned by api.wallet()
export type MockWalletApiClient = {
  getWalletInfo: ReturnType<typeof vi.fn<[organizationId?: string | null | undefined], Promise<ApiResponse<TokenWallet | null>>>>;
  getWalletTransactionHistory: ReturnType<typeof vi.fn<[organizationId?: string | null | undefined, limit?: number | undefined, offset?: number | undefined], Promise<ApiResponse<TokenWalletTransaction[]>>>>;
  initiateTokenPurchase: ReturnType<typeof vi.fn<[request: PurchaseRequest], Promise<ApiResponse<PaymentInitiationResult | null>>>>;
};

// Define the type for the main mocked api object
export type MockApi = {
  wallet: ReturnType<typeof vi.fn<[], MockWalletApiClient>>;
  // Add other api clients like ai, stripe as needed, e.g.:
  // ai: ReturnType<typeof vi.fn<[], MockAiInstance>>;
};

// Create the actual mock functions for the wallet client
const mockWalletClientInstance: MockWalletApiClient = {
  getWalletInfo: vi.fn(),
  getWalletTransactionHistory: vi.fn(),
  initiateTokenPurchase: vi.fn(),
};

// The main mocked api object that will be imported by tests
export const api: MockApi = {
  wallet: vi.fn(() => mockWalletClientInstance),
  // ai: vi.fn(() => mockAiInstance), // Example for other clients
};

/**
 * Resets all nested mock functions in the mocked api object.
 * Call this in your test setup (e.g., beforeEach) to ensure clean state between tests.
 */
export function resetApiMock() {
  // Reset the functions on the instance returned by api.wallet()
  mockWalletClientInstance.getWalletInfo.mockReset();
  mockWalletClientInstance.getWalletTransactionHistory.mockReset();
  mockWalletClientInstance.initiateTokenPurchase.mockReset();

  // Reset the main accessor mock if needed (e.g., to clear call counts to api.wallet() itself)
  // This ensures that if a test checks api.wallet().toHaveBeenCalledTimes(1), it's accurate for that test.
  api.wallet.mockClear(); 
  // Restore the default implementation in case a test overwrote it.
  api.wallet.mockImplementation(() => mockWalletClientInstance);
}

// Make sure 'api' is exported and is the mockApiObject
// ... existing code ... 