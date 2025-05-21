import type Stripe from 'npm:stripe';
import type { TablesInsert } from '../../../../types_db.ts'; // Ensure TablesInsert is imported
import type { HandlerContext } from '../../../stripe.mock.ts';
import type { PaymentConfirmation } from '../../../types/payment.types.ts';

export async function handleInvoicePaymentSucceeded(
  context: HandlerContext,
  event: Stripe.Event
): Promise<PaymentConfirmation> {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeEventId = event.id;
  context.logger.info(`[handleInvoicePaymentSucceeded] Received event for Invoice ID: ${invoice.id}, Stripe Event ID: ${stripeEventId}`);

  const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!stripeCustomerId) {
    context.logger.error(`[handleInvoicePaymentSucceeded] Stripe customer ID not found on invoice. Invoice ID: ${invoice.id}`, { eventId: stripeEventId });
    return { success: false, transactionId: undefined, error: 'Stripe customer ID missing on invoice.' };
  }

  // Idempotency Check: See if we've already successfully processed this invoice_id
  const { data: existingSuccessfulTx, error: checkError } = await context.supabaseClient
    .from('payment_transactions')
    .select('id, status')
    .eq('gateway_transaction_id', invoice.id)
    .eq('status', 'succeeded') // Check specifically for a 'succeeded' status
    .maybeSingle();

  if (checkError) {
    context.logger.error(`[handleInvoicePaymentSucceeded] Error checking for existing transaction. Invoice ID: ${invoice.id}`, { error: checkError, eventId: stripeEventId });
    return { success: false, transactionId: undefined, error: 'Failed to check for existing transaction.' };
  }

  if (existingSuccessfulTx) {
    context.logger.info(`[handleInvoicePaymentSucceeded] Invoice ${invoice.id} already successfully processed with transaction ID ${existingSuccessfulTx.id}. Skipping.`, { eventId: stripeEventId });
    return { success: true, transactionId: existingSuccessfulTx.id, message: 'Invoice already processed.' };
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
    return { success: false, transactionId: undefined, error: 'User subscription data not found for Stripe customer ID.' };
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
    return { success: false, transactionId: undefined, error: 'Token wallet not found for user.' };
  }
  const targetWalletId = walletData.wallet_id;

  // --- Determine Tokens to Award ---
  let tokensToAward = 0;
  let rawTokensValue: string | number | null | undefined = null;
  
  // Retrieve checkout_session_id earlier for potential use in metadata lookup
  let checkoutSessionId: string | null = null;
  // Use a more specific type assertion for checkout_session
  const cs = (invoice as Stripe.Invoice & { checkout_session?: string | { id: string } | null }).checkout_session;

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
    status: 'COMPLETED',
    tokens_to_award: tokensToAward,
    amount_requested_fiat: invoice.total,
    currency_requested_fiat: invoice.currency,
    metadata_json: {
      stripe_event_id: stripeEventId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id,
      stripe_invoice_id: invoice.id,
      checkout_session_id: checkoutSessionId,
      billing_reason: invoice.billing_reason,
      payment_intent_id: typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id,
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
    return { success: false, transactionId: undefined, error: 'Failed to record new payment transaction.' };
  }
  context.logger.info(`[handleInvoicePaymentSucceeded] New payment transaction ${newPaymentTx.id} created for invoice ${invoice.id}.`, { eventId: stripeEventId });

  // --- Award Tokens ---
  if (tokensToAward > 0) {
    try {
      const tokenTxResult = await context.tokenWalletService.recordTransaction({
        walletId: targetWalletId,
        type: 'CREDIT_PURCHASE', // Corrected to uppercase
        amount: String(tokensToAward),
        recordedByUserId: userId,
        relatedEntityId: newPaymentTx.id, // Link to the new payment transaction
        relatedEntityType: 'payment_transactions', // Specify entity type
        notes: `Tokens awarded for successful payment of Stripe invoice ${invoice.id}.`,
      });
      context.logger.info(`[handleInvoicePaymentSucceeded] Tokens awarded successfully for new payment transaction ${newPaymentTx.id}. Invoice ID: ${invoice.id}. Token Tx ID: ${tokenTxResult.transactionId}`, { eventId: stripeEventId });
    } catch (tokenError) {
      context.logger.error(`[handleInvoicePaymentSucceeded] Failed to award tokens for new payment transaction ${newPaymentTx.id}. Invoice ID: ${invoice.id}. This needs manual reconciliation.`, { error: tokenError, eventId: stripeEventId });
      return { 
        success: true, 
        transactionId: newPaymentTx.id,
        error: `Payment recorded, but token award failed for invoice ${invoice.id}. Needs reconciliation.`,
        message: `Payment recorded, but token award failed for invoice ${invoice.id}. Needs reconciliation.`
      };
    }
  } else {
    context.logger.info(`[handleInvoicePaymentSucceeded] No tokens to award for invoice ${invoice.id} (tokensToAward is 0).`, { eventId: stripeEventId });
  }

  return {
    success: true,
    transactionId: newPaymentTx.id,
    tokensAwarded: tokensToAward,
    message: `Invoice ${invoice.id} processed successfully. New payment transaction ID: ${newPaymentTx.id}.`
  };
}
