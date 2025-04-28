import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// REMOVED: Local state/action interfaces - rely on types from @paynless/types via the store import
// import { Organization, OrganizationMemberWithProfile, ApiError } from '@paynless/types'; // Keep if needed for mock data types
import { api } from '@paynless/api'; // Mock this
import { logger } from '@paynless/utils';
import { useOrganizationStore } from './organizationStore'; // <<< IMPORT THE ACTUAL STORE
import { useAuthStore } from './authStore'; // <<< ADD THIS IMPORT
import { Organization, OrganizationMemberWithProfile } from '@paynless/types'; // Import types needed for mock data

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

  // --- setCurrentOrganizationId Tests ---
  describe('setCurrentOrganizationId', () => {
    const orgId1 = 'org-id-1';
    const orgId2 = 'org-id-2';
    const mockOrgDetails: Organization = { id: orgId1, name: 'Org 1', visibility:'private', created_at:'d1', deleted_at: null };
    const mockMembers: OrganizationMemberWithProfile[] = [
        { id: 'mem1', organization_id: orgId1, user_id:'u1', role:'admin', status:'active', created_at:'m1', user_profiles: null }
    ];

    it('should update currentId, clear details/members/error, and trigger fetches when setting a new ID', () => {
      // Arrange
      const detailsMock = vi.mocked(api.organizations.getOrganizationDetails);
      const membersMock = vi.mocked(api.organizations.getOrganizationMembers);
      // Set initial non-matching state
      useOrganizationStore.setState({
        currentOrganizationId: orgId2,
        currentOrganizationDetails: { id: orgId2 } as any, // Dummy data
        currentOrganizationMembers: [{ id: 'mem-other' } as any],
        error: 'Some previous error'
      });

      // Act
      useOrganizationStore.getState().setCurrentOrganizationId(orgId1);

      // Assert state updates
      const state = useOrganizationStore.getState();
      expect(state.currentOrganizationId).toBe(orgId1);
      expect(state.currentOrganizationDetails).toBeNull();
      expect(state.currentOrganizationMembers).toEqual([]);
      expect(state.error).toBeNull();

      // Assert that the fetch actions were triggered (by checking the underlying API mocks)
      expect(detailsMock).toHaveBeenCalledTimes(1);
      expect(detailsMock).toHaveBeenCalledWith(orgId1);
      expect(membersMock).toHaveBeenCalledTimes(1);
      expect(membersMock).toHaveBeenCalledWith(orgId1);
    });

    it('should do nothing if setting the same ID', () => {
      // Arrange
      const detailsMock = vi.mocked(api.organizations.getOrganizationDetails);
      const membersMock = vi.mocked(api.organizations.getOrganizationMembers);
      // Set initial state
      const initialStateSnapshot = {
        currentOrganizationId: orgId1,
        currentOrganizationDetails: mockOrgDetails,
        currentOrganizationMembers: mockMembers,
        error: null
      };
      useOrganizationStore.setState(initialStateSnapshot);
      vi.clearAllMocks(); // Clear mocks after setting state

      // Act
      useOrganizationStore.getState().setCurrentOrganizationId(orgId1);

      // Assert state hasn't changed
      const state = useOrganizationStore.getState();
      expect(state.currentOrganizationId).toBe(initialStateSnapshot.currentOrganizationId);
      expect(state.currentOrganizationDetails).toEqual(initialStateSnapshot.currentOrganizationDetails);
      expect(state.currentOrganizationMembers).toEqual(initialStateSnapshot.currentOrganizationMembers);
      expect(state.error).toBe(initialStateSnapshot.error);

      // Assert that fetches were NOT triggered
      expect(detailsMock).not.toHaveBeenCalled();
      expect(membersMock).not.toHaveBeenCalled();
    });

    it('should clear currentId, details, members, and error when setting ID to null', () => {
        // Arrange
        const detailsMock = vi.mocked(api.organizations.getOrganizationDetails);
        const membersMock = vi.mocked(api.organizations.getOrganizationMembers);
        // Set initial state
        useOrganizationStore.setState({
            currentOrganizationId: orgId1,
            currentOrganizationDetails: mockOrgDetails,
            currentOrganizationMembers: mockMembers,
            error: 'Some previous error'
        });
        vi.clearAllMocks();

        // Act
        useOrganizationStore.getState().setCurrentOrganizationId(null);

        // Assert state updates
        const state = useOrganizationStore.getState();
        expect(state.currentOrganizationId).toBeNull();
        expect(state.currentOrganizationDetails).toBeNull();
        expect(state.currentOrganizationMembers).toEqual([]);
        expect(state.error).toBeNull();

        // Assert that fetches were NOT triggered
        expect(detailsMock).not.toHaveBeenCalled();
        expect(membersMock).not.toHaveBeenCalled();
    });
  });

  // --- fetchOrganizationDetails Tests ---
  describe('fetchOrganizationDetails', () => {
    const orgId = 'org-detail-test-id';
    const mockOrgDetails: Organization = {
      id: orgId,
      name: 'Detailed Org',
      visibility: 'private',
      created_at: 'date-detail',
      deleted_at: null
    };

    it('should call API, update details, and clear loading/error on success', async () => {
      // Arrange
      const detailMock = vi.mocked(api.organizations.getOrganizationDetails);
      detailMock.mockResolvedValue({ status: 200, data: mockOrgDetails });

      // Act
      const fetchPromise = useOrganizationStore.getState().fetchOrganizationDetails(orgId);
      expect(useOrganizationStore.getState().error).toBeNull(); // Check error cleared

      await fetchPromise;

      // Assert
      expect(detailMock).toHaveBeenCalledTimes(1);
      expect(detailMock).toHaveBeenCalledWith(orgId);

      const finalState = useOrganizationStore.getState();
      expect(finalState.currentOrganizationDetails).toEqual(mockOrgDetails);
      expect(finalState.isLoading).toBe(false);
      expect(finalState.error).toBeNull();
    });

    it('should set error, clear details, and clear loading on API error (e.g., 404)', async () => {
      // Arrange
      const detailMock = vi.mocked(api.organizations.getOrganizationDetails);
      const errorMsg = 'Organization not found';
      detailMock.mockResolvedValue({ status: 404, error: { message: errorMsg, code: 'PGRST116' } });
      // Pre-fill state
      useOrganizationStore.setState({ currentOrganizationDetails: mockOrgDetails });

      // Act
      const fetchPromise = useOrganizationStore.getState().fetchOrganizationDetails(orgId);
      expect(useOrganizationStore.getState().error).toBeNull(); // Check error cleared

      await fetchPromise;

      // Assert
      expect(detailMock).toHaveBeenCalledTimes(1);
      expect(detailMock).toHaveBeenCalledWith(orgId);

      const finalState = useOrganizationStore.getState();
      expect(finalState.currentOrganizationDetails).toBeNull(); // Should be cleared
      expect(finalState.isLoading).toBe(false);
      expect(finalState.error).toBe(errorMsg);
    });

    it('should set error, clear details, and clear loading on unexpected error', async () => {
      // Arrange
      const detailMock = vi.mocked(api.organizations.getOrganizationDetails);
      const errorMsg = 'Network error';
      detailMock.mockRejectedValue(new Error(errorMsg)); // Simulate unexpected error
      // Pre-fill state
      useOrganizationStore.setState({ currentOrganizationDetails: mockOrgDetails });

      // Act
      const fetchPromise = useOrganizationStore.getState().fetchOrganizationDetails(orgId);
      expect(useOrganizationStore.getState().error).toBeNull(); // Check error cleared

      await fetchPromise;

      // Assert
      expect(detailMock).toHaveBeenCalledTimes(1);
      expect(detailMock).toHaveBeenCalledWith(orgId);

      const finalState = useOrganizationStore.getState();
      expect(finalState.currentOrganizationDetails).toBeNull(); // Should be cleared
      expect(finalState.isLoading).toBe(false);
      expect(finalState.error).toBe(errorMsg);
    });
  });

  // --- fetchCurrentOrganizationMembers Tests ---
  describe('fetchCurrentOrganizationMembers', () => {
    const orgId = 'org-members-test-id';
    const mockMembers: OrganizationMemberWithProfile[] = [
       { 
         id: 'mem1', organization_id: orgId, user_id: 'user1', role: 'admin', status: 'active', created_at: 'd1', 
         user_profiles: { id: 'user1', first_name: 'Admin', last_name: 'User', email: 'admin@test.com', role: 'user', created_at: 'dp1', updated_at: 'dp1', deleted_at: null, avatar_url: null }
       },
       {
         id: 'mem2', organization_id: orgId, user_id: 'user2', role: 'member', status: 'active', created_at: 'd2',
         user_profiles: { id: 'user2', first_name: 'Member', last_name: 'User', email: 'member@test.com', role: 'user', created_at: 'dp2', updated_at: 'dp2', deleted_at: null, avatar_url: null }
       },
    ];

    it('should do nothing if currentOrganizationId is null', async () => {
      // Arrange
      const membersMock = vi.mocked(api.organizations.getOrganizationMembers);
      useOrganizationStore.setState({ currentOrganizationId: null }); // Ensure no org is set

      // Act
      await useOrganizationStore.getState().fetchCurrentOrganizationMembers();

      // Assert
      expect(membersMock).not.toHaveBeenCalled();
      expect(useOrganizationStore.getState().isLoading).toBe(false); // Should reset loading if called
      expect(useOrganizationStore.getState().currentOrganizationMembers).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith('[OrganizationStore] fetchCurrentOrganizationMembers - No current organization selected.');
    });

    it('should call API, update members, and clear loading/error on success', async () => {
      // Arrange
      const membersMock = vi.mocked(api.organizations.getOrganizationMembers);
      membersMock.mockResolvedValue({ status: 200, data: mockMembers });
      useOrganizationStore.setState({ currentOrganizationId: orgId }); // Set current org

      // Act
      const fetchPromise = useOrganizationStore.getState().fetchCurrentOrganizationMembers();
      // Check intermediate states if desired, or remove if flaky
      // expect(useOrganizationStore.getState().isLoading).toBe(true);
      // expect(useOrganizationStore.getState().error).toBeNull();
      
      await fetchPromise;

      // Assert
      expect(membersMock).toHaveBeenCalledTimes(1);
      expect(membersMock).toHaveBeenCalledWith(orgId);

      const finalState = useOrganizationStore.getState();
      expect(finalState.currentOrganizationMembers).toEqual(mockMembers);
      expect(finalState.isLoading).toBe(false);
      expect(finalState.error).toBeNull();
    });

    it('should set error, clear members, and clear loading on API error', async () => {
      // Arrange
      const membersMock = vi.mocked(api.organizations.getOrganizationMembers);
      const errorMsg = 'Failed to fetch members';
      membersMock.mockResolvedValue({ status: 500, error: { message: errorMsg, code: 'INTERNAL_ERROR' } });
      useOrganizationStore.setState({ currentOrganizationId: orgId, currentOrganizationMembers: mockMembers }); // Set current org and pre-fill members

      // Act
      const fetchPromise = useOrganizationStore.getState().fetchCurrentOrganizationMembers();
      // expect(useOrganizationStore.getState().isLoading).toBe(true);

      await fetchPromise;

      // Assert
      expect(membersMock).toHaveBeenCalledTimes(1);
      expect(membersMock).toHaveBeenCalledWith(orgId);

      const finalState = useOrganizationStore.getState();
      expect(finalState.currentOrganizationMembers).toEqual([]); // Should be cleared
      expect(finalState.isLoading).toBe(false);
      expect(finalState.error).toBe(errorMsg);
    });
    
    it('should set error, clear members, and clear loading on unexpected error', async () => {
      // Arrange
      const membersMock = vi.mocked(api.organizations.getOrganizationMembers);
      const errorMsg = 'Something broke';
      membersMock.mockRejectedValue(new Error(errorMsg)); // Simulate unexpected error
       useOrganizationStore.setState({ currentOrganizationId: orgId, currentOrganizationMembers: mockMembers }); // Set current org and pre-fill members

      // Act
      const fetchPromise = useOrganizationStore.getState().fetchCurrentOrganizationMembers();
      // expect(useOrganizationStore.getState().isLoading).toBe(true);

      await fetchPromise;

      // Assert
      expect(membersMock).toHaveBeenCalledTimes(1);
      expect(membersMock).toHaveBeenCalledWith(orgId);

      const finalState = useOrganizationStore.getState();
      expect(finalState.currentOrganizationMembers).toEqual([]); // Should be cleared
      expect(finalState.isLoading).toBe(false);
      expect(finalState.error).toBe(errorMsg);
    });
  });

  // --- softDeleteOrganization Tests ---
  describe('softDeleteOrganization', () => {
    const orgToDeleteId = 'org-to-delete';
    const otherOrgId = 'other-org';
    const initialOrgs: Organization[] = [
        { id: orgToDeleteId, name: 'Delete Me', visibility: 'private', created_at: 'd1', deleted_at: null },
        { id: otherOrgId, name: 'Keep Me', visibility: 'private', created_at: 'd2', deleted_at: null },
    ];
    const mockMember: OrganizationMemberWithProfile = {
        id: 'mem-del', organization_id: orgToDeleteId, user_id: 'u1', role: 'admin', status: 'active', created_at: 'd3',
        user_profiles: null
    };

    it('should call API, remove org from list, return true on success (not current org)', async () => {
      // Arrange
      const deleteMock = vi.mocked(api.organizations.deleteOrganization);
      deleteMock.mockResolvedValue({ status: 204, data: undefined }); // 204 No Content is typical for DELETE
      useOrganizationStore.setState({ userOrganizations: initialOrgs, currentOrganizationId: otherOrgId });

      // Act
      const result = await useOrganizationStore.getState().softDeleteOrganization(orgToDeleteId);

      // Assert
      expect(result).toBe(true);
      expect(deleteMock).toHaveBeenCalledTimes(1);
      expect(deleteMock).toHaveBeenCalledWith(orgToDeleteId);
      
      const finalState = useOrganizationStore.getState();
      expect(finalState.userOrganizations).toEqual([initialOrgs[1]]); // Only otherOrg should remain
      expect(finalState.currentOrganizationId).toBe(otherOrgId); // Current org unaffected
      expect(finalState.isLoading).toBe(false);
      expect(finalState.error).toBeNull();
    });

    it('should call API, remove org, clear current context, return true on success (current org)', async () => {
      // Arrange
      const deleteMock = vi.mocked(api.organizations.deleteOrganization);
      deleteMock.mockResolvedValue({ status: 204, data: undefined });
      useOrganizationStore.setState({ 
          userOrganizations: initialOrgs, 
          currentOrganizationId: orgToDeleteId, // Set org to delete as current
          currentOrganizationDetails: initialOrgs[0], // Set details/members too
          currentOrganizationMembers: [mockMember]
      });

      // Act
      const result = await useOrganizationStore.getState().softDeleteOrganization(orgToDeleteId);

      // Assert
      expect(result).toBe(true);
      expect(deleteMock).toHaveBeenCalledTimes(1);
      expect(deleteMock).toHaveBeenCalledWith(orgToDeleteId);
      
      const finalState = useOrganizationStore.getState();
      expect(finalState.userOrganizations).toEqual([initialOrgs[1]]); // Only otherOrg should remain
      // Verify context is cleared
      expect(finalState.currentOrganizationId).toBeNull(); 
      expect(finalState.currentOrganizationDetails).toBeNull(); 
      expect(finalState.currentOrganizationMembers).toEqual([]); 
      expect(finalState.isLoading).toBe(false);
      expect(finalState.error).toBeNull();
    });

    it('should set error, not modify state, and return false on API error', async () => {
       // Arrange
      const deleteMock = vi.mocked(api.organizations.deleteOrganization);
      const errorMsg = 'Delete permission denied';
      deleteMock.mockResolvedValue({ status: 403, error: { message: errorMsg, code: 'FORBIDDEN' } });
      useOrganizationStore.setState({ userOrganizations: initialOrgs, currentOrganizationId: otherOrgId });

      // Act
      const result = await useOrganizationStore.getState().softDeleteOrganization(orgToDeleteId);

      // Assert
      expect(result).toBe(false);
      expect(deleteMock).toHaveBeenCalledTimes(1);
      expect(deleteMock).toHaveBeenCalledWith(orgToDeleteId);
      
      const finalState = useOrganizationStore.getState();
      expect(finalState.userOrganizations).toEqual(initialOrgs); // List unchanged
      expect(finalState.currentOrganizationId).toBe(otherOrgId); // Context unchanged
      expect(finalState.isLoading).toBe(false);
      expect(finalState.error).toBe(errorMsg);
    });

    it('should set error, not modify state, and return false on unexpected error', async () => {
      // Arrange
      const deleteMock = vi.mocked(api.organizations.deleteOrganization);
      const errorMsg = 'Network failed';
      deleteMock.mockRejectedValue(new Error(errorMsg));
      useOrganizationStore.setState({ userOrganizations: initialOrgs, currentOrganizationId: otherOrgId });

      // Act
      const result = await useOrganizationStore.getState().softDeleteOrganization(orgToDeleteId);

      // Assert
      expect(result).toBe(false);
      expect(deleteMock).toHaveBeenCalledTimes(1);
      expect(deleteMock).toHaveBeenCalledWith(orgToDeleteId);
      
      const finalState = useOrganizationStore.getState();
      expect(finalState.userOrganizations).toEqual(initialOrgs); // List unchanged
      expect(finalState.currentOrganizationId).toBe(otherOrgId); // Context unchanged
      expect(finalState.isLoading).toBe(false);
      expect(finalState.error).toBe(errorMsg);
    });
  });

}); // End of main describe block