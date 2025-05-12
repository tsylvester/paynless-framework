'use client';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { useAuthStore } from '@paynless/store';
import { ProfilePrivacySettingsCard } from './ProfilePrivacySettingsCard';
import type { UserProfile, ProfilePrivacySetting } from '@paynless/types';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

// Polyfill for PointerEvents (copied from ChatContextSelector.test.tsx)
if (typeof window !== 'undefined') {
    class MockPointerEvent extends Event {
        button: number;
        ctrlKey: boolean;
        pointerType: string;
        pointerId: number;

        constructor(type: string, props: PointerEventInit) {
            super(type, props);
            this.button = props.button || 0;
            this.ctrlKey = props.ctrlKey || false;
            this.pointerType = props.pointerType || 'mouse';
            this.pointerId = props.pointerId || 0;
        }
    }
    // @ts-expect-error // window.PointerEvent is read-only
    window.PointerEvent = MockPointerEvent;

    if (!HTMLElement.prototype.hasPointerCapture) {
        HTMLElement.prototype.hasPointerCapture = (pointerId: number) => {
            if (process.env['NODE_ENV'] === 'test') { 
                console.log(`[Test Polyfill] hasPointerCapture: ${pointerId}`);
            }
            return false; 
        };
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
        HTMLElement.prototype.releasePointerCapture = (pointerId: number) => {
            if (process.env['NODE_ENV'] === 'test') {
                console.log(`[Test Polyfill] releasePointerCapture: ${pointerId}`);
            }
        };
    }
    if (!HTMLElement.prototype.setPointerCapture) {
        HTMLElement.prototype.setPointerCapture = (pointerId: number) => {
            if (process.env['NODE_ENV'] === 'test') {
                console.log(`[Test Polyfill] setPointerCapture: ${pointerId}`);
            }
        };
    }
}

const mockUpdateProfileFn = vi.fn();

// Mock the store hook
const mockUseAuthStore = useAuthStore as vi.MockInstance<ReturnType<typeof useAuthStore>>;

vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(), // Will be implemented in beforeEach
}));

const defaultMockProfile: UserProfile = {
  id: 'user-123',
  first_name: 'Test',
  last_name: 'User',
  profile_privacy_setting: 'private',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_selected_org_id: null,
  chat_context: null,
  role: 'user',
};

describe('ProfilePrivacySettingsCard', () => {
  const user = userEvent.setup(); // Setup userEvent once
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView; // Store original

  beforeEach(() => {
    mockUpdateProfileFn.mockReset().mockResolvedValue({ data: {}, error: null, status: 200 }); // Simulate successful update
    // Default mock implementation for useAuthStore
    mockUseAuthStore.mockImplementation(() => ({
      profile: { ...defaultMockProfile, profile_privacy_setting: 'private' }, // Explicitly set for default
      updateProfile: mockUpdateProfileFn,
      isLoading: false,
      error: null,
      // Ensure all potentially accessed properties from the real store are mocked if needed
      // For example, if the component uses other state or actions from authStore directly
    } as unknown as ReturnType<typeof useAuthStore>)); // Cast to the hook's return type
    HTMLElement.prototype.scrollIntoView = vi.fn(); // Mock scrollIntoView
  });

  afterEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView; // Restore original
  });

  test('renders a Select dropdown with correct privacy options and labels', async () => {
    render(<ProfilePrivacySettingsCard />);
    const selectTrigger = screen.getByTestId('privacy-select-trigger');
    expect(selectTrigger).toBeInTheDocument();
    expect(screen.getByText('Privacy Setting')).toBeInTheDocument(); // Label for the select

    expect(selectTrigger).toHaveAttribute('data-state', 'closed');

    await user.click(selectTrigger);

    // Wait for the content wrapper to appear, then check for options
    // Increased default timeout for findBy queries is already 4000ms in these tests, which is good.
    await screen.findByTestId('select-content-wrapper', {}, { timeout: 5000 }); // Wait for the container of options

    expect(await screen.findByRole('option', { name: /Private/i }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /Public/i }, { timeout: 5000 })).toBeInTheDocument();
  });

  test('Select dropdown correctly displays the current profile_privacy_setting from authStore', async () => {
    mockUseAuthStore.mockImplementation(() => ({
      profile: { ...defaultMockProfile, profile_privacy_setting: 'public' },
      updateProfile: mockUpdateProfileFn,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useAuthStore>));
    render(<ProfilePrivacySettingsCard />);
    const trigger = screen.getByTestId('privacy-select-trigger');
    // Use waitFor to ensure component re-renders with new store state before assertion
    await waitFor(() => {
        // Check for the label of the "public" option
        expect(trigger).toHaveTextContent(/Public/i);
        // Check for the description of the "public" option
        expect(trigger).toHaveTextContent(/Anyone can see your basic profile details \(name, avatar\)/i);
    }, { timeout: 5000 });
  });

  test('Select dropdown defaults to "private" if profile_privacy_setting is null/undefined on profile', async () => {
    mockUseAuthStore.mockImplementation(() => ({
      profile: { ...defaultMockProfile, profile_privacy_setting: null as unknown as ProfilePrivacySetting },
      updateProfile: mockUpdateProfileFn,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useAuthStore>));
    render(<ProfilePrivacySettingsCard />);
    const trigger = screen.getByTestId('privacy-select-trigger');
    await waitFor(() => {
        expect(trigger).toHaveTextContent(/Private/i);
        expect(trigger).toHaveTextContent(/Only you and members of organizations you share can see your profile details/i);
    }, { timeout: 5000 });
  });

  test('changing the selection calls authStore.updateProfile with "public"', async () => {
    render(<ProfilePrivacySettingsCard />);
    const selectTrigger = screen.getByTestId('privacy-select-trigger');
    await user.click(selectTrigger);

    await screen.findByTestId('select-content-wrapper', {}, { timeout: 5000 }); // Ensure content is open
    
    const publicOptionItem = await screen.findByRole('option', { name: /Public/i }, {timeout: 5000});
    await user.click(publicOptionItem);

    await waitFor(() => {
      expect(mockUpdateProfileFn).toHaveBeenCalledWith({ profile_privacy_setting: 'public' });
    }, { timeout: 5000 });
  });

  test('changing the selection calls authStore.updateProfile with "private"', async () => {
    mockUseAuthStore.mockImplementation(() => ({
        profile: { ...defaultMockProfile, profile_privacy_setting: 'public' }, // Start with public
        updateProfile: mockUpdateProfileFn,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useAuthStore>));
    render(<ProfilePrivacySettingsCard />);
    const selectTrigger = screen.getByTestId('privacy-select-trigger');
    await user.click(selectTrigger);

    await screen.findByTestId('select-content-wrapper', {}, { timeout: 5000 }); // Ensure content is open
    
    const privateOptionItem = await screen.findByRole('option', { name: /Private/i }, {timeout: 5000});
    await user.click(privateOptionItem);

    await waitFor(() => {
      expect(mockUpdateProfileFn).toHaveBeenCalledWith({ profile_privacy_setting: 'private' });
    }, { timeout: 5000 });
  });

  test('displays a loading indicator and disables Select when authStore.isLoading is true', async () => {
    mockUseAuthStore.mockImplementation(() => ({
      profile: { ...defaultMockProfile },
      updateProfile: mockUpdateProfileFn,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useAuthStore>));
    render(<ProfilePrivacySettingsCard />);
    
    await waitFor(() => {
      expect(screen.getByTestId('privacy-select-trigger')).toBeDisabled();
      const loadingIndicator = screen.getByTestId('loading-indicator');
      expect(loadingIndicator).toBeInTheDocument();
      expect(loadingIndicator).toHaveTextContent('Saving settings...');
    }, { timeout: 5000 });
  });

  test('displays an error message if authStore.error is set', async () => {
    const errorMessageText = 'Failed to update profile - test error';
    mockUseAuthStore.mockImplementation(() => ({
      profile: { ...defaultMockProfile },
      updateProfile: mockUpdateProfileFn,
      isLoading: false,
      error: { message: errorMessageText, name: 'Error' }, // Mock error object with message property
    } as unknown as ReturnType<typeof useAuthStore>));
    render(<ProfilePrivacySettingsCard />);
    // Wait for the error message to appear, as it might depend on state update
    const errorMessageContainer = await screen.findByTestId('error-message', {}, { timeout: 5000 });
    expect(errorMessageContainer).toBeInTheDocument();
    // Ensure the assertion checks for the complete, correct text including the prefix.
    await waitFor(() => {
        expect(errorMessageContainer).toHaveTextContent(`Error updating settings: ${errorMessageText}`);
    }, { timeout: 5000 });
  });

  test('does not call updateProfile if the selection has not changed', async () => {
    // Profile defaults to 'private' in beforeEach mockUseAuthStore setup
    render(<ProfilePrivacySettingsCard />); 
    const selectTrigger = screen.getByTestId('privacy-select-trigger');
    await user.click(selectTrigger);

    await screen.findByTestId('select-content-wrapper', {}, { timeout: 5000 }); // Ensure content is open
    
    const privateOptionItem = await screen.findByRole('option', { name: /Private/i }, {timeout: 5000}); 
    await user.click(privateOptionItem);
        
    // Add a slight delay to ensure no async operations are pending if any were mistakenly triggered.
    // waitFor could also be used here if there was an expectation of something NOT happening after an action.
    // However, for "not.toHaveBeenCalled", it's usually checked immediately after the action that shouldn't trigger it.
    // Adding a small explicit wait can sometimes help with timing subtleties in tests.
    await new Promise(resolve => setTimeout(resolve, 50)); 

    expect(mockUpdateProfileFn).not.toHaveBeenCalled();
  });

  test('renders loading placeholder when profile is null', async () => {
    mockUseAuthStore.mockImplementation(() => ({
      profile: null,
      updateProfile: mockUpdateProfileFn,
      isLoading: false, 
      error: null,
    } as unknown as ReturnType<typeof useAuthStore>));
    render(<ProfilePrivacySettingsCard />);
    
    // Using findByText to wait for the text to appear, just in case there's any delay.
    expect(await screen.findByText('Loading profile settings...', {}, { timeout: 5000 })).toBeInTheDocument();
    // queryByTestId is appropriate here as we expect the trigger NOT to be in the document.
    expect(screen.queryByTestId('privacy-select-trigger')).not.toBeInTheDocument();
  });
}); 