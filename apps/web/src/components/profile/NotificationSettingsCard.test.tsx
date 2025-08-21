import { render, screen, fireEvent } from '@testing-library/react';
import { useAuthStore, mockSetAuthProfile, mockSetAuthIsLoading, mockSetAuthError, resetAuthStoreMock } from '../../mocks/authStore.mock';
import { NotificationSettingsCard } from './NotificationSettingsCard';
import { vi } from 'vitest';
import { mockUserProfile } from '../../mocks/profile.mock';

vi.mock('@paynless/store', () => ({
  useAuthStore: useAuthStore,
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, disabled, ...props }: { checked: boolean, onCheckedChange: (checked: boolean) => void, disabled: boolean }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      disabled={disabled}
      {...props}
    />
  ),
}));


describe('NotificationSettingsCard', () => {

  beforeEach(() => {
    resetAuthStoreMock();
    vi.clearAllMocks();
  });

  it('should render the card and switch correctly', () => {
    mockSetAuthProfile({
      ...mockUserProfile,
      is_subscribed_to_newsletter: false,
    });
    render(<NotificationSettingsCard />);
    expect(screen.getByText('Email Notifications')).toBeInTheDocument();
    expect(screen.getByLabelText('Subscribe to system notices and updates')).not.toBeChecked();
  });

  it('should call toggleNewsletterSubscription with true when switch is clicked', () => {
    mockSetAuthProfile({
      ...mockUserProfile,
      is_subscribed_to_newsletter: false,
    });
    
    render(<NotificationSettingsCard />);
    
    const switchControl = screen.getByLabelText('Subscribe to system notices and updates');
    fireEvent.click(switchControl);

    expect(useAuthStore.getState().toggleNewsletterSubscription).toHaveBeenCalledWith(true);
  });

  it('should call toggleNewsletterSubscription with false when switch is already on and is clicked', () => {
    mockSetAuthProfile({
      ...mockUserProfile,
      is_subscribed_to_newsletter: true,
    });
    
    render(<NotificationSettingsCard />);
    
    const switchControl = screen.getByLabelText('Subscribe to system notices and updates');
    expect(switchControl).toBeChecked();
    fireEvent.click(switchControl);

    expect(useAuthStore.getState().toggleNewsletterSubscription).toHaveBeenCalledWith(false);
  });

  it('should disable the switch when loading', () => {
    mockSetAuthIsLoading(true);
    mockSetAuthProfile({
      ...mockUserProfile,
      is_subscribed_to_newsletter: false,
    });
    render(<NotificationSettingsCard />);
    const switchControl = screen.getByLabelText('Subscribe to system notices and updates');
    expect(switchControl).toBeDisabled();
  });

  it('should display an error message when there is an error', () => {
    const errorMessage = 'Failed to update settings';
    mockSetAuthError(new Error(errorMessage));
    mockSetAuthProfile({
      ...mockUserProfile,
      is_subscribed_to_newsletter: false,
    });
    render(<NotificationSettingsCard />);
    const errorContainer = screen.getByTestId('error-message');
    expect(errorContainer).toBeInTheDocument();
    expect(errorContainer).toHaveTextContent(`Error updating settings: ${errorMessage}`);
  });
}); 