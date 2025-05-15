import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { handleCorsPreflightRequest, baseCorsHeaders } from '../_shared/cors-headers.ts';
import { createSupabaseAdminClient } from '../_shared/auth.ts';
import { TokenWalletService } from '../_shared/services/tokenWalletService.ts';
import { ITokenWalletService } from '../_shared/types/tokenWallet.types.ts';
import { getPaymentAdapter } from '../_shared/adapters/adapterFactory.ts';
import { PaymentConfirmation, IPaymentGatewayAdapter } from '../_shared/types/payment.types.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import type { Database } from '../types_db.ts';

console.log('[/webhooks] Edge Function initialized');

// Type for the payment adapter factory function, exported for tests
export type PaymentAdapterFactoryFn = (
  source: string,
  adminClient: SupabaseClient<Database>,
  tokenWalletService: ITokenWalletService
) => IPaymentGatewayAdapter | null;

// Define the dependencies structure for the core logic, exported for tests
export interface WebhookHandlerDependencies {
  adminClient: SupabaseClient<Database>;
  tokenWalletService: ITokenWalletService;
  paymentAdapterFactory: PaymentAdapterFactoryFn;
  getEnv: (key: string) => string | undefined;
}

// Core logic extracted, depends on abstractions
export async function handleWebhookRequestLogic(
  req: Request,
  deps: WebhookHandlerDependencies,
): Promise<Response> {
  const url = new URL(req.url);
  const pathSegments = url.pathname.split('/');
  const source = pathSegments.length > 2 ? pathSegments[2]?.toLowerCase() : undefined;

  if (req.method !== 'POST') {
    console.warn(`[/webhooks] Method not allowed: ${req.method} for source: ${source}`);
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...baseCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!source) {
    console.warn('[/webhooks] Webhook source not specified in URL.');
    return new Response(JSON.stringify({ error: 'Webhook source not specified in URL path (e.g., /webhooks/stripe)' }), {
      status: 400,
      headers: { ...baseCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(`[/webhooks] Received POST for source: ${source}`);

  try {
    const adapter = deps.paymentAdapterFactory(source, deps.adminClient, deps.tokenWalletService);

    if (!adapter) {
      console.warn(`[/webhooks] No adapter found for source: ${source}`);
      return new Response(JSON.stringify({ error: `Webhook source '${source}' not supported.` }), {
        status: 404,
        headers: { ...baseCorsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let signature: string | undefined | null = null;

    if (source === 'stripe') {
      signature = req.headers.get('stripe-signature');
    } else {
      console.warn(`[/webhooks] Signature header retrieval logic currently specific to Stripe. Source: ${source} may not be handled correctly if it requires a signature.`);
    }

    const rawBody = await req.text();
    const confirmation: PaymentConfirmation = await adapter.handleWebhook(rawBody, signature || undefined);

    if (confirmation.success) {
      console.log(`[/webhooks/${source}] Webhook processed successfully. Transaction ID: ${confirmation.transactionId}`);
      return new Response(JSON.stringify({ message: 'Webhook processed', transactionId: confirmation.transactionId }), {
        status: 200,
        headers: { ...baseCorsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      console.error(`[/webhooks/${source}] Webhook processing failed by adapter: ${confirmation.error}`);
      return new Response(JSON.stringify({ error: confirmation.error || 'Webhook processing failed by adapter' }), {
        status: 400,
        headers: { ...baseCorsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[/webhooks/${source}] Internal Server Error:`, errorMessage, error);
    return new Response(JSON.stringify({ error: 'Internal Server Error during webhook processing.' }), {
      status: 500,
      headers: { ...baseCorsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// Dependencies for webhookRouterHandler itself
export type WebhookRouterDependencies = {
  corsHandler: (req: Request) => Response | null;
  adminClientFactory: () => SupabaseClient<Database>;
  tokenWalletServiceFactory: new (adminClient: SupabaseClient<Database>) => ITokenWalletService;
  paymentAdapterFactory: PaymentAdapterFactoryFn;
  envGetter: (key: string) => string | undefined;
};

// This is the main handler for Deno serve, it composes dependencies.
export async function webhookRouterHandler(
  req: Request,
  routerDeps: WebhookRouterDependencies
): Promise<Response> {
  const corsResponse = routerDeps.corsHandler(req);
  if (corsResponse) {
    return corsResponse;
  }

  const adminClient = routerDeps.adminClientFactory();
  const tokenWalletService = new routerDeps.tokenWalletServiceFactory(adminClient);

  const logicDependencies: WebhookHandlerDependencies = {
    adminClient,
    tokenWalletService,
    paymentAdapterFactory: routerDeps.paymentAdapterFactory,
    getEnv: routerDeps.envGetter,
  };

  return handleWebhookRequestLogic(req, logicDependencies);
}

// The serve function uses the webhookRouterHandler with real dependencies.
serve((req: Request) => webhookRouterHandler(req, {
  corsHandler: handleCorsPreflightRequest,
  adminClientFactory: () => createSupabaseAdminClient(),
  tokenWalletServiceFactory: TokenWalletService,
  paymentAdapterFactory: getPaymentAdapter,
  envGetter: Deno.env.get
})); 