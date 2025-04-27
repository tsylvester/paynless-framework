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
// This function now *only* handles the core logic for a validated GET request
// It expects chatId to be extracted and validated by the caller (serve wrapper)
export async function mainHandler(supabaseClient: SupabaseClient<Database>, userId: string, chatId: string): Promise<ChatMessage[]> {
  // Auth and Method checks are handled by the serve wrapper
  
  try {
    console.log(`User ${userId} fetching details for chat ID: ${chatId}`);

    // --- Fetch Chat Messages ---
    const { data: messages, error: fetchError } = await supabaseClient
      .from('chat_messages')
      .select('*') // Select all fields for messages
      .eq('chat_id', chatId)
      // Ensure RLS handles user_id check
      .order('created_at', { ascending: true })
      .returns<ChatMessage[]>(); // Ensure return type is correct

    // --- Handle Fetch Errors / Check Chat Existence --- 
    if (fetchError) {
      console.error(`Error fetching messages for chat ${chatId} (User: ${userId}):`, fetchError);
      if (fetchError.code === 'PGRST116') { // Check if it's a "not found" type error
          const { error: chatCheckError } = await supabaseClient.from('chats').select('id', { count: 'exact', head: true }).eq('id', chatId);
          if (chatCheckError) { 
              throw new HandlerError('Chat not found or access denied.', 404, chatCheckError);
          }
          // Treat as empty if chat exists but messages not found/forbidden by RLS?
      } else {
           throw new HandlerError(fetchError.message || 'Failed to fetch messages from database.', 500, fetchError);
      }
    }

    // If fetch succeeded but returned null/empty, verify chat exists before returning empty/404
    if (!messages || messages.length === 0) {
      const { error: chatCheckError, count } = await supabaseClient
            .from('chats')
            .select('id', { count: 'exact', head: true })
            .eq('id', chatId);
            
      if (chatCheckError || count === 0) {
           console.log(`Chat ${chatId} not found or inaccessible for user ${userId}.`);
           throw new HandlerError('Chat not found or access denied.', 404, chatCheckError ?? undefined);
      }
      console.log(`Chat ${chatId} found for user ${userId}, but it has no messages.`);
      return []; // Return empty array if chat exists but has no messages
    }

    console.log(`Found ${messages.length} message(s) for chat ${chatId}`);

    // --- Return Messages --- 
    return messages; // Return the array directly

  } catch (error) {
    // Re-throw HandlerError directly
    if (error instanceof HandlerError) {
      throw error;
    }
    // Wrap other errors
    console.error('Chat details mainHandler error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected internal error occurred';
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 500;
    throw new HandlerError(errorMessage, status, error instanceof Error ? error : undefined);
  }
}

// --- Serve Function --- 
// This wrapper handles request validation, routing, auth, client creation, and response formatting
serve(async (req) => {
  // --- Handle CORS Preflight --- 
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: defaultCorsHeaders, status: 204 });
  }

  try {
    // --- Basic Request Validation ---
    if (req.method !== 'GET') {
      throw new HandlerError('Method Not Allowed', 405);
    }
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const chatId = pathParts[pathParts.length - 1];
    if (!chatId || chatId === 'chat-details') { 
        throw new HandlerError('Missing or invalid chatId in URL path.', 400);
    }

    // --- Authentication & Client Setup ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
       throw new HandlerError('Missing Authorization header', 401);
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey) {
         console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
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
    
    // --- Call Main Logic --- 
    const data = await mainHandler(supabaseClient, user.id, chatId);
    
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
    console.error("Returning error response:", { status: errorStatus, message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
      status: errorStatus,
    });
  }
}); 