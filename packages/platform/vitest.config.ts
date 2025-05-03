import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react'; // Needed if testing React components

// https://vitejs.dev/config/
// https://vitest.dev/config/
export default defineConfig({
  plugins: [react()], // Include react plugin if testing components
  test: {
    globals: true, // Use global APIs (describe, it, expect, etc.)
    environment: 'jsdom', // Simulate browser environment
    setupFiles: ['./src/setupTests.ts'], // Add setup files if needed (e.g., for polyfills, global mocks)
    // Add any other Vitest specific configurations here
    // deps: { ... } // Might be needed for linked workspace deps later
  },
}); 