import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Import vitest types for test config
import type { UserConfig } from 'vitest/config';
import path from 'path'; // Keep path for alias

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Explicitly include problematic transitive dependencies based on errors
    include: [
      '@tanstack/query-core',
      'react-router',
      'use-sync-external-store/shim/with-selector.js',
      '@remix-run/router',
      'scheduler',
      // Include direct dependencies that require these as well, just in case
      '@tanstack/react-query',
      'react-router-dom',
      'zustand',
    ],
    // Add any necessary excludes back if they were part of a working config
    // exclude: ['lucide-react'],
  },
  resolve: {
    // Setting preserveSymlinks to false might help resolve hoisted deps
    preserveSymlinks: false,
    alias: {
      // Keep aliases for local workspace packages
      '@paynless/api-client': path.resolve(__dirname, '../../packages/api-client/src'),
      '@paynless/store': path.resolve(__dirname, '../../packages/store/src'),
      // Add aliases for other local packages if needed
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Keep Vitest configuration
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts', // Ensure setup file is loaded
    server: {
      deps: {
        // Process linked dependencies to ensure MSW patching works
        inline: [/@paynless\//, /msw/],
      },
    },
  } as UserConfig['test'],
  build: {
    // Output directly to a dist folder inside the desktop app project
    outDir: 'dist',
    emptyOutDir: true, // Ensure it's clean before building
  },
  // Ensure server settings don't conflict if they exist
  server: {
    port: 5173, // Example, keep your original port
    strictPort: true,
  },
});
