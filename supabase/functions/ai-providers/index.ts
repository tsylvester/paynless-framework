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

console.log(`Function "ai-providers" up and running!`)

// Define mapping for provider strings to their API key env variable names
const PROVIDER_ENV_KEY_MAP: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  // Add other providers here as they are implemented
};

// --- Dependency Injection Setup ---
export interface AiProvidersHandlerDeps {
  createSupabaseClient: (url: string, key: string) => SupabaseClient;
  getEnv: (key: string) => string | undefined;
  handleCorsPreflightRequest: typeof actualHandleCorsPreflightRequest;
  createJsonResponse: typeof actualCreateJsonResponse;
  createErrorResponse: typeof actualCreateErrorResponse;
}

export const defaultDeps: AiProvidersHandlerDeps = {
  createSupabaseClient: (url, key) => createClient(url, key, { 
    // Add global options if needed, like auth headers for non-anon usage
    // global: { headers: { Authorization: `Bearer ${supabaseServiceRoleKey}` } } 
  }),
  getEnv: Deno.env.get,
  handleCorsPreflightRequest: actualHandleCorsPreflightRequest,
  createJsonResponse: actualCreateJsonResponse,
  createErrorResponse: actualCreateErrorResponse,
};

// --- Main Handler Logic ---
export async function mainHandler(req: Request, deps: AiProvidersHandlerDeps = defaultDeps): Promise<Response> {
  const { 
    createSupabaseClient: createSupabaseClientDep,
    getEnv: getEnvDep,
    handleCorsPreflightRequest,
    createJsonResponse,
    createErrorResponse 
  } = deps;

  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  try {
    // Use Anon key - assuming RLS handles auth if needed, or it's public
    const supabaseUrl = getEnvDep('SUPABASE_URL') ?? '';
    const supabaseAnonKey = getEnvDep('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
        return createErrorResponse("Server configuration error.", 500);
    }
    const supabaseClient = createSupabaseClientDep(supabaseUrl, supabaseAnonKey);

    // Fetch provider column as well
    const { data: allActiveProviders, error } = await supabaseClient
      .from('ai_providers')
      .select('id, name, description, api_identifier, provider') // Add provider
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching providers:', error)
      // Handle specific known errors like RLS if necessary
      if (error.code === 'PGRST116' || error.message.includes('permission denied')) {
         return createErrorResponse('Unauthorized: RLS policy prevented access.', 403);
      } 
      // Throw other DB errors to be caught by the main catch block
      throw error;
    }

    // Filter providers based on configured API keys
    const configuredProviders = allActiveProviders?.filter(providerRecord => {
      // Ensure provider string exists and is known
      if (!providerRecord.provider || !PROVIDER_ENV_KEY_MAP[providerRecord.provider.toLowerCase()]) {
        console.warn(`Provider record ID ${providerRecord.id} has missing or unknown provider string: ${providerRecord.provider}. Skipping.`);
        return false;
      }
      // Check if the corresponding environment variable is set using the injected getter
      const envVarName = PROVIDER_ENV_KEY_MAP[providerRecord.provider.toLowerCase()];
      const apiKeyExists = !!getEnvDep(envVarName); // Use injected getEnvDep
      
      if (!apiKeyExists) {
          console.log(`API Key for provider '${providerRecord.provider}' (env: ${envVarName}) not found. Filtering out model: ${providerRecord.name}`);
      }
      return apiKeyExists;
    }) || []; // Default to empty array if allActiveProviders is null/undefined

    console.log(`Returning ${configuredProviders.length} configured providers.`);

    // Return the filtered list using the injected response creator
    return createJsonResponse({ providers: configuredProviders }, 200);

  } catch (error) {
    console.error('Error in ai-providers function:', error) // Log the raw error
    // Use injected error response creator
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    // Attempt to determine status from error if possible, default to 500
    let errorStatus = 500;
     if (typeof error === 'object' && error !== null && typeof (error as any).status === 'number') {
       errorStatus = (error as any).status;
     } else if (error instanceof Error && typeof (error as any).status === 'number') { // Check Error instance too
        errorStatus = (error as any).status;
     } else if (error instanceof Response) { // Handle if a Response object was thrown
       errorStatus = error.status;
       // Try to get message from Response body if possible
       // errorMessage = await error.text(); // Avoid await in catch if possible
     }

    return createErrorResponse(errorMessage, errorStatus);
  }
}

// --- Serve Function --- 
// Use the mainHandler with default dependencies when serving
serve((req) => mainHandler(req, defaultDeps)) 