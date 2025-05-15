import Stripe from 'npm:stripe';
import { HandlerContext } from '../types.ts';
import { PaymentConfirmation } from '../../../types/payment.types.ts';
// We assume PaymentTransaction is defined in HandlerContext or through context.supabaseClient queries
// or we might need to import Tables from '../../../../types_db.ts' and define it if used directly.

export async function handleCheckoutSessionCompleted(
  context: HandlerContext,
  event: Stripe.CheckoutSessionCompletedEvent
): Promise<PaymentConfirmation> {
  const session = event.data.object;
  const internalPaymentId = session.metadata?.internal_payment_id;
  const gatewayTransactionId = session.id;

  context.logger.info(
    `[handleCheckoutSessionCompleted] Processing for session ${gatewayTransactionId}, internalPaymentId: ${internalPaymentId}`
  );

  if (!internalPaymentId) {
    context.logger.error(
      '[handleCheckoutSessionCompleted] internal_payment_id missing from metadata:',
      { sessionDetails: session }
    );
    return { success: false, transactionId: undefined, error: 'Internal payment ID missing from webhook.' };
  }

  try {
    const { data: paymentTx, error: fetchError } = await context.supabaseClient
      .from('payment_transactions')
      .select('*') // Select all needed fields: target_wallet_id, tokens_to_award, user_id, status, metadata_json
      .eq('id', internalPaymentId)
      .single();

    if (fetchError || !paymentTx) {
      context.logger.error(
        `[handleCheckoutSessionCompleted] Payment transaction ${internalPaymentId} not found.`, 
        { error: fetchError }
      );
      return { success: false, transactionId: internalPaymentId, error: 'Payment record not found.' };
    }

    if (paymentTx.status === 'COMPLETED') {
      context.logger.info(`[handleCheckoutSessionCompleted] Payment ${internalPaymentId} already completed.`);
      return { 
        success: true, 
        transactionId: internalPaymentId, 
        paymentGatewayTransactionId: gatewayTransactionId,
        tokensAwarded: paymentTx.tokens_to_award ?? undefined 
      };
    }
    if (paymentTx.status === 'FAILED') {
      context.logger.warn(
        `[handleCheckoutSessionCompleted] Payment ${internalPaymentId} previously failed. Webhook for ${event.type} received.`
      );
      return { 
        success: false, 
        transactionId: internalPaymentId, 
        paymentGatewayTransactionId: gatewayTransactionId,
        error: 'Payment previously marked as failed.' 
      };
    }

    if (session.mode === 'subscription') {
      context.logger.info(`[handleCheckoutSessionCompleted] Processing 'subscription' mode for ${internalPaymentId}`);
      const stripeSubscriptionId = session.subscription;
      const stripeCustomerId = session.customer;
      const userId = paymentTx.user_id;

      if (!stripeSubscriptionId || typeof stripeSubscriptionId !== 'string') {
        context.logger.error('[handleCheckoutSessionCompleted] Stripe Subscription ID missing/invalid in session:', { sessionDetails: session });
        return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: 'Stripe Subscription ID missing or invalid.' };
      }
      if (!stripeCustomerId || typeof stripeCustomerId !== 'string') {
        context.logger.error('[handleCheckoutSessionCompleted] Stripe Customer ID missing/invalid in session:', { sessionDetails: session });
        return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: 'Stripe Customer ID missing or invalid.' };
      }
      if (!userId) {
        context.logger.error('[handleCheckoutSessionCompleted] User ID missing in payment_transactions:', { paymentTransactionDetails: paymentTx });
        return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: 'User ID for subscription missing in payment transaction.' };
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
        context.logger.error(`[handleCheckoutSessionCompleted] item_id_internal not found for ${internalPaymentId}.`, { paymentTxMeta: paymentTx.metadata_json, sessionMeta: session.metadata });
        return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: 'Internal item ID for subscription plan lookup missing.' };
      }
      
      const { data: planData, error: planFetchError } = await context.supabaseClient
        .from('subscription_plans')
        .select('id')
        .eq('item_id_internal', itemIdInternal)
        .single();

      if (planFetchError || !planData) {
        context.logger.error(
          `[handleCheckoutSessionCompleted] Could not fetch subscription_plans for item_id_internal ${itemIdInternal}.`, 
          { error: planFetchError }
        );
        return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: 'Failed to resolve internal plan ID for subscription.' };
      }
      const internalPlanId = planData.id;

      const stripeSubscriptionObject = await context.stripe.subscriptions.retrieve(stripeSubscriptionId);
      if (!stripeSubscriptionObject) {
           context.logger.error(`[handleCheckoutSessionCompleted] Failed to retrieve Stripe Subscription object for ID: ${stripeSubscriptionId}`);
           return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: 'Failed to retrieve Stripe Subscription object.' };
      }
      
      const userSubscriptionData = {
        user_id: userId,
        plan_id: internalPlanId,
        status: stripeSubscriptionObject.status,
        stripe_customer_id: stripeCustomerId as string, // already checked it's a string
        stripe_subscription_id: stripeSubscriptionId, // already checked it's a string
        current_period_start: stripeSubscriptionObject.current_period_start ? new Date(stripeSubscriptionObject.current_period_start * 1000).toISOString() : null,
        current_period_end: stripeSubscriptionObject.current_period_end ? new Date(stripeSubscriptionObject.current_period_end * 1000).toISOString() : null,
        cancel_at_period_end: stripeSubscriptionObject.cancel_at_period_end,
      };
      
      const { error: upsertError } = await context.supabaseClient
        .from('user_subscriptions')
        .upsert(userSubscriptionData, { onConflict: 'stripe_subscription_id' });

      if (upsertError) {
        context.logger.error(
          `[handleCheckoutSessionCompleted] Failed to upsert user_subscription for ${stripeSubscriptionId}.`, 
          { error: upsertError }
        );
        // Optionally update paymentTx status to 'SUBSCRIPTION_LINK_FAILED' via context.updatePaymentTransaction
      } else {
        context.logger.info(`[handleCheckoutSessionCompleted] Upserted user_subscription for ${stripeSubscriptionId}`);
      }
    } else if (session.mode === 'payment') {
      context.logger.info(`[handleCheckoutSessionCompleted] Processing 'payment' mode for ${internalPaymentId}`);
    } else {
      context.logger.warn(`[handleCheckoutSessionCompleted] Unexpected session mode: ${session.mode} for ${internalPaymentId}`);
    }

    const updateResult = await context.updatePaymentTransaction(
      internalPaymentId,
      { status: 'COMPLETED', gateway_transaction_id: gatewayTransactionId },
      event.id
    );

    if (!updateResult) {
      context.logger.error(
        `[handleCheckoutSessionCompleted] Failed to update payment_transactions ${internalPaymentId} to COMPLETED.`
      );
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: 'Failed to update payment status after confirmation.' };
    }

    if (!paymentTx.target_wallet_id) {
      context.logger.error(`[handleCheckoutSessionCompleted] target_wallet_id missing for ${internalPaymentId}. Cannot award tokens.`);
      await context.updatePaymentTransaction(internalPaymentId, { status: 'TOKEN_AWARD_FAILED' }, event.id);
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: 'Token award failed: target wallet ID missing.', tokensAwarded: 0 };
    }
    if (!paymentTx.user_id) {
      context.logger.error(`[handleCheckoutSessionCompleted] user_id missing for transaction ${internalPaymentId}. Cannot determine token recipient.`);
      await context.updatePaymentTransaction(internalPaymentId, { status: 'TOKEN_AWARD_FAILED' }, event.id);
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: 'Token award failed: user ID missing.', tokensAwarded: 0 };
    }
    if (paymentTx.tokens_to_award == null || paymentTx.tokens_to_award <= 0) {
        context.logger.warn(
          `[handleCheckoutSessionCompleted] No tokens to award or invalid amount for ${internalPaymentId}: ${paymentTx.tokens_to_award}. Skipping token award.`
        );
        return { success: true, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, tokensAwarded: 0 }; 
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
      context.logger.error(
        `[handleCheckoutSessionCompleted] Token awarding exception for ${internalPaymentId}:`,
        { error: tokenError }
      );
      await context.updatePaymentTransaction(internalPaymentId, { status: 'TOKEN_AWARD_FAILED' }, event.id);
      return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: 'Token award failed after payment.', tokensAwarded: 0 };
    }
    return { 
      success: true, 
      transactionId: internalPaymentId, 
      paymentGatewayTransactionId: gatewayTransactionId,
      tokensAwarded: paymentTx.tokens_to_award 
    };

  } catch (error) {
    context.logger.error(
      `[handleCheckoutSessionCompleted] General exception for ${internalPaymentId}:`,
      { error: error }
    );
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (internalPaymentId) {
      try {
        await context.updatePaymentTransaction(internalPaymentId, { status: 'FAILED' }, event.id);
      } catch (updateErr) {
        context.logger.error(
          `[handleCheckoutSessionCompleted] Failed to mark payment_transaction ${internalPaymentId} as FAILED after general error:`,
          { error: updateErr }
        );
      }
    }
    return { success: false, transactionId: internalPaymentId, paymentGatewayTransactionId: gatewayTransactionId, error: errorMessage };
  }
}
