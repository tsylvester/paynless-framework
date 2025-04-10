/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: true, // Enable global test APIs (describe, it, etc.)
    environment: 'jsdom', // Simulate browser for fetch, localStorage etc.
    setupFiles: './src/setupTests.ts', // Path to setup file (we'll create this)
  },
}); 