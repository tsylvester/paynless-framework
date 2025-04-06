import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "npm:stripe";
import { Tables, TablesInsert, TablesUpdate } from "../../types_db.ts"; // Assuming types_db.ts is in functions root
import { logger } from "@paynless/utils";

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
      logger.info(`[handleCheckoutSessionCompleted] Activating subscription ${subscriptionId} for user ${userId}...`);
      const subscriptionUpdate: TablesUpdate<"user_subscriptions"> = {
        status: "active", // Assuming 'active'. Adjust based on Stripe status if needed.
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        // Potentially update plan_id, current_period_start/end if available & reliable
        updated_at: new Date().toISOString(),
      };

      // Activate the subscription in your database
      const { data: updatedSub, error: subUpdateError } = await supabase
        .from(SUBSCRIPTION_TABLE)
        .update(subscriptionUpdate)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();

      if (subUpdateError) {
        throw new Error(`Failed to update subscription status: ${subUpdateError.message}`);
      }
       if (!updatedSub) {
        // This might happen if the user_profile/user_subscription row doesn't exist yet.
        // Consider creating it or handling this case based on application logic.
        logger.warn(`[handleCheckoutSessionCompleted] No existing subscription found for user ${userId} to update.`);
        // Depending on requirements, this might be an error or just a warning.
        // For now, we'll treat it as potentially okay but log it.
        // throw new Error(`No subscription found for user ${userId} to update.`); 
      }

      logger.info(`[handleCheckoutSessionCompleted] Successfully activated subscription. DB record ID: ${updatedSub?.id ?? 'N/A'}`);
      transactionStatus = 'succeeded'; // Mark as succeeded only after core logic passes

    } else {
       logger.info(`[handleCheckoutSessionCompleted] Skipping subscription activation (mode: ${mode}, subId: ${subscriptionId})`);
       transactionStatus = 'succeeded'; // If not a subscription action, mark as succeeded
    }

  } catch (error) {
    logger.error(`[handleCheckoutSessionCompleted] Error during core logic for ${eventId}: ${error}`);
    coreLogicError = error; // Store error to re-throw after logging failure
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
       throw finalError;
    }
  }
}