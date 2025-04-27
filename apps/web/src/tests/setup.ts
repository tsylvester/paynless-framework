console.log('[setupTests] STARTING setupTests.ts EXECUTION');

// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
// Try importing the main package entry point
import '@testing-library/jest-dom/vitest';
import { beforeAll, afterEach, afterAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './utils/mocks/handlers';
import { initializeApiClient } from '@paynless/api';
import { cleanup } from '@testing-library/react';

console.log('Setting up test environment...');

// Load environment variables (ensure this happens early if not handled by Vitest config)
// Example using dotenv if needed: 
// import dotenv from 'dotenv';
// dotenv.config({ path: '.env.test' }); // Adjust path as needed

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

// Initialize API client using environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Error: Missing Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) for test setup.');
    // Optionally throw an error to halt tests if config is essential
    // throw new Error('Missing Supabase environment variables for test setup.');
} else {
    initializeApiClient({
        supabaseUrl: supabaseUrl,
        supabaseAnonKey: supabaseAnonKey
    });
    console.log('[setupTests] API Client Initialized.');
}

// Mock window.matchMedia using vi.stubGlobal
const matchMediaMock = vi.fn(query => ({
    matches: false, // Default to light mode for tests
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
}));
vi.stubGlobal('matchMedia', matchMediaMock);
console.log('[setupTests] Applied window.matchMedia mock using vi.stubGlobal.'); // Log confirmation

// Optional: Add any other global setup here

// Log fetch at the end of setup for comparison
console.log('[setupTests] globalThis.fetch AT END of setupTests.ts:', globalThis.fetch); 