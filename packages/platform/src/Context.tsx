import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
// Remove unused Tauri API import if not needed directly here anymore
// import { isTauri } from '@tauri-apps/api/core'; 
import type { PlatformCapabilities } from '@paynless/types';

// *** Import the centralized service function ***
import { getPlatformCapabilities } from './index';

// Define Default Initial State (Remains the same)
export const DEFAULT_INITIAL_CAPABILITIES: PlatformCapabilities = {
  platform: 'unknown',
  os: 'unknown',
  fileSystem: { isAvailable: false },
};

// Context Definition (Remains the same)
type CapabilitiesContextType = PlatformCapabilities | null; 
const context = createContext<CapabilitiesContextType>(DEFAULT_INITIAL_CAPABILITIES);

// Provider Component
interface PlatformProviderProps {
  children: ReactNode;
}

export const PlatformProvider: React.FC<PlatformProviderProps> = ({ children }) => {
  // State now holds PlatformCapabilities, initialized with default
  const [capabilities, setCapabilities] = useState<PlatformCapabilities>(DEFAULT_INITIAL_CAPABILITIES);

  useEffect(() => {
    let isMounted = true;

    // Reset memoization potentially on mount for fresh data in dev?
    // resetMemoizedCapabilities(); // Optional: uncomment for debugging

    // Call the centralized async function to get capabilities
    getPlatformCapabilities()
      .then(resolvedCaps => {
        if (isMounted) {
          console.log('PlatformProvider: Received capabilities from service:', resolvedCaps);
          setCapabilities(resolvedCaps);
        }
      })
      .catch(err => {
        console.error('PlatformProvider: Error getting capabilities from service:', err);
        if (isMounted) {
          // Set error state and potentially keep default (unavailable) capabilities
          setCapabilities(DEFAULT_INITIAL_CAPABILITIES); 
        }
      })
      .finally(() => {
      });

    // Cleanup function to prevent state updates on unmounted component
    return () => {
      isMounted = false;
    };
    
  // Empty dependency array ensures this runs once on mount
  }, []); 

  // Provide the current capabilities state (or potentially loading/error info)
  // The hook now primarily accesses 'capabilities'
  // isLoading and error could also be added to context if needed globally
  return (
    <context.Provider value={capabilities}>
      {children}
    </context.Provider>
  );
};

// Hook Definition (Remains the same, returns PlatformCapabilities)
export const usePlatform = (): PlatformCapabilities => {
  const capabilitiesContextValue = useContext(context);
  if (capabilitiesContextValue === null) {
    throw new Error('usePlatform must be used within a PlatformProvider');
  }
  return capabilitiesContextValue;
}; 