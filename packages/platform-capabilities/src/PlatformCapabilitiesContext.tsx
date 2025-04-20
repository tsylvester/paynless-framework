import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { isTauri } from '@tauri-apps/api/core'; // Only import isTauri
// REMOVED direct imports for dialog and tauri namespaces
// import { dialog } from '@tauri-apps/api/dialog';
// import { tauri } from '@tauri-apps/api/tauri';
import type { PlatformCapabilities } from '@paynless/types';
// NOTE: Removed event listener imports

// Import static web provider
import { webFileSystemCapabilities } from './webPlatformCapabilities';
// Import the *factory function* for Tauri capabilities
// import { createTauriFileSystemCapabilities } from './tauriPlatformCapabilities';

// --- Context Definition ---

// Define the initial state / value type
// We use null to indicate that capabilities haven't been determined yet.
type CapabilitiesContextType = PlatformCapabilities | null;

const PlatformCapabilitiesContext = createContext<CapabilitiesContextType>(null);

// --- Provider Component ---

interface PlatformCapabilitiesProviderProps {
  children: ReactNode;
}

// Remove the old global interface declaration for __TAURI_IPC__
// declare global {
//   interface Window {
//     __TAURI_IPC__?: (message: unknown) => void;
//     // __TAURI_METADATA__ could also be added here if used
//   }
// }

// Component function MUST be synchronous
export const PlatformCapabilitiesProvider: React.FC<PlatformCapabilitiesProviderProps> = ({ children }) => {
  const [capabilities, setCapabilities] = useState<CapabilitiesContextType>(null);

  useEffect(() => {
    let isMounted = true;

    // Use an async IIFE inside useEffect to handle the async import
    (async () => {
      // --- Platform Detection Logic --- (as before)
      let detectedPlatform: 'tauri' | 'web' | 'unknown';
      if (isTauri()) {
        detectedPlatform = 'tauri';
      } else if (typeof window !== 'undefined') {
        detectedPlatform = 'web';
      } else {
        detectedPlatform = 'unknown';
      }
      const currentPlatform = detectedPlatform;
      console.log(`PlatformCapabilitiesProvider: Platform detected via isTauri as: ${currentPlatform}`);
      // -------------------------------

      let os: PlatformCapabilities['os'] = undefined;
      const baseCaps: PlatformCapabilities = {
        platform: currentPlatform,
        os,
        fileSystem: { isAvailable: false },
      };

      if (currentPlatform === 'unknown') {
        console.log('PlatformCapabilitiesProvider: Unknown platform, setting base capabilities only.');
        if (isMounted) setCapabilities(baseCaps);
        return;
      }

      try {
        if (currentPlatform === 'web') {
          baseCaps.fileSystem = webFileSystemCapabilities;
          console.log('PlatformCapabilitiesProvider: Using static Web capabilities.');
        } else if (currentPlatform === 'tauri') {
          console.log('PlatformCapabilitiesProvider: Dynamically importing Tauri capabilities factory...');
          // Dynamic import stays here inside the async IIFE
          const { createTauriFileSystemCapabilities } = await import('./tauriPlatformCapabilities');
          const tauriCaps = createTauriFileSystemCapabilities();
          baseCaps.fileSystem = tauriCaps;
          console.log('PlatformCapabilitiesProvider: Tauri capabilities created and assigned.');
        }

        if (isMounted) {
          console.log('PlatformCapabilitiesProvider: Setting final capabilities state:', baseCaps);
          setCapabilities(baseCaps);
        }
      } catch (loadError) {
        console.error('Error loading specific platform capabilities module:', loadError);
        const fallbackCaps = { ...baseCaps, fileSystem: { isAvailable: false } };
        if (isMounted) {
          console.log('PlatformCapabilitiesProvider: Setting base capabilities state after load error:', fallbackCaps);
          setCapabilities(fallbackCaps);
        }
      }
    })(); // End of async IIFE

    return () => {
      isMounted = false;
    };
  }, []); // End of useEffect

  return (
    <PlatformCapabilitiesContext.Provider value={capabilities}>
      {children}
    </PlatformCapabilitiesContext.Provider>
  );
};

// --- Hook Definition ---

export const usePlatformCapabilities = (): CapabilitiesContextType => {
  const context = useContext(PlatformCapabilitiesContext);
  // We don't throw an error if context is null, because null indicates loading state.
  // Consumers of the hook should handle the null case.
  return context;
}; 