/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Remove path import as alias is removed
// import path from 'path'; 

// https://vitejs.dev/config/
// https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  // Remove resolve config block from here
  // resolve: { ... },
  test: {
    globals: true, 
    environment: 'jsdom', 
    setupFiles: './src/setupTests.ts', 
    css: false, 
    // Keep preserveSymlinks here if needed within test context?
    // Or rely on Vite's main resolve config if it applies?
    // Let's try keeping it simple first.
    resolve: {
      preserveSymlinks: true, // Keep this based on pnpm best practices
    },
    // Add deps config with server.deps.inline
    deps: {
      // REMOVE: inline: [/@paynless\/api-client/],
      optimizer: {
        web: {
          enabled: false,
        },
      },
    },
    // Use suggested server.deps.inline for processing linked deps
    server: {
      deps: {
        inline: [/@paynless\/api-client/],
      }
    }
  },
}); 