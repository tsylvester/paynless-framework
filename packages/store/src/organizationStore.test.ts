import { describe, it, expect, vi, beforeEach, afterEach, MockInstance } from 'vitest';
// Import the shared API client mock factory and reset function
import { createMockOrganizationApiClient, resetMockOrganizationApiClient } from '../../api/src/mocks/organizations.api.mock';

// Other imports
import { useOrganizationStore, OrganizationStoreImplementation, DEFAULT_PAGE_SIZE } from './organizationStore';
import { useAuthStore } from './authStore';
import { Organization, OrganizationMemberWithProfile, SupabaseUser, ApiError as ApiErrorType, AuthStore, ApiResponse, Invite, PendingOrgItems, UserProfile, OrganizationUpdate, PaginatedMembersResponse } from '@paynless/types';
// Removed unused imports
// import { initializeApiClient, _resetApiClient, ApiClient, OrganizationApiClient } from '@paynless/api'; 
import { logger } from '@paynless/utils';
import { act } from '@testing-library/react';
// --- Import the REAL getApiClient and the MODULE object --- 
import * as apiModule from '@paynless/api'; 

// --- Mock Dependencies --- //

vi.mock('@paynless/utils', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

// --- Define Realistic Mock Data (instead of default mocks) ---
const mockOrg1: Organization = {
    id: 'org-1',
    name: 'Org One',
    created_at: new Date().toISOString(),
    visibility: 'private',
    deleted_at: null,
};
const mockOrg2: Organization = {
    id: 'org-2',
    name: 'Org Two',
    created_at: new Date().toISOString(),
    visibility: 'public',
    deleted_at: null,
};

const mockMember1Profile: UserProfile = {
    id: 'user-123',
    first_name: 'Admin',
    last_name: 'User',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    role: 'admin',
    last_selected_org_id: null
};

const mockMember1: OrganizationMemberWithProfile = {
    id: 'mem-1',
    organization_id: 'org-1',
    user_id: 'user-123',
    role: 'admin',
    status: 'active',
    created_at: new Date().toISOString(),
    user_profiles: mockMember1Profile
};

const mockMember2Profile: UserProfile = {
    id: 'user-456',
    first_name: 'Member',
    last_name: 'User',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    role: 'user',
    last_selected_org_id: null
};

const mockMember2: OrganizationMemberWithProfile = {
    id: 'mem-2',
    organization_id: 'org-1',
    user_id: 'user-456',
    role: 'member',
    status: 'active',
    created_at: new Date().toISOString(),
    user_profiles: mockMember2Profile
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
        getState: vi.fn()
    }
}));

// +++ Define resetMockAuthStore helper +++
const resetMockAuthStore = () => {
  // Get the mock function via the mocked module structure
  const getMock = vi.mocked(useAuthStore.getState);
  getMock.mockReset(); // Reset calls and implementations
  getMock.mockReturnValue({
      user: mockSupabaseUser,
      session: mockSession,
      profile: null,
      isLoading: false,
      error: null,
      navigate: vi.fn(),
      setUser: vi.fn(),
      setSession: vi.fn(),
      setProfile: vi.fn(),
      setIsLoading: vi.fn(),
      setError: vi.fn(),
      setNavigate: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      updateProfile: vi.fn(),
      updateEmail: vi.fn(),
      clearError: vi.fn(),
  } as any);
};
// +++ End Helper Definition +++

// --- Test Suite Setup --- //
const resetOrgStore = () => useOrganizationStore.setState(useOrganizationStore.getInitialState(), true);

// --- Test Suite --- //
describe('OrganizationStore', () => {
  let getApiClientSpy: MockInstance;
  let mockOrgApi: ReturnType<typeof createMockOrganizationApiClient>;

  beforeEach(async () => {
    mockOrgApi = createMockOrganizationApiClient(); 

    resetOrgStore(); 
    resetMockAuthStore(); 

    // Use dynamic import() for ES Module
    const apiModule = await import('@paynless/api');
    if (getApiClientSpy) getApiClientSpy.mockClear();
    
    getApiClientSpy = vi.spyOn(apiModule, 'getApiClient').mockReturnValue({
        organizations: mockOrgApi,
        notifications: vi.fn(() => ({ /* mock methods if needed */ })),
        ai: vi.fn(() => ({ /* mock methods if needed */ })),
        post: vi.fn(),
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    } as any);

    resetMockOrganizationApiClient(mockOrgApi);

  });

  afterEach(() => {
    vi.restoreAllMocks(); 
    localStorage.clear();
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

  describe('fetchUserOrganizations', () => {
    const mockOrgsData: Organization[] = [ mockOrg1, mockOrg2 ];

    it('should update state on success', async () => {
      // FIX: Mock the paginated response structure
      const paginatedResponse = { organizations: mockOrgsData, totalCount: mockOrgsData.length };
      mockOrgApi.listUserOrganizations.mockResolvedValue({ status: 200, data: paginatedResponse, error: undefined });

      await act(async () => { await useOrganizationStore.getState().fetchUserOrganizations(); }); 
      expect(getApiClientSpy).toHaveBeenCalled();
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
        expect(getApiClientSpy).not.toHaveBeenCalled();
        expect(mockOrgApi.listUserOrganizations).not.toHaveBeenCalled();
        const { error } = useOrganizationStore.getState();
        expect(error).toBe(expectedErrorMsg);
     });
  });

  describe('setCurrentOrganizationId', () => {
     const orgId1 = 'org-1';
     const mockOrgDetailsData: Organization = mockOrg1; 
     const mockMembersWithProfile: OrganizationMemberWithProfile[] = [mockMember1, mockMember2];
     let updateProfileMock: MockInstance;

     // Setup mock for updateProfile before each test in this suite
     beforeEach(() => {
        updateProfileMock = vi.mocked(useAuthStore.getState()).updateProfile;
        // Assume updateProfile succeeds by default in these tests unless overridden
        updateProfileMock.mockResolvedValue(mockMember1Profile); 
     });

     afterEach(() => {
        updateProfileMock.mockClear();
     });

    it('should update state, trigger fetches, and update profile on new ID', async () => {
      mockOrgApi.getOrganizationDetails.mockResolvedValue({ status: 200, data: mockOrgDetailsData as any, error: undefined });
      mockOrgApi.getOrganizationMembers.mockResolvedValue({ status: 200, data: mockMembersWithProfile, error: undefined });
      useOrganizationStore.setState({ error: 'Old error' });
      
      await act(async () => { 
          useOrganizationStore.getState().setCurrentOrganizationId(orgId1);
          // Allow microtasks (like the async profile update) to settle
          await new Promise(setImmediate); 
      });
      
      const state = useOrganizationStore.getState();
      expect(state.currentOrganizationId).toBe(orgId1);
      expect(state.error).toBeNull(); 

      // Verify profile update was called
      expect(updateProfileMock).toHaveBeenCalledWith({ last_selected_org_id: orgId1 });
    });

     it('should do nothing if setting the same ID', () => {
       useOrganizationStore.setState({ currentOrganizationId: orgId1 });
       mockOrgApi.getOrganizationDetails.mockClear(); 
       mockOrgApi.getOrganizationMembers.mockClear();
       getApiClientSpy.mockClear();
       act(() => { useOrganizationStore.getState().setCurrentOrganizationId(orgId1); }); 
       expect(getApiClientSpy).not.toHaveBeenCalled();
       expect(mockOrgApi.getOrganizationDetails).not.toHaveBeenCalled();
       expect(mockOrgApi.getOrganizationMembers).not.toHaveBeenCalled();
       // Verify profile update was NOT called
       expect(updateProfileMock).not.toHaveBeenCalled();
     });

     it('should clear state and update profile when setting ID to null', async () => {
        useOrganizationStore.setState({ 
            currentOrganizationId: orgId1, 
            currentOrganizationDetails: mockOrg1, 
            currentOrganizationMembers: [mockMember1],
            error: 'err' 
        });
        mockOrgApi.getOrganizationDetails.mockClear(); 
        mockOrgApi.getOrganizationMembers.mockClear();
        getApiClientSpy.mockClear();
       await act(async () => { 
           useOrganizationStore.getState().setCurrentOrganizationId(null);
           // Allow microtasks (like the async profile update) to settle
           await new Promise(setImmediate); 
       }); 
       
       const state = useOrganizationStore.getState();
       expect(getApiClientSpy).not.toHaveBeenCalled();
       expect(state.currentOrganizationId).toBeNull();
       expect(state.currentOrganizationDetails).toBeNull();
       expect(state.currentOrganizationMembers).toEqual([]);
       expect(state.error).toBeNull(); 
       expect(mockOrgApi.getOrganizationDetails).not.toHaveBeenCalled();
       expect(mockOrgApi.getOrganizationMembers).not.toHaveBeenCalled();
       // Verify profile update was called with null
       expect(updateProfileMock).toHaveBeenCalledWith({ last_selected_org_id: null });
     });
  });

  describe('fetchCurrentOrganizationMembers', () => {
      const orgId = 'org-fetch-members';
      const mockMembers: OrganizationMemberWithProfile[] = [mockMember1, mockMember2];
      // Define default pagination values used in tests (assuming store defaults)
      const defaultTestPage = 1; 
      const defaultTestLimit = DEFAULT_PAGE_SIZE; // Use imported default

      beforeEach(() => {
          act(() => { useOrganizationStore.setState({ currentOrganizationId: orgId }); });
      });

      it('should update members on success', async () => {
          // FIX: Mock the paginated response structure
          const paginatedResponse: PaginatedMembersResponse = { members: mockMembers, totalCount: mockMembers.length };
          mockOrgApi.getOrganizationMembers.mockResolvedValue({ status: 200, data: paginatedResponse });
          await act(async () => { await useOrganizationStore.getState().fetchCurrentOrganizationMembers(); }); 
          expect(getApiClientSpy).toHaveBeenCalled();
          // FIX: Use hardcoded value for limit in assertion
          expect(mockOrgApi.getOrganizationMembers).toHaveBeenCalledWith(orgId, defaultTestPage, 10); 
          expect(useOrganizationStore.getState().currentOrganizationMembers).toEqual(mockMembers);
          expect(useOrganizationStore.getState().memberTotalCount).toEqual(mockMembers.length);
          expect(useOrganizationStore.getState().error).toBeNull();
      });

      it('should set error on failure', async () => {
          const errorMsg = 'Cannot get members';
          mockOrgApi.getOrganizationMembers.mockResolvedValue({ status: 500, error: { message: errorMsg, code: '500' } });
          await act(async () => { await useOrganizationStore.getState().fetchCurrentOrganizationMembers(); }); 
          expect(getApiClientSpy).toHaveBeenCalled();
          // FIX: Use hardcoded value for limit in assertion
          expect(mockOrgApi.getOrganizationMembers).toHaveBeenCalledWith(orgId, defaultTestPage, 10); 
          expect(useOrganizationStore.getState().currentOrganizationMembers).toEqual([]);
          expect(useOrganizationStore.getState().error).toBe(errorMsg);
     });
  });

  describe('fetchCurrentOrganizationDetails', () => {
      const orgId = 'org-fetch-details';
      const mockDetails: Organization = { ...mockOrg1, id: orgId };

      it('should update details on success', async () => {
          // FIX: Set currentOrgId first
          act(() => { useOrganizationStore.setState({ currentOrganizationId: orgId }); });
          mockOrgApi.getOrganizationDetails.mockResolvedValue({ status: 200, data: mockDetails as any }); 
          // FIX: Call the renamed action with no args
          await act(async () => { await useOrganizationStore.getState().fetchCurrentOrganizationDetails(); }); 
          expect(getApiClientSpy).toHaveBeenCalled();
          // FIX: Assert API was called with the ID from state
          expect(mockOrgApi.getOrganizationDetails).toHaveBeenCalledWith(orgId);
          expect(useOrganizationStore.getState().currentOrganizationDetails).toEqual(mockDetails);
          expect(useOrganizationStore.getState().error).toBeNull();
      });

      it('should set error on failure', async () => {
          const errorMsg = 'Cannot get details';
          // FIX: Set currentOrgId first
          act(() => { useOrganizationStore.setState({ currentOrganizationId: orgId }); });
          mockOrgApi.getOrganizationDetails.mockResolvedValue({ status: 404, error: { message: errorMsg, code: '404' } });
          // FIX: Call the renamed action with no args
          await act(async () => { await useOrganizationStore.getState().fetchCurrentOrganizationDetails(); }); 
          expect(getApiClientSpy).toHaveBeenCalled();
          // FIX: Assert API was called with the ID from state
          expect(mockOrgApi.getOrganizationDetails).toHaveBeenCalledWith(orgId);
          expect(useOrganizationStore.getState().currentOrganizationDetails).toBeNull();
          expect(useOrganizationStore.getState().error).toBe(errorMsg);
     });
  });

  describe('createOrganization', () => {
    const newOrgName = 'New Shiny Org';
    const createdOrg: Organization = { ...mockOrg1, id: 'org-new', name: newOrgName };

    // Spy on setCurrentOrganizationId BEFORE the test runs
    let setCurrentOrgIdSpy: MockInstance;
    beforeEach(() => {
        // Resetting the store in the main beforeEach might clear the spy, so spy here?
        // Or spy on the prototype if reset re-creates methods?
        setCurrentOrgIdSpy = vi.spyOn(useOrganizationStore.getState(), 'setCurrentOrganizationId');
    });
    afterEach(() => {
        setCurrentOrgIdSpy.mockRestore(); // Clean up spy
    });

    it('should call API, update state, set current org, and navigate on success', async () => {
      mockOrgApi.createOrganization.mockResolvedValue({ status: 201, data: createdOrg });
      // Mock the subsequent calls triggered by setCurrentOrganizationId
      mockOrgApi.getOrganizationDetails.mockResolvedValue({ status: 200, data: createdOrg });
      mockOrgApi.getOrganizationMembers.mockResolvedValue({ status: 200, data: [] }); // Assuming empty members for new org initially

      // --- ADD MOCK FOR PROFILE UPDATE --- 
      const updateProfileMock = vi.mocked(useAuthStore.getState()).updateProfile;
      // Assume profile update succeeds 
      updateProfileMock.mockResolvedValue(mockMember1Profile); // Use existing mock data if suitable
      // --- END ADD MOCK ---

      // Get the mocked navigate function directly from the current mock state
      const mockNavigate = vi.mocked(useAuthStore.getState()).navigate;

      let returnedOrg: Organization | null = null;
      await act(async () => { 
          returnedOrg = await useOrganizationStore.getState().createOrganization(newOrgName);
      });

      expect(getApiClientSpy).toHaveBeenCalled();
      expect(mockOrgApi.createOrganization).toHaveBeenCalledWith({ name: newOrgName, visibility: 'private' });
      expect(returnedOrg).toBe(true);
      
      const state = useOrganizationStore.getState();
      expect(state.userOrganizations).toContainEqual(createdOrg); 
      expect(state.isCreateModalOpen).toBe(false); // This might be set by the form component, not the store action
      expect(state.error).toBeNull();

      // Verify setCurrentOrganizationId was called
      expect(setCurrentOrgIdSpy).toHaveBeenCalledWith(createdOrg.id);

      // Verify navigation occurred
      expect(mockNavigate).toHaveBeenCalledWith('/organizations');
    });

    it('should set error on API failure', async () => {
      const errorMsg = 'Creation failed';
      mockOrgApi.createOrganization.mockResolvedValue({ status: 400, error: { message: errorMsg, code: '400' } });
      
      // Get the mocked navigate function directly from the current mock state
      const mockNavigate = vi.mocked(useAuthStore.getState()).navigate;

      await act(async () => { await useOrganizationStore.getState().createOrganization(newOrgName); }); 
      
      expect(getApiClientSpy).toHaveBeenCalled();
      expect(mockOrgApi.createOrganization).toHaveBeenCalledWith({ name: newOrgName, visibility: 'private' });
      
      const state = useOrganizationStore.getState();
      expect(state.error).toBe(errorMsg);
      expect(state.isCreateModalOpen).toBe(false); // This might be set by the form component

      // Ensure setCurrentOrganizationId and navigate were NOT called on failure
      expect(setCurrentOrgIdSpy).not.toHaveBeenCalled();
      // Check if mockNavigate is actually a mock function before asserting
      if (vi.isMockFunction(mockNavigate)) {
          expect(mockNavigate).not.toHaveBeenCalled();
      } else {
          // Handle case where navigate might legitimately not be a mock in some failure path, though unlikely here
          // console.warn('Navigate mock was not a function in API failure test');
      }
    });
  });

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

  // +++ Add Tests for updateOrganization +++
  describe('updateOrganization', () => {
    const orgToUpdate: Organization = { ...mockOrg1, id: 'org-update' };
    const otherOrg: Organization = mockOrg2;
    const initialOrgs = [orgToUpdate, otherOrg];
    const updateData: OrganizationUpdate = { name: 'Updated Org Name' };
    const updatedOrgData: Organization = { ...orgToUpdate, ...updateData };

    it('should update state and details when updating the current org', async () => {
      // Arrange: Set current org to the one being updated
      act(() => {
        useOrganizationStore.setState({
          userOrganizations: initialOrgs,
          currentOrganizationId: orgToUpdate.id,
          currentOrganizationDetails: orgToUpdate,
        });
      });
      mockOrgApi.updateOrganization.mockResolvedValue({ status: 200, data: updatedOrgData });

      // Act
      let result = false;
      await act(async () => {
        result = await useOrganizationStore.getState().updateOrganization(orgToUpdate.id, updateData);
      });

      // Assert
      expect(result).toBe(true);
      expect(getApiClientSpy).toHaveBeenCalled();
      expect(mockOrgApi.updateOrganization).toHaveBeenCalledWith(orgToUpdate.id, updateData);
      
      const state = useOrganizationStore.getState();
      expect(state.userOrganizations).toContainEqual(updatedOrgData);
      expect(state.userOrganizations.find(o => o.id === otherOrg.id)).toEqual(otherOrg); // Ensure other org untouched
      expect(state.currentOrganizationDetails).toEqual(updatedOrgData);
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
    });

    it('should update state only when updating a non-current org', async () => {
      // Arrange: Set current org to a different one
      act(() => {
        useOrganizationStore.setState({
          userOrganizations: initialOrgs,
          currentOrganizationId: otherOrg.id,
          currentOrganizationDetails: otherOrg,
        });
      });
      mockOrgApi.updateOrganization.mockResolvedValue({ status: 200, data: updatedOrgData });

      // Act
      let result = false;
      await act(async () => {
        result = await useOrganizationStore.getState().updateOrganization(orgToUpdate.id, updateData);
      });

      // Assert
      expect(result).toBe(true);
      expect(mockOrgApi.updateOrganization).toHaveBeenCalledWith(orgToUpdate.id, updateData);
      
      const state = useOrganizationStore.getState();
      expect(state.userOrganizations).toContainEqual(updatedOrgData);
      expect(state.userOrganizations.find(o => o.id === otherOrg.id)).toEqual(otherOrg);
      expect(state.currentOrganizationDetails).toEqual(otherOrg); // Current details should NOT change
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
    });

    it('should set error state on API failure', async () => {
      // Arrange
      const errorMsg = 'Update failed';
      act(() => {
        useOrganizationStore.setState({
          userOrganizations: initialOrgs,
          currentOrganizationId: orgToUpdate.id,
          currentOrganizationDetails: orgToUpdate,
        });
      });
      mockOrgApi.updateOrganization.mockResolvedValue({ status: 400, error: { message: errorMsg, code: '400' } });

      // Act
      let result = false;
      await act(async () => {
        result = await useOrganizationStore.getState().updateOrganization(orgToUpdate.id, updateData);
      });

      // Assert
      expect(result).toBe(false);
      expect(mockOrgApi.updateOrganization).toHaveBeenCalledWith(orgToUpdate.id, updateData);
      
      const state = useOrganizationStore.getState();
      expect(state.userOrganizations).toEqual(initialOrgs); // List unchanged
      expect(state.currentOrganizationDetails).toEqual(orgToUpdate); // Details unchanged
      expect(state.error).toBe(errorMsg);
      expect(state.isLoading).toBe(false);
    });
  });
  // +++ End Tests +++

  // +++ Add Tests for updateMemberRole +++
  describe('updateMemberRole', () => {
    const memberToUpdate: OrganizationMemberWithProfile = mockMember2; // Regular member
    const adminToUpdate: OrganizationMemberWithProfile = mockMember1; // Admin
    const otherAdmin: OrganizationMemberWithProfile = { 
      ...mockMember1, 
      id: 'mem-admin-other', 
      user_id: 'user-other-admin',
      user_profiles: { ...mockMember1Profile, id: 'user-other-admin'} 
    };
    const lastAdminErrorMsg = 'Cannot remove last admin';

    it('should update member role on success', async () => {
      // Arrange: Start with admin and member
      act(() => {
        useOrganizationStore.setState({ currentOrganizationMembers: [adminToUpdate, memberToUpdate] });
      });
      mockOrgApi.updateMemberRole.mockResolvedValue({ status: 204 });

      // Act: Promote member
      let result = false;
      await act(async () => {
        result = await useOrganizationStore.getState().updateMemberRole(memberToUpdate.id, 'admin');
      });

      // Assert
      expect(result).toBe(true);
      expect(mockOrgApi.updateMemberRole).toHaveBeenCalledWith(memberToUpdate.id, 'admin');
      const updatedMember = useOrganizationStore.getState().currentOrganizationMembers.find(m => m.id === memberToUpdate.id);
      expect(updatedMember?.role).toBe('admin');
      expect(useOrganizationStore.getState().error).toBeNull();
      expect(useOrganizationStore.getState().isLoading).toBe(false);
    });

    it('should demote admin if not the last one', async () => {
      // Arrange: Start with two admins
      act(() => {
        useOrganizationStore.setState({ currentOrganizationMembers: [adminToUpdate, otherAdmin] });
      });
      mockOrgApi.updateMemberRole.mockResolvedValue({ status: 204 });

      // Act: Demote one admin
      let result = false;
      await act(async () => {
        result = await useOrganizationStore.getState().updateMemberRole(adminToUpdate.id, 'member');
      });

      // Assert
      expect(result).toBe(true);
      expect(mockOrgApi.updateMemberRole).toHaveBeenCalledWith(adminToUpdate.id, 'member');
      const updatedMember = useOrganizationStore.getState().currentOrganizationMembers.find(m => m.id === adminToUpdate.id);
      expect(updatedMember?.role).toBe('member');
      expect(useOrganizationStore.getState().error).toBeNull();
    });

    it('should set error and prevent demotion if last admin', async () => {
      // Arrange: Start with only one admin
      const initialMembers = [adminToUpdate];
      act(() => {
        useOrganizationStore.setState({ currentOrganizationMembers: initialMembers });
      });
      mockOrgApi.updateMemberRole.mockResolvedValue({ status: 403, error: { message: lastAdminErrorMsg, code: 'LAST_ADMIN' } });

      // Act: Attempt to demote last admin
      let result = true; // Default to true to ensure action sets it to false
      await act(async () => {
        result = await useOrganizationStore.getState().updateMemberRole(adminToUpdate.id, 'member');
      });

      // Assert
      expect(result).toBe(false);
      expect(mockOrgApi.updateMemberRole).toHaveBeenCalledWith(adminToUpdate.id, 'member');
      expect(useOrganizationStore.getState().currentOrganizationMembers).toEqual(initialMembers); // State unchanged
      expect(useOrganizationStore.getState().error).toBe(lastAdminErrorMsg);
      expect(useOrganizationStore.getState().isLoading).toBe(false);
    });

    it('should set error state on general API failure', async () => {
      // Arrange
      const errorMsg = 'Update role failed';
      const initialMembers = [adminToUpdate, memberToUpdate];
       act(() => {
        useOrganizationStore.setState({ currentOrganizationMembers: initialMembers });
      });
      mockOrgApi.updateMemberRole.mockResolvedValue({ status: 500, error: { message: errorMsg, code: '500' } });

      // Act
      let result = true;
      await act(async () => {
        result = await useOrganizationStore.getState().updateMemberRole(memberToUpdate.id, 'admin');
      });

      // Assert
      expect(result).toBe(false);
      expect(mockOrgApi.updateMemberRole).toHaveBeenCalledWith(memberToUpdate.id, 'admin');
      expect(useOrganizationStore.getState().currentOrganizationMembers).toEqual(initialMembers); // State unchanged
      expect(useOrganizationStore.getState().error).toBe(errorMsg);
      expect(useOrganizationStore.getState().isLoading).toBe(false);
    });
  });
  // +++ End Tests +++

  // +++ Add Tests for removeMember +++
  describe('removeMember', () => {
    const memberToRemove: OrganizationMemberWithProfile = mockMember2; // Regular member
    const adminToRemove: OrganizationMemberWithProfile = mockMember1; // Admin
    const otherAdmin: OrganizationMemberWithProfile = { 
      ...mockMember1, 
      id: 'mem-admin-other', 
      user_id: 'user-other-admin',
      user_profiles: { ...mockMember1Profile, id: 'user-other-admin'} 
    };
    const lastAdminErrorMsg = 'Cannot remove last admin';

    it('should remove member on success', async () => {
      // Arrange: Start with admin and member
      const initialMembers = [adminToRemove, memberToRemove];
      act(() => {
        useOrganizationStore.setState({ currentOrganizationMembers: initialMembers });
      });
      mockOrgApi.removeMember.mockResolvedValue({ status: 204 });

      // Act: Remove regular member
      let result = false;
      await act(async () => {
        result = await useOrganizationStore.getState().removeMember(memberToRemove.id);
      });

      // Assert
      expect(result).toBe(true);
      expect(mockOrgApi.removeMember).toHaveBeenCalledWith(memberToRemove.id);
      const remainingMembers = useOrganizationStore.getState().currentOrganizationMembers;
      expect(remainingMembers).toHaveLength(1);
      expect(remainingMembers[0]).toEqual(adminToRemove);
      expect(useOrganizationStore.getState().error).toBeNull();
      expect(useOrganizationStore.getState().isLoading).toBe(false);
    });

    it('should remove admin if not the last one', async () => {
       // Arrange: Start with two admins
       const initialMembers = [adminToRemove, otherAdmin];
       act(() => {
         useOrganizationStore.setState({ currentOrganizationMembers: initialMembers });
       });
       mockOrgApi.removeMember.mockResolvedValue({ status: 204 });

      // Act: Remove one admin
      let result = false;
      await act(async () => {
        result = await useOrganizationStore.getState().removeMember(adminToRemove.id);
      });

      // Assert
      expect(result).toBe(true);
      expect(mockOrgApi.removeMember).toHaveBeenCalledWith(adminToRemove.id);
      const remainingMembers = useOrganizationStore.getState().currentOrganizationMembers;
      expect(remainingMembers).toHaveLength(1);
      expect(remainingMembers[0]).toEqual(otherAdmin);
      expect(useOrganizationStore.getState().error).toBeNull();
    });

    it('should set error and prevent removal if last admin', async () => {
      // Arrange: Start with only one admin
      const initialMembers = [adminToRemove];
      act(() => {
        useOrganizationStore.setState({ currentOrganizationMembers: initialMembers });
      });
      mockOrgApi.removeMember.mockResolvedValue({ status: 403, error: { message: lastAdminErrorMsg, code: 'LAST_ADMIN' } });

      // Act: Attempt to remove last admin
      let result = true; // Default to true to ensure action sets it to false
      await act(async () => {
        result = await useOrganizationStore.getState().removeMember(adminToRemove.id);
      });

      // Assert
      expect(result).toBe(false);
      expect(mockOrgApi.removeMember).toHaveBeenCalledWith(adminToRemove.id);
      expect(useOrganizationStore.getState().currentOrganizationMembers).toEqual(initialMembers); // State unchanged
      expect(useOrganizationStore.getState().error).toBe(lastAdminErrorMsg);
      expect(useOrganizationStore.getState().isLoading).toBe(false);
    });

    it('should set error state on general API failure', async () => {
      // Arrange
      const errorMsg = 'Remove member failed';
      const initialMembers = [adminToRemove, memberToRemove];
      act(() => {
        useOrganizationStore.setState({ currentOrganizationMembers: initialMembers });
      });
      mockOrgApi.removeMember.mockResolvedValue({ status: 500, error: { message: errorMsg, code: '500' } });

      // Act
      let result = true;
      await act(async () => {
        result = await useOrganizationStore.getState().removeMember(memberToRemove.id);
      });

      // Assert
      expect(result).toBe(false);
      expect(mockOrgApi.removeMember).toHaveBeenCalledWith(memberToRemove.id);
      expect(useOrganizationStore.getState().currentOrganizationMembers).toEqual(initialMembers); // State unchanged
      expect(useOrganizationStore.getState().error).toBe(errorMsg);
      expect(useOrganizationStore.getState().isLoading).toBe(false);
    });
  });
  // +++ End Tests +++

  describe('inviteUser', () => {
    const orgId = 'org-invite';
    const email = 'new@user.com';
    const role = 'member';
    const defaultTestPage = 1; // Define default page for this scope
    const mockInvite: Invite = {
      id: 'invite-123',
      organization_id: orgId,
      invited_email: email,
      role_to_assign: role,
      status: 'pending',
      invite_token: 'token',
      created_at: new Date().toISOString(),
      invited_by_user_id: 'user-123',
      invited_user_id: null,
      expires_at: null
    };

    beforeEach(() => {
        act(() => { useOrganizationStore.setState({ currentOrganizationId: orgId }); }); 
    });

    it('should call API on success', async () => {
        mockOrgApi.inviteUserByEmail.mockResolvedValue({ status: 201, data: mockInvite });
        mockOrgApi.getOrganizationMembers.mockResolvedValue({ status: 200, data: [] }); 
        await act(async () => { await useOrganizationStore.getState().inviteUser(email, role); }); 
        expect(getApiClientSpy).toHaveBeenCalled();
        expect(mockOrgApi.inviteUserByEmail).toHaveBeenCalledWith(orgId, email, role);
        // FIX: Expect pagination args on the refetch triggered by fetchCurrentOrganizationMembers
        expect(mockOrgApi.getOrganizationMembers).toHaveBeenCalledWith(orgId, defaultTestPage, 10); 
        expect(useOrganizationStore.getState().error).toBeNull();
    });

    it('should set error on API failure', async () => {
        const errorMsg = 'Invite failed';
        mockOrgApi.inviteUserByEmail.mockResolvedValue({ status: 400, error: { message: errorMsg, code: '400' } });
        await act(async () => { await useOrganizationStore.getState().inviteUser(email, role); }); 
        expect(getApiClientSpy).toHaveBeenCalled();
        expect(mockOrgApi.inviteUserByEmail).toHaveBeenCalledWith(orgId, email, role);
        // FIX: Do not expect getOrganizationMembers to be called on invite failure
        expect(mockOrgApi.getOrganizationMembers).not.toHaveBeenCalled();
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

});