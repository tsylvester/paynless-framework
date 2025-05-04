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

// *** Updated Context Type ***
interface CapabilitiesContextValue {
  capabilities: PlatformCapabilities | null; // Can be null initially or on error
  isLoadingCapabilities: boolean;
  capabilityError: Error | null;
}

// Context Definition using the new type
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

  // *** Provide the full state object ***
  const contextValue: CapabilitiesContextValue = {
    capabilities,
    isLoadingCapabilities,
    capabilityError,
  };

  return (
    <context.Provider value={contextValue}>
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