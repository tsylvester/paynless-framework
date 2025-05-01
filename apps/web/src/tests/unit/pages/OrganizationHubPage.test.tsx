import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { OrganizationHubPage } from '../../../pages/OrganizationHubPage'; // Adjust path relative to tests/unit/pages
import { useOrganizationStore } from '@paynless/store';
import { useCurrentUser } from '../../../hooks/useCurrentUser'; // Adjust path relative to tests/unit/pages
import { User } from '@supabase/supabase-js';
import { UserOrganizationLink, Organization, OrganizationMemberWithProfile } from '@paynless/types'; // Add Organization types

// --- Mocks ---

// Create a mutable object to hold the mock store state and actions
const mockStoreState = {
  userOrganizations: [] as UserOrganizationLink[], // Use specific type
  fetchUserOrganizations: vi.fn(),
  setCurrentOrganizationId: vi.fn(),
  currentOrganizationId: null as string | null,
  currentOrganizationDetails: null as Organization | null,
  currentOrganizationMembers: [] as OrganizationMemberWithProfile[],
  isLoading: false,
  error: null as string | null,
  selectCurrentUserRoleInOrg: vi.fn(() => 'member'), // Default mock implementation
  fetchOrganizationDetails: vi.fn(),
  fetchCurrentOrganizationMembers: vi.fn(),
};

// Mock the Zustand store using the shared state object
vi.mock('@paynless/store', () => {
  const useOrganizationStoreMock = vi.fn((selector) => {
    if (typeof selector === 'function') {
      return selector(mockStoreState);
    }
    return mockStoreState;
  });
  useOrganizationStoreMock.getState = vi.fn(() => mockStoreState);
  return { useOrganizationStore: useOrganizationStoreMock };
});

// Mock the current user hook
vi.mock('../../../hooks/useCurrentUser', () => ({
  useCurrentUser: vi.fn(),
}));

// Mock child components
vi.mock('../../../components/organizations/OrganizationListCard', () => ({
  OrganizationListCard: () => <div data-testid="org-list-card">OrgListCard</div>,
}));
vi.mock('../../../components/organizations/OrganizationDetailsCard', () => ({
  OrganizationDetailsCard: () => <div data-testid="org-details-card">OrgDetailsCard</div>,
}));
vi.mock('../../../components/organizations/OrganizationSettingsCard', () => ({
  OrganizationSettingsCard: () => <div data-testid="org-settings-card">OrgSettingsCard</div>,
}));
vi.mock('../../../components/organizations/MemberListCard', () => ({
  MemberListCard: () => <div data-testid="member-list-card">MemberListCard</div>,
}));
vi.mock('../../../components/organizations/InviteMemberCard', () => ({
  InviteMemberCard: () => <div data-testid="invite-member-card">InviteMemberCard</div>,
}));
vi.mock('../../../components/organizations/PendingActionsCard', () => ({
  PendingActionsCard: () => <div data-testid="pending-actions-card">PendingActionsCard</div>,
}));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: ({ className }: { className: string }) => <div data-testid="skeleton" role="generic" data-slot="skeleton" className={className}></div> }));


// --- Test Suite ---

describe('OrganizationHubPage', () => {
  // Store mock function references for assertions
  let fetchUserOrganizationsMock: Mock;
  let setCurrentOrganizationIdMock: Mock;
  let selectCurrentUserRoleInOrgMock: Mock;
  // Remove unused mock function refs
  // let mockFetchOrganizationDetails: Mock;
  // let mockFetchCurrentOrganizationMembers: Mock;

  // Keep mock hook reference if needed, but prefer interacting via mockStoreState
  let mockUseCurrentUser: Mock;

  const mockUser = { id: 'user-123' } as User; // Mock a basic user object

  // Helper to setup store state by modifying the mockStoreState object
  const setupStore = (overrides = {}) => {
    // Reset mock functions within mockStoreState
    fetchUserOrganizationsMock = mockStoreState.fetchUserOrganizations = vi.fn();
    setCurrentOrganizationIdMock = mockStoreState.setCurrentOrganizationId = vi.fn();
    selectCurrentUserRoleInOrgMock = mockStoreState.selectCurrentUserRoleInOrg = vi.fn().mockReturnValue('member');
    mockStoreState.fetchOrganizationDetails = vi.fn(); // Reset unused ones too for safety
    mockStoreState.fetchCurrentOrganizationMembers = vi.fn();

    // Define default state structure
    const defaultState = {
      userOrganizations: [],
      currentOrganizationId: null,
      currentOrganizationDetails: null,
      currentOrganizationMembers: [],
      isLoading: false,
      error: null,
    };
    
    // Merge defaults and overrides into the mockStoreState
    Object.assign(mockStoreState, defaultState, overrides);

    // Ensure the getState mock always returns the *current* state object
    (useOrganizationStore.getState as Mock).mockReturnValue(mockStoreState);
  };

  beforeEach(() => {
    // Clear all mocks (including vi.fn mocks inside mockStoreState)
    vi.clearAllMocks();

    // Reset the shared mock state object itself
    Object.assign(mockStoreState, {
      userOrganizations: [], fetchUserOrganizations: vi.fn(), setCurrentOrganizationId: vi.fn(),
      currentOrganizationId: null, currentOrganizationDetails: null, currentOrganizationMembers: [],
      isLoading: false, error: null, selectCurrentUserRoleInOrg: vi.fn(() => 'member'),
      fetchOrganizationDetails: vi.fn(), fetchCurrentOrganizationMembers: vi.fn(),
    });
    // Reset the store hook mocks specifically
    (useOrganizationStore as Mock).mockClear();
    (useOrganizationStore.getState as Mock).mockClear();

    // Setup other hook mocks
    mockUseCurrentUser = useCurrentUser as Mock;
    mockUseCurrentUser.mockReturnValue({ user: mockUser }); // Default: user is present

    // Call setupStore AFTER resetting everything
    setupStore();
  });

  it('does not fetch organizations if user is not present', () => {
    // This test remains valid conceptually, checking that the component *doesn't*
    // somehow trigger a fetch if the user isn't there (even though it doesn't fetch anyway)
    mockUseCurrentUser.mockReturnValue({ user: null });
    setupStore({ userOrganizations: [] }); 
    render(<OrganizationHubPage />);
    expect(fetchUserOrganizationsMock).not.toHaveBeenCalled();
  });
  
  it('displays skeleton loading state initially when loading and no organizations loaded', () => {
     setupStore({ 
       isLoading: true,
       userOrganizations: [],
     });
     render(<OrganizationHubPage />);
     // Check for the presence of skeleton elements using data-testid
     const skeletonElements = screen.queryAllByTestId('skeleton'); 
     expect(skeletonElements.length).toBeGreaterThan(0); 
  });

  it('does not display loading indicator text if not loading, even with no organizations', () => {
    setupStore({
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
    setupStore({
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
     setupStore({
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
    setupStore(); // Use default setup
    render(<OrganizationHubPage />);
    expect(screen.getByTestId('org-list-card')).toBeInTheDocument();
  });

  it('renders message when no organizations exist', () => {
    setupStore({
        userOrganizations: [],
        isLoading: false,
    });
    render(<OrganizationHubPage />);
    expect(screen.getByText('You are not part of any organizations yet. Create one!')).toBeInTheDocument();
    expect(screen.queryByTestId('org-details-card')).toBeNull();
  });

  it('renders message to select org when orgs exist but none selected', () => {
    const organizations = [{ id: 'org-1', name: 'Org One', membership_id: 'mem-1' }];
     setupStore({
       userOrganizations: organizations,
       currentOrganizationId: null,
       isLoading: false,
     });
     render(<OrganizationHubPage />);
     expect(screen.getByText('Select an organization to view details.')).toBeInTheDocument();
     expect(screen.queryByTestId('org-details-card')).toBeNull();
  });

  it('renders correct cards for a selected organization (member role)', () => {
     setupStore({
       currentOrganizationId: 'org-1',
       userOrganizations: [{ id: 'org-1', name: 'Org One', membership_id: 'mem-1' }],
       selectCurrentUserRoleInOrg: vi.fn(() => 'member'), // Override selector mock
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
     setupStore({
       currentOrganizationId: 'org-1',
       userOrganizations: [{ id: 'org-1', name: 'Org One', membership_id: 'mem-1' }],
       selectCurrentUserRoleInOrg: vi.fn(() => 'admin'), // Override selector mock
       isLoading: false,
     });
     render(<OrganizationHubPage />);
     expect(screen.getByTestId('org-details-card')).toBeInTheDocument();
     expect(screen.getByTestId('member-list-card')).toBeInTheDocument();
     expect(screen.getByTestId('org-settings-card')).toBeInTheDocument();
     expect(screen.getByTestId('invite-member-card')).toBeInTheDocument();
     expect(screen.getByTestId('pending-actions-card')).toBeInTheDocument();
  });

}); 