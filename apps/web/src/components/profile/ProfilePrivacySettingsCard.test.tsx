'use client';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { useAuthStore, resetAuthStoreMock, mockSetAuthProfile, mockSetAuthIsLoading, mockSetAuthError } from '../../mocks/authStore.mock';
import { ProfilePrivacySettingsCard } from './ProfilePrivacySettingsCard';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mockUserProfile } from '../../mocks/profile.mock';
import { ProfilePrivacySetting } from '@paynless/types';

// Mock the store hook
vi.mock('@paynless/store', () => ({
  useAuthStore: useAuthStore,
}));

// We still need the pointer event polyfill for the Select component in a JSDOM environment.
if (typeof window !== 'undefined') {
    class MockPointerEvent extends Event {
        constructor(type: string, props: PointerEventInit) {
            super(type, props);
        }
    }
    // @ts-expect-error // window.PointerEvent is read-only
    window.PointerEvent = MockPointerEvent;
}

describe('ProfilePrivacySettingsCard', () => {
  const user = userEvent.setup();
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    resetAuthStoreMock(); // Use the centralized reset function
    HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  test('renders a Select dropdown with correct privacy options and labels', async () => {
    mockSetAuthProfile({ ...mockUserProfile, profile_privacy_setting: 'private' });
    render(<ProfilePrivacySettingsCard />);
    
    const selectTrigger = screen.getByTestId('privacy-select-trigger');
    expect(selectTrigger).toBeInTheDocument();
    expect(screen.getByText('Privacy Setting')).toBeInTheDocument();
    expect(selectTrigger).toHaveAttribute('data-state', 'closed');

    await user.click(selectTrigger);

    expect(await screen.findByRole('option', { name: /Private/i })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /Public/i })).toBeInTheDocument();
  });

  test('Select dropdown correctly displays the current profile_privacy_setting from authStore', async () => {
    mockSetAuthProfile({ ...mockUserProfile, profile_privacy_setting: 'public' });
    render(<ProfilePrivacySettingsCard />);
    
    const trigger = screen.getByTestId('privacy-select-trigger');
    const description = screen.getByTestId('selected-privacy-description');
    
    await waitFor(() => {
        expect(trigger).toHaveTextContent(/Public/i);
        expect(description).toHaveTextContent(/Anyone can see your basic profile details \(name, avatar\)/i);
    });
  });

  test('Select dropdown defaults to "private" if profile_privacy_setting is null/undefined on profile', async () => {
    
    mockSetAuthProfile({ ...mockUserProfile, profile_privacy_setting: null as unknown as ProfilePrivacySetting });
    render(<ProfilePrivacySettingsCard />);
    
    const trigger = screen.getByTestId('privacy-select-trigger');
    const description = screen.getByTestId('selected-privacy-description');
    
    await waitFor(() => {
        expect(trigger).toHaveTextContent(/Private/i);
        expect(description).toHaveTextContent(/Only you and members of organizations you share can see your profile details\./i);
    });
  });

  test('changing the selection calls authStore.updateProfile with "public"', async () => {
    mockSetAuthProfile({ ...mockUserProfile, profile_privacy_setting: 'private' });
    render(<ProfilePrivacySettingsCard />);
    
    const selectTrigger = screen.getByTestId('privacy-select-trigger');
    await user.click(selectTrigger);
    
    const publicOptionItem = await screen.findByRole('option', { name: /Public/i });
    await user.click(publicOptionItem);

    await waitFor(() => {
      expect(useAuthStore.getState().updateProfile).toHaveBeenCalledWith({ profile_privacy_setting: 'public' });
    });
  });

  test('changing the selection calls authStore.updateProfile with "private"', async () => {
    mockSetAuthProfile({ ...mockUserProfile, profile_privacy_setting: 'public' });
    render(<ProfilePrivacySettingsCard />);

    const selectTrigger = screen.getByTestId('privacy-select-trigger');
    await user.click(selectTrigger);
    
    const privateOptionItem = await screen.findByRole('option', { name: /Private/i });
    await user.click(privateOptionItem);

    await waitFor(() => {
      expect(useAuthStore.getState().updateProfile).toHaveBeenCalledWith({ profile_privacy_setting: 'private' });
    });
  });

  test('displays a loading indicator and disables Select when authStore.isLoading is true', async () => {
    mockSetAuthProfile({ ...mockUserProfile });
    mockSetAuthIsLoading(true);
    render(<ProfilePrivacySettingsCard />);
    
    await waitFor(() => {
      expect(screen.getByTestId('privacy-select-trigger')).toBeDisabled();
      const loadingIndicator = screen.getByTestId('loading-indicator');
      expect(loadingIndicator).toBeInTheDocument();
      expect(loadingIndicator).toHaveTextContent('Saving settings...');
    });
  });

  test('displays an error message if authStore.error is set', async () => {
    const errorMessageText = 'Failed to update profile - test error';
    mockSetAuthProfile({ ...mockUserProfile });
    mockSetAuthError(new Error(errorMessageText));
    render(<ProfilePrivacySettingsCard />);
    
    const errorMessageContainer = await screen.findByTestId('error-message');
    expect(errorMessageContainer).toBeInTheDocument();
    
    await waitFor(() => {
        expect(errorMessageContainer).toHaveTextContent(`Error updating settings: ${errorMessageText}`);
    });
  });

  test('does not call updateProfile if the selection has not changed', async () => {
    mockSetAuthProfile({ ...mockUserProfile, profile_privacy_setting: 'private' });
    render(<ProfilePrivacySettingsCard />); 
    
    const selectTrigger = screen.getByTestId('privacy-select-trigger');
    await user.click(selectTrigger);
    
    const privateOptionItem = await screen.findByRole('option', { name: /Private/i }); 
    await user.click(privateOptionItem);
        
    await new Promise(resolve => setTimeout(resolve, 50)); 

    expect(useAuthStore.getState().updateProfile).not.toHaveBeenCalled();
  });

  test('renders loading placeholder when profile is null', async () => {
    mockSetAuthProfile(null);
    render(<ProfilePrivacySettingsCard />);
    
    expect(await screen.findByText('Loading profile settings...')).toBeInTheDocument();
    expect(screen.queryByTestId('privacy-select-trigger')).not.toBeInTheDocument();
  });
}); 