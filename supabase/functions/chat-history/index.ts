// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
// Define actualCreateClient before use
import { createClient as actualCreateClient, type SupabaseClient, type AuthError, type GoTrueClient } from 'npm:@supabase/supabase-js@2'
import { baseCorsHeaders } from '../_shared/cors-headers.ts'
// Import Chat type from shared types
// import type { Chat } from '../_shared/types.ts'; 
// Reuse HandlerError
import { HandlerError } from '../api-subscriptions/handlers/current.ts'; 
// Import DB types
import type { Database } from '../types_db.ts';

// Define the type for the items returned by this specific handler
export interface ChatHistoryItem {
  id: string;
  title: string | null;
  updated_at: string;
}

// --- Response Helper Functions (similar to chat-details) ---
const actualCreateJsonResponse = (body: unknown, status: number, headers?: HeadersInit) => {
  return new Response(JSON.stringify(body), {
    headers: { ...baseCorsHeaders, 'Content-Type': 'application/json', ...headers },
    status,
  });
};

const actualCreateErrorResponse = (message: string, status: number, _req?: Request, originalError?: Error | unknown) => {
    console.error(`API Error (Chat History - ${status}):`, message, originalError || '');
    return new Response(JSON.stringify({ error: message }), {
        headers: { ...baseCorsHeaders, 'Content-Type': 'application/json' },
        status,
    });
};

// --- Define Dependencies and Defaults ---
export interface ChatHistoryHandlerDeps {
  createSupabaseClient: typeof actualCreateClient;
  createJsonResponse: typeof actualCreateJsonResponse;
  createErrorResponse: typeof actualCreateErrorResponse;
}

export const defaultDeps: ChatHistoryHandlerDeps = {
  createSupabaseClient: actualCreateClient,
  createJsonResponse: actualCreateJsonResponse,
  createErrorResponse: actualCreateErrorResponse,
};

// --- Core Logic to Fetch Chat History (Renamed and adapted) ---
async function fetchChatHistoryLogic(
    supabaseClient: SupabaseClient<Database>, 
    userId: string, 
    organizationId: string | null, // Explicitly null if not provided
    deps: ChatHistoryHandlerDeps // For using createErrorResponse if needed internally, though less common here
): Promise<ChatHistoryItem[]> {
  // Original mainHandler logic an be placed here, using deps.createErrorResponse for consistency if throwing HandlerError
  // For now, keep existing try/catch and HandlerError usage from original mainHandler
  try {
    console.log(`Fetching chat history for user: ${userId}` + (organizationId ? ` Org: ${organizationId}` : ' (Personal)'));

    let query = supabaseClient
      .from('chats')
      .select('id, title, updated_at, user_id, organization_id');

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
      console.log('Applying organization filter');
    } else {
      query = query.is('organization_id', null);
      // query = query.eq('user_id', userId); // RLS should handle this for personal
      console.log('Applying personal (null org) filter');
    }

    const { data: chats, error: fetchError } = await query
      .order('updated_at', { ascending: false })
      .returns<ChatHistoryItem[]>();

    if (fetchError) {
        console.error(`Error fetching chat history for user ${userId}:`, fetchError);
        if (fetchError.code === 'PGRST116' || fetchError.message.includes('permission denied')) {
            throw new HandlerError('Unauthorized: Could not retrieve chat history.', 403, fetchError);
        }
        throw new HandlerError(fetchError.message || 'Failed to fetch chat history from database.', 500, fetchError);
    }
    console.log(`Found ${chats?.length ?? 0} chat(s) for user ${userId}` + (organizationId ? ` in org ${organizationId}` : ' (personal)'));
    return chats || [];
  } catch (error) {
    if (error instanceof HandlerError) throw error;
    console.error('fetchChatHistoryLogic error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected internal error occurred';
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 500;
    // Use deps.createErrorResponse style throw if we centralize HandlerError creation via deps
    throw new HandlerError(errorMessage, status, error instanceof Error ? error : undefined);
  }
}

// --- New Exportable Main Handler (Edge Function Entry Point Structure) ---
export async function mainHandler(req: Request, deps: ChatHistoryHandlerDeps = defaultDeps): Promise<Response> {
  const { 
    createSupabaseClient, 
    createJsonResponse, 
    createErrorResponse 
  } = deps;

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: baseCorsHeaders, status: 204 });
  }

  try {
    if (req.method !== 'GET') {
      return createErrorResponse('Method Not Allowed', 405, req);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
       return createErrorResponse('Missing Authorization header', 401, req);
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey) {
         console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
         return createErrorResponse("Server configuration error.", 500, req);
    }
    const supabaseClient = createSupabaseClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } }
    );
    const authClient = supabaseClient.auth as GoTrueClient; // Cast for getUser
    const { data: { user }, error: userError } = await authClient.getUser();
    if (userError || !user) {
      // Use the more specific error from AuthError if available
      const message = userError?.message || 'Invalid authentication credentials';
      return createErrorResponse(message, 401, req, userError as AuthError);
    }
    
    const url = new URL(req.url);
    const organizationId = url.searchParams.get('organizationId'); // Will be string or null
    console.log('Request received with organizationId parameter:', organizationId);

    // Call the core logic function
    const data = await fetchChatHistoryLogic(supabaseClient, user.id, organizationId, deps);
    
    return createJsonResponse(data, 200);

  } catch (err) {
    let errorStatus = 500;
    let errorMessage = "Internal Server Error";

    if (err instanceof HandlerError) {
      errorStatus = err.status;
      errorMessage = err.message;
      if (err.cause) console.error("Original error cause (Chat History):", err.cause);
    } else if (err instanceof Error) {
       errorMessage = err.message;
    } else {
      errorMessage = String(err); 
    }
    console.error(`Returning error response (Chat History - ${errorStatus}):`, errorMessage);
    return createErrorResponse(errorMessage, errorStatus, req, err);
  }
}

// --- Serve Function (Simplified) --- 
serve((req) => mainHandler(req, defaultDeps)); 