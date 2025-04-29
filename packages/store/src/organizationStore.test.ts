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
    const orgToDeleteId = 'org-to-delete';
    const otherOrgId = 'other-org';
    const initialOrgs: Organization[] = [
        { ...defaultMockOrganization, id: orgToDeleteId, name: 'Delete Me' },
        { ...defaultMockOrganization, id: otherOrgId, name: 'Keep Me' },
    ];
    // Use imported mock directly
    const deleteMock = mockDeleteOrganization;

    it('should call API, remove org from list, return true on success (not current org)', async () => {
      deleteMock.mockResolvedValue({ status: 204, data: undefined, error: undefined });
      useOrganizationStore.setState({ userOrganizations: initialOrgs, currentOrganizationId: otherOrgId });
      // Need act here as state is updated internally
      let result: boolean | undefined;
      await act(async () => {
          result = await useOrganizationStore.getState().softDeleteOrganization(orgToDeleteId);
      });
      expect(result).toBe(true);
      expect(deleteMock).toHaveBeenCalledWith(orgToDeleteId);
      const finalState = useOrganizationStore.getState();
      expect(finalState.userOrganizations).toEqual([initialOrgs[1]]);
    });

    it('should call API, remove org, clear current context, return true on success (current org)', async () => {
      deleteMock.mockResolvedValue({ status: 204, data: undefined, error: undefined });
      useOrganizationStore.setState({ 
          userOrganizations: initialOrgs, 
          currentOrganizationId: orgToDeleteId,
          currentOrganizationDetails: initialOrgs[0],
          // Ensure members are using the correct type from the imported mock
          currentOrganizationMembers: defaultMockMembers 
      });
      // Need act here as state is updated internally
      let result: boolean | undefined;
      await act(async () => {
          result = await useOrganizationStore.getState().softDeleteOrganization(orgToDeleteId);
      });
      expect(result).toBe(true);
      expect(deleteMock).toHaveBeenCalledWith(orgToDeleteId);
      const finalState = useOrganizationStore.getState();
      expect(finalState.currentOrganizationId).toBeNull(); 
    });

    it('should set error string, not modify state, and return false on API error', async () => {
      const errorMsg = 'Forbidden';
      deleteMock.mockResolvedValue({ status: 403, data: undefined, error: { message: errorMsg, code: '403' } }); // data: undefined
      useOrganizationStore.setState({ userOrganizations: initialOrgs });
      // Need act here as state is updated internally
      let result: boolean | undefined;
      await act(async () => {
          result = await useOrganizationStore.getState().softDeleteOrganization(orgToDeleteId);
      });
      expect(result).toBe(false);
      expect(deleteMock).toHaveBeenCalledWith(orgToDeleteId);
      const finalState = useOrganizationStore.getState();
      expect(finalState.userOrganizations).toEqual(initialOrgs);
      expect(finalState.error).toBe(errorMsg);
    });

    it('should set error string, not modify state, and return false on unexpected error', async () => {
      const errorMsg = 'Network failed';
      deleteMock.mockRejectedValue(new Error(errorMsg));
      useOrganizationStore.setState({ userOrganizations: initialOrgs });
      // Need act here as state is updated internally
      let result: boolean | undefined;
      await act(async () => {
          result = await useOrganizationStore.getState().softDeleteOrganization(orgToDeleteId);
      });
      expect(result).toBe(false);
      expect(deleteMock).toHaveBeenCalledWith(orgToDeleteId);
      const finalState = useOrganizationStore.getState();
      expect(finalState.userOrganizations).toEqual(initialOrgs);
      expect(finalState.error).toBe(errorMsg);
    });
  });

  // --- [NEW] acceptInvite Tests --- //
  describe('acceptInvite', () => {
    const mockInviteToken = 'valid-invite-token-123';
    const acceptMock = mockAcceptOrganizationInvite; // Use the imported mock

    it('should call API, clear loading/error on success, and return true', async () => {
      acceptMock.mockResolvedValue({ status: 200, data: { success: true }, error: undefined }); // Assuming API returns { success: true } or similar
      useOrganizationStore.setState({ error: 'Previous error', isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().acceptInvite(mockInviteToken);
      });

      expect(result).toBe(true);
      expect(acceptMock).toHaveBeenCalledWith(mockInviteToken);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
      // Optional: Assert refetch of user orgs or members if acceptInvite should trigger it
      // expect(mockListUserOrganizations).toHaveBeenCalled(); 
    });

    it('should set error string, clear loading, and return false on API error', async () => {
      const errorMsg = 'Invite acceptance failed';
      acceptMock.mockResolvedValue({ status: 500, data: undefined, error: { message: errorMsg, code: '500' } });
      useOrganizationStore.setState({ isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().acceptInvite(mockInviteToken);
      });

      expect(result).toBe(false);
      expect(acceptMock).toHaveBeenCalledWith(mockInviteToken);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });

    it('should set error string, clear loading, and return false on invalid/not found token (e.g., 404)', async () => {
        const errorMsg = 'Invite token not found or invalid';
        acceptMock.mockResolvedValue({ status: 404, data: undefined, error: { message: errorMsg, code: '404' } });
        useOrganizationStore.setState({ isLoading: false });
  
        let result: boolean | undefined;
        await act(async () => {
          result = await useOrganizationStore.getState().acceptInvite(mockInviteToken);
        });
  
        expect(result).toBe(false);
        expect(acceptMock).toHaveBeenCalledWith(mockInviteToken);
        const { isLoading, error } = useOrganizationStore.getState();
        expect(isLoading).toBe(false);
        expect(error).toBe(errorMsg);
      });

    it('should set error string, clear loading, and return false on unexpected error', async () => {
      const errorMsg = 'Network error during invite acceptance';
      acceptMock.mockRejectedValue(new Error(errorMsg));
      useOrganizationStore.setState({ isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().acceptInvite(mockInviteToken);
      });

      expect(result).toBe(false);
      expect(acceptMock).toHaveBeenCalledWith(mockInviteToken);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });
  });

  // --- [NEW] declineInvite Tests --- //
  describe('declineInvite', () => {
    const mockInviteToken = 'valid-invite-token-456';
    // Need to add mockDeclineOrganizationInvite to mocks and import it
    const declineMock = mockDeclineOrganizationInvite; 

    it('should call API, clear loading/error on success, and return true', async () => {
      declineMock.mockResolvedValue({ status: 200, data: { success: true }, error: undefined }); // Assuming similar success response
      useOrganizationStore.setState({ error: 'Old error', isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().declineInvite(mockInviteToken);
      });

      expect(result).toBe(true);
      expect(declineMock).toHaveBeenCalledWith(mockInviteToken);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
    });

    it('should set error string, clear loading, and return false on API error', async () => {
      const errorMsg = 'Invite decline failed';
      declineMock.mockResolvedValue({ status: 500, data: undefined, error: { message: errorMsg, code: '500' } });
      useOrganizationStore.setState({ isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().declineInvite(mockInviteToken);
      });

      expect(result).toBe(false);
      expect(declineMock).toHaveBeenCalledWith(mockInviteToken);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });
    
    it('should set error string, clear loading, and return false on invalid/not found token (e.g., 404)', async () => {
        const errorMsg = 'Invite token not found or invalid for decline';
        declineMock.mockResolvedValue({ status: 404, data: undefined, error: { message: errorMsg, code: '404' } });
        useOrganizationStore.setState({ isLoading: false });
  
        let result: boolean | undefined;
        await act(async () => {
          result = await useOrganizationStore.getState().declineInvite(mockInviteToken);
        });
  
        expect(result).toBe(false);
        expect(declineMock).toHaveBeenCalledWith(mockInviteToken);
        const { isLoading, error } = useOrganizationStore.getState();
        expect(isLoading).toBe(false);
        expect(error).toBe(errorMsg);
      });

    it('should set error string, clear loading, and return false on unexpected error', async () => {
      const errorMsg = 'Network error during invite decline';
      declineMock.mockRejectedValue(new Error(errorMsg));
      useOrganizationStore.setState({ isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().declineInvite(mockInviteToken);
      });

      expect(result).toBe(false);
      expect(declineMock).toHaveBeenCalledWith(mockInviteToken);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });
  });

  // --- [NEW] requestJoin Tests --- //
  describe('requestJoin', () => {
    const mockOrgId = 'public-org-to-join';
    // Use the imported mock directly now, no need for local definition
    const requestJoinMock = mockRequestToJoinOrganization;

    beforeEach(() => {
      // Remove the temporary assignment - mock is now part of the main factory
      // vi.mocked(getApiClient)().organizations.requestToJoinOrganization = requestJoinMock; 
      requestJoinMock.mockClear(); // Still need to clear calls
    });

    it('should call API, clear loading/error on success, and return true', async () => {
      requestJoinMock.mockResolvedValue({ status: 200, data: undefined, error: undefined });
      useOrganizationStore.setState({ error: 'Old error', isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().requestJoin(mockOrgId);
      });

      expect(result).toBe(true);
      expect(requestJoinMock).toHaveBeenCalledWith(mockOrgId);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
    });

    it('should set error string, clear loading, and return false on API conflict (e.g., already member/pending - 409)', async () => {
      const errorMsg = 'Already a member or request pending';
      requestJoinMock.mockResolvedValue({ status: 409, data: undefined, error: { message: errorMsg, code: '409' } });
      useOrganizationStore.setState({ isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().requestJoin(mockOrgId);
      });

      expect(result).toBe(false);
      expect(requestJoinMock).toHaveBeenCalledWith(mockOrgId);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });

    it('should set error string, clear loading, and return false on API forbidden (e.g., org not public/joinable - 403/404)', async () => {
        const errorMsg = 'Organization not found or not joinable';
        // Could be 403 or 404 depending on backend RLS/logic
        requestJoinMock.mockResolvedValue({ status: 403, data: undefined, error: { message: errorMsg, code: '403' } }); 
        useOrganizationStore.setState({ isLoading: false });
  
        let result: boolean | undefined;
        await act(async () => {
          result = await useOrganizationStore.getState().requestJoin(mockOrgId);
        });
  
        expect(result).toBe(false);
        expect(requestJoinMock).toHaveBeenCalledWith(mockOrgId);
        const { isLoading, error } = useOrganizationStore.getState();
        expect(isLoading).toBe(false);
        expect(error).toBe(errorMsg);
      });

    it('should set error string, clear loading, and return false on unexpected error', async () => {
      const errorMsg = 'Network error during join request';
      requestJoinMock.mockRejectedValue(new Error(errorMsg));
      useOrganizationStore.setState({ isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().requestJoin(mockOrgId);
      });

      expect(result).toBe(false);
      expect(requestJoinMock).toHaveBeenCalledWith(mockOrgId);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });
  });

  // --- [NEW] approveRequest Tests --- //
  describe('approveRequest', () => {
    const mockMembershipId = 'om-pending-req-123';
    // Use the imported mock directly
    const approveRequestMock = mockApproveJoinRequest;

    beforeEach(() => {
      // Remove the temporary assignment
      // vi.mocked(getApiClient)().organizations.approveJoinRequest = approveRequestMock;
      approveRequestMock.mockClear(); // Still clear calls
    });

    it('should call API, clear loading/error on success, and return true', async () => {
      approveRequestMock.mockResolvedValue({ status: 200, data: undefined, error: undefined });
      useOrganizationStore.setState({ error: 'Old error', isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().approveRequest(mockMembershipId);
      });

      expect(result).toBe(true);
      expect(approveRequestMock).toHaveBeenCalledWith(mockMembershipId);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
      // Optional: Verify if fetchCurrentOrganizationMembers was called if state should update
    });

    it('should set error string, clear loading, and return false on API error (e.g., not found/forbidden - 404/403)', async () => {
      const errorMsg = 'Request not found or action forbidden';
      approveRequestMock.mockResolvedValue({ status: 403, data: undefined, error: { message: errorMsg, code: '403' } });
      useOrganizationStore.setState({ isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().approveRequest(mockMembershipId);
      });

      expect(result).toBe(false);
      expect(approveRequestMock).toHaveBeenCalledWith(mockMembershipId);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });

    it('should set error string, clear loading, and return false on API conflict (e.g., request not pending - 409)', async () => {
        const errorMsg = 'Request is not in a pending state';
        approveRequestMock.mockResolvedValue({ status: 409, data: undefined, error: { message: errorMsg, code: '409' } });
        useOrganizationStore.setState({ isLoading: false });
  
        let result: boolean | undefined;
        await act(async () => {
          result = await useOrganizationStore.getState().approveRequest(mockMembershipId);
        });
  
        expect(result).toBe(false);
        expect(approveRequestMock).toHaveBeenCalledWith(mockMembershipId);
        const { isLoading, error } = useOrganizationStore.getState();
        expect(isLoading).toBe(false);
        expect(error).toBe(errorMsg);
      });

    it('should set error string, clear loading, and return false on unexpected error', async () => {
      const errorMsg = 'Network error during request approval';
      approveRequestMock.mockRejectedValue(new Error(errorMsg));
      useOrganizationStore.setState({ isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().approveRequest(mockMembershipId);
      });

      expect(result).toBe(false);
      expect(approveRequestMock).toHaveBeenCalledWith(mockMembershipId);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });
  });

  // --- [NEW] denyRequest Tests --- //
  describe('denyRequest', () => {
    const mockMembershipId = 'om-pending-req-456';
    // Use the imported mock directly
    const denyRequestMock = mockDenyJoinRequest;

    beforeEach(() => {
      // Remove the temporary assignment
      // vi.mocked(getApiClient)().organizations.denyJoinRequest = denyRequestMock;
      denyRequestMock.mockClear(); // Still clear calls
    });

    it('should call API, clear loading/error on success, and return true', async () => {
      denyRequestMock.mockResolvedValue({ status: 200, data: undefined, error: undefined });
      useOrganizationStore.setState({ error: 'Old error', isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().denyRequest(mockMembershipId);
      });

      expect(result).toBe(true);
      expect(denyRequestMock).toHaveBeenCalledWith(mockMembershipId);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
      // Optional: Verify if fetchCurrentOrganizationMembers was called if state should update
    });

    it('should set error string, clear loading, and return false on API error (e.g., not found/forbidden - 404/403)', async () => {
      const errorMsg = 'Request not found or action forbidden';
      denyRequestMock.mockResolvedValue({ status: 403, data: undefined, error: { message: errorMsg, code: '403' } });
      useOrganizationStore.setState({ isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().denyRequest(mockMembershipId);
      });

      expect(result).toBe(false);
      expect(denyRequestMock).toHaveBeenCalledWith(mockMembershipId);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });

    it('should set error string, clear loading, and return false on API conflict (e.g., request not pending - 409)', async () => {
        const errorMsg = 'Request is not in a pending state';
        denyRequestMock.mockResolvedValue({ status: 409, data: undefined, error: { message: errorMsg, code: '409' } });
        useOrganizationStore.setState({ isLoading: false });
  
        let result: boolean | undefined;
        await act(async () => {
          result = await useOrganizationStore.getState().denyRequest(mockMembershipId);
        });
  
        expect(result).toBe(false);
        expect(denyRequestMock).toHaveBeenCalledWith(mockMembershipId);
        const { isLoading, error } = useOrganizationStore.getState();
        expect(isLoading).toBe(false);
        expect(error).toBe(errorMsg);
      });

    it('should set error string, clear loading, and return false on unexpected error', async () => {
      const errorMsg = 'Network error during request denial';
      denyRequestMock.mockRejectedValue(new Error(errorMsg));
      useOrganizationStore.setState({ isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().denyRequest(mockMembershipId);
      });

      expect(result).toBe(false);
      expect(denyRequestMock).toHaveBeenCalledWith(mockMembershipId);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });
  });

  // --- [NEW] cancelInvite Tests --- //
  describe('cancelInvite', () => {
    const mockOrgId = 'org-123'; // Need org context if API requires it
    const mockInviteId = 'invite-to-cancel-789';
    // Use the imported mock directly
    const cancelInviteMock = mockCancelInvite;

    beforeEach(() => {
      // Remove the temporary assignment
      // vi.mocked(getApiClient)().organizations.cancelInvite = cancelInviteMock;
      cancelInviteMock.mockClear(); // Still clear calls
      // Set current org context if needed by the action
      useOrganizationStore.setState({ currentOrganizationId: mockOrgId });
    });

    it('should call API, clear loading/error on success, and return true', async () => {
      cancelInviteMock.mockResolvedValue({ status: 200, data: undefined, error: undefined });
      useOrganizationStore.setState({ error: 'Old error', isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        // Assuming cancelInvite takes only inviteId based on plan
        result = await useOrganizationStore.getState().cancelInvite(mockInviteId);
      });

      expect(result).toBe(true);
      // Verify mock call based on actual API client method signature
      // If it needs orgId: expect(cancelInviteMock).toHaveBeenCalledWith(mockOrgId, mockInviteId);
      expect(cancelInviteMock).toHaveBeenCalledWith(mockOrgId, mockInviteId); // Assuming API needs orgId from context and inviteId
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
      // Optional: Verify if a fetch for pending invites/members was called
    });

    it('should set error string, clear loading, and return false on API error (e.g., not found/forbidden - 404/403)', async () => {
      const errorMsg = 'Invite not found or action forbidden';
      cancelInviteMock.mockResolvedValue({ status: 403, data: undefined, error: { message: errorMsg, code: '403' } });
      useOrganizationStore.setState({ isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().cancelInvite(mockInviteId);
      });

      expect(result).toBe(false);
      expect(cancelInviteMock).toHaveBeenCalledWith(mockOrgId, mockInviteId);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });

    it('should set error string, clear loading, and return false on API conflict (e.g., invite not pending - 409)', async () => {
        const errorMsg = 'Invite is not in a pending state';
        cancelInviteMock.mockResolvedValue({ status: 409, data: undefined, error: { message: errorMsg, code: '409' } });
        useOrganizationStore.setState({ isLoading: false });
  
        let result: boolean | undefined;
        await act(async () => {
          result = await useOrganizationStore.getState().cancelInvite(mockInviteId);
        });
  
        expect(result).toBe(false);
        expect(cancelInviteMock).toHaveBeenCalledWith(mockOrgId, mockInviteId);
        const { isLoading, error } = useOrganizationStore.getState();
        expect(isLoading).toBe(false);
        expect(error).toBe(errorMsg);
      });

    it('should set error string, clear loading, and return false on unexpected error', async () => {
      const errorMsg = 'Network error during invite cancellation';
      cancelInviteMock.mockRejectedValue(new Error(errorMsg));
      useOrganizationStore.setState({ isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().cancelInvite(mockInviteId);
      });

      expect(result).toBe(false);
      expect(cancelInviteMock).toHaveBeenCalledWith(mockOrgId, mockInviteId);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });
    
    it('should set error and return false if currentOrganizationId is null', async () => {
        useOrganizationStore.setState({ currentOrganizationId: null }); // Ensure no org context
        cancelInviteMock.mockClear(); // Clear any previous calls

        let result: boolean | undefined;
        await act(async () => {
          result = await useOrganizationStore.getState().cancelInvite(mockInviteId);
        });

        expect(result).toBe(false);
        expect(cancelInviteMock).not.toHaveBeenCalled(); // API should not be called
        const { isLoading, error } = useOrganizationStore.getState();
        expect(isLoading).toBe(false);
        expect(error).toBe('Cannot cancel invite without organization context.');
      });
  });

  // --- [UPDATE] inviteUser Tests --- //
  describe('inviteUser', () => {
    const mockOrgId = 'org-123'; 
    const mockEmail = 'new.user@example.com';
    const mockRole = 'member';
    // Use the imported mock directly
    const inviteByEmailMock = mockInviteUserByEmail;

    beforeEach(() => {
      // Remove the temporary assignment
      // vi.mocked(getApiClient)().organizations.inviteUserByEmail = inviteByEmailMock;
      inviteByEmailMock.mockClear(); // Still clear calls
      // Set current org context
      useOrganizationStore.setState({ currentOrganizationId: mockOrgId });
    });

    it('should call API with email, clear loading/error on success, and return true', async () => {
      inviteByEmailMock.mockResolvedValue({ status: 201, data: { id: 'new-invite-id' }, error: undefined }); // Assuming API returns invite details
      useOrganizationStore.setState({ error: 'Old error', isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().inviteUser(mockEmail, mockRole);
      });

      expect(result).toBe(true);
      expect(inviteByEmailMock).toHaveBeenCalledWith(mockOrgId, mockEmail, mockRole);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
      // Optional: Verify if a fetch for pending invites/members was called
    });

    it('should set error string, clear loading, and return false on API error (e.g., existing member/invite - 409)', async () => {
      const errorMsg = 'User is already a member or has a pending invite';
      inviteByEmailMock.mockResolvedValue({ status: 409, data: undefined, error: { message: errorMsg, code: '409' } });
      useOrganizationStore.setState({ isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().inviteUser(mockEmail, mockRole);
      });

      expect(result).toBe(false);
      expect(inviteByEmailMock).toHaveBeenCalledWith(mockOrgId, mockEmail, mockRole);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });
    
    it('should set error string, clear loading, and return false on API error (e.g., invalid email/role - 400)', async () => {
        const errorMsg = 'Invalid email format or role specified';
        inviteByEmailMock.mockResolvedValue({ status: 400, data: undefined, error: { message: errorMsg, code: '400' } });
        useOrganizationStore.setState({ isLoading: false });
  
        let result: boolean | undefined;
        await act(async () => {
          result = await useOrganizationStore.getState().inviteUser('invalid-email', mockRole);
        });
  
        expect(result).toBe(false);
        expect(inviteByEmailMock).toHaveBeenCalledWith(mockOrgId, 'invalid-email', mockRole);
        const { isLoading, error } = useOrganizationStore.getState();
        expect(isLoading).toBe(false);
        expect(error).toBe(errorMsg);
      });

    it('should set error string, clear loading, and return false on unexpected error', async () => {
      const errorMsg = 'Network error during user invitation';
      inviteByEmailMock.mockRejectedValue(new Error(errorMsg));
      useOrganizationStore.setState({ isLoading: false });

      let result: boolean | undefined;
      await act(async () => {
        result = await useOrganizationStore.getState().inviteUser(mockEmail, mockRole);
      });

      expect(result).toBe(false);
      expect(inviteByEmailMock).toHaveBeenCalledWith(mockOrgId, mockEmail, mockRole);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });
    
    it('should set error and return false if currentOrganizationId is null', async () => {
        useOrganizationStore.setState({ currentOrganizationId: null }); // Ensure no org context
        inviteByEmailMock.mockClear(); // Clear any previous calls

        let result: boolean | undefined;
        await act(async () => {
          result = await useOrganizationStore.getState().inviteUser(mockEmail, mockRole);
        });

        expect(result).toBe(false);
        expect(inviteByEmailMock).not.toHaveBeenCalled(); // API should not be called
        const { isLoading, error } = useOrganizationStore.getState();
        expect(isLoading).toBe(false);
        expect(error).toBe('Cannot invite user without organization context.');
      });
  });

  // --- [REFACTORED] fetchCurrentOrganizationMembers (Includes Pending Items Fetch) Tests --- //
  describe('fetchCurrentOrganizationMembers (Includes Pending Items Fetch)', () => {
    const mockOrgId = 'org-123';
    const mockAdminUserId = 'admin-user-id';
    const mockMemberUserId = 'member-user-id';

    // Mock active members, including an admin and a regular member
    const mockActiveMembers: OrganizationMemberWithProfile[] = [
        { ...defaultMockMembers[0], user_id: mockAdminUserId, role: 'admin', status: 'active' }, // <-- Removed email
        { ...defaultMockMembers[1], user_id: mockMemberUserId, role: 'member', status: 'active' }, // <-- Removed email
    ];

    const mockPendingInvitesData: Invite[] = [
        { id: 'invite-1', invite_token: 'tok1', organization_id: mockOrgId, invited_email: 'pending@invite.com', role_to_assign: 'member', invited_by_user_id: mockAdminUserId, status: 'pending', created_at: new Date().toISOString(), expires_at: null },
    ];
    const mockPendingRequestsData: OrganizationMemberWithProfile[] = [
        // Ensure structure matches OrganizationMemberWithProfile, including profile
        { 
            id: 'om-pending-1', 
            user_id: 'pending-user-id', 
            organization_id: mockOrgId,
            role: 'member', 
            status: 'pending', 
            created_at: new Date().toISOString(), 
            user_profiles: { // <-- Changed from user_profile
                id: 'pending-user-id', 
                email: 'pending.user@req.com', 
                full_name: 'Pending Request User', 
                avatar_url: null,
                updated_at: new Date().toISOString(),
                created_at: new Date().toISOString()
            }
        }
    ];
    
    // Use imported mocks
    const getMembersMock = mockGetOrganizationMembers;
    const getPendingMock = mockGetPendingItems; // <-- Use corrected mock variable name

    beforeEach(() => {
      // Reset mocks used in this suite
      getMembersMock.mockClear();
      getPendingMock.mockClear(); // <-- Now refers to the correctly imported mock
      
      // Set current org context
      useOrganizationStore.setState({ currentOrganizationId: mockOrgId });
    });

    // Helper to set the logged-in user for a test
    const setLoggedInUser = (userId: string | null) => {
        act(() => {
            vi.mocked(useAuthStore.getState).mockReturnValue({
                ...mockAuthStoreState,
                user: userId ? { ...mockSupabaseUser, id: userId } : null, // Set specific user ID or null
                session: userId ? mockSession : null
            });
        });
    }

    it('should fetch active members AND pending items if user is admin', async () => {
      setLoggedInUser(mockAdminUserId); // Log in as admin
      getMembersMock.mockResolvedValue({ status: 200, data: mockActiveMembers, error: undefined });
      getPendingMock.mockResolvedValue({ 
          status: 200, 
          data: { pendingInvites: mockPendingInvitesData, pendingRequests: mockPendingRequestsData }, 
          error: undefined 
      });
      useOrganizationStore.setState({ error: 'Old error', isLoading: false, currentPendingInvites: [], currentPendingRequests: [] });

      await act(async () => {
        await useOrganizationStore.getState().fetchCurrentOrganizationMembers();
      });

      expect(getMembersMock).toHaveBeenCalledWith(mockOrgId);
      expect(getPendingMock).toHaveBeenCalledWith(mockOrgId); // Admin should trigger pending fetch
      const { isLoading, error, currentOrganizationMembers, currentPendingInvites, currentPendingRequests } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
      expect(currentOrganizationMembers).toEqual(mockActiveMembers);
      expect(currentPendingInvites).toEqual(mockPendingInvitesData);
      expect(currentPendingRequests).toEqual(mockPendingRequestsData);
    });

    it('should fetch only active members and clear pending state if user is NOT admin', async () => {
      setLoggedInUser(mockMemberUserId); // Log in as regular member
      getMembersMock.mockResolvedValue({ status: 200, data: mockActiveMembers, error: undefined });
      // Mock pending API to ensure it wasn't called incorrectly
      getPendingMock.mockResolvedValue({ status: 200, data: { pendingInvites: [], pendingRequests: [] }, error: undefined }); 
      useOrganizationStore.setState({ error: 'Old error', isLoading: false, currentPendingInvites: [{} as any], currentPendingRequests: [{} as any] }); // Pre-fill pending

      await act(async () => {
        await useOrganizationStore.getState().fetchCurrentOrganizationMembers();
      });

      expect(getMembersMock).toHaveBeenCalledWith(mockOrgId);
      expect(getPendingMock).not.toHaveBeenCalled(); // Non-admin should NOT trigger pending fetch
      const { isLoading, error, currentOrganizationMembers, currentPendingInvites, currentPendingRequests } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
      expect(currentOrganizationMembers).toEqual(mockActiveMembers);
      expect(currentPendingInvites).toEqual([]); // Should be cleared
      expect(currentPendingRequests).toEqual([]); // Should be cleared
    });

    it('should clear pending state if fetching pending items fails for admin', async () => {
      setLoggedInUser(mockAdminUserId); // Log in as admin
      const errorMsg = 'Forbidden fetching pending items';
      getMembersMock.mockResolvedValue({ status: 200, data: mockActiveMembers, error: undefined });
      getPendingMock.mockResolvedValue({ status: 403, data: undefined, error: { message: errorMsg, code: '403' } }); // Pending fetch fails
      useOrganizationStore.setState({ isLoading: false, currentPendingInvites: [{} as any], currentPendingRequests: [{} as any] }); // Pre-fill pending

      await act(async () => {
        await useOrganizationStore.getState().fetchCurrentOrganizationMembers();
      });

      expect(getMembersMock).toHaveBeenCalledWith(mockOrgId);
      expect(getPendingMock).toHaveBeenCalledWith(mockOrgId);
      const { isLoading, error, currentOrganizationMembers, currentPendingInvites, currentPendingRequests } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBeNull(); // Main error should remain null if members fetch succeeded
      expect(currentOrganizationMembers).toEqual(mockActiveMembers); // Active members should still be set
      expect(currentPendingInvites).toEqual([]); // Should be cleared due to pending fetch error
      expect(currentPendingRequests).toEqual([]); // Should be cleared due to pending fetch error
      // Check logs for the specific error
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.stringContaining('(Pending Actions)'), 
        expect.objectContaining({ message: errorMsg })
      );
    });

     it('should set error and clear all state if fetching active members fails', async () => {
       setLoggedInUser(mockAdminUserId); // Log in as admin
       const errorMsg = 'Failed to fetch members';
       getMembersMock.mockResolvedValue({ status: 500, data: undefined, error: { message: errorMsg, code: '500' } }); // Members fetch fails
       getPendingMock.mockClear(); // Ensure pending isn't called
       useOrganizationStore.setState({ isLoading: false, currentOrganizationMembers: [{} as any], currentPendingInvites: [{} as any], currentPendingRequests: [{} as any] }); // Pre-fill state

       await act(async () => {
         await useOrganizationStore.getState().fetchCurrentOrganizationMembers();
       });

       expect(getMembersMock).toHaveBeenCalledWith(mockOrgId);
       expect(getPendingMock).not.toHaveBeenCalled(); // Should not proceed to pending fetch
       const { isLoading, error, currentOrganizationMembers, currentPendingInvites, currentPendingRequests } = useOrganizationStore.getState();
       expect(isLoading).toBe(false);
       expect(error).toBe(errorMsg); // Main error should be set
       expect(currentOrganizationMembers).toEqual([]); // Cleared due to error
       expect(currentPendingInvites).toEqual([]); // Also cleared 
       expect(currentPendingRequests).toEqual([]); // Also cleared
     });

     it('should clear state and not call APIs if currentOrganizationId is null', async () => {
       useOrganizationStore.setState({ currentOrganizationId: null }); // No org context
       setLoggedInUser(mockAdminUserId); // Set a user, but orgId is null
       getMembersMock.mockClear();
       getPendingMock.mockClear();

       await act(async () => {
         await useOrganizationStore.getState().fetchCurrentOrganizationMembers();
       });

       expect(getMembersMock).not.toHaveBeenCalled();
       expect(getPendingMock).not.toHaveBeenCalled();
       const { isLoading, error, currentOrganizationMembers, currentPendingInvites, currentPendingRequests } = useOrganizationStore.getState();
       expect(isLoading).toBe(false);
       expect(error).toBeNull(); // No error set, just returns early
       expect(currentOrganizationMembers).toEqual([]); 
       expect(currentPendingInvites).toEqual([]);
       expect(currentPendingRequests).toEqual([]);
     });
     
     it('should clear state and set error if user is not authenticated', async () => {
        setLoggedInUser(null); // No logged-in user
        useOrganizationStore.setState({ currentOrganizationId: mockOrgId }); // Org context exists
        getMembersMock.mockClear();
        getPendingMock.mockClear();

        await act(async () => {
            await useOrganizationStore.getState().fetchCurrentOrganizationMembers();
        });

        expect(getMembersMock).not.toHaveBeenCalled();
        expect(getPendingMock).not.toHaveBeenCalled();
        const { isLoading, error, currentOrganizationMembers, currentPendingInvites, currentPendingRequests } = useOrganizationStore.getState();
        expect(isLoading).toBe(false);
        expect(error).toBe('User not authenticated');
        expect(currentOrganizationMembers).toEqual([]); 
        expect(currentPendingInvites).toEqual([]);
        expect(currentPendingRequests).toEqual([]);
     });

  });

}); // End OrganizationStore describe block