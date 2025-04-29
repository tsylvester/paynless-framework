import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { AcceptInvitePage } from '../../../pages/AcceptInvitePage'; // Adjust path
import { useOrganizationStore } from '@paynless/store';
import { useParams, useNavigate } from 'react-router-dom';
import { logger } from '@paynless/utils';
import { toast } from 'sonner';

// --- Mocks ---
vi.mock('@paynless/store', () => ({ useOrganizationStore: vi.fn() }));
vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>();
  return { ...original, useParams: vi.fn(), useNavigate: vi.fn() };
});
vi.mock('@paynless/utils', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('sonner', () => ({ 
    toast: { 
        success: vi.fn(), 
        error: vi.fn(), 
        info: vi.fn() 
    }, 
    Toaster: () => <div data-testid="toaster-mock"></div>
}));

// Mock shadcn components used (adjust if needed)
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h4>{children}</h4>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/button', () => ({
  // Mock isLoading prop if your Button component supports it
  Button: ({ children, onClick, disabled, isLoading, variant }: any) => (
    <button onClick={onClick} disabled={disabled || isLoading} data-variant={variant}>
      {isLoading ? 'Loading...' : children}
    </button>
  ),
}));
vi.mock('@/components/ui/skeleton', () => ({ 
    Skeleton: ({ className }: { className: string }) => <div data-testid="skeleton" className={className}></div> 
}));
vi.mock('../../../components/common/ErrorBoundary', () => ({ // Mock ErrorBoundary to simplify page tests
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

// --- Test Suite ---
describe('AcceptInvitePage', () => {
  let mockUseOrganizationStore: Mock;
  let mockUseParams: Mock;
  let mockUseNavigate: Mock;
  let mockNavigate: Mock;

  let mockAcceptInvite: Mock;
  let mockDeclineInvite: Mock;
  let mockFetchInviteDetails: Mock;

  const tokenFromUrl = 'test-invite-token';
  const mockInviteDetails = { organizationName: 'Test Invite Org' };

  // Helper to setup store state
  const setupStore = (overrides = {}) => {
    const defaultState = {
      acceptInvite: mockAcceptInvite,
      declineInvite: mockDeclineInvite,
      error: null, // Keep general action error separate
      // Add new invite details state/actions
      fetchInviteDetails: mockFetchInviteDetails,
      currentInviteDetails: null, 
      isFetchingInviteDetails: false,
      fetchInviteDetailsError: null,
      ...overrides,
    };
    mockUseOrganizationStore.mockReturnValue(defaultState);
    return defaultState;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockAcceptInvite = vi.fn();
    mockDeclineInvite = vi.fn();
    mockNavigate = vi.fn();
    mockFetchInviteDetails = vi.fn();

    mockUseOrganizationStore = useOrganizationStore as Mock;
    mockUseParams = useParams as Mock;
    mockUseNavigate = useNavigate as Mock;

    setupStore(); // Setup default store
    mockUseParams.mockReturnValue({ token: tokenFromUrl });
    mockUseNavigate.mockReturnValue(mockNavigate);
    vi.useFakeTimers(); // Use fake timers for setTimeout
  });

  afterEach(() => {
    vi.useRealTimers(); // Restore real timers after each test
  });

  it('renders invitation message and buttons if token exists AND details loaded', () => {
    setupStore({ 
        isFetchingInviteDetails: false, 
        fetchInviteDetailsError: null,
        currentInviteDetails: mockInviteDetails 
    });
    render(<AcceptInvitePage />);
    expect(screen.getByText('Organization Invitation')).toBeInTheDocument();
    expect(screen.getByText(`You have been invited to join ${mockInviteDetails.organizationName}.`)).toBeInTheDocument();
    expect(screen.getByText(/Do you want to accept this invitation\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Accept Invitation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Decline/i })).toBeInTheDocument();
  });

  it('correctly extracts the token from URL parameters', () => {
    render(<AcceptInvitePage />);
    expect(useParams).toHaveBeenCalled();
  });

  it('shows error toast and no buttons if token is missing', () => {
    mockUseParams.mockReturnValue({ token: undefined });
    render(<AcceptInvitePage />);
    expect(toast.error).toHaveBeenCalledWith('Invalid or missing invite token in URL.');
    expect(screen.queryByText(/Do you want to accept this invitation\?/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Accept/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Decline/i })).toBeNull();
  });

  it('calls acceptInvite action when Accept button is clicked', async () => {
    mockAcceptInvite.mockResolvedValue(true);
    setupStore({ currentInviteDetails: mockInviteDetails });

    render(<AcceptInvitePage />);
    const acceptButton = screen.getByRole('button', { name: /Accept Invitation/i });

    expect(acceptButton).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(acceptButton);
    });

    expect(mockAcceptInvite).toHaveBeenCalledWith(tokenFromUrl);

    expect(toast.success).toHaveBeenCalledWith('Invite accepted! Redirecting...');

    await waitFor(() => {
        expect(acceptButton).not.toBeDisabled();
    });

    await act(async () => {
        vi.advanceTimersByTime(2000); 
    });
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/organizations');
  });

  it('calls declineInvite action when Decline button is clicked', async () => {
    mockDeclineInvite.mockResolvedValue(true);
    setupStore({ currentInviteDetails: mockInviteDetails });

    render(<AcceptInvitePage />);
    const declineButton = screen.getByRole('button', { name: /Decline/i });
    expect(declineButton).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(declineButton);
    });

    expect(mockDeclineInvite).toHaveBeenCalledWith(tokenFromUrl);

    expect(toast.info).toHaveBeenCalledWith('Invite declined. Redirecting...');

    await waitFor(() => {
        expect(declineButton).not.toBeDisabled();
    });

    await act(async () => {
        vi.advanceTimersByTime(2000);
    });
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('displays error feedback if acceptInvite fails', async () => {
    const errorMsgFromStore = 'Invalid Token From Store';
    mockAcceptInvite.mockResolvedValue(false);
    setupStore({ 
        currentInviteDetails: mockInviteDetails, 
        error: errorMsgFromStore
    });
    render(<AcceptInvitePage />);
    const acceptButton = screen.getByRole('button', { name: /Accept Invitation/i });
    expect(acceptButton).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(acceptButton);
    });

    expect(mockAcceptInvite).toHaveBeenCalledWith(tokenFromUrl);

    expect(toast.error).toHaveBeenCalledWith(errorMsgFromStore);

    await waitFor(() => {
        expect(acceptButton).not.toBeDisabled();
    });

    await act(async () => {
        vi.advanceTimersByTime(2000);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('displays error feedback if declineInvite fails', async () => {
    const errorMsgFromStore = 'Could not decline From Store';
    mockDeclineInvite.mockResolvedValue(false);
    setupStore({ 
        currentInviteDetails: mockInviteDetails,
        error: errorMsgFromStore 
    });
    render(<AcceptInvitePage />);
    const declineButton = screen.getByRole('button', { name: /Decline/i });
    expect(declineButton).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(declineButton);
    });

    expect(mockDeclineInvite).toHaveBeenCalledWith(tokenFromUrl);

    expect(toast.error).toHaveBeenCalledWith(errorMsgFromStore);

    await waitFor(() => {
        expect(declineButton).not.toBeDisabled();
    });

    await act(async () => {
        vi.advanceTimersByTime(2000);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('calls fetchInviteDetails on mount with token', () => {
    setupStore({ currentInviteDetails: null }); // Ensure details aren't already present
    render(<AcceptInvitePage />);
    expect(mockFetchInviteDetails).toHaveBeenCalledWith(tokenFromUrl);
  });

  it('displays skeleton loading state while fetching invite details', () => {
    setupStore({ isFetchingInviteDetails: true });
    render(<AcceptInvitePage />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(2); // Check for skeletons
    expect(screen.queryByText('Organization Invitation')).toBeNull(); // Real title shouldn't be there
  });

  it('displays error state if fetching invite details fails', () => {
    const fetchErrorMsg = 'Invalid or expired token';
    setupStore({ 
      isFetchingInviteDetails: false, 
      fetchInviteDetailsError: fetchErrorMsg,
      currentInviteDetails: null,
    });
    render(<AcceptInvitePage />);
    expect(screen.getByText('Invalid Invitation')).toBeInTheDocument(); // Check for error card title
    expect(screen.getByText(fetchErrorMsg)).toBeInTheDocument(); // Check for error message
    expect(screen.queryByRole('button', { name: /Accept/i })).toBeNull(); // Buttons shouldn't render
    expect(screen.queryByRole('button', { name: /Decline/i })).toBeNull();
  });

  it('displays organization name and buttons when invite details load successfully', () => {
    setupStore({ 
      isFetchingInviteDetails: false, 
      fetchInviteDetailsError: null,
      currentInviteDetails: mockInviteDetails, // Provide mock details
    });
    render(<AcceptInvitePage />);
    // Check for org name in description
    expect(screen.getByText(`You have been invited to join ${mockInviteDetails.organizationName}.`)).toBeInTheDocument();
    // Check prompt is visible
    expect(screen.getByText(/Do you want to accept this invitation\?/i)).toBeInTheDocument();
    // Check buttons are rendered
    expect(screen.getByRole('button', { name: /Accept Invitation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Decline/i })).toBeInTheDocument();
    // Check error card isn't shown
    expect(screen.queryByText('Invalid Invitation')).toBeNull();
  });

}); 