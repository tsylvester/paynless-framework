import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Import vitest types for test config
import type { UserConfig } from 'vitest/config';
import path from 'path'; // Keep path for alias

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Disable pre-bundling entirely
    disabled: true,
    // Keep lucide-react excluded
    exclude: ['lucide-react'],
  },
  resolve: {
    // Restore original working configuration
    preserveSymlinks: true,
    alias: {
      '@paynless/api-client': path.resolve(__dirname, '../../packages/api-client/src'),
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
});
