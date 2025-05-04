import {
  PlatformCapabilities,
  OperatingSystem,
  CapabilityUnavailable,
  FileSystemCapabilities
} from '@paynless/types';
import { isTauri } from '@tauri-apps/api/core'; // Use official Tauri detector

// --- Re-export Context and Hook ---
export { PlatformProvider, usePlatform } from './Context';
// -----------------------------------

// Platform Detection (using Tauri API)
const detectPlatform = (): PlatformCapabilities['platform'] => {
  if (isTauri()) {
    return 'tauri';
  }
  // Placeholder for React Native detection
  // if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
  //   return 'react-native';
  // }
  if (typeof window !== 'undefined') {
    return 'web';
  }
  return 'unknown';
};

// OS Detection (Synchronous for now, Tauri part can be enhanced later if needed async)
const detectOs = (): OperatingSystem => {
  // TODO: Enhance Tauri OS detection if needed (could involve async import)
  // For now, basic web detection is sufficient for sync operation.
  if (typeof navigator !== 'undefined') {
      const platform = navigator.platform.toLowerCase();
      if (platform.startsWith('win')) return 'windows';
      if (platform.startsWith('mac')) return 'macos';
      if (platform.startsWith('linux')) return 'linux';
      // Basic mobile detection (less reliable)
      if (/iphone|ipad|ipod/.test(platform)) return 'ios'; 
      if (/android/.test(platform)) return 'android';
  }
  return 'unknown'; // Default required value
};

// Memoization Cache
let memoizedCapabilities: PlatformCapabilities | null = null;

// Default unavailable file system object conforming to the type
const unavailableFileSystem: CapabilityUnavailable = {
  isAvailable: false,
} as const;

/**
 * Determines the current platform capabilities by detecting the platform and OS,
 * then dynamically loading and returning the appropriate capability providers.
 * Caches the result after the first call.
 * @returns A Promise resolving to an object describing the available platform features.
 */
export async function getPlatformCapabilities(): Promise<PlatformCapabilities> {
  if (memoizedCapabilities) {
    return memoizedCapabilities;
  }

  const detectedPlatform = detectPlatform();
  const detectedOs = detectOs(); // Sync OS detection for now

  let fileSystemProvider: FileSystemCapabilities | CapabilityUnavailable = unavailableFileSystem;
  
  try {
    if (detectedPlatform === 'web') {
      // Dynamically import static web capabilities
      const { getWebCapabilities } = await import('./web');
      // Assuming getWebCapabilities now returns the correct FileSystem part
      const webCaps = getWebCapabilities(); // Might need update if getWebCapabilities changes structure
      fileSystemProvider = webCaps.fileSystem; // Assign the fileSystem part
      console.log('Platform Service: Using Web capabilities.');

    } else if (detectedPlatform === 'tauri') {
      // Dynamically import Tauri capabilities factory
      const { createTauriFileSystemCapabilities } = await import('./tauri');
      // Call factory to get the capabilities object
      const tauriCaps = createTauriFileSystemCapabilities(); // Factory returns FileSystemCapabilities
      fileSystemProvider = tauriCaps;
      console.log('Platform Service: Using Tauri capabilities.');
      // Note: If OS detection needed Tauri APIs, it would be async and done here.
    }
  } catch (error) {
    console.error('Platform Service: Error loading platform providers:', error);
    // Keep fileSystemProvider as unavailableFileSystem on error
  }

  // Assemble the final capabilities object
  memoizedCapabilities = {
    platform: detectedPlatform,
    os: detectedOs,
    fileSystem: fileSystemProvider,
    // Initialize other future capability groups here as unavailable, e.g.:
    // notifications: { isAvailable: false }, 
  };

  console.log('Platform Service: Capabilities Initialized:', memoizedCapabilities);
  return memoizedCapabilities;
}

/**
 * Resets the memoized capabilities. Useful for testing.
 */
export function resetMemoizedCapabilities(): void {
  memoizedCapabilities = null;
}

// Re-export core types
export * from '@paynless/types';