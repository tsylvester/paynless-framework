import { SupabaseClient, createClient } from 'npm:@supabase/supabase-js@2';
import { Json } from '../types_db.ts';
import { handleCorsPreflightRequest, createSuccessResponse, createErrorResponse } from '../_shared/cors-headers.ts';
import { syncOpenAIModels, defaultSyncOpenAIDeps } from './openai_sync.ts';
import { syncAnthropicModels, defaultSyncAnthropicDeps } from './anthropic_sync.ts';
import { syncGoogleModels, defaultSyncGoogleDeps } from './google_sync.ts';

// --- Types specific to this function ---

// Structure of the DB ai_providers table
// Exporting this so provider files can import it
export interface DbAiProvider {
    id: string;
    api_identifier: string;
    name: string;
    description: string | null;
    is_active: boolean;
    provider: string; 
    config: Json | null;
  }
  
  // Structure for sync results
  // Exporting this so provider files can import it
  export interface SyncResult {
    provider: string;
    inserted: number;
    updated: number;
    deactivated: number;
    error?: string;
    debug_data?: unknown;
  }
  
  export type ProviderSyncFunction = (client: SupabaseClient, key: string) => Promise<SyncResult>;
  
  // --- Dependency Injection Setup ---
  export interface SyncAiModelsDeps {
    createSupabaseClient: (url: string, key: string) => SupabaseClient;
    getEnv: (key: string) => string | undefined;
    handleCorsPreflightRequest: typeof handleCorsPreflightRequest;
    createJsonResponse: typeof createSuccessResponse;
    createErrorResponse: typeof createErrorResponse;
    // Include the sync functions in dependencies for mocking
    doOpenAiSync: ProviderSyncFunction;
    doAnthropicSync: ProviderSyncFunction;
    doGoogleSync: ProviderSyncFunction;
  }
  
  export const defaultDeps: SyncAiModelsDeps = {
    createSupabaseClient: (url, key) => createClient(url, key),
    getEnv: Deno.env.get,
    handleCorsPreflightRequest,
    createJsonResponse: createSuccessResponse,
    createErrorResponse,
    // Provide wrapper functions that call the actual sync functions with their default deps
    doOpenAiSync: (client, key) => syncOpenAIModels(client, key, defaultSyncOpenAIDeps),
    doAnthropicSync: (client, key) => syncAnthropicModels(client, key, defaultSyncAnthropicDeps),
    doGoogleSync: (client, key) => syncGoogleModels(client, key, defaultSyncGoogleDeps),
  };
  
  // --- Provider Configuration (Internal - Uses deps) ---
  // Moved inside mainHandler or runAllSyncs if it needs deps, or keep static if not.
  // Keeping static is fine here as it only defines structure.
  export interface ProviderSyncConfig {
    providerName: string;        
    apiKeyEnvVar: string;       
    // We'll map the provider name to the correct function from deps later
  }
  
  export const PROVIDERS_TO_SYNC: ProviderSyncConfig[] = [
    { providerName: 'openai', apiKeyEnvVar: 'OPENAI_API_KEY' },
    { providerName: 'anthropic', apiKeyEnvVar: 'ANTHROPIC_API_KEY' },
    { providerName: 'google', apiKeyEnvVar: 'GOOGLE_API_KEY' },
  ];
  