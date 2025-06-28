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
  PaymentInitiationResult,
  PaymentOrchestrationContext,
  IPaymentGatewayAdapter,
} from '../_shared/types/payment.types.ts';
import { TokenWalletService } from '../_shared/services/tokenWalletService.ts';
import { StripePaymentAdapter } from '../_shared/adapters/stripe/stripePaymentAdapter.ts';
import { Database } from '../types_db.ts'; // Assuming this is the path for your DB types

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
  apiVersion: '2023-10-16', // Use a fixed API version
  httpClient: Stripe.createFetchHttpClient(), // Required for Deno
});

// --- Adapter Factory (Simple version for now) ---
function getPaymentAdapter(
  gatewayId: string,
  adminSupabaseClient: SupabaseClient<Database>,
  // userTokenWalletService: TokenWalletService, // No longer pass user-scoped service here
  // Stripe instance could be passed here if it wasn't global or if adapter needed a specific instance
): IPaymentGatewayAdapter | null {
  if (gatewayId === 'stripe') {
    const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET');
    if (!stripeWebhookSecret) {
      console.error('STRIPE_WEBHOOK_SIGNING_SECRET is not set for StripePaymentAdapter.');
      // Potentially return null or throw if this is critical for the adapter's function beyond webhooks
    }
    // Instantiate TokenWalletService with admin client for the adapter's use (e.g., in webhooks)
    const adminTokenWalletService = new TokenWalletService(adminSupabaseClient);

    // The global `stripe` instance is used by StripePaymentAdapter constructor
    return new StripePaymentAdapter(stripe, adminSupabaseClient, adminTokenWalletService, stripeWebhookSecret || 'dummy_secret_for_initiate_only');
  }
  // Add other gateways here:
  // else if (gatewayId === 'coinbase') {
  //   return new CoinbasePaymentAdapter(...);
  // }
  return null;
}

// Define the main request handler logic
async function initiatePaymentHandler(
  req: Request,
  adminClient: SupabaseClient<Database>,
  createUserClientFn: (authHeader: string) => SupabaseClient<Database>,
  getPaymentAdapterFn: (
    gatewayId: string,
    adminSupabaseClient: SupabaseClient<Database>
    // adminTokenWalletService: TokenWalletService // This was an incorrect thought, getPaymentAdapterFn should create its own adminTWS
  ) => IPaymentGatewayAdapter | null
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
      return createErrorResponse('Authentication failed', 401, req, userError || undefined);
    }
    console.log('[initiate-payment] User authenticated:', user.id);

    // 2. Parse PurchaseRequest
    if (!req.body) {
        return createErrorResponse('Request body is missing', 400, req);
    }
    const purchaseRequest = (await req.json()) as PurchaseRequest;
    console.log('[initiate-payment] Parsed PurchaseRequest:', purchaseRequest);

    if (!purchaseRequest.itemId || !purchaseRequest.paymentGatewayId || !purchaseRequest.currency || purchaseRequest.quantity == null) {
        return createErrorResponse('Invalid PurchaseRequest body: missing required fields', 400, req);
    }
    purchaseRequest.userId = user.id; // Ensure userId from authenticated user is used

    // 3. Generic Item Details Extraction (from subscription_plans)
    const { data: planData, error: planError } = await adminClient
      .from('subscription_plans')
      .select('stripe_price_id, item_id_internal, tokens_to_award, amount, currency')  // Ensure stripe_price_id is also selected for consistency, and item_id_internal is still useful
      .eq('stripe_price_id', purchaseRequest.itemId) // Corrected to query by stripe_price_id
      .eq('active', true)
      .single();

    if (planError) {
      console.error('[initiate-payment] Error fetching plan data for item:', purchaseRequest.itemId, 'Details:', planError.message);
      // Check if the error is specifically a "not found" error from .single()
      if (planError.code === 'PGRST116') { // PGRST116: "Query returned no rows"
        const errMessage = `Item ID ${purchaseRequest.itemId} not found or is not active.`;
        return createErrorResponse(errMessage, 404, req, planError);
      }
      // For other database errors during plan fetch
      const errStatus = (typeof planError === 'object' && 
                         planError !== null && 
                         'status' in planError && 
                         typeof (planError as { status?: unknown }).status === 'number') 
                         ? (planError as { status: number }).status 
                         : 500;
      return createErrorResponse(planError.message || 'Failed to retrieve item details due to a database error.', errStatus, req, planError);
    }

    // If there was no DB error, but planData is still null (e.g. .maybeSingle() returning null without error, or unexpected state)
    if (!planData) {
      const errMessage = `Item ID ${purchaseRequest.itemId} not found or is not active (no preceding DB error, but no data returned for item):`;
      console.error('[initiate-payment] Plan not found or inactive (no preceding DB error, but no data returned for item):', purchaseRequest.itemId);
      return createErrorResponse(errMessage, 404, req);
    }
    
    // Original check for incomplete data - this should come after validating planData exists
    if (planData.tokens_to_award == null || planData.amount == null || !planData.currency) {
        const errMessage = 'Service offering configuration error for the selected item.';
        console.error('[initiate-payment] Plan data is incomplete for item:', purchaseRequest.itemId, planData);
        return createErrorResponse(errMessage, 500, req);
    }
    console.log('[initiate-payment] Fetched plan data:', planData);

    const tokensToAward = planData.tokens_to_award;
    const amountForGateway = planData.amount * purchaseRequest.quantity; // Assuming planData.amount is per unit
    const currencyForGateway = planData.currency.toLowerCase(); // Ensure consistent casing

    // Validate requested currency against plan currency
    if (purchaseRequest.currency.toLowerCase() !== currencyForGateway) {
        const errMessage = 'Requested currency does not match item currency.';
        console.error(`[initiate-payment] Mismatch between requested currency (${purchaseRequest.currency}) and plan currency (${currencyForGateway}) for item ${purchaseRequest.itemId}`);
        return createErrorResponse(errMessage, 400, req);
    }
    
    // 4. Target Wallet Identification
    // The TokenWalletService uses the user-specific Supabase client passed to its constructor
    // to perform operations within the user's RLS context.
    const tokenWalletService = new TokenWalletService(userClient); // No 'as any' cast needed if types align
    const wallet = await tokenWalletService.getWalletForContext(purchaseRequest.userId, purchaseRequest.organizationId ?? undefined);

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
    const paymentTxMetadata: Record<string, string | number | boolean | null | undefined> = {
        itemId: purchaseRequest.itemId,
        quantity: purchaseRequest.quantity,
        requestedCurrency: purchaseRequest.currency,
    };
    if (purchaseRequest.metadata) {
        for (const key in purchaseRequest.metadata) {
            if (Object.prototype.hasOwnProperty.call(purchaseRequest.metadata, key)) {
                const value = purchaseRequest.metadata[key];
                if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
                    paymentTxMetadata[`user_${key}`] = value;
                } else {
                    paymentTxMetadata[`user_${key}`] = String(value); // Convert other types to string
                }
            }
        }
    }

    const { data: paymentTxnData, error: paymentTxnError } = await adminClient
      .from('payment_transactions')
      .insert({
        user_id: purchaseRequest.userId,
        organization_id: purchaseRequest.organizationId ?? null,
        target_wallet_id: targetWalletId,
        payment_gateway_id: purchaseRequest.paymentGatewayId,
        status: 'PENDING', // Initial status
        tokens_to_award: tokensToAward, // From planData
        amount_requested_fiat: amountForGateway, // Total amount for the quantity
        currency_requested_fiat: currencyForGateway, // From planData
        metadata_json: paymentTxMetadata,
      })
      .select('id')
      .single();

    if (paymentTxnError || !paymentTxnData) {
      const errMessage = 'Failed to initialize payment record.';
      console.error('[initiate-payment] Error creating payment_transactions record:', paymentTxnError?.message);
      return createErrorResponse(errMessage, 500, req, paymentTxnError || undefined);
    }
    const internalPaymentId = paymentTxnData.id;
    console.log('[initiate-payment] Created payment_transactions record:', internalPaymentId);

    // 6. Adapter Factory/Selection & Instantiation
    // The TokenWalletService is passed to the adapter, but it should be initialized
    // with the admin client if it needs to perform privileged operations during payment that the user cannot.
    // However, TokenWalletService's recordTransaction is called by the *webhook handler* typically,
    // which runs with admin/service context. For initiatePayment, the TokenWalletService instance
    // here was primarily for getWalletForContext (which uses user client).
    // Let's ensure adapters get an admin-context-capable TokenWalletService if they need to create wallets or do other admin tasks.
    // For now, StripePaymentAdapter gets the user-context one, as its initiatePayment (after refactor) won't call TokenWalletService.
    // const adapter = getPaymentAdapterFn(purchaseRequest.paymentGatewayId, adminClient, tokenWalletService); // OLD CALL

    // Corrected: getPaymentAdapterFn now only needs adminClient to construct its own admin-scoped services if needed by adapter
    const adapter = getPaymentAdapterFn(purchaseRequest.paymentGatewayId, adminClient);

    if (!adapter) {
      const errMessage = `Payment gateway '${purchaseRequest.paymentGatewayId}' is not supported.`;
      console.error('[initiate-payment] No adapter found for gateway:', purchaseRequest.paymentGatewayId);
      const updatedMetadata: Record<string, string | number | boolean | null | undefined> = { ...paymentTxMetadata, error_message: 'Invalid payment gateway', adapter_error_details: 'No suitable adapter found' };
      await adminClient.from('payment_transactions').update({ status: 'FAILED', metadata_json: updatedMetadata }).eq('id', internalPaymentId);
      return createErrorResponse(errMessage, 400, req);
    }
    console.log('[initiate-payment] Using adapter for gateway:', adapter.gatewayId);

    // 7. Prepare PaymentOrchestrationContext
    const orchestrationContext: PaymentOrchestrationContext = {
      // Fields from original PurchaseRequest that adapter might still need
      userId: purchaseRequest.userId,
      organizationId: purchaseRequest.organizationId,
      itemId: purchaseRequest.itemId, 
      quantity: purchaseRequest.quantity,
      paymentGatewayId: purchaseRequest.paymentGatewayId,
      metadata: purchaseRequest.metadata,
      // Resolved information
      internalPaymentId: internalPaymentId,
      targetWalletId: targetWalletId,
      tokensToAward: tokensToAward,
      amountForGateway: amountForGateway,
      currencyForGateway: currencyForGateway,
    };
    console.log('[initiate-payment] Prepared PaymentOrchestrationContext:', orchestrationContext);

    // 8. Call Adapter's initiatePayment
    const initiationResult: PaymentInitiationResult = await adapter.initiatePayment(orchestrationContext);
    console.log('[initiate-payment] Received PaymentInitiationResult from adapter:', initiationResult);

    // If the adapter failed, it's possible the payment_transactions record should be updated
    if (!initiationResult.success) {
        const updatedMetadata: Record<string, string | number | boolean | null | undefined> = { ...paymentTxMetadata, error_message: 'Adapter failed to initiate payment', adapter_error_details: initiationResult.error };
        await adminClient
            .from('payment_transactions')
            .update({ 
                status: 'FAILED', 
                metadata_json: updatedMetadata,
            })
            .eq('id', internalPaymentId);
         console.log('[initiate-payment] Updated payment_transaction to FAILED due to adapter failure.');
    } else {
       // If adapter returns success but doesn't include its own transaction ID,
       // we might still want to log that or ensure our internal ID is prominent.
       // The current PaymentInitiationResult type includes transactionId (our internal)
       // and paymentGatewayTransactionId (adapter's).
       // If the adapter succeeded, our payment_transactions status is still 'PENDING'
       // It will be updated by the webhook.
    }

    // 9. Return Response
    return createSuccessResponse(initiationResult, initiationResult.success ? 200 : 400, req );

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
