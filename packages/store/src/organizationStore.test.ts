import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useOrganizationStore } from './organizationStore';
import { useAuthStore } from './authStore'; // Import the real store signature
import { Organization, OrganizationMember, OrganizationMemberWithProfile, SupabaseUser, ApiError as ApiErrorType } from '@paynless/types';
import { initializeApiClient, _resetApiClient } from '@paynless/api';
// Import mocks using RELATIVE path
import {
    mockGetCurrentOrganization,
    mockUpdateOrganization,
    mockGetOrganizationMembers,
    mockRemoveOrganizationMember,
    mockLeaveOrganization,
    resetOrganizationMocks,
    defaultMockOrganization,
    defaultMockMembers
} from '../../api/src/mocks/organizations.mock.ts';
import { logger } from '@paynless/utils';
import { act } from '@testing-library/react';

// --- DEFINE PLACEHOLDER MOCKS FOR vi.mock SCOPE ---
// Define these top-level so they exist when vi.mock runs
const mockListUserOrganizations = vi.fn();
const mockGetOrganizationDetails = vi.fn();
const mockDeleteOrganization = vi.fn();
const mockCreateOrganization = vi.fn();

// --- Mock Dependencies --- //

vi.mock('@paynless/utils', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

// Use simple mock for authStore - state will be set in beforeEach
vi.mock('./authStore');

// Mock @paynless/api using SYNCHRONOUS factory
vi.mock('@paynless/api', () => ({
    initializeApiClient: vi.fn(),
    _resetApiClient: vi.fn(),
    api: {
        organizations: vi.fn(() => ({ // Namespace accessed via function call
            getCurrentOrganization: mockGetCurrentOrganization,
            updateOrganization: mockUpdateOrganization,
            getOrganizationMembers: mockGetOrganizationMembers,
            removeMember: mockRemoveOrganizationMember,
            leaveOrganization: mockLeaveOrganization,
            // Map placeholder mocks defined ABOVE
            listUserOrganizations: mockListUserOrganizations,
            getOrganizationDetails: mockGetOrganizationDetails,
            deleteOrganization: mockDeleteOrganization,
            createOrganization: mockCreateOrganization,
        })),
        auth: vi.fn(() => ({})),
        billing: vi.fn(() => ({}))
    },
}));

// --- DEFINE MOCK DATA (AFTER vi.mock calls) ---
const mockSupabaseUser: SupabaseUser = {
    id: 'test-user-id', email: 'test@example.com',
    app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: ''
};

// --- Test Suite Setup --- //
const resetOrgStore = () => useOrganizationStore.setState(useOrganizationStore.getInitialState(), true);
// No specific resetAuthStore needed if we set state in beforeEach

// --- Test Suite --- //
describe('OrganizationStore', () => {

  beforeEach(() => {
    // Reset placeholder mocks first
    mockListUserOrganizations.mockReset();
    mockGetOrganizationDetails.mockReset();
    mockDeleteOrganization.mockReset();
    mockCreateOrganization.mockReset();
    // Reset imported mocks
    resetOrganizationMocks();
    // Clear all Vitest mock tracking
    vi.clearAllMocks(); 
    
    // Reset stores and set initial mocked auth state
    act(() => {
        resetOrgStore();
        // Set the state on the simple mocked authStore
        vi.mocked(useAuthStore).setState({ user: mockSupabaseUser }); 
        // Call the mocked initializeApiClient 
        initializeApiClient({ supabaseUrl: 'http://d.url', supabaseAnonKey: 'd-key' });
    });
  });

  afterEach(() => {
      // Call the mocked _resetApiClient
      _resetApiClient();
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
      mockListUserOrganizations.mockResolvedValue({ status: 200, data: mockOrgsData, error: undefined });
      await act(async () => { await useOrganizationStore.getState().fetchUserOrganizations(); });
      expect(mockListUserOrganizations).toHaveBeenCalledTimes(1);
      const { userOrganizations, isLoading, error } = useOrganizationStore.getState();
      expect(userOrganizations).toEqual(mockOrgsData);
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
    });

    it('should set error string state on API failure', async () => {
      const errorMsg = 'Failed fetch';
      mockListUserOrganizations.mockResolvedValue({ status: 500, data: null, error: { message: errorMsg, code: '500' } });
      await act(async () => { await useOrganizationStore.getState().fetchUserOrganizations(); });
      const { isLoading, error } = useOrganizationStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe(errorMsg);
    });

     it('should set error string state if user is not authenticated', async () => {
        const expectedErrorMsg = 'User not authenticated';
        // Set auth state to unauthenticated for this test
        act(() => { vi.mocked(useAuthStore).setState({ user: null }); }); 
        await act(async () => { await useOrganizationStore.getState().fetchUserOrganizations(); });
        expect(mockListUserOrganizations).not.toHaveBeenCalled();
        const { error } = useOrganizationStore.getState();
        expect(error).toBe(expectedErrorMsg);
     });
  });

  // --- setCurrentOrganizationId Tests --- //
  describe('setCurrentOrganizationId', () => {
     const orgId1 = 'org-id-1';
     const mockOrgDetailsData: Organization = { ...defaultMockOrganization, id: orgId1 };
     const mockMembersWithProfile: OrganizationMemberWithProfile[] = defaultMockMembers.map(m => ({
         ...m,
         user_profiles: { 
             id: m.user_id, 
             first_name: m.user_id === 'user-owner-1' ? 'Owner' : 'Member',
             last_name: 'User',
             updated_at: '', 
             created_at: '',
             role: 'user'
          }
     }));
     const membersMock = mockGetOrganizationMembers;
     const detailsMock = mockGetOrganizationDetails;

    it('should update state and trigger fetches on new ID', async () => {
      detailsMock.mockResolvedValue({ status: 200, data: mockOrgDetailsData, error: undefined });
      membersMock.mockResolvedValue({ status: 200, data: mockMembersWithProfile, error: undefined });
      useOrganizationStore.setState({ error: 'Old error' });
      await act(async () => { useOrganizationStore.getState().setCurrentOrganizationId(orgId1); });
      const state = useOrganizationStore.getState();
      expect(state.currentOrganizationDetails).toEqual(mockOrgDetailsData);
      expect(state.currentOrganizationMembers).toEqual(mockMembersWithProfile);
      expect(state.error).toBeNull();
      expect(detailsMock).toHaveBeenCalledWith(orgId1);
      expect(membersMock).toHaveBeenCalledWith(orgId1);
    });

     it('should do nothing if setting the same ID', () => {
       useOrganizationStore.setState({ currentOrganizationId: orgId1 });
       // Clear mocks called within the action if any are expected NOT to be called
       detailsMock.mockClear(); 
       membersMock.mockClear();
       act(() => { useOrganizationStore.getState().setCurrentOrganizationId(orgId1); });
       expect(detailsMock).not.toHaveBeenCalled();
       expect(membersMock).not.toHaveBeenCalled();
     });

     it('should clear state when setting ID to null', () => {
        useOrganizationStore.setState({ currentOrganizationId: orgId1, error: 'err' });
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
      detailMock.mockResolvedValue({ status: 404, data: null, error: { message: errorMsg, code: '404' } });
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
    const mockMembersData: OrganizationMemberWithProfile[] = [
       { 
         id: 'mem1', organization_id: orgId, user_id: 'user1', role: 'admin', status: 'active', created_at: 'd1',
         user_profiles: { id: 'user1', first_name: 'Admin', last_name: 'User', updated_at: 'dp1', created_at: 'dp1', role: 'user' }
       },
       { 
         id: 'mem2', organization_id: orgId, user_id: 'user2', role: 'member', status: 'active', created_at: 'd2',
         user_profiles: { id: 'user2', first_name: 'Member', last_name: 'User', updated_at: 'dp2', created_at: 'dp2', role: 'user' }
       },
    ];
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
      membersMock.mockResolvedValue({ status: 500, data: null, error: { message: errorMsg, code: '500' } });
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
    const deleteMock = mockDeleteOrganization;

    it('should call API, remove org from list, return true on success (not current org)', async () => {
      deleteMock.mockResolvedValue({ status: 204, data: undefined, error: undefined });
      useOrganizationStore.setState({ userOrganizations: initialOrgs, currentOrganizationId: otherOrgId });
      const result = await useOrganizationStore.getState().softDeleteOrganization(orgToDeleteId);
      expect(result).toBe(true);
      const finalState = useOrganizationStore.getState();
      expect(finalState.userOrganizations).toEqual([initialOrgs[1]]);
    });

    it('should call API, remove org, clear current context, return true on success (current org)', async () => {
      deleteMock.mockResolvedValue({ status: 204, data: undefined, error: undefined });
      useOrganizationStore.setState({ 
          userOrganizations: initialOrgs, 
          currentOrganizationId: orgToDeleteId,
          currentOrganizationDetails: initialOrgs[0],
          currentOrganizationMembers: []
      });
      const result = await useOrganizationStore.getState().softDeleteOrganization(orgToDeleteId);
      expect(result).toBe(true);
      const finalState = useOrganizationStore.getState();
      expect(finalState.currentOrganizationId).toBeNull(); 
    });

    it('should set error string, not modify state, and return false on API error', async () => {
      const errorMsg = 'Forbidden';
      deleteMock.mockResolvedValue({ status: 403, data: null, error: { message: errorMsg, code: '403' } });
      useOrganizationStore.setState({ userOrganizations: initialOrgs });
      const result = await useOrganizationStore.getState().softDeleteOrganization(orgToDeleteId);
      expect(result).toBe(false);
      const finalState = useOrganizationStore.getState();
      expect(finalState.userOrganizations).toEqual(initialOrgs);
      expect(finalState.error).toBe(errorMsg);
    });

    it('should set error string, not modify state, and return false on unexpected error', async () => {
      const errorMsg = 'Network failed';
      deleteMock.mockRejectedValue(new Error(errorMsg));
      useOrganizationStore.setState({ userOrganizations: initialOrgs });
      const result = await useOrganizationStore.getState().softDeleteOrganization(orgToDeleteId);
      expect(result).toBe(false);
      const finalState = useOrganizationStore.getState();
      expect(finalState.userOrganizations).toEqual(initialOrgs);
      expect(finalState.error).toBe(errorMsg);
    });
  });

}); // End Test Suite