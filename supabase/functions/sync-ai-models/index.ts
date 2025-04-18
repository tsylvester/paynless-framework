// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
// Import shared response/error handlers
import { 
    handleCorsPreflightRequest as actualHandleCorsPreflightRequest, 
    createErrorResponse as actualCreateErrorResponse, 
    createSuccessResponse as actualCreateJsonResponse 
} from '../_shared/cors-headers.ts'; 

// Import provider-specific sync functions
import { syncOpenAIModels as actualSyncOpenAIModels } from './openai_sync.ts';
import { syncAnthropicModels as actualSyncAnthropicModels } from './anthropic_sync.ts';
import { syncGoogleModels as actualSyncGoogleModels } from './google_sync.ts';

// Import shared types used by this function and potentially by tests
import type { AiProviderAdapter, ProviderModelInfo } from '../_shared/types.ts';
// DbAiProvider and SyncResult are defined below and implicitly exported when mainHandler uses them
// Provider files should import { type DbAiProvider, type SyncResult } from './index.ts'

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
}

// Structure for sync results
// Exporting this so provider files can import it
export interface SyncResult {
  provider: string;
  inserted: number;
  updated: number;
  deactivated: number;
  error?: string;
}

type ProviderSyncFunction = (client: SupabaseClient, key: string) => Promise<SyncResult>;

// --- Dependency Injection Setup ---
export interface SyncAiModelsDeps {
  createSupabaseClient: (url: string, key: string) => SupabaseClient;
  getEnv: (key: string) => string | undefined;
  handleCorsPreflightRequest: typeof actualHandleCorsPreflightRequest;
  createJsonResponse: typeof actualCreateJsonResponse;
  createErrorResponse: typeof actualCreateErrorResponse;
  // Include the sync functions in dependencies for mocking
  doOpenAiSync: ProviderSyncFunction;
  doAnthropicSync: ProviderSyncFunction;
  doGoogleSync: ProviderSyncFunction;
}

export const defaultDeps: SyncAiModelsDeps = {
  createSupabaseClient: (url, key) => createClient(url, key), // Use actual createClient
  getEnv: Deno.env.get,
  handleCorsPreflightRequest: actualHandleCorsPreflightRequest,
  createJsonResponse: actualCreateJsonResponse,
  createErrorResponse: actualCreateErrorResponse,
  // Provide the actual imported functions
  doOpenAiSync: actualSyncOpenAIModels,
  doAnthropicSync: actualSyncAnthropicModels,
  doGoogleSync: actualSyncGoogleModels,
};

// --- Provider Configuration (Internal - Uses deps) ---
// Moved inside mainHandler or runAllSyncs if it needs deps, or keep static if not.
// Keeping static is fine here as it only defines structure.
interface ProviderSyncConfig {
  providerName: string;        
  apiKeyEnvVar: string;       
  // We'll map the provider name to the correct function from deps later
}

const PROVIDERS_TO_SYNC: ProviderSyncConfig[] = [
  { providerName: 'openai', apiKeyEnvVar: 'OPENAI_API_KEY' },
  { providerName: 'anthropic', apiKeyEnvVar: 'ANTHROPIC_API_KEY' },
  { providerName: 'google', apiKeyEnvVar: 'GOOGLE_API_KEY' },
];

// --- Shared Helper Functions (Not dependent on request-specific deps) ---

// Export this function so provider sync files can use it
export async function getCurrentDbModels(supabaseClient: SupabaseClient, providerName: string): Promise<DbAiProvider[]> {
  const { data, error } = await supabaseClient
    .from('ai_providers')
    .select('id, api_identifier, name, description, is_active, provider')
    .eq('provider', providerName);

  if (error) {
    console.error(`Error fetching DB models for provider ${providerName}:`, error);
    throw new Error(`Database error fetching models for ${providerName}: ${error.message}`);
  }
  return data || [];
}

// --- Main Sync Orchestration Logic (Uses deps) ---

async function runAllSyncs(deps: SyncAiModelsDeps): Promise<SyncResult[]> {
  const { getEnv, createSupabaseClient, doOpenAiSync, doAnthropicSync, doGoogleSync } = deps;
  console.log('Starting all AI model syncs...');
  const results: SyncResult[] = [];

  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for admin client.');
    throw new Error('Server configuration error: Supabase admin credentials not found.');
  }

  const supabaseAdminClient = createSupabaseClient(supabaseUrl, serviceRoleKey);
  
  // Map provider names to their sync functions from dependencies
  const syncFunctionMap: Record<string, ProviderSyncFunction> = {
      openai: doOpenAiSync,
      anthropic: doAnthropicSync,
      google: doGoogleSync,
  };

  for (const config of PROVIDERS_TO_SYNC) {
    const apiKey = getEnv(config.apiKeyEnvVar);
    const syncFunction = syncFunctionMap[config.providerName]; // Get the function from the map

    if (!apiKey) {
      console.log(`API Key (${config.apiKeyEnvVar}) not found for provider ${config.providerName}. Skipping sync.`);
      results.push({ provider: config.providerName, inserted: 0, updated: 0, deactivated: 0, error: 'API key not configured' });
      continue; 
    }
    
    if (!syncFunction) {
        console.warn(`No sync function found in deps for provider ${config.providerName}. Skipping sync.`);
        results.push({ provider: config.providerName, inserted: 0, updated: 0, deactivated: 0, error: 'No sync function available' });
        continue;
    }

    try {
        console.log(`--- Starting sync for provider: ${config.providerName} ---`);
        // Call the sync function obtained from dependencies
        const providerResult = await syncFunction(supabaseAdminClient, apiKey);
        results.push(providerResult);
        console.log(`--- Sync finished for provider: ${config.providerName} ---`);
    } catch (error) {
        console.error(`!!! Sync failed critically for provider ${config.providerName}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown critical error during sync');
        results.push({ 
            provider: config.providerName, 
            inserted: 0, updated: 0, deactivated: 0, 
            error: errorMessage 
        });
    }
  }

  console.log('Finished all AI model syncs.');
  return results;
}

// --- Exported Main Handler ---
export async function mainHandler(req: Request, deps: SyncAiModelsDeps = defaultDeps): Promise<Response> {
  const { handleCorsPreflightRequest, createJsonResponse, createErrorResponse, getEnv } = deps;

  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // --- Security Check ---
  const syncSecret = getEnv('SYNC_SECRET');
  const authHeader = req.headers.get('X-Sync-Secret');
  const isAuthorized = (syncSecret && authHeader && authHeader === syncSecret) || !syncSecret; 

  if (!isAuthorized) {
      console.warn('Unauthorized sync attempt received.');
      // Use injected error response creator
      return createErrorResponse('Unauthorized', 401);
  }

  if (req.method !== 'POST') { 
     // Use injected error response creator
     return createErrorResponse('Method Not Allowed', 405);
  }

  try {
    // Pass deps to the orchestration function
    const results = await runAllSyncs(deps);
    console.log('Overall sync process completed.', results);
    const overallSuccess = results.every(r => !r.error);
    // Use injected response creator
    return createJsonResponse({ success: overallSuccess, results }, overallSuccess ? 200 : 500);
  } catch (error) {
    console.error('Sync function failed critically (mainHandler level):', error);
    const errorMessage = error instanceof Error ? error.message : String(error ?? 'Sync failed due to a critical internal server error.');
    // Use injected error response creator
    return createErrorResponse(errorMessage, 500);
  }
}

// --- Serve Function --- 
serve((req) => mainHandler(req, defaultDeps)) 

console.log(`Function "sync-ai-models" started.`); // Indicate start