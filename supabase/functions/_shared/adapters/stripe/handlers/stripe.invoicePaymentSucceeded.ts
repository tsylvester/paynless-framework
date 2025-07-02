import type Stripe from 'npm:stripe';
import type { TablesInsert, Json } from '../../../../types_db.ts'; // Ensure TablesInsert is imported
import type { HandlerContext } from '../../../stripe.mock.ts';
import type { PaymentConfirmation } from '../../../types/payment.types.ts';

// Helper function to retrieve plan details from a Stripe Subscription
async function retrieveSubscriptionPlanDetails(
  context: HandlerContext,
  stripeSubscriptionId: string
): Promise<{ tokens_to_award: number; plan_type: string; item_id_internal: string; stripe_price_id: string; } | null> {
  try {
    context.logger.info(`[retrieveSubscriptionPlanDetails] Retrieving Stripe subscription ${stripeSubscriptionId} to find plan details.`);
    const subscription = await context.stripe.subscriptions.retrieve(stripeSubscriptionId);

    if (!subscription?.items?.data?.[0]?.price?.id) {
      context.logger.warn(`[retrieveSubscriptionPlanDetails] Could not find price ID on subscription ${stripeSubscriptionId}.`);
      return null;
    }
    const stripePriceId = subscription.items.data[0].price.id;
    context.logger.info(`[retrieveSubscriptionPlanDetails] Found Stripe Price ID ${stripePriceId} for subscription ${stripeSubscriptionId}. Querying local subscription_plans.`);

    const { data: planData, error: planError } = await context.supabaseClient
      .from('subscription_plans')
      .select('tokens_to_award, plan_type, item_id_internal, stripe_price_id')
      .eq('stripe_price_id', stripePriceId)
      .single();

    if (planError) {
      context.logger.error(`[retrieveSubscriptionPlanDetails] Error fetching plan details for Stripe Price ID ${stripePriceId} from subscription_plans. DB Error: ${planError.message}`);
      throw planError; 
    }
    if (!planData) {
      context.logger.warn(`[retrieveSubscriptionPlanDetails] No plan found in subscription_plans for Stripe Price ID ${stripePriceId}.`);
      return null;
    }
    context.logger.info(`[retrieveSubscriptionPlanDetails] Found plan details for Stripe Price ID ${stripePriceId}: Tokens ${planData.tokens_to_award}.`);
    return planData;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during subscription/plan retrieval';
    context.logger.error(`[retrieveSubscriptionPlanDetails] Error during subscription/plan retrieval for ${stripeSubscriptionId}. Error: ${errorMessage}`, { errorObj: error });
    throw error;
  }
}

export async function handleInvoicePaymentSucceeded(
  context: HandlerContext,
  event: Stripe.InvoicePaymentSucceededEvent
): Promise<PaymentConfirmation> {
  const invoice = event.data.object;
  const stripeEventId = event.id;
  context.logger.info(`[handleInvoicePaymentSucceeded] Received event for Invoice ID: ${invoice.id}, Stripe Event ID: ${stripeEventId}`);

  const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!stripeCustomerId) {
    context.logger.error(`[handleInvoicePaymentSucceeded] Stripe customer ID not found on invoice. Invoice ID: ${invoice.id}`, { eventId: stripeEventId });
    return { success: false, transactionId: undefined, error: 'Stripe customer ID missing on invoice.' };
  }

  const subscriptionIdFromLineItem = invoice.lines.data[0]?.subscription;
  const subscriptionId = typeof subscriptionIdFromLineItem === 'string' ? subscriptionIdFromLineItem : (subscriptionIdFromLineItem?.id ?? undefined);
  let paymentIntentId: string | undefined;
  if (invoice.confirmation_secret?.client_secret) {
      paymentIntentId = invoice.confirmation_secret.client_secret.split('_secret_')[0];
  }

  // Idempotency Check: See if we've already successfully processed this invoice_id
  const { data: existingSuccessfulTx, error: checkError } = await context.supabaseClient
    .from('payment_transactions')
    .select('id, status, tokens_to_award')
    .eq('gateway_transaction_id', invoice.id)
    .eq('status', 'succeeded') // Check specifically for a 'succeeded' status
    .maybeSingle();

  if (checkError) {
    context.logger.error(`[handleInvoicePaymentSucceeded] Error checking for existing transaction. Invoice ID: ${invoice.id}`, { error: checkError, eventId: stripeEventId });
    return { success: false, transactionId: undefined, error: 'Failed to check for existing transaction.' };
  }

  if (existingSuccessfulTx) {
    context.logger.info(`[handleInvoicePaymentSucceeded] Invoice ${invoice.id} already successfully processed with transaction ID ${existingSuccessfulTx.id}. Skipping.`, { eventId: stripeEventId });
    return { 
      success: true, 
      transactionId: existingSuccessfulTx.id, 
      tokensAwarded: existingSuccessfulTx.tokens_to_award ?? 0,
      message: 'Invoice already processed.' 
    };
  }
  
  // --- Get User and Wallet Details ---
  // 1. Get user_id from user_subscriptions using stripe_customer_id
  const { data: subscriptionData, error: subscriptionError } = await context.supabaseClient
    .from('user_subscriptions')
    .select('user_id') // We only need user_id
    .eq('stripe_customer_id', stripeCustomerId)
    .limit(1) // A customer might have old/canceled subscriptions, but user_id should be the same. Pick one.
    .single(); // Using .single() assuming a customer ID should map to at least one subscription with a user_id.
              // If a customer can exist in Stripe without a local user_subscription record yet, .maybeSingle() and handling null would be safer.

  if (subscriptionError || !subscriptionData?.user_id) {
    context.logger.error(`[handleInvoicePaymentSucceeded] Could not find user_id for Stripe customer ${stripeCustomerId} via user_subscriptions. Invoice: ${invoice.id}.`, { error: subscriptionError, eventId: stripeEventId });
    return { success: false, transactionId: undefined, error: 'User subscription data not found for Stripe customer ID.', status: 500 };
  }
  const userId = subscriptionData.user_id;
  context.logger.info(`[handleInvoicePaymentSucceeded] Found user_id ${userId} for Stripe customer ${stripeCustomerId}.`);

  // 2. Now that we have userId, get the user's token wallet
  const { data: walletData, error: walletError } = await context.supabaseClient
    .from('token_wallets')
    .select('wallet_id')
    .eq('user_id', userId)
    .single();

  if (walletError || !walletData) {
    context.logger.error(`[handleInvoicePaymentSucceeded] Token wallet not found for user ${userId}. Invoice: ${invoice.id}.`, { error: walletError, eventId: stripeEventId });
    return { success: false, transactionId: undefined, error: 'Token wallet not found for user.', status: 404 };
  }
  const targetWalletId = walletData.wallet_id;

  // --- Determine Tokens to Award ---
  let tokensToAward = 0;
  let rawTokensValue: string | number | null | undefined = null;
  let planItemIdInternal: string | null = null; // Added to store item_id_internal
  
  // Retrieve checkout_session_id earlier for potential use in metadata lookup
  let checkoutSessionId: string | null = null;
  const cs = invoice['checkout_session' as keyof Stripe.Invoice] as Stripe.Checkout.Session | string | null;

  if (cs && typeof cs === 'string') {
    checkoutSessionId = cs;
  } else if (cs && typeof cs === 'object' && cs.id && typeof cs.id === 'string') {
    // It's an expanded Checkout.Session object on the Invoice
    checkoutSessionId = cs.id;
  }

  if (invoice.metadata && typeof invoice.metadata.tokens_to_award === 'string') {
    rawTokensValue = invoice.metadata.tokens_to_award;
  } else if (invoice.metadata && typeof invoice.metadata.tokens_to_award === 'number') {
     rawTokensValue = invoice.metadata.tokens_to_award;
  } else if (rawTokensValue === null && invoice.lines?.data?.[0]?.metadata && typeof invoice.lines.data[0].metadata.tokens_to_award === 'string') {
    rawTokensValue = invoice.lines.data[0].metadata.tokens_to_award;
  } else if (rawTokensValue === null && invoice.lines?.data?.[0]?.metadata && typeof invoice.lines.data[0].metadata.tokens_to_award === 'number') {
    rawTokensValue = invoice.lines.data[0].metadata.tokens_to_award;
  } else if (rawTokensValue === null && subscriptionId && typeof subscriptionId === 'string') {
    // If it's a subscription invoice and tokens not found in metadata, try to get from the plan
    context.logger.info(`[handleInvoicePaymentSucceeded] Tokens not in invoice/line_item metadata. Invoice ${invoice.id} is for subscription ${subscriptionId}. Attempting to check plan details.`, { eventId: stripeEventId });
    const planDetails = await retrieveSubscriptionPlanDetails(context, subscriptionId);
    if (planDetails && typeof planDetails.tokens_to_award === 'number') {
      rawTokensValue = planDetails.tokens_to_award;
      planItemIdInternal = planDetails.item_id_internal; // Store item_id_internal
      context.logger.info(`[handleInvoicePaymentSucceeded] Found tokens_to_award (${rawTokensValue}) and item_id_internal (${planItemIdInternal}) from subscription plan for invoice ${invoice.id}.`, { eventId: stripeEventId });
    } else {
      context.logger.info(`[handleInvoicePaymentSucceeded] tokens_to_award not found via subscription plan for invoice ${invoice.id}. Proceeding to check CheckoutSession metadata if applicable.`, { eventId: stripeEventId });
    }
  } else if (rawTokensValue === null && checkoutSessionId) {
    context.logger.info(`[handleInvoicePaymentSucceeded] Tokens not in invoice/line_item metadata. Attempting to check Checkout Session ${checkoutSessionId}. Invoice ID: ${invoice.id}`, { eventId: stripeEventId });
    try {
      const checkoutSession = await context.stripe.checkout.sessions.retrieve(checkoutSessionId);
      if (checkoutSession.metadata && typeof checkoutSession.metadata.tokens_to_award === 'string') {
        rawTokensValue = checkoutSession.metadata.tokens_to_award;
        context.logger.info(`[handleInvoicePaymentSucceeded] Found tokens_to_award ('${rawTokensValue}') in Checkout Session ${checkoutSessionId} metadata. Invoice ID: ${invoice.id}`, { eventId: stripeEventId });
      } else if (checkoutSession.metadata && typeof checkoutSession.metadata.tokens_to_award === 'number') {
        rawTokensValue = checkoutSession.metadata.tokens_to_award;
        context.logger.info(`[handleInvoicePaymentSucceeded] Found tokens_to_award (${rawTokensValue}) in Checkout Session ${checkoutSessionId} metadata. Invoice ID: ${invoice.id}`, { eventId: stripeEventId });
      } else {
        context.logger.info(`[handleInvoicePaymentSucceeded] tokens_to_award not found in metadata of Checkout Session ${checkoutSessionId}. Invoice ID: ${invoice.id}`, { eventId: stripeEventId });
      }
    } catch (csError) {
      context.logger.error(`[handleInvoicePaymentSucceeded] Error retrieving Checkout Session ${checkoutSessionId} to check for metadata. Invoice ID: ${invoice.id}. This may be okay if tokens are not expected via session.`, { error: csError, eventId: stripeEventId });
    }
  }

  if (rawTokensValue !== null) {
    const parsedTokens = parseInt(String(rawTokensValue), 10);
    if (!isNaN(parsedTokens)) {
      tokensToAward = parsedTokens;
    } else {
      context.logger.warn(`[handleInvoicePaymentSucceeded] Invalid non-numeric value for tokens_to_award metadata: "${rawTokensValue}". Defaulting to 0. Invoice ID: ${invoice.id}`, { eventId: stripeEventId });
    }
  } else {
    let warningMessage = `[handleInvoicePaymentSucceeded] tokens_to_award not found in invoice metadata or line item metadata`;
    if (checkoutSessionId) {
      warningMessage += `, nor in the metadata of associated Checkout Session ${checkoutSessionId}`;
    }
    warningMessage += `. Defaulting to 0. Invoice ID: ${invoice.id}`;
    context.logger.warn(warningMessage, { eventId: stripeEventId });
  }
  
  // --- Prepare New Payment Transaction Data ---
  const newPaymentTxData: TablesInsert<'payment_transactions'> = {
    user_id: userId,
    organization_id: null,
    target_wallet_id: targetWalletId,
    payment_gateway_id: 'stripe',
    gateway_transaction_id: invoice.id,
    status: 'PROCESSING_RENEWAL',
    tokens_to_award: tokensToAward,
    amount_requested_fiat: invoice.total,
    currency_requested_fiat: invoice.currency,
    metadata_json: {
      stripe_event_id: stripeEventId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: subscriptionId,
      stripe_invoice_id: invoice.id,
      checkout_session_id: checkoutSessionId,
      billing_reason: invoice.billing_reason,
      payment_intent_id: paymentIntentId,
    },
  };

  // --- Insert New Payment Transaction ---
  const { data: newPaymentTx, error: insertError } = await context.supabaseClient
    .from('payment_transactions')
    .insert(newPaymentTxData)
    .select()
    .single();

  if (insertError || !newPaymentTx) {
    context.logger.error(`[handleInvoicePaymentSucceeded] Failed to insert new payment transaction for invoice ${invoice.id}.`, { error: insertError, eventId: stripeEventId });
    return { success: false, transactionId: undefined, error: 'Failed to record new payment transaction.', status: 500 };
  }
  context.logger.info(`[handleInvoicePaymentSucceeded] New payment transaction ${newPaymentTx.id} created for invoice ${invoice.id}.`, { eventId: stripeEventId });

  // --- Award Tokens ---
  if (tokensToAward > 0) {
    try {
      const notesObject = {
        reason: 'Subscription Renewal',
        invoice_id: invoice.id,
        payment_transaction_id: newPaymentTx.id,
        stripe_event_id: stripeEventId,
        item_id_internal: planItemIdInternal, // Use the stored item_id_internal
        // Add other relevant details if necessary
      };

      const tokenTxResult = await context.tokenWalletService.recordTransaction({
        walletId: targetWalletId,
        type: 'CREDIT_PURCHASE', // Corrected to uppercase
        amount: String(tokensToAward),
        recordedByUserId: userId,
        idempotencyKey: event.id, // Assuming event.id can serve as idempotency key
        relatedEntityId: newPaymentTx.id, // Link to the new payment transaction
        relatedEntityType: 'payment_transactions', // Specify entity type
        paymentTransactionId: newPaymentTx.id, // Added, assuming newPaymentTx.id is the payment_transaction_id
        notes: JSON.stringify(notesObject), // Pass stringified JSON
      });
      context.logger.info(`[handleInvoicePaymentSucceeded] Tokens awarded successfully for new payment transaction ${newPaymentTx.id}. Invoice ID: ${invoice.id}. Token Tx ID: ${tokenTxResult.transactionId}`, { eventId: stripeEventId });
    } catch (tokenError) {
      context.logger.error(`[handleInvoicePaymentSucceeded] Failed to award tokens for new payment transaction ${newPaymentTx.id}. Invoice ID: ${invoice.id}. Attempting to mark PT as TOKEN_AWARD_FAILED.`, { error: tokenError, eventId: stripeEventId });
      const errorMessage = tokenError instanceof Error ? tokenError.message : String(tokenError);
      
      // Attempt to update the payment transaction to reflect token award failure
      const { error: updatePtxError } = await context.supabaseClient
        .from('payment_transactions')
        .update({ status: 'TOKEN_AWARD_FAILED', metadata_json: { ...(newPaymentTx.metadata_json), token_award_error: errorMessage } })
        .eq('id', newPaymentTx.id);

      if (updatePtxError) {
        context.logger.error(`[handleInvoicePaymentSucceeded] CRITICAL: Also failed to update payment transaction ${newPaymentTx.id} status to TOKEN_AWARD_FAILED. Manual review required.`, { updateError: updatePtxError, eventId: stripeEventId });
      }
      // Return success: false because the primary action (awarding tokens) failed.
      return { success: false, transactionId: newPaymentTx.id, error: `Failed to award tokens: ${errorMessage}`, tokensAwarded: 0 };
    }
  } else {
    context.logger.info(`[handleInvoicePaymentSucceeded] No tokens to award for invoice ${invoice.id}. Payment transaction ${newPaymentTx.id} created, but no token transaction performed.`, { eventId: stripeEventId });
  }

  // --- Final Update to Payment Transaction Status ---
  const { data: finalPtx, error: finalUpdateError } = await context.supabaseClient
    .from('payment_transactions')
    .update({ status: 'succeeded' })
    .eq('id', newPaymentTx.id)
    .select()
    .single();

  if (finalUpdateError || !finalPtx) {
    const finalErrorMessage = `CRITICAL: Failed to update payment transaction ${newPaymentTx.id} to 'succeeded' after processing invoice ${invoice.id}.`;
    context.logger.error(`[handleInvoicePaymentSucceeded] ${finalErrorMessage}`, { error: finalUpdateError, eventId: stripeEventId });
    // Even if this update fails, the core logic succeeded. Return success but log the critical failure.
    // The transactionId is still the one we created.
    return { success: true, transactionId: newPaymentTx.id, tokensAwarded: tokensToAward, error: finalErrorMessage };
  }
  
  const finalMessageBase = `Successfully processed invoice ${invoice.id} and created payment transaction ${finalPtx.id}.`;
  const finalMessage = tokensToAward > 0 
    ? `${finalMessageBase} Awarded ${tokensToAward} tokens.`
    : finalMessageBase;

  const relevantLineItem = invoice.lines.data.find(li => li.subscription);
  if (relevantLineItem) {
      const subscriptionIdForUpdate = relevantLineItem.subscription;
      const periodStart = relevantLineItem.period?.start;
      const periodEnd = relevantLineItem.period?.end;

      if (subscriptionIdForUpdate && periodStart && periodEnd) {
        context.logger.info(`[handleInvoicePaymentSucceeded] Found subscription line item. Updating user_subscription ${subscriptionIdForUpdate} for invoice ${invoice.id}.`, { eventId: stripeEventId });
        
        const { error: subUpdateError } = await context.supabaseClient
          .from('user_subscriptions')
          .update({
            status: 'active', // payment_succeeded implies the subscription is or becomes active
            current_period_start: new Date(periodStart * 1000).toISOString(),
            current_period_end: new Date(periodEnd * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscriptionIdForUpdate);
  
        if (subUpdateError) {
          context.logger.error(`[handleInvoicePaymentSucceeded] Failed to update user_subscription for subscription ${subscriptionIdForUpdate} on invoice ${invoice.id}.`, { error: subUpdateError, eventId: stripeEventId });
        } else {
          context.logger.info(`[handleInvoicePaymentSucceeded] Successfully updated user_subscription ${subscriptionIdForUpdate} for invoice ${invoice.id}.`, { eventId: stripeEventId });
        }
      } else {
        context.logger.warn(`[handleInvoicePaymentSucceeded] Subscription line item found on invoice ${invoice.id}, but it is missing subscription_id or period details. Cannot update user_subscription.`, { lineItem: relevantLineItem, eventId: stripeEventId });
      }
  }

  return {
    success: true,
    transactionId: newPaymentTx.id,
    tokensAwarded: tokensToAward,
    message: finalMessage,
  };
}
