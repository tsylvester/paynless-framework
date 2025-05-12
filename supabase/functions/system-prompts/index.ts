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
    // Create a Supabase client with the Auth context of the logged in user.
    // Using ANON KEY as this is likely public or protected by RLS
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Fetch active system prompts
    const { data: prompts, error } = await supabaseClient
      .from('system_prompts')
      .select('id, name, prompt_text')
      .eq('is_active', true)

    if (error) {
      console.error('Error fetching system prompts:', error)
      // Check for RLS errors (adjust code/message as needed)
      if (error.code === 'PGRST116' || error.message.includes('permission denied')) {
         // Use shared error response helper, passing the original error
         return createErrorResponse('Unauthorized: RLS policy prevented access.', 403, req, error);
      } 
      throw error // Re-throw other errors to be caught below
    }

    // Use shared success response helper
    return createSuccessResponse({ prompts }, 200, req);

  } catch (error) {
    console.error('Caught error in system-prompts function:', error) // Log raw error
    // Use shared error response helper, passing the original error
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    
    // Safely determine status from error
    let status = 500;
    if (error instanceof Response) { // Check if a Response object was thrown
      status = error.status;
    } else if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
      // Check if it's an object with a numeric status property (covers errors like HttpError from Supabase client)
      status = error.status;
    }
    // No need for the `error instanceof Error` check here as the object check covers it if Error has a status prop

    return createErrorResponse(errorMessage, status, req, error);
  }
}) 