import { describe, it, expect, vi } from 'vitest';
import {
  selectCurrentUserRoleInOrg,
  selectCanCreateOrganizationChats,
  selectIsDeleteDialogOpen
} from './organizationStore.selectors';
import type { OrganizationState, OrganizationUIState, OrganizationMember, Organization, User } from '@paynless/types';
import { useAuthStore } from './authStore'; // Mocked

// Mock useAuthStore
vi.mock('./authStore', () => ({
  useAuthStore: {
    getState: vi.fn()
  }
}));

const mockUserId = 'user-123';

// Helper to create a basic OrganizationState for testing
const createMockOrgState = (partialState: Partial<OrganizationState> = {}): OrganizationState => ({
  userOrganizations: [],
  currentOrganizationId: null,
  currentOrganizationDetails: null,
  currentOrganizationMembers: [],
  memberCurrentPage: 1,
  memberPageSize: 10,
  memberTotalCount: 0,
  currentPendingInvites: [],
  currentPendingRequests: [],
  currentInviteDetails: null,
  isLoading: false,
  isFetchingInviteDetails: false,
  fetchInviteDetailsError: null,
  error: null,
  orgListPage: 1,
  orgListPageSize: 10,
  orgListTotalCount: 0,
  ...partialState
});

// Helper to create a basic OrganizationUIState for testing
const createMockOrgUIState = (partialState: Partial<OrganizationUIState> = {}): OrganizationUIState => ({
  isCreateModalOpen: false,
  isDeleteDialogOpen: false,
  ...partialState
});


describe('Organization Store Selectors', () => {
  beforeEach(() => {
    // Reset auth store mock before each test
    vi.mocked(useAuthStore.getState).mockReturnValue({ user: { id: mockUserId } as User, session: null, /* other auth state */ } as any);
  });

  describe('selectCurrentUserRoleInOrg', () => {
    const orgId = 'org-active';
    const members: OrganizationMember[] = [
      { id: 'mem-1', user_id: mockUserId, organization_id: orgId, role: 'admin', created_at: '', profile: { id: mockUserId, avatar_url: '', display_name: '', bio: '', user_id: mockUserId, updated_at: '' } },
      { id: 'mem-2', user_id: 'user-other', organization_id: orgId, role: 'member', created_at: '', profile: { id: 'user-other', avatar_url: '', display_name: '', bio: '', user_id: 'user-other', updated_at: '' } },
    ];

    it('should return the correct role if user is a member of the current org', () => {
      const state = createMockOrgState({ currentOrganizationId: orgId, currentOrganizationMembers: members });
      expect(selectCurrentUserRoleInOrg(state)).toBe('admin');
    });

    it('should return null if currentOrganizationId is null', () => {
      const state = createMockOrgState({ currentOrganizationId: null, currentOrganizationMembers: members });
      expect(selectCurrentUserRoleInOrg(state)).toBeNull();
    });

    it('should return null if user is not authenticated (no user ID)', () => {
      vi.mocked(useAuthStore.getState).mockReturnValue({ user: null, session: null } as any);
      const state = createMockOrgState({ currentOrganizationId: orgId, currentOrganizationMembers: members });
      expect(selectCurrentUserRoleInOrg(state)).toBeNull();
    });

    it('should return null if user is not in currentOrganizationMembers', () => {
      const state = createMockOrgState({ currentOrganizationId: orgId, currentOrganizationMembers: [members[1]] }); // Current user (admin) is not in this list
      expect(selectCurrentUserRoleInOrg(state)).toBeNull();
    });

    it('should return null if currentOrganizationMembers is empty', () => {
      const state = createMockOrgState({ currentOrganizationId: orgId, currentOrganizationMembers: [] });
      expect(selectCurrentUserRoleInOrg(state)).toBeNull();
    });
  });

  describe('selectCanCreateOrganizationChats', () => {
    const orgDetailsAdminAllowed: Partial<Organization> = { id: 'org-1', name: 'Org1', allow_member_chat_creation: true, created_at: '', owner_id: '', slug: '', updated_at: '', visibility: 'private' };
    const orgDetailsAdminNotAllowed: Partial<Organization> = { id: 'org-2', name: 'Org2', allow_member_chat_creation: false, created_at: '', owner_id: '', slug: '', updated_at: '', visibility: 'private' };

    it('should return true if allow_member_chat_creation is true in currentOrganizationDetails', () => {
      const state = createMockOrgState({ currentOrganizationDetails: orgDetailsAdminAllowed as Organization });
      // selectCanCreateOrganizationChats also takes role, but we are not using it yet
      // We pass a mock state for the role selector part, though it's currently unused.
      vi.mocked(useAuthStore.getState).mockReturnValue({ user: { id: mockUserId } as User } as any);
      const mockOrgMembersState = createMockOrgState({ currentOrganizationId: 'org-1', currentOrganizationMembers: [] });
      expect(selectCanCreateOrganizationChats(state, selectCurrentUserRoleInOrg(mockOrgMembersState))).toBe(true);
    });

    it('should return false if allow_member_chat_creation is false in currentOrganizationDetails', () => {
      const state = createMockOrgState({ currentOrganizationDetails: orgDetailsAdminNotAllowed as Organization });
      vi.mocked(useAuthStore.getState).mockReturnValue({ user: { id: mockUserId } as User } as any);
      const mockOrgMembersState = createMockOrgState({ currentOrganizationId: 'org-2', currentOrganizationMembers: [] });
      expect(selectCanCreateOrganizationChats(state, selectCurrentUserRoleInOrg(mockOrgMembersState))).toBe(false);
    });

    it('should return false if currentOrganizationDetails is null', () => {
      const state = createMockOrgState({ currentOrganizationDetails: null });
      vi.mocked(useAuthStore.getState).mockReturnValue({ user: { id: mockUserId } as User } as any);
      const mockOrgMembersState = createMockOrgState({ currentOrganizationId: null, currentOrganizationMembers: [] });
      expect(selectCanCreateOrganizationChats(state, selectCurrentUserRoleInOrg(mockOrgMembersState))).toBe(false);
    });
  });

  describe('selectIsDeleteDialogOpen', () => {
    it('should return true if isDeleteDialogOpen is true', () => {
      const state = createMockOrgUIState({ isDeleteDialogOpen: true });
      expect(selectIsDeleteDialogOpen(state)).toBe(true);
    });

    it('should return false if isDeleteDialogOpen is false', () => {
      const state = createMockOrgUIState({ isDeleteDialogOpen: false });
      expect(selectIsDeleteDialogOpen(state)).toBe(false);
    });
  });
}); 