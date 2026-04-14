import { updatePaymentTransaction, PaymentTransaction } from './stripe.updatePaymentTransaction.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import {
  createMockSupabaseClient,
  MockSupabaseDataConfig,
  MockSupabaseClientSetup,
} from '../../../supabase.mock.ts';
import { Database, TablesUpdate } from '../../../../types_db.ts';
import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assertSpyCalls } from 'jsr:@std/testing@0.225.1/mock';

const MOCK_TXN_ID = 'ptxn_test_update_001';
const MOCK_WALLET_ID = 'wlt_test_update_001';
const MOCK_USER_ID = 'usr_test_update_001';
const MOCK_EVENT_ID = 'evt_test_update_001';

const buildMockRow = (overrides: Partial<PaymentTransaction> = {}): PaymentTransaction => ({
  id: MOCK_TXN_ID,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  user_id: MOCK_USER_ID,
  organization_id: null,
  payment_gateway_id: 'stripe',
  gateway_transaction_id: 'ch_test_001',
  status: 'COMPLETED',
  target_wallet_id: MOCK_WALLET_ID,
  tokens_to_award: 100,
  amount_requested_fiat: 10,
  currency_requested_fiat: 'usd',
  amount_requested_crypto: null,
  currency_requested_crypto: null,
  metadata_json: null,
  ...overrides,
});

const setupClient = (config: MockSupabaseDataConfig): { client: SupabaseClient<Database>; mockSetup: MockSupabaseClientSetup } => {
  const mockSetup: MockSupabaseClientSetup = createMockSupabaseClient(undefined, config);
  return {
    client: mockSetup.client as unknown as SupabaseClient<Database>,
    mockSetup,
  };
};

Deno.test('updatePaymentTransaction', async (t) => {

  await t.step('returns the updated PaymentTransaction row on success', async () => {
    const row: PaymentTransaction = buildMockRow();
    const { client } = setupClient({
      genericMockResults: {
        payment_transactions: {
          update: { data: [row], error: null, count: 1, status: 200, statusText: 'OK' },
        },
      },
    });

    const result: PaymentTransaction | null = await updatePaymentTransaction(client, MOCK_TXN_ID, { status: 'FAILED' });

    assertEquals(result, row);
  });

  await t.step('always sets updated_at in the update payload', async () => {
    let capturedJson: string = '';
    const row: PaymentTransaction = buildMockRow();
    const { client } = setupClient({
      genericMockResults: {
        payment_transactions: {
          update: async (state) => {
            capturedJson = JSON.stringify(state.updateData);
            return { data: [row], error: null, count: 1, status: 200, statusText: 'OK' };
          },
        },
      },
    });

    await updatePaymentTransaction(client, MOCK_TXN_ID, { status: 'FAILED' });

    const payload: TablesUpdate<'payment_transactions'> = JSON.parse(capturedJson);
    assertExists(payload.updated_at, 'updated_at must be present in the update payload');
    assert(!isNaN(Date.parse(payload.updated_at!)), 'updated_at must be a valid ISO date string');
  });

  await t.step('does not modify metadata_json when stripeEventId is omitted', async () => {
    let capturedJson: string = '';
    const row: PaymentTransaction = buildMockRow();
    const { client } = setupClient({
      genericMockResults: {
        payment_transactions: {
          update: async (state) => {
            capturedJson = JSON.stringify(state.updateData);
            return { data: [row], error: null, count: 1, status: 200, statusText: 'OK' };
          },
        },
      },
    });

    await updatePaymentTransaction(client, MOCK_TXN_ID, { status: 'FAILED' });

    const payload: TablesUpdate<'payment_transactions'> = JSON.parse(capturedJson);
    assertEquals(payload.metadata_json, undefined, 'metadata_json must not be set when stripeEventId is omitted');
  });

  await t.step('creates stripe_event_ids when metadata_json is absent', async () => {
    let capturedJson: string = '';
    const row: PaymentTransaction = buildMockRow();
    const { client } = setupClient({
      genericMockResults: {
        payment_transactions: {
          update: async (state) => {
            capturedJson = JSON.stringify(state.updateData);
            return { data: [row], error: null, count: 1, status: 200, statusText: 'OK' };
          },
        },
      },
    });

    await updatePaymentTransaction(client, MOCK_TXN_ID, { status: 'FAILED' }, MOCK_EVENT_ID);

    const payload: TablesUpdate<'payment_transactions'> = JSON.parse(capturedJson);
    const meta: { stripe_event_ids?: string[] } = JSON.parse(JSON.stringify(payload.metadata_json));
    assertEquals(meta.stripe_event_ids, [MOCK_EVENT_ID]);
  });

  await t.step('creates stripe_event_ids when metadata_json is null', async () => {
    let capturedJson: string = '';
    const row: PaymentTransaction = buildMockRow();
    const { client } = setupClient({
      genericMockResults: {
        payment_transactions: {
          update: async (state) => {
            capturedJson = JSON.stringify(state.updateData);
            return { data: [row], error: null, count: 1, status: 200, statusText: 'OK' };
          },
        },
      },
    });

    await updatePaymentTransaction(client, MOCK_TXN_ID, { status: 'FAILED', metadata_json: null }, MOCK_EVENT_ID);

    const payload: TablesUpdate<'payment_transactions'> = JSON.parse(capturedJson);
    const meta: { stripe_event_ids?: string[] } = JSON.parse(JSON.stringify(payload.metadata_json));
    assertEquals(meta.stripe_event_ids, [MOCK_EVENT_ID]);
  });

  await t.step('creates stripe_event_ids when metadata_json is an array', async () => {
    let capturedJson: string = '';
    const row: PaymentTransaction = buildMockRow();
    const { client } = setupClient({
      genericMockResults: {
        payment_transactions: {
          update: async (state) => {
            capturedJson = JSON.stringify(state.updateData);
            return { data: [row], error: null, count: 1, status: 200, statusText: 'OK' };
          },
        },
      },
    });

    await updatePaymentTransaction(client, MOCK_TXN_ID, { status: 'FAILED', metadata_json: ['not', 'an', 'object'] }, MOCK_EVENT_ID);

    const payload: TablesUpdate<'payment_transactions'> = JSON.parse(capturedJson);
    const meta: { stripe_event_ids?: string[] } = JSON.parse(JSON.stringify(payload.metadata_json));
    assertEquals(meta.stripe_event_ids, [MOCK_EVENT_ID]);
  });

  await t.step('appends stripeEventId to existing stripe_event_ids array', async () => {
    let capturedJson: string = '';
    const row: PaymentTransaction = buildMockRow();
    const existingEventId: string = 'evt_existing_001';
    const { client } = setupClient({
      genericMockResults: {
        payment_transactions: {
          update: async (state) => {
            capturedJson = JSON.stringify(state.updateData);
            return { data: [row], error: null, count: 1, status: 200, statusText: 'OK' };
          },
        },
      },
    });

    await updatePaymentTransaction(
      client,
      MOCK_TXN_ID,
      { status: 'FAILED', metadata_json: { stripe_event_ids: [existingEventId] } },
      MOCK_EVENT_ID,
    );

    const payload: TablesUpdate<'payment_transactions'> = JSON.parse(capturedJson);
    const meta: { stripe_event_ids?: string[] } = JSON.parse(JSON.stringify(payload.metadata_json));
    assertEquals(meta.stripe_event_ids, [existingEventId, MOCK_EVENT_ID]);
  });

  await t.step('filters non-string values from stripe_event_ids before appending', async () => {
    let capturedJson: string = '';
    const row: PaymentTransaction = buildMockRow();
    const { client } = setupClient({
      genericMockResults: {
        payment_transactions: {
          update: async (state) => {
            capturedJson = JSON.stringify(state.updateData);
            return { data: [row], error: null, count: 1, status: 200, statusText: 'OK' };
          },
        },
      },
    });

    await updatePaymentTransaction(
      client,
      MOCK_TXN_ID,
      { status: 'FAILED', metadata_json: { stripe_event_ids: [42, null, 'evt_valid_001'] } },
      MOCK_EVENT_ID,
    );

    const payload: TablesUpdate<'payment_transactions'> = JSON.parse(capturedJson);
    const meta: { stripe_event_ids?: string[] } = JSON.parse(JSON.stringify(payload.metadata_json));
    assertEquals(meta.stripe_event_ids, ['evt_valid_001', MOCK_EVENT_ID]);
  });

  await t.step('creates stripe_event_ids when existing stripe_event_ids is not an array', async () => {
    let capturedJson: string = '';
    const row: PaymentTransaction = buildMockRow();
    const { client } = setupClient({
      genericMockResults: {
        payment_transactions: {
          update: async (state) => {
            capturedJson = JSON.stringify(state.updateData);
            return { data: [row], error: null, count: 1, status: 200, statusText: 'OK' };
          },
        },
      },
    });

    await updatePaymentTransaction(
      client,
      MOCK_TXN_ID,
      { status: 'FAILED', metadata_json: { stripe_event_ids: 'not_an_array' } },
      MOCK_EVENT_ID,
    );

    const payload: TablesUpdate<'payment_transactions'> = JSON.parse(capturedJson);
    const meta: { stripe_event_ids?: string[] } = JSON.parse(JSON.stringify(payload.metadata_json));
    assertEquals(meta.stripe_event_ids, [MOCK_EVENT_ID]);
  });

  await t.step('does not duplicate stripeEventId already in stripe_event_ids (idempotency)', async () => {
    let capturedJson: string = '';
    const row: PaymentTransaction = buildMockRow();
    const { client } = setupClient({
      genericMockResults: {
        payment_transactions: {
          update: async (state) => {
            capturedJson = JSON.stringify(state.updateData);
            return { data: [row], error: null, count: 1, status: 200, statusText: 'OK' };
          },
        },
      },
    });

    await updatePaymentTransaction(
      client,
      MOCK_TXN_ID,
      { status: 'FAILED', metadata_json: { stripe_event_ids: [MOCK_EVENT_ID] } },
      MOCK_EVENT_ID,
    );

    const payload: TablesUpdate<'payment_transactions'> = JSON.parse(capturedJson);
    const meta: { stripe_event_ids?: string[] } = JSON.parse(JSON.stringify(payload.metadata_json));
    assertEquals(meta.stripe_event_ids, [MOCK_EVENT_ID]);
  });

  await t.step('preserves other metadata keys when appending stripeEventId', async () => {
    let capturedJson: string = '';
    const row: PaymentTransaction = buildMockRow();
    const { client } = setupClient({
      genericMockResults: {
        payment_transactions: {
          update: async (state) => {
            capturedJson = JSON.stringify(state.updateData);
            return { data: [row], error: null, count: 1, status: 200, statusText: 'OK' };
          },
        },
      },
    });

    await updatePaymentTransaction(
      client,
      MOCK_TXN_ID,
      { status: 'FAILED', metadata_json: { type: 'RENEWAL_FAILED', stripe_event_ids: [] } },
      MOCK_EVENT_ID,
    );

    const payload: TablesUpdate<'payment_transactions'> = JSON.parse(capturedJson);
    const meta: { type?: string; stripe_event_ids?: string[] } = JSON.parse(JSON.stringify(payload.metadata_json));
    assertEquals(meta.type, 'RENEWAL_FAILED');
    assertEquals(meta.stripe_event_ids, [MOCK_EVENT_ID]);
  });

  await t.step('returns null when Supabase returns an error', async () => {
    const dbError: Error = new Error('DB connection failed');
    const { client } = setupClient({
      genericMockResults: {
        payment_transactions: {
          update: { data: null, error: dbError, count: 0, status: 500, statusText: 'Internal Server Error' },
        },
      },
    });

    const result: PaymentTransaction | null = await updatePaymentTransaction(client, MOCK_TXN_ID, { status: 'FAILED' });

    assertEquals(result, null);
  });

  await t.step('does not throw when Supabase returns an error', async () => {
    const { client } = setupClient({
      genericMockResults: {
        payment_transactions: {
          update: { data: null, error: new Error('unexpected DB error'), count: 0, status: 500, statusText: 'Internal Server Error' },
        },
      },
    });

    let threw: boolean = false;
    try {
      await updatePaymentTransaction(client, MOCK_TXN_ID, { status: 'FAILED' });
    } catch {
      threw = true;
    }
    assertEquals(threw, false, 'updatePaymentTransaction must not throw on DB error');
  });

  await t.step('executes the correct Supabase query chain', async () => {
    const row: PaymentTransaction = buildMockRow();
    const { client, mockSetup } = setupClient({
      genericMockResults: {
        payment_transactions: {
          update: { data: [row], error: null, count: 1, status: 200, statusText: 'OK' },
        },
      },
    });

    await updatePaymentTransaction(client, MOCK_TXN_ID, { status: 'FAILED' });

    assertSpyCalls(mockSetup.client.fromSpy, 1);
    assertEquals(mockSetup.client.fromSpy.calls[0].args[0], 'payment_transactions');

    const builders = mockSetup.client.getHistoricBuildersForTable('payment_transactions');
    assertExists(builders, 'builder for payment_transactions must exist');
    assertEquals(builders.length, 1);

    const builder = builders[0];
    assertSpyCalls(builder.methodSpies.update, 1);
    assertSpyCalls(builder.methodSpies.eq, 1);
    assertEquals(builder.methodSpies.eq.calls[0].args[0], 'id');
    assertEquals(builder.methodSpies.eq.calls[0].args[1], MOCK_TXN_ID);
    assertSpyCalls(builder.methodSpies.select, 1);
    assertSpyCalls(builder.methodSpies.single, 1);
  });

});
