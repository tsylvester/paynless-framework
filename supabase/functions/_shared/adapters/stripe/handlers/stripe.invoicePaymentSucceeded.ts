import type Stripe from 'npm:stripe';
import type { Json } from '../../../../types_db.ts';
import type { HandlerContext } from '../../../stripe.mock.ts';
import type { PaymentConfirmation } from '../../../types/payment.types.ts';
import { isRecord } from '../../../utils/type-guards/type_guards.common.ts';

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
      .maybeSingle();

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

  if (invoice.billing_reason === 'subscription_create') {
    context.logger.info(`[handleInvoicePaymentSucceeded] subscription_create invoice ${invoice.id} skipped; handled by checkout.session.completed`, { eventId: stripeEventId });
    return {
      success: true,
      transactionId: undefined,
      tokensAwarded: 0,
      message: 'subscription_create invoice skipped; handled by checkout.session.completed',
    };
  }

  const subscriptionIdFromLineItem = invoice.lines.data[0]?.subscription;
  const subscriptionId = typeof subscriptionIdFromLineItem === 'string' ? subscriptionIdFromLineItem : subscriptionIdFromLineItem?.id;
  let paymentIntentId = '';
  if (invoice.confirmation_secret?.client_secret) {
    paymentIntentId = invoice.confirmation_secret.client_secret.split('_secret_')[0];
  }

  // Idempotency Check: See if we've already successfully processed this invoice_id
  const { data: existingSuccessfulTx, error: checkError } = await context.supabaseClient
    .from('payment_transactions')
    .select('id, status, tokens_to_award')
    .eq('gateway_transaction_id', invoice.id)
    .eq('status', 'COMPLETED') // Check specifically for a COMPLETED status
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
      tokensAwarded: existingSuccessfulTx.tokens_to_award,
      message: 'Invoice already processed.',
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
  let rawTokensValue = '';
  let planItemIdInternal = '';

  // Retrieve checkout_session_id earlier for potential use in metadata lookup
  let checkoutSessionId = '';
  const checkoutSessionRefUnknown: unknown = Reflect.get(invoice, 'checkout_session');

  if (typeof checkoutSessionRefUnknown === 'string') {
    checkoutSessionId = checkoutSessionRefUnknown;
  } else if (checkoutSessionRefUnknown !== null && typeof checkoutSessionRefUnknown === 'object') {
    const expandedSessionId = Reflect.get(checkoutSessionRefUnknown, 'id');
    if (typeof expandedSessionId === 'string') {
      checkoutSessionId = expandedSessionId;
    }
  }

  if (invoice.metadata && typeof invoice.metadata.tokens_to_award === 'string') {
    rawTokensValue = invoice.metadata.tokens_to_award;
  } else if (invoice.metadata && typeof invoice.metadata.tokens_to_award === 'number') {
    rawTokensValue = String(invoice.metadata.tokens_to_award);
  } else if (rawTokensValue === '' && invoice.lines?.data?.[0]?.metadata && typeof invoice.lines.data[0].metadata.tokens_to_award === 'string') {
    rawTokensValue = invoice.lines.data[0].metadata.tokens_to_award;
  } else if (rawTokensValue === '' && invoice.lines?.data?.[0]?.metadata && typeof invoice.lines.data[0].metadata.tokens_to_award === 'number') {
    rawTokensValue = String(invoice.lines.data[0].metadata.tokens_to_award);
  } else if (rawTokensValue === '' && subscriptionId && typeof subscriptionId === 'string') {
    // If it's a subscription invoice and tokens not found in metadata, try to get from the plan
    context.logger.info(`[handleInvoicePaymentSucceeded] Tokens not in invoice/line_item metadata. Invoice ${invoice.id} is for subscription ${subscriptionId}. Attempting to check plan details.`, { eventId: stripeEventId });
    const planDetails = await retrieveSubscriptionPlanDetails(context, subscriptionId);
    if (planDetails && typeof planDetails.tokens_to_award === 'number') {
      rawTokensValue = String(planDetails.tokens_to_award);
      planItemIdInternal = planDetails.item_id_internal; // Store item_id_internal
      context.logger.info(`[handleInvoicePaymentSucceeded] Found tokens_to_award (${rawTokensValue}) and item_id_internal (${planItemIdInternal}) from subscription plan for invoice ${invoice.id}.`, { eventId: stripeEventId });
    } else {
      context.logger.info(`[handleInvoicePaymentSucceeded] tokens_to_award not found via subscription plan for invoice ${invoice.id}. Proceeding to check CheckoutSession metadata if applicable.`, { eventId: stripeEventId });
    }
  } else if (rawTokensValue === '' && checkoutSessionId !== '') {
    context.logger.info(`[handleInvoicePaymentSucceeded] Tokens not in invoice/line_item metadata. Attempting to check Checkout Session ${checkoutSessionId}. Invoice ID: ${invoice.id}`, { eventId: stripeEventId });
    try {
      const checkoutSession = await context.stripe.checkout.sessions.retrieve(checkoutSessionId);
      if (checkoutSession.metadata && typeof checkoutSession.metadata.tokens_to_award === 'string') {
        rawTokensValue = checkoutSession.metadata.tokens_to_award;
        context.logger.info(`[handleInvoicePaymentSucceeded] Found tokens_to_award ('${rawTokensValue}') in Checkout Session ${checkoutSessionId} metadata. Invoice ID: ${invoice.id}`, { eventId: stripeEventId });
      } else if (checkoutSession.metadata && typeof checkoutSession.metadata.tokens_to_award === 'number') {
        rawTokensValue = String(checkoutSession.metadata.tokens_to_award);
        context.logger.info(`[handleInvoicePaymentSucceeded] Found tokens_to_award (${rawTokensValue}) in Checkout Session ${checkoutSessionId} metadata. Invoice ID: ${invoice.id}`, { eventId: stripeEventId });
      } else {
        context.logger.info(`[handleInvoicePaymentSucceeded] tokens_to_award not found in metadata of Checkout Session ${checkoutSessionId}. Invoice ID: ${invoice.id}`, { eventId: stripeEventId });
      }
    } catch (csError) {
      context.logger.error(`[handleInvoicePaymentSucceeded] Error retrieving Checkout Session ${checkoutSessionId} to check for metadata. Invoice ID: ${invoice.id}. This may be okay if tokens are not expected via session.`, { error: csError, eventId: stripeEventId });
    }
  }

  if (rawTokensValue !== '') {
    const parsedTokens = parseInt(String(rawTokensValue), 10);
    if (!isNaN(parsedTokens)) {
      tokensToAward = parsedTokens;
    } else {
      context.logger.warn(`[handleInvoicePaymentSucceeded] Invalid non-numeric value for tokens_to_award metadata: "${rawTokensValue}". Defaulting to 0. Invoice ID: ${invoice.id}`, { eventId: stripeEventId });
    }
  } else {
    let warningMessage = `[handleInvoicePaymentSucceeded] tokens_to_award not found in invoice metadata or line item metadata`;
    if (checkoutSessionId !== '') {
      warningMessage += `, nor in the metadata of associated Checkout Session ${checkoutSessionId}`;
    }
    warningMessage += `. Defaulting to 0. Invoice ID: ${invoice.id}`;
    context.logger.warn(warningMessage, { eventId: stripeEventId });
  }

  let subscriptionIdForUpdate = null;
  let periodStartIso = null;
  let periodEndIso = null;

  for (const lineItem of invoice.lines.data) {
    const subscriptionRef = lineItem.subscription;
    let candidateSubscriptionId = null;
    if (typeof subscriptionRef === 'string') {
      candidateSubscriptionId = subscriptionRef;
    } else if (subscriptionRef !== null && typeof subscriptionRef === 'object') {
      const expandedId = Reflect.get(subscriptionRef, 'id');
      if (typeof expandedId === 'string') {
        candidateSubscriptionId = expandedId;
      }
    }

    if (candidateSubscriptionId === null) {
      continue;
    }

    const period = lineItem.period;
    if (period === undefined || period === null) {
      continue;
    }

    const startSec = period.start;
    const endSec = period.end;
    if (typeof startSec !== 'number' || typeof endSec !== 'number') {
      continue;
    }

    subscriptionIdForUpdate = candidateSubscriptionId;
    periodStartIso = new Date(startSec * 1000).toISOString();
    periodEndIso = new Date(endSec * 1000).toISOString();
  }

  let rpcStripeSubscriptionMeta: Json = null;
  if (subscriptionId !== undefined) {
    rpcStripeSubscriptionMeta = subscriptionId;
  }

  let rpcPaymentIntentMeta: Json = null;
  if (paymentIntentId !== '') {
    rpcPaymentIntentMeta = paymentIntentId;
  }

  const rpcMetadata: Json = {
    stripe_event_id: stripeEventId,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: rpcStripeSubscriptionMeta,
    checkout_session_id: checkoutSessionId,
    billing_reason: invoice.billing_reason,
    payment_intent_id: rpcPaymentIntentMeta,
  };

  const rpcResult = await context.supabaseClient.rpc('complete_invoice_payment', {
    p_user_id: userId,
    p_target_wallet_id: targetWalletId,
    p_gateway_transaction_id: invoice.id,
    p_tokens_to_award: tokensToAward,
    p_amount_fiat: invoice.total,
    p_currency: invoice.currency,
    p_metadata: rpcMetadata,
    p_token_idempotency_key: event.id,
    p_token_notes: JSON.stringify({
      reason: invoice.billing_reason,
      invoice_id: invoice.id,
      stripe_event_id: stripeEventId,
      item_id_internal: planItemIdInternal,
    }),
    p_stripe_subscription_id: subscriptionIdForUpdate,
    p_period_start: periodStartIso,
    p_period_end: periodEndIso,
  });

  if (rpcResult.error) {
    const rpcFailure = rpcResult.error;
    let errMsg: string;
    if (rpcFailure instanceof Error) {
      errMsg = rpcFailure.message;
    } else {
      errMsg = 'complete_invoice_payment failed: error value is not an Error instance.';
    }
    context.logger.error('[handleInvoicePaymentSucceeded] complete_invoice_payment RPC failed.', {
      rpcFailure,
      eventId: stripeEventId,
    });
    return {
      success: false,
      transactionId: undefined,
      error: errMsg,
    };
  }

  const rpcRowsUnknown: unknown = rpcResult.data;
  if (!Array.isArray(rpcRowsUnknown) || rpcRowsUnknown.length === 0) {
    const errMsg = 'complete_invoice_payment returned no rows.';
    context.logger.error(`[handleInvoicePaymentSucceeded] ${errMsg}`, { eventId: stripeEventId });
    return {
      success: false,
      transactionId: undefined,
      error: errMsg,
    };
  }

  const firstRowUnknown: unknown = rpcRowsUnknown[0];
  if (!isRecord(firstRowUnknown)) {
    const errMsg = 'complete_invoice_payment returned unexpected row shape.';
    context.logger.error(`[handleInvoicePaymentSucceeded] ${errMsg}`, { eventId: stripeEventId });
    return {
      success: false,
      transactionId: undefined,
      error: errMsg,
    };
  }

  const paymentTransactionIdUnknown: unknown = firstRowUnknown['payment_transaction_id'];
  if (typeof paymentTransactionIdUnknown !== 'string') {
    const errMsg = 'complete_invoice_payment row missing payment_transaction_id.';
    context.logger.error(`[handleInvoicePaymentSucceeded] ${errMsg}`, { eventId: stripeEventId });
    return {
      success: false,
      transactionId: undefined,
      error: errMsg,
    };
  }
  const paymentTransactionId: string = paymentTransactionIdUnknown;

  if (
    subscriptionIdForUpdate !== null &&
    periodStartIso !== null &&
    periodEndIso !== null
  ) {
    context.logger.info(`[handleInvoicePaymentSucceeded] Successfully updated user_subscription ${subscriptionIdForUpdate} for invoice ${invoice.id}.`, { eventId: stripeEventId });
  }

  if (tokensToAward > 0) {
    try {
      const { data: walletRowForNotify, error: walletLookupError } = await context.supabaseClient
        .from('token_wallets')
        .select('user_id')
        .eq('wallet_id', targetWalletId)
        .single();

      if (walletLookupError) {
        throw new Error(`Failed to retrieve wallet owner for notification: ${walletLookupError.message}`);
      }

      if (!walletRowForNotify) {
        throw new Error('Failed to retrieve wallet owner for notification: wallet row missing.');
      }

      const notificationUserId = walletRowForNotify.user_id;
      if (!notificationUserId) {
        throw new Error('Failed to retrieve wallet owner for notification: user_id missing on wallet row.');
      }

      await context.supabaseClient.rpc('create_notification_for_user', {
        p_target_user_id: notificationUserId,
        p_notification_type: 'WALLET_TRANSACTION',
        p_notification_data: {
          subject: 'Wallet Balance Updated',
          message: `Your token balance has changed after invoice ${invoice.id} was paid.`,
          target_path: '/transaction-history',
          walletId: targetWalletId,
          paymentTransactionId,
        },
      });
    } catch (notificationError) {
      context.logger.error('[handleInvoicePaymentSucceeded] Failed to create wallet transaction notification.', {
        walletId: targetWalletId,
        error: notificationError,
        eventId: stripeEventId,
      });
    }
  }

  const finalMessageBase = `Successfully processed invoice ${invoice.id} and created payment transaction ${paymentTransactionId}.`;
  let finalMessage = finalMessageBase;
  if (tokensToAward > 0) {
    finalMessage = `${finalMessageBase} Awarded ${tokensToAward} tokens.`;
  }

  return {
    success: true,
    transactionId: paymentTransactionId,
    tokensAwarded: tokensToAward,
    message: finalMessage,
  };
}
