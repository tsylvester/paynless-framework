import type { Platform } from '@paynless/types';

// Web platform provides no special filesystem capabilities via this service by default.
// Standard file inputs or future Web File System Access API would be handled differently.
export const getIosCapabilities = (): Platform => {
  // Placeholder implementation for iOS
  return {
    platform: 'web', // Default to 'web' as iOS isn't a primary target yet
    os: 'ios',
    fileSystem: { isAvailable: false },
    // Initialize other capability groups as needed
  };
}; 