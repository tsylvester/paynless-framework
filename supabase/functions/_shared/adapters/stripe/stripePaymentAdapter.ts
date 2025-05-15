import { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'npm:stripe';
import {
	Price,
	Product,
} from '../stripe.types.ts';
import { Buffer } from "node:buffer"; // Import Buffer for Deno/Node compatibility
import { 
  Database, 
  Json,
  TablesUpdate
 } from '../../../types_db.ts'; // Your generated DB types
import {
  IPaymentGatewayAdapter,
  PaymentInitiationResult,
  PaymentConfirmation,
  PaymentOrchestrationContext,
} from '../../types/payment.types.ts'; // Assuming types are in this package
import { ITokenWalletService } from '../../types/tokenWallet.types.ts'; // For token awarding
import { Logger } from '../logger.ts';
type SyncPlansFunctionResult = {
	data: unknown | null; // Replace 'unknown' with a more specific type if available
	error: { message: string; name: string } | null;
};

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

    console.log(`[StripePaymentAdapter] Webhook event received: ${event.type}, ID: ${event.id}`);

    // Route event to specific handler
    switch (event.type) {
      case 'checkout.session.completed':
        return this._handleCheckoutSessionCompleted(
          event as Stripe.CheckoutSessionCompletedEvent
        );
      case 'invoice.payment_succeeded':
        return this._handleInvoicePaymentSucceeded(
          event as Stripe.InvoicePaymentSucceededEvent
        );
      case 'invoice.payment_failed':
        return this._handleInvoicePaymentFailed(
          event as Stripe.InvoicePaymentFailedEvent
        );
      case 'customer.subscription.updated':
        return this._handleCustomerSubscriptionUpdated(
          event as Stripe.CustomerSubscriptionUpdatedEvent
        );
      case 'customer.subscription.deleted':
        return this._handleCustomerSubscriptionDeleted(
          event as Stripe.CustomerSubscriptionDeletedEvent
        );
				// Product and Price Events
				case 'product.created':
					return this._handleProductCreated(
						event,
						event.data.object as Product,
					);
					break;
				case 'product.updated':
					return this._handleProductUpdated(
						event,
						event.data.object as Product,
					);
					break;
				case 'price.created':
					return this._handlePriceCreated(
						event,
						event.data.object as Price,
					);
					break;
				case 'price.updated':
					return this._handlePriceUpdated(
						event,
						event.data.object as Price,
					);
					break;
				case 'price.deleted':
					return this._handlePriceDeleted(
						event,
						event.data.object as Price,
					);
					break;
				// Add other event types as needed

      // TODO: Add cases for other product/price events

      default:
        console.log(`[StripePaymentAdapter] Unhandled event type: ${event.type}. Acknowledging with success.`);
        // Acknowledge unhandled events with success to prevent Stripe from retrying indefinitely for non-critical events.
        return { success: true, transactionId: event.id }; // Use event.id as a reference
    }
  }

  // Private handler for checkout.session.completed
  private async _handleCheckoutSessionCompleted(event: Stripe.CheckoutSessionCompletedEvent): Promise<PaymentConfirmation> {
    const session = event.data.object;
    const internalPaymentId = session.metadata?.internal_payment_id;
    const gatewayTransactionId = session.id; // Stripe Checkout Session ID

    console.log(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] Processing for session ${gatewayTransactionId}, internalPaymentId: ${internalPaymentId}`);

    if (!internalPaymentId) {
      console.error('[StripePaymentAdapter/_handleCheckoutSessionCompleted] internal_payment_id missing from metadata:', session);
      return { success: false, transactionId: undefined, error: 'Internal payment ID missing from webhook.' };
    }

    try {
      const { data: paymentTx, error: fetchError } = await this.adminClient
        .from('payment_transactions')
        .select('*')
        .eq('id', internalPaymentId)
        .single();

      if (fetchError || !paymentTx) {
        console.error(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] Payment transaction ${internalPaymentId} not found.`, fetchError);
        return { success: false, transactionId: internalPaymentId, error: 'Payment record not found.' };
      }

      if (paymentTx.status === 'COMPLETED') {
        console.log(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] Payment ${internalPaymentId} already completed.`);
        return { success: true, transactionId: internalPaymentId, tokensAwarded: paymentTx.tokens_to_award ?? undefined };
      }
      if (paymentTx.status === 'FAILED') {
           console.warn(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] Payment ${internalPaymentId} previously failed. Webhook for ${event.type} received.`);
           return { success: false, transactionId: internalPaymentId, error: 'Payment previously marked as failed.' };
      }

      // Logic for subscription mode
      if (session.mode === 'subscription') {
        console.log(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] Processing 'subscription' mode for ${internalPaymentId}`);
        const stripeSubscriptionId = session.subscription;
        const stripeCustomerId = session.customer;
        const userId = paymentTx.user_id;

        if (!stripeSubscriptionId || typeof stripeSubscriptionId !== 'string') {
          console.error('[StripePaymentAdapter/_handleCheckoutSessionCompleted] Stripe Subscription ID missing/invalid in session.', session);
          return { success: false, transactionId: internalPaymentId, error: 'Stripe Subscription ID missing or invalid.' };
        }
        if (!stripeCustomerId || typeof stripeCustomerId !== 'string') {
          console.error('[StripePaymentAdapter/_handleCheckoutSessionCompleted] Stripe Customer ID missing/invalid in session.', session);
          return { success: false, transactionId: internalPaymentId, error: 'Stripe Customer ID missing or invalid.' };
        }
         if (!userId) {
          console.error('[StripePaymentAdapter/_handleCheckoutSessionCompleted] User ID missing in payment_transactions.', paymentTx);
          return { success: false, transactionId: internalPaymentId, error: 'User ID for subscription missing in payment transaction.' };
        }

        const itemIdFromPaymentTx = typeof paymentTx.metadata_json === 'object' && paymentTx.metadata_json !== null && 'itemId' in paymentTx.metadata_json 
                                    ? String(paymentTx.metadata_json.itemId) 
                                    : undefined;
        const itemIdFromSessionMetadata = session.metadata?.item_id;
        const itemIdInternal = itemIdFromPaymentTx || itemIdFromSessionMetadata;

        if (!itemIdInternal) {
          console.error(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] item_id_internal not found for ${internalPaymentId}`);
          return { success: false, transactionId: internalPaymentId, error: 'Internal item ID for subscription plan lookup missing.' };
        }
        
        const { data: planData, error: planFetchError } = await this.adminClient
          .from('subscription_plans')
          .select('id')
          .eq('item_id_internal', itemIdInternal)
          .single();

        if (planFetchError || !planData) {
          console.error(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] Could not fetch subscription_plans for item_id_internal ${itemIdInternal}.`, planFetchError);
          return { success: false, transactionId: internalPaymentId, error: 'Failed to resolve internal plan ID for subscription.' };
        }
        const internalPlanId = planData.id;

        const stripeSubscriptionObject = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
        if (!stripeSubscriptionObject) { // Added check for null/undefined stripeSubscriptionObject
             console.error(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] Failed to retrieve Stripe Subscription object for ID: ${stripeSubscriptionId}`);
             return { success: false, transactionId: internalPaymentId, error: 'Failed to retrieve Stripe Subscription object.' };
        }
        
        const userSubscriptionData = {
          user_id: userId,
          plan_id: internalPlanId,
          status: stripeSubscriptionObject.status,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          current_period_start: stripeSubscriptionObject.current_period_start ? new Date(stripeSubscriptionObject.current_period_start * 1000).toISOString() : null,
          current_period_end: stripeSubscriptionObject.current_period_end ? new Date(stripeSubscriptionObject.current_period_end * 1000).toISOString() : null,
          cancel_at_period_end: stripeSubscriptionObject.cancel_at_period_end,
        };
        
        const { error: upsertError } = await this.adminClient
          .from('user_subscriptions')
          .upsert(userSubscriptionData, { onConflict: 'stripe_subscription_id' });

        if (upsertError) {
          console.error(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] Failed to upsert user_subscription for ${stripeSubscriptionId}.`, upsertError);
          // Optionally update paymentTx status to 'SUBSCRIPTION_LINK_FAILED'
        } else {
          console.log(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] Upserted user_subscription for ${stripeSubscriptionId}`);
        }
      } else if (session.mode === 'payment') {
        console.log(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] Processing 'payment' mode for ${internalPaymentId}`);
      } else {
        console.warn(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] Unexpected session mode: ${session.mode} for ${internalPaymentId}`);
      }

      // Common logic for all successful checkout.session.completed events:
      const { error: updateError } = await this.adminClient
        .from('payment_transactions')
        .update({ status: 'COMPLETED', gateway_transaction_id: gatewayTransactionId, updated_at: new Date().toISOString() })
        .eq('id', internalPaymentId);

      if (updateError) {
        console.error(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] Failed to update payment_transactions ${internalPaymentId} to COMPLETED.`, updateError);
        return { success: false, transactionId: internalPaymentId, error: 'Failed to update payment status after confirmation.' };
      }

      if (!paymentTx.target_wallet_id) {
        console.error(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] target_wallet_id missing for ${internalPaymentId}. Cannot award tokens.`);
        // Consider not failing the entire webhook if token award details are missing but payment is good.
        // For now, marking as TOKEN_AWARD_FAILED and returning error.
        await this.adminClient.from('payment_transactions').update({ status: 'TOKEN_AWARD_FAILED' }).eq('id', internalPaymentId);
        return { success: false, transactionId: internalPaymentId, error: 'Token award failed: target wallet ID missing.', tokensAwarded: 0 };
      }
      if (!paymentTx.user_id) { // Should be caught earlier for subscription, but good general check
        console.error(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] user_id missing for transaction ${internalPaymentId}. Cannot determine token recipient.`);
        await this.adminClient.from('payment_transactions').update({ status: 'TOKEN_AWARD_FAILED' }).eq('id', internalPaymentId);
        return { success: false, transactionId: internalPaymentId, error: 'Token award failed: user ID missing.', tokensAwarded: 0 };
      }
      if (paymentTx.tokens_to_award == null || paymentTx.tokens_to_award <= 0) {
          console.warn(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] No tokens to award or invalid amount for ${internalPaymentId}: ${paymentTx.tokens_to_award}. Skipping token award.`);
          return { success: true, transactionId: internalPaymentId, tokensAwarded: 0 }; 
      }

      try {
        await this.tokenWalletService.recordTransaction({
          walletId: paymentTx.target_wallet_id,
          type: 'CREDIT_PURCHASE',
          amount: String(paymentTx.tokens_to_award), // Ensure amount is string
          recordedByUserId: paymentTx.user_id, 
          relatedEntityId: internalPaymentId,
          relatedEntityType: 'payment_transactions',
          notes: `Tokens for Stripe Checkout Session ${gatewayTransactionId} (mode: ${session.mode})`,
        });
        console.log(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] Tokens awarded for ${internalPaymentId}.`);
      } catch (tokenError) {
        console.error(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] Token awarding exception for ${internalPaymentId}:`, tokenError);
        await this.adminClient.from('payment_transactions').update({ status: 'TOKEN_AWARD_FAILED' }).eq('id', internalPaymentId);
        return { success: false, transactionId: internalPaymentId, error: 'Token award failed after payment.', tokensAwarded: 0 };
      }
      return { success: true, transactionId: internalPaymentId, tokensAwarded: paymentTx.tokens_to_award };

    } catch (error) {
      console.error(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] General exception for ${internalPaymentId}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Attempt to mark payment_transaction as FAILED if a general error occurs
      if (internalPaymentId) {
        try {
          await this.adminClient.from('payment_transactions').update({ status: 'FAILED' }).eq('id', internalPaymentId);
        } catch (updateErr) {
          console.error(`[StripePaymentAdapter/_handleCheckoutSessionCompleted] Failed to mark payment_transaction ${internalPaymentId} as FAILED after general error:`, updateErr);
        }
      }
      return { success: false, transactionId: internalPaymentId, error: errorMessage };
    }
  }

  private async _handleInvoicePaymentSucceeded(event: Stripe.InvoicePaymentSucceededEvent): Promise<PaymentConfirmation> {
    const invoice = event.data.object;
    const eventId = event.id;
    const functionName = 'StripePaymentAdapter/_handleInvoicePaymentSucceeded';
    console.log(`[${functionName}] Processing invoice ${invoice.id}, Event ID: ${eventId}`);

    if (!invoice.customer) {
      console.warn(`[${functionName}] Invoice ${invoice.id} (Event ${eventId}) has no customer. Skipping further processing.`);
      return { success: true, transactionId: eventId }; // Acknowledge, but can't link to user/payment_transaction fully
    }
    const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id;

    let paymentTransactionIdForReturn: string | undefined = eventId; // Default to eventId if no payment_transaction is made

    try {
      // 1. Idempotency: Check if this invoice.id already processed as a COMPLETED payment_transaction
      const { data: existingPayment, error: checkError } = await this.adminClient
        .from('payment_transactions')
        .select('id, status, tokens_to_award')
        .eq('gateway_transaction_id', invoice.id)
        .eq('payment_gateway_id', this.gatewayId)
        .maybeSingle();

      if (checkError) {
        console.error(`[${functionName}] DB error checking existing payment for invoice ${invoice.id}:`, checkError);
        return { success: false, transactionId: eventId, error: `DB error: ${checkError.message}` };
      }

      if (existingPayment?.status === 'COMPLETED') {
        console.log(`[${functionName}] Invoice ${invoice.id} (Payment ${existingPayment.id}) already marked COMPLETED.`);
        return { success: true, transactionId: existingPayment.id, tokensAwarded: existingPayment.tokens_to_award ?? undefined };
      }
      // If existingPayment is FAILED, we might allow reprocessing if Stripe sends a success later, or log a specific case.
      // For now, we proceed to create/update.

      // 2. Get User and Wallet details
      const { data: userDetails, error: userDetailsError } = await this.adminClient
        .from('user_subscriptions') // Assuming user_id is best found via active subscription linked to customer
        .select('user_id')
        .eq('stripe_customer_id', stripeCustomerId)
        // .eq('status', 'active') // Optionally ensure subscription is active
        .limit(1)
        .single(); // Assuming one user per stripe customer ID in subscriptions

      if (userDetailsError || !userDetails?.user_id) {
        console.error(`[${functionName}] Could not find active user/user_id for Stripe customer ${stripeCustomerId}. Invoice: ${invoice.id}. Error:`, userDetailsError);
        return { success: false, transactionId: eventId, error: `User not found for customer ${stripeCustomerId}` };
      }
      const userId = userDetails.user_id;

      const { data: walletData, error: walletError } = await this.adminClient
        .from('token_wallets')
        .select('wallet_id')
        .eq('user_id', userId)
        .single(); // Assuming one wallet per user for now

      if (walletError || !walletData?.wallet_id) {
        console.error(`[${functionName}] Token wallet not found for user ${userId}. Invoice: ${invoice.id}. Error:`, walletError);
        return { success: false, transactionId: eventId, error: `Wallet not found for user ${userId}` };
      }
      const targetWalletId = walletData.wallet_id;

      // 3. Determine tokens_to_award (this is crucial for renewals)
      // This assumes invoice lines correspond to items in subscription_plans
      let tokensToAward = 0;
      let planItemIdInternal: string | undefined;
      if (invoice.lines && invoice.lines.data.length > 0) {
        const firstLineItem = invoice.lines.data[0];
        if (firstLineItem?.price?.id) {
          const stripePriceId = firstLineItem.price.id;
          const { data: planInfo, error: planInfoError } = await this.adminClient
            .from('subscription_plans')
            .select('item_id_internal, tokens_awarded')
            .eq('stripe_price_id', stripePriceId)
            .single();
          if (planInfoError || !planInfo) {
            console.warn(`[${functionName}] Could not find plan info for Stripe Price ID ${stripePriceId} from invoice ${invoice.id}. Error:`, planInfoError);
            // Decide if this is fatal or if tokens can be 0
          } else {
            tokensToAward = planInfo.tokens_awarded ?? 0;
            planItemIdInternal = planInfo.item_id_internal;
            console.log(`[${functionName}] Plan ${planItemIdInternal} awards ${tokensToAward} tokens for invoice ${invoice.id}`);
          }
        }
      }
      if (tokensToAward <= 0) {
          console.warn(`[${functionName}] No tokens to award or plan not found for invoice ${invoice.id}.`);
          // If this is a mandatory token award scenario, this might be an error.
          // For now, will proceed but tokens won't be awarded.
      }

      // 4. Create or Update payment_transactions record
      // For invoice.payment_succeeded, this is typically a NEW payment record for a renewal.
      const paymentTxData = {
        user_id: userId,
        organization_id: undefined, // Payment transactions are typically user-centric
        target_wallet_id: targetWalletId,
        payment_gateway_id: this.gatewayId,
        gateway_transaction_id: invoice.id, // Stripe Invoice ID
        status: 'PROCESSING_RENEWAL', // Initial status
        amount_requested_fiat: invoice.amount_paid / 100, // Stripe amounts are in cents
        currency_requested_fiat: invoice.currency,
        amount_requested_crypto: undefined, // Changed from null
        currency_requested_crypto: undefined, // Changed from null
        tokens_to_award: tokensToAward,
        metadata_json: { 
            stripe_event_id: eventId, 
            type: 'RENEWAL', 
            stripe_subscription_id: (invoice.subscription && typeof invoice.subscription === 'object' ? (invoice.subscription.id ?? undefined) : (invoice.subscription ?? undefined)),
            item_id_internal: planItemIdInternal,
         },
      };

      const { data: newPaymentTx, error: insertPaymentError } = await this.adminClient
        .from('payment_transactions')
        .insert(paymentTxData)
        .select('id')
        .single();
      
      if (insertPaymentError || !newPaymentTx) {
        console.error(`[${functionName}] Failed to create payment_transactions record for invoice ${invoice.id}. Error:`, insertPaymentError);
        return { success: false, transactionId: eventId, error: `DB error creating payment record: ${insertPaymentError?.message}` };
      }
      paymentTransactionIdForReturn = newPaymentTx.id; // Use our new internal ID

      // 5. Update user_subscriptions (status, period dates)
      if (invoice.subscription && typeof invoice.subscription === 'string') {
        try {
          const stripeSubscription = await this.stripe.subscriptions.retrieve(invoice.subscription);
          const subUpdateData = {
            status: stripeSubscription.status,
            current_period_start: stripeSubscription.current_period_start ? new Date(stripeSubscription.current_period_start * 1000).toISOString() : null,
            current_period_end: stripeSubscription.current_period_end ? new Date(stripeSubscription.current_period_end * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          };
          const { error: subUpdateError } = await this.adminClient
            .from('user_subscriptions')
            .update(subUpdateData)
            .eq('stripe_subscription_id', invoice.subscription);
          if (subUpdateError) {
            console.warn(`[${functionName}] Failed to update user_subscription ${invoice.subscription} for invoice ${invoice.id}. Error:`, subUpdateError);
            // Non-fatal for the payment itself, but log it.
          }
        } catch (stripeSubError) {
            console.warn(`[${functionName}] Failed to retrieve Stripe subscription ${invoice.subscription} during invoice processing for ${invoice.id}. Error:`, stripeSubError);
        }
      }

      // 6. Award Tokens (if any)
      if (tokensToAward > 0) {
        try {
          await this.tokenWalletService.recordTransaction({
            walletId: targetWalletId,
            type: 'CREDIT_PURCHASE', // Or 'CREDIT_RENEWAL' if a distinct type is desired
            amount: String(tokensToAward),
            recordedByUserId: userId,
            relatedEntityId: newPaymentTx.id, // Link to our payment_transactions.id
            relatedEntityType: 'payment_transactions',
            notes: `Tokens for Stripe Invoice ${invoice.id} (Renewal)`,
          });
          console.log(`[${functionName}] Tokens awarded for invoice ${invoice.id}, payment ${newPaymentTx.id}.`);
        } catch (tokenError) {
          console.error(`[${functionName}] Token awarding error for invoice ${invoice.id}, payment ${newPaymentTx.id}. Error:`, tokenError);
          // Mark payment as TOKEN_AWARD_FAILED
          await this.adminClient.from('payment_transactions').update({ status: 'TOKEN_AWARD_FAILED' }).eq('id', newPaymentTx.id);
          return { success: false, transactionId: newPaymentTx.id, error: 'Token award failed after payment renewal.', tokensAwarded: 0 };
        }
      }

      // 7. Finalize payment_transactions to COMPLETED
      const { error: finalUpdateError } = await this.adminClient
        .from('payment_transactions')
        .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
        .eq('id', newPaymentTx.id);

      if (finalUpdateError) {
        console.error(`[${functionName}] Failed to mark payment ${newPaymentTx.id} as COMPLETED for invoice ${invoice.id}. Error:`, finalUpdateError);
        return { success: false, transactionId: newPaymentTx.id, error: 'Failed to finalize payment status.' };
      }
      
      console.log(`[${functionName}] Successfully processed invoice ${invoice.id}, payment ${newPaymentTx.id} COMPLETED.`);
      return { success: true, transactionId: newPaymentTx.id, tokensAwarded: tokensToAward };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${functionName}] General error processing invoice ${invoice.id}, Event ${eventId}:`, errorMessage, error);
      // If a payment_transaction was created, try to mark it FAILED
      if (paymentTransactionIdForReturn && paymentTransactionIdForReturn !== eventId) {
         try {
            await this.adminClient.from('payment_transactions').update({ status: 'FAILED' }).eq('id', paymentTransactionIdForReturn);
         } catch (failUpdateError) {
            console.error(`[${functionName}] Failed to mark payment ${paymentTransactionIdForReturn} as FAILED after general error:`, failUpdateError);
         }
      }
      return { success: false, transactionId: paymentTransactionIdForReturn, error: errorMessage };
    }
  }

  private async _handleInvoicePaymentFailed(event: Stripe.InvoicePaymentFailedEvent): Promise<PaymentConfirmation> {
    const invoice = event.data.object;
    const eventId = event.id;
    const functionName = 'StripePaymentAdapter/_handleInvoicePaymentFailed';
    console.log(`[${functionName}] Processing invoice ${invoice.id}, Event ID: ${eventId}`);

    if (!invoice.customer) {
      console.warn(`[${functionName}] Invoice ${invoice.id} (Event ${eventId}) has no customer. Skipping.`);
      return { success: true, transactionId: eventId };
    }
    const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id;
    let paymentTransactionIdForReturn: string | undefined = eventId;

    try {
      // 1. Idempotency: Check if this invoice.id already processed as a FAILED payment_transaction
      const { data: existingPayment, error: checkError } = await this.adminClient
        .from('payment_transactions')
        .select('id, status')
        .eq('gateway_transaction_id', invoice.id)
        .eq('payment_gateway_id', this.gatewayId)
        .maybeSingle();

      if (checkError) {
        console.error(`[${functionName}] DB error checking existing payment for invoice ${invoice.id}:`, checkError);
        return { success: false, transactionId: eventId, error: `DB error: ${checkError.message}` };
      }

      if (existingPayment?.status === 'FAILED') {
        console.log(`[${functionName}] Invoice ${invoice.id} (Payment ${existingPayment.id}) already marked FAILED.`);
        return { success: true, transactionId: existingPayment.id };
      }
      if (existingPayment?.status === 'COMPLETED') {
         console.warn(`[${functionName}] Invoice ${invoice.id} (Payment ${existingPayment.id}) was COMPLETED, but received payment_failed event. Review needed.`);
      }

      const { data: userDetails, error: userDetailsError } = await this.adminClient
        .from('user_subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', stripeCustomerId)
        .limit(1)
        .single();

      let userId: string | undefined;
      if (userDetailsError || !userDetails?.user_id) {
        console.warn(`[${functionName}] Could not find user_id for Stripe customer ${stripeCustomerId} via subscriptions. Invoice: ${invoice.id}. Error:`, userDetailsError);
        // If user_id is critical for logging, might need to return error here
        // For now, proceed, and paymentTxData.user_id might be undefined.
      } else {
        userId = userDetails.user_id;
      }
      
      // Fetch target_wallet_id if userId is available
      let targetWalletIdForFailedTx: string | undefined;
      if (userId) {
        const { data: walletData, error: walletError } = await this.adminClient
          .from('token_wallets')
          .select('wallet_id')
          .eq('user_id', userId)
          .single();
        if (walletError || !walletData?.wallet_id) {
          console.warn(`[${functionName}] Token wallet not found for user ${userId} during failed invoice ${invoice.id}. Error:`, walletError);
          // This might be an issue if target_wallet_id is strictly required for payment_transactions.
          // Based on schema (NOT NULL), this is an issue. We should probably error out or handle more gracefully.
          // For now, targetWalletIdForFailedTx will remain undefined.
        } else {
          targetWalletIdForFailedTx = walletData.wallet_id;
        }
      }

      // If targetWalletIdForFailedTx is still undefined here, and it's NON-NULLABLE, this insert will fail.
      // This implies that we must be able to resolve a user and their wallet for every invoice event we log to payment_transactions.
      if (!targetWalletIdForFailedTx && userId) { // Added userId check: only error if user was found but wallet wasn't
        console.error(`[${functionName}] CRITICAL: User ${userId} found but wallet not found for failed invoice ${invoice.id}. Cannot log to payment_transactions due to NOT NULL constraint on target_wallet_id.`);
        return { success: false, transactionId: eventId, error: `Wallet not found for user ${userId} to log failed payment.` };
      } else if (!userId) {
        console.error(`[${functionName}] CRITICAL: User not found for failed invoice ${invoice.id}. Cannot log to payment_transactions.`);
        return { success: false, transactionId: eventId, error: `User not found for failed invoice ${invoice.id}.` };
      }

      const paymentTxData = {
        user_id: userId!, 
        organization_id: undefined, // Changed from null
        target_wallet_id: targetWalletIdForFailedTx!,
        payment_gateway_id: this.gatewayId,
        gateway_transaction_id: invoice.id,
        status: 'FAILED',
        amount_requested_fiat: invoice.amount_due / 100,
        currency_requested_fiat: invoice.currency,
        tokens_to_award: 0,
        amount_requested_crypto: undefined, // Added and set to undefined
        currency_requested_crypto: undefined, // Added and set to undefined
        metadata_json: { 
            stripe_event_id: eventId, 
            type: 'RENEWAL_FAILED', 
            stripe_subscription_id: (invoice.subscription && typeof invoice.subscription === 'object' ? (invoice.subscription.id ?? undefined) : (invoice.subscription ?? undefined)),
            billing_reason: invoice.billing_reason ?? undefined, // Ensure null becomes undefined
            attempt_count: invoice.attempt_count,
         },
      };

      const { data: failedPaymentTx, error: upsertPaymentError } = await this.adminClient
        .from('payment_transactions')
        .upsert(paymentTxData, { onConflict: 'gateway_transaction_id, payment_gateway_id' }) // Use gateway_transaction_id for onConflict
        .select('id')
        .single();

      if (upsertPaymentError || !failedPaymentTx) {
        console.error(`[${functionName}] Failed to upsert FAILED payment_transactions record for invoice ${invoice.id}. Error:`, upsertPaymentError);
        return { success: false, transactionId: eventId, error: `DB error upserting failed payment: ${upsertPaymentError?.message}` };
      }
      paymentTransactionIdForReturn = failedPaymentTx.id;
      
      if (invoice.subscription && typeof invoice.subscription === 'string') {
        try {
          const stripeSubscription = await this.stripe.subscriptions.retrieve(invoice.subscription);
          const newStatus = stripeSubscription.status;

          const { error: subUpdateError } = await this.adminClient
            .from('user_subscriptions')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('stripe_subscription_id', invoice.subscription);
          if (subUpdateError) {
            console.warn(`[${functionName}] Failed to update user_subscription ${invoice.subscription} status to ${newStatus} for failed invoice ${invoice.id}. Error:`, subUpdateError);
          }
        } catch (stripeSubError) {
            console.warn(`[${functionName}] Failed to retrieve Stripe subscription ${invoice.subscription} during failed invoice processing for ${invoice.id}. Error:`, stripeSubError);
        }
      }
      console.log(`[${functionName}] Successfully processed failed invoice ${invoice.id}, payment transaction ${failedPaymentTx.id} marked FAILED.`);
      return { success: true, transactionId: failedPaymentTx.id };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${functionName}] General error processing failed invoice ${invoice.id}, Event ${eventId}:`, errorMessage, error);
      return { success: false, transactionId: paymentTransactionIdForReturn, error: errorMessage };
    }
  }

  private async _handleCustomerSubscriptionUpdated(event: Stripe.CustomerSubscriptionUpdatedEvent): Promise<PaymentConfirmation> {
    const subscription = event.data.object;
    const eventId = event.id;
    const functionName = 'StripePaymentAdapter/_handleCustomerSubscriptionUpdated';
    console.log(`[${functionName}] Processing subscription ${subscription.id}, Event ID: ${eventId}, Status: ${subscription.status}`);

    if (!subscription.customer || typeof subscription.customer !== 'string') {
      console.warn(`[${functionName}] Subscription ${subscription.id} has no valid customer ID. Skipping.`);
      return { success: true, transactionId: eventId }; // Acknowledge event
    }
    const stripeCustomerId = subscription.customer;

    try {
      let internalPlanId: string | undefined;
      if (subscription.items && subscription.items.data.length > 0 && subscription.items.data[0]?.price?.id) {
        const stripePriceId = subscription.items.data[0].price.id;
        const { data: planData, error: planError } = await this.adminClient
          .from('subscription_plans')
          .select('id')
          .eq('stripe_price_id', stripePriceId)
          .single();
        if (planError || !planData) {
          console.warn(`[${functionName}] Plan not found for Stripe Price ID ${stripePriceId} on subscription ${subscription.id}. Will update subscription without plan_id linkage. Error:`, planError);
        } else {
          internalPlanId = planData.id;
        }
      } else {
        console.warn(`[${functionName}] No price ID found on subscription ${subscription.id}. Cannot link to internal plan.`);
      }

      const subscriptionUpdateData: Partial<Database['public']['Tables']['user_subscriptions']['Row']> = {
        status: subscription.status,
        current_period_start: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : undefined,
        current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : undefined,
        cancel_at_period_end: subscription.cancel_at_period_end,
        stripe_customer_id: stripeCustomerId, // Good to ensure this is up-to-date
        updated_at: new Date().toISOString(),
      };
      if (internalPlanId) {
        subscriptionUpdateData.plan_id = internalPlanId;
      }

      const { error: updateError, count } = await this.adminClient
        .from('user_subscriptions')
        .update(subscriptionUpdateData)
        .eq('stripe_subscription_id', subscription.id);

      if (updateError) {
        console.error(`[${functionName}] Error updating user_subscription ${subscription.id}. Error:`, updateError);
        return { success: false, transactionId: eventId, error: `DB error updating subscription: ${updateError.message}` };
      }
      if (count === 0) {
        console.warn(`[${functionName}] No user_subscription found with stripe_subscription_id ${subscription.id} to update. This might be okay if checkout.session.completed hasn't processed yet or was missed.`);
        // Still return success to Stripe as the event itself is valid, but our DB state might be lagging.
      }
      
      console.log(`[${functionName}] Successfully processed event for subscription ${subscription.id}. Updated records: ${count}`);
      return { success: true, transactionId: eventId };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${functionName}] General error processing event for subscription ${subscription.id}, Event ${eventId}:`, errorMessage, error);
      return { success: false, transactionId: eventId, error: errorMessage };
    }
  }

  private async _handleCustomerSubscriptionDeleted(event: Stripe.CustomerSubscriptionDeletedEvent): Promise<PaymentConfirmation> {
    const subscription = event.data.object; // This is the deleted subscription object
    const eventId = event.id;
    const functionName = 'StripePaymentAdapter/_handleCustomerSubscriptionDeleted';
    console.log(`[${functionName}] Processing deleted subscription ${subscription.id}, Event ID: ${eventId}, Status: ${subscription.status}`);

    // The status on a deleted subscription event is usually 'canceled'
    const newStatus = subscription.status === 'canceled' ? 'canceled' : 'deleted'; // Or just use subscription.status

    try {
      const subscriptionUpdateData = {
        status: newStatus,
        updated_at: new Date().toISOString(),
        // Optionally, capture ended_at if available and if your schema supports it
        // current_period_end: subscription.ended_at ? new Date(subscription.ended_at * 1000).toISOString() : undefined,
        cancel_at_period_end: subscription.cancel_at_period_end, // It might be true
      };

      const { error: updateError, count } = await this.adminClient
        .from('user_subscriptions')
        .update(subscriptionUpdateData)
        .eq('stripe_subscription_id', subscription.id);

      if (updateError) {
        console.error(`[${functionName}] Error updating user_subscription ${subscription.id} to status ${newStatus}. Error:`, updateError);
        return { success: false, transactionId: eventId, error: `DB error updating subscription: ${updateError.message}` };
      }
      if (count === 0) {
        console.warn(`[${functionName}] No user_subscription found with stripe_subscription_id ${subscription.id} to mark as ${newStatus}.`);
      }

      console.log(`[${functionName}] Successfully processed delete event for subscription ${subscription.id}. Marked as ${newStatus}. Updated records: ${count}`);
      return { success: true, transactionId: eventId };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${functionName}] General error processing delete event for subscription ${subscription.id}, Event ${eventId}:`, errorMessage, error);
      return { success: false, transactionId: eventId, error: errorMessage };
    }
  }
	// --- Product and Price Event Handlers ---
	private async _handleProductCreated(
		event: Stripe.Event,
		product: Product,
	): Promise<PaymentConfirmation> {
		const functionName = '_handleProductCreated';
		Logger.info(`[${functionName}] Handling ${event.type} for product ${product.id}, Event ID: ${event.id}`);
		const isTestMode = event.livemode === false;

		// Update payment_transactions log
		await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSING, {
			event_subtype: 'product_created',
			stripe_product_id: product.id,
			description: `Stripe product ${product.id} created. Triggering sync.`,
		});

		try {
			Logger.info(`[${functionName}] Invoking sync-stripe-plans function (isTestMode: ${isTestMode}).`);
			const { data: invokeData, error: invokeError } = await this.adminClient.functions.invoke<
				SyncPlansFunctionResult // Specify the expected return type
			>('sync-stripe-plans', {
				body: { isTestMode }, // Pass as an object
			});

			if (invokeError) {
				const errDetails = invokeError instanceof Error
					? { message: invokeError.message, name: invokeError.name, stack: invokeError.stack }
					: invokeError;
				Logger.error(
					{ err: errDetails, functionName: 'sync-stripe-plans', isTestMode },
					`[${functionName}] Error invoking sync-stripe-plans function.`,
				);
				await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSED_ERROR, {
					error_details: `Failed to invoke sync-stripe-plans: ${invokeError.message || JSON.stringify(invokeError)}`,
				});
				return {
					success: false,
					message: `Product created, but failed to invoke sync-stripe-plans: ${
						invokeError.message || JSON.stringify(invokeError)
					}`,
					error: { type: 'FunctionInvocationError', details: invokeError },
				};
			}

			Logger.info(
				`[${functionName}] Successfully invoked sync-stripe-plans. Result: ${JSON.stringify(invokeData)}`,
			);
			await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSED_SUCCESS, {
				invoke_result: invokeData as unknown as Json,
			});
			return {
				success: true,
				message: 'Product created event processed and plan sync invoked.',
				// No specific transactionId for this, but the event is logged.
			};
		} catch (err) {
			Logger.error(
				{ err, eventId: event.id, productId: product.id },
				`[${functionName}] Unexpected error: ${err.message}`,
			);
			await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSED_ERROR, {
				error_details: `Unexpected error in _handleProductCreated: ${err.message}`,
			});
			return {
				success: false,
				message: `Unexpected error processing product.created: ${err.message}`,
				error: { type: 'InternalError', details: err },
			};
		}
	}

	private async _handleProductUpdated(
		event: Stripe.Event,
		product: Product,
	): Promise<PaymentConfirmation> {
		const functionName = '_handleProductUpdated';
		Logger.info(
			`[${functionName}] Handling ${event.type} for product ${product.id}. Active: ${product.active}, Event ID: ${event.id}`,
		);

		await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSING, {
			event_subtype: 'product_updated',
			stripe_product_id: product.id,
			description: `Stripe product ${product.id} updated. Target active status: ${product.active}.`,
			metadata_updates: { active: product.active, metadata: product.metadata },
		});

		if (product.id === 'price_FREE') {
			Logger.info(`[${functionName}] Ignoring product.updated event for 'price_FREE'.`);
			await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.SKIPPED, {
				reason: "Ignoring 'price_FREE'",
			});
			return {
				success: true,
				message: "Product 'price_FREE' update event ignored.",
			};
		}

		try {
			const { error: updateError } = await this.adminClient
				.from('subscription_plans')
				.update({
					active: product.active,
					// Potentially update other fields if they can change and are synced, e.g., plan name if derived from product nickname/metadata
					// metadata_json: product.metadata as unknown as Json, // If you store Stripe product metadata
					updated_at: new Date().toISOString(),
				})
				.eq('stripe_product_id', product.id);

			if (updateError) {
				Logger.error(
					{ err: updateError, productId: product.id, active: product.active },
					`[${functionName}] Error updating subscription_plan for product ${product.id}.`,
				);
				await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSED_ERROR, {
					error_details: `Failed to update subscription_plan for product: ${updateError.message}`,
				});
				return {
					success: false,
					message: `Failed to update plan status for product ${product.id}: ${updateError.message}`,
					error: { type: 'DatabaseError', details: updateError },
				};
			}

			Logger.info(
				`[${functionName}] Successfully updated plan status/details for product ${product.id}. Active: ${product.active}.`,
			);
			await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSED_SUCCESS);
			return {
				success: true,
				message: `Product ${product.id} update processed. Plan active status set to ${product.active}.`,
			};
		} catch (err) {
			Logger.error(
				{ err, eventId: event.id, productId: product.id },
				`[${functionName}] Unexpected error: ${err.message}`,
			);
			await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSED_ERROR, {
				error_details: `Unexpected error in _handleProductUpdated: ${err.message}`,
			});
			return {
				success: false,
				message: `Unexpected error processing product.updated: ${err.message}`,
				error: { type: 'InternalError', details: err },
			};
		}
	}

	private async _handlePriceCreated(
		event: Stripe.Event,
		price: Price,
	): Promise<PaymentConfirmation> {
		const functionName = '_handlePriceCreated';
		Logger.info(
			`[${functionName}] Handling ${event.type} for price ${price.id}. Active: ${price.active}, Product: ${typeof price.product === 'string' ? price.product : price.product.id}, Event ID: ${event.id}`,
		);
		const isTestMode = event.livemode === false;

		await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSING, {
			event_subtype: 'price_created',
			stripe_price_id: price.id,
			stripe_product_id: typeof price.product === 'string' ? price.product : price.product.id,
			description: `Stripe price ${price.id} created. Active: ${price.active}. Triggering sync.`,
			metadata_updates: { active: price.active, product: price.product },
		});

		if (price.id === 'price_FREE') {
			Logger.info(`[${functionName}] Ignoring price.created event for 'price_FREE'.`);
			await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.SKIPPED, {
				reason: "Ignoring 'price_FREE'",
			});
			return {
				success: true, // Technically processed by ignoring
				message: "Price 'price_FREE' event ignored as per specific rule.",
			};
		}

		try {
			// 1. Update the specific plan linked to this price (if it somehow exists already, or to set active status)
			//    This step might be redundant if sync-stripe-plans handles creation and active status thoroughly.
			//    However, the old handler did an update first.
			const { error: updateError } = await this.adminClient
				.from('subscription_plans')
				.update({ active: price.active, updated_at: new Date().toISOString() })
				.eq('stripe_price_id', price.id);

			if (updateError) {
				// Log error but don't necessarily fail yet, as sync might fix it.
				Logger.warn(
					{ err: updateError, priceId: price.id, active: price.active },
					`[${functionName}] Error updating subscription_plan for new price ${price.id} (might not exist yet). Sync will follow.`,
				);
				// Update transaction with partial info if needed
			} else {
				Logger.info(
					`[${functionName}] Initial update for price ${price.id} active status to ${price.active} processed (if plan existed).`,
				);
			}

			// 2. Invoke sync-stripe-plans
			Logger.info(`[${functionName}] Invoking sync-stripe-plans function (isTestMode: ${isTestMode}).`);
			const { data: invokeData, error: invokeError } = await this.adminClient.functions.invoke<
				SyncPlansFunctionResult
			>('sync-stripe-plans', {
				body: { isTestMode },
			});

			if (invokeError) {
				const errDetails = invokeError instanceof Error
					? { message: invokeError.message, name: invokeError.name, stack: invokeError.stack }
					: invokeError;
				Logger.error(
					{ err: errDetails, functionName: 'sync-stripe-plans', isTestMode },
					`[${functionName}] Error invoking sync-stripe-plans function for new price.`,
				);
				await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSED_ERROR, {
					error_details: `Failed to invoke sync-stripe-plans for new price: ${
						invokeError.message || JSON.stringify(invokeError)
					}`,
					update_error_details: updateError ? updateError.message : null,
				});
				return {
					success: false,
					message: `Price created, but failed to invoke sync-stripe-plans: ${
						invokeError.message || JSON.stringify(invokeError)
					}`,
					error: { type: 'FunctionInvocationError', details: invokeError },
				};
			}

			Logger.info(
				`[${functionName}] Successfully invoked sync-stripe-plans for new price. Result: ${
					JSON.stringify(invokeData)
				}`,
			);
			await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSED_SUCCESS, {
				invoke_result: invokeData as unknown as Json,
				update_error_details: updateError ? updateError.message : null,
			});
			return {
				success: true,
				message: 'Price created event processed and plan sync invoked.',
			};
		} catch (err) {
			Logger.error(
				{ err, eventId: event.id, priceId: price.id },
				`[${functionName}] Unexpected error: ${err.message}`,
			);
			await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSED_ERROR, {
				error_details: `Unexpected error in _handlePriceCreated: ${err.message}`,
			});
			return {
				success: false,
				message: `Unexpected error processing price.created: ${err.message}`,
				error: { type: 'InternalError', details: err },
			};
		}
	}

	private async _handlePriceUpdated(
		event: Stripe.Event,
		price: Price,
	): Promise<PaymentConfirmation> {
		const functionName = '_handlePriceUpdated';
		Logger.info(
			`[${functionName}] Handling ${event.type} for price ${price.id}. Active: ${price.active}, Event ID: ${event.id}`,
		);

		await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSING, {
			event_subtype: 'price_updated',
			stripe_price_id: price.id,
			stripe_product_id: typeof price.product === 'string' ? price.product : price.product.id,
			description: `Stripe price ${price.id} updated. Target active status: ${price.active}.`,
			metadata_updates: { active: price.active, metadata: price.metadata },
		});

		if (price.id === 'price_FREE') {
			Logger.info(`[${functionName}] Ignoring price.updated event for 'price_FREE'.`);
			await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.SKIPPED, {
				reason: "Ignoring 'price_FREE'",
			});
			return {
				success: true,
				message: "Price 'price_FREE' update event ignored.",
			};
		}

		try {
			const { error: updateError } = await this.adminClient
				.from('subscription_plans')
				.update({
					active: price.active,
					// Potentially update other fields if they can change and are synced, e.g., plan name if derived from price nickname/metadata
					// metadata_json: price.metadata as unknown as Json, // If you store Stripe price metadata
					updated_at: new Date().toISOString(),
				})
				.eq('stripe_price_id', price.id);

			if (updateError) {
				Logger.error(
					{ err: updateError, priceId: price.id, active: price.active },
					`[${functionName}] Error updating subscription_plan for price ${price.id}.`,
				);
				await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSED_ERROR, {
					error_details: `Failed to update subscription_plan for price: ${updateError.message}`,
				});
				return {
					success: false,
					message: `Failed to update plan status for price ${price.id}: ${updateError.message}`,
					error: { type: 'DatabaseError', details: updateError },
				};
			}

			Logger.info(
				`[${functionName}] Successfully updated plan status/details for price ${price.id}. Active: ${price.active}.`,
			);
			await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSED_SUCCESS);
			return {
				success: true,
				message: `Price ${price.id} update processed. Plan active status set to ${price.active}.`,
			};
		} catch (err) {
			Logger.error(
				{ err, eventId: event.id, priceId: price.id },
				`[${functionName}] Unexpected error: ${err.message}`,
			);
			await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSED_ERROR, {
				error_details: `Unexpected error in _handlePriceUpdated: ${err.message}`,
			});
			return {
				success: false,
				message: `Unexpected error processing price.updated: ${err.message}`,
				error: { type: 'InternalError', details: err },
			};
		}
	}

	private async _handlePriceDeleted(
		event: Stripe.Event,
		price: Price,
	): Promise<PaymentConfirmation> {
		const functionName = '_handlePriceDeleted';
		// Price object for deleted event might be the state before deletion. Active status might be true.
		// The key is that the event is 'price.deleted'.
		Logger.info(
			`[${functionName}] Handling ${event.type} for price ${price.id}. Event ID: ${event.id}`,
		);
		const targetActiveStatus = false; // When a price is deleted, associated plan should become inactive.

		await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSING, {
			event_subtype: 'price_deleted',
			stripe_price_id: price.id,
			stripe_product_id: typeof price.product === 'string' ? price.product : price.product.id,
			description: `Stripe price ${price.id} deleted. Setting associated plan to inactive.`,
			metadata_updates: { active: targetActiveStatus },
		});

		if (price.id === 'price_FREE') {
			Logger.info(`[${functionName}] Ignoring price.deleted event for 'price_FREE'.`);
			await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.SKIPPED, {
				reason: "Ignoring 'price_FREE'",
			});
			return {
				success: true,
				message: "Price 'price_FREE' deletion event ignored.",
			};
		}

		try {
			const { error: updateError } = await this.adminClient
				.from('subscription_plans')
				.update({ active: targetActiveStatus, updated_at: new Date().toISOString() })
				.eq('stripe_price_id', price.id);

			if (updateError) {
				Logger.error(
					{ err: updateError, priceId: price.id },
					`[${functionName}] Error deactivating subscription_plan for deleted price ${price.id}.`,
				);
				await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSED_ERROR, {
					error_details: `Failed to deactivate plan for deleted price: ${updateError.message}`,
				});
				return {
					success: false,
					message: `Failed to deactivate plan for deleted price ${price.id}: ${updateError.message}`,
					error: { type: 'DatabaseError', details: updateError },
				};
			}

			Logger.info(
				`[${functionName}] Successfully deactivated plan associated with deleted price ${price.id}.`,
			);
			await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSED_SUCCESS);
			return {
				success: true,
				message: `Price ${price.id} deletion processed. Associated plan set to inactive.`,
			};
		} catch (err) {
			Logger.error(
				{ err, eventId: event.id, priceId: price.id },
				`[${functionName}] Unexpected error: ${err.message}`,
			);
			await this._updatePaymentTransaction(event.id, PaymentTransactionStatus.PROCESSED_ERROR, {
				error_details: `Unexpected error in _handlePriceDeleted: ${err.message}`,
			});
			return {
				success: false,
				message: `Unexpected error processing price.deleted: ${err.message}`,
				error: { type: 'InternalError', details: err },
			};
		}
	}

	// --- Helper to update payment_transactions ---
	private async _updatePaymentTransaction(
		// Can be stripe_event_id (string) or db id (number or string if UUID)
		identifier: string | number,
		status: PaymentTransactionStatus,
		additionalData?: Partial<TablesUpdate<'payment_transactions'>> & {
			// Allow specific known keys for metadata updates
			reason?: string;
			error_details?: string | Json | Record<string, unknown>;
			error_type?: string;
			event_subtype?: string;
			stripe_product_id?: string;
			stripe_price_id?: string;
			description?: string;
			metadata_updates?: Json | Record<string, unknown>;
			invoke_result?: Json;
		},
	): Promise<void> {
		const updatePayload: TablesUpdate<'payment_transactions'> = {
			status,
			updated_at: new Date().toISOString(),
			...additionalData, // Spread general fields first
		};

		// Construct metadata_json carefully by merging if it exists
		let currentMetadata: Record<string, unknown> = {};
		if (typeof identifier === 'string' && identifier.startsWith('evt_')) {
			// If it's a stripe_event_id, try to fetch existing metadata to merge
			const { data: existingTransaction, error: fetchError } = await this.adminClient
				.from('payment_transactions')
				.select('metadata_json')
				.eq('stripe_event_id', identifier)
				.single();
			if (fetchError) {
				Logger.warn(
					`[${'_updatePaymentTransaction'}] Error fetching existing transaction for event ${identifier} to merge metadata: ${fetchError.message}`,
				);
			} else if (existingTransaction?.metadata_json && typeof existingTransaction.metadata_json === 'object') {
				currentMetadata = existingTransaction.metadata_json as Record<string, unknown>;
			}
		}

		const newMetadataEntries: Record<string, unknown> = {};
		if (additionalData?.reason) newMetadataEntries.reason_skipped = additionalData.reason;
		if (additionalData?.error_details) newMetadataEntries.error_details = additionalData.error_details;
		if (additionalData?.error_type) newMetadataEntries.error_type = additionalData.error_type;
		if (additionalData?.event_subtype) newMetadataEntries.event_subtype = additionalData.event_subtype;
		if (additionalData?.stripe_product_id) {
			newMetadataEntries.stripe_product_id = additionalData.stripe_product_id;
		}
		if (additionalData?.stripe_price_id) newMetadataEntries.stripe_price_id = additionalData.stripe_price_id;
		if (additionalData?.metadata_updates) {
			Object.assign(newMetadataEntries, additionalData.metadata_updates as Record<string, unknown>);
		}
		if (additionalData?.invoke_result) newMetadataEntries.invoke_result = additionalData.invoke_result;

		if (Object.keys(newMetadataEntries).length > 0) {
			updatePayload.metadata_json = {
				...currentMetadata,
				...newMetadataEntries,
			} as unknown as Json;
		}

		// Remove keys that were only for metadata construction from the main payload
		delete updatePayload.reason;
		delete updatePayload.error_details;
		delete updatePayload.error_type;
		delete updatePayload.event_subtype;
		// stripe_product_id and stripe_price_id might be actual columns, so don't delete unless sure
		// delete updatePayload.stripe_product_id;
		// delete updatePayload.stripe_price_id;
		delete updatePayload.metadata_updates;
		delete updatePayload.invoke_result;
		if (additionalData?.description) updatePayload.description = additionalData.description;


		let queryBuilder;
		if (typeof identifier === 'number' || (typeof identifier === 'string' && !identifier.startsWith('evt_'))) {
			// Assume it's a database ID (potentially UUID if string)
			queryBuilder = this.adminClient
				.from('payment_transactions')
				.update(updatePayload)
				.eq('id', identifier);
		} else {
			// Assume it's a stripe_event_id
			queryBuilder = this.adminClient
				.from('payment_transactions')
				.update(updatePayload)
				.eq('stripe_event_id', identifier);
		}

		const { error: updateError } = await queryBuilder;

		if (updateError) {
			Logger.error(
				{ err: updateError, identifier, status, additionalData },
				`[${'_updatePaymentTransaction'}] Failed to update payment_transactions for ${identifier} to status ${status}.`,
			);
		} else {
			Logger.info(
				`[${'_updatePaymentTransaction'}] payment_transactions for ${identifier} updated to status ${status}.`,
			);
		}
	}

	// ... other existing private methods ...
}

// Ensure all Stripe object types used in handlers are imported and available.
// Example: Charge, Customer, PaymentIntent, PaymentMethod, SetupIntent etc. might be needed
// if more event types are handled. For now, we have:
// CheckoutSession, Invoice, Subscription, Product, Price
  // Placeholder for product/price handlers
  // ... other private handlers ...
