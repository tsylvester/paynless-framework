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
  
  // Create a mock for useAuthStore that also has a mocked getState
  const mockUseAuthStore = vi.fn();
  // Default mock for getState, can be overridden in tests if needed for specific userId
  (mockUseAuthStore as any).getState = vi.fn().mockReturnValue({ user: null }); 

  return {
    ...actual, 
    useOrganizationStore: vi.fn(), 
    useAuthStore: mockUseAuthStore, // Use our enhanced mock
  };
});

vi.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }));
vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...original,
    useParams: vi.fn(),
    useNavigate: vi.fn(),
  };
});

// Mock child components...
vi.mock('../components/organizations/OrganizationDetailsCard', async (importOriginal) => {
  const original = await importOriginal<typeof import('../components/organizations/OrganizationDetailsCard')>();
  return {
    ...original,
    OrganizationDetailsCard: () => <div data-testid="org-details-card">Details Mocked Robustly</div>,
  };
});

// Apply robust mocking to all card components
vi.mock('../components/organizations/OrganizationSettingsCard', async (importOriginal) => {
  const original = await importOriginal<typeof import('../components/organizations/OrganizationPrivacyCard')>();
  return {
    ...original,
    OrganizationSettingsCard: () => <div data-testid="org-settings-card">Settings Mocked Robustly</div>,
  };
});

vi.mock('../components/organizations/MemberListCard', async (importOriginal) => {
  const original = await importOriginal<typeof import('../components/organizations/MemberListCard')>();
  return {
    ...original,
    MemberListCard: () => <div data-testid="member-list-card">Members Mocked Robustly</div>,
  };
});

vi.mock('../components/organizations/InviteMemberCard', async (importOriginal) => {
  const original = await importOriginal<typeof import('../components/organizations/InviteMemberCard')>();
  return {
    ...original,
    InviteMemberCard: () => <div data-testid="invite-member-card">Invite Mocked Robustly</div>,
  };
});

vi.mock('../components/organizations/PendingActionsCard', async (importOriginal) => {
  const original = await importOriginal<typeof import('../components/organizations/PendingActionsCard')>();
  return {
    ...original,
    PendingActionsCard: () => <div data-testid="pending-actions-card">Pending Mocked Robustly</div>,
  };
});

vi.mock('@/components/ui/skeleton', () => ({ Skeleton: ({ className }: { className: string }) => <div data-testid="skeleton" className={className}></div> }));

// --- Test Suite ---
describe('OrganizationFocusedViewPage', () => {
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

    // Configure the mocked useAuthStore hook's return value for direct calls
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: authUserId } } as any);
    // Configure the mocked useAuthStore.getState for selectors
    vi.mocked((useAuthStore as any).getState).mockReturnValue({ user: { id: authUserId } } as any);

    // Mock useCurrentUser to return a user object with the current authUserId for this specific setup
    // This ensures the user object in the component aligns with the test's intended authenticated user
    vi.mocked(useCurrentUser).mockReturnValue({ user: { ...mockUser, id: authUserId } } as any); 

    // Configure the main store hook mock
    vi.mocked(useOrganizationStore).mockImplementation((selector?: (state: OrganizationState & OrganizationUIState & typeof mockActions) => any) => {
      const fullMockedStoreStateAndActions = { ...mockState, ...mockActions };

      // Special handling for selectCurrentUserRoleInOrg to bypass its internal auth store dependency
      if (selector === selectCurrentUserRoleInOrg) {
        // Re-implement the core logic of selectCurrentUserRoleInOrg using our controlled authUserId and mockState
        if (!authUserId || !mockState.currentOrganizationId || !mockState.currentOrganizationMembers || mockState.currentOrganizationMembers.length === 0) {
          return null;
        }
        const currentUserMemberInfo = mockState.currentOrganizationMembers.find(member => member.user_id === authUserId);
        return currentUserMemberInfo ? currentUserMemberInfo.role : null;
      }

      // Original behavior for other selectors or no selector
      if (typeof selector === 'function') {
        return selector(fullMockedStoreStateAndActions);
      }
      return fullMockedStoreStateAndActions;
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams = useParams as Mock;
    mockUseNavigate = useNavigate as Mock;
    mockNavigate = vi.fn();
    mockUseParams.mockReturnValue({ orgId: orgIdFromUrl });
    mockUseNavigate.mockReturnValue(mockNavigate);
    
    // Call setupMocksAndState AFTER other mocks are cleared and reset, especially for useAuthStore.getState
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