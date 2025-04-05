import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// import path from 'path'; // No longer needed for removed options

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Absolute path to the root node_modules - No longer needed for removed options
// const rootNodeModules = path.resolve(__dirname, '..', '..', 'node_modules'); 

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  // Keep only essential server config
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
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
    // Remove fs.allow - Rely on manual copy for now
    // fs: { 
    //   allow: [path.resolve(__dirname, '..', '..')], 
    // },
  },
  // Remove optimizeDeps
  // optimizeDeps: {
  //   include: ['@tauri-apps/api/tauri'],
  // },
  // Remove resolve
  // resolve: {
  //   preserveSymlinks: true,
  // },
}));
