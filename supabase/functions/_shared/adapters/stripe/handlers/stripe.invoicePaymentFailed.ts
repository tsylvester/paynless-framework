import Stripe from 'npm:stripe';
import { PaymentConfirmation } from '../../../types/payment.types.ts';
import type { HandlerContext } from '../../../stripe.mock.ts';

export async function handleInvoicePaymentFailed(
  context: HandlerContext,
  event: Stripe.InvoicePaymentFailedEvent
): Promise<PaymentConfirmation> {
  const invoice = event.data.object;
  const eventId = event.id;
  context.logger.info(`[handleInvoicePaymentFailed] Processing invoice ${invoice.id}, Event ID: ${eventId}`);

  if (!invoice.customer) {
    context.logger.warn(`[handleInvoicePaymentFailed] Invoice ${invoice.id} (Event ${eventId}) has no customer. Skipping.`);
    return { success: true, transactionId: eventId };
  }
  const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id;
  let paymentTransactionIdForReturn: string | undefined = invoice.id;

  try {
    const { data: existingPayment, error: checkError } = await context.supabaseClient
      .from('payment_transactions')
      .select('id, status, user_id, target_wallet_id, organization_id')
      .eq('gateway_transaction_id', invoice.id)
      .eq('payment_gateway_id', 'stripe')
      .maybeSingle();

    if (checkError) {
      context.logger.error(`[handleInvoicePaymentFailed] DB error checking existing payment for invoice ${invoice.id}.`, { error: checkError });
      return { success: false, transactionId: paymentTransactionIdForReturn, error: `DB error: ${checkError.message}` };
    }

    if (existingPayment?.status === 'FAILED') {
      context.logger.info(`[handleInvoicePaymentFailed] Invoice ${invoice.id} (Payment ${existingPayment.id}) already marked FAILED.`);
      return { success: true, transactionId: existingPayment.id };
    }
    if (existingPayment?.status === 'COMPLETED') {
       context.logger.warn(`[handleInvoicePaymentFailed] Invoice ${invoice.id} (Payment ${existingPayment.id}) was COMPLETED, but received payment_failed event. Review needed.`);
    }

    let userId: string | undefined = existingPayment?.user_id;
    let targetWalletIdForFailedTx: string | undefined = existingPayment?.target_wallet_id;
    let organizationId: string | undefined = existingPayment?.organization_id;
    let metadataType = 'RENEWAL_FAILED';

    if (!userId && stripeCustomerId) {
      const { data: userSubDetails, error: userSubError } = await context.supabaseClient
        .from('user_subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', stripeCustomerId)
        .limit(1)
        .single();

      if (userSubError || !userSubDetails?.user_id) {
        context.logger.info(`[handleInvoicePaymentFailed] Could not find user_id for Stripe customer ${stripeCustomerId} via user_subscriptions for invoice ${invoice.id}. This might be a one-time purchase.`, { error: userSubError });
      } else {
        userId = userSubDetails.user_id;
        organizationId = undefined;
      }
    }
    
    let paymentIntentId: string | undefined;
    if (invoice.confirmation_secret?.client_secret) {
        paymentIntentId = invoice.confirmation_secret.client_secret.split('_secret_')[0];
    }

    if (!userId && paymentIntentId) {
      context.logger.info(`[handleInvoicePaymentFailed] No userId yet, trying to find original payment_transaction via payment_intent ${paymentIntentId} for invoice ${invoice.id}`);
      const {data: ptxnByPi, error: ptxnByPiError} = await context.supabaseClient
        .from('payment_transactions')
        .select('user_id, target_wallet_id, organization_id')
        .eq('gateway_transaction_id', paymentIntentId) 
        .eq('payment_gateway_id', 'stripe')
        .maybeSingle();

      if (ptxnByPiError) {
        context.logger.warn(`[handleInvoicePaymentFailed] DB error looking up payment_transaction by payment_intent ${paymentIntentId}.`, {error: ptxnByPiError});
      } else if (ptxnByPi?.user_id) {
        userId = ptxnByPi.user_id;
        targetWalletIdForFailedTx = ptxnByPi.target_wallet_id;
        organizationId = ptxnByPi.organization_id;
        context.logger.info(`[handleInvoicePaymentFailed] Found user_id ${userId}, wallet ${targetWalletIdForFailedTx}, org ${organizationId} via payment_intent ${paymentIntentId}.`);
      } else {
         context.logger.warn(`[handleInvoicePaymentFailed] Could not find payment_transaction or user_id via payment_intent ${paymentIntentId}.`);
      }
    }

    if (userId && !targetWalletIdForFailedTx) { 
      const { data: walletData, error: walletError } = await context.supabaseClient
        .from('token_wallets')
        .select('wallet_id')
        .eq('user_id', userId)
        .single();
      if (walletError || !walletData?.wallet_id) {
        context.logger.warn(`[handleInvoicePaymentFailed] Token wallet not found for user ${userId} (found via PI/Sub) during failed invoice ${invoice.id}.`, { error: walletError });
      } else {
        targetWalletIdForFailedTx = walletData.wallet_id;
      }
    }
    
    const subscriptionId = invoice.lines.data[0]?.subscription;
    if (subscriptionId) {
        metadataType = 'RENEWAL_FAILED';
    } else {
        metadataType = 'ONE_TIME_PAYMENT_FAILED';
    }

    if (!userId || !targetWalletIdForFailedTx) {
      context.logger.error(`[handleInvoicePaymentFailed] CRITICAL: Could not determine user_id and/or target_wallet_id for failed invoice ${invoice.id}. Cannot log to payment_transactions. User: ${userId}, Wallet: ${targetWalletIdForFailedTx}`);
      return { 
        success: false, 
        transactionId: paymentTransactionIdForReturn, 
        error: `Essential user/wallet info missing for failed invoice ${invoice.id}.`,
        status: 500
      };
    }

    const paymentTxData = {
      user_id: userId, 
      organization_id: organizationId,
      target_wallet_id: targetWalletIdForFailedTx,
      payment_gateway_id: 'stripe',
      gateway_transaction_id: invoice.id, 
      status: 'FAILED',
      amount_requested_fiat: invoice.amount_due / 100,
      currency_requested_fiat: invoice.currency,
      tokens_to_award: 0,
      amount_requested_crypto: undefined,
      currency_requested_crypto: undefined,
      metadata_json: { 
          stripe_event_id: eventId, 
          type: metadataType, 
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: subscriptionId ?? undefined,
          stripe_payment_intent_id: paymentIntentId,
          billing_reason: invoice.billing_reason ?? undefined,
          attempt_count: invoice.attempt_count,
       },
    };

    const { data: failedPaymentTx, error: ptUpsertError } = await context.supabaseClient
      .from('payment_transactions')
      .upsert(paymentTxData, { onConflict: 'gateway_transaction_id, payment_gateway_id' })
      .select('id')
      .single();

    if (ptUpsertError || !failedPaymentTx) {
      context.logger.error(`[handleInvoicePaymentFailed] Failed to upsert FAILED payment_transactions record for invoice ${invoice.id}.`, { error: ptUpsertError });
      return { success: false, transactionId: paymentTransactionIdForReturn, error: `DB error upserting failed payment: ${ptUpsertError?.message}` };
    }
    paymentTransactionIdForReturn = failedPaymentTx.id;
    
    let capturedSubRetrieveError: Error | null = null;

    if (subscriptionId && typeof subscriptionId === 'string') {
      try {
        const stripeSubscription = await context.stripe.subscriptions.retrieve(subscriptionId);
        const newStatus = stripeSubscription.status; 

        const { error: subUpdateError } = await context.supabaseClient
          .from('user_subscriptions')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', subscriptionId);

        if (subUpdateError) {
          context.logger.warn(`[handleInvoicePaymentFailed] Failed to update user_subscription ${subscriptionId} status to ${newStatus} for failed invoice ${invoice.id}.`, { error: subUpdateError });
        } else {
          context.logger.info(`[handleInvoicePaymentFailed] Updated user_subscription ${subscriptionId} to status ${newStatus} for invoice ${invoice.id}.`);
        }
      } catch (stripeSubError) {
          if (stripeSubError instanceof Error) {
            capturedSubRetrieveError = stripeSubError;
          } else {
            capturedSubRetrieveError = new Error(String(stripeSubError));
          }
          context.logger.warn(`[handleInvoicePaymentFailed] Failed to retrieve Stripe subscription ${subscriptionId} during failed invoice processing for ${invoice.id}. Status may not be updated in user_subscriptions.`, { error: stripeSubError });
      }
    } else {
        context.logger.info(`[handleInvoicePaymentFailed] Invoice ${invoice.id} is not linked to a subscription. No user_subscription update performed.`);
    }

    if (capturedSubRetrieveError) {
      const errorMessage = `Stripe API error retrieving subscription ${subscriptionId} for invoice ${invoice.id}: ${capturedSubRetrieveError.message}. While the payment transaction ${paymentTransactionIdForReturn} has been marked FAILED, the subscription status could not be verified/updated due to this internal error.`;
      context.logger.error(`[handleInvoicePaymentFailed] ${errorMessage}`);
      return {
        success: false,
        transactionId: paymentTransactionIdForReturn,
        error: errorMessage,
        status: 500
      };
    }

    context.logger.info(`[handleInvoicePaymentFailed] Successfully processed failed invoice ${invoice.id}, payment transaction ${paymentTransactionIdForReturn} marked FAILED.`);
    return { success: true, transactionId: paymentTransactionIdForReturn };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error(`[handleInvoicePaymentFailed] General error processing failed invoice ${invoice.id}, Event ${eventId}.`, { message: errorMessage, errorDetails: error });
    return { 
      success: false, 
      transactionId: paymentTransactionIdForReturn, 
      error: errorMessage,
      status: 500
    };
  }
}
