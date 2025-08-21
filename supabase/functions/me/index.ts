// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { 
  handleCorsPreflightRequest, 
  createErrorResponse, 
  createSuccessResponse 
} from '../_shared/cors-headers.ts';
import { 
  createSupabaseClient,
  createUnauthorizedResponse
} from '../_shared/auth.ts';
import { getEmailMarketingService } from '../_shared/email_service/factory.ts';
import type { UserData } from '../_shared/types.ts';

// Define dependencies interface (Restoring)
export interface MeHandlerDeps {
    handleCorsPreflightRequest: typeof handleCorsPreflightRequest;
    createUnauthorizedResponse: typeof createUnauthorizedResponse;
    createErrorResponse: typeof createErrorResponse;
    createSuccessResponse: typeof createSuccessResponse;
    createSupabaseClient: typeof createSupabaseClient;
    getEmailMarketingService: typeof getEmailMarketingService;
}

// Default dependencies (Restoring)
const defaultDeps: MeHandlerDeps = {
    handleCorsPreflightRequest: handleCorsPreflightRequest,
    createUnauthorizedResponse: createUnauthorizedResponse,
    createErrorResponse: createErrorResponse,
    createSuccessResponse: createSuccessResponse,
    createSupabaseClient: createSupabaseClient,
    getEmailMarketingService,
};

// Export the handler with deps parameter (Restoring)
export async function handleMeRequest(
    req: Request,
    deps: MeHandlerDeps = defaultDeps // Restore default parameter
): Promise<Response> {
  console.log("[me/index.ts] Handling request:", req.method, req.url);
  // Use deps again
  const corsResponse = deps.handleCorsPreflightRequest(req); 
  if (corsResponse) return corsResponse;

  try {
    console.log("[me/index.ts] Creating Supabase client...");
    // Use deps again
    const supabase = deps.createSupabaseClient(req); 
    console.log("[me/index.ts] Supabase client created.");
    
    console.log("[me/index.ts] Calling supabase.auth.getUser()...");
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.log(`[me/index.ts] supabase.auth.getUser() result: user=${!!user}, error=${userError?.message}`);

    if (userError || !user) {
      console.error("[me/index.ts] Auth error or no user:", userError);
      // Use deps again - createUnauthorizedResponse now takes req
      return deps.createUnauthorizedResponse("Not authenticated", req); 
    }
    console.log(`[me/index.ts] User authenticated: ${user.id}`);

    // Handle different HTTP methods
    switch (req.method) {
      case 'GET': {
        console.log(`[me/index.ts] Handling GET for user ${user.id}`);
        
        // Fetch the user's profile
        let { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        console.log(`[me/index.ts] Initial profile fetch: data=${!!profileData}, error=${profileError?.message}`);

        // If the user profile is not found (PostgREST error 'PGRST116'), create it.
        if (profileError && profileError.code === 'PGRST116') {
          console.log(`[me/index.ts] Profile not found for user ${user.id}. Attempting to create one.`);
          
          const { data: newProfile, error: insertError } = await supabase
            .from('user_profiles')
            .insert({
              id: user.id,
              first_name: user.user_metadata?.first_name || null,
              role: 'user'
            })
            .select()
            .single();

          if (insertError) {
            console.error('[me/index.ts] CRITICAL: Failed to create profile for user:', user.id, insertError);
            // This is a critical failure, as the user cannot proceed.
            return deps.createErrorResponse("Failed to create user profile after not finding one.", 500, req);
          }

          console.log(`[me/index.ts] Successfully created new profile for user ${user.id}.`);
          // Replace original profile data and clear the 'not found' error.
          profileData = newProfile;
          profileError = null; 
        } else if (profileError) {
          // For any other error, return a failure response.
          console.error('[me/index.ts] An unexpected error occurred fetching profile:', profileError);
          return deps.createErrorResponse("Failed to fetch profile", 500, req);
        }

        console.log(`[me/index.ts] Profile ready for user ${user.id}. Returning data.`);
        
        const responseData = {
            user: user,
            profile: profileData,
        };
        
        return deps.createSuccessResponse(responseData, 200, req);
      }

      case 'POST': { // Changed from PUT to POST
        console.log(`[me/index.ts] Handling POST for user ${user.id}`);
        let updates: Record<string, unknown>;
        try {
            updates = await req.json();
        } catch (jsonError) {
            console.error("Failed to parse POST body:", jsonError);
            return deps.createErrorResponse("Invalid JSON body for update", 400, req); 
        }

        // Handle empty update payload gracefully
        if (Object.keys(updates).length === 0) {
          console.log(`[me/index.ts] Empty update payload for user ${user.id}. Returning current profile.`);
          const { data: currentProfile, error: fetchError } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('id', user.id)
              .single();
          
          if (fetchError) {
              console.error('[me/index.ts] Error fetching current profile for empty update:', fetchError);
              return deps.createErrorResponse("Failed to fetch profile", 500, req);
          }
          
          return deps.createSuccessResponse(currentProfile, 200, req);
        }

        // --- Newsletter Subscription Logic ---
        if ('is_subscribed_to_newsletter' in updates && user.email) {
          const email = user.email; // Guaranteed to be a string here
          const emailService = deps.getEmailMarketingService({
            provider: Deno.env.get('EMAIL_MARKETING_PROVIDER') ?? '',
            kitApiKey: Deno.env.get('EMAIL_MARKETING_API_KEY') ?? '',
            kitBaseUrl: Deno.env.get('EMAIL_MARKETING_API_URL') ?? '',
            kitTagId: Deno.env.get('EMAIL_MARKETING_NEWSLETTER_TAG_ID') ?? '',
            kitCustomUserIdField: Deno.env.get('EMAIL_MARKETING_USER_ID_FIELD') ?? '',
            kitCustomCreatedAtField: Deno.env.get('EMAIL_MARKETING_CREATED_AT_FIELD') ?? '',
          });

          const { data: currentProfile, error: fetchError } = await supabase
            .from('user_profiles')
            .select('is_subscribed_to_newsletter, first_name, last_name')
            .eq('id', user.id)
            .single();
          
          if (fetchError) {
            console.error('[me] Error fetching current profile for update:', fetchError);
            // Don't block the main update, just log the error
          } else if (currentProfile && updates.is_subscribed_to_newsletter !== currentProfile.is_subscribed_to_newsletter) {
            const userData: UserData = {
              id: user.id,
              email: email,
              firstName: currentProfile.first_name,
              lastName: currentProfile.last_name,
              createdAt: user.created_at,
            };
            try {
              if (updates.is_subscribed_to_newsletter) {
                console.log(`[me] Subscribing user ${email} to newsletter.`);
                if (emailService?.addUserToList) {
                  await emailService.addUserToList(userData);
                }
              } else {
                console.log(`[me] Unsubscribing user ${email} from newsletter.`);
                if (emailService?.removeUser) {
                  await emailService.removeUser(email);
                }
              }
            } catch (emailError) {
               console.error(`[me] Error handling newsletter subscription:`, emailError);
            }
          }
        }
        // --- End Newsletter Logic ---
        
        let updatedProfile = null;
        let updateError = null;
        try {
            const { data, error } = await supabase // supabase client is fine
              .from('user_profiles')
              .update(updates)
              .eq('id', user.id)
              .select()
              .single();
            updatedProfile = data;
            updateError = error;
        } catch (updateCatchErr) {
            console.error('Exception during profile update:', updateCatchErr);
             // Revert: Remove updateCatchErr argument
            return deps.createErrorResponse("Error updating profile data", 500, req); 
        }

        if (updateError) {
          console.error('Error updating profile:', updateError);
          // Revert: Remove updateError argument
          return deps.createErrorResponse("Failed to update profile", 500, req); 
        }
        // Add req argument
        return deps.createSuccessResponse(updatedProfile, 200, req);
      }

      default:
        console.log(`[me/index.ts] Method ${req.method} not allowed.`);
        // Revert: Remove req argument (It was already correct here, just ensuring consistency)
        return deps.createErrorResponse("Method not allowed", 405, req); 
    }
  } catch (err) {
    console.error("[me/index.ts] FATAL UNEXPECTED ERROR in handler:", err);
    // Add instanceof check for err before accessing properties
    if (err instanceof Error) {
        console.error("Error Name:", err.name);
        console.error("Error Message:", err.message);
        console.error("Error Stack:", err.stack);
    }
    const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
     // Use deps again
    return deps.createErrorResponse(
      errorMessage,
      500,
      req, // Add req argument
      err // Pass original error
    );
  }
}

// Only run serve if the module is executed directly
if (import.meta.main) {
    // Update serve call to explicitly pass defaultDeps
    serve((req) => handleMeRequest(req, defaultDeps));
} 