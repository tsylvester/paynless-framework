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
      const bodyToUse = rawBody instanceof Uint8Array ? Buffer.from(rawBody) : rawBody;
      event = this.stripe.webhooks.constructEvent(bodyToUse, signature, this.stripeWebhookSecret);
    } catch (err) {
      console.error(`[StripePaymentAdapter] Webhook signature verification failed: ${(err instanceof Error ? err.message : String(err))}`);
      return { success: false, transactionId: undefined, error: 'Webhook signature verification failed.' };
    }

    // console.log('[StripePaymentAdapter] Webhook event received:', event.type);
    // Define relevant events
    const checkoutSessionCompleted = 'checkout.session.completed';
    // We will add other events like 'invoice.payment_succeeded', etc. later.

    if (event.type === checkoutSessionCompleted) {
      const session = event.data.object as Stripe.Checkout.Session;
      const internalPaymentId = session.metadata?.internal_payment_id;
      const gatewayTransactionId = session.id; // Stripe Checkout Session ID

      if (!internalPaymentId) {
        console.error('[StripePaymentAdapter] internal_payment_id missing from checkout.session.completed webhook metadata:', session);
        return { success: false, transactionId: undefined, error: 'Internal payment ID missing from webhook.' };
      }

      try {
        const { data: paymentTx, error: fetchError } = await this.adminClient
          .from('payment_transactions')
          .select('*')
          .eq('id', internalPaymentId)
          .single();

        if (fetchError || !paymentTx) {
          console.error(`[StripePaymentAdapter] Payment transaction ${internalPaymentId} not found for checkout.session.completed.`, fetchError);
          return { success: false, transactionId: internalPaymentId, error: 'Payment record not found.' };
        }

        if (paymentTx.status === 'COMPLETED') {
          // console.log(`[StripePaymentAdapter] Payment ${internalPaymentId} already completed.`);
          return { success: true, transactionId: internalPaymentId, tokensAwarded: paymentTx.tokens_to_award };
        }
        if (paymentTx.status === 'FAILED') {
             console.warn(`[StripePaymentAdapter] Payment ${internalPaymentId} previously failed. Webhook for ${event.type} received.`);
             return { success: false, transactionId: internalPaymentId, error: 'Payment previously marked as failed.' };
        }

        // Specific logic for checkout.session.completed
        if (session.mode === 'subscription') {
          console.log(`[StripePaymentAdapter] Processing checkout.session.completed in 'subscription' mode for ${internalPaymentId}`);
          const stripeSubscriptionId = session.subscription;
          const stripeCustomerId = session.customer;
          const userId = paymentTx.user_id; // from our payment_transactions record

          if (!stripeSubscriptionId || typeof stripeSubscriptionId !== 'string') {
            console.error('[StripePaymentAdapter] Stripe Subscription ID missing or invalid in checkout session for subscription mode.', session);
            return { success: false, transactionId: internalPaymentId, error: 'Stripe Subscription ID missing or invalid.' };
          }
          if (!stripeCustomerId || typeof stripeCustomerId !== 'string') {
            console.error('[StripePaymentAdapter] Stripe Customer ID missing or invalid in checkout session for subscription mode.', session);
            return { success: false, transactionId: internalPaymentId, error: 'Stripe Customer ID missing or invalid.' };
          }
           if (!userId) {
            console.error('[StripePaymentAdapter] User ID missing in payment_transactions for subscription mode.', paymentTx);
            // This should ideally not happen if initiatePayment enforces userId
            return { success: false, transactionId: internalPaymentId, error: 'User ID for subscription missing.' };
          }


          // Get our internal plan_id from item_id_internal stored in payment_transactions.metadata_json or session.metadata
          // Ensure a type assertion for metadata_json if its structure is known, or use optional chaining carefully.
          const itemIdFromPaymentTx = typeof paymentTx.metadata_json === 'object' && paymentTx.metadata_json !== null && 'itemId' in paymentTx.metadata_json 
                                      ? String(paymentTx.metadata_json.itemId) 
                                      : undefined;
          const itemIdFromSessionMetadata = session.metadata?.item_id;

          const itemIdInternal = itemIdFromPaymentTx || itemIdFromSessionMetadata;

          if (!itemIdInternal) {
            console.error(`[StripePaymentAdapter] item_id_internal not found in payment_transactions metadata_json (expected 'itemId') or session metadata (expected 'item_id') for ${internalPaymentId}`);
            return { success: false, transactionId: internalPaymentId, error: 'Internal item ID for subscription plan lookup missing.' };
          }
          
          const { data: planData, error: planFetchError } = await this.adminClient
            .from('subscription_plans')
            .select('id')
            .eq('item_id_internal', itemIdInternal)
            .single();

          if (planFetchError || !planData) {
            console.error(`[StripePaymentAdapter] Could not fetch subscription_plans record for item_id_internal ${itemIdInternal}.`, planFetchError);
            return { success: false, transactionId: internalPaymentId, error: 'Failed to resolve internal plan ID for subscription.' };
          }
          const internalPlanId = planData.id;

          // Retrieve the full Stripe Subscription object to get period details and status
          const stripeSubscriptionObject = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);

          const userSubscriptionData = {
            user_id: userId,
            plan_id: internalPlanId,
            status: stripeSubscriptionObject.status, // Use status from Stripe Subscription object
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            current_period_start: stripeSubscriptionObject.current_period_start ? new Date(stripeSubscriptionObject.current_period_start * 1000).toISOString() : null,
            current_period_end: stripeSubscriptionObject.current_period_end ? new Date(stripeSubscriptionObject.current_period_end * 1000).toISOString() : null,
            cancel_at_period_end: stripeSubscriptionObject.cancel_at_period_end,
            // id: auto-generated by DB
            // created_at, updated_at: auto-generated/updated by DB
          };
          
          // Upsert into user_subscriptions
          // We upsert on stripe_subscription_id to handle cases where a webhook might be re-delivered
          // or if there's any edge case of a pre-existing record.
          const { error: upsertError } = await this.adminClient
            .from('user_subscriptions')
            .upsert(userSubscriptionData, { onConflict: 'stripe_subscription_id' });

          if (upsertError) {
            console.error(`[StripePaymentAdapter] Failed to upsert user_subscription for ${internalPaymentId}, stripe_subscription_id ${stripeSubscriptionId}.`, upsertError);
            // Don't necessarily fail the whole payment if this part fails, but log it critically.
            // Could update paymentTx status to something like 'SUBSCRIPTION_LINK_FAILED'
          } else {
            console.log(`[StripePaymentAdapter] Successfully upserted user_subscription for stripe_subscription_id ${stripeSubscriptionId}`);
          }
        } else if (session.mode === 'payment') {
          console.log(`[StripePaymentAdapter] Processing checkout.session.completed in 'payment' mode for ${internalPaymentId}`);
          // No specific additional action needed for 'payment' mode beyond what's done below for all completed checkouts.
        } else {
          console.warn(`[StripePaymentAdapter] checkout.session.completed with unexpected mode: ${session.mode} for ${internalPaymentId}`);
          // Continue to mark payment as complete and award tokens if payment was successful
        }

        // Common logic for all successful checkout.session.completed events:
        // Update payment_transactions record to 'COMPLETED'.
        const { error: updateError } = await this.adminClient
          .from('payment_transactions')
          .update({ status: 'COMPLETED', gateway_transaction_id: gatewayTransactionId, updated_at: new Date().toISOString() })
          .eq('id', internalPaymentId);

        if (updateError) {
          console.error(`[StripePaymentAdapter] Failed to update payment transaction ${internalPaymentId} to COMPLETED.`, updateError);
          return { success: false, transactionId: internalPaymentId, error: 'Failed to update payment status after confirmation.' };
        }

        if (!paymentTx.target_wallet_id) {
          console.error(`[StripePaymentAdapter] target_wallet_id is missing for transaction ${internalPaymentId}. Cannot award tokens.`);
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
            return { success: true, transactionId: internalPaymentId, tokensAwarded: 0 }; 
        }

        try {
          await this.tokenWalletService.recordTransaction({
            walletId: paymentTx.target_wallet_id,
            type: 'CREDIT_PURCHASE',
            amount: paymentTx.tokens_to_award.toString(), 
            recordedByUserId: paymentTx.user_id,
            relatedEntityId: internalPaymentId,
            relatedEntityType: 'payment_transactions',
            notes: `Tokens for Stripe Checkout Session ${gatewayTransactionId} (mode: ${session.mode})`,
          });
          // console.log(`[StripePaymentAdapter] Tokens successfully awarded for payment ${internalPaymentId}.`);
        } catch (tokenError) {
          console.error(`[StripePaymentAdapter] Exception during token awarding for payment ${internalPaymentId}:`, tokenError);
          await this.adminClient
            .from('payment_transactions')
            .update({ status: 'TOKEN_AWARD_FAILED' })
            .eq('id', internalPaymentId);
          return { 
            success: false, 
            transactionId: internalPaymentId, 
            error: 'Token award failed after payment.', 
            tokensAwarded: 0 
          };
        }
        return { success: true, transactionId: internalPaymentId, tokensAwarded: paymentTx.tokens_to_award };

      } catch (error) {
        console.error(`[StripePaymentAdapter] Exception processing checkout.session.completed for ${internalPaymentId}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, transactionId: internalPaymentId, error: errorMessage };
      }
    } 
    // else if (event.type === 'payment_intent.succeeded') {
    //   // TODO: Handle payment_intent.succeeded if it's not already covered by checkout.session.completed
    //   // This might be relevant for other payment flows or if checkout.session.completed isn't guaranteed.
    //   // For now, focusing on checkout.session.completed as primary.
    // }
    
    // If event type is not handled, log and return success (as Stripe expects a 2xx response)
    // console.log(`[StripePaymentAdapter] Unhandled event type: ${event.type}`);
    return { success: true, transactionId: undefined, error: undefined }; // Default success for unhandled relevant events
  }
}