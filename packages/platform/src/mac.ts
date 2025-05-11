import type { PlatformCapabilities } from '@paynless/types';

// Web platform provides no special filesystem capabilities via this service by default.
// Standard file inputs or future Web File System Access API would be handled differently.
export const mac: PlatformCapabilities['fileSystem'] = {
  isAvailable: false,
};

export const getMacCapabilities = (): PlatformCapabilities => {
  // Placeholder implementation for macOS
  return {
    platform: 'web', // Placeholder, might be 'tauri' if running desktop
    os: 'macos',
    fileSystem: { isAvailable: false }, // Or Tauri FS if detected
    // Initialize other capability groups as needed
  };
}; 