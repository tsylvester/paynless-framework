import type { Platform } from '@paynless/types';

// Web platform provides no special filesystem capabilities via this service by default.
// Standard file inputs or future Web File System Access API would be handled differently.
export const getWebCapabilities = (): Platform => {
  // Implementation for Web
  return {
    platform: 'web',
    os: undefined, // Typically OS is not directly relevant/detectable reliably in web
    fileSystem: { isAvailable: false },
    // Initialize other capability groups as needed
  };
}; 