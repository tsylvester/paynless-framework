import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { OrganizationHubPage } from './OrganizationHubPage'; // Adjust path relative to tests/unit/pages
import { useOrganizationStore, selectCurrentUserRoleInOrg, useAuthStore } from '@paynless/store';
import { useCurrentUser } from '../hooks/useCurrentUser'; // Adjust path relative to tests/unit/pages
import { User } from '@supabase/supabase-js';
import { UserOrganizationLink, Organization, OrganizationMemberWithProfile } from '@paynless/types'; // Add Organization types

// --- Mocks ---

// The global mockStoreState is no longer the primary way to control the store.
// const mockStoreState = { ... }; // Consider removing or minimizing its use.

// Mock the Zustand store using the more robust pattern
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  const mockUseAuthStore = vi.fn();
  (mockUseAuthStore as any).getState = vi.fn().mockReturnValue({ user: null });
  return {
    ...actual,
    useOrganizationStore: vi.fn(),
    useAuthStore: mockUseAuthStore,
  };
});

// Mock the current user hook
vi.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }));

// Mock child components with corrected paths and robust style
vi.mock('../components/organizations/OrganizationListCard', async (importOriginal) => {
  const original = await importOriginal<typeof import('../components/organizations/OrganizationListCard')>();
  return { ...original, OrganizationListCard: () => <div data-testid="org-list-card">OrgListCard Mock</div> };
});
vi.mock('../components/organizations/OrganizationDetailsCard', async (importOriginal) => {
  const original = await importOriginal<typeof import('../components/organizations/OrganizationDetailsCard')>();
  return { ...original, OrganizationDetailsCard: () => <div data-testid="org-details-card">OrgDetailsCard Mock</div> };
});
vi.mock('../components/organizations/OrganizationSettingsCard', async (importOriginal) => {
  const original = await importOriginal<typeof import('../components/organizations/OrganizationSettingsCard')>();
  return { ...original, OrganizationSettingsCard: () => <div data-testid="org-settings-card">OrgSettingsCard Mock</div> };
});
vi.mock('../components/organizations/MemberListCard', async (importOriginal) => {
  const original = await importOriginal<typeof import('../components/organizations/MemberListCard')>();
  return { ...original, MemberListCard: () => <div data-testid="member-list-card">MemberListCard Mock</div> };
});
vi.mock('../components/organizations/InviteMemberCard', async (importOriginal) => {
  const original = await importOriginal<typeof import('../components/organizations/InviteMemberCard')>();
  return { ...original, InviteMemberCard: () => <div data-testid="invite-member-card">InviteMemberCard Mock</div> };
});
vi.mock('../components/organizations/PendingActionsCard', async (importOriginal) => {
  const original = await importOriginal<typeof import('../components/organizations/PendingActionsCard')>();
  return { ...original, PendingActionsCard: () => <div data-testid="pending-actions-card">PendingActionsCard Mock</div> };
});

vi.mock('@/components/ui/skeleton', () => ({ Skeleton: ({ className }: { className: string }) => <div data-testid="skeleton" role="generic" data-slot="skeleton" className={className}></div> }));

// --- Test Suite ---

describe('OrganizationHubPage', () => {
  let fetchUserOrganizationsMock: Mock;
  let setCurrentOrganizationIdMock: Mock;
  // selectCurrentUserRoleInOrgMock is removed as we'll use the real selector or specific mock logic
  // let fetchCurrentOrganizationDetailsMock: Mock; // This was not used for assertions, can be removed if still unused.

  const mockUser = { id: 'user-123' } as User;
  const defaultOrgId = 'org-default'; // For convenience if needed

  // Renamed and refactored setup helper
  const setupMocksAndState = (stateOverrides: Partial<OrganizationState & OrganizationUIState> = {}, authUserId: string = mockUser.id) => {
    const defaultState: OrganizationState & OrganizationUIState = {
      userOrganizations: [],
      currentOrganizationId: null,
      currentOrganizationDetails: null,
      currentOrganizationMembers: [],
      isLoading: false,
      error: null,
      // Add any other required fields from OrganizationState & OrganizationUIState with defaults
      memberCurrentPage: 1, 
      memberPageSize: 10,
      memberTotalCount: 0,
      currentPendingInvites: [],
      currentPendingRequests: [],
      currentInviteDetails: null,
      isFetchingInviteDetails: false,
      fetchInviteDetailsError: null,
      isCreateModalOpen: false,
      isDeleteDialogOpen: false,
      orgListPage: 1,
      orgListPageSize: 10,
      orgListTotalCount: 0, 
    };
    const currentMockState = { ...defaultState, ...stateOverrides };

    // Define mock actions for this specific setup
    fetchUserOrganizationsMock = vi.fn();
    setCurrentOrganizationIdMock = vi.fn();
    // Other actions if needed by the component and not just for state setting
    const mockActions = {
      fetchUserOrganizations: fetchUserOrganizationsMock,
      setCurrentOrganizationId: setCurrentOrganizationIdMock,
      fetchCurrentOrganizationDetails: vi.fn(), // Mock actual store actions
      fetchCurrentOrganizationMembers: vi.fn(),
      // ... any other actions OrganizationHubPage might call
    };

    // Configure AuthStore mocks for this setup
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: authUserId } } as any);
    vi.mocked((useAuthStore as any).getState).mockReturnValue({ user: { id: authUserId } } as any);

    // Configure OrganizationStore mock for this setup
    vi.mocked(useOrganizationStore).mockImplementation((selector?: (state: any) => any) => {
      const fullMockedStoreStateAndActions = { ...currentMockState, ...mockActions };
      
      if (selector === selectCurrentUserRoleInOrg) {
        if (!authUserId || !currentMockState.currentOrganizationId || !currentMockState.currentOrganizationMembers || currentMockState.currentOrganizationMembers.length === 0) {
          return null;
        }
        const currentUserMemberInfo = currentMockState.currentOrganizationMembers.find(member => member.user_id === authUserId);
        return currentUserMemberInfo ? currentUserMemberInfo.role : null;
      }

      if (typeof selector === 'function') {
        return selector(fullMockedStoreStateAndActions);
      }
      return fullMockedStoreStateAndActions;
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCurrentUser).mockReturnValue({ user: mockUser, isLoading: false, error: null });
    // Call setupMocksAndState with default empty state and default user
    // This ensures mocks are fresh for each test.
    setupMocksAndState(); 
  });

  // Test cases will need to be updated to use setupMocksAndState() for their specific scenarios.
  // For example: setupMocksAndState({ isLoading: true, userOrganizations: [] });

  it('does not fetch organizations if user is not present', () => {
    vi.mocked(useCurrentUser).mockReturnValue({ user: null, isLoading: false, error: null });
    // setupMocksAndState() called in beforeEach already sets up fetchUserOrganizationsMock
    render(<OrganizationHubPage />);
    expect(fetchUserOrganizationsMock).not.toHaveBeenCalled();
  });
  
  it('displays skeleton loading state initially when loading and no organizations loaded', () => {
     setupMocksAndState({ isLoading: true, userOrganizations: [] });
     render(<OrganizationHubPage />);
     const skeletonElements = screen.queryAllByTestId('skeleton'); 
     expect(skeletonElements.length).toBeGreaterThan(0); 
  });

  it('does not display loading indicator text if not loading, even with no organizations', () => {
    setupMocksAndState({
      isLoading: false,
      userOrganizations: [],
    });
    render(<OrganizationHubPage />);
    // Skeletons should not be present - use data-testid
    expect(screen.queryAllByTestId('skeleton')).toHaveLength(0);
    expect(screen.getByText('You are not part of any organizations yet. Create one!')).toBeInTheDocument();
  });

  it('does NOT set a default organization if organizations load and none is selected', async () => {
    const organizations: UserOrganizationLink[] = [
        { id: 'org-1', name: 'Org One', membership_id: 'mem-1' },
        { id: 'org-2', name: 'Org Two', membership_id: 'mem-2' }
    ];
    
    // Setup the state: orgs are loaded, user exists, no currentId, not loading
    setupMocksAndState({
      userOrganizations: organizations,
      currentOrganizationId: null, 
      isLoading: false,
    });

    // Render the component 
    render(<OrganizationHubPage />); 

    // Wait briefly to ensure any potential effect would have run
    await new Promise(resolve => setTimeout(resolve, 100)); 

    // Assert that setCurrentOrganizationId was *not* called
    expect(setCurrentOrganizationIdMock).not.toHaveBeenCalled();
  });

  it('does not set current organization if one is already selected', async () => {
    const organizations = [{ id: 'org-1', name: 'Org One', membership_id: 'mem-1' }];
     setupMocksAndState({
       userOrganizations: organizations,
       currentOrganizationId: 'org-existing', // Already selected
       isLoading: false,
     });
     render(<OrganizationHubPage />);
     // Wait a short period to ensure effects *would* have run if they were going to
     await new Promise(resolve => setTimeout(resolve, 100)); 
     expect(setCurrentOrganizationIdMock).not.toHaveBeenCalled();
  });

  it('renders OrganizationListCard', () => {
    setupMocksAndState(); // Use default setup
    render(<OrganizationHubPage />);
    expect(screen.getByTestId('org-list-card')).toBeInTheDocument();
  });

  it('renders message when no organizations exist', () => {
    setupMocksAndState({
        userOrganizations: [],
        isLoading: false,
    });
    render(<OrganizationHubPage />);
    expect(screen.getByText('You are not part of any organizations yet. Create one!')).toBeInTheDocument();
    expect(screen.queryByTestId('org-details-card')).toBeNull();
  });

  it('renders message to select org when orgs exist but none selected', () => {
    const organizations = [{ id: 'org-1', name: 'Org One', membership_id: 'mem-1' }];
     setupMocksAndState({
       userOrganizations: organizations,
       currentOrganizationId: null,
       isLoading: false,
     });
     render(<OrganizationHubPage />);
     expect(screen.getByText('Select an organization to view details.')).toBeInTheDocument();
     expect(screen.queryByTestId('org-details-card')).toBeNull();
  });

  it('renders correct cards for a selected organization (member role)', () => {
     setupMocksAndState({
       currentOrganizationId: 'org-1',
       userOrganizations: [{ id: 'org-1', name: 'Org One', membership_id: 'mem-1' }],
       isLoading: false,
     });
     render(<OrganizationHubPage />);
     expect(screen.getByTestId('org-details-card')).toBeInTheDocument();
     expect(screen.getByTestId('member-list-card')).toBeInTheDocument();
     expect(screen.queryByTestId('org-settings-card')).toBeNull();
     expect(screen.queryByTestId('invite-member-card')).toBeNull();
     expect(screen.queryByTestId('pending-actions-card')).toBeNull();
  });

   it('renders correct cards for a selected organization (admin role)', () => {
     // Ensure the authUserId matches a user_id in currentOrganizationMembers with role 'admin'
     const adminUserId = 'user-admin-hub';
     const adminOrgMember: OrganizationMemberWithProfile = {
       id: 'mem-admin-1',
       user_id: adminUserId,
       organization_id: 'org-1',
       role: 'admin',
       status: 'active',
       created_at: new Date().toISOString(),
       user_profiles: { 
         id: adminUserId, 
         first_name: 'Admin', 
         last_name: 'HubUser', 
         role: 'admin', // User profile role, can differ from org membership role but often aligned for admins
         created_at: new Date().toISOString(), 
         updated_at: new Date().toISOString(),
         last_selected_org_id: null,
       }
     };
     const orgDetails: Organization = { 
        id: 'org-1', name: 'Org One Admin', visibility: 'private', 
        allow_member_chat_creation: true, created_at: new Date().toISOString(), deleted_at: null 
     };

     setupMocksAndState({
       currentOrganizationId: 'org-1',
       userOrganizations: [{ id: 'org-1', name: 'Org One Admin', membership_id: 'mem-link-1' } as UserOrganizationLink],
       currentOrganizationDetails: orgDetails,
       currentOrganizationMembers: [adminOrgMember],
       isLoading: false,
     }, adminUserId); // Pass the adminUserId as authUserId

     render(<OrganizationHubPage />);
     expect(screen.getByTestId('org-details-card')).toBeInTheDocument();
     expect(screen.getByTestId('member-list-card')).toBeInTheDocument();
     expect(screen.getByTestId('org-settings-card')).toBeInTheDocument();
     expect(screen.getByTestId('invite-member-card')).toBeInTheDocument();
     expect(screen.getByTestId('pending-actions-card')).toBeInTheDocument();
  });

}); 