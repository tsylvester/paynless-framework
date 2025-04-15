// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors-headers.ts'

console.log(`Function "ai-providers" up and running!`)

serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create a Supabase client with the Auth context of the logged in user.
    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default.
      Deno.env.get('SUPABASE_URL') ?? '',
      // Supabase API ANON KEY - env var exported by default.
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const { data: providers, error } = await supabaseClient
      .from('ai_providers')
      .select('id, name, description, api_identifier')
      .eq('is_active', true)

    if (error) {
      console.error('Error fetching providers:', error)
      if (error.code === 'PGRST116' || error.message.includes('permission denied')) {
         return new Response(JSON.stringify({ error: 'Unauthorized: RLS policy prevented access.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 403,
         })
      } 
      throw error
    }

    return new Response(JSON.stringify({ providers }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Error in ai-providers function:', error) // Log the raw error
    let errorMessage = 'An unexpected error occurred';
    let errorStatus = 500;

    if (error instanceof Error) {
      errorMessage = error.message;
      // Attempt to get status if it exists (less common on standard Errors)
      if (typeof (error as any).status === 'number') {
         errorStatus = (error as any).status;
      } 
    } else if (typeof error === 'object' && error !== null && 'message' in error) {
       // Handle cases where error might be a plain object with a message
       errorMessage = String(error.message);
       if (typeof (error as any).status === 'number') {
          errorStatus = (error as any).status;
       }
    } else if (typeof error === 'string') {
       errorMessage = error;
    }

    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: errorStatus,
    })
  }
}) 