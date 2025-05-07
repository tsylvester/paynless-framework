// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient as actualCreateClient, type SupabaseClient, type GoTrueClient } from 'npm:@supabase/supabase-js@2'
// import type { AuthError } from 'npm:@supabase/gotrue-js@2'; // Reverted change
// Reuse HandlerError if available and appropriate, or define one
// Assuming reuse from api-subscriptions for now
import { HandlerError } from '../api-subscriptions/handlers/current.ts'; 
// Import DB types if needed for casting/return types
import type { Database } from '../types_db.ts';
// Import ChatMessage from shared types
import type { ChatMessage } from '../_shared/types.ts'; 

console.log(`Function "chat-details" up and running!`)

// Define default CORS headers locally
const defaultCorsHeaders = {
  'Access-Control-Allow-Origin': '*', 
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 
  'Access-Control-Allow-Methods': 'GET, OPTIONS, DELETE' // <<< Add DELETE
}; 

// --- Define Dependencies and Defaults ---
// Helper to create a JSON response (can be part of deps or a shared utility)
// For now, assume a simple one. In a real app, this would be robust.
const actualCreateJsonResponse = (body: unknown, status: number, headers?: HeadersInit) => {
  return new Response(JSON.stringify(body), {
    headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json', ...headers },
    status,
  });
};

const actualCreateErrorResponse = (message: string, status: number, _req?: Request, originalError?: Error | unknown) => {
    console.error(`API Error (${status}):`, message, originalError || '');
    return new Response(JSON.stringify({ error: message }), {
        headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
        status,
    });
};

export interface ChatDetailsHandlerDeps {
  createSupabaseClient: typeof actualCreateClient;
  createJsonResponse: typeof actualCreateJsonResponse;
  createErrorResponse: typeof actualCreateErrorResponse;
  // Add other specific dependencies if needed, e.g., a logger
}

export const defaultDeps: ChatDetailsHandlerDeps = {
  createSupabaseClient: actualCreateClient,
  createJsonResponse: actualCreateJsonResponse,
  createErrorResponse: actualCreateErrorResponse,
};

// --- Main Handler Logic (GET) ---
// Fetches ACTIVE messages for a specific chat AFTER access check
async function getChatMessagesHandler(supabaseClient: SupabaseClient<Database>, chatId: string): Promise<ChatMessage[]> { 
  try {
    console.log(`Fetching active messages for chat: ${chatId}`);

    // RLS on chat_messages relies on the preliminary check via can_select_chat helper
    // Query messages, filtering for active ones
    const { data: messages, error: messagesError } = await supabaseClient
       .from('chat_messages')
       .select('*') 
       .eq('chat_id', chatId)
       .eq('is_active_in_thread', true) // <<< Filter for active messages
       .order('created_at', { ascending: true })
       .returns<ChatMessage[]>(); // Type assertion

    if (messagesError) {
        console.error(`Error fetching messages for chat ${chatId}:`, messagesError);
        // Handle specific errors if needed, e.g., RLS denial on messages (though unlikely if chat access passed)
        throw new HandlerError(messagesError.message || 'Failed to fetch messages.', 500, messagesError);
    }

    console.log(`Found ${messages?.length ?? 0} active message(s) for chat ${chatId}`);
    return messages || [];

  } catch (error) {
    if (error instanceof HandlerError) throw error;
    console.error('Chat details mainHandler error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected internal error occurred';
    throw new HandlerError(errorMessage, 500, error instanceof Error ? error : undefined);
  }
}

// --- Main Exportable Handler ---
export async function mainHandler(req: Request, deps: ChatDetailsHandlerDeps = defaultDeps): Promise<Response> {
  const { 
    createSupabaseClient, 
    createJsonResponse, 
    createErrorResponse 
  } = deps;

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: defaultCorsHeaders, status: 204 });
  }

  try {
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      return createErrorResponse('Method Not Allowed', 405, req);
    }
    
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/');
    const chatId = pathSegments[pathSegments.length - 1]; 
    if (!chatId || chatId === 'chat-details') { 
        return createErrorResponse('Missing or invalid chatId in request path', 400, req);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
       return createErrorResponse('Missing Authorization header', 401, req);
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey) {
        return createErrorResponse("Server configuration error: Missing Supabase URL or Anon Key.", 500, req);
    }
    const supabaseClient = createSupabaseClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } }
    );
    // Cast to GoTrueClient before calling getUser
    const authClient = supabaseClient.auth as GoTrueClient;
    const { data: { user }, error: userError } = await authClient.getUser();
    if (userError || !user) {
        const errorDetails = userError ? (userError.message || 'Invalid authentication credentials') : 'Invalid authentication credentials';
        return createErrorResponse(errorDetails, 401, req, userError);
    }

    // Preliminary Access Check (common for GET and DELETE)
    console.log(`Performing access check for user ${user.id} on chat ${chatId} (Method: ${req.method})`);
    const { data: chatAccess, error: chatAccessError } = await supabaseClient
        .from('chats')
        .select('id, user_id, organization_id') // Fetch fields needed for explicit delete check too
        .eq('id', chatId)
        .maybeSingle(); 

    if (chatAccessError) {
        return createErrorResponse('Error verifying chat access.', 500, req, chatAccessError);
    }
    if (!chatAccess) {
        return createErrorResponse('Chat not found or access denied.', 404, req);
    }
    console.log(`Access check passed for user ${user.id} on chat ${chatId}. Chat details:`, chatAccess);

    if (req.method === 'GET') {
        const messages = await getChatMessagesHandler(supabaseClient, chatId);
        return createJsonResponse(messages, 200);
    } else if (req.method === 'DELETE') {
        console.log(`Attempting DELETE operation for user ${user.id} on chat ${chatId}`);
        
        // Explicit Permission Check (as per original logic)
        let isAllowed = false;
        if (chatAccess.organization_id) {
             console.log(`Explicit check: Chat ${chatId} belongs to org ${chatAccess.organization_id}. Checking admin status.`);
             const { data: isAdmin, error: adminCheckError } = await supabaseClient.rpc('is_org_admin', { org_id: chatAccess.organization_id });
             if (adminCheckError) {
                return createErrorResponse('Failed to verify organization permissions.', 500, req, adminCheckError);
             }
             isAllowed = !!isAdmin;
             if (isAllowed) {
                console.log(`Explicit check PASSED: User ${user.id} is admin of org ${chatAccess.organization_id}.`);
             } else {
                 console.warn(`Explicit check FAILED: User ${user.id} is NOT admin of org ${chatAccess.organization_id}.`);
             }
        } else {
             console.log(`Explicit check: Chat ${chatId} is personal. Checking ownership.`);
             isAllowed = chatAccess.user_id === user.id;
             if (isAllowed) {
                 console.log(`Explicit check PASSED: User ${user.id} owns personal chat ${chatId}.`);
             } else {
                 console.warn(`Explicit check FAILED: User ${user.id} does NOT own personal chat ${chatId} (owner: ${chatAccess.user_id}).`);
             }
        }

        if (!isAllowed) {
            console.warn(`User ${user.id} not allowed to delete chat ${chatId}. Org: ${chatAccess.organization_id}, Owner: ${chatAccess.user_id}`);
            return createErrorResponse('Forbidden: You do not have permission to delete this chat.', 403, req);
        }
        console.log(`User ${user.id} IS allowed to delete chat ${chatId}. Proceeding with delete.`);

        const { error: deleteError, count } = await supabaseClient
            .from('chats')
            .delete()
            .match({ id: chatId }); // Use .match as per original logic

        if (deleteError) {
            return createErrorResponse('Failed to delete chat.', 500, req, deleteError);
        }
        
        // Check if any row was actually deleted by this user's operation
        // RLS should ensure only deletable rows are matched.
        // If count is 0 here, it might mean RLS prevented delete on a row that existed but wasn't deletable by this user,
        // or the row was already deleted. Standard behavior is 204 if the "resource is gone".
        console.log(`Chat delete operation for ${chatId} completed. Rows affected by this op (match + RLS): ${count}`);
        return new Response(null, { headers: defaultCorsHeaders, status: 204 }); // 204 No Content
    }

    // Fallback, should not be reached if method check is exhaustive
    return createErrorResponse('Unsupported operation.', 405, req);

  } catch (error) {
    // Catch any unhandled errors, including HandlerError instances if not caught earlier
    const message = error instanceof HandlerError ? error.message : (error instanceof Error ? error.message : 'An unexpected server error occurred.');
    const status = error instanceof HandlerError ? error.status : 500;
    // Use the top-level createErrorResponse from deps if possible, or a local one
    // Assuming createErrorResponse is available from deps here.
    return deps.createErrorResponse(message, status, req, error);
  }
}

// --- Serve Function --- 
// Use the mainHandler with default dependencies when serving
console.log(`Function "chat-details" up and running!`) 
serve((req) => mainHandler(req, defaultDeps)); 