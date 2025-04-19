import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { PlatformCapabilities } from '@paynless/types';
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

declare global {
  interface Window {
    __TAURI_IPC__?: (message: unknown) => void;
    // __TAURI_METADATA__ could also be added here if used
  }
}

export const PlatformCapabilitiesProvider: React.FC<PlatformCapabilitiesProviderProps> = ({ children }) => {
  const [capabilities, setCapabilities] = useState<CapabilitiesContextType>(null);

  useEffect(() => {
    let isMounted = true;

    // Simplified detection logic: Use synchronous global check only
    const isTauriPlatform = typeof window !== 'undefined' && !!window.__TAURI_IPC__;
    const currentPlatform = isTauriPlatform ? 'tauri' : 'web';
    console.log(`PlatformCapabilitiesProvider: Platform detected via global check as: ${currentPlatform}`);

    // Use an async IIFE to handle the dynamic import of the capabilities module
    (async () => {
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
                // Dynamic import of the *specific capabilities implementation*
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
                setCapabilities(baseCaps); // Set base caps even if specific load fails
            }
        }
    })(); // Immediately invoke the async function

    return () => {
        isMounted = false;
    };
}, []); // Empty dependency array ensures this runs once on mount

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