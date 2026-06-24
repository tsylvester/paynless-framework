import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // Use global APIs like describe, it, expect
    environment: 'node', // Environment for running tests (node is suitable for integration tests using fetch)
    include: [
      'supabase/functions/**/test/**/*.integration.test.ts' // Pattern to find integration tests
    ],
    // Optional: Add setup files if needed later
    // setupFiles: ['./path/to/integration/setup.ts'],
    testTimeout: 30000, // Increase timeout for potentially longer integration tests
    hookTimeout: 30000, // Increase timeout for hooks like beforeAll/afterAll
    logHeapUsage: true // Helps debug memory leaks
  },
}); 