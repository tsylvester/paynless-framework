import type { PlatformCapabilities } from '@paynless/types';

// Web platform provides no special filesystem capabilities via this service by default.
// Standard file inputs or future Web File System Access API would be handled differently.
export const android: PlatformCapabilities['fileSystem'] = {
  isAvailable: false,
};

export const getAndroidCapabilities = (): PlatformCapabilities => {
  // Placeholder implementation for Android
  return {
    platform: 'web', // Default to 'web' as Android isn't a primary target yet
    os: 'android',
    fileSystem: { isAvailable: false },
    // Initialize other capability groups as needed
  };
}; 