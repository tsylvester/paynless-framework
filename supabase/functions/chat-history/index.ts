// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient, type AuthError } from 'npm:@supabase/supabase-js@2'
// Remove CORS header import
// import { corsHeaders as defaultCorsHeaders } from '../_shared/cors-headers.ts'
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

// Define default CORS headers locally
const defaultCorsHeaders = {
  'Access-Control-Allow-Origin': '*', 
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 
  'Access-Control-Allow-Methods': 'GET, OPTIONS' // Explicitly allow GET and OPTIONS
}; 

// Remove Dependency Injection Setup
/*
export interface ChatHistoryHandlerDeps { ... }
const defaultDeps: ChatHistoryHandlerDeps = { ... };
*/

// --- Main Handler Logic ---
// Modify mainHandler to accept optional organizationId
export async function mainHandler(supabaseClient: SupabaseClient<Database>, userId: string, organizationId?: string | null): Promise<ChatHistoryItem[]> { 
  try {
    console.log(`Fetching chat history for user: ${userId}` + (organizationId ? ` Org: ${organizationId}` : ' (Personal)'));

    // --- Build Query --- 
    let query = supabaseClient
      .from('chats')
      .select('id, title, updated_at');

    // Apply filter based on organizationId presence
    if (organizationId) {
      // RLS POLICY `chats_org_select` already enforces SELECT access based on user's membership in organizationId
      // So we just need to match the org ID here.
      query = query.eq('organization_id', organizationId);
      console.log('Applying organization filter');
    } else {
      // RLS POLICY `chats_personal_select` already enforces SELECT access based on user_id == auth.uid() for personal chats
      // Need to explicitly filter for NULL organization_id
      query = query.is('organization_id', null);
      // We might add .eq('user_id', userId) for extra safety, but RLS should cover it.
      // query = query.eq('user_id', userId); 
      console.log('Applying personal (null org) filter');
    }

    // --- Fetch Chat History ---
    const { data: chats, error: fetchError } = await query
      .order('updated_at', { ascending: false })
      .returns<ChatHistoryItem[]>();

    if (fetchError) {
        console.error(`Error fetching chat history for user ${userId}:`, fetchError);
        // Handle specific errors like permission denied if necessary
        if (fetchError.code === 'PGRST116' || fetchError.message.includes('permission denied')) {
            // Although RLS *should* prevent this, handle defensively
            throw new HandlerError('Unauthorized: Could not retrieve chat history.', 403, fetchError);
        }
        // Throw generic DB error
        throw new HandlerError(fetchError.message || 'Failed to fetch chat history from database.', 500, fetchError);
    }

    console.log(`Found ${chats?.length ?? 0} chat(s) for user ${userId}` + (organizationId ? ` in org ${organizationId}` : ' (personal)'));

    // --- Return Chat History --- 
    // Return the array directly (or empty array if null)
    return chats || [];

  } catch (error) {
    // Re-throw HandlerError directly
    if (error instanceof HandlerError) {
      throw error;
    }
    // Wrap other errors
    console.error('Chat history mainHandler error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected internal error occurred';
    // Default to 500, could check error.status if available
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
    
    // --- Extract organizationId from query params --- 
    const url = new URL(req.url);
    const organizationId = url.searchParams.get('organizationId');
    console.log('Request received with organizationId:', organizationId);

    // --- Call Main Logic --- 
    const data = await mainHandler(supabaseClient, user.id, organizationId);
    
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