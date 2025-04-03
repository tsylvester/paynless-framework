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

// Define an interface for the upsert data structure
interface UserProfileUpsertData {
  id: string;
  updated_at: string;
  first_name?: string;
  last_name?: string;
  role?: string;       
}

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
        // User object is already fetched above
        
        // Get the user's profile
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('*') // Select desired columns explicitly if needed
          .eq('id', user.id)
          .maybeSingle(); // Use maybeSingle to handle missing profiles gracefully (returns null)

        if (profileError) {
          console.error('Error fetching profile:', profileError);
          return createErrorResponse(`Failed to fetch profile: ${profileError.message}`, 500);
        }

        // Combine user and profile data
        const responseData = {
          user: user,         // The user object from auth.getUser()
          profile: profile    // The profile object from user_profiles (or null)
        };

        // Return the combined object
        return createSuccessResponse(responseData);
      }

      case 'PUT': {
        let profileData;
        try {
            profileData = await req.json();
        } catch (parseError) {
            console.error('Error parsing PUT body:', parseError);
            return createErrorResponse("Invalid request body", 400);
        }
        
        // Construct the object for upsert using the defined interface
        const upsertObject: UserProfileUpsertData = {
            id: user.id,
            updated_at: new Date().toISOString(), 
        };

        if (profileData.first_name !== undefined) {
            upsertObject.first_name = profileData.first_name;
        }
        if (profileData.last_name !== undefined) {
            upsertObject.last_name = profileData.last_name;
        }

        // Only update role if provided - consider security implications
        if (profileData.role !== undefined) { 
            upsertObject.role = profileData.role;
        }

        // Log the object being sent to upsert for debugging
        console.log('Upserting profile data:', JSON.stringify(upsertObject));

        // Update or create the profile
        const { data: updatedProfile, error: updateError } = await supabase
          .from('user_profiles')
          .upsert(upsertObject) 
          .select()
          .single();

        if (updateError) {
          // Log the specific Supabase error
          console.error('Error updating profile:', updateError); 
          return createErrorResponse(`Failed to update profile: ${updateError.message}`, 500);
        }

        // Return the updated profile
        return createSuccessResponse(updatedProfile); 
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