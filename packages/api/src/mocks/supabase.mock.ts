import { vi } from 'vitest';
import type {
    SupabaseClient,
    Session,
    User,
    AuthChangeEvent,
    Subscription,
    Provider
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
        callback: vi.fn(), // Add the callback property
    };

    // The core mock object
    const mockClient = {
        auth: {
            onAuthStateChange: vi.fn<[AuthStateChangeCallback], { data: { subscription: Subscription } }>((_callback) => {
                // Store the callback if needed for triggering later in tests
                // Return the expected structure
                return {
                    data: { subscription: mockSubscription },
                };
            }),
            getUser: vi.fn<[], Promise<{ data: { user: User | null }; error: null }>>().mockResolvedValue({ data: { user: null }, error: null }), // Default: no user
            getSession: vi.fn<[], Promise<{ data: { session: Session | null }; error: null }>>().mockResolvedValue({ data: { session: null }, error: null }), // Default: no session
            signInWithPassword: vi.fn<[any], Promise<any>>().mockResolvedValue({ data: {}, error: null }),
            signUp: vi.fn<[any], Promise<any>>().mockResolvedValue({ data: {}, error: null }),
            signOut: vi.fn<[], Promise<{ error: null }>>().mockResolvedValue({ error: null }),
            signInWithOAuth: vi.fn<[{ provider: Provider; options?: any }], Promise<any>>().mockResolvedValue({ data: {}, error: null }),
            // Add other auth methods if needed by tests (e.g., resetPasswordForEmail, updateUser)
        },
        channel: vi.fn().mockReturnThis(), // Basic channel mock
        from: vi.fn().mockReturnThis(), // Basic query builder mock
        // Add other top-level SupabaseClient methods if needed (e.g., rpc, functions)
        functions: { // Mock functions if client is used for function calls directly (less common)
            invoke: vi.fn()
        },
        rpc: vi.fn(), // Mock rpc
    } as unknown as SupabaseClient; // Use type assertion

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
        mockClient.auth.onAuthStateChange.mockClear(); // Clear calls, keep implementation
        // Reset specific return values if needed (or let tests set them)
        mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
        mockClient.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
        mockClient.auth.signInWithPassword.mockClear();
        mockClient.auth.signUp.mockClear();
        mockClient.auth.signOut.mockClear();
        mockClient.auth.signInWithOAuth.mockClear();
    }
    if (mockClient.channel) mockClient.channel.mockClear();
    if (mockClient.from) mockClient.from.mockClear();
    if (mockClient.functions?.invoke) mockClient.functions.invoke.mockClear();
    if (mockClient.rpc) mockClient.rpc.mockClear();
};

// Optional: Export a default instance
// export const mockSupabaseClient = createMockSupabaseClient(); 