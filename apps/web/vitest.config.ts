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
      inline: [/^@paynless\/api/],
    },
    // Watch for changes in api
    forceRerunTriggers: ['../../packages/api/src/**/*'],
    // Explicit setup
    setupFiles: ['./src/tests/setup.ts'],
    environment: 'jsdom',
    globals: true,
    // Disable threads to avoid concurrency issues
    threads: false,
  },
}); 