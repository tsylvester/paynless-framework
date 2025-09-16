import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { createClient } from '@supabase/supabase-js';
import { api, initializeApiClient, _resetApiClient } from './apiClient';
import { server } from './setupTests';

// Mock the @supabase/supabase-js module to control auth in ApiClient
vi.mock('@supabase/supabase-js', () => {
  const mockClient = {
    auth: {
      getSession: vi.fn(),
    },
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

describe('DialecticApiClient (integration) - exportProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetApiClient();
    initializeApiClient({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });

    // Configure mocked Supabase getSession to provide a token (so Authorization is attached)
    const mockSupabaseClient = (createClient as unknown as { mock: { results: { value: any }[] } }).mock.results[0].value;
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: MOCK_ACCESS_TOKEN,
          refresh_token: 'mock-refresh-token',
          user: { id: 'mock-user-id' },
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Date.now() / 1000 + 3600,
        },
      },
      error: null,
    });
  });

  afterEach(() => {
    _resetApiClient();
    server.resetHandlers();
  });

  it('posts action exportProject with projectId and returns export_url', async () => {
    const projectId = 'proj-export-123';
    const expectedUrl = `https://example.com/exports/${projectId}.zip`;

    server.use(
      http.post(`${MOCK_FUNCTIONS_URL}/dialectic-service`, async ({ request }) => {
        const headers = request.headers;
        // apikey header should be present; Authorization may also be present
        expect(headers.get('apikey')).toBe(MOCK_ANON_KEY);

        const body = await request.json();
        expect(body).toEqual({ action: 'exportProject', payload: { projectId } });
        return HttpResponse.json({ export_url: expectedUrl }, { status: 200 });
      }),
    );

    const response = await api.dialectic().exportProject({ projectId });
    expect(response.error).toBeUndefined();
    expect(response.status).toBe(200);
    expect(response.data?.export_url).toBe(expectedUrl);
  });
});


