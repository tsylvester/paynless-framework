import { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'npm:stripe';
import { Buffer } from "node:buffer"; // Import Buffer for Deno/Node compatibility
import { Database } from '../../types_db.ts'; // Your generated DB types
import {
  IPaymentGatewayAdapter,
  PaymentInitiationResult,
  PaymentConfirmation,
  PaymentOrchestrationContext,
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

  async initiatePayment(context: PaymentOrchestrationContext): Promise<PaymentInitiationResult> {
    console.log('[StripePaymentAdapter] initiatePayment called with context:', context);
    try {
      // The following are now provided by the context:
      // - internalPaymentId (context.internalPaymentId)
      // - targetWalletId (context.targetWalletId) - Not directly used by Stripe session creation itself
      // - tokensToAward (context.tokensToAward) - Not directly used by Stripe session creation itself
      // - amountForGateway (context.amountForGateway)
      // - currencyForGateway (context.currencyForGateway)
      // - userId (context.userId)
      // - organizationId (context.organizationId)
      // - itemId (context.itemId)
      // - quantity (context.quantity)

      // 1. Determine Stripe Price ID and plan_type from context.itemId.
      const { data: planData, error: planError } = await this.adminClient
        .from('subscription_plans')
        .select('stripe_price_id, plan_type') // Fetch plan_type as well
        .eq('item_id_internal', context.itemId)
        .single();

      if (planError || !planData) {
        console.error('[StripePaymentAdapter] Error fetching plan data or not found for item:', context.itemId, planError);
        const errorMsg = planError ? planError.message : `Plan data not found for item ${context.itemId}.`;
        return { success: false, transactionId: context.internalPaymentId, error: errorMsg };
      }
      
      if (!planData.stripe_price_id) {
        console.error('[StripePaymentAdapter] stripe_price_id not found in plan data for item:', context.itemId);
        return { success: false, transactionId: context.internalPaymentId, error: `Stripe Price ID configuration missing for item ${context.itemId}.` };
      }
      const stripePriceId = planData.stripe_price_id;
      const planType = planData.plan_type;
      console.log(`[StripePaymentAdapter] Using Stripe Price ID: ${stripePriceId} and plan_type: ${planType} for item ID: ${context.itemId}`);
      
      let stripeMode: 'payment' | 'subscription'; 

      if (planType === 'one_time_purchase') {
        stripeMode = 'payment';
      } else if (planType === 'subscription') {
        stripeMode = 'subscription';
      } else {
        // If plan_type is undefined, null, or an unexpected value, return an error.
        const errorMsg = `Invalid or missing plan_type: '${planType}' received for item ID: ${context.itemId}. Cannot determine Stripe session mode.`;
        console.error(`[StripePaymentAdapter] ${errorMsg}`);
        return { success: false, transactionId: context.internalPaymentId, error: errorMsg };
      }
      console.log(`[StripePaymentAdapter] Determined Stripe mode: ${stripeMode}`);

      // Values from context:
      const internalPaymentId = context.internalPaymentId;
      const userId = context.userId;
      const organizationId = context.organizationId;
      const quantity = context.quantity;
      // amountForGateway and currencyForGateway from context are for the *total amount*.
      // Stripe line_items take unit price. If `context.amountForGateway` is total, and `stripePriceId` represents a unit price,
      // then we might not need `context.amountForGateway` directly for `line_items`.
      // Let's assume stripePriceId corresponds to the item and quantity handles the multiplication.

      // 2. Create Stripe Checkout Session (Simplified)
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        line_items: [{ price: stripePriceId, quantity: quantity }],
        mode: stripeMode, // Use dynamically determined mode
        success_url: `${Deno.env.get('SITE_URL')}/subscription/success?session_id={CHECKOUT_SESSION_ID}&payment_id=${internalPaymentId}`,
        cancel_url: `${Deno.env.get('SITE_URL')}/subscription`, // Changed to /subscription and removed payment_id query param
        client_reference_id: userId, 
        metadata: {
          internal_payment_id: internalPaymentId, // Crucial for webhook reconciliation
          user_id: userId,
          organization_id: organizationId || '',
          item_id: context.itemId, // Store original item_id for reference
        },
      };
      
      // If context.currencyForGateway is 'eur', 'gbp', etc. and Stripe needs it for the session:
      if (context.currencyForGateway && context.currencyForGateway.toLowerCase() !== 'usd') { // Assuming USD is default for price_id
         // PaymentIntent-level currency can be set if not using Prices that pre-define currency.
         // For Checkout Sessions with Prices, the Price's currency is used.
         // If you need to support multiple currencies for the *same* Stripe Price ID,
         // you'd typically use PaymentIntents directly or have multiple Price IDs.
         // For simplicity, we assume the stripePriceId has the correct currency or is USD.
         // If `payment_intent_data.currency` is needed:
         // sessionParams.payment_intent_data = { currency: context.currencyForGateway.toLowerCase() };
      }

      const stripeSession = await this.stripe.checkout.sessions.create(sessionParams);
      console.log('[StripePaymentAdapter] Stripe session created:', stripeSession.id);

      return {
        success: true,
        transactionId: internalPaymentId, // Our internal ID
        paymentGatewayTransactionId: stripeSession.id, // Stripe's session ID
        redirectUrl: stripeSession.url ?? undefined,
        clientSecret: stripeSession.payment_intent && typeof stripeSession.payment_intent === 'string' 
                        ? (await this.stripe.paymentIntents.retrieve(stripeSession.payment_intent)).client_secret ?? undefined
                        : typeof stripeSession.payment_intent === 'object' && stripeSession.payment_intent?.client_secret 
                        ? stripeSession.payment_intent.client_secret
                        : undefined, // Extract client_secret if available (for Payment Intents mode)
      };

    } catch (error) {
      console.error('[StripePaymentAdapter] Exception in initiatePayment:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { 
        success: false, 
        transactionId: context.internalPaymentId, // Include our internal ID in error response
        error: errorMessage || 'An unexpected error occurred during payment initiation with Stripe.' 
      };
    }
  }

  async handleWebhook(rawBody: string | Uint8Array, signature: string | undefined): Promise<PaymentConfirmation> {
    // console.log('[StripePaymentAdapter] handleWebhook called');
    if (!signature) {
      console.warn('[StripePaymentAdapter] Webhook signature missing.');
      return { success: false, transactionId: undefined, error: 'Webhook signature missing.' };
    }
    
    let event: Stripe.Event;
    try {
      // Stripe's constructEvent expects string or Buffer. Convert Uint8Array to Buffer.
      const bodyToUse = rawBody instanceof Uint8Array ? Buffer.from(rawBody) : rawBody;
      event = this.stripe.webhooks.constructEvent(bodyToUse, signature, this.stripeWebhookSecret);
    } catch (err) {
      console.error(`[StripePaymentAdapter] Webhook signature verification failed: ${(err instanceof Error ? err.message : String(err))}`);
      return { success: false, transactionId: undefined, error: 'Webhook signature verification failed.' };
    }

    // console.log('[StripePaymentAdapter] Webhook event received:', event.type);
    const relevantEvents = ['checkout.session.completed', 'payment_intent.succeeded'];

    if (relevantEvents.includes(event.type)) {
      const session = event.data.object as Stripe.Checkout.Session | Stripe.PaymentIntent;
      const internalPaymentId = session.metadata?.internal_payment_id;
      const gatewayTransactionId = session.id;

      if (!internalPaymentId) {
        console.error('[StripePaymentAdapter] internal_payment_id missing from webhook metadata:', session);
        return { success: false, transactionId: undefined, error: 'Internal payment ID missing from webhook.' };
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
          console.error(`[StripePaymentAdapter] Failed to update payment transaction ${internalPaymentId} to COMPLETED.`, updateError);
          return { success: false, transactionId: internalPaymentId, error: 'Failed to update payment status after confirmation.' };
        }

        // Validate required fields for token awarding
        if (!paymentTx.target_wallet_id) {
          console.error(`[StripePaymentAdapter] target_wallet_id is missing for transaction ${internalPaymentId}. Cannot award tokens.`);
          // Optionally, update status to TOKEN_AWARD_FAILED
          await this.adminClient.from('payment_transactions').update({ status: 'TOKEN_AWARD_FAILED' }).eq('id', internalPaymentId);
          return { success: false, transactionId: internalPaymentId, error: 'Token award failed: target wallet ID missing.', tokensAwarded: 0 };
        }
        if (!paymentTx.user_id) {
          console.error(`[StripePaymentAdapter] user_id is missing for transaction ${internalPaymentId}. Cannot award tokens.`);
          await this.adminClient.from('payment_transactions').update({ status: 'TOKEN_AWARD_FAILED' }).eq('id', internalPaymentId);
          return { success: false, transactionId: internalPaymentId, error: 'Token award failed: user ID missing.', tokensAwarded: 0 };
        }
        if (paymentTx.tokens_to_award == null || paymentTx.tokens_to_award <= 0) {
            console.warn(`[StripePaymentAdapter] No tokens to award or invalid amount for ${internalPaymentId}: ${paymentTx.tokens_to_award}. Skipping token award.`);
            // Still return success for the payment itself if it was completed.
            return { success: true, transactionId: internalPaymentId, tokensAwarded: 0 }; 
        }

        // 3. Award tokens via TokenWalletService.
        try {
          await this.tokenWalletService.recordTransaction({
            walletId: paymentTx.target_wallet_id, // Now checked for null
            type: 'CREDIT_PURCHASE',
            amount: paymentTx.tokens_to_award.toString(), 
            recordedByUserId: paymentTx.user_id, // Now checked for null
            relatedEntityId: internalPaymentId,
            relatedEntityType: 'payment_transactions',
            notes: `Tokens for Stripe payment ${gatewayTransactionId}`,
          });
          // console.log(`[StripePaymentAdapter] Tokens successfully awarded for payment ${internalPaymentId}.`);
        } catch (tokenError) {
          console.error(`[StripePaymentAdapter] Exception during token awarding for payment ${internalPaymentId}:`, tokenError);
          // If token awarding fails, update payment_transactions status to TOKEN_AWARD_FAILED
          await this.adminClient
            .from('payment_transactions')
            .update({ status: 'TOKEN_AWARD_FAILED' })
            .eq('id', internalPaymentId);
          return { 
            success: false, 
            transactionId: internalPaymentId, 
            error: 'Token award failed after payment.', 
            tokensAwarded: 0 // Explicitly set tokensAwarded to 0 on failure
          };
        }
        
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