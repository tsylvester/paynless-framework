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
    mockApproveJoinRequest // Import the new mock
} from '../../api/src/mocks/organizations.mock.ts';

// Other imports
import { useOrganizationStore } from './organizationStore';
import { useAuthStore } from './authStore';
import { Organization, OrganizationMemberWithProfile, SupabaseUser, ApiError as ApiErrorType, AuthStore, ApiResponse } from '@paynless/types';
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
            approveJoinRequest: mockApproveJoinRequest // Add the imported mock here
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

}); // End Test Suite