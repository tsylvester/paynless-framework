// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
// Try importing the main package entry point
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.matchMedia for jsdom environment
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false, // Default value
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated but may be used
    removeListener: vi.fn(), // Deprecated but may be used
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Optional: Add any other global setup here, like:
// - Mocking global objects (fetch, localStorage, etc.) if not handled by Vitest/jsdom
// - Clearing mocks before each test (though Vitest often handles this)

// Example: Mock localStorage if needed
// const localStorageMock = (() => {
//   let store: { [key: string]: string } = {};
//   return {
//     getItem: (key: string) => store[key] || null,
//     setItem: (key: string, value: string) => { store[key] = value.toString(); },
//     removeItem: (key: string) => { delete store[key]; },
//     clear: () => { store = {}; },
//   };
// })();
// Object.defineProperty(window, 'localStorage', { value: localStorageMock }); 