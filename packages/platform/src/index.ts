import { PlatformCapabilities } from '@paynless/types';

// Helper function for detection
const detectPlatform = (): 'web' | 'tauri' | 'react-native' | 'unknown' => {
  // Check for Tauri specific global
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (window as any)?.__TAURI__ !== 'undefined') {
    return 'tauri';
  }
  // Placeholder for React Native detection (e.g., check navigator.product)
  // if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
  //   return 'react-native';
  // }
  // Default to web if in a browser-like environment
  if (typeof window !== 'undefined') {
    return 'web';
  }
  return 'unknown';
};

// Optional OS detection (can be expanded)
// For Tauri, you might use the os module: import { type } from '@tauri-apps/api/os';
// For web/RN, navigator.platform might give hints but is less reliable.
const detectOs = (): PlatformCapabilities['os'] => {
  // Implementation depends on platform and desired granularity
  // Example (very basic web detection):
  // if (typeof navigator !== 'undefined') {
  //   if (/Win/.test(navigator.platform)) return 'windows';
  //   if (/Mac/.test(navigator.platform)) return 'macos';
  //   if (/Linux/.test(navigator.platform)) return 'linux';
  // }
  return undefined; // Or more specific detection using Tauri APIs if platform === 'tauri'
};

let memoizedCapabilities: PlatformCapabilities | null = null;

/**
 * Determines the current platform capabilities.
 * Caches the result after the first call.
 * @returns An object describing the available platform features.
 */
export function getPlatformCapabilities(): PlatformCapabilities {
  if (memoizedCapabilities) {
    return memoizedCapabilities;
  }

  const platform = detectPlatform();
  const os = detectOs(); // Basic OS detection

  // Initialize with defaults (capabilities not available)
  memoizedCapabilities = {
    platform,
    os,
    fileSystem: { isAvailable: false },
    // Add other capabilities here with { isAvailable: false }
  };

  // --- Capability Provider Integration (will happen in later steps) ---
  // if (platform === 'tauri') {
  //   // Import and assign Tauri providers
  //   const { tauriFileSystemCapabilities } = await import('./tauriPlatformCapabilities');
  //   memoizedCapabilities.fileSystem = tauriFileSystemCapabilities;
  // } else if (platform === 'web') {
  //   // Import and assign Web providers
  //   const { webFileSystemCapabilities } = await import('./webPlatformCapabilities');
  //   memoizedCapabilities.fileSystem = webFileSystemCapabilities;
  // }

  console.log('Platform Capabilities Initialized:', memoizedCapabilities);
  return memoizedCapabilities;
}

/**
 * Resets the memoized capabilities. Useful for testing.
 */
export function resetMemoizedCapabilities(): void {
  memoizedCapabilities = null;
} 