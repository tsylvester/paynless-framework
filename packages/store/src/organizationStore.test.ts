import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// Import API mocks FIRST
import {
    mockGetCurrentOrganization,
    mockUpdateOrganization,
    mockGetOrganizationMembers,
    mockRemoveOrganizationMember,
    mockLeaveOrganization,
    mockListUserOrganizations,
    mockGetOrganizationDetails,
    mockDeleteOrganization,
    mockCreateOrganization,
    resetOrganizationMocks,      // Import reset function
    defaultMockOrganization,
    defaultMockMembers,
    mockAcceptOrganizationInvite,
    mockDeclineOrganizationInvite,
    mockRequestToJoinOrganization,
    mockApproveJoinRequest,
    mockDenyJoinRequest,
    mockCancelInvite,
    mockInviteUserByEmail,
    mockGetPendingItems
} from '../../api/src/mocks/organizations.mock.ts';

// Other imports
import { useOrganizationStore } from './organizationStore';
import { useAuthStore } from './authStore';
import { Organization, OrganizationMemberWithProfile, SupabaseUser, ApiError as ApiErrorType, AuthStore, ApiResponse, Invite, PendingOrgItems } from '@paynless/types';
// Import ApiClient type
import { initializeApiClient, _resetApiClient, ApiClient } from '@paynless/api'; 
import { logger } from '@paynless/utils';
import { act } from '@testing-library/react';

// --- Mock Dependencies --- //

vi.mock('@paynless/utils', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

// Mock @paynless/api: Use a simple synchronous factory referencing top-level mocks
// AND explicitly type the returned api object
// AND mock getApiClient
vi.mock('@paynless/api', () => {
    // Define the mocked api object structure first
    const mockedApi = {
        organizations: {
            getCurrentOrganization: mockGetCurrentOrganization,
            updateOrganization: mockUpdateOrganization,
            getOrganizationMembers: mockGetOrganizationMembers,
            removeMember: mockRemoveOrganizationMember,
            leaveOrganization: mockLeaveOrganization,
            listUserOrganizations: mockListUserOrganizations,
            getOrganizationDetails: mockGetOrganizationDetails,
            deleteOrganization: mockDeleteOrganization,
            createOrganization: mockCreateOrganization,
            acceptOrganizationInvite: mockAcceptOrganizationInvite,
            declineOrganizationInvite: mockDeclineOrganizationInvite,
            requestToJoinOrganization: mockRequestToJoinOrganization,
            approveJoinRequest: mockApproveJoinRequest,
            denyJoinRequest: mockDenyJoinRequest,
            cancelInvite: mockCancelInvite,
            inviteUserByEmail: mockInviteUserByEmail,
            getPendingOrgActions: mockGetPendingItems
        },
        auth: {} as any,
        billing: {} as any,
        notifications: {} as any,
        getSupabaseClient: vi.fn(() => ({ auth: {} }))
        // Add other base methods if needed, e.g., get: vi.fn(), post: vi.fn()
    } as any as ApiClient; // Cast the whole api object to ApiClient type

    // Return the exports, including the mocked getApiClient
    return {
        initializeApiClient: vi.fn(),
        _resetApiClient: vi.fn(),
        api: mockedApi, // Export the mocked api object
        getApiClient: vi.fn(() => mockedApi) // Mock getApiClient to return the mocked api object
    };
});

// --- DEFINE MOCK DATA (Can come after mocks) ---
const mockSupabaseUser: SupabaseUser = {
    id: 'test-user-id', email: 'test@example.com',
    app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: ''
};
const mockSession = {
    access_token: 'mock-token', refresh_token: 'mock-refresh-token', user: mockSupabaseUser,
    token_type: 'bearer', expires_in: 3600, expires_at: Date.now() + 3600 * 1000,
};
const mockAuthStoreState = { /* ... state + mocked functions ... */ } as any as AuthStore;

// --- Mock authStore --- 
vi.mock('./authStore', () => ({
    useAuthStore: {
        getState: vi.fn(() => mockAuthStoreState)
    }
}));

// --- Test Suite Setup --- //
const resetOrgStore = () => useOrganizationStore.setState(useOrganizationStore.getInitialState(), true);

// --- Test Suite --- //
describe('OrganizationStore', () => {

  beforeEach(() => {
    // Reset imported mocks (use function imported at top)
    resetOrganizationMocks();
    // Clear all Vitest mock tracking
    vi.clearAllMocks(); 
    
    // Reset store & auth mock state
    act(() => {
        resetOrgStore();
        vi.mocked(useAuthStore.getState).mockReturnValue({ 
            ...mockAuthStoreState, 
            user: mockSupabaseUser, 
            session: mockSession
        });
        // Initialize the mocked API client
        initializeApiClient({ supabaseUrl: 'http://dummy.url', supabaseAnonKey: 'dummy-key' });
    });
  });

  afterEach(() => {
      // Optional: Reset the API client if needed, though clearAllMocks might suffice
      // _resetApiClient(); 
  });

  it('should have correct initial state', () => {
    const state = useOrganizationStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.userOrganizations).toEqual([]);
    expect(state.currentOrganizationId).toBeNull();
    expect(state.currentOrganizationDetails).toBeNull();
    expect(state.currentOrganizationMembers).toEqual([]);
    expect(state.isCreateModalOpen).toBe(false);
    expect(state.isDeleteDialogOpen).toBe(false);
  });

  // --- fetchUserOrganizations Tests --- //
  describe('fetchUserOrganizations', () => {
    const mockOrgsData: Organization[] = [ defaultMockOrganization ];

    it('should update state on success', async () => {
      // Use the imported mock directly
      mockListUserOrganizations.mockResolvedValue({ status: 200, data: mockOrgsData, error: undefined });
      await act(async () => { await useOrganizationStore.getState().fetchUserOrganizations(); });
      // Verify the imported mock was called
      expect(mockListUserOrganizations).toHaveBeenCalledTimes(1);
      // Check auth user ID was used
      expect(mockListUserOrganizations).toHaveBeenCalledWith(mockSupabaseUser.id);
      const { userOrganizations, isLoading, error } = useOrganizationStore.getState();
      expect(userOrganizations).toEqual(mockOrgsData);
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
    });

    it('should set error string state on API failure', async () => {
      const errorMsg = 'Failed fetch';
      // Use the imported mock directly
      mockListUserOrganizations.mockResolvedValue({ status: 500, data: undefined, error: { message: errorMsg, code: '500' } }); // data: undefined
      await act(async () => { await useOrganizationStore.getState().fetchUserOrganizations(); });
      // Verify the imported mock was called
      expect(mockListUserOrganizations).toHaveBeenCalledWith(mockSupabaseUser.id);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });

     it('should set error string state if user is not authenticated', async () => {
        const expectedErrorMsg = 'User not authenticated';
        // Set auth state to unauthenticated for this test
        act(() => {
             // Reset the authStore mock state for this specific test
             // Return the full shape but with user/session as null
            vi.mocked(useAuthStore.getState).mockReturnValue({
                ...mockAuthStoreState, // Spread default state
                user: null, 
                session: null 
            });
        }); 
        await act(async () => { await useOrganizationStore.getState().fetchUserOrganizations(); });
        // Use the imported mock directly
        expect(mockListUserOrganizations).not.toHaveBeenCalled();
        const { error } = useOrganizationStore.getState();
        expect(error).toBe(expectedErrorMsg);
     });
  });

  // --- setCurrentOrganizationId Tests --- //
  describe('setCurrentOrganizationId', () => {
     const orgId1 = 'org-id-1';
     const mockOrgDetailsData: Organization = { ...defaultMockOrganization, id: orgId1 };
     // Use the imported defaultMockMembers which now includes user_profiles
     const mockMembersWithProfile: OrganizationMemberWithProfile[] = defaultMockMembers;
     // Use imported mocks directly
     const membersMock = mockGetOrganizationMembers;
     const detailsMock = mockGetOrganizationDetails;

    it('should update state and trigger fetches on new ID', async () => {
      detailsMock.mockResolvedValue({ status: 200, data: mockOrgDetailsData, error: undefined });
      membersMock.mockResolvedValue({ status: 200, data: mockMembersWithProfile, error: undefined });
      useOrganizationStore.setState({ error: 'Old error' });
      // We need to await the fetches triggered internally
      await act(async () => {
          // Set the ID, which triggers internal fetches
          useOrganizationStore.getState().setCurrentOrganizationId(orgId1);
          // Wait for promises inside the action to resolve (Vitest might need this)
          await Promise.resolve(); // Flush immediate promises
          await Promise.resolve(); // Allow fetch promises to potentially resolve
      });
      // Re-fetch state AFTER fetches are complete
      const state = useOrganizationStore.getState();
      expect(state.currentOrganizationDetails).toEqual(mockOrgDetailsData);
      expect(state.currentOrganizationMembers).toEqual(mockMembersWithProfile);
      expect(state.error).toBeNull();
      expect(detailsMock).toHaveBeenCalledWith(orgId1);
      expect(membersMock).toHaveBeenCalledWith(orgId1);
    });

     it('should do nothing if setting the same ID', () => {
       useOrganizationStore.setState({ currentOrganizationId: orgId1 });
       // Use imported mocks directly
       const detailsMock = mockGetOrganizationDetails;
       const membersMock = mockGetOrganizationMembers;
       detailsMock.mockClear(); 
       membersMock.mockClear();
       act(() => { useOrganizationStore.getState().setCurrentOrganizationId(orgId1); });
       expect(detailsMock).not.toHaveBeenCalled();
       expect(membersMock).not.toHaveBeenCalled();
     });

     it('should clear state when setting ID to null', () => {
        useOrganizationStore.setState({ currentOrganizationId: orgId1, error: 'err' });
        // Use imported mocks directly
        const detailsMock = mockGetOrganizationDetails;
        const membersMock = mockGetOrganizationMembers;
        detailsMock.mockClear(); 
        membersMock.mockClear();
        act(() => { useOrganizationStore.getState().setCurrentOrganizationId(null); });
        const state = useOrganizationStore.getState();
        expect(state.currentOrganizationId).toBeNull();
        expect(state.currentOrganizationDetails).toBeNull();
        expect(state.currentOrganizationMembers).toEqual([]);
        expect(state.error).toBeNull();
        expect(detailsMock).not.toHaveBeenCalled();
        expect(membersMock).not.toHaveBeenCalled();
     });
  });

  // --- fetchOrganizationDetails Tests --- //
  describe('fetchOrganizationDetails', () => {
    const orgId = 'org-detail-test-id';
    const mockOrgDetailsData: Organization = { ...defaultMockOrganization, id: orgId };
    // Use imported mock directly
    const detailMock = mockGetOrganizationDetails;

    it('should call API, update details, and clear loading/error string on success', async () => {
      detailMock.mockResolvedValue({ status: 200, data: mockOrgDetailsData, error: undefined });
      await act(async () => { await useOrganizationStore.getState().fetchOrganizationDetails(orgId); });
      expect(detailMock).toHaveBeenCalledWith(orgId);
      const { currentOrganizationDetails, isLoading, error } = useOrganizationStore.getState();
      expect(currentOrganizationDetails).toEqual(mockOrgDetailsData);
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
    });

    it('should set error string state on API error', async () => {
      const errorMsg = 'Org not found';
      detailMock.mockResolvedValue({ status: 404, data: undefined, error: { message: errorMsg, code: '404' } }); // data: undefined
      await act(async () => { await useOrganizationStore.getState().fetchOrganizationDetails(orgId); });
      const { currentOrganizationDetails, isLoading, error } = useOrganizationStore.getState();
      expect(currentOrganizationDetails).toBeNull();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });

     it('should set error string state on unexpected error', async () => {
      const errorMsg = 'Network fail';
      detailMock.mockRejectedValue(new Error(errorMsg));
      await act(async () => { await useOrganizationStore.getState().fetchOrganizationDetails(orgId); });
      const { error } = useOrganizationStore.getState();
      expect(error).toBe(errorMsg);
     });
  });

  // --- fetchCurrentOrganizationMembers Tests --- //
  describe('fetchCurrentOrganizationMembers', () => {
    const orgId = 'org-members-test-id';
    // Use imported defaultMockMembers
    const mockMembersData: OrganizationMemberWithProfile[] = defaultMockMembers;
    // Use imported mock directly
    const membersMock = mockGetOrganizationMembers;

    it('should do nothing if currentOrganizationId is null', async () => {
      useOrganizationStore.setState({ currentOrganizationId: null });
      await act(async () => { await useOrganizationStore.getState().fetchCurrentOrganizationMembers(); });
      expect(membersMock).not.toHaveBeenCalled();
    });

    it('should call API, update members, and clear loading/error string on success', async () => {
      membersMock.mockResolvedValue({ status: 200, data: mockMembersData, error: undefined });
      useOrganizationStore.setState({ currentOrganizationId: orgId });
      await act(async () => { await useOrganizationStore.getState().fetchCurrentOrganizationMembers(); });
      expect(membersMock).toHaveBeenCalledWith(orgId);
      const finalState = useOrganizationStore.getState();
      expect(finalState.currentOrganizationMembers).toEqual(mockMembersData);
      expect(finalState.error).toBeNull();
    });

    it('should set error string, clear members, and clear loading on API error', async () => {
      const errorMsg = 'Failed members';
      // Use `undefined` for data on error, not `null`
      membersMock.mockResolvedValue({ status: 500, data: undefined, error: { message: errorMsg, code: '500' } });
      useOrganizationStore.setState({ currentOrganizationId: orgId });
      await act(async () => { await useOrganizationStore.getState().fetchCurrentOrganizationMembers(); });
      const finalState = useOrganizationStore.getState();
      expect(finalState.currentOrganizationMembers).toEqual([]);
      expect(finalState.error).toBe(errorMsg);
    });
    
    it('should set error string, clear members, and clear loading on unexpected error', async () => {
      const errorMsg = 'Broke';
      membersMock.mockRejectedValue(new Error(errorMsg));
      useOrganizationStore.setState({ currentOrganizationId: orgId });
      await act(async () => { await useOrganizationStore.getState().fetchCurrentOrganizationMembers(); });
      const finalState = useOrganizationStore.getState();
      expect(finalState.currentOrganizationMembers).toEqual([]);
      expect(finalState.error).toBe(errorMsg);
    });
  });

  // --- softDeleteOrganization Tests --- //
  describe('softDeleteOrganization', () => {
    const orgIdToDelete = defaultMockOrganization.id;
    let mockCloseDeleteDialog: vi.mock; // Define mock for the new action

    beforeEach(() => {
      // Setup initial state with the org to be deleted
      useOrganizationStore.setState({
        userOrganizations: [defaultMockOrganization],
        currentOrganizationId: orgIdToDelete, // Assume it's the current org
        currentOrganizationDetails: defaultMockOrganization,
        // Mock the close dialog action for this test suite
        closeDeleteDialog: mockCloseDeleteDialog = vi.fn() 
      });
    });

    it('should update state and call closeDialog on successful delete', async () => {
      mockDeleteOrganization.mockResolvedValue({ status: 204, data: undefined, error: undefined });
      // Use act to wrap the store action call
      let result = false;
      await act(async () => {
        result = await useOrganizationStore.getState().softDeleteOrganization(orgIdToDelete);
      });
      expect(result).toBe(true);
      expect(mockDeleteOrganization).toHaveBeenCalledWith(orgIdToDelete);
      const state = useOrganizationStore.getState();
      expect(state.userOrganizations).toEqual([]); // Org removed from list
      expect(state.currentOrganizationId).toBeNull(); // Current org cleared
      expect(state.currentOrganizationDetails).toBeNull(); // Details cleared
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(mockCloseDeleteDialog).toHaveBeenCalledTimes(1); // Verify close dialog was called
    });

    it('should NOT clear current org context if deleting a different org', async () => {
      const otherOrgId = 'org-other';
      useOrganizationStore.setState({ currentOrganizationId: otherOrgId }); // Set current to different org
      mockDeleteOrganization.mockResolvedValue({ status: 204, data: undefined, error: undefined });
      await act(async () => { await useOrganizationStore.getState().softDeleteOrganization(orgIdToDelete); });
      expect(mockDeleteOrganization).toHaveBeenCalledWith(orgIdToDelete);
      const state = useOrganizationStore.getState();
      expect(state.userOrganizations).toEqual([]);
      expect(state.currentOrganizationId).toBe(otherOrgId); // Current org remains
      expect(mockCloseDeleteDialog).toHaveBeenCalledTimes(1); // Dialog still closed
    });

    it('should set error and not change state on API failure', async () => {
      const errorMsg = 'Deletion failed';
      mockDeleteOrganization.mockResolvedValue({ status: 500, data: undefined, error: { message: errorMsg, code: '500' } });
      // Use act to wrap the store action call
      let result = true;
      await act(async () => {
          result = await useOrganizationStore.getState().softDeleteOrganization(orgIdToDelete);
      });
      expect(result).toBe(false);
      expect(mockDeleteOrganization).toHaveBeenCalledWith(orgIdToDelete);
      const state = useOrganizationStore.getState();
      expect(state.userOrganizations).toEqual([defaultMockOrganization]); // List unchanged
      expect(state.currentOrganizationId).toBe(orgIdToDelete); // Current org unchanged
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe(errorMsg);
      expect(mockCloseDeleteDialog).not.toHaveBeenCalled(); // Verify close dialog NOT called
    });
  });

  // --- UI Action Tests ---
  describe('UI Actions', () => {
    it('openCreateModal should set isCreateModalOpen to true', () => {
      act(() => { useOrganizationStore.getState().openCreateModal(); });
      expect(useOrganizationStore.getState().isCreateModalOpen).toBe(true);
    });

    it('closeCreateModal should set isCreateModalOpen to false', () => {
      useOrganizationStore.setState({ isCreateModalOpen: true }); // Start open
      act(() => { useOrganizationStore.getState().closeCreateModal(); });
      expect(useOrganizationStore.getState().isCreateModalOpen).toBe(false);
    });

    it('openDeleteDialog should set isDeleteDialogOpen to true', () => {
      act(() => { useOrganizationStore.getState().openDeleteDialog(); });
      expect(useOrganizationStore.getState().isDeleteDialogOpen).toBe(true);
    });

    it('closeDeleteDialog should set isDeleteDialogOpen to false', () => {
      useOrganizationStore.setState({ isDeleteDialogOpen: true }); // Start open
      act(() => { useOrganizationStore.getState().closeDeleteDialog(); });
      expect(useOrganizationStore.getState().isDeleteDialogOpen).toBe(false);
    });
  });

  // --- Selector Tests --- 
  describe('Selectors', () => {
     it('selectCurrentUserRoleInOrg should return correct role or null', () => {
        // Add more cases if needed (e.g., member, no match)
     });

     it('selectIsDeleteDialogOpen should return the correct state', () => {
        expect(useOrganizationStore.getState().selectIsDeleteDialogOpen()).toBe(false); // Initial
        useOrganizationStore.setState({ isDeleteDialogOpen: true });
        expect(useOrganizationStore.getState().selectIsDeleteDialogOpen()).toBe(true);
     });

  }); // End Selectors describe

  // --- Combined / More Complex Scenarios (Optional) ---

}); // End Main describe