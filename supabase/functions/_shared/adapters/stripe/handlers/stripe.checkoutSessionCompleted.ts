import Stripe from 'npm:stripe';
import { PaymentConfirmation } from '../../../types/payment.types.ts';
import type { HandlerContext } from '../../../stripe.mock.ts';
import type { PaymentTransaction } from '../../../types.ts';

export async function handleCheckoutSessionCompleted(
  context: HandlerContext,
  event: Stripe.CheckoutSessionCompletedEvent
): Promise<PaymentConfirmation> {
  const session = event.data.object;
  const sessionMetadata = session.metadata;
  if (!sessionMetadata) {
    context.logger.error(
      '[handleCheckoutSessionCompleted] session metadata missing:',
      { sessionDetails: session }
    );
    return {
      success: false,
      transactionId: undefined,
      paymentGatewayTransactionId: session.id,
      error: 'Internal payment ID missing from webhook metadata.'
    };
  }
  if (!sessionMetadata.internal_payment_id) {
    context.logger.error(
      '[handleCheckoutSessionCompleted] internal_payment_id missing from metadata:',
      { sessionDetails: session }
    );
    return {
      success: false,
      transactionId: undefined,
      paymentGatewayTransactionId: session.id,
      error: 'Internal payment ID missing from webhook metadata.'
    };
  }
  let internalPaymentId = sessionMetadata.internal_payment_id;
  const gatewayTransactionId = session.id;

  context.logger.info(
    `[handleCheckoutSessionCompleted] Processing for session ${gatewayTransactionId}, initial internalPaymentId from metadata: ${internalPaymentId}`
  );

  // Strip 'ipid_' prefix if present, as the DB expects a pure UUID
  if (internalPaymentId.startsWith('ipid_')) {
    const originalId = internalPaymentId;
    internalPaymentId = internalPaymentId.substring(5); // Length of 'ipid_'
    context.logger.info(
      `[handleCheckoutSessionCompleted] Transformed internalPaymentId from ${originalId} to ${internalPaymentId} (stripped 'ipid_')`
    );
  }

  const { data: paymentTxData, error: fetchError } = await context.supabaseClient
    .from('payment_transactions')
    .select('*')
    .eq('id', internalPaymentId)
    .single();

  if (fetchError) {
    context.logger.error(
      `[handleCheckoutSessionCompleted] Payment transaction not found: ${internalPaymentId}.`,
      { error: fetchError }
    );
    return {
      success: false,
      transactionId: internalPaymentId,
      paymentGatewayTransactionId: gatewayTransactionId,
      error: `Payment transaction not found: ${internalPaymentId}`,
      status: 404
    };
  }
  if (!paymentTxData) {
    context.logger.error(
      `[handleCheckoutSessionCompleted] Payment transaction not found: ${internalPaymentId}.`, 
      { error: fetchError }
    );
    return { 
      success: false, 
      transactionId: internalPaymentId, 
      paymentGatewayTransactionId: gatewayTransactionId,
      error: `Payment transaction not found: ${internalPaymentId}`,
      status: 404 // Explicitly set 404 for not found
    };
  }
  const paymentTx: PaymentTransaction = paymentTxData;

  if (paymentTx.status === 'COMPLETED') {
    if (paymentTx.tokens_to_award === null) {
      context.logger.info(`[handleCheckoutSessionCompleted] Transaction ${internalPaymentId} already processed with status COMPLETED.`);
      return {
        success: true,
        transactionId: internalPaymentId,
        paymentGatewayTransactionId: gatewayTransactionId,
        message: `Transaction ${internalPaymentId} already processed with status COMPLETED.`
      };
    }
    context.logger.info(`[handleCheckoutSessionCompleted] Transaction ${internalPaymentId} already processed with status COMPLETED.`);
    return {
      success: true,
      transactionId: internalPaymentId,
      paymentGatewayTransactionId: gatewayTransactionId,
      tokensAwarded: paymentTx.tokens_to_award,
      message: `Transaction ${internalPaymentId} already processed with status COMPLETED.`
    };
  }
  if (paymentTx.status === 'FAILED') {
    context.logger.warn(
      `[handleCheckoutSessionCompleted] Transaction ${internalPaymentId} already processed with status FAILED. Webhook for ${event.type} (${event.id}) received.`
    );
    // It's a "successful" handling of an idempotent event for an already failed transaction.
    // The error property indicates the original failure.
    return { 
      success: true, // Idempotent handling successful
      transactionId: internalPaymentId, 
      paymentGatewayTransactionId: gatewayTransactionId,
      message: `Transaction ${internalPaymentId} already processed with status FAILED. Original status: FAILED.`,
      error: `Payment transaction ${internalPaymentId} was previously marked as FAILED.` // Clarify original state
    };
  }

  const userId = paymentTx.user_id;
  const targetWalletId = paymentTx.target_wallet_id;
  const rawTokensToAward = paymentTx.tokens_to_award;
  if (rawTokensToAward === null) {
    const errMsg = `Token amount missing for ${internalPaymentId}: tokens_to_award is null.`;
    context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`);
    return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
  }
  const tokensToAward: number = rawTokensToAward;
  const tokenNotes = `Tokens for Stripe Checkout Session ${gatewayTransactionId} (mode: ${session.mode})`;

  if (session.mode === 'subscription') {
    context.logger.info(`[handleCheckoutSessionCompleted] Processing 'subscription' mode for ${internalPaymentId}`);
    const stripeSubscriptionId = session.subscription;
    const stripeCustomerId = session.customer;
    if (!stripeSubscriptionId) {
      const errMsg = 'Stripe Subscription ID missing or invalid in session.';
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { sessionDetails: session });
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
    }
    if (typeof stripeSubscriptionId !== 'string') {
      const errMsg = 'Stripe Subscription ID missing or invalid in session.';
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { sessionDetails: session });
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
    }
    if (!stripeCustomerId) {
      const errMsg = 'Stripe Customer ID missing or invalid in session.';
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { sessionDetails: session });
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
    }
    if (typeof stripeCustomerId !== 'string') {
      const errMsg = 'Stripe Customer ID missing or invalid in session.';
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { sessionDetails: session });
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
    }
    if (!userId) {
      const errMsg = 'User ID for subscription missing in payment transaction.';
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { paymentTransactionDetails: paymentTx });
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
    }

    if (!sessionMetadata.item_id) {
      const errMsg = `Internal item ID for subscription plan lookup missing for payment ${internalPaymentId}.`;
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { paymentTxMeta: paymentTx.metadata_json, sessionMeta: session.metadata });
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
    }
    const itemIdInternal: string = sessionMetadata.item_id;

    let stripeSubscriptionObject: Stripe.Subscription;
    try {
      stripeSubscriptionObject = await context.stripe.subscriptions.retrieve(stripeSubscriptionId);
    } catch (retrieveError) {
      if (!(retrieveError instanceof Error)) {
        const errMsg = `Failed to retrieve Stripe subscription ${stripeSubscriptionId}: thrown value is not an Error instance.`;
        context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { error: retrieveError });
        return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg, status: 500 };
      }
      const errMsg = `Failed to retrieve Stripe subscription ${stripeSubscriptionId}: ${retrieveError.message}`;
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { error: retrieveError });
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg, status: 500 };
    }
    
    const firstItem = stripeSubscriptionObject.items.data[0];
    if (!firstItem) {
      const errMsg = `Stripe Subscription object ${stripeSubscriptionId} is missing items.`;
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { subscription: stripeSubscriptionObject });
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
    }

    const { data: planData, error: planFetchError } = await context.supabaseClient
      .from('subscription_plans')
      .select('id')
      .eq('stripe_price_id', itemIdInternal)
      .single();

    if (planFetchError) {
      const errMsg = `Could not find internal subscription plan ID for item_id: ${itemIdInternal}.`;
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { error: planFetchError });
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
    }
    if (!planData) {
      const errMsg = `Could not find internal subscription plan ID for item_id: ${itemIdInternal}.`;
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { error: planFetchError });
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
    }
    const periodStartUnix = firstItem.current_period_start;
    if (periodStartUnix === undefined || periodStartUnix === null) {
      const errMsg = `Stripe subscription item for ${stripeSubscriptionId} is missing current_period_start.`;
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { firstItem });
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
    }
    const periodEndUnix = firstItem.current_period_end;
    if (periodEndUnix === undefined || periodEndUnix === null) {
      const errMsg = `Stripe subscription item for ${stripeSubscriptionId} is missing current_period_end.`;
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { firstItem });
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
    }
    const periodStartIso: string = new Date(periodStartUnix * 1000).toISOString();
    const periodEndIso: string = new Date(periodEndUnix * 1000).toISOString();

    const subscriptionStatus = stripeSubscriptionObject.status;
    if (subscriptionStatus === undefined || subscriptionStatus === null) {
      const errMsg = `Stripe subscription ${stripeSubscriptionId} is missing status.`;
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { subscription: stripeSubscriptionObject });
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
    }

    const cancelAtPeriodEnd = stripeSubscriptionObject.cancel_at_period_end;
    if (cancelAtPeriodEnd !== true && cancelAtPeriodEnd !== false) {
      const errMsg = `Stripe subscription ${stripeSubscriptionId} is missing cancel_at_period_end.`;
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { subscription: stripeSubscriptionObject });
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
    }

    const subscriptionRpcResult = await context.supabaseClient.rpc('complete_checkout_payment', {
      p_user_id: userId,
      p_is_subscription_mode: true,
      p_payment_transaction_id: internalPaymentId,
      p_gateway_transaction_id: gatewayTransactionId,
      p_plan_id: planData.id,
      p_subscription_status: subscriptionStatus,
      p_stripe_customer_id: stripeCustomerId,
      p_stripe_subscription_id: stripeSubscriptionId,
      p_period_start: periodStartIso,
      p_period_end: periodEndIso,
      p_cancel_at_period_end: cancelAtPeriodEnd,
      p_target_wallet_id: targetWalletId,
      p_tokens_to_award: tokensToAward,
      p_token_idempotency_key: event.id,
      p_token_notes: tokenNotes,
    });
    if (subscriptionRpcResult.error) {
      const rpcFailure = subscriptionRpcResult.error;
      let errMsg: string;
      if (rpcFailure instanceof Error) {
        errMsg = rpcFailure.message;
      } else {
        errMsg = 'complete_checkout_payment failed: error value is not an Error instance.';
      }
      context.logger.error('[handleCheckoutSessionCompleted] complete_checkout_payment RPC failed.', { rpcFailure });
      return {
        success: false,
        transactionId: internalPaymentId,
        paymentGatewayTransactionId: gatewayTransactionId,
        error: errMsg,
      };
    }
  } else if (session.mode === 'payment') {
    context.logger.info(`[handleCheckoutSessionCompleted] Processing 'payment' mode for ${internalPaymentId}`);
    const paymentRpcResult = await context.supabaseClient.rpc('complete_checkout_payment', {
      p_user_id: userId,
      p_is_subscription_mode: false,
      p_payment_transaction_id: internalPaymentId,
      p_gateway_transaction_id: gatewayTransactionId,
      p_plan_id: null,
      p_subscription_status: null,
      p_stripe_customer_id: null,
      p_stripe_subscription_id: null,
      p_period_start: null,
      p_period_end: null,
      p_cancel_at_period_end: null,
      p_target_wallet_id: targetWalletId,
      p_tokens_to_award: tokensToAward,
      p_token_idempotency_key: event.id,
      p_token_notes: tokenNotes,
    });
    if (paymentRpcResult.error) {
      const rpcFailure = paymentRpcResult.error;
      let errMsg: string;
      if (rpcFailure instanceof Error) {
        errMsg = rpcFailure.message;
      } else {
        errMsg = 'complete_checkout_payment failed: error value is not an Error instance.';
      }
      context.logger.error('[handleCheckoutSessionCompleted] complete_checkout_payment RPC failed.', { rpcFailure });
      return {
        success: false,
        transactionId: internalPaymentId,
        paymentGatewayTransactionId: gatewayTransactionId,
        error: errMsg,
      };
    }
  } else {
    // This case should ideally not happen if Stripe sends valid modes.
    const errMsg = `Unexpected session mode: ${session.mode} for ${internalPaymentId}`;
    context.logger.warn(`[handleCheckoutSessionCompleted] ${errMsg}`);
    return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
  }

  if (!targetWalletId) {
    const errMsg = `Token award failed for ${internalPaymentId}: target_wallet_id missing.`;
    context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`);
    return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
  }
  if (!userId) {
    const errMsg = `Token award failed for ${internalPaymentId}: user_id missing.`;
    context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`);
    return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
  }

  const tokensAwarded = tokensToAward;

  if (tokensToAward > 0) {
    try {
      const { data: walletData, error: walletError } = await context.supabaseClient
        .from('token_wallets')
        .select('user_id')
        .eq('wallet_id', targetWalletId)
        .single();

      if (walletError) {
        throw new Error(`Failed to retrieve wallet owner for notification: ${walletError.message}`);
      }

      if (!walletData) {
        throw new Error('Failed to retrieve wallet owner for notification: wallet row missing.');
      }

      const notificationUserId = walletData.user_id;
      if (!notificationUserId) {
        throw new Error('Failed to retrieve wallet owner for notification: user_id missing on wallet row.');
      }

      await context.supabaseClient.rpc('create_notification_for_user', {
        p_target_user_id: notificationUserId,
        p_notification_type: 'WALLET_TRANSACTION',
        p_notification_data: {
          subject: 'Wallet Balance Updated',
          message: `Your token balance has changed. New balance updated from a checkout payment.`,
          target_path: '/transaction-history',
          walletId: targetWalletId,
          paymentTransactionId: internalPaymentId,
        },
      });
    } catch (notificationError) {
      context.logger.error('[handleCheckoutSessionCompleted] Failed to create wallet transaction notification.', {
        walletId: targetWalletId,
        error: notificationError,
      });
    }
  }

  const response: PaymentConfirmation = {
    success: true, 
    transactionId: internalPaymentId, 
    paymentGatewayTransactionId: gatewayTransactionId,
    tokensAwarded,
  };

  return response;
}
