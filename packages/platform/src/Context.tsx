import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
// Remove unused Tauri API import if not needed directly here anymore
// import { isTauri } from '@tauri-apps/api/core'; 
import type { PlatformCapabilities } from '@paynless/types';
// Import listen
// Removed: import { listen } from '@tauri-apps/api/event'; 
// Import Event type from @tauri-apps/api/event
import { Event as TauriEvent } from '@tauri-apps/api/event'; 
// Import window-specific types
import { getCurrentWindow, DragDropEvent } from '@tauri-apps/api/window'; 
import { platformEventEmitter } from './events'; // Import emitter

// *** Import the centralized service function ***
import { getPlatformCapabilities } from './index';

// Define Default Initial State (Remains the same)
export const DEFAULT_INITIAL_CAPABILITIES: PlatformCapabilities = {
  platform: 'unknown',
  os: 'unknown',
  fileSystem: { isAvailable: false },
};

// *** Import the type instead ***
import type { CapabilitiesContextValue } from '@paynless/types';

// Context Definition using the imported type
const context = createContext<CapabilitiesContextValue | undefined>(undefined);

// Provider Component
interface PlatformProviderProps {
  children: ReactNode;
}

export const PlatformProvider: React.FC<PlatformProviderProps> = ({ children }) => {
  // *** State now includes loading and error ***
  const [capabilities, setCapabilities] = useState<PlatformCapabilities | null>(null); // Start as null
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState<boolean>(true);
  const [capabilityError, setCapabilityError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingCapabilities(true); // Set loading true at the start of effect
    setCapabilityError(null); // Clear previous errors
    // Start with null capabilities until resolved
    // setCapabilities(null); // Already initialized as null

    getPlatformCapabilities()
      .then(resolvedCaps => {
        if (isMounted) {
          console.log('PlatformProvider: Received capabilities from service:', resolvedCaps);
          setCapabilities(resolvedCaps);
          setCapabilityError(null); // Clear error on success
        }
      })
      .catch(err => {
        console.error('PlatformProvider: Error getting platform capabilities:', err);
        if (isMounted) {
          // Set error state and keep capabilities null (or set to default)
          setCapabilityError(err instanceof Error ? err : new Error(String(err)));
          setCapabilities(null); // Or potentially setCapabilities(DEFAULT_INITIAL_CAPABILITIES);
        }
      })
      .finally(() => {
        // Ensure loading is set to false regardless of success/error, if mounted
        if (isMounted) {
          setIsLoadingCapabilities(false);
        }
      });

    // Cleanup function
    return () => {
      isMounted = false;
    };
    
  }, []); 

  // *** ADDED new listener using onDragDropEvent ***
  useEffect(() => {
    let unlistenDragDrop: (() => void) | undefined;

    if (capabilities?.platform === 'tauri') {
      console.log('[PlatformProvider] Setting up Tauri onDragDropEvent listener...');
      const setupListener = async () => {
        try {
          // Use getCurrentWindow() to get the window instance
          const currentWindow = getCurrentWindow(); 
          // The event itself is the payload, no nested .payload
          unlistenDragDrop = await currentWindow.onDragDropEvent((event: TauriEvent<DragDropEvent>) => {
            console.log('[PlatformProvider] onDragDropEvent received:', event.payload.type, event.payload);
            // Map Tauri event types to our event emitter events
            switch (event.payload.type) {
              case 'enter': // File dragged into the window area
              case 'over': // File dragged over the window area
                // Indicate hover state to UI
                platformEventEmitter.emit('file-drag-hover');
                break;
              case 'drop':
                // Pass file paths to UI
                if (event.payload.paths && event.payload.paths.length > 0) {
                  platformEventEmitter.emit('file-drop', event.payload.paths);
                }
                // Also signal end of hover after drop
                platformEventEmitter.emit('file-drag-cancel'); 
                break;
              case 'leave': // File dragged out of the window area
                // Indicate end of hover state
                platformEventEmitter.emit('file-drag-cancel');
                break;
              default:
                // Should not happen with current types, but good practice
                break;
            }
          });
          console.log('[PlatformProvider] onDragDropEvent listener attached.');
        } catch (error) {
          console.error('[PlatformProvider] Failed to attach onDragDropEvent listener:', error);
        }
      };
      setupListener();
    }

    // Cleanup function
    return () => {
      if (unlistenDragDrop) {
        console.log('[PlatformProvider] Cleaning up Tauri onDragDropEvent listener.');
        unlistenDragDrop(); // Corrected variable name
      }
    };
  }, [capabilities?.platform]); // Re-run if platform detection changes

  const value = useMemo(() => ({
     capabilities,
     isLoadingCapabilities,
     capabilityError,
   }), [capabilities, isLoadingCapabilities, capabilityError]);

  return (
    <context.Provider value={value}>
      {children}
    </context.Provider>
  );
};

// *** Updated Hook Definition ***
export const usePlatform = (): CapabilitiesContextValue => {
  const contextValue = useContext(context);
  if (contextValue === undefined) {
    throw new Error('usePlatform must be used within a PlatformProvider');
  }
  return contextValue;
}; 