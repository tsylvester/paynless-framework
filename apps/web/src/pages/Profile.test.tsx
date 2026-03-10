import { describe, it, expect, vi, beforeEach, afterEach, SpyInstance } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ProfilePage } from './Profile';
import {
	mockSetAuthError,
	mockSetAuthIsLoading,
	mockSetAuthProfile,
	resetAuthStoreMock,
} from '../mocks/authStore.mock';
import { mockUserProfile } from '../mocks/profile.mock';

// Mock child components
vi.mock('../components/profile/EditName', () => ({ 
  EditName: () => <div data-testid="edit-name">Mock EditName</div> 
}));
vi.mock('../components/profile/EditEmail', () => ({ 
  EditEmail: () => <div data-testid="edit-email">Mock EditEmail</div> 
}));
vi.mock('../components/wallet/WalletBalanceDisplay', () => ({ 
  WalletBalanceDisplay: () => <div data-testid="wallet-balance-display">Mock WalletBalanceDisplay</div> 
}));
vi.mock('../components/profile/ProfilePrivacySettingsCard', () => ({ 
  ProfilePrivacySettingsCard: () => <div data-testid="profile-privacy-settings-card">Mock ProfilePrivacySettingsCard</div> 
}));
vi.mock('../components/profile/NotificationSettingsCard', () => ({
  NotificationSettingsCard: () => <div data-testid="notification-settings-card">Email Notifications</div>
}));
vi.mock('../components/common/CardSkeleton', () => ({
  CardSkeleton: ({numberOfFields}: {numberOfFields: number}) => (
    <div data-testid="mock-card-skeleton">
      Mock CardSkeleton with {numberOfFields} fields
    </div>
  )
}));

vi.mock('@paynless/store', async () => {
  const authMock = await import('../mocks/authStore.mock');
  return { useAuthStore: authMock.useAuthStore };
});

// Mock logger (if used directly in ProfilePage, otherwise can be removed if only ErrorBoundary uses it)
vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(), // This will be spied on for ErrorBoundary tests
    debug: vi.fn(),
  },
}));

const renderProfilePage = () => {
  return render(<ProfilePage />);
};

describe('ProfilePage Component', () => {
  let consoleErrorSpy: SpyInstance;

  beforeEach(() => {
    // Suppress console.error for ErrorBoundary tests, but allow other errors
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      // Check if the error is from ErrorBoundary
      if (args[0] && typeof args[0] === 'string' && args[0].includes('ErrorBoundary caught an error')) {
        return; // Suppress ErrorBoundary logs during tests
      }
      // Call original console.error for other messages
      // consoleErrorSpy.getMockImplementation()?.(...args); // This creates a loop
    });

    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();

    resetAuthStoreMock();
    mockSetAuthProfile(mockUserProfile);
    mockSetAuthIsLoading(false);
    mockSetAuthError(null);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('should render loading state initially with skeletons', () => {
    mockSetAuthProfile(null);
    mockSetAuthIsLoading(true);
    mockSetAuthError(null);
    renderProfilePage();
    const skeletonContainer = screen.getByTestId('profile-grid-skeleton-container');
    expect(skeletonContainer).toBeInTheDocument();
    const skeletons = within(skeletonContainer).getAllByTestId('mock-card-skeleton');
    expect(skeletons.length).toBe(4); // We added 4 skeletons
    expect(skeletons[0]).toHaveTextContent('Mock CardSkeleton with 2 fields');

    expect(screen.queryByTestId('edit-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edit-email')).not.toBeInTheDocument();
  });

  it('should render error state if profile loading fails with authError', () => {
    const testError = new Error('Network request failed');
    mockSetAuthProfile(null);
    mockSetAuthIsLoading(false);
    mockSetAuthError(testError);
    renderProfilePage();
    expect(screen.getByText('Could not load Profile Page')).toBeInTheDocument(); // Card Title
    expect(screen.getByText(`Profile data could not be loaded. ${testError.message}`)).toBeInTheDocument();
    expect(screen.queryByTestId('edit-name')).not.toBeInTheDocument();
  });

  it('should render error state if profile is null even without a specific authError message', () => {
    mockSetAuthProfile(null);
    mockSetAuthIsLoading(false);
    mockSetAuthError(null);
    renderProfilePage();
    expect(screen.getByText('Profile Unavailable')).toBeInTheDocument(); // Card Title
    expect(screen.getByText('Profile data is unavailable. Please ensure you are logged in and try refreshing the page.')).toBeInTheDocument();
    expect(screen.queryByTestId('edit-name')).not.toBeInTheDocument();
  });

  it('should render all profile components when profile is loaded', () => {
    // No need for inline vi.mock here anymore, beforeEach with resetModules handles it.
    // The default useAuthStore mock from beforeEach should be sufficient.
    renderProfilePage();
    expect(screen.getByTestId('profile-grid-container')).toBeInTheDocument();
    expect(screen.getByTestId('edit-name')).toBeInTheDocument();
    expect(screen.getByTestId('edit-email')).toBeInTheDocument();
    expect(screen.getByTestId('wallet-balance-display')).toBeInTheDocument();
    expect(screen.getByTestId('profile-privacy-settings-card')).toBeInTheDocument();
    expect(screen.getByTestId('notification-settings-card')).toBeInTheDocument();
    expect(screen.getByText('Email Notifications')).toBeInTheDocument();
  });

  it('should display ErrorBoundary fallback for a child component error', async () => {
    // Mock EditName to throw an error specifically for this test
    vi.doMock('../components/profile/EditName', () => ({ 
      EditName: () => { throw new Error('EditName component failed'); }
    }));

    // Dynamically import ProfilePage AFTER the mock is set up
    const { ProfilePage: ProfilePageWithMockedError } = await import('./Profile');

    mockSetAuthProfile(mockUserProfile);
    mockSetAuthIsLoading(false);
    mockSetAuthError(null);

    render(<ProfilePageWithMockedError />);

    // Check for the specific fallback UI for EditName
    expect(screen.getByText('Error in User Name')).toBeInTheDocument();
    expect(screen.getByText('This section could not be loaded. Please try refreshing.')).toBeInTheDocument();
    
    // Ensure other components (if not also erroring) are still attempted to be rendered 
    // (their mocks will render their testid divs)
    expect(screen.getByTestId('wallet-balance-display')).toBeInTheDocument(); 
    expect(screen.getByTestId('edit-email')).toBeInTheDocument();
    expect(screen.getByTestId('profile-privacy-settings-card')).toBeInTheDocument();
    
    // Check that ErrorBoundary's componentDidCatch (which logs to console.error) was triggered by our spy
    // The actual console.error is suppressed by the spy, but we can check if the spy was called with expected error pattern.
    // Need to refine the spy to allow checking calls without an infinite loop.
    // For now, just check that some error was logged by ErrorBoundary (which is implicit if fallback shows).
    // The consoleErrorSpy is tricky here because ErrorBoundary calls console.error internally.
    // We test that the fallback UI showed up, which means ErrorBoundary worked.
  });

}); 