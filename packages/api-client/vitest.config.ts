/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: true, // Enable global test APIs (describe, it, etc.)
    environment: 'jsdom', // Simulate a browser environment for fetch, etc.
    setupFiles: './src/setupTests.ts', // Path to setup file (we'll create this)
    // Ensure Vitest globals are recognized by TypeScript
    // You might also need to add "vitest/globals" to tsconfig.json types
    // Optional: Add coverage configuration if desired later
    // coverage: {
    //   provider: 'v8', // or 'istanbul'
    //   reporter: ['text', 'json', 'html'],
    // },
  },
}); 