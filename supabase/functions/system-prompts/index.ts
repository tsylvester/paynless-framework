// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors-headers.ts'

console.log(`Function "system-prompts" up and running!`)

serve(async (req) => {
  // Handle CORS preflight requests
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

    // Fetch active system prompts
    const { data: prompts, error } = await supabaseClient
      .from('system_prompts')
      .select('id, name, prompt_text') // Selecting id, name, and the prompt text
      .eq('is_active', true)

    if (error) {
      console.error('Error fetching system prompts:', error)
      // Check for RLS errors (adjust code/message as needed)
      if (error.code === 'PGRST116' || error.message.includes('permission denied')) {
         return new Response(JSON.stringify({ error: 'Unauthorized: RLS policy prevented access.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 403, // Forbidden
         })
      } 
      throw error // Re-throw other errors
    }

    return new Response(JSON.stringify({ prompts }), {
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