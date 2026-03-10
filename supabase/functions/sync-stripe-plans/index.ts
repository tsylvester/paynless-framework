// This function is used to sync all prices from Stripe to the database.
// It is primarily expected to be invoked by CLI (curl or supabase/scripts/test_sync_stripe_plans.ps1).
// With functions served locally: curl -X POST 'http://localhost:54321/functions/v1/sync-stripe-plans' \
//   -H 'Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>' -H 'Content-Type: application/json' \
//   -d '{"isTestMode":true}' for dev, or -d '{"isTestMode":false}' for prod.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'npm:stripe';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import {
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/cors-headers.ts';
import { createSupabaseAdminClient } from '../_shared/auth.ts';
import { logger } from '../_shared/logger.ts';
import { syncAllPrices } from './syncAllPrices.ts';
import type { SyncStripePlansResult, SyncStripePlansRequest } from '../_shared/types/sync_plans.types.ts';
import type { ProductPriceHandlerContext } from '../_shared/stripe.mock.ts';

export interface SyncStripePlansHandlerDeps {
  getEnv: (key: string) => string | undefined;
  createSupabaseAdminClient: () => SupabaseClient;
  syncAllPrices: (context: ProductPriceHandlerContext) => Promise<SyncStripePlansResult>;
  handleCorsPreflightRequest: (req: Request) => Response | null;
  createErrorResponse: (message: string, status: number, req: Request, error?: unknown) => Response;
  createSuccessResponse: (data: unknown, status: number, req: Request) => Response;
}

export const defaultDeps: SyncStripePlansHandlerDeps = {
  getEnv: Deno.env.get,
  createSupabaseAdminClient,
  syncAllPrices,
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
};

async function parseIsTestMode(req: Request): Promise<{ isTestMode: boolean } | { error: string }> {
  const contentType = req.headers.get('Content-Type');
  if (!contentType || !contentType.includes('application/json')) {
    return { error: 'Content-Type must be application/json' };
  }

  let body: SyncStripePlansRequest;
  try {
    body = await req.clone().json();
  } catch {
    return { error: 'Request body must be valid JSON' };
  }

  if (typeof body.isTestMode !== 'boolean') {
    return { error: 'Request body must include isTestMode (boolean)' };
  }

  return { isTestMode: body.isTestMode };
}

function verifyServiceRoleAuth(req: Request, getEnv: (key: string) => string | undefined): boolean {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.slice(7);
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  return typeof serviceRoleKey === 'string' && token === serviceRoleKey;
}

export async function handler(
  req: Request,
  deps: SyncStripePlansHandlerDeps = defaultDeps
): Promise<Response> {
  const {
    getEnv,
    createSupabaseAdminClient: createAdminClient,
    syncAllPrices: doSyncAllPrices,
    handleCorsPreflightRequest: corsHandler,
    createErrorResponse: errorResponse,
    createSuccessResponse: successResponse,
  } = deps;

  const corsResponse = corsHandler(req);
  if (corsResponse) {
    return corsResponse;
  }

  if (req.method !== 'POST') {
    return errorResponse('Method Not Allowed', 405, req);
  }

  if (!verifyServiceRoleAuth(req, getEnv)) {
    return errorResponse('Unauthorized', 401, req);
  }

  const modeResult = await parseIsTestMode(req);
  if ('error' in modeResult) {
    return errorResponse(modeResult.error, 400, req);
  }
  const isTestMode = modeResult.isTestMode;

  let stripeSecretKey: string;
  let stripeWebhookSecret: string;

  if (isTestMode) {
    const key = getEnv('STRIPE_SECRET_TEST_KEY');
    const secret = getEnv('STRIPE_TEST_WEBHOOK_SECRET');
    if (!key || !secret) {
      return errorResponse(
        'Test mode: STRIPE_SECRET_TEST_KEY or STRIPE_TEST_WEBHOOK_SECRET not configured',
        500,
        req
      );
    }
    stripeSecretKey = key;
    stripeWebhookSecret = secret;
  } else {
    const key = getEnv('STRIPE_SECRET_LIVE_KEY');
    const secret = getEnv('STRIPE_LIVE_WEBHOOK_SECRET');
    if (!key || !secret) {
      return errorResponse(
        'Live mode: STRIPE_SECRET_LIVE_KEY or STRIPE_LIVE_WEBHOOK_SECRET not configured',
        500,
        req
      );
    }
    stripeSecretKey = key;
    stripeWebhookSecret = secret;
  }

  const baseUrl = getEnv('SUPABASE_URL');
  if (!baseUrl) {
    return errorResponse('SUPABASE_URL must be set', 500, req);
  }
  const functionsUrlResolved = `${baseUrl}/functions/v1`;

  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-03-31.basil' });
  const supabaseClient = createAdminClient();

  const context: ProductPriceHandlerContext = {
    stripe,
    supabaseClient,
    logger,
    functionsUrl: functionsUrlResolved,
    stripeWebhookSecret,
  };

  try {
    const result: SyncStripePlansResult = await doSyncAllPrices(context);
    return successResponse(result, result.success ? 200 : 500, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[sync-stripe-plans] Sync failed: ${message}`, { error: err });
    return errorResponse(`Sync failed: ${message}`, 500, req, err);
  }
}

serve((req) => handler(req, defaultDeps));
