import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock the window.location
Object.defineProperty(window, 'location', {
  writable: true,
  value: {
    hash: '',
    pathname: '/',
    origin: 'http://localhost:3000',
  },
});

// Mock browser API
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

// Handle environment variables
vi.mock('@env', () => ({
  VITE_SUPABASE_DATABASE_URL: 'https://test-supabase-url.co',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
}));

// Mock import.meta.env
globalThis.import = {
  meta: {
    env: {
      VITE_SUPABASE_DATABASE_URL: 'https://test-supabase-url.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      PROD: false,
    },
  },
};