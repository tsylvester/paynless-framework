import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import Stripe from "npm:stripe@14.11.0";
import { Database } from "../../types_db.ts";

/**
 * Handle customer.subscription.updated event
 */
export const handleSubscriptionUpdated = async (
  supabase: SupabaseClient<Database>,
  _stripe: Stripe, // May not be needed if subscription object has all info
  subscription: Stripe.Subscription,
  eventId: string, // Pass the event ID for idempotency
  eventType: string // Pass the event type for logging
): Promise<void> => {
  const functionName = "handleSubscriptionUpdated";
  console.log(`[${functionName}] Processing event ID: ${eventId}`);

  // --- 1. Idempotency Check & Transaction Logging (Start) ---
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
    return; 
  }
  
  // Log processing attempt
  const { error: upsertProcessingError } = await supabase
    .from('subscription_transactions')
    .upsert({
        stripe_event_id: eventId,
        event_type: eventType,
        status: 'processing',
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer as string,
        // Note: user_id might not be directly available here, 
        // we might need to fetch it based on customer_id later if needed for the log
    }, { onConflict: 'stripe_event_id' });
    
   if (upsertProcessingError) {
        console.error(`[${functionName}] Error upserting transaction as processing:`, upsertProcessingError);
        throw new Error(`DB error starting transaction log: ${upsertProcessingError.message}`);
    }

  try {
    // --- 2. Extract Data & Find User/Plan ---
    const customerId = subscription.customer as string;
    const priceId = subscription.items.data[0]?.price.id;

    if (!priceId) {
      throw new Error(`Missing price ID in subscription ${subscription.id}`);
    }

    // Find corresponding plan_id from your DB
    const { data: planData, error: planError } = await supabase
      .from("subscription_plans")
      .select("id")
      .eq("stripe_price_id", priceId)
      .single();

    if (planError || !planData) {
      // If plan isn't found, maybe it was deleted in Stripe but not synced?
      // Or it's a plan you don't want to support. Log warning and maybe skip update.
      console.warn(`[${functionName}] Plan not found for priceId ${priceId} on subscription ${subscription.id}. Skipping user_subscription update.`);
       // Mark transaction as skipped/ignored instead of failed? 
       // For now, we'll let it proceed to final success log, assuming skipping is intended.
    } else { 
        // --- 3. Update User Subscription ---
        // We found the plan, proceed with update
        const userSubData = {
          // We don't necessarily know the user_id here easily unless we query user_profiles by customerId
          // We MUST update based on stripe_subscription_id as it's the reliable link
          status: subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
          plan_id: planData.id,
          // Also update stripe_customer_id in case it changed? (Unlikely for this event)
          // stripe_customer_id: customerId, 
          updated_at: new Date().toISOString(),
        };

        const { error: updateSubError } = await supabase
          .from("user_subscriptions")
          .update(userSubData)
          .eq("stripe_subscription_id", subscription.id);

        if (updateSubError) {
            // If the update fails (e.g., no matching stripe_subscription_id found),
            // this might indicate the subscription wasn't created in your DB yet.
            // This could happen if checkout.session.completed was missed or processed later.
            // Consider if you need insert logic here too (upsert pattern), or rely on checkout handler.
            console.error(`[${functionName}] Error updating user_subscription ${subscription.id}:`, updateSubError);
            throw new Error(`Failed to update user subscription: ${updateSubError.message}`);
        }
        console.log(`[${functionName}] Updated user_subscription for sub ${subscription.id}`);
    }

    // --- 4. Finalize Transaction Log (Mark as Succeeded) ---
    const { error: updateSuccessError } = await supabase
      .from('subscription_transactions')
      .update({ status: 'succeeded', updated_at: new Date().toISOString() })
      .eq('stripe_event_id', eventId);

    if (updateSuccessError) {
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
    throw error; 
  }
};

/**
 * Handle customer.subscription.deleted event
 */
export const handleSubscriptionDeleted = async (
  supabase: SupabaseClient<Database>,
  subscription: Stripe.Subscription,
  eventId: string, // Pass the event ID for idempotency
  eventType: string // Pass the event type for logging
): Promise<void> => {
  const functionName = "handleSubscriptionDeleted";
  console.log(`[${functionName}] Processing event ID: ${eventId}`);

  // --- 1. Idempotency Check & Transaction Logging (Start) ---
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
    return; 
  }
  
  const { error: upsertProcessingError } = await supabase
    .from('subscription_transactions')
    .upsert({
        stripe_event_id: eventId,
        event_type: eventType,
        status: 'processing',
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer as string,
    }, { onConflict: 'stripe_event_id' });
    
   if (upsertProcessingError) {
        console.error(`[${functionName}] Error upserting transaction as processing:`, upsertProcessingError);
        throw new Error(`DB error starting transaction log: ${upsertProcessingError.message}`);
    }

  try {
    // --- 2. Update User Subscription Status ---
    // Update status to canceled. Don't delete the record, just mark it.
    const { error: updateSubError } = await supabase
      .from("user_subscriptions")
      .update({
        status: "canceled", // Or use subscription.status if it reflects the final canceled state
        updated_at: new Date().toISOString(),
        // Optionally clear period end? Or keep it for historical reference?
        // current_period_end: null, 
      })
      .eq("stripe_subscription_id", subscription.id);
      
    if (updateSubError) {
       // Log error if update failed (e.g., subscription never existed in DB)
       console.error(`[${functionName}] Error updating user_subscription ${subscription.id} to canceled:`, updateSubError);
       // Depending on requirements, maybe don't throw here if the record just didn't exist
    }
    console.log(`[${functionName}] Marked user_subscription ${subscription.id} as canceled (if it existed).`);

    // --- 3. Finalize Transaction Log (Mark as Succeeded) ---
     const { error: updateSuccessError } = await supabase
      .from('subscription_transactions')
      .update({ status: 'succeeded', updated_at: new Date().toISOString() })
      .eq('stripe_event_id', eventId);

    if (updateSuccessError) {
      console.error(`[${functionName}] Failed to mark transaction ${eventId} as succeeded:`, updateSuccessError);
    }
    
    console.log(`[${functionName}] Successfully processed event ID: ${eventId}`);

  } catch (error) {
     console.error(`[${functionName}] Error processing event ${eventId}:`, error);
    // --- 4. Log Error in Transaction Table ---
    const { error: updateErrorStatusError } = await supabase
        .from('subscription_transactions')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('stripe_event_id', eventId);
        
    if (updateErrorStatusError) {
         console.error(`[${functionName}] CRITICAL: Failed to mark transaction ${eventId} as failed after error:`, updateErrorStatusError);
    }
    throw error; 
  }
};