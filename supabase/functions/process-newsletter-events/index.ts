import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.0.0";
import { logger } from "../_shared/logger.ts";
import { getEmailMarketingService, type EmailFactoryConfig } from "../_shared/email_service/factory.ts";
import { type EmailMarketingService, type UserData } from "../_shared/types.ts";
import { getTagIdForRef, KIT_NEWSLETTER_TAG_ID } from "../_shared/email_service/kit_tags.config.ts";

logger.info('`process-newsletter-events` function starting up.');

// Define the dependencies structure
interface HandlerDependencies {
  supabaseClient: SupabaseClient;
  emailService: EmailMarketingService;
}

// Define the event structure
interface NewsletterEvent {
  id: string;
  user_id: string;
  event_type: 'subscribe' | 'unsubscribe';
  created_at: string;
  processed_at: string | null;
  ref: string | null;
}

// Export the main handler logic for testing
export async function handler(req: Request, deps: HandlerDependencies): Promise<Response> {
  const { supabaseClient, emailService } = deps;
  
  try {
    // Fetch unprocessed newsletter events
    const { data: events, error: fetchError } = await supabaseClient
      .from('newsletter_events')
      .select('*')
      .is('processed_at', null)
      .order('created_at', { ascending: true });

    if (fetchError) {
      logger.error('Failed to fetch newsletter events:', { error: fetchError.message });
      return new Response(
        JSON.stringify({ error: 'Failed to fetch newsletter events' }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!events || events.length === 0) {
      logger.info('No unprocessed newsletter events to process.');
      return new Response(
        JSON.stringify({ message: 'No events to process', processed: 0, failed: 0, skipped: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    logger.info(`Processing ${events.length} newsletter events.`);

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (const event of events as NewsletterEvent[]) {
      try {
        // Look up user email from auth.users
        const { data: userData, error: userError } = await supabaseClient
          .auth.admin.getUserById(event.user_id);

        if (userError || !userData.user) {
          logger.error('Failed to fetch user for newsletter event:', { 
            eventId: event.id, 
            userId: event.user_id, 
            error: userError?.message 
          });
          failed++;
          continue;
        }

        const userEmail = userData.user.email;
        if (!userEmail) {
          logger.error('User has no email address:', { userId: event.user_id });
          failed++;
          continue;
        }

        // Process based on event type
        if (event.event_type === 'subscribe') {
          // Ensure subscriber exists in Kit
          const userDataForKit: UserData = {
            id: userData.user.id,
            email: userEmail,
            firstName: userData.user.user_metadata?.firstName || undefined,
            lastName: userData.user.user_metadata?.lastName || undefined,
            createdAt: userData.user.created_at,
          };
          
          await emailService.addUserToList(userDataForKit);
          logger.info(`Added/updated Kit subscriber for ${userEmail}`);

          // Add ref-specific tag if available
          if (event.ref) {
            const tagId = getTagIdForRef(event.ref);
            if (tagId) {
              await emailService.addTagToSubscriber(userEmail, tagId);
              logger.info(`Added tag ${tagId} (ref: ${event.ref}) to subscriber ${userEmail}`);
            } else {
              logger.warn(`Unknown ref '${event.ref}' for subscriber ${userEmail}, skipping tagging`);
            }
          }
        } else if (event.event_type === 'unsubscribe') {
          // Soft unsubscribe: remove newsletter tag
          if (KIT_NEWSLETTER_TAG_ID) {
            await emailService.removeTagFromSubscriber(userEmail, KIT_NEWSLETTER_TAG_ID);
            logger.info(`Removed newsletter tag from subscriber ${userEmail}`);
          } else {
            logger.warn('KIT_NEWSLETTER_TAG_ID not configured, skipping unsubscribe');
            skipped++;
            continue;
          }
        }

        // Mark event as processed
        const { error: updateError } = await supabaseClient
          .from('newsletter_events')
          .update({ processed_at: new Date().toISOString() })
          .eq('id', event.id);

        if (updateError) {
          logger.error('Failed to mark event as processed:', { 
            eventId: event.id, 
            error: updateError.message 
          });
          failed++;
        } else {
          processed++;
          logger.info(`Successfully processed newsletter event ${event.id}`);
        }
      } catch (error) {
        logger.error('Error processing newsletter event:', { 
          eventId: event.id,
          error: error instanceof Error ? error.message : String(error)
        });
        failed++;
      }
    }

    const summary = {
      message: 'Newsletter events processed',
      processed,
      failed,
      skipped,
      total: events.length
    };

    logger.info('Newsletter event processing complete:', summary);

    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    logger.error('Unexpected error in newsletter event processor:', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// Only run the server if the script is executed directly
if (import.meta.main) {
  // Create default dependencies for runtime
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
    const kitTagId = Deno.env.get("EMAIL_MARKETING_TAG_ID"); // Primary newsletter tag
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

  logger.info('`process-newsletter-events` function initializing HTTP server...');
  serve((req) => handler(req, defaultDeps));
  logger.info('`process-newsletter-events` function initialized and listening.');
}