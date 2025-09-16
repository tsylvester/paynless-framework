import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { createClient } from '@supabase/supabase-js';
import { initializeApiClient, _resetApiClient } from '@paynless/api';
import { server } from '../../api/src/setupTests';
import { useDialecticStore } from './dialecticStore';

// Mock Supabase to control token for ApiClient used under the hood
vi.mock('@supabase/supabase-js', () => {
  const mockClient = {
    auth: { getSession: vi.fn() },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn(), unsubscribe: vi.fn() })),
    removeChannel: vi.fn(),
  };
  return {
    createClient: vi.fn(() => mockClient),
    SupabaseClient: vi.fn(),
  };
});

const MOCK_SUPABASE_URL = 'http://mock-supabase.co';
const MOCK_ANON_KEY = 'mock-anon-key';
const MOCK_FUNCTIONS_URL = `${MOCK_SUPABASE_URL}/functions/v1`;
const MOCK_ACCESS_TOKEN = 'mock-test-access-token-local';

describe('DialecticStore (integration) - exportDialecticProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetApiClient();
    initializeApiClient({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });

    const mockSupabaseClient = (createClient as unknown as { mock: { results: { value: any }[] } }).mock.results[0].value;
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { access_token: MOCK_ACCESS_TOKEN } },
      error: null,
    });
    useDialecticStore.getState()._resetForTesting?.();
  });

  afterEach(() => {
    useDialecticStore.getState()._resetForTesting?.();
    _resetApiClient();
    server.resetHandlers();
  });

  it('sets loading, posts exportProject, clears loading, returns { export_url } and no error', async () => {
    const projectId = 'proj-export-999';
    const expectedUrl = `https://example.com/exports/${projectId}.zip`;

    // MSW intercept for the underlying API request
    server.use(
      http.post(`${MOCK_FUNCTIONS_URL}/dialectic-service`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({ action: 'exportProject', payload: { projectId } });
        return HttpResponse.json({ export_url: expectedUrl }, { status: 200 });
      })
    );

    const store = useDialecticStore.getState();
    expect(store.isExportingProject).toBe(false);
    expect(store.exportProjectError).toBeNull();

    const promise = store.exportDialecticProject(projectId);
    expect(useDialecticStore.getState().isExportingProject).toBe(true);

    const response = await promise;
    expect(response.error).toBeUndefined();
    expect(response.status).toBe(200);
    expect(response.data?.export_url).toBe(expectedUrl);

    const finalState = useDialecticStore.getState();
    expect(finalState.isExportingProject).toBe(false);
    expect(finalState.exportProjectError).toBeNull();
  });
});


