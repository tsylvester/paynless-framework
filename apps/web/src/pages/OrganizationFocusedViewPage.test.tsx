import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { OrganizationFocusedViewPage } from './OrganizationFocusedViewPage'; // Adjust path
import { useOrganizationStore } from '@paynless/store';
import { useCurrentUser } from '../hooks/useCurrentUser'; // Adjust path
import { useParams, useNavigate } from 'react-router-dom';
import { logger } from '@paynless/utils'; // Import logger for potential mocking
import { User, Organization, OrganizationMemberWithProfile } from '@paynless/types'; // Import necessary types

// --- Mocks ---

// Create a mutable object to hold the mock state and actions
const mockStoreState = {
  userOrganizations: [] as Organization[],
  fetchUserOrganizations: vi.fn(),
  setCurrentOrganizationId: vi.fn(),
  currentOrganizationId: null as string | null,
  currentOrganizationDetails: null as Organization | null,
  currentOrganizationMembers: [] as OrganizationMemberWithProfile[],
  isLoading: false,
  error: null as string | null,
  selectCurrentUserRoleInOrg: vi.fn(() => 'member'), // Default mock implementation
  fetchCurrentOrganizationDetails: vi.fn(),
  fetchCurrentOrganizationMembers: vi.fn(),
};

vi.mock('@paynless/store', () => {
  const useOrganizationStoreMock = vi.fn((selector) => {
    // If called with a selector, apply it to the mock state
    if (typeof selector === 'function') {
      return selector(mockStoreState);
    }
    // If called without a selector (shouldn't happen in standard use), return the whole state
    return mockStoreState;
  });

  // Attach the getState method to the mock hook
  useOrganizationStoreMock.getState = vi.fn(() => mockStoreState);

  return { useOrganizationStore: useOrganizationStoreMock };
});

vi.mock('../../../hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }));
vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...original, // Preserve other exports
    useParams: vi.fn(),
    useNavigate: vi.fn(),
  };
});
vi.mock('@paynless/utils', () => ({ 
  logger: { 
    info: vi.fn(), 
    warn: vi.fn(), 
    error: vi.fn(), 
    debug: vi.fn() 
  } 
}));

// Mock child components
vi.mock('../../../components/organizations/OrganizationDetailsCard', () => ({ OrganizationDetailsCard: () => <div data-testid="org-details-card">Details</div> }));
vi.mock('../../../components/organizations/OrganizationSettingsCard', () => ({ OrganizationSettingsCard: () => <div data-testid="org-settings-card">Settings</div> }));
vi.mock('../../../components/organizations/MemberListCard', () => ({ MemberListCard: () => <div data-testid="member-list-card">Members</div> }));
vi.mock('../../../components/organizations/InviteMemberCard', () => ({ InviteMemberCard: () => <div data-testid="invite-member-card">Invite</div> }));
vi.mock('../../../components/organizations/PendingActionsCard', () => ({ PendingActionsCard: () => <div data-testid="pending-actions-card">Pending</div> }));

vi.mock('@/components/ui/skeleton', () => ({ Skeleton: ({ className }: { className: string }) => <div data-testid="skeleton" className={className}></div> }));

// --- Test Suite ---
describe('OrganizationFocusedViewPage', () => {
  // Remove mockUseOrganizationStore, we interact via mockStoreState now
  let mockUseCurrentUser: Mock;
  let mockUseParams: Mock;
  let mockUseNavigate: Mock;
  let mockNavigate: Mock;

  // Keep refs to mock functions if needed for assertions
  let fetchUserOrganizationsMock: Mock;
  let setCurrentOrganizationIdMock: Mock;
  let selectCurrentUserRoleInOrgMock: Mock;
  let fetchCurrentOrganizationDetailsMock: Mock;
  let fetchCurrentOrganizationMembersMock: Mock;

  const mockUser = { id: 'user-123', email: 'test@example.com' } as User;
  const orgIdFromUrl = 'org-abc';

  // Helper to setup default store state by modifying the mockStoreState object
  const setupStore = (overrides = {}) => {
    // Reset mock function references
    fetchUserOrganizationsMock = mockStoreState.fetchUserOrganizations = vi.fn();
    setCurrentOrganizationIdMock = mockStoreState.setCurrentOrganizationId = vi.fn();
    selectCurrentUserRoleInOrgMock = mockStoreState.selectCurrentUserRoleInOrg = vi.fn().mockReturnValue('member'); // Re-apply default mock
    fetchCurrentOrganizationDetailsMock = mockStoreState.fetchCurrentOrganizationDetails = vi.fn();
    fetchCurrentOrganizationMembersMock = mockStoreState.fetchCurrentOrganizationMembers = vi.fn();

    // Define default state structure
    const defaultState = {
      userOrganizations: [{ id: orgIdFromUrl, name: 'Test Org', deleted_at: null }] as Organization[],
      currentOrganizationId: null,
      currentOrganizationDetails: null,
      currentOrganizationMembers: [] as OrganizationMemberWithProfile[],
      isLoading: false,
      error: null,
    };

    // Merge defaults and overrides into the mockStoreState
    Object.assign(mockStoreState, defaultState, overrides);
    
    // Ensure the getState mock always returns the *current* state object
    (useOrganizationStore.getState as Mock).mockReturnValue(mockStoreState);
  };

  beforeEach(() => {
    vi.clearAllMocks(); // Clear mocks between tests, including those inside mockStoreState

    // Reset the shared mock state to a clean slate before applying setupStore
     Object.assign(mockStoreState, {
        userOrganizations: [], fetchUserOrganizations: vi.fn(), setCurrentOrganizationId: vi.fn(),
        currentOrganizationId: null, currentOrganizationDetails: null, currentOrganizationMembers: [],
        isLoading: false, error: null, selectCurrentUserRoleInOrg: vi.fn(() => 'member'),
        fetchCurrentOrganizationDetails: vi.fn(), fetchCurrentOrganizationMembers: vi.fn(),
     });
     // Also reset the getState mock itself
     (useOrganizationStore.getState as Mock).mockClear();
     (useOrganizationStore as Mock).mockClear();

    // Setup other hook mocks
    mockUseCurrentUser = useCurrentUser as Mock;
    mockUseParams = useParams as Mock;
    mockUseNavigate = useNavigate as Mock;
    mockNavigate = vi.fn();

    mockUseCurrentUser.mockReturnValue({ user: mockUser });
    mockUseParams.mockReturnValue({ orgId: orgIdFromUrl });
    mockUseNavigate.mockReturnValue(mockNavigate);

    // Call setupStore AFTER resetting and setting up other mocks
    setupStore(); 
  });

  it('sets current organization ID from URL parameter on mount', () => {
    setupStore({ currentOrganizationId: null }); // Ensure it's not already set
    render(<OrganizationFocusedViewPage />);
    // Assert on the mock function reference we stored
    expect(setCurrentOrganizationIdMock).toHaveBeenCalledWith(orgIdFromUrl);
  });

  it('fetches user organizations if not loaded on mount', () => {
    setupStore({ userOrganizations: [] });
    render(<OrganizationFocusedViewPage />);
    expect(fetchUserOrganizationsMock).toHaveBeenCalled();
  });

  it('displays skeleton loading state while org data is loading or ID mismatch', () => {
    // Scenario 1: isLoading is true
    setupStore({ isLoading: true, currentOrganizationId: null });
    const { rerender } = render(<OrganizationFocusedViewPage />);
    expect(screen.queryByText(/Loading organization details/i)).toBeNull(); 
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(2); 

    // Scenario 2: ID mismatch (store not updated yet)
    setupStore({ isLoading: false, currentOrganizationId: 'other-org' });
    rerender(<OrganizationFocusedViewPage />);
    expect(screen.queryByText(/Loading organization details/i)).toBeNull(); 
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(2); 
  });

  // Explicit test for skeleton structure
  it('renders the correct skeleton structure when loading', () => {
    setupStore({ isLoading: true, currentOrganizationId: null });
    render(<OrganizationFocusedViewPage />);
    
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBe(6); 
  });

  it('renders correct cards for member role when loaded', () => {
    setupStore({
      currentOrganizationId: orgIdFromUrl, 
      isLoading: false,
      currentOrganizationDetails: { id: orgIdFromUrl, name: 'Test Org', deleted_at: null, created_at: '', visibility: 'private' } as Organization,
      currentOrganizationMembers: [{ id: 'mem-1', user_id: mockUser.id, role: 'member' }] as any, 
      selectCurrentUserRoleInOrg: vi.fn(() => 'member'), // Override specific selector mock if needed
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
      currentOrganizationDetails: { id: orgIdFromUrl, name: 'Test Org', deleted_at: null, created_at: '', visibility: 'private' } as Organization,
      currentOrganizationMembers: [{ id: 'mem-1', user_id: mockUser.id, role: 'admin' }] as any, 
      selectCurrentUserRoleInOrg: vi.fn(() => 'admin'), // Override specific selector mock
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
      userOrganizations: [{ organization_id: 'other-org', name: 'Another Org' }] as any, 
      currentOrganizationDetails: { id: orgIdFromUrl, name: 'Test Org' } as Organization,
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
      currentOrganizationMembers: [{ id: 'mem-2', user_id: 'other-user', role: 'member' }] as any, 
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
      currentOrganizationDetails: { id: orgIdFromUrl, name: 'Test Org' } as Organization,
      currentOrganizationMembers: [],
    });
    render(<OrganizationFocusedViewPage />);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/organizations?error=fetch_failed');
    });
  });
}); 