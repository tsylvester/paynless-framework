import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Import vitest types for test config
import type { UserConfig } from 'vitest/config';
import path from 'node:path'; // Keep path for alias

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  optimizeDeps: {
    include: [
      '@tanstack/query-core',
      'react-router',
      'use-sync-external-store/shim/with-selector.js',
      '@remix-run/router',
      'scheduler',
      '@tanstack/react-query',
      'react-router-dom',
      'zustand',
      '@paynless/store',
      // No longer include platform source
      // Include necessary Tauri APIs (may be needed by other deps? Keep exclude too)
      // '@tauri-apps/api/core',
      // '@tauri-apps/api/dialog',
      // '@tauri-apps/api/tauri',
      // '@tauri-apps/api',
    ],
    // Keep exclude for Tauri APIs
    exclude: [
      '@tauri-apps/api',
      '@tauri-apps/api/core',
      '@tauri-apps/api/dialog',
      '@tauri-apps/api/tauri',
    ],
  },
  resolve: {
    preserveSymlinks: false,
    // Restore explicit aliases for workspace packages
    alias: {
      // Keep aliases for local workspace packages
      '@paynless/api': path.resolve(__dirname, '../../packages/api/src'),
      '@paynless/store': path.resolve(__dirname, '../../packages/store/src/index.ts'),
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
    sourcemap: true, // Enable sourcemaps for easier debugging
    rollupOptions: {
      external: [
        // Explicitly mark Tauri API imports as external for the web build
        // This prevents Rollup from trying to resolve them.
        /^@tauri-apps\/api(\/.*)?$/,
      ],
    },
  },
  // Ensure server settings don't conflict if they exist
  server: {
    port: 5173, // Example, keep your original port
    strictPort: true,
    host: true, // Allow external access in dev (e.g., for Tauri)
    // Add fs.allow for accessing the shared package source
    fs: {
      allow: ['../../'],
    },
  },
});
