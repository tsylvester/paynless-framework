import Stripe from 'npm:stripe';
import { HandlerContext } from '../../../stripe.mock.ts';
import { PaymentConfirmation } from '../../../types/payment.types.ts';

export async function handleInvoicePaymentSucceeded(
  context: HandlerContext,
  event: Stripe.InvoicePaymentSucceededEvent
): Promise<PaymentConfirmation> {
  const invoice = event.data.object;
  const stripeEventId = event.id;
  context.logger.info(`[handleInvoicePaymentSucceeded] Received event for Invoice ID: ${invoice.id}, Stripe Event ID: ${stripeEventId}`);

  // Idempotency Check
  try {
    const { data: existingPayment, error: existingPaymentError } = await context.supabaseClient
      .from('payment_transactions')
      .select('id, status, tokens_to_award, user_id')
      .eq('gateway_transaction_id', invoice.id)
      .eq('payment_gateway_id', 'stripe')
      .maybeSingle();

    if (existingPaymentError) {
      context.logger.error(
        `DB error checking for existing payment transaction for invoice ${invoice.id}. Error: ${existingPaymentError.message}`,
        { stripeEventId, invoiceId: invoice.id, error: existingPaymentError }
      );
      return { 
        success: false, 
        transactionId: stripeEventId, 
        error: `DB error during idempotency check: ${existingPaymentError.message}`,
        status: 500 
      };
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
          { paymentGatewayTransactionId: invoice.id, existingTransactionId: existingPayment.id, existingStatus: existingPayment.status }
        );
        let message = `Invoice ${invoice.id} already processed and ${existingPayment.status.toLowerCase()}.`;
        if (existingPayment.status === 'PROCESSING_RENEWAL' || existingPayment.status === 'TOKEN_AWARD_FAILED') {
          message = `Invoice ${invoice.id} is already being processed or awaiting token award.`;
        }
        return {
          success: true,
          transactionId: existingPayment.id,
          tokensAwarded: existingPayment.tokens_to_award || 0,
          message: message,
        };
      }
    }
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    context.logger.error(
      `Unexpected error during idempotency check for invoice ${invoice.id}: ${errorMessage}`,
      { stripeEventId, invoiceId: invoice.id, error: e }
    );
    return { 
        success: false, 
        transactionId: stripeEventId, 
        error: `Unexpected error during idempotency check: ${errorMessage}`,
        status: 500 
      };
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
      return { 
        success: false, 
        transactionId: stripeEventId, 
        error: `User not found for customer ${stripeCustomerId}`,
        status: 500,
        tokensAwarded: 0,
      };
    }
    const userId = userDetails.user_id;

    const { data: walletData, error: walletError } = await context.supabaseClient
      .from('token_wallets')
      .select('wallet_id')
      .eq('user_id', userId)
      .single();

    if (walletError || !walletData?.wallet_id) {
      context.logger.error(`[handleInvoicePaymentSucceeded] Token wallet not found for user ${userId}. Invoice: ${invoice.id}.`, { error: walletError });
      return { 
        success: false, 
        transactionId: stripeEventId, 
        error: `Wallet not found for user ${userId}`,
        status: 404
      };
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
          try {
            await context.supabaseClient.from('payment_transactions').insert({
              user_id: userId,
              target_wallet_id: targetWalletId,
              payment_gateway_id: 'stripe',
              gateway_transaction_id: invoice.id,
              status: 'FAILED',
              amount_requested_fiat: invoice.amount_paid / 100,
              currency_requested_fiat: invoice.currency,
              tokens_to_award: 0,
              metadata_json: { 
                stripe_event_id: stripeEventId, 
                type: 'RENEWAL_PLAN_NOT_FOUND',
                reason: `Subscription plan details not found for price ID ${stripePriceId}.`,
                stripe_subscription_id: (invoice.subscription && typeof invoice.subscription === 'object' ? (invoice.subscription.id ?? undefined) : (invoice.subscription ?? undefined)),
              },
            });
          } catch (ptInsertError: unknown) {
            const ptInsertMessage = ptInsertError instanceof Error ? ptInsertError.message : String(ptInsertError);
            context.logger.error(
              `[handleInvoicePaymentSucceeded] Failed to insert FAILED payment_transaction after plan lookup failure for invoice ${invoice.id}. Error: ${ptInsertMessage}`,
              { invoiceId: invoice.id, stripeEventId, originalError: planInfoError, ptInsertError }
            );
          }
          return { 
            success: false, 
            transactionId: stripeEventId, 
            error: `Subscription plan details not found for price ID ${stripePriceId}.`,
            status: 404
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
    if (tokensToAward <= 0 && planItemIdInternal) {
        context.logger.warn(
            `[handleInvoicePaymentSucceeded] Plan ${planItemIdInternal} for invoice ${invoice.id} awards 0 tokens.`
        );
    }

    const paymentTxData = {
      user_id: userId,
      organization_id: undefined,
      target_wallet_id: targetWalletId,
      payment_gateway_id: 'stripe',
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
        { error: insertPaymentError, invoiceId: invoice.id, stripeEventId }
      );
      return { 
        success: false, 
        transactionId: stripeEventId, 
        error: `DB error creating payment record: ${insertPaymentError?.message}`,
        status: 500,
        tokensAwarded: 0
      };
    }
    paymentTransactionIdForReturn = newPaymentTx.id;

    let userSubscriptionUpdateFailed = false;
    let stripeSubscriptionRetrievalFailed = false;
    let capturedSubUpdateError: Error | null = null;

    if (invoice.subscription && typeof invoice.subscription === 'string') {
      try {
        const stripeSubscription = await context.stripe.subscriptions.retrieve(invoice.subscription);
        const subUpdateData = {
          status: stripeSubscription.status,
          current_period_start: stripeSubscription.current_period_start ? new Date(stripeSubscription.current_period_start * 1000).toISOString() : null,
          current_period_end: stripeSubscription.current_period_end ? new Date(stripeSubscription.current_period_end * 1000).toISOString() : null,
        };
        const { error: subUpdateDbError } = await context.supabaseClient
          .from('user_subscriptions')
          .update(subUpdateData)
          .eq('stripe_subscription_id', invoice.subscription);

        if (subUpdateDbError) {
          userSubscriptionUpdateFailed = true;
          capturedSubUpdateError = subUpdateDbError;
          context.logger.error(
            `[handleInvoicePaymentSucceeded] CRITICAL: Failed to update user_subscription ${invoice.subscription} for invoice ${invoice.id}. PT ID: ${newPaymentTx.id}. Error: ${subUpdateDbError.message}`,
            { invoiceId: invoice.id, paymentTransactionId: newPaymentTx.id, stripeSubscriptionId: invoice.subscription, error: subUpdateDbError }
          );
        }
      } catch (stripeSubRetrieveError: unknown) {
        userSubscriptionUpdateFailed = true;
        stripeSubscriptionRetrievalFailed = true;
        const retrieveErrorMessage = stripeSubRetrieveError instanceof Error ? stripeSubRetrieveError.message : String(stripeSubRetrieveError);
        context.logger.error(
          `[handleInvoicePaymentSucceeded] CRITICAL: Failed to retrieve Stripe subscription ${invoice.subscription} for invoice ${invoice.id} to update user_subscription. PT ID: ${newPaymentTx.id}. Error: ${retrieveErrorMessage}`,
          { error: stripeSubRetrieveError, errorMessage: retrieveErrorMessage, stripeSubscriptionId: invoice.subscription, invoiceId: invoice.id, paymentTransactionId: newPaymentTx.id }
        );
      }
    }

    // If Stripe subscription retrieval itself failed, force tokensToAward to 0.
    // This will prevent the token award attempt and ensure correct error reporting.
    if (stripeSubscriptionRetrievalFailed) {
        context.logger.warn(`[handleInvoicePaymentSucceeded] Stripe subscription retrieval failed for PT ${newPaymentTx.id}. Forcing tokensToAward to 0.`);
        tokensToAward = 0;
    }

    if (tokensToAward > 0) {
      try {
        context.logger.info(
          `[handleInvoicePaymentSucceeded] Attempting to award ${tokensToAward} tokens to wallet ${targetWalletId} for PT ${newPaymentTx.id}`
        );
        const tokenServiceResponse = await context.tokenWalletService.recordTransaction({
          walletId: targetWalletId,
          type: 'CREDIT_PURCHASE',
          amount: String(tokensToAward),
          notes: JSON.stringify({
            reason: 'Subscription Renewal',
            invoice_id: invoice.id,
            payment_transaction_id: newPaymentTx.id,
            stripe_event_id: stripeEventId,
            item_id_internal: planItemIdInternal,
          }),
          relatedEntityType: 'payment_transactions',
          relatedEntityId: newPaymentTx.id,
          recordedByUserId: userId,
        });
        context.logger.info(
            `[handleInvoicePaymentSucceeded] Token award successful for invoice ${invoice.id}. PT ID: ${newPaymentTx.id}, Tokens: ${tokensToAward}. Tx Service ID: ${tokenServiceResponse.transactionId}`
        );
        const { error: updateStatusError } = await context.supabaseClient
          .from('payment_transactions')
          .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
          .eq('id', newPaymentTx.id);

        if (updateStatusError) {
          context.logger.error(
            `[handleInvoicePaymentSucceeded] Failed to update payment_transactions status to COMPLETED for PT ID ${newPaymentTx.id} after successful token award. Invoice ${invoice.id}. Error: ${updateStatusError.message}`,
            { invoiceId: invoice.id, paymentTransactionId: newPaymentTx.id, error: updateStatusError }
          );
          if (userSubscriptionUpdateFailed) {
              context.logger.warn(
                 `[handleInvoicePaymentSucceeded] User subscription update failed earlier for invoice ${invoice.id}. Tokens awarded, PT COMPLETED (update failed but ignored for response). Returning 500. PT ID: ${newPaymentTx.id}.`,
                  { invoiceId: invoice.id, paymentTransactionId: newPaymentTx.id }
              );
              return {
                  success: false, 
                  status: 500,
                  transactionId: newPaymentTx.id,
                  tokensAwarded: stripeSubscriptionRetrievalFailed ? 0 : tokensToAward,
                  error: `User subscription update failed for invoice ${invoice.id}. Payment transaction ${newPaymentTx.id} status reflects token award outcome, but subscription data may be stale or Stripe API failed. Final PT status update also failed.`,
              };
          }
          return {
            success: true,
            transactionId: newPaymentTx.id,
            tokensAwarded: stripeSubscriptionRetrievalFailed ? 0 : tokensToAward,
            message: 'Payment processed and tokens awarded, but failed to update final payment status. Needs review.',
            status: 200,
          };
        }
        if (userSubscriptionUpdateFailed) {
          const baseMessage = 'Failed to update user subscription record after payment.';
          let detailMessage = '';
          if (stripeSubscriptionRetrievalFailed) {
            detailMessage = 'Stripe subscription could not be retrieved to update local record.';
          } else if (capturedSubUpdateError) {
            detailMessage = `Database error updating subscription: ${capturedSubUpdateError.message}`;
          } else {
            detailMessage = 'The payment transaction reflects token award status, but subscription data is inconsistent.';
          }
          
          const finalErrorMessage = `${baseMessage} ${detailMessage}`;
          
          context.logger.warn(
            `[handleInvoicePaymentSucceeded] User subscription update failed earlier for invoice ${invoice.id}. Tokens awarded, PT COMPLETED. Returning 500 due to subscription inconsistency or Stripe API failure. PT ID: ${paymentTransactionIdForReturn}.`,
            { invoiceId: invoice.id, paymentTransactionId: paymentTransactionIdForReturn }
          );
          return {
            success: false,
            transactionId: paymentTransactionIdForReturn,
            error: finalErrorMessage,
            status: 500,
            tokensAwarded: tokensToAward, 
          };
        }
        return {
          success: true,
          transactionId: newPaymentTx.id,
          tokensAwarded: tokensToAward,
          message: `Invoice ${invoice.id} processed, ${tokensToAward} tokens awarded.`,
        };

      } catch (tokenError: unknown) {
        const tokenErrorMessage = tokenError instanceof Error ? tokenError.message : String(tokenError);
        context.logger.error(
            `[handleInvoicePaymentSucceeded] TokenWalletService.recordTransaction FAILED for invoice ${invoice.id}. PT ID: ${newPaymentTx.id}. Error: ${tokenErrorMessage}`,
            { invoiceId: invoice.id, paymentTransactionId: newPaymentTx.id, error: tokenError }
        );
        await context.supabaseClient
          .from('payment_transactions')
          .update({ status: 'TOKEN_AWARD_FAILED', updated_at: new Date().toISOString() })
          .eq('id', newPaymentTx.id);
        
        if (userSubscriptionUpdateFailed) {
            context.logger.warn(
                `[handleInvoicePaymentSucceeded] User subscription update ALSO failed for invoice ${invoice.id}. Primary error: Token award failed. PT ID: ${newPaymentTx.id}.`,
                { invoiceId: invoice.id, paymentTransactionId: newPaymentTx.id }
            );
        }
        return {
          success: false,
          status: 500,
          transactionId: newPaymentTx.id,
          tokensAwarded: 0,
          error: `Token award failed for invoice ${invoice.id}: ${tokenErrorMessage}`,
        };
      }
    } else {
      context.logger.info(
        `[handleInvoicePaymentSucceeded] No tokens to award for invoice ${invoice.id} (plan awards 0 or line item missing). PT ID: ${newPaymentTx.id}. Updating PT to COMPLETED.`
      );
      const { error: updateStatusError } = await context.supabaseClient
        .from('payment_transactions')
        .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
        .eq('id', newPaymentTx.id);

      if (updateStatusError) {
        context.logger.error(
          `[handleInvoicePaymentSucceeded] Failed to update payment_transactions status to COMPLETED for PT ID ${newPaymentTx.id} (no tokens to award scenario). Invoice ${invoice.id}. Error: ${updateStatusError.message}`,
          { invoiceId: invoice.id, paymentTransactionId: newPaymentTx.id, error: updateStatusError }
        );
        if (userSubscriptionUpdateFailed) {
             context.logger.warn(
                `[handleInvoicePaymentSucceeded] User subscription update failed earlier for invoice ${invoice.id}. No tokens to award, PT COMPLETED (update failed). Returning 500. PT ID: ${newPaymentTx.id}.`,
                { invoiceId: invoice.id, paymentTransactionId: newPaymentTx.id }
            );
            return {
                success: false, 
                status: 500,
                transactionId: newPaymentTx.id,
                tokensAwarded: 0,
                error: `User subscription update failed for invoice ${invoice.id}. Payment transaction ${newPaymentTx.id} status reflects no tokens awarded, but subscription data may be stale or Stripe API failed. Final PT status update also failed.`,
            };
        }
        return {
            success: true,
            transactionId: newPaymentTx.id,
            tokensAwarded: 0,
            message: `Invoice ${invoice.id} processed. No tokens to award.`,
            status: 200, 
        };
      }

      if (userSubscriptionUpdateFailed) {
        const baseMessage = 'Failed to update user subscription record after payment.';
        let detailMessage = '';
        if (stripeSubscriptionRetrievalFailed) {
          detailMessage = 'Stripe subscription could not be retrieved to update local record.';
        } else if (capturedSubUpdateError) {
          detailMessage = `Database error updating subscription: ${capturedSubUpdateError.message}`;
        } else {
          detailMessage = 'The payment transaction reflects token award status, but subscription data is inconsistent.';
        }
        
        const finalErrorMessage = `${baseMessage} ${detailMessage}`;
        
        context.logger.warn(
          `[handleInvoicePaymentSucceeded] User subscription update failed earlier for invoice ${invoice.id}. Tokens awarded, PT COMPLETED. Returning 500 due to subscription inconsistency or Stripe API failure. PT ID: ${paymentTransactionIdForReturn}.`,
          { invoiceId: invoice.id, paymentTransactionId: paymentTransactionIdForReturn }
        );
        return {
          success: false,
          transactionId: paymentTransactionIdForReturn,
          error: finalErrorMessage,
          status: 500,
          tokensAwarded: tokensToAward, 
        };
      }
      return {
        success: true,
        transactionId: newPaymentTx.id,
        tokensAwarded: 0,
        message: `Invoice ${invoice.id} processed. No tokens to award.`,
      };
    }
  } catch (e: unknown) {
    const unhandledErrorMessage = e instanceof Error ? e.message : String(e);
    context.logger.error(
      `[handleInvoicePaymentSucceeded] Unhandled exception during processing of invoice ${invoice.id} (Event ${stripeEventId}): ${unhandledErrorMessage}`,
      { error: e, invoiceId: invoice.id, stripeEventId, paymentTransactionId: paymentTransactionIdForReturn }
    );
    return { 
      success: false, 
      transactionId: paymentTransactionIdForReturn, 
      error: `Unhandled error processing invoice ${invoice.id}: ${unhandledErrorMessage}`,
      status: 500 
    };
  }
}
