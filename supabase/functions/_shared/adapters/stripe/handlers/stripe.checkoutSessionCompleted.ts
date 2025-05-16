import Stripe from 'npm:stripe';
import { PaymentConfirmation } from '../../../types/payment.types.ts';
import type { HandlerContext } from '../../../stripe.mock.ts';
// We assume PaymentTransaction is defined in HandlerContext or through context.supabaseClient queries
// or we might need to import Tables from '../../../../types_db.ts' and define it if used directly.

export async function handleCheckoutSessionCompleted(
  context: HandlerContext,
  event: Stripe.CheckoutSessionCompletedEvent
): Promise<PaymentConfirmation> {
  const session = event.data.object;
  let internalPaymentId = session.metadata?.internal_payment_id;
  const gatewayTransactionId = session.id;

  context.logger.info(
    `[handleCheckoutSessionCompleted] Processing for session ${gatewayTransactionId}, initial internalPaymentId from metadata: ${internalPaymentId}`
  );

  if (!internalPaymentId) {
    context.logger.error(
      '[handleCheckoutSessionCompleted] internal_payment_id missing from metadata:',
      { sessionDetails: session }
    );
    return { 
      success: false, 
      transactionId: undefined, 
      paymentGatewayTransactionId: gatewayTransactionId, 
      error: 'Internal payment ID missing from webhook metadata.' 
    };
  }

  // Strip 'ipid_' prefix if present, as the DB expects a pure UUID
  if (internalPaymentId.startsWith('ipid_')) {
    const originalId = internalPaymentId;
    internalPaymentId = internalPaymentId.substring(5); // Length of 'ipid_'
    context.logger.info(
      `[handleCheckoutSessionCompleted] Transformed internalPaymentId from ${originalId} to ${internalPaymentId} (stripped 'ipid_')`
    );
  }

  try {
    const { data: paymentTx, error: fetchError } = await context.supabaseClient
      .from('payment_transactions')
      .select('*')
      .eq('id', internalPaymentId)
      .single();

    if (fetchError || !paymentTx) {
      context.logger.error(
        `[handleCheckoutSessionCompleted] Payment transaction not found: ${internalPaymentId}.`, 
        { error: fetchError }
      );
      return { 
        success: false, 
        transactionId: internalPaymentId, 
        paymentGatewayTransactionId: gatewayTransactionId,
        error: `Payment transaction not found: ${internalPaymentId}` 
      };
    }

    if (paymentTx.status === 'COMPLETED') {
      context.logger.info(`[handleCheckoutSessionCompleted] Transaction ${internalPaymentId} already processed with status COMPLETED.`);
      return { 
        success: true, 
        transactionId: internalPaymentId, 
        paymentGatewayTransactionId: paymentTx.gateway_transaction_id || gatewayTransactionId, // Prefer stored one if available
        tokensAwarded: paymentTx.tokens_to_award ?? undefined,
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
        paymentGatewayTransactionId: paymentTx.gateway_transaction_id || gatewayTransactionId,
        tokensAwarded: 0, // No tokens for a failed transaction
        message: `Transaction ${internalPaymentId} already processed with status FAILED. Original status: FAILED.`,
        error: `Payment transaction ${internalPaymentId} was previously marked as FAILED.` // Clarify original state
      };
    }

    if (session.mode === 'subscription') {
      context.logger.info(`[handleCheckoutSessionCompleted] Processing 'subscription' mode for ${internalPaymentId}`);
      const stripeSubscriptionId = session.subscription;
      const stripeCustomerId = session.customer;
      const userId = paymentTx.user_id;

      if (!stripeSubscriptionId || typeof stripeSubscriptionId !== 'string') {
        const errMsg = 'Stripe Subscription ID missing or invalid in session.';
        context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { sessionDetails: session });
        return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
      }
      if (!stripeCustomerId || typeof stripeCustomerId !== 'string') {
        const errMsg = 'Stripe Customer ID missing or invalid in session.';
        context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { sessionDetails: session });
        return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
      }
      if (!userId) {
        const errMsg = 'User ID for subscription missing in payment transaction.';
        context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { paymentTransactionDetails: paymentTx });
        return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
      }

      const itemIdFromPaymentTx = 
        typeof paymentTx.metadata_json === 'object' && 
        paymentTx.metadata_json !== null && 
        'itemId' in paymentTx.metadata_json 
          ? String((paymentTx.metadata_json as Record<string, unknown>).itemId) 
          : undefined;
      const itemIdFromSessionMetadata = session.metadata?.item_id;
      const itemIdInternal = itemIdFromPaymentTx || itemIdFromSessionMetadata;

      if (!itemIdInternal) {
        const errMsg = `Internal item ID for subscription plan lookup missing for payment ${internalPaymentId}.`;
        context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { paymentTxMeta: paymentTx.metadata_json, sessionMeta: session.metadata });
        return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
      }
      
      let stripeSubscriptionObject: Stripe.Subscription;
      try {
        stripeSubscriptionObject = await context.stripe.subscriptions.retrieve(stripeSubscriptionId);
      } catch (retrieveError) {
        const retrieveErrorMessage = retrieveError instanceof Error ? retrieveError.message : String(retrieveError);
        const errMsg = `Failed to retrieve Stripe subscription ${stripeSubscriptionId}: ${retrieveErrorMessage}`;
        context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { error: retrieveError });
        // Attempt to mark paymentTx as FAILED due to this critical step failing
        await context.updatePaymentTransaction(internalPaymentId, { status: 'FAILED' }, event.id);
        return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
      }
      
      const { data: planData, error: planFetchError } = await context.supabaseClient
        .from('subscription_plans')
        .select('id')
        .eq('item_id_internal', itemIdInternal)
        .single();

      if (planFetchError || !planData) {
        const errMsg = `Could not find internal subscription plan ID for item_id: ${itemIdInternal}.`;
        context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { error: planFetchError });
        await context.updatePaymentTransaction(internalPaymentId, { status: 'FAILED' }, event.id);
        return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
      }
      const internalPlanId = planData.id;
      
      const userSubscriptionData = {
        user_id: userId,
        plan_id: internalPlanId,
        status: stripeSubscriptionObject.status,
        stripe_customer_id: stripeCustomerId as string,
        stripe_subscription_id: stripeSubscriptionId,
        current_period_start: stripeSubscriptionObject.current_period_start ? new Date(stripeSubscriptionObject.current_period_start * 1000).toISOString() : null,
        current_period_end: stripeSubscriptionObject.current_period_end ? new Date(stripeSubscriptionObject.current_period_end * 1000).toISOString() : null,
        cancel_at_period_end: stripeSubscriptionObject.cancel_at_period_end,
      };
      
      const { error: upsertError } = await context.supabaseClient
        .from('user_subscriptions')
        .upsert(userSubscriptionData, { onConflict: 'stripe_subscription_id' });

      if (upsertError) {
        const upsertErrorMessage = upsertError instanceof Error ? upsertError.message : String(upsertError);
        const errMsg = `Failed to upsert user_subscription for ${stripeSubscriptionId}: ${upsertErrorMessage}`;
        context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`, { error: upsertError });
        // Payment was successful, but linking subscription failed. Mark payment as COMPLETED but return error for this handler.
        // Tokens should not be awarded if subscription linking fails.
        await context.updatePaymentTransaction(internalPaymentId, { status: 'COMPLETED' }, event.id); // Mark payment as completed
        return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg, tokensAwarded: 0 };
      } else {
        context.logger.info(`[handleCheckoutSessionCompleted] Upserted user_subscription for ${stripeSubscriptionId}`);
      }
    } else if (session.mode === 'payment') {
      context.logger.info(`[handleCheckoutSessionCompleted] Processing 'payment' mode for ${internalPaymentId}`);
    } else {
      // This case should ideally not happen if Stripe sends valid modes.
      const errMsg = `Unexpected session mode: ${session.mode} for ${internalPaymentId}`;
      context.logger.warn(`[handleCheckoutSessionCompleted] ${errMsg}`);
      // Mark as failed because we can't process it.
      await context.updatePaymentTransaction(internalPaymentId, { status: 'FAILED' }, event.id);
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
    }

    const updatedPaymentTx = await context.updatePaymentTransaction(
      internalPaymentId,
      { status: 'COMPLETED', gateway_transaction_id: gatewayTransactionId },
      event.id
    );

    if (!updatedPaymentTx) {
      // This implies updatePaymentTransaction itself failed, which is a serious issue.
      const errMsg = `Critical: Failed to update payment_transactions ${internalPaymentId} to COMPLETED.`;
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`);
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg };
    }

    if (!paymentTx.target_wallet_id) {
      const errMsg = `Token award failed for ${internalPaymentId}: target_wallet_id missing.`;
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`);
      await context.updatePaymentTransaction(internalPaymentId, { status: 'TOKEN_AWARD_FAILED' }, event.id);
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg, tokensAwarded: 0 };
    }
    if (!paymentTx.user_id) {
      const errMsg = `Token award failed for ${internalPaymentId}: user_id missing.`;
      context.logger.error(`[handleCheckoutSessionCompleted] ${errMsg}`);
      await context.updatePaymentTransaction(internalPaymentId, { status: 'TOKEN_AWARD_FAILED' }, event.id);
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errMsg, tokensAwarded: 0 };
    }
    if (paymentTx.tokens_to_award == null || paymentTx.tokens_to_award <= 0) {
        const msg = `No tokens to award or invalid amount for ${internalPaymentId}: ${paymentTx.tokens_to_award}. Skipping token award.`;
        context.logger.warn(`[handleCheckoutSessionCompleted] ${msg}`);
        return { 
            success: true, 
            transactionId: internalPaymentId, 
            paymentGatewayTransactionId: gatewayTransactionId, 
            tokensAwarded: 0,
            message: msg 
        }; 
    }

    try {
      await context.tokenWalletService.recordTransaction({
        walletId: paymentTx.target_wallet_id!,
        type: 'CREDIT_PURCHASE',
        amount: String(paymentTx.tokens_to_award),
        recordedByUserId: paymentTx.user_id!,
        relatedEntityId: internalPaymentId,
        relatedEntityType: 'payment_transactions',
        notes: `Tokens for Stripe Checkout Session ${gatewayTransactionId} (mode: ${session.mode})`,
      });
      context.logger.info(`[handleCheckoutSessionCompleted] Tokens awarded for ${internalPaymentId}.`);
    } catch (tokenError) {
      const tokenErrorMessage = tokenError instanceof Error ? tokenError.message : String(tokenError);
      const errMsg = `Failed to award tokens for payment transaction ${internalPaymentId}: ${tokenErrorMessage}`;
      context.logger.error(`[handleCheckoutSessionCompleted] Token awarding exception for ${internalPaymentId}:`, { error: tokenError } );
      await context.updatePaymentTransaction(internalPaymentId, { status: 'TOKEN_AWARD_FAILED' }, event.id);
      return { 
        success: false, 
        transactionId: internalPaymentId, 
        paymentGatewayTransactionId: gatewayTransactionId, 
        error: errMsg, 
        tokensAwarded: 0 
      };
    }
    
    return { 
      success: true, 
      transactionId: internalPaymentId, 
      paymentGatewayTransactionId: gatewayTransactionId,
      tokensAwarded: paymentTx.tokens_to_award 
    };

  } catch (error) {
    // General catch-all; should ideally be more specific catches above.
    const generalErrorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error(
      `[handleCheckoutSessionCompleted] General exception for ${internalPaymentId || 'unknown_internal_id'}:`,
      { error: error }
    );
    
    if (internalPaymentId) { // Attempt to mark as FAILED if we have an ID
      try {
        await context.updatePaymentTransaction(internalPaymentId, { status: 'FAILED' }, event.id);
      } catch (updateErr) {
        context.logger.error(
          `[handleCheckoutSessionCompleted] Failed to mark payment_transaction ${internalPaymentId} as FAILED after general error:`,
          { error: updateErr }
        );
      }
    }
    return { 
      success: false, 
      transactionId: internalPaymentId, // Might be undefined if error happened before it was parsed
      paymentGatewayTransactionId: gatewayTransactionId, 
      error: `General processing error: ${generalErrorMessage}` 
    };
  }
}
