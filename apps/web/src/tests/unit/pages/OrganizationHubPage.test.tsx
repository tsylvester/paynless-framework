import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrganizationHubPage } from '../../../pages/OrganizationHubPage'; // Adjust path relative to tests/unit/pages
import { useOrganizationStore } from '@paynless/store';
import { useCurrentUser } from '../../../hooks/useCurrentUser'; // Adjust path relative to tests/unit/pages
import { User } from '@supabase/supabase-js';
import { UserOrganizationLink } from '@paynless/types';

// --- Mocks ---

// Mock the Zustand store
vi.mock('@paynless/store', () => ({
  useOrganizationStore: vi.fn(),
}));

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


// --- Test Suite ---

describe('OrganizationHubPage', () => {
  // Mock store state and actions
  let mockFetchUserOrganizations: ReturnType<typeof vi.fn>;
  let mockSetCurrentOrganizationId: ReturnType<typeof vi.fn>;
  let mockSelectCurrentUserRole: ReturnType<typeof vi.fn>;
  let mockUseOrganizationStore: ReturnType<typeof vi.fn>;
  let mockUseCurrentUser: ReturnType<typeof vi.fn>;
  let mockFetchOrganizationDetails: ReturnType<typeof vi.fn>;
  let mockFetchCurrentOrganizationMembers: ReturnType<typeof vi.fn>;

  const mockUser = { id: 'user-123' } as User; // Mock a basic user object

  beforeEach(() => {
    // Reset mocks before each test
    mockFetchUserOrganizations = vi.fn();
    mockSetCurrentOrganizationId = vi.fn();
    mockSelectCurrentUserRole = vi.fn();
    mockFetchOrganizationDetails = vi.fn();
    mockFetchCurrentOrganizationMembers = vi.fn();

    // Default mock state for the store
    mockUseOrganizationStore = useOrganizationStore as ReturnType<typeof vi.fn>; // Cast to mocked type
    mockUseOrganizationStore.mockReturnValue({
      userOrganizations: [],
      fetchUserOrganizations: mockFetchUserOrganizations,
      setCurrentOrganizationId: mockSetCurrentOrganizationId,
      currentOrganizationId: null,
      currentOrganizationDetails: null,
      isLoading: false,
      selectCurrentUserRoleInOrg: mockSelectCurrentUserRole,
      fetchOrganizationDetails: mockFetchOrganizationDetails,
      fetchCurrentOrganizationMembers: mockFetchCurrentOrganizationMembers,
    });

    // Default mock for current user hook
    mockUseCurrentUser = useCurrentUser as ReturnType<typeof vi.fn>; // Cast to mocked type
    mockUseCurrentUser.mockReturnValue({ user: mockUser });

    // Default role (non-admin)
    mockSelectCurrentUserRole.mockReturnValue('member');
  });

  it('fetches user organizations on initial load when user is present', () => {
    render(<OrganizationHubPage />);
    expect(mockFetchUserOrganizations).toHaveBeenCalledTimes(1);
  });

  it('does not fetch organizations if user is not present', () => {
    mockUseCurrentUser.mockReturnValue({ user: null });
    render(<OrganizationHubPage />);
    expect(mockFetchUserOrganizations).not.toHaveBeenCalled();
  });
  
  it('displays loading indicator text initially when loading and no organizations loaded', () => {
     mockUseOrganizationStore.mockReturnValue({
       ...mockUseOrganizationStore(), 
       isLoading: true,
       userOrganizations: [],
     });
     render(<OrganizationHubPage />);
     // Check for the presence of skeleton elements instead
     const skeletons = screen.queryAllByTestId(/skeleton/); // Use a regex or a more specific selector if possible
     // Let's find the skeletons by their data attribute
     const skeletonElements = screen.queryAllByRole('generic', { 'data-slot': 'skeleton' }); // Assuming Skeleton renders a div or similar role
     expect(skeletonElements.length).toBeGreaterThan(0); // Check if at least one skeleton is rendered
  });

  it('does not display loading indicator text if not loading, even with no organizations', () => {
    mockUseOrganizationStore.mockReturnValue({
      ...mockUseOrganizationStore(),
      isLoading: false,
      userOrganizations: [],
    });
    render(<OrganizationHubPage />);
    expect(screen.queryByText('Loading organizations...')).toBeNull();
    expect(screen.getByText('You are not part of any organizations yet. Create one!')).toBeInTheDocument();
  });

  it('sets the first organization as current if organizations load and none is selected', async () => {
    const organizations: UserOrganizationLink[] = [
        { id: 'org-1', name: 'Org One', membership_id: 'mem-1' },
        { id: 'org-2', name: 'Org Two', membership_id: 'mem-2' }
    ];
    const initialStoreState = mockUseOrganizationStore();

    mockUseOrganizationStore.mockReturnValueOnce({
        ...initialStoreState,
        userOrganizations: [],
        currentOrganizationId: null,
    }).mockReturnValueOnce({ 
        ...initialStoreState,
        userOrganizations: organizations,
        currentOrganizationId: null,
        fetchUserOrganizations: mockFetchUserOrganizations,
        setCurrentOrganizationId: mockSetCurrentOrganizationId,
        selectCurrentUserRoleInOrg: mockSelectCurrentUserRole,
    });

    const { rerender } = render(<OrganizationHubPage />); 
    rerender(<OrganizationHubPage />); 

    await waitFor(() => {
      expect(mockSetCurrentOrganizationId).toHaveBeenCalledWith('org-1');
    });
  });

  it('does not set current organization if one is already selected', () => {
    const organizations = [{ id: 'org-1', name: 'Org One', membership_id: 'mem-1' }];
     mockUseOrganizationStore.mockReturnValue({
       ...mockUseOrganizationStore(),
       userOrganizations: organizations,
       currentOrganizationId: 'org-existing',
     });
     render(<OrganizationHubPage />);
     expect(mockSetCurrentOrganizationId).not.toHaveBeenCalled();
  });

  it('renders OrganizationListCard', () => {
    render(<OrganizationHubPage />);
    expect(screen.getByTestId('org-list-card')).toBeInTheDocument();
  });

  it('renders message when no organizations exist', () => {
    mockUseOrganizationStore.mockReturnValue({
        ...mockUseOrganizationStore(),
        userOrganizations: [],
        isLoading: false,
    });
    render(<OrganizationHubPage />);
    expect(screen.getByText('You are not part of any organizations yet. Create one!')).toBeInTheDocument();
    expect(screen.queryByTestId('org-details-card')).toBeNull();
  });

  it('renders message to select org when orgs exist but none selected', () => {
    const organizations = [{ id: 'org-1', name: 'Org One', membership_id: 'mem-1' }];
     mockUseOrganizationStore.mockReturnValue({
       ...mockUseOrganizationStore(),
       userOrganizations: organizations,
       currentOrganizationId: null,
       isLoading: false,
     });
     render(<OrganizationHubPage />);
     expect(screen.getByText('Select an organization to view details.')).toBeInTheDocument();
     expect(screen.queryByTestId('org-details-card')).toBeNull();
  });

  it('renders correct cards for a selected organization (member role)', () => {
     mockUseOrganizationStore.mockReturnValue({
       ...mockUseOrganizationStore(),
       currentOrganizationId: 'org-1',
       userOrganizations: [{ id: 'org-1', name: 'Org One', membership_id: 'mem-1' }],
       selectCurrentUserRoleInOrg: () => 'member',
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
     mockUseOrganizationStore.mockReturnValue({
       ...mockUseOrganizationStore(),
       currentOrganizationId: 'org-1',
       userOrganizations: [{ id: 'org-1', name: 'Org One', membership_id: 'mem-1' }],
       selectCurrentUserRoleInOrg: () => 'admin',
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