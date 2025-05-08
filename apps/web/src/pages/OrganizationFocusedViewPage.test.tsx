import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { OrganizationFocusedViewPage } from './OrganizationFocusedViewPage';
import { 
  useOrganizationStore, 
  useAuthStore,
  selectCurrentUserRoleInOrg, // Import the actual selector
  selectCurrentOrganizationId,
  selectCurrentOrganizationDetails,
  selectCurrentOrganizationMembers,
  // selectUserOrganizations is not used by component, so no need to mock its usage
} from '@paynless/store'; 
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useParams, useNavigate } from 'react-router-dom';
import type { 
    User, 
    Organization, 
    OrganizationMemberWithProfile, 
    OrganizationState,
    OrganizationUIState,
    UserProfile,
    // Remove Action type imports again
    // OrganizationActions, 
    // OrganizationUIActions
} from '@paynless/types';

// --- Mocks ---

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual, // Keep actual exports (selectors, types)
    useOrganizationStore: vi.fn(),
    useAuthStore: vi.fn(),
  };
});

vi.mock('../../../hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }));
vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...original,
    useParams: vi.fn(),
    useNavigate: vi.fn(),
  };
});

// Mock child components...
vi.mock('../../../components/organizations/OrganizationDetailsCard', () => ({ OrganizationDetailsCard: () => <div data-testid="org-details-card">Details</div> }));
vi.mock('../../../components/organizations/OrganizationSettingsCard', () => ({ OrganizationSettingsCard: () => <div data-testid="org-settings-card">Settings</div> }));
vi.mock('../../../components/organizations/MemberListCard', () => ({ MemberListCard: () => <div data-testid="member-list-card">Members</div> }));
vi.mock('../../../components/organizations/InviteMemberCard', () => ({ InviteMemberCard: () => <div data-testid="invite-member-card">Invite</div> }));
vi.mock('../../../components/organizations/PendingActionsCard', () => ({ PendingActionsCard: () => <div data-testid="pending-actions-card">Pending</div> }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: ({ className }: { className: string }) => <div data-testid="skeleton" className={className}></div> }));

// --- Test Suite ---
describe('OrganizationFocusedViewPage', () => {
  let mockUseCurrentUser: Mock;
  let mockUseParams: Mock;
  let mockUseNavigate: Mock;
  let mockNavigate: Mock;

  // Store mock functions for actions used by the component
  let fetchUserOrganizationsMock: Mock;
  let setCurrentOrganizationIdMock: Mock;
  let fetchCurrentOrganizationDetailsMock: Mock;
  let fetchCurrentOrganizationMembersMock: Mock;

  const mockUser: User = { id: 'user-123', email: 'test@example.com' };
  const orgIdFromUrl = 'org-abc';

  // Helper to setup mock state and actions
  // Simpler: just define the state and actions needed by this component
  const setupMocksAndState = (stateOverrides: Partial<OrganizationState & OrganizationUIState> = {}, authUserId: string = mockUser.id) => {
    // Define default state structure with correct types
    const defaultOrg: Organization = { id: orgIdFromUrl, name: 'Test Org', deleted_at: null, created_at: '', visibility: 'private', allow_member_chat_creation: true };
    const defaultState: OrganizationState & OrganizationUIState = {
      userOrganizations: [defaultOrg],
      currentOrganizationId: null,
      currentOrganizationDetails: null,
      currentOrganizationMembers: [],
      memberCurrentPage: 1, 
      memberPageSize: 10,
      memberTotalCount: 0,
      currentPendingInvites: [],
      currentPendingRequests: [],
      currentInviteDetails: null,
      isLoading: false,
      isFetchingInviteDetails: false,
      fetchInviteDetailsError: null,
      error: null,
      isCreateModalOpen: false,
      isDeleteDialogOpen: false,
      orgListPage: 1,
      orgListPageSize: 10,
      orgListTotalCount: 1,
    };
    const mockState = { ...defaultState, ...stateOverrides };

    // Define mock actions needed by component
    fetchUserOrganizationsMock = vi.fn();
    setCurrentOrganizationIdMock = vi.fn();
    fetchCurrentOrganizationDetailsMock = vi.fn();
    fetchCurrentOrganizationMembersMock = vi.fn();
    const mockActions = {
      fetchUserOrganizations: fetchUserOrganizationsMock,
      setCurrentOrganizationId: setCurrentOrganizationIdMock,
      fetchCurrentOrganizationDetails: fetchCurrentOrganizationDetailsMock,
      fetchCurrentOrganizationMembers: fetchCurrentOrganizationMembersMock,
    };

    vi.mocked(useAuthStore).mockReturnValue({ user: { id: authUserId } });

    // Configure the main store hook mock
    vi.mocked(useOrganizationStore).mockImplementation((selector?: unknown) => {
      const mockFullState = mockState as OrganizationState & OrganizationUIState;

      if (selector === selectCurrentUserRoleInOrg) {
        return selectCurrentUserRoleInOrg(mockFullState);
      }
      if (selector === selectCurrentOrganizationId) {
        return selectCurrentOrganizationId(mockFullState);
      }
      if (selector === selectCurrentOrganizationDetails) {
        return selectCurrentOrganizationDetails(mockFullState);
      }
      if (selector === selectCurrentOrganizationMembers) {
        return selectCurrentOrganizationMembers(mockFullState);
      }
      
      if (typeof selector === 'function') {
        // Try to apply the function selector (like the component's inline one)
        try {
          // We pass only the state here, as the inline selector in the component
          // only selects state + actions, and we return the actions separately below.
          const result = selector(mockState);
          // Check if it returns the shape the component expects
          if (result && typeof result === 'object' && 'setCurrentOrganizationId' in result) {
             // Return the specific object the component expects
             return {
               setCurrentOrganizationId: mockActions.setCurrentOrganizationId,
               isLoading: mockState.isLoading,
               error: mockState.error,
               fetchUserOrganizations: mockActions.fetchUserOrganizations,
               fetchCurrentOrganizationDetails: mockActions.fetchCurrentOrganizationDetails,
               fetchCurrentOrganizationMembers: mockActions.fetchCurrentOrganizationMembers,
             };
          }
        } catch (e) { /* ignore errors applying unexpected selectors */ }
      }

      // Fallback: Return a default object containing state and the mocked actions
      // This might be hit if the hook is called without any selector
      return { ...mockState, ...mockActions };
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCurrentUser = useCurrentUser as Mock;
    mockUseParams = useParams as Mock;
    mockUseNavigate = useNavigate as Mock;
    mockNavigate = vi.fn();
    mockUseCurrentUser.mockReturnValue({ user: mockUser });
    mockUseParams.mockReturnValue({ orgId: orgIdFromUrl });
    mockUseNavigate.mockReturnValue(mockNavigate);
    setupMocksAndState(); 
  });

  it('sets current organization ID from URL parameter on mount', () => {
    setupMocksAndState({ currentOrganizationId: null });
    render(<OrganizationFocusedViewPage />);
    expect(setCurrentOrganizationIdMock).toHaveBeenCalledWith(orgIdFromUrl);
  });

  it('fetches user organizations if not loaded on mount', () => {
    setupMocksAndState({ userOrganizations: [] });
    render(<OrganizationFocusedViewPage />);
    expect(fetchUserOrganizationsMock).toHaveBeenCalled();
  });

  it('displays skeleton loading state while org data is loading or ID mismatch', () => {
    setupMocksAndState({ isLoading: true, currentOrganizationId: null });
    const { rerender } = render(<OrganizationFocusedViewPage />);
    expect(screen.queryByText(/Loading organization details/i)).toBeNull(); 
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(2);

    setupMocksAndState({ isLoading: false, currentOrganizationId: 'other-org' });
    rerender(<OrganizationFocusedViewPage />);
    expect(screen.queryByText(/Loading organization details/i)).toBeNull(); 
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(2);
  });

  it('renders the correct skeleton structure when loading', () => {
    setupMocksAndState({ isLoading: true, currentOrganizationId: null });
    render(<OrganizationFocusedViewPage />);
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBe(6); 
  });

  it('renders correct cards for member role when loaded', () => {
    const memberProfile: UserProfile = { id: 'user-member', first_name: 'Test', last_name: 'Member', role: 'user', created_at: '', updated_at: '', last_selected_org_id: null };
    const members: OrganizationMemberWithProfile[] = [
      { id: 'mem-m1', user_id: 'user-member', organization_id: orgIdFromUrl, role: 'member', status: 'active', created_at: '', user_profiles: memberProfile }
    ];
    const details: Organization = { id: orgIdFromUrl, name: 'Test Org', deleted_at: null, created_at: '', visibility: 'private', allow_member_chat_creation: true };
    setupMocksAndState({
      currentOrganizationId: orgIdFromUrl, 
      isLoading: false,
      currentOrganizationDetails: details,
      currentOrganizationMembers: members,
    }, 'user-member'); // Pass authUserId
    render(<OrganizationFocusedViewPage />);
    expect(screen.getByTestId('org-details-card')).toBeInTheDocument();
    expect(screen.getByTestId('member-list-card')).toBeInTheDocument();
    expect(screen.queryByTestId('org-settings-card')).toBeNull();
    expect(screen.queryByTestId('invite-member-card')).toBeNull();
    expect(screen.queryByTestId('pending-actions-card')).toBeNull();
  });

  it('renders correct cards for admin role when loaded', () => {
    const adminProfile: UserProfile = { id: 'user-admin', first_name: 'Test', last_name: 'Admin', role: 'admin', created_at: '', updated_at: '', last_selected_org_id: null };
    const members: OrganizationMemberWithProfile[] = [
      { id: 'mem-a1', user_id: 'user-admin', organization_id: orgIdFromUrl, role: 'admin', status: 'active', created_at: '', user_profiles: adminProfile }
    ];
    const details: Organization = { id: orgIdFromUrl, name: 'Test Org', deleted_at: null, created_at: '', visibility: 'private', allow_member_chat_creation: true };
    setupMocksAndState({
      currentOrganizationId: orgIdFromUrl,
      isLoading: false,
      currentOrganizationDetails: details,
      currentOrganizationMembers: members,
    }, 'user-admin'); // Pass authUserId
    render(<OrganizationFocusedViewPage />);
    expect(screen.getByTestId('org-details-card')).toBeInTheDocument();
    expect(screen.getByTestId('member-list-card')).toBeInTheDocument();
    expect(screen.getByTestId('org-settings-card')).toBeInTheDocument();
    expect(screen.getByTestId('invite-member-card')).toBeInTheDocument();
    expect(screen.getByTestId('pending-actions-card')).toBeInTheDocument();
  });

  // --- Redirection Tests ---
  it('redirects if orgId not in userOrganizations list', async () => {
    const details: Organization = { id: orgIdFromUrl, name: 'Test Org', deleted_at: null, created_at: '', visibility: 'private', allow_member_chat_creation: true };
    const otherOrg: Organization = { id: 'other-org', name: 'Another Org', deleted_at: null, created_at: '', visibility: 'private', allow_member_chat_creation: true };
    setupMocksAndState({
      currentOrganizationId: orgIdFromUrl,
      isLoading: false,
      userOrganizations: [otherOrg],
      currentOrganizationDetails: details,
      currentOrganizationMembers: [],
    });
    render(<OrganizationFocusedViewPage />);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/organizations?error=not_found');
    });
  });

  it('redirects if organization details show deleted_at', async () => {
    const memberProfile: UserProfile = { id: 'user-member', first_name: 'Test', last_name: 'Member', role: 'user', created_at: '', updated_at: '', last_selected_org_id: null };
    const members: OrganizationMemberWithProfile[] = [
      { id: 'mem-m1', user_id: 'user-member', organization_id: orgIdFromUrl, role: 'member', status: 'active', created_at: '', user_profiles: memberProfile }
    ];
    const details: Organization = { id: orgIdFromUrl, name: 'Test Org', deleted_at: new Date().toISOString(), created_at: '', visibility: 'private', allow_member_chat_creation: true };
    setupMocksAndState({
      currentOrganizationId: orgIdFromUrl,
      isLoading: false,
      currentOrganizationDetails: details,
      currentOrganizationMembers: members, 
    }, 'user-member');
    render(<OrganizationFocusedViewPage />);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/organizations?error=deleted');
    });
  });

  it('redirects if user is not found in currentOrganizationMembers', async () => {
    const otherMemberProfile: UserProfile = { id: 'other-user', first_name: 'Other', last_name: 'User', role: 'user', created_at: '', updated_at: '', last_selected_org_id: null };
    const members: OrganizationMemberWithProfile[] = [
      { id: 'mem-o1', user_id: 'other-user', organization_id: orgIdFromUrl, role: 'member', status: 'active', created_at: '', user_profiles: otherMemberProfile }
    ];
    const details: Organization = { id: orgIdFromUrl, name: 'Test Org', deleted_at: null, created_at: '', visibility: 'private', allow_member_chat_creation: true };
    setupMocksAndState({
      currentOrganizationId: orgIdFromUrl,
      isLoading: false,
      currentOrganizationDetails: details,
      currentOrganizationMembers: members, 
    }, mockUser.id); // Use default mockUser ID
    render(<OrganizationFocusedViewPage />);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/organizations?error=not_member');
    });
  });

  it('redirects if store has an error', async () => {
    const details: Organization = { id: orgIdFromUrl, name: 'Test Org', deleted_at: null, created_at: '', visibility: 'private', allow_member_chat_creation: true };
    setupMocksAndState({
      currentOrganizationId: orgIdFromUrl,
      isLoading: false,
      error: 'Failed to fetch',
      currentOrganizationDetails: details,
      currentOrganizationMembers: [],
    });
    render(<OrganizationFocusedViewPage />);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/organizations?error=fetch_failed');
    });
  });
}); 