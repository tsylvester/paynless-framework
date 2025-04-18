import { serve } from "https://deno.land/std@0.224.0/http/server.ts"; // Use std lib URL
import { type User } from "npm:@supabase/supabase-js@^2.0.0"; // Use npm: prefix
import { logger } from "../_shared/logger.ts";
import { getEmailMarketingService, type EmailFactoryConfig } from "../_shared/email_service/factory.ts";
import { NoOpEmailService } from "../_shared/email_service/no_op_service.ts"; // Import NoOpEmailService
import { type EmailMarketingService, type UserData } from "../_shared/types.ts"; // Need IEmailMarketingService type

logger.info('`on-user-created` function starting up.');

// Define the dependencies structure
interface HandlerDependencies {
  // The dependency is now just the service instance, which could be NoOp or Kit
  emailService: EmailMarketingService; 
}

// Export the main handler logic for testing, accepting dependencies
export async function handler(req: Request, deps: HandlerDependencies): Promise<Response> {
  // 1. Extract user data from the request body (Auth Hook payload)
  let userRecord: User | null = null;
  try {
    // Supabase Auth Hooks send data in the 'record' or 'old_record' field
    const body = await req.json();
    // Use type assertion carefully, or add more robust validation
    userRecord = body.record as User; 

    // More robust check for essential fields
    if (!userRecord || typeof userRecord !== 'object' || 
        !userRecord.id || typeof userRecord.id !== 'string' || 
        !userRecord.email || typeof userRecord.email !== 'string' || 
        !userRecord.created_at || typeof userRecord.created_at !== 'string') {
      logger.error('Invalid or incomplete user record received from Auth Hook.', { body });
      return new Response(JSON.stringify({ error: "Invalid user record received." }), {
          status: 400, 
          headers: { "Content-Type": "application/json" },
      });
    }
    logger.info('Received user created event for:', { userId: userRecord.id, email: userRecord.email });

  } catch (error) {
    logger.error('Failed to parse request body from Auth Hook', { 
        error: error instanceof Error ? error.message : String(error) 
    });
    return new Response(JSON.stringify({ error: "Failed to parse request." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // 2. Get the email marketing service *from dependencies*
    const { emailService } = deps; 

    // The factory handles returning NoOp if not configured, so we only need to check for null/undefined if the factory itself could fail, which it shouldn't with current design.
    // The instanceof check is still useful to explicitly log WHY we skipped.
    if (emailService instanceof NoOpEmailService) { 
        const reason = "service is NoOpEmailService (not configured or fallback)"; // Updated reason
        logger.warn(`Email marketing sync skipped (${reason}).`, { userId: userRecord!.id }); // Use non-null assertion as record is checked above
        return new Response(JSON.stringify({ message: `User processed, email sync skipped (${reason}).` }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }

    // 3. Format data for the service
    const userData: UserData = {
        id: userRecord!.id,
        email: userRecord!.email,
        firstName: userRecord!.user_metadata?.firstName || undefined, 
        lastName: userRecord!.user_metadata?.lastName || undefined,
        createdAt: userRecord!.created_at, 
        lastSignInAt: userRecord!.last_sign_in_at ?? undefined,
    };

    // 4. Call the service to add the user
    await emailService.addUserToList(userData);

    logger.info('Successfully processed user signup for email marketing.', { userId: userRecord!.id });

    // 5. Return success response to Supabase Auth Hook
    return new Response(JSON.stringify({ message: "User processed for email marketing." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    // Log the error, but return 200 OK to Supabase to prevent blocking user signup
    logger.error('Error processing user for email marketing (addUserToList failed)', { 
      userId: userRecord?.id, // Keep optional chaining here just in case
      error: error instanceof Error ? error.message : String(error)
    });
    // Return the specific message indicating internal failure but webhook success
    return new Response(
      JSON.stringify({ message: "Webhook received, but failed to process user for email marketing." }),
      { status: 200, headers: { "Content-Type": "application/json" } } // Important: Return 200 OK even on internal error
    );
  }
}

// Define default dependencies for the actual runtime
// This now reads env vars, creates config, and calls the factory
const defaultDeps: HandlerDependencies = (() => {
  // Read environment variables here
  const provider = Deno.env.get("EMAIL_MARKETING_PROVIDER");
  const kitApiKey = Deno.env.get("EMAIL_MARKETING_API_KEY");
  const kitBaseUrl = Deno.env.get("EMAIL_MARKETING_BASE_URL");
  const kitTagId = Deno.env.get("EMAIL_MARKETING_TAG_ID");
  const kitCustomUserIdField = Deno.env.get("EMAIL_MARKETING_CUSTOM_USER_ID_FIELD");
  const kitCustomCreatedAtField = Deno.env.get("EMAIL_MARKETING_CUSTOM_CREATED_AT_FIELD");

  // Construct the config object for the factory
  const factoryConfig: EmailFactoryConfig = {
    provider,
    kitApiKey,
    kitBaseUrl,
    kitTagId,
    kitCustomUserIdField,
    kitCustomCreatedAtField,
  };

  // Return the deps object, getting the service instance from the factory
  return {
    emailService: getEmailMarketingService(factoryConfig),
  };
})();

// Only run the server if the script is executed directly
if (import.meta.main) {
    logger.info('`on-user-created` function initializing HTTP server with default dependencies...');
    serve((req) => handler(req, defaultDeps)); 
    logger.info('`on-user-created` function initialized and listening.');
} 