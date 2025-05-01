import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { OrganizationFocusedViewPage } from '../../../pages/OrganizationFocusedViewPage'; // Adjust path
import { useOrganizationStore } from '@paynless/store';
import { useCurrentUser } from '../../../hooks/useCurrentUser'; // Adjust path
import { useParams, useNavigate } from 'react-router-dom';
import { logger } from '@paynless/utils'; // Import logger for potential mocking
import { User, Organization, OrganizationMemberWithProfile } from '@paynless/types'; // Import necessary types

// --- Mocks ---
vi.mock('@paynless/store', () => ({ useOrganizationStore: vi.fn() }));
vi.mock('../../../hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }));
vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...original, // Preserve other exports
    useParams: vi.fn(),
    useNavigate: vi.fn(),
  };
});
vi.mock('@paynless/utils', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })); // Mock logger methods

// Mock child components
vi.mock('../../../components/organizations/OrganizationDetailsCard', () => ({ OrganizationDetailsCard: () => <div data-testid="org-details-card">Details</div> }));
vi.mock('../../../components/organizations/OrganizationSettingsCard', () => ({ OrganizationSettingsCard: () => <div data-testid="org-settings-card">Settings</div> }));
vi.mock('../../../components/organizations/MemberListCard', () => ({ MemberListCard: () => <div data-testid="member-list-card">Members</div> }));
vi.mock('../../../components/organizations/InviteMemberCard', () => ({ InviteMemberCard: () => <div data-testid="invite-member-card">Invite</div> }));
vi.mock('../../../components/organizations/PendingActionsCard', () => ({ PendingActionsCard: () => <div data-testid="pending-actions-card">Pending</div> }));

vi.mock('@/components/ui/skeleton', () => ({ Skeleton: ({ className }: { className: string }) => <div data-testid="skeleton" className={className}></div> }));

// --- Test Suite ---
describe('OrganizationFocusedViewPage', () => {
  let mockUseOrganizationStore: Mock;
  let mockUseCurrentUser: Mock;
  let mockUseParams: Mock;
  let mockUseNavigate: Mock;
  let mockNavigate: Mock;

  let mockFetchUserOrganizations: Mock;
  let mockSetCurrentOrganizationId: Mock;
  let mockSelectCurrentUserRole: Mock;
  let mockFetchOrganizationDetails: Mock;
  let mockFetchCurrentOrganizationMembers: Mock;

  const mockUser = { id: 'user-123', email: 'test@example.com' } as User;
  const orgIdFromUrl = 'org-abc';

  // Helper to setup default store state
  const setupStore = (overrides = {}) => {
    const defaultState = {
      userOrganizations: [{ id: orgIdFromUrl, name: 'Test Org', deleted_at: null }] as Organization[],
      fetchUserOrganizations: mockFetchUserOrganizations,
      setCurrentOrganizationId: mockSetCurrentOrganizationId,
      currentOrganizationId: null,
      currentOrganizationDetails: null,
      currentOrganizationMembers: [] as OrganizationMemberWithProfile[],
      isLoading: false,
      error: null,
      selectCurrentUserRoleInOrg: mockSelectCurrentUserRole,
      fetchOrganizationDetails: mockFetchOrganizationDetails,
      fetchCurrentOrganizationMembers: mockFetchCurrentOrganizationMembers,
      ...overrides, // Apply test-specific state
    };
    mockUseOrganizationStore.mockReturnValue(defaultState);
    return defaultState;
  };

  beforeEach(() => {
    vi.clearAllMocks(); // Clear mocks between tests

    // Setup mock functions
    mockFetchUserOrganizations = vi.fn();
    mockSetCurrentOrganizationId = vi.fn();
    mockSelectCurrentUserRole = vi.fn().mockReturnValue('member'); // Default to member
    mockFetchOrganizationDetails = vi.fn();
    mockFetchCurrentOrganizationMembers = vi.fn();
    mockNavigate = vi.fn();

    // Setup hook mocks
    mockUseOrganizationStore = useOrganizationStore as Mock;
    mockUseCurrentUser = useCurrentUser as Mock;
    mockUseParams = useParams as Mock;
    mockUseNavigate = useNavigate as Mock;

    // Default return values for hooks
    setupStore(); // Setup default store state
    mockUseCurrentUser.mockReturnValue({ user: mockUser });
    mockUseParams.mockReturnValue({ orgId: orgIdFromUrl });
    mockUseNavigate.mockReturnValue(mockNavigate);
  });

  it('sets current organization ID from URL parameter on mount', () => {
    setupStore({ currentOrganizationId: null }); // Ensure it's not already set
    render(<OrganizationFocusedViewPage />);
    expect(mockSetCurrentOrganizationId).toHaveBeenCalledWith(orgIdFromUrl);
  });

  it('fetches user organizations if not loaded on mount', () => {
    setupStore({ userOrganizations: [] });
    render(<OrganizationFocusedViewPage />);
    expect(mockFetchUserOrganizations).toHaveBeenCalled();
  });

  it('displays skeleton loading state while org data is loading or ID mismatch', () => {
    // Scenario 1: isLoading is true
    setupStore({ isLoading: true, currentOrganizationId: null });
    const { rerender } = render(<OrganizationFocusedViewPage />);
    // Check for multiple skeleton elements instead of text
    expect(screen.queryByText(/Loading organization details/i)).toBeNull(); // Text should be gone
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(2); // Check for presence of multiple skeletons

    // Scenario 2: ID mismatch (store not updated yet)
    setupStore({ isLoading: false, currentOrganizationId: 'other-org' });
    rerender(<OrganizationFocusedViewPage />);
    expect(screen.queryByText(/Loading organization details/i)).toBeNull(); // Text should be gone
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(2); // Check for skeletons
  });

  // Explicit test for skeleton structure
  it('renders the correct skeleton structure when loading', () => {
    setupStore({ isLoading: true, currentOrganizationId: null });
    render(<OrganizationFocusedViewPage />);
    
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBe(6); // Based on 1 title + 5 card skeletons in the component
    
    // Optionally, check classes or structure more precisely if needed
    // e.g., expect(skeletons[0]).toHaveClass('mb-6'); // Title skeleton
  });

  it('renders correct cards for member role when loaded', () => {
    setupStore({
      currentOrganizationId: orgIdFromUrl, // Ensure correct org is set
      isLoading: false,
      currentOrganizationDetails: { id: orgIdFromUrl, name: 'Test Org', deleted_at: null, created_at: '', visibility: 'private' },
      currentOrganizationMembers: [{ id: 'mem-1', user_id: mockUser.id, role: 'member' }] as any, // Mock member data
      selectCurrentUserRoleInOrg: () => 'member',
    });
    render(<OrganizationFocusedViewPage />);
    expect(screen.getByTestId('org-details-card')).toBeInTheDocument();
    expect(screen.getByTestId('member-list-card')).toBeInTheDocument();
    expect(screen.queryByTestId('org-settings-card')).toBeNull();
    expect(screen.queryByTestId('invite-member-card')).toBeNull();
    expect(screen.queryByTestId('pending-actions-card')).toBeNull();
  });

  it('renders correct cards for admin role when loaded', () => {
    setupStore({
      currentOrganizationId: orgIdFromUrl,
      isLoading: false,
      currentOrganizationDetails: { id: orgIdFromUrl, name: 'Test Org', deleted_at: null, created_at: '', visibility: 'private' },
      currentOrganizationMembers: [{ id: 'mem-1', user_id: mockUser.id, role: 'admin' }] as any, 
      selectCurrentUserRoleInOrg: () => 'admin',
    });
    render(<OrganizationFocusedViewPage />);
    expect(screen.getByTestId('org-details-card')).toBeInTheDocument();
    expect(screen.getByTestId('member-list-card')).toBeInTheDocument();
    expect(screen.getByTestId('org-settings-card')).toBeInTheDocument();
    expect(screen.getByTestId('invite-member-card')).toBeInTheDocument();
    expect(screen.getByTestId('pending-actions-card')).toBeInTheDocument();
  });

  // --- Redirection Tests ---
  it('redirects if orgId not in userOrganizations list', async () => {
    setupStore({
      currentOrganizationId: orgIdFromUrl,
      isLoading: false,
      userOrganizations: [{ organization_id: 'other-org', name: 'Another Org' }] as any, // User doesn't belong to orgIdFromUrl
      currentOrganizationDetails: { id: orgIdFromUrl, name: 'Test Org' }, // Details might still load initially
      currentOrganizationMembers: [],
    });
    render(<OrganizationFocusedViewPage />);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/organizations?error=not_found');
    });
  });

  it('redirects if organization details show deleted_at', async () => {
    setupStore({
      currentOrganizationId: orgIdFromUrl,
      isLoading: false,
      currentOrganizationDetails: { id: orgIdFromUrl, name: 'Test Org', deleted_at: new Date().toISOString() } as Organization,
      currentOrganizationMembers: [{ id: 'mem-1', user_id: mockUser.id, role: 'member' }] as any, 
    });
    render(<OrganizationFocusedViewPage />);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/organizations?error=deleted');
    });
  });

  it('redirects if user is not found in currentOrganizationMembers', async () => {
    setupStore({
      currentOrganizationId: orgIdFromUrl,
      isLoading: false,
      currentOrganizationDetails: { id: orgIdFromUrl, name: 'Test Org', deleted_at: null } as Organization,
      currentOrganizationMembers: [{ id: 'mem-2', user_id: 'other-user', role: 'member' }] as any, // Current user not in list
    });
    render(<OrganizationFocusedViewPage />);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/organizations?error=not_member');
    });
  });

  it('redirects if store has an error', async () => {
    setupStore({
      currentOrganizationId: orgIdFromUrl,
      isLoading: false,
      error: 'Failed to fetch',
      currentOrganizationDetails: { id: orgIdFromUrl, name: 'Test Org' },
      currentOrganizationMembers: [],
    });
    render(<OrganizationFocusedViewPage />);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/organizations?error=fetch_failed');
    });
  });

  // it('redirects if orgId is missing from URL', () => {
  //   mockUseParams.mockReturnValue({ orgId: undefined });
  //   setupStore();
  //   render(<OrganizationFocusedViewPage />);
  //   expect(mockNavigate).toHaveBeenCalledWith('/dashboard/organizations'); // Redirect to hub if no ID
  // });

}); 