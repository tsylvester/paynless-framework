import Stripe from 'npm:stripe';
import { HandlerContext } from '../types.ts';
import { PaymentConfirmation } from '../../../types/payment.types.ts';

export async function handleInvoicePaymentSucceeded(
  context: HandlerContext,
  event: Stripe.InvoicePaymentSucceededEvent
): Promise<PaymentConfirmation> {
  const invoice = event.data.object;
  const eventId = event.id;
  context.logger.info(`[handleInvoicePaymentSucceeded] Processing invoice ${invoice.id}, Event ID: ${eventId}`);

  if (!invoice.customer) {
    context.logger.warn(`[handleInvoicePaymentSucceeded] Invoice ${invoice.id} (Event ${eventId}) has no customer. Skipping further processing.`);
    return { success: true, transactionId: eventId };
  }
  const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id;

  let paymentTransactionIdForReturn: string | undefined = eventId;

  try {
    const { data: existingPayment, error: checkError } = await context.supabaseClient
      .from('payment_transactions')
      .select('id, status, tokens_to_award')
      .eq('gateway_transaction_id', invoice.id)
      .eq('payment_gateway_id', 'stripe') // Assuming 'stripe' as gatewayId
      .maybeSingle();

    if (checkError) {
      context.logger.error(`[handleInvoicePaymentSucceeded] DB error checking existing payment for invoice ${invoice.id}.`, { error: checkError });
      return { success: false, transactionId: eventId, error: `DB error: ${checkError.message}` };
    }

    if (existingPayment?.status === 'COMPLETED') {
      context.logger.info(`[handleInvoicePaymentSucceeded] Invoice ${invoice.id} (Payment ${existingPayment.id}) already marked COMPLETED.`);
      return { success: true, transactionId: existingPayment.id, tokensAwarded: existingPayment.tokens_to_award ?? undefined };
    }

    const { data: userDetails, error: userDetailsError } = await context.supabaseClient
      .from('user_subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .limit(1)
      .single();

    if (userDetailsError || !userDetails?.user_id) {
      context.logger.error(`[handleInvoicePaymentSucceeded] Could not find user/user_id for Stripe customer ${stripeCustomerId}. Invoice: ${invoice.id}.`, { error: userDetailsError });
      return { success: false, transactionId: eventId, error: `User not found for customer ${stripeCustomerId}` };
    }
    const userId = userDetails.user_id;

    const { data: walletData, error: walletError } = await context.supabaseClient
      .from('token_wallets')
      .select('wallet_id')
      .eq('user_id', userId)
      .single();

    if (walletError || !walletData?.wallet_id) {
      context.logger.error(`[handleInvoicePaymentSucceeded] Token wallet not found for user ${userId}. Invoice: ${invoice.id}.`, { error: walletError });
      return { success: false, transactionId: eventId, error: `Wallet not found for user ${userId}` };
    }
    const targetWalletId = walletData.wallet_id;

    let tokensToAward = 0;
    let planItemIdInternal: string | undefined;
    if (invoice.lines && invoice.lines.data.length > 0) {
      const firstLineItem = invoice.lines.data[0];
      if (firstLineItem?.price?.id) {
        const stripePriceId = firstLineItem.price.id;
        const { data: planInfo, error: planInfoError } = await context.supabaseClient
          .from('subscription_plans')
          .select('item_id_internal, tokens_awarded')
          .eq('stripe_price_id', stripePriceId)
          .single();
        if (planInfoError || !planInfo) {
          context.logger.warn(`[handleInvoicePaymentSucceeded] Could not find plan info for Stripe Price ID ${stripePriceId} from invoice ${invoice.id}.`, { error: planInfoError });
        } else {
          tokensToAward = planInfo.tokens_awarded ?? 0;
          planItemIdInternal = planInfo.item_id_internal;
          context.logger.info(`[handleInvoicePaymentSucceeded] Plan ${planItemIdInternal} awards ${tokensToAward} tokens for invoice ${invoice.id}`);
        }
      }
    }
    if (tokensToAward <= 0) {
        context.logger.warn(`[handleInvoicePaymentSucceeded] No tokens to award or plan not found for invoice ${invoice.id}.`);
    }

    const paymentTxData = {
      user_id: userId,
      organization_id: undefined,
      target_wallet_id: targetWalletId,
      payment_gateway_id: 'stripe', // Assuming 'stripe'
      gateway_transaction_id: invoice.id,
      status: 'PROCESSING_RENEWAL',
      amount_requested_fiat: invoice.amount_paid / 100,
      currency_requested_fiat: invoice.currency,
      amount_requested_crypto: undefined,
      currency_requested_crypto: undefined,
      tokens_to_award: tokensToAward,
      metadata_json: { 
          stripe_event_id: eventId, 
          type: 'RENEWAL', 
          stripe_subscription_id: (invoice.subscription && typeof invoice.subscription === 'object' ? (invoice.subscription.id ?? undefined) : (invoice.subscription ?? undefined)),
          item_id_internal: planItemIdInternal,
       },
    };

    const { data: newPaymentTx, error: insertPaymentError } = await context.supabaseClient
      .from('payment_transactions')
      .insert(paymentTxData)
      .select('id')
      .single();
    
    if (insertPaymentError || !newPaymentTx) {
      context.logger.error(`[handleInvoicePaymentSucceeded] Failed to create payment_transactions record for invoice ${invoice.id}.`, { error: insertPaymentError });
      return { success: false, transactionId: eventId, error: `DB error creating payment record: ${insertPaymentError?.message}` };
    }
    paymentTransactionIdForReturn = newPaymentTx.id;

    if (invoice.subscription && typeof invoice.subscription === 'string') {
      try {
        const stripeSubscription = await context.stripe.subscriptions.retrieve(invoice.subscription);
        const subUpdateData = {
          status: stripeSubscription.status,
          current_period_start: stripeSubscription.current_period_start ? new Date(stripeSubscription.current_period_start * 1000).toISOString() : null,
          current_period_end: stripeSubscription.current_period_end ? new Date(stripeSubscription.current_period_end * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        };
        const { error: subUpdateError } = await context.supabaseClient
          .from('user_subscriptions')
          .update(subUpdateData)
          .eq('stripe_subscription_id', invoice.subscription);
        if (subUpdateError) {
          context.logger.warn(`[handleInvoicePaymentSucceeded] Failed to update user_subscription ${invoice.subscription} for invoice ${invoice.id}.`, { error: subUpdateError });
        }
      } catch (stripeSubError) {
          context.logger.warn(`[handleInvoicePaymentSucceeded] Failed to retrieve Stripe subscription ${invoice.subscription} during invoice processing for ${invoice.id}.`, { error: stripeSubError });
      }
    }

    if (tokensToAward > 0) {
      try {
        await context.tokenWalletService.recordTransaction({
          walletId: targetWalletId,
          type: 'CREDIT_PURCHASE',
          amount: String(tokensToAward),
          recordedByUserId: userId,
          relatedEntityId: newPaymentTx.id,
          relatedEntityType: 'payment_transactions',
          notes: `Tokens for Stripe Invoice ${invoice.id} (Renewal)`,
        });
        context.logger.info(`[handleInvoicePaymentSucceeded] Tokens awarded for invoice ${invoice.id}, payment ${newPaymentTx.id}.`);
      } catch (tokenError) {
        context.logger.error(`[handleInvoicePaymentSucceeded] Token awarding error for invoice ${invoice.id}, payment ${newPaymentTx.id}.`, { error: tokenError });
        await context.supabaseClient.from('payment_transactions').update({ status: 'TOKEN_AWARD_FAILED' }).eq('id', newPaymentTx.id);
        return { success: false, transactionId: newPaymentTx.id, error: 'Token award failed after payment renewal.', tokensAwarded: 0 };
      }
    }

    const { error: finalUpdateError } = await context.supabaseClient
      .from('payment_transactions')
      .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
      .eq('id', newPaymentTx.id);

    if (finalUpdateError) {
      context.logger.error(`[handleInvoicePaymentSucceeded] Failed to mark payment ${newPaymentTx.id} as COMPLETED for invoice ${invoice.id}.`, { error: finalUpdateError });
      return { success: false, transactionId: newPaymentTx.id, error: 'Failed to finalize payment status.' };
    }
    
    context.logger.info(`[handleInvoicePaymentSucceeded] Successfully processed invoice ${invoice.id}, payment ${newPaymentTx.id} COMPLETED.`);
    return { success: true, transactionId: newPaymentTx.id, tokensAwarded: tokensToAward };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error(`[handleInvoicePaymentSucceeded] General error processing invoice ${invoice.id}, Event ${eventId}.`, { message: errorMessage, errorDetails: error });
    if (paymentTransactionIdForReturn && paymentTransactionIdForReturn !== eventId) {
       try {
          await context.supabaseClient.from('payment_transactions').update({ status: 'FAILED' }).eq('id', paymentTransactionIdForReturn);
       } catch (failUpdateError) {
          context.logger.error(`[handleInvoicePaymentSucceeded] Failed to mark payment ${paymentTransactionIdForReturn} as FAILED after general error.`, { error: failUpdateError });
       }
    }
    return { success: false, transactionId: paymentTransactionIdForReturn, error: errorMessage };
  }
}
