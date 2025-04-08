import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default defineConfig({
  ...viteConfig,
  test: {
    // Disable optimizer for tests
    deps: {
      optimizer: {
        web: {
          enabled: false,
        },
      },
      // Force use of source code
      inline: [/^@paynless\/api-client/],
    },
    // Watch for changes in api-client
    forceRerunTriggers: ['../../packages/api-client/src/**/*'],
    // Explicit setup
    setupFiles: ['./src/setupTests.ts'],
    environment: 'jsdom',
    globals: true,
    // Disable threads to avoid concurrency issues
    threads: false,
  },
}); 