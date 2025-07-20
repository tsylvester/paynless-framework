import { vi, SpyInstance } from 'vitest';
import { useAuthStore } from './authStore';
import { api } from '@paynless/api';
import { mockApiClient, resetMockApiClient } from '@paynless/api/mocks';
import { ApiResponse, UserProfile, UserProfileUpdate } from '@paynless/types';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logger } from '@paynless/utils';

// Mock the logger
vi.mock('@paynless/utils', () => ({ 
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } 
}));

describe('authStore newsletter actions', () => {
  let apiPutSpy: SpyInstance;
  let updateProfileSpy: SpyInstance;

  beforeEach(() => {
    resetMockApiClient();
    // We are no longer spying on `api.put` directly in this test file,
    // but on the `updateProfile` action which in turn uses `api.put`.
    // The spy on `updateProfile` allows us to verify it's called.
    updateProfileSpy = vi.spyOn(useAuthStore.getState(), 'updateProfile');

    const mockUserProfile: UserProfile = {
      id: '1',
      first_name: 'Test',
      last_name: 'User',
      is_subscribed_to_newsletter: false,
      chat_context: {},
      created_at: new Date().toISOString(),
      has_seen_welcome_modal: false,
      last_selected_org_id: null,
      profile_privacy_setting: 'public',
      role: 'user',
      updated_at: new Date().toISOString(),
    };
    
    useAuthStore.setState({
      profile: mockUserProfile,
      isLoading: false,
      error: null,
      session: { access_token: 'test-token', refresh_token: 'test-refresh-token', expiresAt: Date.now() + 1000 * 60 * 60 * 24 },
    });
    vi.clearAllMocks();
    
    // Clear logger mocks
    vi.mocked(logger.error).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('toggleNewsletterSubscription should call updateProfile with the correct subscription status', async () => {
    const { toggleNewsletterSubscription } = useAuthStore.getState();
    
    // Mock the implementation of updateProfile to simulate a successful update
    const updatedProfile: UserProfile = {
      ...useAuthStore.getState().profile!,
      is_subscribed_to_newsletter: true,
    };
    updateProfileSpy.mockResolvedValue(updatedProfile);

    await toggleNewsletterSubscription(true);

    // Verify that updateProfile was called correctly
    expect(updateProfileSpy).toHaveBeenCalledWith({ is_subscribed_to_newsletter: true });
    
    // The action itself now defers state updates to `updateProfile`,
    // so we don't need to check the state here as it's tested elsewhere.
    // We just need to know the correct action was dispatched.
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().error).toBe(null);
  });

  it('toggleNewsletterSubscription should handle errors from updateProfile gracefully', async () => {
    const errorMessage = 'API is down';
    // Simulate `updateProfile` failing
    updateProfileSpy.mockRejectedValue(new Error(errorMessage));

    const { toggleNewsletterSubscription } = useAuthStore.getState();
    await toggleNewsletterSubscription(true);

    // Verify updateProfile was called
    expect(updateProfileSpy).toHaveBeenCalledWith({ is_subscribed_to_newsletter: true });
    
    // Check that the error from the failed update is reflected in the store state
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().error).toEqual(new Error(errorMessage));
    
    // The profile should not have been updated
    expect(useAuthStore.getState().profile?.is_subscribed_to_newsletter).toBe(false);
    expect(logger.error).toHaveBeenCalledWith('Failed to toggle newsletter subscription', { error: errorMessage });
  });
}); 