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
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      // Create client with Auth context of the user that called the function.
      // This way your row-level-security (RLS) policies are applied.
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: providers, error } = await supabaseClient
      .from('ai_providers')
      .select('id, name, description')
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
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: error.status || 500,
    })
  }
}) 