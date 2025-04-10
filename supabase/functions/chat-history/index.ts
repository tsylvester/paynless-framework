// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders as defaultCorsHeaders } from '../_shared/cors-headers.ts'
// Import Chat type if needed for explicit typing (optional)
// import type { Chat } from '../../../packages/types/src/ai.types.ts';

// --- Dependency Injection Setup ---

export interface ChatHistoryHandlerDeps {
  createSupabaseClient: (url: string, key: string, options?: any) => SupabaseClient;
  getEnv: (key: string) => string | undefined;
  corsHeaders: Record<string, string>;
  createJsonResponse: (data: unknown, status?: number, headers?: Record<string, string>) => Response;
  createErrorResponse: (message: string, status?: number, headers?: Record<string, string>) => Response;
}

const defaultDeps: ChatHistoryHandlerDeps = {
  createSupabaseClient: createClient,
  getEnv: Deno.env.get,
  corsHeaders: defaultCorsHeaders,
  createJsonResponse: (data, status = 200, headers = {}) => {
    return new Response(JSON.stringify(data), {
      headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json', ...headers },
      status: status,
    });
  },
  createErrorResponse: (message, status = 500, headers = {}) => {
     return new Response(JSON.stringify({ error: message }), {
       headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json', ...headers },
       status: status,
     });
  },
};

// --- Main Handler Logic ---

export async function mainHandler(req: Request, deps: ChatHistoryHandlerDeps = defaultDeps): Promise<Response> {
  const {
      createSupabaseClient: createSupabaseClientDep,
      getEnv: getEnvDep,
      corsHeaders: corsHeadersDep,
      createJsonResponse,
      createErrorResponse,
  } = deps;

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeadersDep, status: 204 })
  }

  // Ensure the request method is GET
  if (req.method !== 'GET') {
      return createErrorResponse('Method Not Allowed', 405);
  }

  try {
    // --- Auth and Client Initialization ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
       return createErrorResponse('Missing Authorization header', 401);
    }

    const supabaseUrl = getEnvDep('SUPABASE_URL') ?? '';
    const supabaseAnonKey = getEnvDep('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
        return createErrorResponse("Server configuration error.", 500);
    }

    const supabaseClient = createSupabaseClientDep(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } }
    );

    // --- Verify user authentication ---
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('Auth error fetching chat history:', userError);
      return createErrorResponse('Invalid authentication credentials', 401);
    }
    console.log(`Fetching chat history for user: ${user.id}`);

    // --- Fetch Chat History ---
    const { data: chats, error: fetchError } = await supabaseClient
      .from('chats')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false });

    if (fetchError) {
        console.error(`Error fetching chat history for user ${user.id}:`, fetchError);
        if (fetchError.code === 'PGRST116' || fetchError.message.includes('permission denied')) {
            return createErrorResponse('Unauthorized: Could not retrieve chat history.', 403);
        }
        // Directly return a 500 error for other fetch errors
        return createErrorResponse(fetchError.message || 'Failed to fetch chat history from database.', 500);
    }

    console.log(`Found ${chats?.length ?? 0} chat(s) for user ${user.id}`);

    // --- Return Chat History ---
    return createJsonResponse(chats || [], 200);

  } catch (error) {
    // This catch block now only handles truly unexpected errors (e.g., during auth, setup)
    console.error('Unexpected error in chat history function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected internal error occurred';
    return createErrorResponse(errorMessage, 500);
  }
}

// --- Serve Function ---
console.log(`Function "chat-history" up and running!`);
serve((req) => mainHandler(req, defaultDeps)); 