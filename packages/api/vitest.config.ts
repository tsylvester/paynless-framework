/// <reference types="vitest" />
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // Or 'jsdom' if you need browser APIs for some api tests
    // Include all .test.ts and .spec.ts files within the src directory
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    alias: {
      // If your API tests need to resolve other workspace packages, add aliases here
      // For example, if importing directly from @paynless/types source:
      '@paynless/types': path.resolve(__dirname, '../types/src'),
      // Add other necessary aliases
    },
    // Add setupFiles if needed, e.g., for mocking 'msw'
    // setupFiles: ['./src/mocks/setup.ts'], 
  },
}); 