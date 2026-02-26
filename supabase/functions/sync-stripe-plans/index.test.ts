import { assertEquals, assert } from 'jsr:@std/assert@0.225.3';
import { assertSpyCalls, spy, type Spy } from 'jsr:@std/testing@0.225.1/mock';
import {
  handler,
  defaultDeps,
  type SyncStripePlansHandlerDeps,
} from './index.ts';
import type { SyncStripePlansResult } from '../_shared/types/sync_plans.types.ts';

function createMockDeps(overrides: Partial<SyncStripePlansHandlerDeps> = {}): SyncStripePlansHandlerDeps {
  const createErrorResponseSpy = spy((
    message: string,
    status: number,
    _req: Request,
    _error?: unknown
  ): Response => new Response(JSON.stringify({ error: message }), { status }));
  const createSuccessResponseSpy = spy((
    data: unknown,
    status: number,
    _req: Request
  ): Response => new Response(JSON.stringify(data), { status }));
  const corsHandlerSpy = spy(() => null);

  return {
    ...defaultDeps,
    getEnv: spy((key: string) => {
      if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-service-role-key';
      if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
      if (key === 'STRIPE_SECRET_TEST_KEY') return 'sk_test_mock';
      if (key === 'STRIPE_TEST_WEBHOOK_SECRET') return 'whsec_test_mock';
      if (key === 'STRIPE_SECRET_LIVE_KEY') return 'sk_live_mock';
      if (key === 'STRIPE_LIVE_WEBHOOK_SECRET') return 'whsec_live_mock';
      return undefined;
    }),
    createSupabaseAdminClient: spy(() => ({} as ReturnType<typeof defaultDeps.createSupabaseAdminClient>)),
    syncAllPrices: spy(async (): Promise<SyncStripePlansResult> => ({
      success: true,
      synced: 2,
      failed: 0,
      errors: [],
    })),
    handleCorsPreflightRequest: corsHandlerSpy,
    createErrorResponse: createErrorResponseSpy,
    createSuccessResponse: createSuccessResponseSpy,
    ...overrides,
  };
}

Deno.test('sync-stripe-plans handler', async (t) => {
  await t.step('returns 405 for non-POST requests', async () => {
    const deps = createMockDeps();
    const req = new Request('http://localhost/sync-stripe-plans', { method: 'GET' });

    const res = await handler(req, deps);

    assertEquals(res.status, 405);
    assertSpyCalls(deps.createErrorResponse as Spy, 1);
    assertEquals((deps.createErrorResponse as Spy).calls[0].args[0], 'Method Not Allowed');
    assertEquals((deps.createErrorResponse as Spy).calls[0].args[1], 405);
  });

  await t.step('returns 401 when Authorization Bearer header is missing', async () => {
    const deps = createMockDeps();
    const req = new Request('http://localhost/sync-stripe-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isTestMode: true }),
    });

    const res = await handler(req, deps);

    assertEquals(res.status, 401);
    assertSpyCalls(deps.createErrorResponse as Spy, 1);
    assertEquals((deps.createErrorResponse as Spy).calls[0].args[0], 'Unauthorized');
  });

  await t.step('returns 401 when Bearer token does not match service role key', async () => {
    const deps = createMockDeps();
    const req = new Request('http://localhost/sync-stripe-plans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong-token',
      },
      body: JSON.stringify({ isTestMode: true }),
    });

    const res = await handler(req, deps);

    assertEquals(res.status, 401);
    assertEquals((deps.createErrorResponse as Spy).calls[0].args[0], 'Unauthorized');
  });

  await t.step('returns 400 when Content-Type is not application/json', async () => {
    const deps = createMockDeps();
    const req = new Request('http://localhost/sync-stripe-plans', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-service-role-key' },
      body: JSON.stringify({ isTestMode: true }),
    });

    const res = await handler(req, deps);

    assertEquals(res.status, 400);
    assertEquals((deps.createErrorResponse as Spy).calls[0].args[0], 'Content-Type must be application/json');
  });

  await t.step('returns 400 when body is invalid JSON', async () => {
    const deps = createMockDeps();
    const req = new Request('http://localhost/sync-stripe-plans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-service-role-key',
      },
      body: 'not valid json',
    });

    const res = await handler(req, deps);

    assertEquals(res.status, 400);
    assertEquals((deps.createErrorResponse as Spy).calls[0].args[0], 'Request body must be valid JSON');
  });

  await t.step('returns 400 when body is missing isTestMode', async () => {
    const deps = createMockDeps();
    const req = new Request('http://localhost/sync-stripe-plans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-service-role-key',
      },
      body: JSON.stringify({}),
    });

    const res = await handler(req, deps);

    assertEquals(res.status, 400);
    assertEquals((deps.createErrorResponse as Spy).calls[0].args[0], 'Request body must include isTestMode (boolean)');
  });

  await t.step('returns 500 when test mode and STRIPE_SECRET_TEST_KEY is missing', async () => {
    const deps = createMockDeps({
      getEnv: spy((key: string) => {
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-service-role-key';
        if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
        if (key === 'STRIPE_TEST_WEBHOOK_SECRET') return 'whsec_test_mock';
        return undefined;
      }),
    });
    const req = new Request('http://localhost/sync-stripe-plans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-service-role-key',
      },
      body: JSON.stringify({ isTestMode: true }),
    });

    const res = await handler(req, deps);

    assertEquals(res.status, 500);
    assert(
      (deps.createErrorResponse as Spy).calls[0].args[0].includes('STRIPE_SECRET_TEST_KEY') ||
      (deps.createErrorResponse as Spy).calls[0].args[0].includes('STRIPE_TEST_WEBHOOK_SECRET')
    );
  });

  await t.step('returns 500 when SUPABASE_URL is missing', async () => {
    const deps = createMockDeps({
      getEnv: spy((key: string) => {
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-service-role-key';
        if (key === 'STRIPE_SECRET_TEST_KEY') return 'sk_test_mock';
        if (key === 'STRIPE_TEST_WEBHOOK_SECRET') return 'whsec_test_mock';
        return undefined;
      }),
    });
    const req = new Request('http://localhost/sync-stripe-plans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-service-role-key',
      },
      body: JSON.stringify({ isTestMode: true }),
    });

    const res = await handler(req, deps);

    assertEquals(res.status, 500);
    assertEquals((deps.createErrorResponse as Spy).calls[0].args[0], 'SUPABASE_URL must be set');
  });

  await t.step('returns CORS response when OPTIONS request', async () => {
    const corsResponse = new Response(null, { status: 204 });
    const deps = createMockDeps({
      handleCorsPreflightRequest: spy(() => corsResponse),
    });
    const req = new Request('http://localhost/sync-stripe-plans', { method: 'OPTIONS' });

    const res = await handler(req, deps);

    assertEquals(res, corsResponse);
    assertSpyCalls(deps.handleCorsPreflightRequest as Spy, 1);
    assertSpyCalls(deps.createErrorResponse as Spy, 0);
  });

  await t.step('calls syncAllPrices and returns 200 with result on success', async () => {
    const deps = createMockDeps();
    const req = new Request('http://localhost/sync-stripe-plans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-service-role-key',
      },
      body: JSON.stringify({ isTestMode: true }),
    });

    const res = await handler(req, deps);

    assertEquals(res.status, 200);
    assertSpyCalls(deps.syncAllPrices as Spy, 1);
    assertSpyCalls(deps.createSuccessResponse as Spy, 1);
    const body: SyncStripePlansResult = await res.json();
    assertEquals(body.success, true);
    assertEquals(body.synced, 2);
    assertEquals(body.failed, 0);
  });

  await t.step('returns 500 when syncAllPrices throws', async () => {
    const deps = createMockDeps({
      syncAllPrices: spy(async () => {
        throw new Error('Sync failed');
      }),
    });
    const req = new Request('http://localhost/sync-stripe-plans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-service-role-key',
      },
      body: JSON.stringify({ isTestMode: true }),
    });

    const res = await handler(req, deps);

    assertEquals(res.status, 500);
    assertEquals((deps.createErrorResponse as Spy).calls[0].args[0], 'Sync failed: Sync failed');
  });
});
