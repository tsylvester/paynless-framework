import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { useAuthStore } from './authStore';
import { api } from '@paynless/api';
import { logger } from '@paynless/utils';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@paynless/db-types';

// Mock dependencies
vi.mock('@paynless/api');
vi.mock('@paynless/utils');

const resetStore = () => useAuthStore.setState(useAuthStore.getInitialState(), true);

describe('AuthStore - Additional Actions', () => {

  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  // Test suite for loginWithGoogle
  describe('loginWithGoogle', () => {
    it('should call supabase.auth.signInWithOAuth with google provider', async () => {
      const mockSignInWithOAuth = vi.fn().mockResolvedValue({ error: null });
      const mockSupabaseClient = {
        auth: { signInWithOAuth: mockSignInWithOAuth },
      };
      vi.mocked(api.getSupabaseClient).mockReturnValue(mockSupabaseClient as unknown as SupabaseClient<Database>);

      await useAuthStore.getState().loginWithGoogle();

      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/dashboard',
        },
      });
      expect(useAuthStore.getState().isLoading).toBe(false); // Should reset on completion
    });

    it('should set error state if signInWithOAuth fails', async () => {
      const error = new Error('OAuth error');
      const mockSignInWithOAuth = vi.fn().mockResolvedValue({ error });
      const mockSupabaseClient = {
        auth: { signInWithOAuth: mockSignInWithOAuth },
      };
      vi.mocked(api.getSupabaseClient).mockReturnValue(mockSupabaseClient as unknown as SupabaseClient<Database>);

      await useAuthStore.getState().loginWithGoogle();

      expect(useAuthStore.getState().error).toBe(error);
      expect(useAuthStore.getState().isLoading).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Google login error in store', { message: 'OAuth error' });
    });
  });

  // Test suite for subscribeToNewsletter
  describe('subscribeToNewsletter', () => {
    it('should call supabase.functions.invoke with correct parameters', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({ error: null });
      const mockSupabaseClient = {
        functions: { invoke: mockInvoke },
      };
      vi.mocked(api.getSupabaseClient).mockReturnValue(mockSupabaseClient as unknown as SupabaseClient<Database>);

      const testEmail = 'test@example.com';
      await useAuthStore.getState().subscribeToNewsletter(testEmail);

      expect(mockInvoke).toHaveBeenCalledWith('subscribe-to-newsletter', {
        body: { email: testEmail },
      });
      expect(logger.info).toHaveBeenCalledWith('Successfully subscribed user to newsletter', { email: testEmail });
      expect(useAuthStore.getState().error).toBeNull(); // Should not set global error on success
    });

    it('should log an error but not update state if invoke fails', async () => {
      const error = new Error('Function invoke error');
      const mockInvoke = vi.fn().mockResolvedValue({ error });
      const mockSupabaseClient = {
        functions: { invoke: mockInvoke },
      };
      vi.mocked(api.getSupabaseClient).mockReturnValue(mockSupabaseClient as unknown as SupabaseClient<Database>);

      // Set initial loading state to false to test that it's not changed
      useAuthStore.setState({ isLoading: false });

      await useAuthStore.getState().subscribeToNewsletter('test@example.com');

      expect(logger.error).toHaveBeenCalledWith('Newsletter subscription error in store', { message: 'Function invoke error' });
      expect(useAuthStore.getState().error).toBeNull(); // Should not set global error
      expect(useAuthStore.getState().isLoading).toBe(false); // Should not change loading state
    });
  });
});

describe('authStore actions: updateSubscriptionAndDismissWelcome', () => {
  beforeEach(() => {
    // Reset the store to its initial state before each test
    useAuthStore.setState(useAuthStore.getState());
    vi.clearAllMocks(); // Clear any previous mocks
  });

  it('should call updateProfile with correct parameters and hide modal on success', async () => {
    const subscribe = true;
    const updateProfileMock = vi.fn().mockResolvedValue({
      /* mock user profile */
    });

    // Set the initial state and mock the updateProfile action
    useAuthStore.setState({
      updateProfile: updateProfileMock,
      showWelcomeModal: true, // Modal is initially visible
    });

    // Call the action
    await useAuthStore
      .getState()
      .updateSubscriptionAndDismissWelcome(subscribe);

    // Expect updateProfile to have been called with the correct payload
    expect(updateProfileMock).toHaveBeenCalledWith({
      has_seen_welcome_modal: true,
      is_subscribed_to_newsletter: subscribe,
    });

    // Expect the modal to be hidden after the successful update
    expect(useAuthStore.getState().showWelcomeModal).toBe(false);
  });

  it('should not hide modal if updateProfile fails', async () => {
    const subscribe = false;
    const updateProfileMock = vi.fn().mockResolvedValue(null); // Simulate a failure

    // Set the initial state and mock the updateProfile action
    useAuthStore.setState({
      updateProfile: updateProfileMock,
      showWelcomeModal: true, // Modal is initially visible
    });

    // Call the action
    await useAuthStore
      .getState()
      .updateSubscriptionAndDismissWelcome(subscribe);

    // Expect updateProfile to have been called
    expect(updateProfileMock).toHaveBeenCalledWith({
      has_seen_welcome_modal: true,
      is_subscribed_to_newsletter: subscribe,
    });

    // Expect the modal to still be visible because the update failed
    expect(useAuthStore.getState().showWelcomeModal).toBe(true);
  });
}); 