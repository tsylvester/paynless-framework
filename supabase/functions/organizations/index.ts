import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseClient } from '../_shared/supabaseClient.ts';
import { Database } from '../types_db.ts'; // Import the generated DB types

console.log('Organization function booting up...');

serve(async (req: Request) => {
  console.log(`[organizations] Method: ${req.method}, URL: ${req.url}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('[organizations] Handling OPTIONS request');
    return new Response('ok', { headers: corsHeaders });
  }

  // Placeholder for request body parsing
  let body: any = null;
  if (req.body && req.headers.get('content-type')?.includes('application/json')) {
    try {
      body = await req.json();
      console.log('[organizations] Request body:', body);
    } catch (error) {
      console.error('[organizations] Error parsing request body:', error);
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
  }

  try {
    // Create a Supabase client with the Auth context of the caller
    // This requires the service_role key to be set in the environment
    // and the user's JWT to be passed in the Authorization header
    const supabase = createSupabaseClient(req);

    // Retrieve the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
        console.error('[organizations] Auth error:', userError);
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 401,
        });
    }

    console.log('[organizations] Authenticated user:', user.id);

    // --- Route based on HTTP method --- //

    if (req.method === 'POST') {
      // --- TODO: Implement Create Organization Logic --- //
      console.log('[organizations] Handling POST request...');
      // 1. Validate input (name, optional visibility) from `body`
      // 2. Start transaction
      // 3. Insert into organizations (add creator_id?)
      // 4. Insert into organization_members (user.id, new_org.id, role='ADMIN', status='active')
      // 5. Commit transaction
      // 6. Return new organization details
      return new Response(JSON.stringify({ message: 'POST /organizations not implemented yet' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 501, // Not Implemented
      });
    }

    if (req.method === 'GET') {
      // TODO: Handle GET /organizations and GET /organizations/:orgId
      console.log('[organizations] Handling GET request...');
      return new Response(JSON.stringify({ message: 'GET /organizations not implemented yet' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 501, // Not Implemented
      });
    }
    
    // Add handlers for PUT, DELETE etc. based on req.method and URL path

    // Fallback for unhandled methods
    console.warn(`[organizations] Method ${req.method} not allowed for ${req.url}`);
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    });

  } catch (error) {
    console.error('[organizations] Internal Server Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

console.log('Organization function handler registered.'); 