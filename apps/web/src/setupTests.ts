// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
// Try importing the main package entry point
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Log initial fetch
console.log('[setupTests] globalThis.fetch BEFORE any setup:', globalThis.fetch);

// REMOVE: Incorrect import for MSW server
// import { server } from './mocks/server';

// REMOVE: Redundant MSW lifecycle hooks (handled in test file)
// console.log('[setupTests] Setting up MSW server listeners...');
// beforeAll(() => server.listen({...}));
// console.log('[setupTests] globalThis.fetch AFTER MSW setup:', globalThis.fetch);
// afterEach(() => server.resetHandlers());
// afterAll(() => server.close());

// Keep matchMedia mock
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