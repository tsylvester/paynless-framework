import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors-headers.ts'

console.log(`Function "chat-history" up and running!`)

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

    // --- Verify user authentication (optional but good practice) ---
    // Although RLS handles the filtering, explicitly checking auth provides clearer errors.
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      console.error('Auth error fetching chat history:', userError)
      return new Response(JSON.stringify({ error: 'Invalid authentication credentials' }), {
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         status: 401,
      })
    }
    console.log(`Fetching chat history for user: ${user.id}`)

    // --- Fetch Chat History ---
    // RLS policy on 'chats' table ensures users only get their own chats.
    const { data: chats, error: fetchError } = await supabaseClient
      .from('chats')
      .select('id, title, updated_at') // Select fields as per plan
      // RLS policy `auth.uid() = user_id` handles the filtering
      .order('updated_at', { ascending: false }) // Order by most recent

    if (fetchError) {
        console.error(`Error fetching chat history for user ${user.id}:`, fetchError);
        // RLS errors might manifest here if policy is misconfigured
        if (fetchError.code === 'PGRST116' || fetchError.message.includes('permission denied')) { 
            return new Response(JSON.stringify({ error: 'Unauthorized: Could not retrieve chat history.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403, // Forbidden
            })
        } 
        throw fetchError; // Throw other unexpected errors
    }

    console.log(`Found ${chats?.length ?? 0} chat(s) for user ${user.id}`);

    // --- Return Chat History --- 
    return new Response(JSON.stringify({ chats: chats || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Chat history function error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An internal error occurred' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500, 
    })
  }
}) 