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
    defaultMockMembers 
} from '../../api/src/mocks/organizations.mock.ts';

// Other imports
import { useOrganizationStore } from './organizationStore';
import { useAuthStore } from './authStore';
import { Organization, OrganizationMemberWithProfile, SupabaseUser, ApiError as ApiErrorType, AuthStore } from '@paynless/types';
import { initializeApiClient, _resetApiClient } from '@paynless/api'; // Keep original names for mocking target
import { logger } from '@paynless/utils';
import { act } from '@testing-library/react';

// --- Mock Dependencies --- //

vi.mock('@paynless/utils', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

// Mock @paynless/api: Use a simple synchronous factory referencing top-level mocks
vi.mock('@paynless/api', () => ({
    // Keep non-api exports if needed (assuming they exist)
    initializeApiClient: vi.fn(),
    _resetApiClient: vi.fn(),
    api: { // Mock the api object directly
        organizations: {
            // Use mocks imported above
            getCurrentOrganization: mockGetCurrentOrganization,
            updateOrganization: mockUpdateOrganization,
            getOrganizationMembers: mockGetOrganizationMembers,
            removeMember: mockRemoveOrganizationMember, // Check name alignment with store usage
            leaveOrganization: mockLeaveOrganization,
            listUserOrganizations: mockListUserOrganizations,
            getOrganizationDetails: mockGetOrganizationDetails,
            deleteOrganization: mockDeleteOrganization,
            createOrganization: mockCreateOrganization,
        },
        // Mock other namespaces/methods if necessary
        auth: { /* mock if needed */ },
        billing: { /* mock if needed */ },
        getSupabaseClient: vi.fn(() => ({ auth: { /* mock supabase auth if needed */ } }))
    },
}));

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
    });
  });

  afterEach(() => {
      // Call the mocked _resetApiClient (if needed)
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

}); // End Test Suite