import { describe, it, expect, vi, beforeEach, afterEach, SpyInstance } from 'vitest';
import { useAuthStore } from './authStore';
import { api } from '@paynless/api';
import { mockApiClient, resetMockApiClient } from '@paynless/api/mocks';
import type { UserProfile, Session, SuccessResponse, ErrorResponse } from '@paynless/types';

const createMockProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
    id: 'user-123',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    first_name: 'Test',
    last_name: 'User',
    last_selected_org_id: null,
    profile_privacy_setting: 'private',
    role: 'user',
    chat_context: null,
    is_subscribed_to_newsletter: false,
    has_seen_welcome_modal: false,
    ...overrides,
});

const createMockSession = (overrides: Partial<Session> = {}): Session => ({
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    expiresAt: Date.now() + 3600 * 1000,
    ...overrides,
});

describe('authStore - Welcome Modal', () => {
    let apiPostSpy: SpyInstance;

    beforeEach(() => {
        const initialState = useAuthStore.getInitialState();
        useAuthStore.setState(initialState, true);
        resetMockApiClient();
        apiPostSpy = vi.spyOn(api, 'post').mockImplementation(mockApiClient.post);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

  it('updateSubscriptionAndDismissWelcome should update profile and hide modal on success', async () => {
    const initialProfile = createMockProfile();
    const session = createMockSession();
    useAuthStore.setState({ profile: initialProfile, session: session });

    const { updateSubscriptionAndDismissWelcome } = useAuthStore.getState();
    const expectedProfile = { ...initialProfile, has_seen_welcome_modal: true, is_subscribed_to_newsletter: true };
    
    vi.mocked(mockApiClient.post).mockResolvedValue({
        data: expectedProfile,
        error: undefined,
        status: 200,
    } as SuccessResponse<UserProfile>);

    await updateSubscriptionAndDismissWelcome(true);

    expect(apiPostSpy).toHaveBeenCalledWith(
      'me',
      { has_seen_welcome_modal: true, is_subscribed_to_newsletter: true },
      { token: session.access_token }
    );
    expect(useAuthStore.getState().showWelcomeModal).toBe(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().profile).toEqual(expectedProfile);
  });

  it('updateSubscriptionAndDismissWelcome should handle API failure gracefully', async () => {
    const initialProfile = createMockProfile();
    const session = createMockSession();
    useAuthStore.setState({ profile: initialProfile, session: session, showWelcomeModal: true });
    const { updateSubscriptionAndDismissWelcome } = useAuthStore.getState();
    const apiError = { message: 'API Failed', code: '500' };
    
    vi.mocked(mockApiClient.post).mockResolvedValue({
        data: undefined,
        error: apiError,
        status: 500,
    } as ErrorResponse);

    await updateSubscriptionAndDismissWelcome(true);

    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().profile).toEqual(initialProfile);
    expect(useAuthStore.getState().showWelcomeModal).toBe(true);
  });
}); 