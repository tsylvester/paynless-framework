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

    // Refined detection logic
    let detectedPlatform: 'tauri' | 'web' | 'unknown';
    if (typeof window === 'undefined') {
        detectedPlatform = 'unknown';
    } else if (window.__TAURI_IPC__) { // Rely on the synchronous global check
        detectedPlatform = 'tauri';
    } else {
        // Future: Could add checks for React Native navigator.product === 'ReactNative' here
        detectedPlatform = 'web';
    }
    const currentPlatform = detectedPlatform;
    console.log(`PlatformCapabilitiesProvider: Platform detected via checks as: ${currentPlatform}`);

    // Use an async IIFE to handle the dynamic import of the capabilities module
    (async () => {
        let os: PlatformCapabilities['os'] = undefined;
        // TODO: Add OS detection

        const baseCaps: PlatformCapabilities = {
            platform: currentPlatform,
            os,
            fileSystem: { isAvailable: false }, // Start unavailable
        };

        // Add a special check for 'unknown' platform
        if (currentPlatform === 'unknown') {
             console.log('PlatformCapabilitiesProvider: Unknown platform, setting base capabilities only.');
             if (isMounted) setCapabilities(baseCaps);
             return; // Skip capability loading for unknown
        }

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
             // Future: Add else if for 'react-native' here

            if (isMounted) {
                console.log('PlatformCapabilitiesProvider: Setting final capabilities state:', baseCaps);
                setCapabilities(baseCaps);
            }
        } catch (loadError) {
            console.error('Error loading specific platform capabilities module:', loadError);
            // Fallback: Set base capabilities even if specific module fails
            const fallbackCaps = { ...baseCaps, fileSystem: { isAvailable: false } };
            if (isMounted) {
                console.log('PlatformCapabilitiesProvider: Setting base capabilities state after load error:', fallbackCaps);
                setCapabilities(fallbackCaps);
            }
        }
    })(); // Immediately invoke the async function

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