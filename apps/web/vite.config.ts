import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Import vitest types for test config
import type { UserConfig } from 'vitest/config';
import path from 'node:path'; // Keep path for alias
import tsconfigPaths from 'vite-tsconfig-paths';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { visualizer } from 'rollup-plugin-visualizer';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    nodePolyfills({
      globals: {
        Buffer: true,
      },
    }),
    wasm(),
    topLevelAwait(),
    // Bundle analyzer - generates stats.html in the build output
    visualizer({
      filename: 'stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
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
    alias: [
      { find: '@paynless/api', replacement: path.resolve(__dirname, '../../packages/api/src') },
      { find: '@paynless/store', replacement: path.resolve(__dirname, '../../packages/store/src/index.ts') },
      { find: '@', replacement: path.resolve(__dirname, './src') },

      // Bip39 wordlist optimization using regex
      // Find any import that goes to a bip39 wordlist directory and is a json file (but not english.json)
      {
        find: /.*\/bip39\/src\/wordlists\/(?!english)\w+\.json$/,
        replacement: path.resolve(__dirname, './src/lib/bip39-empty.ts'),
      },
      // Specifically replace the english.json with our module that exports the english wordlist
      {
        find: /.*\/bip39\/src\/wordlists\/english\.json$/,
        replacement: path.resolve(__dirname, './src/lib/bip39-english.ts'),
      },
       // Also handle the @scure/bip39 wordlists, just in case
      {
        find: /@scure\/bip39\/wordlists\/(?!english)\w+$/,
        replacement: path.resolve(__dirname, './src/lib/bip39-empty.ts'),
      },
    ],
  },
  build: {
    // Output directly to a dist folder inside the desktop app project
    outDir: 'dist',
    emptyOutDir: true, // Ensure it's clean before building
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) {
              return 'supabase';
            }
            if (id.includes('refractor')) {
              return 'refractor';
            }
            if (id.includes('micromark')) {
              return 'micromark';
            }
            if (id.includes('bip39')) {
              return 'bip39';
            }
            if (id.includes('posthog-js')) {
              return 'posthog';
            }
            if (id.includes('zod')) {
              return 'zod';
            }
            if (id.includes('@remix-run/router') || id.includes('react-router')) {
              return 'router';
            }
          }
          if (id.includes('packages/')) {
            const pkgName = id.split('packages/')[1].split('/')[0];
            return `vendor-${pkgName}`;
          }
        },
      },
    },
  },
  // Ensure server settings don't conflict if they exist
  server: {
    port: 5173, // Example, keep your original port
    strictPort: true,
  },
});