import type { Platform } from '@paynless/types';

// Web platform provides no special filesystem capabilities via this service by default.
// Standard file inputs or future Web File System Access API would be handled differently.
export const getLinuxCapabilities = (): Platform => {
  // Placeholder implementation for Linux
  return {
    platform: 'web', // Placeholder, might be 'tauri' if running desktop
    os: 'linux',
    fileSystem: { isAvailable: false }, // Or Tauri FS if detected
    // Initialize other capability groups as needed
  };
}; 