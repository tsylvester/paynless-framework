import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { isTauri } from '@tauri-apps/api/core'; // Only import isTauri
// REMOVED direct imports for dialog and tauri namespaces
// import { dialog } from '@tauri-apps/api/dialog';
// import { tauri } from '@tauri-apps/api/tauri';
import type { Platform } from '@paynless/types';
// NOTE: Removed event listener imports

// Import static web provider function
import { getWebCapabilities } from './web';
// Import the *factory function* for Tauri capabilities
// import { createTauriFileSystemCapabilities } from './tauriPlatformCapabilities';

// --- Define Default Initial State ---
// Exporting this might be useful for consumers or tests
export const DEFAULT_INITIAL_CAPABILITIES: Platform = {
  platform: 'unknown', // Start as unknown
  os: undefined,
  fileSystem: { isAvailable: false },
  // Initialize other capability groups here if they exist
  // e.g., notifications: { isAvailable: false },
};

// --- Context Definition ---
// The context type remains the same, but it should never actually be null now.
// However, keeping the type allows flexibility if we revert or change strategy.
type CapabilitiesContextType = Platform | null; 

// Initialize context with the default non-null state
const context = createContext<CapabilitiesContextType>(DEFAULT_INITIAL_CAPABILITIES);

// --- Provider Component ---

interface PlatformProviderProps {
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
export const PlatformProvider: React.FC<PlatformProviderProps> = ({ children }) => {
  // Initialize state with the default non-null object
  const [capabilities, setCapabilities] = useState<Platform>(DEFAULT_INITIAL_CAPABILITIES);
  // Add state to track API initialization
  const [apiInitialized, setApiInitialized] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // Only run initialization once
    if (apiInitialized) {
      // logger.debug('[PlatformCapabilitiesProvider] API already initialized, skipping effect run.');
      return; 
    }

    (async () => {
      // --- Platform Detection Logic --- (Keep existing detection)
      let detectedPlatform: 'tauri' | 'web' | 'unknown';
      if (isTauri()) {
        detectedPlatform = 'tauri';
      } else if (typeof window !== 'undefined') {
        detectedPlatform = 'web';
      } else {
        detectedPlatform = 'unknown';
      }
      const currentPlatform = detectedPlatform;
      console.log(`Platform: detected via isTauri as: ${currentPlatform}`);
      // -------------------------------

      // Start building the final capabilities state based on detection
      // Use a temporary variable to build the state before setting it
      let finalCaps: Platform = {
        ...DEFAULT_INITIAL_CAPABILITIES, // Start with defaults
        platform: currentPlatform, 
        os: undefined, // Reset OS, determine if needed later
      };


      if (currentPlatform === 'unknown') {
        console.log('Platform: Unknown platform, keeping base capabilities.');
        // No state update needed if it remains the same as default initial
        // if (isMounted) setCapabilities(finalCaps); // Only set if different or needed
        return; 
      }

      try {
        if (currentPlatform === 'web') {
          // Call the function to get the capabilities object
          const webCaps = getWebCapabilities();
          finalCaps.fileSystem = webCaps.fileSystem;
          console.log('Platform: Using static Web capabilities.');
        } else if (currentPlatform === 'tauri') {
          console.log('Platform: Dynamically importing Tauri capabilities factory...');
          const { createTauriFileSystemCapabilities } = await import('./tauri');
          // ---> Call factory without dependencies <--- 
          const tauriCaps = createTauriFileSystemCapabilities(); 
          finalCaps.fileSystem = tauriCaps;
          // Potentially detect OS here if needed using tauri API
          // const { type } = await import('@tauri-apps/api/os');
          // finalCaps.os = await type(); // Example OS detection
          console.log('Platform: Tauri capabilities created and assigned.');
        }
        
        // Set the final determined state
        if (isMounted) {
          console.log('Platform: Setting final capabilities state:', finalCaps);
          setCapabilities(finalCaps);

          // Initialize API Client and Listener AFTER setting capabilities
          if (!apiInitialized) {
            // ... API and Listener Init Logic ...
             setApiInitialized(true); // Mark as initialized
          } 
        }
      } catch (loadError) {
        console.error('Error loading or determining specific platform capabilities:', loadError);
        // Fallback: Keep the detected platform but ensure capabilities are marked unavailable
        const fallbackCaps: Platform = {
           ...DEFAULT_INITIAL_CAPABILITIES, // Start with defaults
           platform: currentPlatform, // Keep detected platform
           // Ensure filesystem is marked as unavailable on error
           fileSystem: { isAvailable: false }, 
        };
        if (isMounted) {
          console.log('Platform: Setting fallback capabilities state after error:', fallbackCaps);
          setCapabilities(fallbackCaps);
        }
      }
    })(); // End of async IIFE

    return () => {
      isMounted = false;
    };
  }, [apiInitialized]); // End of useEffect

  // Render children immediately, provide default value while loading
  // The context value will update once capabilities are loaded.
  return (
    <context.Provider value={capabilities}>
      {children}
    </context.Provider>
  );
};

// --- Hook Definition ---
export const usePlatform = (): Platform => {
  // Rename the variable holding the context value
  const capabilitiesContextValue = useContext(context);
  // Check the renamed variable
  if (capabilitiesContextValue === null) {
    throw new Error('usePlatform must be used within a PlatformProvider');
  }
  // Return the renamed variable
  return capabilitiesContextValue;
}; 