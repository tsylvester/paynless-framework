import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { PlatformCapabilities } from '@paynless/types';
import { isTauri } from '@tauri-apps/api/core'; // Restore reliable check
// NOTE: Removed event listener imports

// Import static web provider
import { webFileSystemCapabilities } from './webPlatformCapabilities';
// Import Tauri provider type for dynamic import result
import type { tauriFileSystemCapabilities as TauriFSType } from './tauriPlatformCapabilities';

// --- Context Definition ---

// Define the initial state / value type
// We use null to indicate that capabilities haven't been determined yet.
type CapabilitiesContextType = PlatformCapabilities | null;

const PlatformCapabilitiesContext = createContext<CapabilitiesContextType>(null);

// --- Provider Component ---

interface PlatformCapabilitiesProviderProps {
  children: ReactNode;
}

export const PlatformCapabilitiesProvider: React.FC<PlatformCapabilitiesProviderProps> = ({ children }) => {
  const [capabilities, setCapabilities] = useState<CapabilitiesContextType>(null);

  useEffect(() => {
    let isMounted = true;

    // Use the reliable synchronous check
    const currentPlatform = isTauri ? 'tauri' : (typeof window !== 'undefined' ? 'web' : 'unknown');
    console.log(`PlatformCapabilitiesProvider: isTauri check indicates platform: ${currentPlatform}`);

    const initializeCapabilities = async () => {
        let os: PlatformCapabilities['os'] = undefined;
        // TODO: Add OS detection

        const baseCaps: PlatformCapabilities = {
          platform: currentPlatform,
          os,
          fileSystem: { isAvailable: false }, // Start unavailable
        };

        try {
          if (currentPlatform === 'web') {
            baseCaps.fileSystem = webFileSystemCapabilities;
            console.log('PlatformCapabilitiesProvider: Using static Web capabilities.');
          } else if (currentPlatform === 'tauri') {
            console.log('PlatformCapabilitiesProvider: Dynamically importing LOCAL Tauri capabilities module...');
            const tauriModule = await import('./tauriPlatformCapabilities');
            baseCaps.fileSystem = tauriModule.tauriFileSystemCapabilities;
            console.log('PlatformCapabilitiesProvider: Local Tauri capabilities loaded and assigned.');
          }

          if (isMounted) {
            console.log('PlatformCapabilitiesProvider: Setting final capabilities state:', baseCaps);
            setCapabilities(baseCaps);
          }
        } catch (loadError) {
          console.error('Error loading specific platform capabilities module:', loadError);
          if (isMounted) {
            console.log('PlatformCapabilitiesProvider: Setting base capabilities state after load error:', baseCaps);
            setCapabilities(baseCaps);
          }
        }
      };

      initializeCapabilities();

    return () => {
      isMounted = false;
    };
  }, []);

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