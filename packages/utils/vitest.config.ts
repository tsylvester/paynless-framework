/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: true, // Enable global test APIs (describe, it, etc.)
    environment: 'node', // Use Node environment for utils testing
    // No setupFiles needed for basic utils unless mocking is required
  },
}); 