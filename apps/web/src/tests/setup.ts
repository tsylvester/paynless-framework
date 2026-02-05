import '@testing-library/jest-dom/vitest';
import { vi, beforeEach, afterEach, afterAll } from 'vitest';
// Import the official mock creator from the api package using a relative path
import { createMockSupabaseClient } from '../../../../packages/api/src/mocks/supabase.mock.ts'; 
import { cleanup } from '@testing-library/react';

// Polyfill for PointerEvent
if (typeof window !== 'undefined' && !window.PointerEvent) {
    class PointerEvent extends MouseEvent {}
    window.PointerEvent = PointerEvent as unknown as typeof window.PointerEvent;
}
// JSDOM doesn't implement PointerEvent methods, so we need to mock them.
if (typeof Element.prototype.setPointerCapture === 'undefined') {
  Element.prototype.setPointerCapture = vi.fn();
}
if (typeof Element.prototype.releasePointerCapture === 'undefined') {
  Element.prototype.releasePointerCapture = vi.fn();
}
if (typeof Element.prototype.hasPointerCapture === 'undefined') {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
}

// Mock ResizeObserver
const ResizeObserverMock = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

// The core mocked 'api' object that stores will use
const mockedApiObject = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  // Use the imported mock Supabase client creator
  getSupabaseClient: vi.fn().mockImplementation(createMockSupabaseClient),
  // Mock sub-clients
  ai: () => ({
    getAiProviders: vi.fn().mockResolvedValue({ data: { providers: [] }, error: null }),
    getSystemPrompts: vi.fn().mockResolvedValue({ data: { prompts: [] }, error: null }),
    getChatWithMessages: vi.fn().mockResolvedValue({ data: { chat: null, messages: [] }, error: null }),
    getChatHistory: vi.fn().mockResolvedValue({ data: { history: [] }, error: null }),
    createChat: vi.fn().mockResolvedValue({ data: null, error: null }),
    sendMessageToChat: vi.fn().mockResolvedValue({ data: null, error: null }),
    // ... other ai methods
  }),
  users: () => ({
    getProfile: vi.fn().mockResolvedValue({ data: null, error: null }),
    updateUserProfile: vi.fn().mockResolvedValue({ data: null, error: null }),
    // ... other user methods
  }),
  organizations: () => ({
    getOrganizationDetails: vi.fn().mockResolvedValue({ data: null, error: null }),
    updateOrganization: vi.fn().mockResolvedValue({ data: null, error: null }),
    getOrganizationsForUser: vi.fn().mockResolvedValue({ data: [], error: null }),
    // ... mock organization methods
  }),
  notifications: () => ({
    registerDevice: vi.fn().mockResolvedValue({ data: null, error: null }),
    getNotifications: vi.fn().mockResolvedValue({ data: [], error: null }),
    // ... mock notification methods
  }),
  billing: () => ({
    createCheckoutSession: vi.fn().mockResolvedValue({ data: null, error: null }),
    // ... mock billing methods
  }),
  wallet: vi.fn(() => ({
    getWalletInfo: vi.fn().mockResolvedValue({
      data: { walletId: 'test-wallet', balance: '0' },
      error: null,
    }),
  })),
};

vi.mock('@paynless/api', () => ({
  api: mockedApiObject,
  initializeApiClient: vi.fn(), // Mock the initializer
  getApiClient: vi.fn(() => mockedApiObject), // If anything calls this, return the main mock
  // Mock error classes if they are constructed/thrown by code under test
  ApiError: class MockApiError extends Error {
    code?: string | number;
    constructor(message: string, code?: string | number) { super(message); this.name = 'MockApiError'; this.code = code; }
  },
  AuthRequiredError: class MockAuthRequiredError extends Error {
    constructor(message: string) { super(message); this.name = 'MockAuthRequiredError'; }
  },
}));

// Mock other global dependencies like analytics
vi.mock('@paynless/analytics', () => ({
  analytics: {
    track: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    init: vi.fn(),
  },
  initializeAnalytics: vi.fn(),
}));

// Mock for @paynless/utils logger
vi.mock('@paynless/utils', async (importOriginal) => {
  const actualUtils = await importOriginal<typeof import('@paynless/utils')>();
  return {
    ...actualUtils, // Spread actual utilities
    logger: { // Mock only the logger
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      setLogLevel: vi.fn(),
      getLogLevel: vi.fn().mockReturnValue('info'),
      // Add other logger methods if any
    },
  };
});


// Global test hooks
beforeEach(() => {
  vi.clearAllMocks();
  mockedApiObject.getSupabaseClient.mockImplementation(createMockSupabaseClient);
  mockedApiObject.wallet.mockImplementation(() => ({
    getWalletInfo: vi.fn().mockResolvedValue({
      data: { walletId: 'test-wallet', balance: '0' },
      error: null,
    }),
  }));
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
});

console.log('Global test setup in apps/web/src/tests/setup.ts has been updated and applied (using shared Supabase mock).'); 