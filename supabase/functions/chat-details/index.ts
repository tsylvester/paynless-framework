// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient, type GoTrueClient } from 'npm:@supabase/supabase-js@2'
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

// --- Serve Function --- 
// This wrapper handles request validation, routing, auth, client creation, and response formatting
serve(async (req: Request, _connInfo: any): Promise<Response> => { // Ensure connInfo is unused or typed; explicitly type return as Promise<Response>
  // --- Handle CORS Preflight --- 
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: defaultCorsHeaders, status: 204 });
  }

  try {
    // --- Basic Request Validation ---
    // Allow GET and DELETE
    if (req.method !== 'GET' && req.method !== 'DELETE') { // <<< Allow DELETE
      // Ensure this path returns a Response created by HandlerError or similar
      // throw new HandlerError('Method Not Allowed', 405); // This throw will be caught and turned into a Response
      // To be absolutely explicit for the type checker, though the catch block handles it:
      const err = new HandlerError('Method Not Allowed', 405);
      return new Response(JSON.stringify({ error: err.message }), {
        headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
        status: err.status,
      });
    }
    
    // --- Extract chatId from path --- 
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/');
    const chatId = pathSegments[pathSegments.length - 1]; 
    console.log(`Extracted chatId from path: ${chatId} for method ${req.method}`);
    if (!chatId || chatId === 'chat-details') { 
        // throw new HandlerError('Missing or invalid chatId in request path', 400); // Caught by general catch
        const err = new HandlerError('Missing or invalid chatId in request path', 400);
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
            status: err.status,
        });
    }
    // Optional: Validate if chatId looks like a UUID

    // --- Authentication & Client Setup ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
       // throw new HandlerError('Missing Authorization header', 401); // Caught by general catch
       const err = new HandlerError('Missing Authorization header', 401);
       // Special handling for 401 to match local runtime behavior if needed
       const responseBody = JSON.stringify({ msg: err.message }); // Match observed local 401 format
       return new Response(responseBody, {
           headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
           status: err.status,
       });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey) {
        // throw new HandlerError("Server configuration error.", 500); // Caught by general catch
        const err = new HandlerError("Server configuration error.", 500);
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
            status: err.status,
        });
    }
    const supabaseClient = createClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } }
    );
    // Cast to GoTrueClient before calling getUser
    const authClient = supabaseClient.auth as GoTrueClient;
    const { data: { user }, error: userError } = await authClient.getUser();
    if (userError || !user) {
        const errorDetails = userError ? (userError.message || 'Invalid authentication credentials') : 'Invalid authentication credentials';
        // throw new HandlerError(errorDetails, 401, userError || undefined); // Caught by general catch
        const err = new HandlerError(errorDetails, 401, userError || undefined);
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
            status: err.status,
        });
    }

    // --- Handle based on Method ---
    if (req.method === 'GET') {
        // --- Preliminary Access Check on Parent Chat using RLS (for GET) ---
        console.log(`Performing access check for user ${user.id} on chat ${chatId} (GET)`);
        const { data: chatAccess, error: chatAccessError } = await supabaseClient
            .from('chats')
            .select('id') // Select minimal data
            .eq('id', chatId)
            .maybeSingle(); 

        if (chatAccessError) {
            // throw new HandlerError('Error verifying chat access.', 500, chatAccessError); // Caught by general catch
            const err = new HandlerError('Error verifying chat access.', 500, chatAccessError);
            return new Response(JSON.stringify({ error: err.message }), {
                headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
                status: err.status,
            });
        }
        
        if (!chatAccess) {
            // throw new HandlerError('Chat not found or access denied', 404); // Caught by general catch
            const err = new HandlerError('Chat not found or access denied', 404);
            return new Response(JSON.stringify({ error: err.message }), {
                headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
                status: err.status,
            });
        }
        
        console.log(`Access granted for user ${user.id} on chat ${chatId} (GET)`);
        
        // --- Call Main Logic (GET) --- 
        const data = await getChatMessagesHandler(supabaseClient, chatId); // Renamed handler
        
        // --- Format Success Response (GET) --- 
        return new Response(JSON.stringify(data), {
          headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });

    } else if (req.method === 'DELETE') {
        console.log(`Attempting DELETE operation for user ${user.id} on chat ${chatId}`);
        
        // --- Preliminary Access Check (Similar to GET) ---
        // Ensure the user can SELECT the chat before attempting to DELETE.
        // This prevents returning 204 when RLS simply hides the row.
        console.log(`Performing access check for user ${user.id} on chat ${chatId} (DELETE pre-check)`);
        const { data: chatAccess, error: chatAccessError } = await supabaseClient
            .from('chats')
            .select('id', { count: 'exact' }) // Select minimal data, count is optional but can be informative
            .eq('id', chatId)
            .maybeSingle();

        if (chatAccessError) {
            // throw new HandlerError('Error verifying chat access before delete.', 500, chatAccessError); // Caught by general catch
            const err = new HandlerError('Error verifying chat access before delete.', 500, chatAccessError);
            return new Response(JSON.stringify({ error: err.message }), {
                headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
                status: err.status,
            });
        }
        
        // If chatAccess is null, RLS denied access or chat doesn't exist for this user.
        if (!chatAccess) {
            // throw new HandlerError('Chat not found or access denied', 404); // Caught by general catch
            const err = new HandlerError('Chat not found or access denied', 404);
            return new Response(JSON.stringify({ error: err.message }), {
                headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
                status: err.status,
            });
        }
        console.log(`Access verified for chat ${chatId} (DELETE pre-check)`);
        // End Preliminary Access Check

        // --- START Explicit Permission Check (Workaround for potential RLS inconsistency in tests) ---
        console.log(`Performing explicit permission check for user ${user.id} on chat ${chatId}`);
        const { data: chatDetails, error: fetchError } = await supabaseClient
            .from('chats')
            .select('user_id, organization_id')
            .eq('id', chatId)
            .single(); // Use single() as pre-check confirmed existence

        if (fetchError || !chatDetails) {
             // This shouldn't happen if the pre-check passed, but handle defensively.
             // throw new HandlerError('Failed to fetch chat details for deletion check.', 500, fetchError); // Caught by general catch
             const err = new HandlerError('Failed to fetch chat details for deletion check.', 500, fetchError);
             return new Response(JSON.stringify({ error: err.message }), {
                 headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
                 status: err.status,
             });
        }

        let isAllowed = false;
        if (chatDetails.organization_id) { // It's an org chat
             console.log(`Explicit check: Chat ${chatId} belongs to org ${chatDetails.organization_id}. Checking admin status.`);
             const { data: isAdmin, error: adminCheckError } = await supabaseClient.rpc('is_org_admin', { org_id: chatDetails.organization_id });
             if (adminCheckError) {
                // throw new HandlerError('Failed to verify organization permissions.', 500, adminCheckError); // Caught by general catch
                const err = new HandlerError('Failed to verify organization permissions.', 500, adminCheckError);
                return new Response(JSON.stringify({ error: err.message }), {
                    headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
                    status: err.status,
                });
             }
             isAllowed = !!isAdmin; // Explicitly check if user is admin
             if (isAllowed) {
                console.log(`Explicit check PASSED: User ${user.id} is admin of org ${chatDetails.organization_id}.`);
             } else {
                 console.warn(`Explicit check FAILED: User ${user.id} is NOT admin of org ${chatDetails.organization_id}.`);
             }
        } else { // It's a personal chat
             console.log(`Explicit check: Chat ${chatId} is personal. Checking ownership.`);
             isAllowed = chatDetails.user_id === user.id; // Explicitly check ownership
             if (isAllowed) {
                 console.log(`Explicit check PASSED: User ${user.id} owns personal chat ${chatId}.`);
             } else {
                 console.warn(`Explicit check FAILED: User ${user.id} does NOT own personal chat ${chatId} (owner: ${chatDetails.user_id}).`);
                 // This case should have been caught by the 404 pre-check, but log anyway.
             }
        }

        if (!isAllowed) {
            // throw new HandlerError('Permission denied to delete this chat (Explicit Check).', 403); // Caught by general catch
            const err = new HandlerError('Permission denied to delete this chat (Explicit Check).', 403);
            return new Response(JSON.stringify({ error: err.message }), {
                headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
                status: err.status,
            });
        }
        // --- END Explicit Permission Check ---

        // --- Perform DELETE Operation --- 
        // RLS policy should technically align with the explicit check above, but we proceed based on the explicit check.
        console.log(`Explicit check passed, proceeding with DELETE for chat ${chatId}`);
        const { error: deleteError } = await supabaseClient
            .from('chats')
            .delete()
            .eq('id', chatId);

        if (deleteError) {
            // If an error occurs *here* despite the explicit check passing, it's unexpected.
            // It could be a concurrent modification or a deeper RLS issue.
            // throw new HandlerError(deleteError.message || 'Failed to delete chat after explicit check.', 500, deleteError); // Caught by general catch
            const err = new HandlerError(deleteError.message || 'Failed to delete chat after explicit check.', 500, deleteError);
            return new Response(JSON.stringify({ error: err.message }), {
                headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
                status: err.status,
            });
        }

        // If explicit check passed and no error from DB delete call, assume success.
        console.log(`DELETE operation completed for chat ${chatId}`);
        
        // --- Format Success Response (DELETE) --- 
        return new Response(null, {
          headers: defaultCorsHeaders,
          status: 204, // No Content
        });
    }
    // Fallback return, though all logical paths (GET/DELETE) should have returned or thrown.
    // This satisfies the type checker if it can't infer that all paths are covered.
    // In practice, this should not be reached if req.method is GET or DELETE.
    const finalError = new HandlerError('Reached unexpected end of handler.', 500);
    return new Response(JSON.stringify({ error: finalError.message }), {
        headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
        status: finalError.status,
    });

  } catch (err) {
    // --- Format Error Response (Same for GET/DELETE) --- 
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
    const responseBody = (errorStatus === 401 && errorMessage === 'Missing Authorization header') 
        ? JSON.stringify({ msg: errorMessage }) 
        : JSON.stringify({ error: errorMessage });
        
    console.error("Returning error response:", { status: errorStatus, message: errorMessage });
    return new Response(responseBody, {
      headers: { ...defaultCorsHeaders, 'Content-Type': 'application/json' },
      status: errorStatus,
    });
  }
}); 