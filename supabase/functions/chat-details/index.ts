// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders as defaultCorsHeaders } from '../_shared/cors-headers.ts'

console.log(`Function "chat-details" up and running!`)

// --- Dependency Injection Setup ---

export interface ChatDetailsHandlerDeps {
  createSupabaseClient: (url: string, key: string, options?: any) => SupabaseClient;
  getEnv: (key: string) => string | undefined;
  corsHeaders: Record<string, string>;
  createJsonResponse: (data: unknown, status?: number, headers?: Record<string, string>) => Response;
  createErrorResponse: (message: string, status?: number, headers?: Record<string, string>) => Response;
}

const defaultDeps: ChatDetailsHandlerDeps = {
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

export async function mainHandler(req: Request, deps: ChatDetailsHandlerDeps = defaultDeps): Promise<Response> {
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
    // --- Extract chatId from URL --- 
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const chatId = pathParts[pathParts.length - 1]; // Get the last part of the path

    if (!chatId || chatId === 'chat-details') { // Basic validation
        return createErrorResponse('Missing or invalid chatId in URL path.', 400);
    }
    console.log(`Fetching details for chat ID: ${chatId}`);

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
      console.error(`Auth error fetching details for chat ${chatId}:`, userError);
      return createErrorResponse('Invalid authentication credentials', 401);
    }
    console.log(`User ${user.id} requesting details for chat ${chatId}`);

    // --- Fetch Chat Messages ---
    // RLS policy on 'chat_messages' should ensure users can only select messages
    // from chats they own.
    const { data: messages, error: fetchError } = await supabaseClient
      .from('chat_messages')
      .select('*') // Select all fields for messages
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (fetchError) {
        console.error(`Error fetching messages for chat ${chatId} (User: ${user.id}):`, fetchError);
        if (fetchError.code === 'PGRST116' || fetchError.message.includes('permission denied')) {
            return createErrorResponse('Unauthorized: Could not retrieve messages for this chat.', 403);
        }
         // Check if the error is simply "No rows found" which might be valid if the chatId was wrong but permitted by RLS somehow?
        if (fetchError.code === 'PGRST116' && fetchError.details?.includes('Results contain 0 rows')) {
             // Let's verify the chat exists for the user first for a better 404
             const { data: chatExists } = await supabaseClient.from('chats').select('id').eq('id', chatId).maybeSingle();
             if (!chatExists) {
                  return createErrorResponse('Chat not found or access denied.', 404);
             } // If chat exists, return empty array later
        }
        // Otherwise, return a generic DB error
        return createErrorResponse(fetchError.message || 'Failed to fetch messages from database.', 500);
    }

    // Check if messages is null/empty *after* handling errors
    if (!messages || messages.length === 0) {
        // To be certain the chat exists, double-check (RLS applies here too)
        const { data: chatExists } = await supabaseClient
            .from('chats')
            .select('id')
            .eq('id', chatId)
            .maybeSingle();

        if (!chatExists) {
            console.log(`Chat ${chatId} not found or inaccessible for user ${user.id} after message check.`);
             return createErrorResponse('Chat not found or access denied.', 404);
        }
        console.log(`Chat ${chatId} found for user ${user.id}, but it has no messages.`);
        // Return empty array if chat exists but has no messages
        return createJsonResponse([], 200);
    }

    console.log(`Found ${messages?.length ?? 0} message(s) for chat ${chatId}`);

    // --- Return Messages --- 
    // ** Return the array directly **
    return createJsonResponse(messages, 200);

  } catch (error) {
    console.error('Chat details function error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected internal error occurred';
    // Try to infer status code from error if possible, default to 500
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 500;
    return createErrorResponse(errorMessage, status);
  }
}

// --- Serve Function ---
console.log(`Function "chat-details" up and running!`);
serve((req) => mainHandler(req, defaultDeps)); 