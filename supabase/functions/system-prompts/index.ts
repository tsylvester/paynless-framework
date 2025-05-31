// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// Import shared response/error handlers instead of static headers
import { 
    handleCorsPreflightRequest, 
    createErrorResponse, 
    createSuccessResponse 
} from '../_shared/cors-headers.ts'; 

console.log(`Function "system-prompts" up and running!`)

serve(async (req) => {
  // Handle CORS preflight requests using the shared helper
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Check if the method is GET, otherwise return Method Not Allowed
  if (req.method !== 'GET') {
    return createErrorResponse('Method Not Allowed', 405, req);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    console.log('[system-prompts] Received Authorization header:', authHeader ? 'Present' : 'MISSING_OR_NULL');
    // Optionally, log the token itself for debugging (be careful with sensitive data in production logs)
    // if (authHeader) {
    //   console.log('[system-prompts] Auth Token:', authHeader);
    // }

    // Create a Supabase client with the Auth context of the logged in user.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader! } }, // Use the captured authHeader
      }
    )

    // Fetch active system prompts
    const { data: prompts, error } = await supabaseClient
      .from('system_prompts')
      .select('*')
      .eq('is_active', true)

    if (error) {
      console.error('[system-prompts] Error fetching system prompts:', error)
      // Check for RLS errors (adjust code/message as needed)
      if (error.code === 'PGRST116' || error.message.includes('permission denied')) {
         return createErrorResponse('Unauthorized: RLS policy prevented access.', 403, req, error);
      } 
      throw error // Re-throw other errors to be caught below
    }

    console.log(`[system-prompts] Fetched ${prompts ? prompts.length : 0} prompts from DB.`);

    // Use shared success response helper
    return createSuccessResponse({ prompts }, 200, req);

  } catch (error) {
    console.error('[system-prompts] Caught error in system-prompts function:', error) 
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    
    let status = 500;
    if (error instanceof Response) { 
      status = error.status;
    } else if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
      status = error.status;
    }

    return createErrorResponse(errorMessage, status, req, error);
  }
}) 