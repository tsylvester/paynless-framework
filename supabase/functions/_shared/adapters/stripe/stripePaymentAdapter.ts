import { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'npm:stripe';
import { Buffer } from "node:buffer";
import { Database } from '../../../types_db.ts'; // Assuming Price & Product might come from here or Stripe SDK
import {
  IPaymentGatewayAdapter,
  PaymentInitiationResult,
  PaymentConfirmation,
  PaymentOrchestrationContext,
} from '../../types/payment.types.ts';
import { ITokenWalletService } from '../../types/tokenWallet.types.ts';
import { logger } from '../../logger.ts'; // Import the logger instance
import { updatePaymentTransaction } from './utils/stripe.updatePaymentTransaction.ts';
import type { HandlerContext, ProductPriceHandlerContext } from '../../stripe.mock.ts';

// Import individual handlers
import { handleCheckoutSessionCompleted } from './handlers/stripe.checkoutSessionCompleted.ts';
import { handleInvoicePaymentSucceeded } from './handlers/stripe.invoicePaymentSucceeded.ts';
import { handleInvoicePaymentFailed } from './handlers/stripe.invoicePaymentFailed.ts';
import { handleCustomerSubscriptionUpdated } from './handlers/stripe.subscriptionUpdated.ts';
import { handleCustomerSubscriptionDeleted } from './handlers/stripe.subscriptionDeleted.ts';
import { handleProductCreated } from './handlers/stripe.productCreated.ts';
import { handleProductUpdated } from './handlers/stripe.productUpdated.ts';
import { handleProductDeleted } from './handlers/stripe.productDeleted.ts'; 
import { handlePriceCreated } from './handlers/stripe.priceCreated.ts';
import { handlePriceUpdated } from './handlers/stripe.priceUpdated.ts';
import { handlePriceDeleted } from './handlers/stripe.priceDeleted.ts';
import { handlePlanCreated } from './handlers/stripe.planCreated.ts';

// Stripe-specific types used by old handlers, ensure these are available to new handlers
// or imported within them. For the adapter itself, we might not need them directly anymore.

export class StripePaymentAdapter implements IPaymentGatewayAdapter {
  public gatewayId = 'stripe';
  private stripe: Stripe;
  private handlerContext: HandlerContext;

  constructor(
    stripeInstance: Stripe,
    adminSupabaseClient: SupabaseClient<Database>,
    tokenWalletService: ITokenWalletService,
    stripeWebhookSecret: string,
  ) {
    this.stripe = stripeInstance;
    
    const functionsUrl = Deno.env.get('SUPABASE_INTERNAL_FUNCTIONS_URL') || Deno.env.get('SUPABASE_URL');
    if (!functionsUrl) {
        logger.error("SUPABASE_URL or SUPABASE_INTERNAL_FUNCTIONS_URL environment variable is not set. This is required for function invocations.");
    }

    this.handlerContext = {
      stripe: stripeInstance,
      supabaseClient: adminSupabaseClient,
      logger: logger, // Assign the imported logger instance
      tokenWalletService: tokenWalletService,
      updatePaymentTransaction: (transactionId, updates, eventId) => 
        updatePaymentTransaction(adminSupabaseClient, transactionId, updates, eventId),
      featureFlags: {}, // Populate if needed
      functionsUrl: functionsUrl ? `${functionsUrl}/functions/v1` : 'http://localhost:54321/functions/v1', // Default for local dev
      stripeWebhookSecret: stripeWebhookSecret,
    };
    logger.info('[StripePaymentAdapter] Initialized with HandlerContext.');
  }

  async initiatePayment(context: PaymentOrchestrationContext): Promise<PaymentInitiationResult> {
    this.handlerContext.logger.info('[StripePaymentAdapter initiatePayment] Called with context:', { context: JSON.stringify(context, null, 2) });
    try {
      const { data: planData, error: planError } = await this.handlerContext.supabaseClient
        .from('subscription_plans')
        .select('stripe_price_id, item_id_internal, plan_type, tokens_to_award, amount, currency')
        .eq('stripe_price_id', context.itemId)
        .single();

      if (planError || !planData) {
        this.handlerContext.logger.error('[StripePaymentAdapter initiatePayment] Error fetching plan data or not found for item.', { itemId: context.itemId, error: planError });
        const errorMsg = planError ? planError.message : `Plan data not found for item ${context.itemId}.`;
        return { success: false, transactionId: context.internalPaymentId, error: errorMsg };
      }
      
      if (!planData.stripe_price_id) {
        this.handlerContext.logger.error('[StripePaymentAdapter initiatePayment] stripe_price_id not found in plan data.', { itemId: context.itemId });
        return { success: false, transactionId: context.internalPaymentId, error: `Stripe Price ID configuration missing for item ${context.itemId}.` };
      }
      const stripePriceId = planData.stripe_price_id;
      const planType = planData.plan_type;
      this.handlerContext.logger.info(`[StripePaymentAdapter initiatePayment] Using Stripe Price ID: ${stripePriceId} and plan_type: ${planType} for item ID: ${context.itemId}`);
      
      let stripeMode: 'payment' | 'subscription';
      if (planType === 'one_time_purchase') {
        stripeMode = 'payment';
      } else if (planType === 'subscription') {
        stripeMode = 'subscription';
      } else {
        const errorMsg = `Invalid or missing plan_type: '${planType}' received for item ID: ${context.itemId}. Cannot determine Stripe session mode.`;
        this.handlerContext.logger.error('[StripePaymentAdapter initiatePayment] Invalid plan_type.', { planType, itemId: context.itemId });
        return { success: false, transactionId: context.internalPaymentId, error: errorMsg };
      }
      this.handlerContext.logger.info(`[StripePaymentAdapter initiatePayment] Determined Stripe mode: ${stripeMode}`);

      const internalPaymentId = context.internalPaymentId;
      const userId = context.userId;
      const organizationId = context.organizationId;
      const quantity = context.quantity;
      const request_origin: string | undefined | unknown = context.metadata?.request_origin;
      const siteUrl = request_origin;
      const successUrl = `${siteUrl}/SubscriptionSuccess?payment_id=${internalPaymentId}&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${siteUrl}/subscription?payment_id=${internalPaymentId}`;

      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        line_items: [{ price: stripePriceId, quantity: quantity }],
        mode: stripeMode,
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: userId, 
        metadata: {
          internal_payment_id: internalPaymentId,
          user_id: userId,
          organization_id: organizationId || '',
          item_id: context.itemId,
          tokens_to_award: String(planData.tokens_to_award || context.tokensToAward || 0), 
          target_wallet_id: context.targetWalletId,
        },
      };
      
      if (stripeMode === 'payment' && context.currencyForGateway && planData.currency && context.currencyForGateway.toLowerCase() !== planData.currency.toLowerCase()) {
        this.handlerContext.logger.warn(`[StripePaymentAdapter initiatePayment] Potential currency mismatch: Price currency is ${planData.currency}, requested gateway currency is ${context.currencyForGateway}. Payment Intent currency might need to be set if Price doesn't support requested currency.`);
      }
       if (stripeMode === 'subscription' && sessionParams.metadata) {
         // For subscriptions, payment_method_collection is 'if_required' by default
         // sessionParams.payment_method_collection = 'always'; // if you want to always collect payment method
      }

      const stripeSession = await this.stripe.checkout.sessions.create(sessionParams);
      this.handlerContext.logger.info('[StripePaymentAdapter initiatePayment] Stripe session created.', { sessionId: stripeSession.id });

      return {
        success: true,
        transactionId: internalPaymentId,
        paymentGatewayTransactionId: stripeSession.id,
        redirectUrl: stripeSession.url ?? undefined,
        clientSecret: stripeSession.payment_intent && typeof stripeSession.payment_intent === 'string' 
                        ? (await this.stripe.paymentIntents.retrieve(stripeSession.payment_intent)).client_secret ?? undefined
                        : typeof stripeSession.payment_intent === 'object' && stripeSession.payment_intent?.client_secret 
                        ? stripeSession.payment_intent.client_secret
                        : undefined, // Extract client_secret if available (for Payment Intents mode)
      };

    } catch (error) {
      this.handlerContext.logger.error('[StripePaymentAdapter initiatePayment] Exception in initiatePayment', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { 
        success: false, 
        transactionId: context.internalPaymentId, 
        error: errorMessage || 'An unexpected error occurred during payment initiation with Stripe.' 
      };
    }
  }

  async handleWebhook(rawBody: ArrayBuffer, signature: string | undefined): Promise<PaymentConfirmation> {
    this.handlerContext.logger.info('[StripePaymentAdapter handleWebhook] Called.');
    if (!signature) {
      this.handlerContext.logger.warn('[StripePaymentAdapter handleWebhook] Webhook signature missing.');
      return { success: false, transactionId: undefined, error: 'Webhook signature missing.' };
    }
    
    let event: Stripe.Event;
    try {
      // Convert ArrayBuffer to Node.js Buffer for the Stripe SDK
      const bodyAsNodeBuffer = Buffer.from(rawBody);

      // Log the webhook secret being used (partially)
      const secretFromContext = this.handlerContext.stripeWebhookSecret;
      const partialSecretFromContext = secretFromContext.length > 15
        ? `${secretFromContext.substring(0, 10)}...${secretFromContext.substring(secretFromContext.length - 5)}`
        : secretFromContext;
      this.handlerContext.logger.info(`[StripePaymentAdapter handleWebhook] Attempting to verify with secret (partial): ${partialSecretFromContext}`);

      event = await this.stripe.webhooks.constructEventAsync(bodyAsNodeBuffer, signature, this.handlerContext.stripeWebhookSecret);
    } catch (err) {
      this.handlerContext.logger.error('[StripePaymentAdapter handleWebhook] Webhook signature verification failed.', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
      return { success: false, transactionId: undefined, error: 'Webhook signature verification failed.' };
    }

    this.handlerContext.logger.info(`[StripePaymentAdapter handleWebhook] Webhook event received: ${event.type}, ID: ${event.id}`);

    // Create a product/price specific context for those handlers.
    const productPriceHandlerContext: ProductPriceHandlerContext = {
      stripe: this.handlerContext.stripe,
      supabaseClient: this.handlerContext.supabaseClient,
      logger: this.handlerContext.logger,
      functionsUrl: this.handlerContext.functionsUrl,
      stripeWebhookSecret: this.handlerContext.stripeWebhookSecret,
    };

    switch (event.type) {
      case 'checkout.session.completed':
        return handleCheckoutSessionCompleted(
          this.handlerContext,
          event as Stripe.CheckoutSessionCompletedEvent
        );
      case 'invoice.payment_succeeded':
        return handleInvoicePaymentSucceeded(
          this.handlerContext,
          event as Stripe.InvoicePaymentSucceededEvent
        );
      case 'invoice.payment_failed':
        return handleInvoicePaymentFailed(
          this.handlerContext,
          event as Stripe.InvoicePaymentFailedEvent
        );
      case 'customer.subscription.updated':
        return handleCustomerSubscriptionUpdated(
          this.handlerContext,
          event as Stripe.CustomerSubscriptionUpdatedEvent
        );
      case 'customer.subscription.deleted':
        return handleCustomerSubscriptionDeleted(
          this.handlerContext,
          event as Stripe.CustomerSubscriptionDeletedEvent
        );
      case 'product.created': 
        return handleProductCreated(
          productPriceHandlerContext, 
          event
        );
      case 'product.updated': 
        return handleProductUpdated(
          productPriceHandlerContext, 
          event
        );
      case 'product.deleted': 
        return handleProductDeleted(
          productPriceHandlerContext, 
          event
        );
      case 'price.created': 
        return handlePriceCreated(
          productPriceHandlerContext, 
          event
        );
      case 'price.updated': 
        return handlePriceUpdated(
          productPriceHandlerContext, 
          event
        );
      case 'price.deleted': 
        return handlePriceDeleted(
          productPriceHandlerContext, 
          event
        );
      case 'plan.created':
        return handlePlanCreated(
          productPriceHandlerContext,
          event
        );
      default:
        this.handlerContext.logger.info(`[StripePaymentAdapter handleWebhook] Unhandled event type: ${event.type}. Acknowledging with success.`);
        return { success: true, transactionId: event.id };
    }
  }
  // All private _handle... methods and _updatePaymentTransaction should be removed.
  // Their logic is now in the externalized handlers and utils.
}
