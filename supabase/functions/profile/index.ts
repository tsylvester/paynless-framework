import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { 
  handleCorsPreflightRequest, 
  createErrorResponse, 
  createSuccessResponse 
} from '../_shared/cors-headers.ts';
import { 
  createSupabaseClient, 
  verifyApiKey,
  createUnauthorizedResponse
} from '../_shared/auth.ts';

// Use Deno.serve for Edge Function
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Verify API key for all non-OPTIONS requests
  const isValid = verifyApiKey(req);
  if (!isValid) {
    return createUnauthorizedResponse("Invalid or missing apikey");
  }

  try {
    const supabase = createSupabaseClient(req);
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return createUnauthorizedResponse("Not authenticated");
    }

    // Handle different HTTP methods
    switch (req.method) {
      case 'GET': {
        // Get the user's profile
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
          return createErrorResponse("Failed to fetch profile", 500);
        }

        return createSuccessResponse(profile || null);
      }

      case 'PUT': {
        const profileData = await req.json();
        
        // Update or create the profile
        const { data: profile, error: updateError } = await supabase
          .from('user_profiles')
          .upsert({
            id: user.id,
            first_name: profileData.firstName,
            last_name: profileData.lastName,
            avatar_url: profileData.avatarUrl,
            role: profileData.role || 'user',
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (updateError) {
          console.error('Error updating profile:', updateError);
          return createErrorResponse("Failed to update profile", 500);
        }

        return createSuccessResponse(profile);
      }

      default:
        return createErrorResponse("Method not allowed", 405);
    }
  } catch (err) {
    console.error("Unexpected error:", err);
    return createErrorResponse(
      err instanceof Error ? err.message : "An unexpected error occurred",
      500
    );
  }
}); 