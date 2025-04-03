import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3"; 
import Stripe from "npm:stripe@14.11.0";
// Keep relative path for local types
import { Database } from "../../types_db.ts"; 

// Type alias for convenience
type CheckoutSession = Stripe.Checkout.Session;

/**
 * Handle checkout.session.completed event
 */
export const handleCheckoutSessionCompleted = async (
  supabase: SupabaseClient<Database>, // Use Database type
  _stripe: Stripe, // Stripe client might not be needed if session has all info
  session: CheckoutSession,
  eventId: string, // Pass the event ID for idempotency
  eventType: string // Pass the event type for logging
): Promise<void> => {
  const functionName = "handleCheckoutSessionCompleted";
  console.log(`[${functionName}] Processing event ID: ${eventId}`);

  // --- 1. Idempotency Check & Transaction Logging (Start) ---
  // Check if this event has already been processed successfully
  const { data: existingTransaction, error: transactionError } = await supabase
    .from('subscription_transactions')
    .select('id, status')
    .eq('stripe_event_id', eventId)
    .maybeSingle();

  if (transactionError) {
    console.error(`[${functionName}] Error checking for existing transaction:`, transactionError);
    throw new Error(`DB error checking transaction: ${transactionError.message}`);
  }

  if (existingTransaction?.status === 'succeeded') {
    console.log(`[${functionName}] Event ${eventId} already processed successfully. Skipping.`);
    return; // Successfully processed before
  }
  
  // If transaction exists but failed/processing, or doesn't exist, insert/update status to 'processing'
  // This reduces race conditions but isn't fully atomic without DB transactions.
  const { error: upsertProcessingError } = await supabase
    .from('subscription_transactions')
    .upsert({
        stripe_event_id: eventId,
        event_type: eventType,
        status: 'processing', // Mark as processing
        user_id: session.metadata?.userId, // Log user_id early
        stripe_checkout_session_id: session.id,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
        amount: session.amount_total,
        currency: session.currency,
        stripe_invoice_id: session.invoice as string,
        stripe_payment_intent_id: session.payment_intent as string
        // Add event_payload: session if desired
    }, { onConflict: 'stripe_event_id' });
    
   if (upsertProcessingError) {
        console.error(`[${functionName}] Error upserting transaction as processing:`, upsertProcessingError);
        // Decide if you should throw or try to continue
        throw new Error(`DB error starting transaction log: ${upsertProcessingError.message}`);
    }

  try {
    // --- 2. Extract Data & Validate ---
    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;
    const userId = session.metadata?.userId;

    if (!customerId || !subscriptionId || !userId) {
      throw new Error(`Missing required metadata (userId, customerId, or subscriptionId) in checkout session ${session.id}`);
    }
    
    // We need the subscription details from the session or a separate Stripe retrieve call
    // If session.subscription is just an ID, you MUST retrieve the subscription from Stripe.
    // If session.subscription is an expanded object, you might use it directly, BUT retrieving ensures latest state.
    // Let's assume session.subscription is just an ID as per typical webhook payloads.
    console.log(`[${functionName}] Retrieving subscription ${subscriptionId} from Stripe.`);
    // Re-enable stripe client usage if needed for retrieve
    // const subscription = await stripe.subscriptions.retrieve(subscriptionId); 
    // For now, assume needed fields are on the checkout session object or will be sent in subscription.updated
    // This depends heavily on how Stripe sends the checkout.session.completed payload and if subscription is expanded.
    // SAFEST APPROACH IS TO HANDLE SUB CREATION/UPDATE ON 'customer.subscription.updated/created' events.
    // Let's simplify this handler to primarily just log the transaction, assuming another event handles DB state.
    
    // --- 3. Update User Subscription (Potentially moved to customer.subscription.updated handler) ---
    // Commenting out the direct update here as it's often better handled by subscription update events
    /*
    const priceId = subscription.items.data[0]?.price.id; // Needs subscription retrieve
    if (!priceId) { throw new Error("Missing price ID in subscription"); }
    
    const { data: planData, error: planError } = await supabase
      .from("subscription_plans")
      .select("id")
      .eq("stripe_price_id", priceId)
      .single();
    if (planError || !planData) { throw new Error(`Plan not found for priceId ${priceId}: ${planError?.message}`); }
    
    const userSubData = {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      plan_id: planData.id,
    };
    
    const { error: upsertSubError } = await supabase
      .from('user_subscriptions')
      .upsert(userSubData, { onConflict: 'stripe_subscription_id' }); // Assuming stripe_subscription_id is unique
      
    if (upsertSubError) {
      throw new Error(`Failed to upsert user subscription: ${upsertSubError.message}`);
    }
    console.log(`[${functionName}] Upserted user subscription for user ${userId}, sub ${subscriptionId}`);
    */
    console.log(`[${functionName}] Skipping direct user_subscription update - expecting separate subscription event.`);

    // --- 4. Finalize Transaction Log (Mark as Succeeded) ---
    const { error: updateSuccessError } = await supabase
      .from('subscription_transactions')
      .update({ status: 'succeeded', updated_at: new Date().toISOString() })
      .eq('stripe_event_id', eventId);

    if (updateSuccessError) {
      // Log error but don't necessarily throw, main logic might be done
      console.error(`[${functionName}] Failed to mark transaction ${eventId} as succeeded:`, updateSuccessError);
    }
    
    console.log(`[${functionName}] Successfully processed event ID: ${eventId}`);

  } catch (error) {
    console.error(`[${functionName}] Error processing event ${eventId}:`, error);
    // --- 5. Log Error in Transaction Table ---
    const { error: updateErrorStatusError } = await supabase
        .from('subscription_transactions')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('stripe_event_id', eventId);
        
    if (updateErrorStatusError) {
         console.error(`[${functionName}] CRITICAL: Failed to mark transaction ${eventId} as failed after error:`, updateErrorStatusError);
    }
    // Re-throw the original error to signal failure to Stripe (important for retries)
    throw error; 
  }
};