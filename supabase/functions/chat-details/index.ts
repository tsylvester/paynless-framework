import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors-headers.ts'

console.log(`Function "chat-details" up and running!`)

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Ensure the request method is GET
  if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405,
      })
  }

  try {
    // --- Extract chatId from URL --- 
    // Expecting URL like /functions/v1/chat-details/:chatId
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const chatId = pathParts[pathParts.length - 1]; // Get the last part of the path

    if (!chatId || chatId === 'chat-details') { // Basic validation
        return new Response(JSON.stringify({ error: 'Missing or invalid chatId in URL path.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
    console.log(`Fetching details for chat ID: ${chatId}`);

    // --- Auth and Client Initialization ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
       return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         status: 401,
       })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // --- Verify user authentication ---
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      console.error(`Auth error fetching details for chat ${chatId}:`, userError)
      return new Response(JSON.stringify({ error: 'Invalid authentication credentials' }), {
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         status: 401,
      })
    }
    console.log(`User ${user.id} requesting details for chat ${chatId}`);

    // --- Fetch Chat Messages ---
    // RLS policy on 'chat_messages' ensures users can only select messages
    // from chats they own (via the EXISTS subquery check in the policy).
    const { data: messages, error: fetchError } = await supabaseClient
      .from('chat_messages')
      .select('*') // Select all fields for messages
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })

    if (fetchError) {
        console.error(`Error fetching messages for chat ${chatId} (User: ${user.id}):`, fetchError);
        if (fetchError.code === 'PGRST116' || fetchError.message.includes('permission denied')) { 
            return new Response(JSON.stringify({ error: 'Unauthorized: Could not retrieve messages for this chat.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403, // Forbidden
            })
        } 
         // Check if the error is simply "No rows found" which might be valid if the chatId was wrong but permitted by RLS somehow?
        if (fetchError.code === 'PGRST116' && fetchError.details?.includes('Results contain 0 rows')) {
            // This case might indicate the user *could* access the chat (if it existed), but it doesn't.
             return new Response(JSON.stringify({ error: 'Chat not found.' }), {
                 headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                 status: 404, // Not Found
             })
        }
        throw fetchError; // Throw other unexpected errors
    }

    // If messages is null or empty, it might mean the chat exists but has no messages, 
    // or the chatId was invalid but didn't trigger an RLS error directly. 
    // A 404 might be more appropriate if we are certain the chat doesn't exist *for this user*.
    // We depend on RLS to prevent access to chats the user doesn't own.
    if (!messages || messages.length === 0) {
        // To be certain, we could try fetching the chat itself first.
        const { data: chatExists, error: chatCheckError } = await supabaseClient
            .from('chats')
            .select('id')
            .eq('id', chatId)
            .maybeSingle(); // Check if the chat exists and user has access (RLS applies)
        
        if (chatCheckError || !chatExists) {
            console.log(`Chat ${chatId} not found or inaccessible for user ${user.id}.`);
             return new Response(JSON.stringify({ error: 'Chat not found or access denied.' }), {
                 headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                 status: 404, // Not Found or Forbidden
             })
        } 
        // If chat exists but messages array is empty, return empty array.
        console.log(`Chat ${chatId} found for user ${user.id}, but it has no messages.`);
    }
    

    console.log(`Found ${messages?.length ?? 0} message(s) for chat ${chatId}`);

    // --- Return Messages --- 
    return new Response(JSON.stringify({ messages: messages || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Chat details function error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An internal error occurred' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: error.status || 500, // Use error status if available (like 400 for bad chatId)
    })
  }
}) 