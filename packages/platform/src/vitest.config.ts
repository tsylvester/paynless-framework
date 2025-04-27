import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import viteTsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
// https://vitest.dev/config/
export default defineConfig({
  plugins: [viteTsconfigPaths(), react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // setupFiles: './src/setupTests.ts', // Add if you have a setup file
    // Add esbuild options for jsx if needed, though plugin-react should handle it
    // esbuild: {
    //   jsxInject: `import React from 'react'`,
    //   jsxFactory: 'React.createElement',
    // },
  },
});