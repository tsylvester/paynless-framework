import { defineConfig } from "vite";
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path'; // Import path module

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [tsconfigPaths()], // Add the plugin

  // Add resolve alias for the shared package
  resolve: {
    alias: {
      '@paynless/platform': path.resolve(__dirname, '../../packages/platform/src/index.ts'),
    },
  },

  // Explicitly include the shared package for optimization
  optimizeDeps: {
    exclude: [
        '@tauri-apps/api',
        '@tauri-apps/api/core',
        '@tauri-apps/api/dialog',
        '@tauri-apps/api/tauri',
    ],
  },

  // Ensure Vite can access files outside the app's root
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['../../'],
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
