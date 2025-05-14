import { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'npm:stripe';
import { Buffer } from "node:buffer"; // Import Buffer for Deno/Node compatibility
import { Database } from '../../types_db.ts'; // Your generated DB types
import {
  IPaymentGatewayAdapter,
  PaymentInitiationResult,
  PaymentConfirmation,
  PurchaseRequest,
} from '../types/payment.types.ts'; // Assuming types are in this package
import { ITokenWalletService } from '../../_shared/types/tokenWallet.types.ts'; // For token awarding

export class StripePaymentAdapter implements IPaymentGatewayAdapter {
  public gatewayId = 'stripe';
  private stripe: Stripe;
  private adminClient: SupabaseClient<Database>;
  private tokenWalletService: ITokenWalletService;
  private stripeWebhookSecret: string;

  constructor(
    stripeInstance: Stripe,
    adminSupabaseClient: SupabaseClient<Database>,
    tokenWalletService: ITokenWalletService,
    stripeWebhookSecret: string,
  ) {
    this.stripe = stripeInstance;
    this.adminClient = adminSupabaseClient;
    this.tokenWalletService = tokenWalletService;
    this.stripeWebhookSecret = stripeWebhookSecret;
    // console.log('[StripePaymentAdapter] Initialized');
  }

  async initiatePayment(request: PurchaseRequest): Promise<PaymentInitiationResult> {
    // console.log('[StripePaymentAdapter] initiatePayment called with:', request);
    try {
      // 1. Determine Stripe Price ID and tokens_to_award from request.itemId
      //    This likely involves querying a local 'service_plans' or 'products' table
      //    that syncs with Stripe (related to your `sync-stripe-plans` logic).
      const { data: planData, error: planError } = await this.adminClient
        .from('subscription_plans') // Assuming a table like this exists or will be created
        .select('stripe_price_id, tokens_awarded')
        .eq('item_id_internal', request.itemId) // Assuming your plan table has an internal ID
        .single();

      if (planError || !planData) {
        console.error('[StripePaymentAdapter] Error fetching plan data:', planError);
        return { success: false, error: `Item ID ${request.itemId} not found or invalid.` };
      }
      const stripePriceId = planData.stripe_price_id;
      const tokensToAward = planData.tokens_awarded;

      if (!stripePriceId || tokensToAward == null) {
         console.error('[StripePaymentAdapter] Missing Stripe Price ID or tokens_awarded for item:', request.itemId);
        return { success: false, error: 'Configuration error for the selected item.' };
      }

      // 2. Determine target_wallet_id
      const walletCtx = { userId: request.userId, organizationId: request.organizationId };
      const wallet = await this.tokenWalletService.getWalletForContext(walletCtx.userId, walletCtx.organizationId ?? undefined);

      if (!wallet) {
         console.error('[StripePaymentAdapter] Wallet not found for context:', walletCtx, '. A wallet should exist prior to initiating payment.');
         return { success: false, error: 'User/Organization wallet not found. Please ensure a wallet is provisioned before payment.' };
      }
      const targetWalletId = wallet.walletId; // Now a const

      // 3. Create 'payment_transactions' record in 'PENDING' state.
      const { data: paymentTxnData, error: paymentTxnError } = await this.adminClient
        .from('payment_transactions')
        .upsert({
          user_id: request.userId,
          organization_id: request.organizationId ?? undefined, // Consistent with getWalletForContext
          target_wallet_id: targetWalletId,
          payment_gateway_id: this.gatewayId,
          status: 'PENDING',
          tokens_to_award: tokensToAward,
          amount_requested_fiat: typeof request.metadata?.amount_fiat === 'number' ? request.metadata.amount_fiat : null,
          currency_requested_fiat: request.currency,
          metadata_json: { itemId: request.itemId, ...(request.metadata || {}) }
        })
        .select('id')
        .single();

      if (paymentTxnError || !paymentTxnData) {
        console.error('[StripePaymentAdapter] Error creating payment_transactions record:', paymentTxnError);
        return { success: false, error: 'Failed to initialize payment record.' };
      }
      const internalPaymentId = paymentTxnData.id;

      // 4. Create Stripe Checkout Session
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        line_items: [{ price: stripePriceId, quantity: request.quantity }],
        mode: 'payment',
        success_url: `${process.env.SITE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&payment_id=${internalPaymentId}`,
        cancel_url: `${process.env.SITE_URL}/payment-cancelled?payment_id=${internalPaymentId}`,
        client_reference_id: request.userId, 
        metadata: {
          internal_payment_id: internalPaymentId,
          user_id: request.userId,
          organization_id: request.organizationId || '', // Stripe metadata values are typically strings
          item_id: request.itemId,
        },
      };
      
      const stripeSession = await this.stripe.checkout.sessions.create(sessionParams);

      return {
        success: true,
        transactionId: internalPaymentId,
        paymentGatewayTransactionId: stripeSession.id,
        redirectUrl: stripeSession.url ?? undefined,
        clientSecret: stripeSession.client_secret ?? undefined,
      };

    } catch (error) {
      console.error('[StripePaymentAdapter] Exception in initiatePayment:', error);
      return { success: false, error: (error instanceof Error ? error.message : String(error)) || 'An unexpected error occurred during payment initiation.' };
    }
  }

  async handleWebhook(rawBody: string | Uint8Array, signature: string | undefined): Promise<PaymentConfirmation> {
    // console.log('[StripePaymentAdapter] handleWebhook called');
    if (!signature) {
      console.warn('[StripePaymentAdapter] Webhook signature missing.');
      return { success: false, transactionId: '', error: 'Webhook signature missing.' };
    }
    
    let event: Stripe.Event;
    try {
      // Stripe's constructEvent expects string or Buffer. Convert Uint8Array to Buffer.
      const bodyToUse = rawBody instanceof Uint8Array ? Buffer.from(rawBody) : rawBody;
      event = this.stripe.webhooks.constructEvent(bodyToUse, signature, this.stripeWebhookSecret);
    } catch (err) {
      console.error(`[StripePaymentAdapter] Webhook signature verification failed: ${(err instanceof Error ? err.message : String(err))}`);
      return { success: false, transactionId: '', error: 'Webhook signature verification failed.' };
    }

    // console.log('[StripePaymentAdapter] Webhook event received:', event.type);
    const relevantEvents = ['checkout.session.completed', 'payment_intent.succeeded'];

    if (relevantEvents.includes(event.type)) {
      const session = event.data.object as Stripe.Checkout.Session | Stripe.PaymentIntent;
      const internalPaymentId = session.metadata?.internal_payment_id;
      const gatewayTransactionId = session.id;

      if (!internalPaymentId) {
        console.error('[StripePaymentAdapter] internal_payment_id missing from webhook metadata:', session);
        return { success: false, transactionId: '', error: 'Internal payment ID missing from webhook.' };
      }

      try {
        // 1. Retrieve the payment_transactions record.
        const { data: paymentTx, error: fetchError } = await this.adminClient
          .from('payment_transactions')
          .select('*')
          .eq('id', internalPaymentId)
          .single();

        if (fetchError || !paymentTx) {
          console.error(`[StripePaymentAdapter] Payment transaction ${internalPaymentId} not found.`, fetchError);
          return { success: false, transactionId: internalPaymentId, error: 'Payment record not found.' };
        }

        // Idempotency check: If already completed, do nothing further.
        if (paymentTx.status === 'COMPLETED') {
          // console.log(`[StripePaymentAdapter] Payment ${internalPaymentId} already completed.`);
          return { success: true, transactionId: internalPaymentId, tokensAwarded: paymentTx.tokens_to_award };
        }
        if (paymentTx.status === 'FAILED') {
             console.warn(`[StripePaymentAdapter] Payment ${internalPaymentId} previously failed. Webhook for ${event.type} received.`);
             // Potentially log or investigate, but don't re-process as success.
             return { success: false, transactionId: internalPaymentId, error: 'Payment previously marked as failed.' };
        }


        // 2. Update payment_transactions record to 'COMPLETED'.
        const { error: updateError } = await this.adminClient
          .from('payment_transactions')
          .update({ status: 'COMPLETED', gateway_transaction_id: gatewayTransactionId, updated_at: new Date().toISOString() })
          .eq('id', internalPaymentId);

        if (updateError) {
          console.error(`[StripePaymentAdapter] Error updating payment transaction ${internalPaymentId} to COMPLETED:`, updateError);
          return { success: false, transactionId: internalPaymentId, error: 'Failed to update payment status.' };
        }

        // 3. Call TokenWalletService.recordTransaction to credit tokens.
        const recordedByUserId = paymentTx.user_id;
        if (!recordedByUserId) {
            console.error(`[StripePaymentAdapter] Missing user_id on payment transaction ${internalPaymentId} for token awarding.`);
            return { success: false, transactionId: internalPaymentId, error: 'Cannot award tokens, user context missing.' };
        }

        try {
          const transactionResult = await this.tokenWalletService.recordTransaction({
            walletId: paymentTx.target_wallet_id,
            type: 'CREDIT_PURCHASE',
            amount: paymentTx.tokens_to_award.toString(),
            recordedByUserId: recordedByUserId,
            relatedEntityId: internalPaymentId,
            relatedEntityType: 'payment_transaction',
            notes: `Tokens awarded from Stripe payment ${gatewayTransactionId}`,
          });

          if (!transactionResult || !transactionResult.transactionId) { // Check based on your service's success indication
            console.error(`[StripePaymentAdapter] Failed to record token transaction (returned failure) for payment ${internalPaymentId}.`);
            await this.adminClient.from('payment_transactions').update({ status: 'TOKEN_AWARD_FAILED' }).eq('id', internalPaymentId);
            return { success: false, transactionId: internalPaymentId, error: 'Token award failed after payment.' };
          }
        } catch (tokenAwardError) {
          console.error(`[StripePaymentAdapter] Exception during token awarding for payment ${internalPaymentId}:`, tokenAwardError);
          await this.adminClient.from('payment_transactions').update({ status: 'TOKEN_AWARD_FAILED' }).eq('id', internalPaymentId);
          return { success: false, transactionId: internalPaymentId, error: 'Token award failed after payment.' };
        }
        
        // If we reach here, token awarding was successful.
        // The original console.log for success was:
        // console.log(`[StripePaymentAdapter] Tokens awarded for payment ${internalPaymentId}. Transaction: ${transactionResult.transactionId}`);
        console.log(`[StripePaymentAdapter] Tokens successfully awarded for payment ${internalPaymentId}.`);
        return { success: true, transactionId: internalPaymentId, tokensAwarded: paymentTx.tokens_to_award };

      } catch (processingError) {
        console.error(`[StripePaymentAdapter] Error processing webhook for payment ${internalPaymentId}:`, processingError);
        return { success: false, transactionId: internalPaymentId || '', error: 'Error processing webhook.' };
      }
    } else if (event.type === 'payment_intent.payment_failed' || event.type === 'checkout.session.async_payment_failed') {
        const session = event.data.object as Stripe.Checkout.Session | Stripe.PaymentIntent;
        const internalPaymentId = session.metadata?.internal_payment_id;
        if (internalPaymentId) {
            await this.adminClient
                .from('payment_transactions')
                .update({ status: 'FAILED', updated_at: new Date().toISOString() })
                .eq('id', internalPaymentId);
            console.log(`[StripePaymentAdapter] Payment ${internalPaymentId} marked as FAILED.`);
        }
         return { success: false, transactionId: internalPaymentId || '', error: 'Payment failed as per Stripe.' };
    } else if (event.type === 'checkout.session.expired') {
        const session = event.data.object as Stripe.Checkout.Session; // Type assertion
        const internalPaymentId = session.metadata?.internal_payment_id;
        if (internalPaymentId) {
            await this.adminClient
                .from('payment_transactions')
                .update({ status: 'EXPIRED', updated_at: new Date().toISOString() })
                .eq('id', internalPaymentId);
            console.log(`[StripePaymentAdapter] Payment ${internalPaymentId} marked as EXPIRED.`);
            return { success: true, transactionId: internalPaymentId, error: `Payment transaction ${internalPaymentId} marked as EXPIRED.` }; // Acknowledge handling
        }
        // If no internalPaymentId, it's harder to act, but acknowledge the event
        console.warn('[StripePaymentAdapter] checkout.session.expired received without internal_payment_id in metadata:', session);
        return { success: true, transactionId: '', error: 'checkout.session.expired event handled, but no internal_payment_id found.' };
    }


    // console.log('[StripePaymentAdapter] Webhook event type not handled:', event.type);
    return { success: true, transactionId: '', error: 'Webhook event type not explicitly handled but acknowledged.' }; // Acknowledge other events to Stripe
  }
}