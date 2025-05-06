// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient, type AuthError } from 'npm:@supabase/supabase-js@2'
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
  'Access-Control-Allow-Methods': 'GET, OPTIONS' // Explicitly allow GET and OPTIONS
}; 

// --- Main Handler Logic ---
// Fetches ACTIVE messages for a specific chat AFTER access check
async function mainHandler(supabaseClient: SupabaseClient<Database>, chatId: string): Promise<ChatMessage[]> { 
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

// --- Serve Function --- 
// This wrapper handles request validation, routing, auth, client creation, and response formatting
serve(async (req: Request, connInfo: any) => { // connInfo might contain path params depending on framework
  // --- Handle CORS Preflight --- 
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: defaultCorsHeaders, status: 204 });
  }

  try {
    // --- Basic Request Validation ---
    if (req.method !== 'GET') {
      throw new HandlerError('Method Not Allowed', 405);
    }
    
    // --- Extract chatId from path --- 
    // Supabase functions typically pass path params via Deno.serve options or a framework context.
    // Assuming a pattern like `/chat-details/:chatId` matched by the deployment route.
    // Need to parse it from the URL or use the framework's context.
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/');
    // Assuming the path is /functions/v1/chat-details/<chatId>
    const chatId = pathSegments[pathSegments.length - 1]; 
    console.log('Extracted chatId from path:', chatId);
    if (!chatId || chatId === 'chat-details') { // Basic check if extraction failed
         throw new HandlerError('Missing or invalid chatId in request path', 400);
    }
    // Optional: Validate if chatId looks like a UUID

    // --- Authentication & Client Setup ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
       throw new HandlerError('Missing Authorization header', 401);
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey) {
         throw new HandlerError("Server configuration error.", 500);
    }
    const supabaseClient = createClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new HandlerError('Invalid authentication credentials', 401, userError as AuthError);
    }

    // --- Preliminary Access Check on Parent Chat using RLS ---
    console.log(`Performing access check for user ${user.id} on chat ${chatId}`);
    // This query leverages the existing SELECT RLS policy on the `chats` table.
    // The policy implicitly handles personal vs. organizational checks based on `is_org_member`.
    const { data: chatAccess, error: chatAccessError } = await supabaseClient
        .from('chats')
        .select('id') // Select minimal data
        .eq('id', chatId)
        .maybeSingle(); // Expect 0 or 1 row

    if (chatAccessError) {
        console.error(`Error checking chat access for chat ${chatId}:`, chatAccessError);
        throw new HandlerError('Error verifying chat access.', 500, chatAccessError);
    }
    
    if (!chatAccess) {
        console.warn(`Access denied or chat not found for user ${user.id} on chat ${chatId}`);
        // Return 404 Not Found, as the user either doesn't have access or the chat doesn't exist.
        throw new HandlerError('Chat not found or access denied', 404);
    }
    
    console.log(`Access granted for user ${user.id} on chat ${chatId}`);
    
    // --- Call Main Logic (if access check passes) --- 
    const data = await mainHandler(supabaseClient, chatId);
    
    // --- Format Success Response --- 
    return new Response(JSON.stringify(data), {
      headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    // --- Format Error Response --- 
    let errorStatus = 500;
    let errorMessage = "Internal Server Error";
    if (err instanceof HandlerError) {
      errorStatus = err.status;
      errorMessage = err.message;
      if (err.cause) console.error("Original error cause:", err.cause);
    } else if (err instanceof Error) {
       errorMessage = err.message;
    } else {
      errorMessage = String(err); 
    }
    // Special handling for 401 to match local runtime behavior if needed
    const responseBody = (errorStatus === 401 && errorMessage === 'Missing Authorization header') 
        ? JSON.stringify({ msg: errorMessage }) // Match observed local 401 format
        : JSON.stringify({ error: errorMessage });
        
    console.error("Returning error response:", { status: errorStatus, message: errorMessage });
    return new Response(responseBody, {
      headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
      status: errorStatus,
    });
  }
}); 