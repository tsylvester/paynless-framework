import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Import vitest types for test config
import type { UserConfig } from 'vitest/config';
import path from 'path'; // Keep path for alias
import tsconfigPaths from 'vite-tsconfig-paths';

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
    ],
  },
  resolve: {
    // Setting preserveSymlinks to false might help resolve hoisted deps
    preserveSymlinks: false,
    alias: {
      // Keep aliases for local workspace packages
      '@paynless/api-client': path.resolve(__dirname, '../../packages/api-client/src'),
      '@paynless/store': path.resolve(__dirname, '../../packages/store/src'),
      // Add the alias for the new package
      '@paynless/platform-capabilities': path.resolve(__dirname, '../../packages/platform-capabilities/src'),
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
        // Prevent bundling Tauri APIs in the web build
        /^@tauri-apps\/api\/.*$/,
        /^@tauri-apps\/api/,
      ],
    },
  },
  // Ensure server settings don't conflict if they exist
  server: {
    port: 5173, // Example, keep your original port
    strictPort: true,
    host: true, // Allow external access in dev (e.g., for Tauri)
  },
});
