/**
 * Mock for @tauri-apps/api/core specifically for web builds/dev server.
 * Prevents errors when Vite tries to resolve this module in a non-Tauri context.
 */

export const isTauri = false;

// Add other exports from @tauri-apps/api/core if they are imported elsewhere
// in platform, providing dummy implementations.
// For now, only isTauri seems to be used.
console.log('[Mock] Loaded tauri-api-core.web-mock.ts'); 