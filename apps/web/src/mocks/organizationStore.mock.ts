import { vi } from 'vitest';
import type {
    User,
    UserProfile,
    OrganizationMemberWithProfile,
    AuthStore,
    OrganizationStoreType,
    Organization
} from '@paynless/types';

// Import ACTUAL selectors that will be used by the mock logic AND potentially re-exported
import {
    selectCurrentUserRoleInOrg  // Import with an alias
} from '../../../../packages/store/src/organizationStore.selectors';

// --- Mock State and Types (Internal to this implementation file) ---
type MockAuthStoreState = Pick<AuthStore, 'user' | 'session' | 'profile' | 'isLoading' | 'error' | 'navigate'>;
type MockOrganizationStoreFullState = OrganizationStoreType; // For full state type if needed for selectors
                                                       // Or a more tailored one like below if OrganizationStoreType is too broad/complex

// Define the shape of our mock OrganizationStore's state more precisely for what's used
// This combines parts of OrganizationState, OrganizationUIState, and specific actions.
// It should align with what the actual store's state structure is for the parts being mocked.
type MockOrganizationStoreInternalStateType =
    Pick<OrganizationStoreType,
        'currentOrganizationId' |
        'currentOrganizationMembers' |
        'isLoading' |
        'error' |
        'currentOrganizationDetails' |
        'userOrganizations' |
        'currentPendingInvites' |
        'currentPendingRequests' |
        'currentInviteDetails' |
        'isFetchingInviteDetails' |
        'fetchInviteDetailsError' |
        'isCreateModalOpen' |
        'isDeleteDialogOpen' |
        'orgListPage' |
        'orgListPageSize' |
        'orgListTotalCount' |
        'memberCurrentPage' |
        'memberPageSize' |
        'memberTotalCount'
        // Add any other state properties that are accessed by selectors or the component
    > &
    { 
        inviteUser: ReturnType<typeof vi.fn>;
        updateOrganization: ReturnType<typeof vi.fn>;
        openDeleteDialog: ReturnType<typeof vi.fn>;
        updateMemberRole: ReturnType<typeof vi.fn>;
        removeMember: ReturnType<typeof vi.fn>;
        fetchCurrentOrganizationMembers: ReturnType<typeof vi.fn>;
    };


// --- Internal Mock Store Instances ---
let internalMockAuthStoreState: MockAuthStoreState = {
  user: null,
  session: null,
  profile: null,
  isLoading: false,
  error: null,
  navigate: null,
};

const internalInviteUserSpy = vi.fn().mockResolvedValue(true); // Keep the spy internal
const internalUpdateOrganizationSpy = vi.fn(); // New spy for updateOrganization
const internalOpenDeleteDialogSpy = vi.fn();   // New spy for openDeleteDialog
// New spies for MemberListCard actions
const internalUpdateMemberRoleSpy = vi.fn();
const internalRemoveMemberSpy = vi.fn();
const internalFetchCurrentOrganizationMembersSpy = vi.fn();

let internalMockOrgStoreState: MockOrganizationStoreInternalStateType = {
  currentOrganizationId: null,
  currentOrganizationMembers: [],
  isLoading: false,
  inviteUser: internalInviteUserSpy, // Use the internal spy
  updateOrganization: internalUpdateOrganizationSpy, // Use the new spy
  openDeleteDialog: internalOpenDeleteDialogSpy,     // Use the new spy
  // Add new spies to state
  updateMemberRole: internalUpdateMemberRoleSpy,
  removeMember: internalRemoveMemberSpy,
  fetchCurrentOrganizationMembers: internalFetchCurrentOrganizationMembersSpy,
  error: null,
  currentOrganizationDetails: null,
  userOrganizations: [],
  currentPendingInvites: [],
  currentPendingRequests: [],
  currentInviteDetails: null,
  isFetchingInviteDetails: false,
  fetchInviteDetailsError: null,
  isCreateModalOpen: false,
  isDeleteDialogOpen: false,
  orgListPage: 1,
  orgListPageSize: 10,
  orgListTotalCount: 0,
  memberCurrentPage: 1,
  memberPageSize: 10,
  memberTotalCount: 0,
};

// --- Exported Helper Functions for Test Setup ---
export const mockSetAuthUser = (user: User | UserProfile | null) => {
  internalMockAuthStoreState.user = user as User | null;
  internalMockAuthStoreState.profile = user as UserProfile | null;
};

export const mockSetCurrentOrgId = (id: string | null) => { internalMockOrgStoreState.currentOrganizationId = id; };
export const mockSetCurrentOrganizationMembers = (members: OrganizationMemberWithProfile[]) => { internalMockOrgStoreState.currentOrganizationMembers = members; };
export const mockSetOrgIsLoading = (loading: boolean) => { internalMockOrgStoreState.isLoading = loading; };

// New exported setter for currentOrganizationDetails
export const mockSetCurrentOrganizationDetails = (details: Organization | null) => { 
    internalMockOrgStoreState.currentOrganizationDetails = details; 
};

// New exported setters for pagination state
export const mockSetMemberCurrentPage = (page: number) => { internalMockOrgStoreState.memberCurrentPage = page; };
export const mockSetMemberPageSize = (size: number) => { internalMockOrgStoreState.memberPageSize = size; };
export const mockSetMemberTotalCount = (count: number) => { internalMockOrgStoreState.memberTotalCount = count; };

export const getInternalInviteUserSpy = () => internalInviteUserSpy; // Export getter for the spy
// New exported getters for new spies
export const getInternalUpdateOrganizationSpy = () => internalUpdateOrganizationSpy;
export const getInternalOpenDeleteDialogSpy = () => internalOpenDeleteDialogSpy;
// New exported getters for new spies
export const getInternalUpdateMemberRoleSpy = () => internalUpdateMemberRoleSpy;
export const getInternalRemoveMemberSpy = () => internalRemoveMemberSpy;
export const getInternalFetchCurrentOrganizationMembersSpy = () => internalFetchCurrentOrganizationMembersSpy;

// --- Exported Mock Hook Implementations (to be used by vi.mock factory) ---
const internalMockAuthStoreGetState = (): MockAuthStoreState => internalMockAuthStoreState;

export const mockedUseAuthStoreHookLogic = (selector?: (state: MockAuthStoreState) => any) => {
  const state = internalMockAuthStoreGetState();
  return selector ? selector(state) : state;
};
// Attach .getState() to the logic function itself if tests/selectors expect it on the hook function
(mockedUseAuthStoreHookLogic as any).getState = internalMockAuthStoreGetState;


const internalMockOrgStoreGetState = (): MockOrganizationStoreInternalStateType => internalMockOrgStoreState;

export const mockedUseOrganizationStoreHookLogic = (selector?: (state: MockOrganizationStoreInternalStateType) => any) => {
  if (selector === selectCurrentUserRoleInOrg) { // Use the aliased import
    return selectCurrentUserRoleInOrg(internalMockOrgStoreState as any);
  }
  const state = internalMockOrgStoreGetState();
  return selector ? selector(state) : state;
};
// Attach .getState()
(mockedUseOrganizationStoreHookLogic as any).getState = internalMockOrgStoreGetState;


// --- Exported Reset Function ---
export const resetAllStoreMocks = () => {
  // Reset Auth Store
  internalMockAuthStoreState = {
    user: null, session: null, profile: null, isLoading: false, error: null, navigate: null,
  };

  // Reset Organization Store
  internalInviteUserSpy.mockClear().mockResolvedValue(true);
  internalUpdateOrganizationSpy.mockClear(); // Clear new spy
  internalOpenDeleteDialogSpy.mockClear();   // Clear new spy
  // Clear new spies
  internalUpdateMemberRoleSpy.mockClear();
  internalRemoveMemberSpy.mockClear();
  internalFetchCurrentOrganizationMembersSpy.mockClear();

  internalMockOrgStoreState = {
    currentOrganizationId: null, currentOrganizationMembers: [], isLoading: false,
    inviteUser: internalInviteUserSpy, 
    updateOrganization: internalUpdateOrganizationSpy, // Reset with spy
    openDeleteDialog: internalOpenDeleteDialogSpy,     // Reset with spy
    // Reset with new spies
    updateMemberRole: internalUpdateMemberRoleSpy,
    removeMember: internalRemoveMemberSpy,
    fetchCurrentOrganizationMembers: internalFetchCurrentOrganizationMembersSpy,
    error: null, currentOrganizationDetails: null,
    userOrganizations: [], currentPendingInvites: [], currentPendingRequests: [],
    currentInviteDetails: null, isFetchingInviteDetails: false, fetchInviteDetailsError: null,
    isCreateModalOpen: false, isDeleteDialogOpen: false, orgListPage: 1, orgListPageSize: 10,
    orgListTotalCount: 0, memberCurrentPage: 1, memberPageSize: 10, memberTotalCount: 0,
  };
};

// This file no longer exports useAuthStore or useOrganizationStore directly.
// Those will be constructed in the test file's vi.mock factory
// using mockedUseAuthStoreHookLogic and mockedUseOrganizationStoreHookLogic. 

// Explicitly export the selector (using its imported alias)
export { selectCurrentUserRoleInOrg }; 