// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Stripe from "npm:stripe";
import { Tables, TablesInsert, TablesUpdate } from "../../types_db.ts"; // Assuming types_db.ts is in functions root
import { logger } from "../../_shared/logger.ts"; // Use relative path to shared logger

const TRANSACTION_TABLE = "subscription_transactions";
const SUBSCRIPTION_TABLE = "user_subscriptions";

/**
 * Handles the 'checkout.session.completed' Stripe webhook event.
 *
 * Incorporates transaction logging for idempotency and atomicity.
 * 1. Checks subscription_transactions for existing successful eventId.
 * 2. Upserts transaction record with status 'processing'.
 * 3. Updates the user_subscriptions record to activate.
 * 4. Updates transaction record status to 'succeeded' or 'failed'.
 *
 * @param supabase - The Supabase admin client instance.
 * @param stripe - The Stripe client instance (might be needed for fetching related objects).
 * @param session - The Stripe Checkout Session object from the event payload.
 * @param eventId - The Stripe event ID for idempotency checks/logging.
 * @param eventType - The Stripe event type ('checkout.session.completed').
 */
export async function handleCheckoutSessionCompleted(
  supabase: SupabaseClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  eventId: string,
  eventType: string
): Promise<void> {
  logger.info(`[handleCheckoutSessionCompleted] Handling ${eventType} for session ${session.id}, Event ID: ${eventId}`);
  // Log the incoming session object as structured metadata
  logger.debug(`[handleCheckoutSessionCompleted] Received session object details.`, { sessionData: session });

  const userId = session.client_reference_id;
  const subscriptionId = session.subscription;
  const customerId = session.customer;
  const mode = session.mode;

  if (!userId) {
    throw new Error("Missing client_reference_id (userId)");
  }
  if (mode === "subscription" && !subscriptionId) {
    throw new Error("Missing subscription ID");
  }
  // Customer ID is needed if we have a subscription ID to link things correctly
  if (subscriptionId && !customerId) {
     throw new Error("Missing customer ID");
  }

  let transactionStatus: 'processing' | 'succeeded' | 'failed' = 'processing';
  let coreLogicError: Error | null = null;
  let upsertedSubId: string | null = null; // Variable to store the user_subscription ID

  try {
    // 1. Idempotency Check & Initial Log
    logger.info(`[handleCheckoutSessionCompleted] Checking transaction log for event ${eventId}...`);
    const { data: existingTx, error: transactionCheckError } = await supabase
      .from('subscription_transactions')
      .select('status')
      .eq('stripe_event_id', eventId)
      .maybeSingle();

    if (transactionCheckError) {
      throw new Error(`Failed to check transaction log: ${transactionCheckError.message}`);
    }

    if (existingTx?.status === 'succeeded') {
      logger.info(`[handleCheckoutSessionCompleted] Event ${eventId} already processed successfully. Skipping.`);
      return; // Already processed
    }
    // If processing or failed, we might retry or handle accordingly, for now, proceed.

    const transactionInsert: TablesInsert<"subscription_transactions"> = {
      stripe_event_id: eventId,
      event_type: eventType,
      status: 'processing',
      user_id: userId,
      stripe_checkout_session_id: session.id,
      stripe_subscription_id: typeof subscriptionId === 'string' ? subscriptionId : null,
      stripe_customer_id: typeof customerId === 'string' ? customerId : null,
      // Add other relevant fields from the session if needed for logging/auditing
      amount: session.amount_total, 
      currency: session.currency,
    };

    logger.info(`[handleCheckoutSessionCompleted] Upserting transaction log for ${eventId} as 'processing'...`);
    const { error: upsertProcessingError } = await supabase
      .from('subscription_transactions')
      .upsert(transactionInsert, { onConflict: 'stripe_event_id' });

    if (upsertProcessingError) {
      throw new Error(`Failed to upsert processing transaction log: ${upsertProcessingError.message}`);
    }

    // 2. Core Logic: Update user subscription status (only if it's a subscription type)
    if (mode === "subscription" && typeof subscriptionId === 'string' && typeof customerId === 'string') {
      logger.info(`[handleCheckoutSessionCompleted] Retrieving full subscription details for ${subscriptionId}...`);
      
      // Retrieve the full Stripe Subscription object
      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price.product'], // Expand price and product details if needed later
      });

      if (!stripeSubscription) {
        throw new Error(`Failed to retrieve subscription details from Stripe for ID: ${subscriptionId}`);
      }
      logger.debug(`[handleCheckoutSessionCompleted] Retrieved Stripe subscription details.`, { stripeSubscription });

      // Extract necessary details
      const stripePriceId = stripeSubscription.items.data[0]?.price?.id; // Assuming single item subscription
      const currentPeriodStart = stripeSubscription.current_period_start ? new Date(stripeSubscription.current_period_start * 1000).toISOString() : null;
      const currentPeriodEnd = stripeSubscription.current_period_end ? new Date(stripeSubscription.current_period_end * 1000).toISOString() : null;

      if (!stripePriceId) {
        throw new Error(`Could not find price ID on Stripe subscription ${subscriptionId}`);
      }

      // Find the corresponding plan_id in your database
      logger.info(`[handleCheckoutSessionCompleted] Fetching internal plan ID for Stripe price ${stripePriceId}...`);
      const { data: planData, error: planError } = await supabase
        .from('subscription_plans')
        .select('id')
        .eq('stripe_price_id', stripePriceId)
        .maybeSingle();

      if (planError) {
        throw new Error(`Database error fetching plan ID for stripe_price_id ${stripePriceId}: ${planError.message}`);
      }
      if (!planData) {
        // Log a warning but proceed? Or throw error? Depends on business logic.
        // If a checkout happened, the plan *should* exist. Throwing error might be safer.
        logger.error(`[handleCheckoutSessionCompleted] CRITICAL: Subscription plan with stripe_price_id ${stripePriceId} not found in the database.`);
        throw new Error(`Subscription plan with stripe_price_id ${stripePriceId} not found.`);
      }
      const internalPlanId = planData.id;
      logger.info(`[handleCheckoutSessionCompleted] Found internal plan ID: ${internalPlanId}`);

      logger.info(`[handleCheckoutSessionCompleted] Upserting subscription ${subscriptionId} for user ${userId}...`);
      const subscriptionUpdate: TablesUpdate<"user_subscriptions"> = {
        user_id: userId,
        status: stripeSubscription.status, // Use status directly from Stripe subscription object
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        plan_id: internalPlanId, // Add the internal plan ID
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: stripeSubscription.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      };

      // Activate the subscription in your database - Use upsert for robustness
      const { data: upsertedSub, error: subUpsertError } = await supabase
        .from(SUBSCRIPTION_TABLE)
        // Use upsert based on user_id
        .upsert(subscriptionUpdate, { onConflict: 'user_id' }) 
        .select("id") // Ensure we select the ID
        .maybeSingle(); // Expect one record back

      if (subUpsertError) {
        throw new Error(`Failed to upsert subscription status: ${subUpsertError.message}`);
      }
       // Log warning if upsert didn't return data (shouldn't happen with upsert unless select fails)
       if (!upsertedSub || !upsertedSub.id) {
        logger.error(`[handleCheckoutSessionCompleted] CRITICAL: Upsert operation for user ${userId} did not return the expected record ID.`);
        // Depending on requirements, might need to throw here as linking transaction will fail
         throw new Error(`Failed to retrieve ID after upserting user subscription for user ${userId}.`);
      } else {
         upsertedSubId = upsertedSub.id; // Store the ID for the transaction log update
         logger.info(`[handleCheckoutSessionCompleted] Successfully activated/updated subscription. DB record ID: ${upsertedSubId}`);
      }

      transactionStatus = 'succeeded'; // Mark as succeeded only after core logic passes

    } else {
       logger.info(`[handleCheckoutSessionCompleted] Skipping subscription activation (mode: ${mode}, subId: ${subscriptionId})`);
       transactionStatus = 'succeeded'; // If not a subscription action, mark as succeeded
    }

  } catch (error) {
    logger.error(`[handleCheckoutSessionCompleted] Error during core logic for ${eventId}: ${error}`);
    coreLogicError = error instanceof Error ? error : new Error(String(error)); // Store error to re-throw after logging failure
    transactionStatus = 'failed';
    // Do not re-throw here; let the finally block handle logging status
  } finally {
    // 3. Final Step: Update transaction log status (success or failure)
    logger.info(`[handleCheckoutSessionCompleted] Attempting to mark transaction ${eventId} as '${transactionStatus}'...`);
    try {
      const { error: updateFailureError } = await supabase
        .from(TRANSACTION_TABLE)
        .update({ 
            status: transactionStatus,
            user_subscription_id: upsertedSubId, // Add the user_subscription_id link
            updated_at: new Date().toISOString()
         }) 
        .eq('stripe_event_id', eventId);

      if (updateFailureError) {
        logger.error(`[handleCheckoutSessionCompleted] CRITICAL: Failed to update transaction log status for ${eventId} to ${transactionStatus}: ${updateFailureError.message}`);
        // If the initial logic also failed, prioritize that error
        if (coreLogicError) {
           throw coreLogicError; 
        }
        // Otherwise, throw the error from failing to update the log
        throw new Error(`Failed to finalize transaction log: ${updateFailureError.message}`);
      }
      logger.info(`[handleCheckoutSessionCompleted] Transaction ${eventId} marked as '${transactionStatus}'.`);

      // If the core logic failed initially, re-throw that error now after successfully logging failure status
      if (coreLogicError) {
        throw coreLogicError;
      }

    } catch (finalError) {
       // Catch errors during the finally block itself (e.g., the updateFailureError re-throw)
       logger.error(`[handleCheckoutSessionCompleted] Error during finally block for ${eventId}: ${finalError}`);
       // If the original core logic had an error, prioritize throwing that one
       if (coreLogicError) {
           throw coreLogicError;
       }
       // Otherwise, throw the error that occurred within the finally block
       throw finalError instanceof Error ? finalError : new Error(String(finalError));
    }
  }
}