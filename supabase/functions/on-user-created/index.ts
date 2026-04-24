import { serve } from "https://deno.land/std@0.224.0/http/server.ts"; // Use std lib URL
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@^2.0.0"; // Use npm: prefix
import { logger } from "../_shared/logger.ts";
import { getEmailMarketingService, type EmailFactoryConfig } from "../_shared/email_service/factory.ts";
import { type EmailMarketingService, type UserData } from "../_shared/types.ts";
import { getTagIdForRef } from "../_shared/email_service/kit_tags.config.ts";

logger.info('`on-user-created` function starting up.');

// Define the dependencies structure
interface HandlerDependencies {
  supabaseClient: SupabaseClient;
  emailService: EmailMarketingService;
}

// Export the main handler logic for testing, accepting dependencies
export async function handler(req: Request, deps: HandlerDependencies): Promise<Response> {
  const { supabaseClient, emailService } = deps;
  
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

  // 2. Add user to Kit.com newsletter in real-time
  try {
    // Check if user metadata indicates they want newsletter subscription
    // Default to true for new users unless explicitly opted out
    const wantsNewsletter = userRecord.user_metadata?.newsletter !== false;
    
    if (wantsNewsletter) {
      // Get ref from user metadata if present
      const ref = userRecord.user_metadata?.ref || 'direct';
      
      // Prepare user data for Kit
      const userDataForKit: UserData = {
        id: userRecord.id,
        email: userRecord.email!,
        firstName: userRecord.user_metadata?.firstName || userRecord.user_metadata?.first_name || undefined,
        lastName: userRecord.user_metadata?.lastName || userRecord.user_metadata?.last_name || undefined,
        createdAt: userRecord.created_at,
      };
      
      try {
        // Add user to Kit.com
        await emailService.addUserToList(userDataForKit);
        logger.info(`Successfully added ${userRecord.email} to Kit.com newsletter`);
        
        // Add ref-specific tag if available
        if (ref && ref !== 'direct') {
          const tagId = getTagIdForRef(ref);
          if (tagId) {
            await emailService.addTagToSubscriber(userRecord.email!, tagId);
            logger.info(`Added tag ${tagId} (ref: ${ref}) to subscriber ${userRecord.email}`);
          } else {
            logger.warn(`Unknown ref '${ref}' for subscriber ${userRecord.email}, skipping tagging`);
          }
        }
        
        // Also create a newsletter event for record-keeping
        const { error: insertError } = await supabaseClient
          .from('newsletter_events')
          .insert({
            user_id: userRecord.id,
            event_type: 'subscribe',
            ref: ref,
            processed_at: new Date().toISOString(), // Mark as already processed
          });

        if (insertError) {
          logger.warn('Failed to create newsletter event record:', { 
            error: insertError.message,
            userId: userRecord.id 
          });
        }
        
      } catch (kitError) {
        logger.error('Failed to add user to Kit.com:', {
          error: kitError instanceof Error ? kitError.message : String(kitError),
          userId: userRecord.id,
          email: userRecord.email
        });
        
        // Create unprocessed newsletter event for later retry
        const { error: insertError } = await supabaseClient
          .from('newsletter_events')
          .insert({
            user_id: userRecord.id,
            event_type: 'subscribe',
            ref: ref,
            processed_at: null, // Mark as unprocessed for later retry
          });

        if (insertError) {
          logger.error('Failed to create newsletter event for retry:', { 
            error: insertError.message,
            userId: userRecord.id 
          });
        }
      }
    } else {
      logger.info('User opted out of newsletter during signup.', { userId: userRecord.id });
    }
  } catch (error) {
    logger.error('Error in newsletter subscription process:', { 
      error: error instanceof Error ? error.message : String(error),
      userId: userRecord.id
    });
    // Don't fail the user creation - just log the error
  }

  // Log that we received the user created event
  logger.info('User created event processed successfully.', { userId: userRecord!.id });

  // Return success response to Supabase Auth Hook
  // All Kit communication is now handled by the newsletter event queue
  return new Response(JSON.stringify({ message: "User created event processed." }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Define default dependencies for the actual runtime
const defaultDeps: HandlerDependencies = (() => {
  // Create Supabase client with service_role key for bypassing RLS
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  });

  // Create email service from factory config
  const provider = Deno.env.get("EMAIL_MARKETING_PROVIDER");
  const kitApiKey = Deno.env.get("EMAIL_MARKETING_API_KEY");
  const kitBaseUrl = Deno.env.get("EMAIL_MARKETING_BASE_URL");
  const kitTagId = Deno.env.get("EMAIL_MARKETING_TAG_ID");
  const kitCustomUserIdField = Deno.env.get("EMAIL_MARKETING_CUSTOM_USER_ID_FIELD");
  const kitCustomCreatedAtField = Deno.env.get("EMAIL_MARKETING_CUSTOM_CREATED_AT_FIELD");

  const factoryConfig: EmailFactoryConfig = {
    provider,
    kitApiKey,
    kitBaseUrl,
    kitTagId,
    kitCustomUserIdField,
    kitCustomCreatedAtField,
  };

  return {
    supabaseClient,
    emailService: getEmailMarketingService(factoryConfig),
  };
})();

// Only run the server if the script is executed directly
if (import.meta.main) {
    logger.info('`on-user-created` function initializing HTTP server with default dependencies...');
    serve((req) => handler(req, defaultDeps)); 
    logger.info('`on-user-created` function initialized and listening.');
} 