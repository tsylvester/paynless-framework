// packages/api-client/test/fetch.test.ts
// Adjusted path to be within src/ for easier discovery if no specific test dir exists
import { expect, test, beforeAll, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  http.get('http://test.host/internal-test', () => {
    console.log('[api-client/fetch.test.ts] MSW Handler Intercepted!');
    return HttpResponse.json({ hello: 'world' });
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('fetch call within api-client package should be intercepted by MSW', async () => {
  console.log('[api-client/fetch.test.ts] Running test, about to fetch...');
  // Log fetch implementation here too for comparison
  console.log('[api-client/fetch.test.ts] globalThis.fetch:', globalThis.fetch);
  const response = await fetch('http://test.host/internal-test');
  console.log('[api-client/fetch.test.ts] Fetch call completed.');
  expect(response.status).toBe(200);
  const json = await response.json();
  expect(json).toEqual({ hello: 'world' });
}); 