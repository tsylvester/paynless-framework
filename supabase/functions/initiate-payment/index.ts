import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js';
import Stripe from 'npm:stripe'; // Corrected import

import {
    handleCorsPreflightRequest,
    createErrorResponse,
    createSuccessResponse
} from '../_shared/cors-headers.ts'; // Corrected import
import {
  PurchaseRequest,
  PaymentOrchestrationContext,
  IPaymentGatewayAdapter,
  PaymentCheckoutMode,
  OrchestrationLineItem,
} from '../_shared/types/payment.types.ts';
import { isPurchaseRequestItem } from '../_shared/types/payment.guard.ts';
import { UserTokenWalletService } from '../_shared/services/tokenwallet/client/userTokenWalletService.ts';
import type { TokenWallet } from '../_shared/types/tokenWallet.types.ts';
import { AdminTokenWalletService } from '../_shared/services/tokenwallet/admin/adminTokenWalletService.ts';
import { StripePaymentAdapter } from '../_shared/adapters/stripe/stripePaymentAdapter.ts';
import { Database } from '../types_db.ts';

console.log('Initializing initiate-payment function');

// Initialize Stripe SDK
let stripeKey: string | undefined;
if (Deno.env.get('SUPA_ENV') === 'local' || Deno.env.get('VITE_STRIPE_TEST_MODE') === 'true') {
  stripeKey = Deno.env.get('STRIPE_SECRET_TEST_KEY');
} else {
  stripeKey = Deno.env.get('STRIPE_SECRET_LIVE_KEY');
}
if (!stripeKey) {
  console.error('STRIPE_SECRET_KEY is not set.');
  // Consider throwing an error here or handling it more gracefully depending on requirements
}
const stripe = new Stripe(stripeKey!, {
  apiVersion: '2025-03-31.basil', // Use a fixed API version
  httpClient: Stripe.createFetchHttpClient(), // Required for Deno
});

// --- Adapter Factory (Simple version for now) ---
function getPaymentAdapter(
  gatewayId: string,
  adminSupabaseClient: SupabaseClient<Database>,
): IPaymentGatewayAdapter {
  if (gatewayId === 'stripe') {
    const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET');
    if (!stripeWebhookSecret) {
      console.error('STRIPE_WEBHOOK_SIGNING_SECRET is not set for StripePaymentAdapter.');
      // Potentially return null or throw if this is critical for the adapter's function beyond webhooks
    }
    const adminTokenWalletService = new AdminTokenWalletService(adminSupabaseClient);

    return new StripePaymentAdapter(stripe, adminSupabaseClient, adminTokenWalletService, stripeWebhookSecret || 'dummy_secret_for_initiate_only');
  }
  // Add other gateways here:
  // else if (gatewayId === 'coinbase') {
  throw new Error(`Unsupported payment gateway: ${gatewayId}`);
}

// Define the main request handler logic
async function initiatePaymentHandler(
  req: Request,
  adminClient: SupabaseClient<Database>,
  createUserClientFn: (authHeader: string) => SupabaseClient<Database>,
  getPaymentAdapterFn: (
    gatewayId: string,
    adminSupabaseClient: SupabaseClient<Database>,
  ) => IPaymentGatewayAdapter,
): Promise<Response> {
  console.log(`[initiate-payment] Received request: ${req.method} ${req.url}`);

  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    console.log('[initiate-payment] Handling OPTIONS request via handleCorsPreflightRequest');
    return preflightResponse;
  }

  try {
    // Admin client is now passed in
    // const adminClient = createClient<Database>(
    //   Deno.env.get('SUPABASE_URL')!,
    //   Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    //   { auth: { persistSession: false } }
    // );

    // 1. Authentication (Extract user from Authorization header)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.warn('[initiate-payment] Missing Authorization header');
      return createErrorResponse('Missing Authorization header', 401, req);
    }
    
    const userClient = createUserClientFn(authHeader);
    // const userClient = createClient<Database>(
    //     Deno.env.get('SUPABASE_URL')!,
    //     Deno.env.get('SUPABASE_ANON_KEY')!, // Or specific user JWT if that's the flow
    //     { global: { headers: { Authorization: authHeader } } }
    // );
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) {
      console.warn('[initiate-payment] Authentication error:', userError?.message);
      return createErrorResponse('Authentication failed', 401, req, userError);
    }
    console.log('[initiate-payment] User authenticated:', user.id);

    // 2. Parse PurchaseRequest
    if (!req.body) {
        return createErrorResponse('Request body is missing', 400, req);
    }
    const purchaseRequest: PurchaseRequest = await req.json();
    console.log('[initiate-payment] Parsed PurchaseRequest:', purchaseRequest);

    if (!purchaseRequest.paymentGatewayId || !purchaseRequest.currency) {
        return createErrorResponse('Invalid PurchaseRequest body: missing required fields', 400, req);
    }
    purchaseRequest.userId = user.id; // Ensure userId from authenticated user is used

    const hasMultiItemCart: boolean =
      purchaseRequest.items !== undefined &&
      Array.isArray(purchaseRequest.items) &&
      purchaseRequest.items.length > 0;

    let tokensToAward: number;
    let amountForGateway: number;
    let currencyForGateway: string;
    let itemId: string;
    let lineItems: OrchestrationLineItem[];
    let checkoutMode: PaymentCheckoutMode;

    if (hasMultiItemCart) {
      const multiItems = purchaseRequest.items;
      if (multiItems === undefined) {
        return createErrorResponse('Invalid PurchaseRequest body: missing required fields', 400, req);
      }

      const resolvedLineItems: OrchestrationLineItem[] = [];
      let aggregateTokensToAward = 0;
      let aggregateAmountForGateway = 0;
      let resolvedCommonCurrency: string | null = null;
      let subscriptionContextItemId: string | null = null;
      let firstMultiItemId: string = '';
      let resolvedCheckoutMode: PaymentCheckoutMode;

      for (const rawItem of multiItems) {
        if (!isPurchaseRequestItem(rawItem)) {
          return createErrorResponse('Invalid item in PurchaseRequest items array', 400, req);
        }

        const { data: planData, error: planError } = await adminClient
          .from('subscription_plans')
          .select('stripe_price_id, item_id_internal, plan_type, tokens_to_award, amount, currency')
          .eq('stripe_price_id', rawItem.itemId)
          .eq('active', true)
          .single();

        if (planError) {
          console.error('[initiate-payment] Error fetching plan data for item:', rawItem.itemId, 'Details:', planError.message);
          if (planError.code === 'PGRST116') {
            const errMessage = `Item ID ${rawItem.itemId} not found or is not active.`;
            return createErrorResponse(errMessage, 404, req, planError);
          }
          let errStatus: number = 500;
          if (
            typeof planError === 'object' &&
            planError !== null &&
            'status' in planError &&
            typeof planError.status === 'number'
          ) {
            errStatus = planError.status;
          }
          let planErrorMessage: string = 'Failed to retrieve item details due to a database error.';
          if (planError.message) {
            planErrorMessage = planError.message;
          }
          return createErrorResponse(planErrorMessage, errStatus, req, planError);
        }

        if (!planData) {
          const errMessage = `Item ID ${rawItem.itemId} not found or is not active.`;
          console.error('[initiate-payment] Plan not found or inactive for item:', rawItem.itemId);
          return createErrorResponse(errMessage, 404, req);
        }

        if (
          planData.tokens_to_award == null ||
          planData.amount == null ||
          !planData.currency ||
          planData.stripe_price_id == null ||
          planData.stripe_price_id === '' ||
          !planData.plan_type
        ) {
          const errMessage = 'Service offering configuration error for the selected item.';
          console.error('[initiate-payment] Plan data is incomplete for item:', rawItem.itemId, planData);
          return createErrorResponse(errMessage, 500, req);
        }

        const planType: string = planData.plan_type;
        const planCurrency = planData.currency.toLowerCase();
        if (resolvedCommonCurrency === null) {
          resolvedCommonCurrency = planCurrency;
        } else if (resolvedCommonCurrency !== planCurrency) {
          return createErrorResponse('All items must share the same currency', 400, req);
        }

        aggregateTokensToAward += planData.tokens_to_award * rawItem.quantity;
        aggregateAmountForGateway += planData.amount * rawItem.quantity;

        const stripePriceId: string = planData.stripe_price_id;
        const resolvedLineItem: OrchestrationLineItem = {
          itemId: rawItem.itemId,
          stripePriceId,
          quantity: rawItem.quantity,
          tokensToAward: planData.tokens_to_award,
          planType,
          amount: planData.amount,
          currency: planCurrency,
        };
        resolvedLineItems.push(resolvedLineItem);

        if (firstMultiItemId === '') {
          firstMultiItemId = rawItem.itemId;
        }

        if (planType === 'subscription') {
          subscriptionContextItemId = rawItem.itemId;
        }
      }

      if (subscriptionContextItemId !== null) {
        resolvedCheckoutMode = 'subscription';
      } else {
        resolvedCheckoutMode = 'payment';
      }

      if (resolvedCommonCurrency === null) {
        return createErrorResponse('Invalid PurchaseRequest body: missing required fields', 400, req);
      }

      currencyForGateway = resolvedCommonCurrency;
      if (purchaseRequest.currency.toLowerCase() !== currencyForGateway) {
        const errMessage = 'Requested currency does not match item currency.';
        console.error(`[initiate-payment] Mismatch between requested currency (${purchaseRequest.currency}) and plan currency (${currencyForGateway})`);
        return createErrorResponse(errMessage, 400, req);
      }

      tokensToAward = aggregateTokensToAward;
      amountForGateway = aggregateAmountForGateway;
      lineItems = resolvedLineItems;
      checkoutMode = resolvedCheckoutMode;
      if (subscriptionContextItemId !== null) {
        itemId = subscriptionContextItemId;
      } else {
        itemId = firstMultiItemId;
      }
      console.log('[initiate-payment] Multi-item plan resolution complete:', { lineItems, checkoutMode, itemId });
    } else {
      if (!purchaseRequest.itemId || purchaseRequest.quantity == null) {
        return createErrorResponse('Invalid PurchaseRequest body: missing required fields', 400, req);
      }

      // 3. Generic Item Details Extraction (from subscription_plans) — single-item path unchanged
      const { data: planData, error: planError } = await adminClient
        .from('subscription_plans')
        .select('stripe_price_id, item_id_internal, plan_type, tokens_to_award, amount, currency')
        .eq('stripe_price_id', purchaseRequest.itemId)
        .eq('active', true)
        .single();

      if (planError) {
        console.error('[initiate-payment] Error fetching plan data for item:', purchaseRequest.itemId, 'Details:', planError.message);
        if (planError.code === 'PGRST116') {
          const errMessage = `Item ID ${purchaseRequest.itemId} not found or is not active.`;
          return createErrorResponse(errMessage, 404, req, planError);
        }
        let errStatus: number = 500;
        if (
          typeof planError === 'object' &&
          planError !== null &&
          'status' in planError &&
          typeof planError.status === 'number'
        ) {
          errStatus = planError.status;
        }
        let planErrorMessage: string = 'Failed to retrieve item details due to a database error.';
        if (planError.message) {
          planErrorMessage = planError.message;
        }
        return createErrorResponse(planErrorMessage, errStatus, req, planError);
      }

      if (!planData) {
        const errMessage = `Item ID ${purchaseRequest.itemId} not found or is not active (no preceding DB error, but no data returned for item):`;
        console.error('[initiate-payment] Plan not found or inactive (no preceding DB error, but no data returned for item):', purchaseRequest.itemId);
        return createErrorResponse(errMessage, 404, req);
      }

      if (
        planData.tokens_to_award == null ||
        planData.amount == null ||
        !planData.currency ||
        planData.stripe_price_id == null ||
        planData.stripe_price_id === '' ||
        !planData.plan_type
      ) {
        const errMessage = 'Service offering configuration error for the selected item.';
        console.error('[initiate-payment] Plan data is incomplete for item:', purchaseRequest.itemId, planData);
        return createErrorResponse(errMessage, 500, req);
      }
      console.log('[initiate-payment] Fetched plan data:', planData);

      const singlePlanType: string = planData.plan_type;
      const singleStripePriceId: string = planData.stripe_price_id;
      const singlePlanCurrency: string = planData.currency.toLowerCase();
      const singleLineItem: OrchestrationLineItem = {
        itemId: purchaseRequest.itemId,
        stripePriceId: singleStripePriceId,
        quantity: purchaseRequest.quantity,
        tokensToAward: planData.tokens_to_award,
        planType: singlePlanType,
        amount: planData.amount,
        currency: singlePlanCurrency,
      };

      tokensToAward = planData.tokens_to_award;
      amountForGateway = planData.amount * purchaseRequest.quantity;
      currencyForGateway = singlePlanCurrency;
      itemId = purchaseRequest.itemId;
      lineItems = [singleLineItem];
      if (singlePlanType === 'subscription') {
        checkoutMode = 'subscription';
      } else {
        checkoutMode = 'payment';
      }

      if (purchaseRequest.currency.toLowerCase() !== currencyForGateway) {
        const errMessage = 'Requested currency does not match item currency.';
        console.error(`[initiate-payment] Mismatch between requested currency (${purchaseRequest.currency}) and plan currency (${currencyForGateway}) for item ${purchaseRequest.itemId}`);
        return createErrorResponse(errMessage, 400, req);
      }
    }
    
    // 4. Target Wallet Identification (user-scoped client + UserTokenWalletService)
    const userTokenWalletService = new UserTokenWalletService(userClient);
    let wallet: TokenWallet | null;
    if (purchaseRequest.organizationId !== undefined && purchaseRequest.organizationId !== null) {
      wallet = await userTokenWalletService.getWalletForContext(
        purchaseRequest.userId,
        purchaseRequest.organizationId,
      );
    } else {
      wallet = await userTokenWalletService.getWalletForContext(
        purchaseRequest.userId,
        undefined,
      );
    }

    if (!wallet) {
      const errMessage = 'User/Organization wallet not found. A wallet must be provisioned before payment.';
      console.error('[initiate-payment] Wallet not found for context:', { userId: purchaseRequest.userId, orgId: purchaseRequest.organizationId });
      // As per plan: "If no wallet exists, decide on creation strategy... or return an error."
      // Current StripePaymentAdapter (and this implementation) returns an error.
      return createErrorResponse(errMessage, 404, req);
    }
    const targetWalletId = wallet.walletId;
    console.log('[initiate-payment] Target wallet ID:', targetWalletId);
    
    // 5. Create payment_transactions Record
    let organizationIdForInsert: string | null = null;
    if (purchaseRequest.organizationId !== undefined && purchaseRequest.organizationId !== null) {
      organizationIdForInsert = purchaseRequest.organizationId;
    }

    let metadataJson: Database['public']['Tables']['payment_transactions']['Insert']['metadata_json'];
    if (hasMultiItemCart) {
      const multiMetadataJson: Database['public']['Tables']['payment_transactions']['Insert']['metadata_json'] = {
        itemId: itemId,
        quantity: purchaseRequest.quantity,
        requestedCurrency: purchaseRequest.currency,
        items: JSON.stringify(lineItems),
      };
      metadataJson = multiMetadataJson;
    } else {
      const singleMetadataJson: Database['public']['Tables']['payment_transactions']['Insert']['metadata_json'] = {
        itemId: itemId,
        quantity: purchaseRequest.quantity,
        requestedCurrency: purchaseRequest.currency,
      };
      metadataJson = singleMetadataJson;
    }
    if (purchaseRequest.metadata) {
      if (typeof metadataJson === 'object' && metadataJson !== null && !Array.isArray(metadataJson)) {
        for (const key in purchaseRequest.metadata) {
          if (Object.prototype.hasOwnProperty.call(purchaseRequest.metadata, key)) {
            const value = purchaseRequest.metadata[key];
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
              metadataJson[`user_${key}`] = value;
            } else {
              metadataJson[`user_${key}`] = String(value);
            }
          }
        }
      }
    }

    const paymentTransactionInsert: Database['public']['Tables']['payment_transactions']['Insert'] = {
      user_id: purchaseRequest.userId,
      organization_id: organizationIdForInsert,
      target_wallet_id: targetWalletId,
      payment_gateway_id: purchaseRequest.paymentGatewayId,
      status: 'PENDING',
      tokens_to_award: tokensToAward,
      amount_requested_fiat: amountForGateway,
      currency_requested_fiat: currencyForGateway,
      metadata_json: metadataJson,
    };

    const { data: paymentTxnData, error: paymentTxnError } = await adminClient
      .from('payment_transactions')
      .insert(paymentTransactionInsert)
      .select('id')
      .single();

    if (paymentTxnError || !paymentTxnData) {
      const errMessage = 'Failed to initialize payment record.';
      console.error('[initiate-payment] Error creating payment_transactions record:', paymentTxnError?.message);
      return createErrorResponse(errMessage, 500, req, paymentTxnError || undefined);
    }
    const internalPaymentId = paymentTxnData.id;
    console.log('[initiate-payment] Created payment_transactions record:', internalPaymentId);

    const request_origin: string | null = req.headers.get('origin');

    // 7. Build PaymentOrchestrationContext and call adapter
    let paymentOrchestrationContext: PaymentOrchestrationContext;
    if (hasMultiItemCart) {
      const multiPaymentOrchestrationContext: PaymentOrchestrationContext = {
        userId: purchaseRequest.userId,
        organizationId: purchaseRequest.organizationId,
        itemId: itemId,
        quantity: purchaseRequest.quantity,
        paymentGatewayId: purchaseRequest.paymentGatewayId,
        internalPaymentId: internalPaymentId,
        targetWalletId: targetWalletId,
        tokensToAward: tokensToAward,
        amountForGateway: amountForGateway,
        currencyForGateway: currencyForGateway,
        lineItems: lineItems,
        checkoutMode: checkoutMode,
        metadata: purchaseRequest.metadata,
      };
      paymentOrchestrationContext = multiPaymentOrchestrationContext;
    } else {
      const singlePaymentOrchestrationContext: PaymentOrchestrationContext = {
        userId: purchaseRequest.userId,
        organizationId: purchaseRequest.organizationId,
        itemId: itemId,
        quantity: purchaseRequest.quantity,
        paymentGatewayId: purchaseRequest.paymentGatewayId,
        internalPaymentId: internalPaymentId,
        targetWalletId: targetWalletId,
        tokensToAward: tokensToAward,
        amountForGateway: amountForGateway,
        currencyForGateway: currencyForGateway,
        metadata: purchaseRequest.metadata,
      };
      paymentOrchestrationContext = singlePaymentOrchestrationContext;
    }
    if (request_origin !== null) {
      paymentOrchestrationContext.request_origin = request_origin;
    }

    const adapter = getPaymentAdapterFn(purchaseRequest.paymentGatewayId, adminClient);

    if (!adapter) {
      const errMessage = `Payment gateway '${purchaseRequest.paymentGatewayId}' is not supported.`;
      console.error('[initiate-payment] No adapter found for gateway:', purchaseRequest.paymentGatewayId);
      if (typeof metadataJson === 'object' && metadataJson !== null && !Array.isArray(metadataJson)) {
        metadataJson.error_message = 'Invalid payment gateway';
        metadataJson.adapter_error_details = 'No suitable adapter found';
      }
      const unsupportedGatewayPaymentTransactionUpdate: Database['public']['Tables']['payment_transactions']['Update'] = {
        status: 'FAILED',
        metadata_json: metadataJson,
      };
      await adminClient.from('payment_transactions').update(unsupportedGatewayPaymentTransactionUpdate).eq('id', internalPaymentId);
      return createErrorResponse(errMessage, 400, req);
    }

    const initiationResult = await adapter.initiatePayment(paymentOrchestrationContext);

    // After getting the result from the adapter, update our transaction record with the gateway's transaction ID.
    if (initiationResult.success && initiationResult.paymentGatewayTransactionId) {
       // If adapter returns success but doesn't include its own transaction ID,
       // we might still want to log that or ensure our internal ID is prominent.
       // The current PaymentInitiationResult type includes transactionId (our internal)
       // and paymentGatewayTransactionId (adapter's).
       // If the adapter succeeded, our payment_transactions status is still 'PENDING'
       // It will be updated by the webhook.
    } else if (!initiationResult.success) {
      if (typeof metadataJson === 'object' && metadataJson !== null && !Array.isArray(metadataJson)) {
        metadataJson.error_message = 'Adapter initiation failed';
        let adapterErrorDetails: string = 'No additional details provided';
        if (initiationResult.error) {
          adapterErrorDetails = initiationResult.error;
        }
        metadataJson.adapter_error_details = adapterErrorDetails;
      }
      const failedPaymentTransactionUpdate: Database['public']['Tables']['payment_transactions']['Update'] = {
        status: 'FAILED',
        gateway_transaction_id: initiationResult.paymentGatewayTransactionId,
        metadata_json: metadataJson,
      };
      await adminClient
          .from('payment_transactions')
          .update(failedPaymentTransactionUpdate)
          .eq('id', internalPaymentId);
    }

    // 9. Return Response
    let responseStatus: number = 400;
    if (initiationResult.success) {
      responseStatus = 200;
    }
    return createSuccessResponse(initiationResult, responseStatus, req );

  } catch (error) {
    console.error('[initiate-payment] Unhandled error in serve handler:', error, (error instanceof Error ? error.stack : 'No stack available'));
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return createErrorResponse(message, 500, req, error );
  }
}

// Export the handler for testing and for Supabase to pick up (if it prefers named exports)
export { initiatePaymentHandler };

// Standard Deno entry point: Call the Deno server with the named handler.
// Supabase will typically use the default export or a specific configuration.
// For local development and direct Deno execution, this is how it's run.
serve(async (req: Request) => {
  // Initialize actual dependencies here for production runtime
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error('FATAL: Supabase environment variables SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY are not set.');
    return createErrorResponse('Server configuration error', 500, req);
  }

  const adminClient = createClient<Database>(
    supabaseUrl,
    serviceRoleKey,
    { auth: { persistSession: false } }
  );

  const createUserClientFn = (authHeader: string) => {
    return createClient<Database>(
      supabaseUrl,
      anonKey,
      { global: { headers: { Authorization: authHeader } } }
    );
  };

  // The getPaymentAdapter function is defined in this file's scope and uses the global stripe instance.
  // It will be passed directly.

  return initiatePaymentHandler(req, adminClient, createUserClientFn, getPaymentAdapter);
});

console.log('initiate-payment function script processed');
