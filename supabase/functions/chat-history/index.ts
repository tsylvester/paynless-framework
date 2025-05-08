// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
// Define actualCreateClient before use
import { createClient as actualCreateClient, type SupabaseClient, type AuthError, type GoTrueClient } from 'npm:@supabase/supabase-js@^2.43.4'
// Import shared CORS and Auth helpers
import { 
    handleCorsPreflightRequest, 
    createErrorResponse, 
    createSuccessResponse // Assuming createSuccessResponse exists and adds CORS
} from '../_shared/cors-headers.ts';
import { 
    createUnauthorizedResponse,
    // Assuming createSupabaseClient exists in auth.ts for consistency
    // createSupabaseClient as createSharedSupabaseClient 
} from '../_shared/auth.ts';
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

// --- Define Dependencies and Defaults (Simplified - relies on shared) ---
// We might not need explicit deps injection if all helpers are imported directly
// For now, keep the structure but note potential simplification
export interface ChatHistoryHandlerDeps {
  // Placeholder - can be removed if not used for DI testing later
  placeholder?: boolean; 
}

export const defaultDeps: ChatHistoryHandlerDeps = {
  // Placeholder
};

// --- Core Logic to Fetch Chat History (Renamed and adapted) ---
async function fetchChatHistoryLogic(
    supabaseClient: SupabaseClient<Database>, 
    userId: string, 
    organizationId: string | null, // Explicitly null if not provided
    _deps: ChatHistoryHandlerDeps // Keep signature, but likely unused
): Promise<ChatHistoryItem[]> {
  // Original mainHandler logic an be placed here
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
    // Throw HandlerError consistently
    throw new HandlerError(errorMessage, status, error instanceof Error ? error : undefined);
  }
}

// --- New Exportable Main Handler (Edge Function Entry Point Structure) ---
// Use _deps signature for consistency, but helpers are imported directly
export async function mainHandler(req: Request, _deps: ChatHistoryHandlerDeps = defaultDeps): Promise<Response> { 
  
  // Use shared CORS preflight handler
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) {
    return corsResponse;
  }

  try {
    if (req.method !== 'GET') {
      // Use shared error response
      return createErrorResponse('Method Not Allowed', 405, req);
    }

    // --- Auth & Supabase Client Creation (Consider using shared helper if available) ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
       // Use shared unauthorized response
       return createUnauthorizedResponse('Missing Authorization header', req);
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey) {
         console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
         // Use shared error response
         return createErrorResponse("Server configuration error.", 500, req);
    }
    // Create client directly (or use shared helper from auth.ts if it exists)
    const supabaseClient = actualCreateClient( 
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } }
    );
    const authClient = supabaseClient.auth as GoTrueClient; // Cast for getUser
    const { data: { user }, error: userError } = await authClient.getUser();
    if (userError || !user) {
      // Use shared unauthorized response
      const message = userError?.message || 'Invalid authentication credentials';
      return createUnauthorizedResponse(message, req); 
    }
    // --- End Auth ---
    
    const url = new URL(req.url);
    const organizationId = url.searchParams.get('organizationId'); // Will be string or null
    console.log('Request received with organizationId parameter:', organizationId);

    // Call the core logic function
    const data = await fetchChatHistoryLogic(supabaseClient, user.id, organizationId, _deps);
    
    // Use shared success response (assuming it exists and handles CORS)
    // If createSuccessResponse doesn't exist, adapt createJsonResponse or create one
    return createSuccessResponse(data, 200, req); 

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
    // Use shared error response
    return createErrorResponse(errorMessage, errorStatus, req, err);
  }
}

// --- Serve Function (Simplified) --- 
serve((req) => mainHandler(req, defaultDeps)); 