import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// Import the shared API client mock factory and reset function
import { createMockOrganizationApiClient, resetMockOrganizationApiClient } from '@paynless/api/mocks/organizations.api.mock';

// Other imports
import { useOrganizationStore } from './organizationStore';
import { useAuthStore } from './authStore';
import { Organization, OrganizationMemberWithProfile, SupabaseUser, ApiError as ApiErrorType, AuthStore, ApiResponse, Invite, PendingOrgItems } from '@paynless/types';
// Removed unused imports
// import { initializeApiClient, _resetApiClient, ApiClient, OrganizationApiClient } from '@paynless/api'; 
import { logger } from '@paynless/utils';
import { act } from '@testing-library/react';
// --- Import the REAL getApiClient and the MODULE object --- 
import * as apiModule from '@paynless/api'; 

// --- Mock Dependencies --- //

vi.mock('@paynless/utils', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

// --- Create an instance of the shared mock API client --- 
const mockOrgApi = createMockOrganizationApiClient();

// --- REMOVE the vi.mock('@paynless/api', ...) block --- 

// --- Define Realistic Mock Data (instead of default mocks) ---
const mockOrg1: Organization = {
    id: 'org-1',
    name: 'Org One',
    created_at: new Date().toISOString(),
    visibility: 'private',
    // Add other fields as needed
};
const mockOrg2: Organization = {
    id: 'org-2',
    name: 'Org Two',
    created_at: new Date().toISOString(),
    visibility: 'public',
};

const mockMember1: OrganizationMemberWithProfile = {
    id: 'mem-1',
    organization_id: 'org-1',
    user_id: 'user-123',
    role: 'admin',
    status: 'active',
    created_at: new Date().toISOString(),
    user_profiles: { // Nested profile data
        id: 'user-123',
        first_name: 'Admin',
        last_name: 'User',
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        role: 'admin'
    }
};
const mockMember2: OrganizationMemberWithProfile = {
    id: 'mem-2',
    organization_id: 'org-1',
    user_id: 'user-456',
    role: 'member',
    status: 'active',
    created_at: new Date().toISOString(),
    user_profiles: {
        id: 'user-456',
        first_name: 'Member',
        last_name: 'User',
        avatar_url: 'http://example.com/avatar.png',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        role: 'member'
    }
};


// --- DEFINE MOCK AUTH DATA ---
const mockSupabaseUser: SupabaseUser = {
    id: 'user-123', email: 'test@example.com',
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
        getState: vi.fn(() => mockAuthStoreState) // Provide the mocked state
    }
}));

// --- Test Suite Setup --- //
const resetOrgStore = () => useOrganizationStore.setState(useOrganizationStore.getInitialState(), true);

// --- Test Suite --- //
describe('OrganizationStore', () => {
  let getApiClientSpy: MockInstance; // Declare spy variable

  beforeEach(() => {
    // Use the shared reset function for the mock API client
    resetMockOrganizationApiClient(mockOrgApi);
    // Clear all Vitest mock tracking
    vi.clearAllMocks(); 
    vi.restoreAllMocks(); // Restore any spies

    // --- SPY and MOCK getApiClient --- 
    getApiClientSpy = vi.spyOn(apiModule, 'getApiClient').mockReturnValue({ 
        organizations: mockOrgApi, // Return our mock instance
        // Add mocks for other API parts if needed directly by the store
        notifications: vi.fn(),
        ai: vi.fn(),
    } as any); // Use 'as any' or provide full mock ApiClient type
    
    // Reset store & auth mock state
    act(() => {
        resetOrgStore();
        vi.mocked(useAuthStore.getState).mockReturnValue({ 
            ...mockAuthStoreState, 
            user: mockSupabaseUser, // Provide mock user
            session: mockSession   // Provide mock session
        });
    });
  });

  afterEach(() => {
      // No cleanup needed for spies restored in beforeEach
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
    const mockOrgsData: Organization[] = [ mockOrg1, mockOrg2 ];

    it('should update state on success', async () => {
      mockOrgApi.listUserOrganizations.mockResolvedValue({ status: 200, data: mockOrgsData, error: undefined });
      await act(async () => { await useOrganizationStore.getState().fetchUserOrganizations(); }); 
      expect(getApiClientSpy).toHaveBeenCalled(); // Verify getApiClient was called
      expect(mockOrgApi.listUserOrganizations).toHaveBeenCalledTimes(1);
      const { userOrganizations, isLoading, error } = useOrganizationStore.getState();
      expect(userOrganizations).toEqual(mockOrgsData);
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
    });

    it('should set error string state on API failure', async () => {
      const errorMsg = 'Failed fetch';
      mockOrgApi.listUserOrganizations.mockResolvedValue({ status: 500, data: undefined, error: { message: errorMsg, code: '500' } });
      await act(async () => { await useOrganizationStore.getState().fetchUserOrganizations(); }); 
      expect(getApiClientSpy).toHaveBeenCalled();
      expect(mockOrgApi.listUserOrganizations).toHaveBeenCalledTimes(1);
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });

     it('should set error string state if user is not authenticated', async () => {
        const expectedErrorMsg = 'User not authenticated';
        act(() => {
            vi.mocked(useAuthStore.getState).mockReturnValue({
                ...mockAuthStoreState,
                user: null, 
                session: null 
            });
        }); 
        await act(async () => { await useOrganizationStore.getState().fetchUserOrganizations(); }); 
        expect(getApiClientSpy).not.toHaveBeenCalled(); // Shouldn't call getApiClient if not authenticated
        expect(mockOrgApi.listUserOrganizations).not.toHaveBeenCalled();
        const { error } = useOrganizationStore.getState();
        expect(error).toBe(expectedErrorMsg);
     });
  });

  // --- setCurrentOrganizationId Tests --- //
  describe('setCurrentOrganizationId', () => {
     const orgId1 = 'org-1';
     const mockOrgDetailsData: Organization = mockOrg1; 
     const mockMembersWithProfile: OrganizationMemberWithProfile[] = [mockMember1, mockMember2];

    it('should update state and trigger fetches on new ID', async () => {
      mockOrgApi.getOrganizationDetails.mockResolvedValue({ status: 200, data: mockOrgDetailsData as any, error: undefined });
      mockOrgApi.getOrganizationMembers.mockResolvedValue({ status: 200, data: mockMembersWithProfile, error: undefined });
      useOrganizationStore.setState({ error: 'Old error' });
      await act(async () => { 
          useOrganizationStore.getState().setCurrentOrganizationId(orgId1);
          await new Promise(setImmediate);
      });
      const state = useOrganizationStore.getState();
      expect(getApiClientSpy).toHaveBeenCalled(); // It's called internally by fetches
      expect(state.currentOrganizationDetails).toEqual(mockOrgDetailsData); 
      expect(state.currentOrganizationMembers).toEqual(mockMembersWithProfile);
      expect(state.error).toBeNull(); 
      expect(mockOrgApi.getOrganizationDetails).toHaveBeenCalledWith(orgId1); 
      expect(mockOrgApi.getOrganizationMembers).toHaveBeenCalledWith(orgId1);
    });

     it('should do nothing if setting the same ID', () => {
       useOrganizationStore.setState({ currentOrganizationId: orgId1 });
       mockOrgApi.getOrganizationDetails.mockClear(); 
       mockOrgApi.getOrganizationMembers.mockClear();
       getApiClientSpy.mockClear(); // Clear spy
       act(() => { useOrganizationStore.getState().setCurrentOrganizationId(orgId1); }); 
       expect(getApiClientSpy).not.toHaveBeenCalled(); // Should not trigger fetches
       expect(mockOrgApi.getOrganizationDetails).not.toHaveBeenCalled();
       expect(mockOrgApi.getOrganizationMembers).not.toHaveBeenCalled();
     });

     it('should clear state when setting ID to null', () => {
        useOrganizationStore.setState({ 
            currentOrganizationId: orgId1, 
            currentOrganizationDetails: mockOrg1, 
            currentOrganizationMembers: [mockMember1],
            error: 'err' 
        });
        mockOrgApi.getOrganizationDetails.mockClear(); 
        mockOrgApi.getOrganizationMembers.mockClear();
        getApiClientSpy.mockClear(); // Clear spy
       act(() => { useOrganizationStore.getState().setCurrentOrganizationId(null); }); 
       const state = useOrganizationStore.getState();
       expect(getApiClientSpy).not.toHaveBeenCalled(); // No fetches triggered
       expect(state.currentOrganizationId).toBeNull();
       expect(state.currentOrganizationDetails).toBeNull();
       expect(state.currentOrganizationMembers).toEqual([]);
       expect(state.error).toBeNull(); 
       expect(mockOrgApi.getOrganizationDetails).not.toHaveBeenCalled();
       expect(mockOrgApi.getOrganizationMembers).not.toHaveBeenCalled();
     });
  });

  // --- fetchCurrentOrganizationMembers Tests --- //
  describe('fetchCurrentOrganizationMembers', () => {
      const orgId = 'org-fetch-members';
      const mockMembers: OrganizationMemberWithProfile[] = [mockMember1, mockMember2];

      beforeEach(() => {
          act(() => { useOrganizationStore.setState({ currentOrganizationId: orgId }); });
      });

      it('should update members on success', async () => {
          mockOrgApi.getOrganizationMembers.mockResolvedValue({ status: 200, data: mockMembers });
          await act(async () => { await useOrganizationStore.getState().fetchCurrentOrganizationMembers(); }); 
          expect(getApiClientSpy).toHaveBeenCalled();
          expect(mockOrgApi.getOrganizationMembers).toHaveBeenCalledWith(orgId);
          expect(useOrganizationStore.getState().currentOrganizationMembers).toEqual(mockMembers);
          expect(useOrganizationStore.getState().error).toBeNull();
      });

      it('should set error on failure', async () => {
          const errorMsg = 'Cannot get members';
          mockOrgApi.getOrganizationMembers.mockResolvedValue({ status: 500, error: { message: errorMsg, code: '500' } });
          await act(async () => { await useOrganizationStore.getState().fetchCurrentOrganizationMembers(); }); 
          expect(getApiClientSpy).toHaveBeenCalled();
          expect(mockOrgApi.getOrganizationMembers).toHaveBeenCalledWith(orgId);
          expect(useOrganizationStore.getState().currentOrganizationMembers).toEqual([]);
          expect(useOrganizationStore.getState().error).toBe(errorMsg);
     });
  });

  // --- fetchOrganizationDetails Tests --- //
  describe('fetchOrganizationDetails', () => {
      const orgId = 'org-fetch-details';
      const mockDetails: Organization = { ...mockOrg1, id: orgId };

      it('should update details on success', async () => {
          mockOrgApi.getOrganizationDetails.mockResolvedValue({ status: 200, data: mockDetails as any }); 
          await act(async () => { await useOrganizationStore.getState().fetchOrganizationDetails(orgId); }); 
          expect(getApiClientSpy).toHaveBeenCalled();
          expect(mockOrgApi.getOrganizationDetails).toHaveBeenCalledWith(orgId);
          expect(useOrganizationStore.getState().currentOrganizationDetails).toEqual(mockDetails);
          expect(useOrganizationStore.getState().error).toBeNull();
      });

      it('should set error on failure', async () => {
          const errorMsg = 'Cannot get details';
          mockOrgApi.getOrganizationDetails.mockResolvedValue({ status: 404, error: { message: errorMsg, code: '404' } });
          await act(async () => { await useOrganizationStore.getState().fetchOrganizationDetails(orgId); }); 
          expect(getApiClientSpy).toHaveBeenCalled();
          expect(mockOrgApi.getOrganizationDetails).toHaveBeenCalledWith(orgId);
          expect(useOrganizationStore.getState().currentOrganizationDetails).toBeNull();
          expect(useOrganizationStore.getState().error).toBe(errorMsg);
     });
  });

  // --- createOrganization Tests --- //
  describe('createOrganization', () => {
    const newOrgName = 'New Shiny Org';
    const createdOrg: Organization = { ...mockOrg1, id: 'org-new', name: newOrgName };

    it('should call API, update state, and potentially set current org on success', async () => {
      mockOrgApi.createOrganization.mockResolvedValue({ status: 201, data: createdOrg });
      let returnedOrg: Organization | null = null;
      await act(async () => { 
          returnedOrg = await useOrganizationStore.getState().createOrganization(newOrgName);
      });
      expect(getApiClientSpy).toHaveBeenCalled();
      expect(mockOrgApi.createOrganization).toHaveBeenCalledWith({ name: newOrgName, visibility: 'private' });
      expect(returnedOrg).toEqual(createdOrg);
      const state = useOrganizationStore.getState();
      expect(state.userOrganizations).toContainEqual(createdOrg); 
      expect(state.isCreateModalOpen).toBe(false); 
      expect(state.error).toBeNull();
    });

    it('should set error on API failure', async () => {
      const errorMsg = 'Creation failed';
      mockOrgApi.createOrganization.mockResolvedValue({ status: 400, error: { message: errorMsg, code: '400' } });
      await act(async () => { await useOrganizationStore.getState().createOrganization(newOrgName); }); 
      expect(getApiClientSpy).toHaveBeenCalled();
      expect(mockOrgApi.createOrganization).toHaveBeenCalledWith({ name: newOrgName, visibility: 'private' });
      const state = useOrganizationStore.getState();
      expect(state.error).toBe(errorMsg);
      expect(state.isCreateModalOpen).toBe(false); 
    });
  });

  // --- softDeleteOrganization Tests --- //
  describe('softDeleteOrganization', () => {
      const orgIdToDelete = 'org-delete';
      const initialOrgs = [{ ...mockOrg1, id: orgIdToDelete }, mockOrg2];

      it('should call API, remove from list, and clear current if needed', async () => {
          act(() => {
              useOrganizationStore.setState({ 
                  userOrganizations: initialOrgs,
                  currentOrganizationId: orgIdToDelete, 
                  currentOrganizationDetails: { ...mockOrg1, id: orgIdToDelete },
                  isDeleteDialogOpen: true 
              });
          });
          mockOrgApi.deleteOrganization.mockResolvedValue({ status: 204 });
          await act(async () => { await useOrganizationStore.getState().softDeleteOrganization(orgIdToDelete); });
          expect(getApiClientSpy).toHaveBeenCalled();
          expect(mockOrgApi.deleteOrganization).toHaveBeenCalledWith(orgIdToDelete);
          const state = useOrganizationStore.getState();
          expect(state.userOrganizations).toEqual([mockOrg2]);
          expect(state.currentOrganizationId).toBeNull();
          expect(state.currentOrganizationDetails).toBeNull();
          expect(state.isDeleteDialogOpen).toBe(false);
          expect(state.error).toBeNull();
      });

      it('should only remove from list if deleted org is not current', async () => {
          act(() => { 
              useOrganizationStore.setState({ 
                  userOrganizations: initialOrgs,
                  currentOrganizationId: mockOrg2.id, 
                  currentOrganizationDetails: mockOrg2,
                  isDeleteDialogOpen: true 
              });
          });
          mockOrgApi.deleteOrganization.mockResolvedValue({ status: 204 });
          await act(async () => { await useOrganizationStore.getState().softDeleteOrganization(orgIdToDelete); });
          expect(getApiClientSpy).toHaveBeenCalled();
          expect(mockOrgApi.deleteOrganization).toHaveBeenCalledWith(orgIdToDelete);
          const state = useOrganizationStore.getState();
          expect(state.userOrganizations).toEqual([mockOrg2]);
          expect(state.currentOrganizationId).toBe(mockOrg2.id);
          expect(state.currentOrganizationDetails).toEqual(mockOrg2);
          expect(state.isDeleteDialogOpen).toBe(false);
          expect(state.error).toBeNull();
      });

      it('should set error on API failure', async () => {
          const errorMsg = 'Deletion failed';
          act(() => { useOrganizationStore.setState({ isDeleteDialogOpen: true }); }); 
          mockOrgApi.deleteOrganization.mockResolvedValue({ status: 500, error: { message: errorMsg, code: '500' } });
          await act(async () => { await useOrganizationStore.getState().softDeleteOrganization(orgIdToDelete); });
          expect(getApiClientSpy).toHaveBeenCalled();
          expect(mockOrgApi.deleteOrganization).toHaveBeenCalledWith(orgIdToDelete);
          const state = useOrganizationStore.getState();
          expect(state.error).toBe(errorMsg);
          expect(state.isDeleteDialogOpen).toBe(true);
      });
  });

  // --- Skipped Tests remain skipped --- //
  describe.skip('updateOrganization', () => { /* ... */ });
  describe('leaveOrganization', () => {
      const orgIdToLeave = 'org-leave';
      const initialOrgs = [{ ...mockOrg1, id: orgIdToLeave }, mockOrg2];

       it('should call API, remove from list, and clear current if needed', async () => {
          act(() => { 
              useOrganizationStore.setState({
                  userOrganizations: initialOrgs,
                  currentOrganizationId: orgIdToLeave, 
                  currentOrganizationDetails: { ...mockOrg1, id: orgIdToLeave },
              });
          });
          mockOrgApi.leaveOrganization.mockResolvedValue({ status: 204 }); 
          await act(async () => { await useOrganizationStore.getState().leaveOrganization(orgIdToLeave); });
          expect(getApiClientSpy).toHaveBeenCalled();
          expect(mockOrgApi.leaveOrganization).toHaveBeenCalledWith(orgIdToLeave);
          const state = useOrganizationStore.getState();
          expect(state.userOrganizations).toEqual([mockOrg2]);
          expect(state.currentOrganizationId).toBeNull(); 
          expect(state.currentOrganizationDetails).toBeNull();
          expect(state.error).toBeNull();
      });
      
      it('should set error on API failure', async () => {
          const errorMsg = 'Cannot leave org';
          mockOrgApi.leaveOrganization.mockResolvedValue({ status: 403, error: { message: errorMsg, code: '403' } });
          await act(async () => { await useOrganizationStore.getState().leaveOrganization(orgIdToLeave); });
          expect(getApiClientSpy).toHaveBeenCalled();
          expect(mockOrgApi.leaveOrganization).toHaveBeenCalledWith(orgIdToLeave);
          expect(useOrganizationStore.getState().error).toBe(errorMsg);
      });
    });
  describe.skip('removeOrganizationMember', () => { /* ... */ });
  describe.skip('updateOrganizationMemberRole', () => { /* ... */ });

  // --- Invite/Join Request Actions (Basic Tests) --- //
  describe('inviteUser', () => {
    const orgId = 'org-invite';
    const email = 'new@user.com';
    const role = 'member';
    const mockInvite: Invite = { id: 'invite-123', organization_id: orgId, invited_email: email, role: role, status: 'pending', invite_token: 'token', created_at: '', updated_at: '', invited_user_id: null };

    beforeEach(() => {
        act(() => { useOrganizationStore.setState({ currentOrganizationId: orgId }); }); 
    });

    it('should call API on success', async () => {
        mockOrgApi.inviteUserByEmail.mockResolvedValue({ status: 201, data: mockInvite });
        // Mock refetch after invite
        mockOrgApi.getOrganizationMembers.mockResolvedValue({ status: 200, data: [] }); 
        await act(async () => { await useOrganizationStore.getState().inviteUser(email, role); }); 
        expect(getApiClientSpy).toHaveBeenCalled(); // Called for invite and refetch
        expect(mockOrgApi.inviteUserByEmail).toHaveBeenCalledWith(orgId, email, role);
        expect(mockOrgApi.getOrganizationMembers).toHaveBeenCalledWith(orgId); // Verify refetch
        expect(useOrganizationStore.getState().error).toBeNull();
    });

    it('should set error on API failure', async () => {
        const errorMsg = 'Invite failed';
        mockOrgApi.inviteUserByEmail.mockResolvedValue({ status: 400, error: { message: errorMsg, code: '400' } });
        await act(async () => { await useOrganizationStore.getState().inviteUser(email, role); }); 
        expect(getApiClientSpy).toHaveBeenCalled();
        expect(useOrganizationStore.getState().error).toBe(errorMsg);
        expect(useOrganizationStore.getState().error).not.toBe('Cannot invite user without organization context.');
    });
  });

  describe('acceptInvite', () => {
      const inviteToken = 'accept-token';
      it('should call API on success', async () => {
          mockOrgApi.acceptOrganizationInvite.mockResolvedValue({ status: 200, data: { organizationId: 'org-accepted' } });
          mockOrgApi.listUserOrganizations.mockResolvedValue({ status: 200, data: [] });
          await act(async () => { await useOrganizationStore.getState().acceptInvite(inviteToken); });
          expect(getApiClientSpy).toHaveBeenCalled();
          expect(mockOrgApi.acceptOrganizationInvite).toHaveBeenCalledWith(inviteToken);
          expect(mockOrgApi.listUserOrganizations).toHaveBeenCalled(); 
          expect(useOrganizationStore.getState().error).toBeNull();
      });
      it('should set error on failure', async () => {
          const errorMsg = 'Accept failed';
          mockOrgApi.acceptOrganizationInvite.mockResolvedValue({ status: 404, error: { message: errorMsg, code: '404' } });
          await act(async () => { await useOrganizationStore.getState().acceptInvite(inviteToken); });
          expect(getApiClientSpy).toHaveBeenCalled();
          expect(useOrganizationStore.getState().error).toBe(errorMsg);
      });
  });

   describe('declineInvite', () => {
      const inviteToken = 'decline-token';
      it('should call API on success', async () => {
          mockOrgApi.declineOrganizationInvite.mockResolvedValue({ status: 204 });
          await act(async () => { await useOrganizationStore.getState().declineInvite(inviteToken); });
          expect(getApiClientSpy).toHaveBeenCalled();
          expect(mockOrgApi.declineOrganizationInvite).toHaveBeenCalledWith(inviteToken);
          expect(useOrganizationStore.getState().error).toBeNull();
      });
       it('should set error on failure', async () => {
          const errorMsg = 'Decline failed';
          mockOrgApi.declineOrganizationInvite.mockResolvedValue({ status: 404, error: { message: errorMsg, code: '404' } });
          await act(async () => { await useOrganizationStore.getState().declineInvite(inviteToken); });
          expect(getApiClientSpy).toHaveBeenCalled();
          expect(useOrganizationStore.getState().error).toBe(errorMsg);
    });
  });

  // --- Modal State Tests --- //
  describe('Modal Actions', () => {
    it('should toggle create modal state', () => {
      expect(useOrganizationStore.getState().isCreateModalOpen).toBe(false);
      act(() => { useOrganizationStore.getState().openCreateModal(); });
      expect(useOrganizationStore.getState().isCreateModalOpen).toBe(true);
      act(() => { useOrganizationStore.getState().closeCreateModal(); });
      expect(useOrganizationStore.getState().isCreateModalOpen).toBe(false);
    });

    it('should toggle delete modal state', () => {
      expect(useOrganizationStore.getState().isDeleteDialogOpen).toBe(false);
      act(() => { useOrganizationStore.getState().openDeleteDialog(); });
      expect(useOrganizationStore.getState().isDeleteDialogOpen).toBe(true);
      act(() => { useOrganizationStore.getState().closeDeleteDialog(); });
      expect(useOrganizationStore.getState().isDeleteDialogOpen).toBe(false);
    });
  });

}); // End Describe OrganizationStore