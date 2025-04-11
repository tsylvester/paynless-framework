// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Stripe from "npm:stripe@14.11.0";
import { Database } from "../../types_db.ts";

/**
 * Handle invoice.payment_succeeded event
 */
export const handleInvoicePaymentSucceeded = async (
  supabase: SupabaseClient<Database>,
  invoice: Stripe.Invoice, // Use Stripe.Invoice type
  eventId: string, // Pass the event ID for idempotency
  eventType: string // Pass the event type for logging
): Promise<void> => {
  const functionName = "handleInvoicePaymentSucceeded";
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
  
  // --- Check if customer ID exists on the invoice ---
  if (!invoice.customer) {
    // If invoice.customer is null, it might be for a one-off payment not tied to a customer record.
    // We can't link this to a user_subscription, so log and exit gracefully.
    console.warn(`[${functionName}] Invoice ${invoice.id} (Event ${eventId}) does not have a customer ID. Skipping user subscription lookup.`);
    // Return successfully to Stripe to acknowledge receipt without erroring.
    // If transaction logging is desired even for non-customer invoices, you could add it here before returning.
    return;
  }

  // --- Fetch user_id based on stripe_customer_id from invoice ---
  // We know invoice.customer exists here, but it can be an ID (string) or an expanded Customer object.
  // Handle both cases to get the ID string.
  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : invoice.customer.id; // If it's an expanded object, get the id property

  const { data: userSubData, error: userSubError } = await supabase
      .from('user_subscriptions') // Assuming the customer ID link is reliable here
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
      
  if (userSubError) {
      console.error(`[${functionName}] Error fetching user_id for customer ${customerId}:`, userSubError);
      throw new Error(`DB error fetching user_id for customer ${customerId}: ${userSubError.message}`);
  }
  
  if (!userSubData?.user_id) {
      console.error(`[${functionName}] CRITICAL: user_id not found for stripe_customer_id ${customerId}. Invoice event ${eventId} cannot be processed.`);
      throw new Error(`User mapping not found for Stripe customer ${customerId}. Cannot process invoice event ${eventId}.`);
  }
  
  const userId = userSubData.user_id;

  // Log processing attempt (now including user_id)
  const { error: upsertProcessingError } = await supabase
    .from('subscription_transactions')
    .upsert({
        stripe_event_id: eventId,
        event_type: eventType,
        status: 'processing',
        user_id: userId,
        stripe_invoice_id: invoice.id,
        stripe_subscription_id: invoice.subscription as string,
        stripe_customer_id: customerId,
        stripe_payment_intent_id: invoice.payment_intent as string,
        amount: invoice.amount_paid,
        currency: invoice.currency,
    }, { onConflict: 'stripe_event_id' });
    
   if (upsertProcessingError) {
        console.error(`[${functionName}] Error upserting transaction as processing:`, upsertProcessingError);
        throw new Error(`DB error starting transaction log: ${upsertProcessingError.message}`);
    }
    
  try {
    // --- 2. Core Logic (Optional updates based on invoice payment) ---
    // Usually, customer.subscription.updated handles status changes.
    // This handler might be used for recording the payment itself or triggering related logic (e.g., usage reset).
    
    // Example: Find associated user_subscription_id to link in transaction log
    let userSubscriptionId: string | null = null;
    if (invoice.subscription) {
       const { data: subData, error: subErr } = await supabase
          .from('user_subscriptions')
          .select('id')
          .eq('stripe_subscription_id', invoice.subscription as string)
          .maybeSingle();
        if (subErr) console.error(`[${functionName}] Error fetching user_subscription_id for invoice ${invoice.id}:`, subErr);
        if (subData) userSubscriptionId = subData.id;
    }
    console.log(`[${functionName}] Core logic for invoice payment success (if any) goes here.`);

    // --- 3. Finalize Transaction Log (Mark as Succeeded) ---
    const { error: updateSuccessError } = await supabase
      .from('subscription_transactions')
      .update({ 
        status: 'succeeded', 
        user_subscription_id: userSubscriptionId, // Add link if found
        updated_at: new Date().toISOString() 
      })
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

/**
 * Handle invoice.payment_failed event
 */
export const handleInvoicePaymentFailed = async (
  supabase: SupabaseClient<Database>,
  invoice: Stripe.Invoice, // Use Stripe.Invoice type
  eventId: string, // Pass the event ID for idempotency
  eventType: string // Pass the event type for logging
): Promise<void> => {
  const functionName = "handleInvoicePaymentFailed";
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

  if (existingTransaction?.status === 'succeeded' || existingTransaction?.status === 'failed') { // Also check for failed
    console.log(`[${functionName}] Event ${eventId} already processed (status: ${existingTransaction?.status}). Skipping.`);
    return; 
  }
  
  // --- Check if customer ID exists on the invoice ---
  if (!invoice.customer) {
    // If invoice.customer is null, it might be for a one-off payment not tied to a customer record.
    // We can't link this to a user_subscription, so log and exit gracefully.
    console.warn(`[${functionName}] Invoice ${invoice.id} (Event ${eventId}) does not have a customer ID. Skipping user subscription lookup.`);
    // Return successfully to Stripe to acknowledge receipt without erroring.
    // If transaction logging is desired even for non-customer invoices, you could add it here before returning.
    return;
  }

  // --- Fetch user_id based on stripe_customer_id from invoice ---
  // We know invoice.customer exists here, but it can be an ID (string) or an expanded Customer object.
  // Handle both cases to get the ID string.
  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : invoice.customer.id; // If it's an expanded object, get the id property

  const { data: userSubData, error: userSubError } = await supabase
      .from('user_subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
      
  if (userSubError) {
      console.error(`[${functionName}] Error fetching user_id for customer ${customerId}:`, userSubError);
      throw new Error(`DB error fetching user_id for customer ${customerId}: ${userSubError.message}`);
  }
  
  if (!userSubData?.user_id) {
      console.error(`[${functionName}] CRITICAL: user_id not found for stripe_customer_id ${customerId}. Invoice event ${eventId} cannot be processed.`);
      throw new Error(`User mapping not found for Stripe customer ${customerId}. Cannot process invoice event ${eventId}.`);
  }
  
  const userId = userSubData.user_id;

  // Log processing attempt (now including user_id)
  const { error: upsertProcessingError } = await supabase
    .from('subscription_transactions')
    .upsert({
        stripe_event_id: eventId,
        event_type: eventType,
        status: 'processing',
        user_id: userId,
        stripe_invoice_id: invoice.id,
        stripe_subscription_id: invoice.subscription as string,
        stripe_customer_id: customerId,
        stripe_payment_intent_id: invoice.payment_intent as string,
        amount: invoice.amount_due, // amount_due for failed payments
        currency: invoice.currency,
    }, { onConflict: 'stripe_event_id' });
    
   if (upsertProcessingError) {
        console.error(`[${functionName}] Error upserting transaction as processing:`, upsertProcessingError);
        throw new Error(`DB error starting transaction log: ${upsertProcessingError.message}`);
    }

  try {
    // --- 2. Update User Subscription Status ---
    // Find subscription ID to update status to past_due or unpaid
    let userSubscriptionId: string | null = null;
    if (invoice.subscription) {
      const { data: subData, error: subErr } = await supabase
        .from("user_subscriptions")
        .select("id, status") // Select status to check if already past_due
        .eq("stripe_subscription_id", invoice.subscription as string)
        .maybeSingle();
      
      if (subErr) {
          console.error(`[${functionName}] Error fetching user_subscription for invoice ${invoice.id}:`, subErr);
          // Decide if this is critical - maybe still log transaction failure?
      } else if (subData) { 
        userSubscriptionId = subData.id;
        // Optionally check subData.status before updating
        // if (subData.status !== 'past_due' && subData.status !== 'unpaid') { ... }
        const { error: updateSubError } = await supabase
          .from("user_subscriptions")
          .update({ 
            status: "past_due", // or 'unpaid' depending on Stripe status mapping 
            updated_at: new Date().toISOString() 
          })
          .eq("id", subData.id);

        if (updateSubError) {
           console.error(`[${functionName}] Error updating subscription ${invoice.subscription} status to past_due:`, updateSubError);
           // Potentially throw, or just log? Depends on requirements.
        } else {
           console.log(`[${functionName}] Updated subscription ${invoice.subscription} status to past_due.`);
        }
      } else {
         console.warn(`[${functionName}] User subscription not found for Stripe sub ID ${invoice.subscription}. Cannot update status.`);
      }
    } else {
        console.warn(`[${functionName}] Invoice ${invoice.id} is not associated with a subscription. Cannot update status.`);
    }
    
    // --- 3. Finalize Transaction Log (Mark as Failed) ---
    // Note: We mark the *transaction* as failed because the payment failed.
    const { error: updateFailedError } = await supabase
      .from('subscription_transactions')
      .update({ 
        status: 'failed', 
        user_subscription_id: userSubscriptionId, // Add link if found
        updated_at: new Date().toISOString() 
      })
      .eq('stripe_event_id', eventId);

    if (updateFailedError) {
      console.error(`[${functionName}] Failed to mark transaction ${eventId} as failed:`, updateFailedError);
    }
    
    console.log(`[${functionName}] Successfully processed event ID: ${eventId} (Payment Failed)`);

  } catch (error) {
    console.error(`[${functionName}] Error processing event ${eventId}:`, error);
    // --- 4. Log Error in Transaction Table (Mark as Failed - redundant but safe) ---
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