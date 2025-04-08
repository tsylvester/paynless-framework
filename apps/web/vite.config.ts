import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Remove vitest type import as test config is removed
// import type { UserConfig } from 'vitest/config'; 
import path from 'path'; // Keep path for alias

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Keep lucide-react excluded, api-client is handled by alias/inline
    exclude: ['lucide-react'], 
  },
  resolve: {
    // Add alias to src directory
    alias: {
      '@paynless/api-client': path.resolve(__dirname, '../../packages/api-client/src'),
    },
    // Re-enable preserveSymlinks
    preserveSymlinks: true, 
  },
  // Remove the conflicting test configuration block
  // test: { ... } as UserConfig['test'], 
});
