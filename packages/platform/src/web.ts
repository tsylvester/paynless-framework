import type {
  CapabilityUnavailable,
  OperatingSystem,
} from '@paynless/types';

// Web platform provides no special filesystem capabilities via this service by default.
// Standard file inputs or future Web File System Access API would be handled differently.

const unavailableFileSystem: CapabilityUnavailable = {
  isAvailable: false,
} as const;

// Define a structure specifically for the web provider's return value
// It provides the fileSystem part, aligning with how index.ts uses it.
interface WebCapabilitiesResult {
  platform: 'web';
  os: OperatingSystem;
  fileSystem: CapabilityUnavailable;
}

export const getWebCapabilities = (): WebCapabilitiesResult => {
  // Basic OS detection for web
  let detectedOs: OperatingSystem = 'unknown';
  if (typeof navigator !== 'undefined') {
    const platform = navigator.platform.toLowerCase();
    if (platform.startsWith('win')) detectedOs = 'windows';
    else if (platform.startsWith('mac')) detectedOs = 'macos';
    else if (platform.startsWith('linux')) detectedOs = 'linux';
    else if (/iphone|ipad|ipod/.test(platform)) detectedOs = 'ios'; 
    else if (/android/.test(platform)) detectedOs = 'android';
  }

  return {
    platform: 'web',
    os: detectedOs, // Include detected OS, even if it's 'unknown'
    fileSystem: unavailableFileSystem, // Use the typed object
    // Other capabilities would also be CapabilityUnavailable here
  };
}; 