import { vi } from 'vitest';
import { ApiClient } from '@paynless/api-client/src/apiClient'; // Adjust path as needed

export const MOCK_ACCESS_TOKEN = 'mock-test-access-token-from-util';

/**
 * Mocks the supabase.auth.getSession method for a given ApiClient instance.
 * 
 * @param apiClientInstance The instance of ApiClient whose supabase client needs mocking.
 */
export function mockSupabaseAuthSession(apiClientInstance: ApiClient) {
    // Access the private supabase property - slightly hacky but necessary for testing
    const supabaseAuth = apiClientInstance['supabase']?.auth;

    if (!supabaseAuth) {
        console.warn('Attempted to mock getSession, but supabase client or auth module not found on ApiClient instance.');
        return;
    }

    vi.spyOn(supabaseAuth, 'getSession').mockResolvedValue({
        data: { 
            session: { 
                access_token: MOCK_ACCESS_TOKEN, 
                refresh_token: 'mock-refresh-from-util', 
                user: { 
                    id: 'user-123-from-util',
                    aud: 'authenticated',
                    role: 'authenticated',
                    email: 'mock@example.com',
                    app_metadata: { provider: 'email' },
                    user_metadata: {},
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                 } as any, // Use 'as any' to simplify mock user object
                token_type: 'bearer', 
                expires_in: 3600,
                expires_at: Date.now() / 1000 + 3600, // Supabase uses seconds since epoch
            } 
        },
        error: null
    });

    // console.log(`Mock applied for getSession on instance:`, apiClientInstance);
} 