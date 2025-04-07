/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true, // Use Vitest global APIs (describe, it, expect, etc.)
    environment: 'jsdom', // Simulate browser environment for React components
    setupFiles: './src/setupTests.ts', // Setup file for RTL matchers, etc.
    css: false, // Usually disable CSS processing for unit tests unless needed
    // Remove deps config to let Vitest/Vite use defaults
    // deps: {
    //   optimizer: {
    //     web: {
    //       include: ['@testing-library/jest-dom'],
    //     },
    //   },
    // },
  },
}); 