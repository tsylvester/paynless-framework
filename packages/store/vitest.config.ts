/// <reference types="vitest" />
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  test: {
    globals: true, // Enable global test APIs (describe, it, etc.)
    environment: 'jsdom', // Simulate browser for fetch, localStorage etc.
    setupFiles: ['vitest-localstorage-mock'], // Add the mock setup file
    mockReset: false, // Recommended by the mock library
    // Optional: alias configuration if needed for imports
    alias: {
        '@paynless/types': path.resolve(__dirname, '../types/src'),
        '@paynless/utils': path.resolve(__dirname, '../utils/src'),
        // '@paynless/api': path.resolve(__dirname, '../api/src'), // Removed to allow standard package resolution
        '@paynless/analytics': path.resolve(__dirname, '../analytics/src'),
      },
  },
}); 