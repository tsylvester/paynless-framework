console.log('[setupTests] STARTING setupTests.ts EXECUTION');

// Force rebuild import
import { forceRebuild } from './__forceRebuild__';
console.log('[setupTests] Force rebuild version:', forceRebuild);

// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
// Try importing the main package entry point
import '@testing-library/jest-dom/vitest';
import { beforeAll, afterEach, afterAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';
import { initializeApiClient } from '@paynless/api-client';
import { cleanup } from '@testing-library/react';
import { setupMockServer } from './utils/mocks/api';

console.log('Setting up test environment...');

// Create MSW server instance
export const server = setupServer(...handlers);

// Start MSW server before all tests
beforeAll(() => {
  console.log('Starting MSW server...');
  console.log('Before MSW setup, fetch is:', globalThis.fetch);
  server.listen({ onUnhandledRequest: 'error' });
  console.log('After MSW setup, fetch is:', globalThis.fetch);
});

// Add listener for unhandled requests
server.events.on('request:unhandled', ({ request }) => {
  console.error(
    `[MSW] Found an unhandled ${request.method} request to ${request.url}`,
  )
})

// Reset handlers after each test
afterEach(() => {
  server.resetHandlers();
  cleanup();
  vi.clearAllMocks();
});

// Clean up after all tests are done
afterAll(() => {
  server.close();
});

// Initialize API client with test configuration
initializeApiClient({
  baseUrl: 'http://test.host/functions/v1',
  supabaseAnonKey: 'test-anon-key'
});
console.log('[setupTests] API Client Initialized.');

// Setup MSW
setupMockServer();

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Optional: Add any other global setup here

// Log fetch at the end of setup for comparison
console.log('[setupTests] globalThis.fetch AT END of setupTests.ts:', globalThis.fetch); 