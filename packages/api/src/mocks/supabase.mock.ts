import { vi, type Mock } from 'vitest';
import type {
    SupabaseClient,
    Session,
    User,
    AuthChangeEvent,
    Subscription,
    SignInWithPasswordCredentials,
    AuthTokenResponse,
    SignUpWithPasswordCredentials,
    AuthResponse,
    SignOut,
    SignInWithOAuthCredentials,
    OAuthResponse,
    RealtimeChannel,
    RealtimeChannelOptions,
    PostgrestResponse,
    FunctionInvokeOptions,
} from '@supabase/supabase-js';

// Define a type for the auth state change callback for clarity
type AuthStateChangeCallback = (event: AuthChangeEvent, session: Session | null) => void;

/**
 * Creates a reusable, deeply mocked SupabaseClient instance, suitable for Vitest unit tests,
 * focusing on the methods commonly used by stores (especially auth).
 *
 * @returns A mocked SupabaseClient instance.
 */
export const createMockSupabaseClient = (): SupabaseClient => {
    const mockSubscription: Subscription = {
        id: 'mock-subscription-id',
        unsubscribe: vi.fn(),
        callback: vi.fn(),
    };

    const mockClient = {
        auth: {
            onAuthStateChange: vi.fn() as Mock<[AuthStateChangeCallback], { data: { subscription: Subscription } }>,
            getUser: vi.fn() as Mock<[string?], Promise<{ data: { user: User | null }; error: null }>>,
            getSession: vi.fn() as Mock<[], Promise<{ data: { session: Session | null }; error: null }>>,
            signInWithPassword: vi.fn() as Mock<[SignInWithPasswordCredentials], Promise<AuthTokenResponse>>,
            signUp: vi.fn() as Mock<[SignUpWithPasswordCredentials], Promise<AuthResponse>>,
            signOut: vi.fn() as Mock<[SignOut?], Promise<{ error: null }>>,
            signInWithOAuth: vi.fn() as Mock<[SignInWithOAuthCredentials], Promise<OAuthResponse>>,
        },
        channel: vi.fn() as Mock<[string, RealtimeChannelOptions?], RealtimeChannel>,
        from: vi.fn() as Mock<[string], any>,
        functions: {
            invoke: vi.fn() as Mock<[string, FunctionInvokeOptions?], Promise<{ data: any; error: any }>>
        },
        rpc: vi.fn() as Mock<[string, any?, any?], Promise<PostgrestResponse<any>>>,
        removeChannel: vi.fn() as Mock<[RealtimeChannel], Promise<'ok' | 'timed out' | 'error'>>,
        removeAllChannels: vi.fn() as Mock<[], Promise<('ok' | 'timed out' | 'error')[]>>,
        storage: {
            from: vi.fn().mockReturnThis(),
        } as any,
    } as unknown as SupabaseClient;

    // Default implementations after creation to allow for proper Mock typing
    (mockClient.auth.onAuthStateChange as Mock).mockReturnValue({ data: { subscription: mockSubscription } });
    (mockClient.auth.getUser as Mock).mockResolvedValue({ data: { user: null }, error: null });
    (mockClient.auth.getSession as Mock).mockResolvedValue({ data: { session: null }, error: null });
    (mockClient.auth.signInWithPassword as Mock).mockResolvedValue({ data: {} as any, error: null });
    (mockClient.auth.signUp as Mock).mockResolvedValue({ data: {} as any, error: null });
    (mockClient.auth.signOut as Mock).mockResolvedValue({ error: null });
    (mockClient.auth.signInWithOAuth as Mock).mockResolvedValue({ data: {} as any, error: null });

    return mockClient;
};

/**
 * Resets relevant mock functions within a given mock SupabaseClient instance.
 * Focuses on methods commonly manipulated in tests.
 *
 * @param mockClient - The mock SupabaseClient instance to reset.
 */
export const resetMockSupabaseClient = (mockClient: SupabaseClient) => {
    if (mockClient.auth) {
        (mockClient.auth.onAuthStateChange as Mock).mockClear();
        (mockClient.auth.getUser as Mock).mockClear().mockResolvedValue({ data: { user: null }, error: null });
        (mockClient.auth.getSession as Mock).mockClear().mockResolvedValue({ data: { session: null }, error: null });
        (mockClient.auth.signInWithPassword as Mock).mockClear();
        (mockClient.auth.signUp as Mock).mockClear();
        (mockClient.auth.signOut as Mock).mockClear();
        (mockClient.auth.signInWithOAuth as Mock).mockClear();
    }
    if (mockClient.channel) (mockClient.channel as Mock).mockClear();
    if (mockClient.from) (mockClient.from as Mock).mockClear();
    if (mockClient.functions?.invoke) (mockClient.functions.invoke as Mock).mockClear();
    if (mockClient.rpc) (mockClient.rpc as Mock).mockClear();
    if (mockClient.removeChannel) (mockClient.removeChannel as Mock).mockClear();
    if (mockClient.removeAllChannels) (mockClient.removeAllChannels as Mock).mockClear();
    if (mockClient.storage?.from) (mockClient.storage.from as Mock).mockClear();
};

// Optional: Export a default instance
// export const mockSupabaseClient = createMockSupabaseClient(); 