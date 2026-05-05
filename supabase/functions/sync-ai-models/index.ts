// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
// Import shared response/error handlers

import { DbAiProvider, SyncResult, ProviderSyncFunction, PROVIDERS_TO_SYNC, SyncAiModelsDeps, defaultDeps } from './sync-ai-models.interface.ts';

// --- Shared Helper Functions (Not dependent on request-specific deps) ---

// Export this function so provider sync files can use it
export async function getCurrentDbModels(supabaseClient: SupabaseClient, providerName: string): Promise<DbAiProvider[]> {
  const { data, error } = await supabaseClient
    .from('ai_providers')
    .select('id, api_identifier, name, description, is_active, provider, config')
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
      // Add req argument
      return createErrorResponse('Unauthorized', 401, req);
  }

  if (req.method !== 'POST') { 
     // Add req argument
     return createErrorResponse('Method Not Allowed', 405, req);
  }

  try {
    // Pass deps to the orchestration function
    const results = await runAllSyncs(deps);
    console.log('Overall sync process completed.', results);
    const overallSuccess = results.every(r => !r.error);
    // Add req argument
    return createJsonResponse({ success: overallSuccess, results }, overallSuccess ? 200 : 500, req);
  } catch (error) {
    console.error('Sync function failed critically (mainHandler level):', error);
    const errorMessage = error instanceof Error ? error.message : String(error ?? 'Sync failed due to a critical internal server error.');
    // Add req argument and pass original error
    return createErrorResponse(errorMessage, 500, req, error);
  }
}

// --- Serve Function --- 
serve((req) => mainHandler(req, defaultDeps)) 

console.log(`Function "sync-ai-models" started.`); // Indicate start