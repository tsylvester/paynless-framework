import Stripe from 'npm:stripe';
import { HandlerContext } from '../types.ts';
import { PaymentConfirmation } from '../../../types/payment.types.ts';

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
  let paymentTransactionIdForReturn: string | undefined = eventId;

  try {
    const { data: existingPayment, error: checkError } = await context.supabaseClient
      .from('payment_transactions')
      .select('id, status')
      .eq('gateway_transaction_id', invoice.id)
      .eq('payment_gateway_id', 'stripe')
      .maybeSingle();

    if (checkError) {
      context.logger.error(`[handleInvoicePaymentFailed] DB error checking existing payment for invoice ${invoice.id}.`, { error: checkError });
      return { success: false, transactionId: eventId, error: `DB error: ${checkError.message}` };
    }

    if (existingPayment?.status === 'FAILED') {
      context.logger.info(`[handleInvoicePaymentFailed] Invoice ${invoice.id} (Payment ${existingPayment.id}) already marked FAILED.`);
      return { success: true, transactionId: existingPayment.id };
    }
    if (existingPayment?.status === 'COMPLETED') {
       context.logger.warn(`[handleInvoicePaymentFailed] Invoice ${invoice.id} (Payment ${existingPayment.id}) was COMPLETED, but received payment_failed event. Review needed.`);
    }

    const { data: userDetails, error: userDetailsError } = await context.supabaseClient
      .from('user_subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .limit(1)
      .single();

    let userId: string | undefined;
    if (userDetailsError || !userDetails?.user_id) {
      context.logger.warn(`[handleInvoicePaymentFailed] Could not find user_id for Stripe customer ${stripeCustomerId} via subscriptions. Invoice: ${invoice.id}.`, { error: userDetailsError });
    } else {
      userId = userDetails.user_id;
    }
    
    let targetWalletIdForFailedTx: string | undefined;
    if (userId) {
      const { data: walletData, error: walletError } = await context.supabaseClient
        .from('token_wallets')
        .select('wallet_id')
        .eq('user_id', userId)
        .single();
      if (walletError || !walletData?.wallet_id) {
        context.logger.warn(`[handleInvoicePaymentFailed] Token wallet not found for user ${userId} during failed invoice ${invoice.id}.`, { error: walletError });
      } else {
        targetWalletIdForFailedTx = walletData.wallet_id;
      }
    }

    if (!targetWalletIdForFailedTx && userId) {
      context.logger.error(`[handleInvoicePaymentFailed] CRITICAL: User ${userId} found but wallet not found for failed invoice ${invoice.id}. Cannot log to payment_transactions due to NOT NULL constraint on target_wallet_id.`);
      return { success: false, transactionId: eventId, error: `Wallet not found for user ${userId} to log failed payment.` };
    } else if (!userId) {
      context.logger.error(`[handleInvoicePaymentFailed] CRITICAL: User not found for failed invoice ${invoice.id}. Cannot log to payment_transactions.`);
      return { success: false, transactionId: eventId, error: `User not found for failed invoice ${invoice.id}.` };
    }

    const paymentTxData = {
      user_id: userId!, 
      organization_id: undefined,
      target_wallet_id: targetWalletIdForFailedTx!,
      payment_gateway_id: 'stripe',
      gateway_transaction_id: invoice.id,
      status: 'FAILED' as const, // Ensure 'FAILED' is a literal type
      amount_requested_fiat: invoice.amount_due / 100,
      currency_requested_fiat: invoice.currency,
      tokens_to_award: 0,
      amount_requested_crypto: undefined,
      currency_requested_crypto: undefined,
      metadata_json: { 
          stripe_event_id: eventId, 
          type: 'RENEWAL_FAILED', 
          stripe_subscription_id: (invoice.subscription && typeof invoice.subscription === 'object' ? (invoice.subscription.id ?? undefined) : (invoice.subscription ?? undefined)),
          billing_reason: invoice.billing_reason ?? undefined,
          attempt_count: invoice.attempt_count,
       },
    };

    const { data: failedPaymentTx, error: upsertPaymentError } = await context.supabaseClient
      .from('payment_transactions')
      .upsert(paymentTxData, { onConflict: 'gateway_transaction_id, payment_gateway_id' })
      .select('id')
      .single();

    if (upsertPaymentError || !failedPaymentTx) {
      context.logger.error(`[handleInvoicePaymentFailed] Failed to upsert FAILED payment_transactions record for invoice ${invoice.id}.`, { error: upsertPaymentError });
      return { success: false, transactionId: eventId, error: `DB error upserting failed payment: ${upsertPaymentError?.message}` };
    }
    paymentTransactionIdForReturn = failedPaymentTx.id;
    
    if (invoice.subscription && typeof invoice.subscription === 'string') {
      try {
        const stripeSubscription = await context.stripe.subscriptions.retrieve(invoice.subscription);
        const newStatus = stripeSubscription.status;

        const { error: subUpdateError } = await context.supabaseClient
          .from('user_subscriptions')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', invoice.subscription);
        if (subUpdateError) {
          context.logger.warn(`[handleInvoicePaymentFailed] Failed to update user_subscription ${invoice.subscription} status to ${newStatus} for failed invoice ${invoice.id}.`, { error: subUpdateError });
        }
      } catch (stripeSubError) {
          context.logger.warn(`[handleInvoicePaymentFailed] Failed to retrieve Stripe subscription ${invoice.subscription} during failed invoice processing for ${invoice.id}.`, { error: stripeSubError });
      }
    }
    context.logger.info(`[handleInvoicePaymentFailed] Successfully processed failed invoice ${invoice.id}, payment transaction ${failedPaymentTx.id} marked FAILED.`);
    return { success: true, transactionId: failedPaymentTx.id };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error(`[handleInvoicePaymentFailed] General error processing failed invoice ${invoice.id}, Event ${eventId}.`, { message: errorMessage, errorDetails: error });
    return { success: false, transactionId: paymentTransactionIdForReturn, error: errorMessage };
  }
}
