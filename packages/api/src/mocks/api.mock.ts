import { vi } from 'vitest';
import { 
  ApiResponse, 
  TokenWallet, 
  TokenWalletTransaction, 
  PaymentInitiationResult, 
  PurchaseRequest 
} from '@paynless/types';
// Import types from the actual dialectic.api.ts to ensure consistency
import type { DialecticProject, CreateProjectPayload } from '../dialectic.api'; 
import { createMockAiApiClient, resetMockAiApiClient, type MockedAiApiClient } from './ai.api.mock'; // Import from sibling

// Define the type for the object returned by api.wallet()
export type MockWalletApiClient = {
  getWalletInfo: ReturnType<typeof vi.fn<[organizationId?: string | null | undefined], Promise<ApiResponse<TokenWallet | null>>>>;
  getWalletTransactionHistory: ReturnType<typeof vi.fn<[organizationId?: string | null | undefined, limit?: number | undefined, offset?: number | undefined], Promise<ApiResponse<TokenWalletTransaction[]>>>>;
  initiateTokenPurchase: ReturnType<typeof vi.fn<[request: PurchaseRequest], Promise<ApiResponse<PaymentInitiationResult | null>>>>;
};

// --- Dialectic Client Mock Setup ---
export type MockDialecticApiClient = {
    listAvailableDomainTags: ReturnType<typeof vi.fn<[], Promise<ApiResponse<string[]>>>>;
    createProject: ReturnType<typeof vi.fn<[payload: CreateProjectPayload], Promise<ApiResponse<DialecticProject>>>>;
    listProjects: ReturnType<typeof vi.fn<[], Promise<ApiResponse<DialecticProject[]>>>>;
};

const mockDialecticClientInstance: MockDialecticApiClient = {
    listAvailableDomainTags: vi.fn(),
    createProject: vi.fn(),
    listProjects: vi.fn(),
};

// --- AI Client Mock Setup ---
// Create an instance of the AI client mock. This will be returned by api.ai()
// It's declared with 'let' so resetApiMock can re-assign it for a fresh instance.
const mockAiClientInstance: MockedAiApiClient = createMockAiApiClient();

// Define the type for the main mocked api object
export type MockApi = {
  wallet: ReturnType<typeof vi.fn<[], MockWalletApiClient>>;
  ai: ReturnType<typeof vi.fn<[], MockedAiApiClient>>; // Added ai client
  dialectic: ReturnType<typeof vi.fn<[], MockDialecticApiClient>>; // Added dialectic client
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
  ai: vi.fn(() => mockAiClientInstance), // Ensure api.ai() returns our mock AI client instance
  dialectic: vi.fn(() => mockDialecticClientInstance), // Ensure api.dialectic() returns our mock Dialectic client instance
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

  // Reset the AI client instance using its specific reset function
  resetMockAiApiClient(mockAiClientInstance);
  // Optionally, to ensure absolutely no state leakage if tests improperly hold references:
  // mockAiClientInstance = createMockAiApiClient();

  // Reset the Dialectic client instance
  mockDialecticClientInstance.listAvailableDomainTags.mockReset();
  mockDialecticClientInstance.createProject.mockReset();
  mockDialecticClientInstance.listProjects.mockReset();

  // Reset the main accessor mocks
  api.wallet.mockClear();
  api.ai.mockClear();
  api.dialectic.mockClear();
  // Restore the default implementations to return the (potentially recreated) instances
  api.wallet.mockImplementation(() => mockWalletClientInstance);
  api.ai.mockImplementation(() => mockAiClientInstance);
  api.dialectic.mockImplementation(() => mockDialecticClientInstance);
}

/**
 * Helper to get the current instance of the mock AI client.
 * Useful for tests to access specific mock functions like sendChatMessage.
 */
export const getMockAiClient = (): MockedAiApiClient => mockAiClientInstance;

/**
 * Helper to get the current instance of the mock Dialectic client.
 */
export const getMockDialecticClient = (): MockDialecticApiClient => mockDialecticClientInstance;

// Make sure 'api' is exported and is the mockApiObject
// ... existing code ... 