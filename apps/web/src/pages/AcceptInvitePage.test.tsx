import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AcceptInvitePage } from './AcceptInvitePage';
import { useOrganizationStore, useAuthStore } from '@paynless/store';
import { useParams, useNavigate, MemoryRouter, Routes, Route } from 'react-router-dom';
import { toast } from 'sonner';

// --- Mocks ---
vi.mock('@paynless/store', () => ({
  useOrganizationStore: vi.fn(),
  useAuthStore: vi.fn(),
}));
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

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div className="card-mock">{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div className="card-header-mock">{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h4 className="card-title-mock">{children}</h4>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p className="card-description-mock">{children}</p>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div className="card-content-mock">{children}</div>,
  CardFooter: ({ children }: { children: React.ReactNode }) => <div className="card-footer-mock">{children}</div>,
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant }: { children: React.ReactNode, onClick?: () => void, disabled?: boolean, variant?: string }) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant}>
      {children}
    </button>
  ),
}));
vi.mock('@/components/ui/skeleton', () => ({
    Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className}></div>
}));
vi.mock('../components/common/ErrorBoundary', () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

// --- Test Suite ---
describe('AcceptInvitePage', () => {
  const mockAcceptInvite = vi.fn();
  const mockDeclineInvite = vi.fn();
  const mockFetchInviteDetails = vi.fn();
  const mockNavigate = vi.fn();

  const tokenFromUrl = 'test-invite-token';
  const mockInviteDetails = { organizationName: 'Test Invite Org', organizationId: 'org-test-id' };

  const defaultStoreState = {
    acceptInvite: mockAcceptInvite,
    declineInvite: mockDeclineInvite,
    fetchInviteDetails: mockFetchInviteDetails,
    currentInviteDetails: null,
    isFetchingInviteDetails: false,
    fetchInviteDetailsError: null,
    error: null,
  };

  // Helper to render with router context
  const renderWithRouter = (path: string = `/invite/${tokenFromUrl}`) => {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/invite/:token" element={<AcceptInvitePage />} />
          <Route path="/dashboard/organizations" element={<div>Org Dashboard</div>} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useParams).mockReturnValue({ token: tokenFromUrl });
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    vi.mocked(useOrganizationStore).mockReturnValue({ ...defaultStoreState, currentInviteDetails: mockInviteDetails });
    vi.mocked(useAuthStore).mockReturnValue({ navigate: mockNavigate, user: { id: 'test-user' }});

    mockAcceptInvite.mockResolvedValue(true);
    mockDeclineInvite.mockResolvedValue(true);
    mockFetchInviteDetails.mockResolvedValue(mockInviteDetails);
    vi.mocked(useOrganizationStore).mockReturnValue({
        ...defaultStoreState,
        currentInviteDetails: mockInviteDetails
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders invitation message and buttons if token exists AND details loaded', async () => {
    renderWithRouter();
    expect(await screen.findByText('Organization Invitation')).toBeInTheDocument();
    expect(screen.getByText(`You have been invited to join ${mockInviteDetails.organizationName}.`)).toBeInTheDocument();
    expect(screen.getByText(/Do you want to accept this invitation\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Accept Invitation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Decline/i })).toBeInTheDocument();
  });

  it('correctly extracts the token from URL parameters', () => {
    renderWithRouter();
    expect(mockFetchInviteDetails).toHaveBeenCalledWith(tokenFromUrl);
  });

  it('shows error toast and no buttons if token is missing', async () => {
    vi.mocked(useParams).mockReturnValue({ token: undefined }); 
    // Override useOrganizationStore mock for this specific test
    vi.mocked(useOrganizationStore).mockReturnValue({
      ...defaultStoreState,
      currentInviteDetails: null, // Ensure this is null for this test case
      fetchInviteDetails: mockFetchInviteDetails, // Keep other necessary mocks
      acceptInvite: mockAcceptInvite,       // Ensure all functions are available
      declineInvite: mockDeclineInvite,
    });
    renderWithRouter(`/invite/anyTokenForPathMatching`);

    await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Invalid or missing invite token in URL.');
    });
    expect(screen.queryByText(/Do you want to accept this invitation\?/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Accept Invitation/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Decline/i })).toBeNull();
  });

  it('calls acceptInvite action when Accept button is clicked and navigates', async () => {
    vi.useFakeTimers();
    renderWithRouter();

    const acceptButton = await screen.findByRole('button', { name: /Accept Invitation/i });
    fireEvent.click(acceptButton);

    // Wait for the toast message. This ensures that:
    // 1. acceptInvite() was called and its promise resolved.
    // 2. The success block in handleAccept was entered.
    // 3. toast.success() was called.
    // 4. The setTimeout for navigation was scheduled.
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Invite accepted! Redirecting...');
    });
    
    // Now that the setTimeout is scheduled, run the timers.
    vi.runAllTimers(); 

    // Check for navigation.
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/organizations');
    });
  });

  it('calls declineInvite action when Decline button is clicked and navigates', async () => {
    vi.useFakeTimers();
    renderWithRouter();

    const declineButton = await screen.findByRole('button', { name: /Decline/i });
    fireEvent.click(declineButton);

    // Wait for the toast message, ensuring setTimeout for navigation was scheduled.
    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('Invite declined. Redirecting...');
    });

    // Now that the setTimeout is scheduled, run the timers.
    vi.runAllTimers();

    // Check for navigation.
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('displays error feedback if acceptInvite fails', async () => {
    mockAcceptInvite.mockResolvedValue(false);
    vi.mocked(useOrganizationStore).mockReturnValue({
      ...defaultStoreState,
      currentInviteDetails: mockInviteDetails,
      error: 'Accept failed from store'
    });
    renderWithRouter();

    const acceptButton = await screen.findByRole('button', { name: /Accept Invitation/i });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Accept failed from store');
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('displays error feedback if declineInvite fails', async () => {
    mockDeclineInvite.mockResolvedValue(false);
    vi.mocked(useOrganizationStore).mockReturnValue({
      ...defaultStoreState,
      currentInviteDetails: mockInviteDetails,
      error: 'Decline failed from store'
    });
    renderWithRouter();

    const declineButton = await screen.findByRole('button', { name: /Decline/i });
    fireEvent.click(declineButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Decline failed from store');
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('calls fetchInviteDetails on mount with token', () => {
    vi.mocked(useOrganizationStore).mockReturnValue({ ...defaultStoreState, currentInviteDetails: null });
    renderWithRouter();
    expect(mockFetchInviteDetails).toHaveBeenCalledWith(tokenFromUrl);
  });

  it('displays skeleton loading state while fetching invite details', async () => {
    vi.mocked(useOrganizationStore).mockReturnValue({
      ...defaultStoreState,
      currentInviteDetails: null,
      isFetchingInviteDetails: true,
    });
    renderWithRouter();
    expect(await screen.findAllByTestId('skeleton')).toHaveLength(6);
    expect(screen.queryByText('Organization Invitation')).toBeNull();
  });

  it('displays error state if fetching invite details fails', async () => {
    const fetchErrorMsg = "Could not fetch invite details.";
    vi.mocked(useOrganizationStore).mockReturnValue({
      ...defaultStoreState,
      currentInviteDetails: null,
      isFetchingInviteDetails: false,
      fetchInviteDetailsError: fetchErrorMsg,
    });
    renderWithRouter();
    expect(await screen.findByText('Invalid Invitation')).toBeInTheDocument();
    expect(screen.getByText(fetchErrorMsg)).toBeInTheDocument();
  });

  it('displays generic invite message if details load but name is missing', async () => {
    vi.mocked(useOrganizationStore).mockReturnValue({
      ...defaultStoreState,
      currentInviteDetails: { organizationName: '', organizationId: 'org-test-id' },
      isFetchingInviteDetails: false,
    });
    renderWithRouter();
    expect(await screen.findByText('You have been invited to join .')).toBeInTheDocument();
  });
}); 