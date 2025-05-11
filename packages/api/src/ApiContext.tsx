import { createContext, useContext, useMemo, ReactNode, FC } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ApiClient } from './apiClient'; // Import the class definition
import { logger } from '@paynless/utils';

// Define the shape of the context value
interface ApiContextValue {
  apiClient: ApiClient | null;
  // We could add loading/error states here if needed
}

// Create the context
const ApiContext = createContext<ApiContextValue | undefined>(undefined);

// Define props for the provider
interface ApiProviderProps {
  children: ReactNode;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

// Use FC for component type
export const ApiProvider: FC<ApiProviderProps> = ({ children, supabaseUrl, supabaseAnonKey }) => {
  // Create the Supabase client and ApiClient instance only once
  const apiClient = useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      logger.error('[ApiProvider] Supabase URL or Anon Key missing. Cannot create ApiClient.');
      return null;
    }
    try {
      logger.info('[ApiProvider] Creating new SupabaseClient and ApiClient instance...');
      const supabase = createClient(supabaseUrl, supabaseAnonKey, { /* ... auth config ... */ });
      const client = new ApiClient({
        supabase: supabase,
        supabaseUrl: supabaseUrl,
        supabaseAnonKey: supabaseAnonKey,
      });
      logger.info('[ApiProvider] ApiClient instance created successfully.');
      return client;
    } catch (error) {
      logger.error('[ApiProvider] Error creating ApiClient instance:', { error });
      return null;
    }
  }, [supabaseUrl, supabaseAnonKey]); // Dependencies ensure recreation only if config changes

  // Provide the client instance through context
  const contextValue = useMemo(() => ({ apiClient }), [apiClient]);

  return (
    <ApiContext.Provider value={contextValue}>
      {children}
    </ApiContext.Provider>
  );
};

// Custom hook to consume the context
export const useApi = (): ApiClient => {
  const context = useContext(ApiContext);
  if (context === undefined) {
    throw new Error('useApi must be used within an ApiProvider');
  }
  if (context.apiClient === null) {
    // This indicates an initialization error within the provider
    logger.error('useApi: ApiClient is null. Check ApiProvider logs for initialization errors.');
    throw new Error('ApiClient not available. Initialization failed.');
  }
  return context.apiClient;
}; 