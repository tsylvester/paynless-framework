// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@^2'
// Import shared response/error handlers instead of static headers
import { 
    handleCorsPreflightRequest, 
    createErrorResponse, 
    createSuccessResponse 
} from '../_shared/cors-headers.ts';
import { Database } from '../types_db.ts';

interface SystemPromptsDependencies {
  createSupabaseClient: (authHeader: string) => SupabaseClient<Database>;
}

export const createSystemPromptsHandler = (dependencies: SystemPromptsDependencies) => {
  const { createSupabaseClient } = dependencies;

  return async (req: Request) => {
    const corsResponse = handleCorsPreflightRequest(req);
    if (corsResponse) return corsResponse;

    if (req.method !== 'GET') {
      return createErrorResponse('Method Not Allowed', 405, req);
    }

    try {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return createErrorResponse('User not authenticated', 401, req);
      }
      
      const supabaseClient = createSupabaseClient(authHeader);

      const { data: prompts, error } = await supabaseClient
        .from('system_prompts')
        .select('*')
        .eq('is_active', true)
        .eq('user_selectable', true);

      if (error) {
        console.error('[system-prompts] Error fetching system prompts:', error);
        if (error.code === 'PGRST116' || error.message.includes('permission denied')) {
           return createErrorResponse('Unauthorized: RLS policy prevented access.', 403, req, error);
        } 
        return createErrorResponse('Internal Server Error', 500, req, error);
      }

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
  };
};

const defaultCreateSupabaseClient = (authHeader: string): SupabaseClient<Database> => {
    return createClient<Database>(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        {
            global: { headers: { Authorization: authHeader } },
        }
    );
};

const systemPromptsHandler = createSystemPromptsHandler({
    createSupabaseClient: defaultCreateSupabaseClient,
});

serve(systemPromptsHandler); 