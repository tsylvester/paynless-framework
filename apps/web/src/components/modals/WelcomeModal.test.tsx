import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WelcomeModal } from './WelcomeModal';
import type { UserProfile } from '@paynless/types';
import type { MockedUseAuthStoreHook } from '../../mocks/authStore.mock';

vi.mock('@paynless/store', () => import('../../mocks/authStore.mock'));

const createMockProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: 'user-id-123',
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

describe('WelcomeModal', () => {
  let useAuthStore: MockedUseAuthStoreHook;
  let resetAuthStoreMock: () => void;

  beforeEach(async () => {
    const mock = await import('../../mocks/authStore.mock');
    useAuthStore = mock.useAuthStore;
    resetAuthStoreMock = mock.resetAuthStoreMock;
    resetAuthStoreMock();
  });

  it('should not render when showWelcomeModal is false', () => {
    useAuthStore.setState({ showWelcomeModal: false });
    render(<WelcomeModal />);
    expect(screen.queryByText('Welcome to Paynless!')).toBeNull();
  });

  it('should render when showWelcomeModal is true', () => {
    useAuthStore.setState({
      showWelcomeModal: true,
      profile: createMockProfile(),
    });
    render(<WelcomeModal />);
    expect(screen.getByText('Welcome to Paynless!')).toBeInTheDocument();
    expect(screen.getByLabelText('I agree to receive system notices and updates.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue/i })).toBeInTheDocument();
  });

  it('should not render if user is already subscribed', () => {
    useAuthStore.setState({
      showWelcomeModal: true,
      profile: createMockProfile({ is_subscribed_to_newsletter: true }),
    });
    render(<WelcomeModal />);
    expect(screen.queryByText('Welcome to Paynless!')).toBeNull();
  });

  it('should call updateSubscriptionAndDismissWelcome with true when continue is clicked', () => {
    const updateSubscriptionAndDismissWelcome = vi.fn();
    useAuthStore.setState({
      showWelcomeModal: true,
      profile: createMockProfile(),
      updateSubscriptionAndDismissWelcome,
    });
    render(<WelcomeModal />);

    const continueButton = screen.getByRole('button', { name: /Continue/i });
    fireEvent.click(continueButton);

    expect(updateSubscriptionAndDismissWelcome).toHaveBeenCalledWith(true);
  });

  it('should call updateSubscriptionAndDismissWelcome with false when checkbox is unchecked and continue is clicked', () => {
    const updateSubscriptionAndDismissWelcome = vi.fn();
    useAuthStore.setState({
      showWelcomeModal: true,
      profile: createMockProfile(),
      updateSubscriptionAndDismissWelcome,
    });
    render(<WelcomeModal />);

    const checkbox = screen.getByLabelText('I agree to receive system notices and updates.');
    fireEvent.click(checkbox); // Uncheck the checkbox

    const continueButton = screen.getByRole('button', { name: /Continue/i });
    fireEvent.click(continueButton);

    expect(updateSubscriptionAndDismissWelcome).toHaveBeenCalledWith(false);
  });
}); 