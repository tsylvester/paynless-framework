import Stripe from 'npm:stripe';
import { HandlerContext } from '../../../types.ts';
import { PaymentConfirmation } from '../../../types/payment.types.ts';

export async function handleInvoicePaymentSucceeded(
  context: HandlerContext,
  event: Stripe.InvoicePaymentSucceededEvent
): Promise<PaymentConfirmation> {
  const invoice = event.data.object;
  const stripeEventId = event.id;
  context.logger.info(`[handleInvoicePaymentSucceeded] Received event for Invoice ID: ${invoice.id}, Stripe Event ID: ${stripeEventId}`);

  // Idempotency Check: Look for an existing payment transaction for this invoice
  try {
    const { data: existingPayment, error: existingPaymentError } = await context.supabaseClient
      .from('payment_transactions')
      .select('id, status, tokens_to_award, user_id') // user_id might be useful for logging context
      .eq('gateway_transaction_id', invoice.id)
      .eq('payment_gateway_id', 'stripe')
      .maybeSingle(); // Expect 0 or 1

    if (existingPaymentError) {
      context.logger.error(
        `DB error checking for existing payment transaction for invoice ${invoice.id}. Error: ${existingPaymentError.message}`,
        { stripeEventId, invoiceId: invoice.id, error: existingPaymentError }
      );
      // Proceed with caution or decide to fail early. For now, let's log and attempt to process.
      // If we fail here, we might miss processing a legitimate new event.
    }

    if (existingPayment) {
      if (
        existingPayment.status === 'COMPLETED' ||
        existingPayment.status === 'FAILED' ||
        existingPayment.status === 'PROCESSING_RENEWAL' ||
        existingPayment.status === 'TOKEN_AWARD_FAILED'
      ) {
        context.logger.info(
          `Invoice ${invoice.id} already processed with status ${existingPayment.status}. Returning existing details.`,
          {
            paymentGatewayTransactionId: invoice.id,
            existingTransactionId: existingPayment.id,
            existingStatus: existingPayment.status,
          }
        );
        let message = `Invoice ${invoice.id} already processed and ${existingPayment.status.toLowerCase()}.`;
        if (existingPayment.status === 'PROCESSING_RENEWAL' || existingPayment.status === 'TOKEN_AWARD_FAILED') {
          message = `Invoice ${invoice.id} is already being processed or awaiting token award.`;
        }

        return {
          success: true, // Considered success as it's a known state
          transactionId: existingPayment.id,
          // Tokens are only confirmed if status is COMPLETED
          tokensAwarded: existingPayment.status === 'COMPLETED' ? existingPayment.tokens_to_award || 0 : 0,
          message: message,
        };
      }
      // If status is PENDING or some other unhandled state, it might proceed or error.
      // For now, we only explicitly handle these key idempotent states.
    }
  } catch (e: unknown) {
    context.logger.error(
      `Unexpected error during idempotency check for invoice ${invoice.id}: ${e instanceof Error ? e.message : String(e)}`,
      { stripeEventId, invoiceId: invoice.id, error: e }
    );
    // Decide if to proceed or fail. For now, log and proceed.
  }

  if (!invoice.customer) {
    context.logger.warn(`[handleInvoicePaymentSucceeded] Invoice ${invoice.id} (Event ${stripeEventId}) has no customer. Skipping further processing.`);
    return { success: true, transactionId: stripeEventId };
  }
  const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id;

  let paymentTransactionIdForReturn: string | undefined = stripeEventId;

  try {
    const { data: userDetails, error: userDetailsError } = await context.supabaseClient
      .from('user_subscriptions')
      .select('user_id, plan_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .limit(1)
      .single();

    if (userDetailsError || !userDetails?.user_id) {
      context.logger.error(`[handleInvoicePaymentSucceeded] Could not find user/user_id for Stripe customer ${stripeCustomerId}. Invoice: ${invoice.id}.`, { error: userDetailsError });
      return { success: false, transactionId: stripeEventId, error: `User not found for customer ${stripeCustomerId}` };
    }
    const userId = userDetails.user_id;

    const { data: walletData, error: walletError } = await context.supabaseClient
      .from('token_wallets')
      .select('wallet_id')
      .eq('user_id', userId)
      .single();

    if (walletError || !walletData?.wallet_id) {
      context.logger.error(`[handleInvoicePaymentSucceeded] Token wallet not found for user ${userId}. Invoice: ${invoice.id}.`, { error: walletError });
      return { success: false, transactionId: stripeEventId, error: `Wallet not found for user ${userId}` };
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
          context.logger.error(
            `[handleInvoicePaymentSucceeded] CRITICAL: Could not find plan info for Stripe Price ID ${stripePriceId} from invoice ${invoice.id}. Cannot determine tokens to award.`,
            { error: planInfoError, stripePriceId, invoiceId: invoice.id }
          );
          return { 
            success: false, 
            transactionId: stripeEventId, 
            error: `Subscription plan details not found for price ID ${stripePriceId}.` 
          };
        } else {
          tokensToAward = planInfo.tokens_awarded ?? 0;
          planItemIdInternal = planInfo.item_id_internal;
          context.logger.info(
            `[handleInvoicePaymentSucceeded] Plan ${planItemIdInternal} awards ${tokensToAward} tokens for invoice ${invoice.id}`
          );
        }
      }
    }
    if (tokensToAward <= 0 && planItemIdInternal) { // only warn if plan was found but awards 0 tokens
        context.logger.warn(
            `[handleInvoicePaymentSucceeded] Plan ${planItemIdInternal} for invoice ${invoice.id} awards 0 tokens.`
        );
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
          stripe_event_id: stripeEventId, 
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
      context.logger.error(
        `[handleInvoicePaymentSucceeded] Failed to create payment_transactions record for invoice ${invoice.id}. Error: ${insertPaymentError?.message}`, 
        { 
          error: insertPaymentError,
          invoiceId: invoice.id, 
          stripeEventId 
        }
      );
      return { success: false, transactionId: stripeEventId, error: `DB error creating payment record: ${insertPaymentError?.message}` };
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
          context.logger.error(
            `[handleInvoicePaymentSucceeded] Failed to update user_subscription ${invoice.subscription} for invoice ${invoice.id}. This is a critical error. Error: ${subUpdateError.message}`,
            { 
              invoiceId: invoice.id, 
              paymentTransactionId: newPaymentTx.id, 
              error: subUpdateError
            }
          );
          // Update payment_transactions to a failed state specific to subscription sync
          await context.supabaseClient.from('payment_transactions').update({ status: 'FAILED_SUBSCRIPTION_SYNC' }).eq('id', newPaymentTx.id);
          return { 
            success: false, 
            transactionId: newPaymentTx.id, 
            error: `Failed to update user subscription record after payment: ${subUpdateError.message}` 
          };
        }
      } catch (stripeSubError) {
          const typedError = stripeSubError instanceof Error ? stripeSubError : new Error(String(stripeSubError));
          context.logger.error(
            `[handleInvoicePaymentSucceeded] Failed to retrieve Stripe subscription ${invoice.subscription} for invoice ${invoice.id}. Payment transaction ${newPaymentTx.id} will be marked as FAILED_SUBSCRIPTION_SYNC. No tokens will be awarded for this renewal.`,
            { invoiceId: invoice.id, paymentTransactionId: newPaymentTx.id, error: typedError }
          );
          await context.supabaseClient.from('payment_transactions').update({ status: 'FAILED_SUBSCRIPTION_SYNC' }).eq('id', newPaymentTx.id);
          
          return { 
            success: false,
            transactionId: newPaymentTx.id,
            tokensAwarded: 0,
            error: `Stripe API error retrieving subscription ${invoice.subscription}: ${typedError.message}. Payment marked as FAILED_SUBSCRIPTION_SYNC.`,
          };
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

    const { data: finalPaymentTx, error: finalUpdateError } = await context.supabaseClient
      .from('payment_transactions')
      .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
      .eq('id', newPaymentTx.id)
      .select('id') // ensure we get something back to confirm update if needed, or just check error
      .single(); // Or .maybeSingle() if an update might not return rows on some DBs/drivers

    if (finalUpdateError || !finalPaymentTx) {
      context.logger.error(
        `[handleInvoicePaymentSucceeded] CRITICAL: Failed to mark payment ${newPaymentTx.id} as COMPLETED for invoice ${invoice.id} after tokens were potentially awarded. This requires manual review. Status left as is or was TOKEN_AWARD_FAILED. Error: ${finalUpdateError?.message}`,
        { 
          invoiceId: invoice.id, 
          paymentTransactionId: newPaymentTx.id, 
          error: finalUpdateError
        }
      );
      // Even if this update fails, tokens were awarded (or award failed and was handled).
      // So, from the perspective of processing the invoice's primary monetary goal (tokens for user),
      // we might consider this a success from Stripe's PoV, but a critical internal logging issue.
      return { 
        success: true, // Or false, depending on how strictly we define success of the webhook handler itself
        transactionId: newPaymentTx.id, 
        tokensAwarded: tokensToAward, // Reflects tokens awarded if that step succeeded
        message: 'Payment processed and tokens awarded, but failed to update final payment status. Needs review.',
        error: finalUpdateError ? `DB Error: ${finalUpdateError.message}` : 'Failed to confirm final payment status update.'
      }; 
    }
    
    context.logger.info(`[handleInvoicePaymentSucceeded] Successfully processed invoice ${invoice.id}, payment ${newPaymentTx.id} COMPLETED.`);
    return { success: true, transactionId: newPaymentTx.id, tokensAwarded: tokensToAward };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error(`[handleInvoicePaymentSucceeded] General error processing invoice ${invoice.id}, Event ${stripeEventId}.`, { message: errorMessage, errorDetails: error });
    if (paymentTransactionIdForReturn && paymentTransactionIdForReturn !== stripeEventId) {
       try {
          await context.supabaseClient.from('payment_transactions').update({ status: 'FAILED' }).eq('id', paymentTransactionIdForReturn);
       } catch (failUpdateError) {
          context.logger.error(`[handleInvoicePaymentSucceeded] Failed to mark payment ${paymentTransactionIdForReturn} as FAILED after general error.`, { error: failUpdateError });
       }
    }
    return { success: false, transactionId: paymentTransactionIdForReturn, error: errorMessage };
  }
}
