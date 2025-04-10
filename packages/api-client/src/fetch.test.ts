// packages/api-client/test/fetch.test.ts
// Adjusted path to be within src/ for easier discovery if no specific test dir exists
import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { api, initializeApiClient } from './apiClient'; // Assuming apiClient initialization happens elsewhere or isn't strictly needed for global fetch test
import { server } from './setupTests'; // Import the shared server

// Mock logger if necessary, or ensure it doesn't break tests
vi.mock('@paynless/utils', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        configure: vi.fn(),
        getInstance: vi.fn().mockReturnThis(), // Mock getInstance if needed
        // Add other methods if the code under test uses them
    }
}));

describe('fetch call within api-client package', () => {
  it('should be intercepted by MSW', async () => {
    console.log('[api-client/fetch.test.ts] Running test, about to fetch...');
    // Add a specific handler for this test's endpoint
    server.use(
      http.get('http://test.host/internal-test', () => {
        return HttpResponse.json({ message: 'Mocked fetch success' });
      })
    );

    // Log fetch implementation here too for comparison
    console.log('[api-client/fetch.test.ts] globalThis.fetch:', globalThis.fetch);
    const response = await fetch('http://test.host/internal-test');
    console.log('[api-client/fetch.test.ts] Fetch call completed.');
    expect(response.status).toBe(200);
    // You might want to consume the body to avoid potential resource leaks in test runners
    const data = await response.json(); 
    expect(data).toEqual({ message: 'Mocked fetch success' }); 
  });
}); 