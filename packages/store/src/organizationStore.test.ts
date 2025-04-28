import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// REMOVED: Local state/action interfaces - rely on types from @paynless/types via the store import
// import { Organization, OrganizationMemberWithProfile, ApiError } from '@paynless/types'; // Keep if needed for mock data types
import { api } from '@paynless/api'; // Mock this
import { logger } from '@paynless/utils';
import { useOrganizationStore } from './organizationStore'; // <<< IMPORT THE ACTUAL STORE
import { useAuthStore } from './authStore'; // <<< ADD THIS IMPORT
import { Organization } from '@paynless/types'; // Import types needed for mock data

// --- Mock Dependencies --- // (Keep mocks as they are)
vi.mock('@paynless/api', () => ({
  api: {
    organizations: {
      listUserOrganizations: vi.fn(),
      getOrganizationDetails: vi.fn(),
      getOrganizationMembers: vi.fn(),
      deleteOrganization: vi.fn(),
      // Add other org methods if needed by store actions
    },
    // Mock other API groups if needed
  },
}));

vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('./authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ user: { id: 'test-user-id' } })) // Provide mock user ID
  }
}));

// REMOVED: createTestStore function

// --- Test Suite --- 
describe('OrganizationStore', () => {
  // REMOVED: let useOrgStore: ReturnType<typeof createTestStore>;
  const initialState = useOrganizationStore.getState(); // Get initial state for reset

  beforeEach(() => {
    // Reset the actual store to its initial state before each test
    useOrganizationStore.setState(initialState, true); // Replace state
    vi.clearAllMocks();
    // Restore mock user for authStore as it might be changed in tests
    vi.mocked(useAuthStore.getState).mockReturnValue({ user: { id: 'test-user-id' } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Initial State Tests ---
  it('should have correct initial state', () => {
    const state = useOrganizationStore.getState(); // Use actual store
    expect(state.userOrganizations).toEqual([]);
    expect(state.currentOrganizationId).toBeNull();
    expect(state.currentOrganizationDetails).toBeNull();
    expect(state.currentOrganizationMembers).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  // --- fetchUserOrganizations Tests ---
  describe('fetchUserOrganizations', () => {
    const mockOrgs: Organization[] = [
      { id: 'org1', name: 'Org One', visibility: 'private', created_at: 'd1', deleted_at: null },
      { id: 'org2', name: 'Org Two', visibility: 'public', created_at: 'd2', deleted_at: null },
      { id: 'org3', name: 'Deleted Org', visibility: 'private', created_at: 'd3', deleted_at: new Date().toISOString() }, // Example deleted org
    ];

    it('should set loading state, call API, filter deleted orgs, and update state on success', async () => {
      // Arrange
      const listMock = vi.mocked(api.organizations.listUserOrganizations);
      listMock.mockResolvedValue({ 
          status: 200, 
          data: mockOrgs 
      }); 
      // Spying on the store's internal methods might be brittle.
      // Instead, we can check the state changes directly.

      // Act: Call action on the actual store
      const fetchPromise = useOrganizationStore.getState().fetchUserOrganizations();

      // Assert initial loading state if needed (immediately after call)
      // expect(useOrganizationStore.getState().isLoading).toBe(true);
      expect(useOrganizationStore.getState().error).toBeNull(); // Error should be cleared

      await fetchPromise; // Wait for the async action to complete

      // Assert API call
      expect(listMock).toHaveBeenCalledTimes(1);
      expect(listMock).toHaveBeenCalledWith('test-user-id');
      
      // Check final state
      const finalState = useOrganizationStore.getState();
      expect(finalState.userOrganizations).toEqual(mockOrgs.filter(org => !org.deleted_at)); 
      expect(finalState.userOrganizations).toHaveLength(2);
      expect(finalState.error).toBeNull();
      expect(finalState.isLoading).toBe(false); 
    });

    it('should set error state and clear orgs list on API failure', async () => {
      // Arrange
      const listMock = vi.mocked(api.organizations.listUserOrganizations);
      const errorMsg = 'Failed to fetch orgs';
      listMock.mockResolvedValue({ 
          status: 500, 
          error: { message: errorMsg, code: 'SERVER_ERROR' } 
      });
      // Pre-fill state to ensure it gets cleared
      useOrganizationStore.setState({ userOrganizations: mockOrgs });

      // Act
      const fetchPromise = useOrganizationStore.getState().fetchUserOrganizations();
      // expect(useOrganizationStore.getState().isLoading).toBe(true);

      await fetchPromise;

      // Assert
      expect(listMock).toHaveBeenCalledTimes(1);
      
      // Check final state
      const finalState = useOrganizationStore.getState();
      expect(finalState.userOrganizations).toEqual([]); // Should be cleared
      expect(finalState.error).toBe(errorMsg);
      expect(finalState.isLoading).toBe(false);
    });

    it('should set error and clear orgs list if user is not authenticated', async () => {
      // Arrange: Mock authStore to return no user
      vi.mocked(useAuthStore.getState).mockReturnValueOnce({ user: null });
      const listMock = vi.mocked(api.organizations.listUserOrganizations);
      useOrganizationStore.setState({ userOrganizations: mockOrgs }); // Pre-fill

      // Act
      const fetchPromise = useOrganizationStore.getState().fetchUserOrganizations();
      // expect(useOrganizationStore.getState().isLoading).toBe(true);

      await fetchPromise;

      // Assert
      expect(listMock).not.toHaveBeenCalled(); // Ensure API not called
      const finalState = useOrganizationStore.getState();
      expect(finalState.userOrganizations).toEqual([]);
      expect(finalState.error).toBe('User not authenticated');
      expect(finalState.isLoading).toBe(false);
    });
  });

  // TODO: Add tests for setCurrentOrganizationId
  // TODO: Add tests for fetchOrganizationDetails
  // TODO: Add tests for fetchCurrentOrganizationMembers
  // TODO: Add tests for softDeleteOrganization

}); 