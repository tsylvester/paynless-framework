import { vi, Mock } from 'vitest';
import type {
    User,
    UserProfile,
    OrganizationMemberWithProfile,
    AuthStore,
    Organization,
    OrganizationState,
    OrganizationActions,
    OrganizationUIState,
    OrganizationUIActions,
    MembershipRequest,
    InviteDetails
} from '@paynless/types';

// Import ACTUAL selectors that will be used by the mock logic AND potentially re-exported
import {
    selectCurrentUserRoleInOrg
} from '../../../../packages/store/src/organizationStore.selectors';

// --- Mock State and Types (Internal to this implementation file) ---
type MockAuthStoreState = Pick<AuthStore, 'user' | 'session' | 'profile' | 'isLoading' | 'error' | 'navigate'>;

// Define the shape of our mock OrganizationStore's state values
type MockOrganizationStoreStateValues = OrganizationState & OrganizationUIState;

// Define the shape of our mock OrganizationStore's actions based on imported types
// This combines OrganizationActions and OrganizationUIActions
type MockOrganizationStoreActions = {
    [K in keyof OrganizationActions]: Mock<Parameters<OrganizationActions[K]>, ReturnType<OrganizationActions[K]>>;
} & {
    [K in keyof OrganizationUIActions]: Mock<Parameters<OrganizationUIActions[K]>, ReturnType<OrganizationUIActions[K]>>;
};


type MockOrganizationStoreInternalStateType =
    MockOrganizationStoreStateValues &
    Pick<MockOrganizationStoreActions,
        'inviteUser' |
        'updateOrganization' |
        'openDeleteDialog' |
        'updateMemberRole' |
        'removeMember' |
        'fetchCurrentOrganizationMembers'
    >;


// --- Internal Mock Store Instances ---
let internalMockAuthStoreState: MockAuthStoreState = {
  user: null,
  session: null,
  profile: null,
  isLoading: false,
  error: null,
  navigate: null,
};

// Typed Spies
const internalInviteUserSpy = vi.fn<Parameters<OrganizationActions['inviteUser']>, ReturnType<OrganizationActions['inviteUser']>>().mockResolvedValue(true);
const internalUpdateOrganizationSpy = vi.fn<Parameters<OrganizationActions['updateOrganization']>, ReturnType<OrganizationActions['updateOrganization']>>().mockResolvedValue(true);
const internalOpenDeleteDialogSpy = vi.fn<Parameters<OrganizationUIActions['openDeleteDialog']>, ReturnType<OrganizationUIActions['openDeleteDialog']>>();
const internalUpdateMemberRoleSpy = vi.fn<Parameters<OrganizationActions['updateMemberRole']>, ReturnType<OrganizationActions['updateMemberRole']>>().mockResolvedValue(true);
const internalRemoveMemberSpy = vi.fn<Parameters<OrganizationActions['removeMember']>, ReturnType<OrganizationActions['removeMember']>>().mockResolvedValue(true);
const internalFetchCurrentOrganizationMembersSpy = vi.fn<Parameters<OrganizationActions['fetchCurrentOrganizationMembers']>, ReturnType<OrganizationActions['fetchCurrentOrganizationMembers']>>().mockResolvedValue(undefined);


// Helper to create mock actions with correct types
export const createMockActions = (): MockOrganizationStoreActions => ({
    // OrganizationActions
    fetchUserOrganizations: vi.fn<Parameters<OrganizationActions['fetchUserOrganizations']>, Promise<void>>().mockResolvedValue(undefined),
    setCurrentOrganizationId: vi.fn<Parameters<OrganizationActions['setCurrentOrganizationId']>, void>(),
    fetchCurrentOrganizationDetails: vi.fn<Parameters<OrganizationActions['fetchCurrentOrganizationDetails']>, Promise<void>>().mockResolvedValue(undefined),
    fetchCurrentOrganizationMembers: internalFetchCurrentOrganizationMembersSpy,
    createOrganization: vi.fn<Parameters<OrganizationActions['createOrganization']>, Promise<boolean>>().mockResolvedValue(true),
    softDeleteOrganization: vi.fn<Parameters<OrganizationActions['softDeleteOrganization']>, Promise<boolean>>().mockResolvedValue(true),
    updateOrganization: internalUpdateOrganizationSpy,
    inviteUser: internalInviteUserSpy,
    leaveOrganization: vi.fn<Parameters<OrganizationActions['leaveOrganization']>, Promise<boolean>>().mockResolvedValue(true),
    updateMemberRole: internalUpdateMemberRoleSpy,
    removeMember: internalRemoveMemberSpy,
    acceptInvite: vi.fn<Parameters<OrganizationActions['acceptInvite']>, Promise<boolean>>().mockResolvedValue(true),
    declineInvite: vi.fn<Parameters<OrganizationActions['declineInvite']>, Promise<boolean>>().mockResolvedValue(true),
    requestJoin: vi.fn<Parameters<OrganizationActions['requestJoin']>, Promise<MembershipRequest | null>>().mockResolvedValue(null),
    approveRequest: vi.fn<Parameters<OrganizationActions['approveRequest']>, Promise<boolean>>().mockResolvedValue(true),
    denyRequest: vi.fn<Parameters<OrganizationActions['denyRequest']>, Promise<boolean>>().mockResolvedValue(true),
    cancelInvite: vi.fn<Parameters<OrganizationActions['cancelInvite']>, Promise<boolean>>().mockResolvedValue(true),
    fetchInviteDetails: vi.fn<Parameters<OrganizationActions['fetchInviteDetails']>, Promise<InviteDetails | null>>().mockResolvedValue(null),
    updateOrganizationSettings: vi.fn<Parameters<OrganizationActions['updateOrganizationSettings']>, Promise<boolean>>().mockResolvedValue(true),
    setOrgListPage: vi.fn<Parameters<OrganizationActions['setOrgListPage']>, void>(),
    setOrgListPageSize: vi.fn<Parameters<OrganizationActions['setOrgListPageSize']>, void>(),

    // OrganizationUIActions
    openCreateModal: vi.fn<Parameters<OrganizationUIActions['openCreateModal']>, void>(),
    closeCreateModal: vi.fn<Parameters<OrganizationUIActions['closeCreateModal']>, void>(),
    openDeleteDialog: internalOpenDeleteDialogSpy,
    closeDeleteDialog: vi.fn<Parameters<OrganizationUIActions['closeDeleteDialog']>, void>(),
});


let internalMockOrgStoreState: MockOrganizationStoreInternalStateType = {
  // OrganizationState
  userOrganizations: [],
  currentOrganizationId: null,
  currentOrganizationDetails: null,
  currentOrganizationMembers: [],
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
  memberCurrentPage: 1,
  memberPageSize: 10,
  memberTotalCount: 0,
  // OrganizationUIState
  isCreateModalOpen: false,
  isDeleteDialogOpen: false,
  // Spied Actions (subset of MockOrganizationStoreActions)
  inviteUser: internalInviteUserSpy,
  updateOrganization: internalUpdateOrganizationSpy,
  openDeleteDialog: internalOpenDeleteDialogSpy,
  updateMemberRole: internalUpdateMemberRoleSpy,
  removeMember: internalRemoveMemberSpy,
  fetchCurrentOrganizationMembers: internalFetchCurrentOrganizationMembersSpy,
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

// New helper to set userOrganizations
export const mockSetUserOrganizations = (orgs: Organization[]) => {
  internalMockOrgStoreState.userOrganizations = orgs;
};

// New exported setters for pagination state
export const mockSetMemberCurrentPage = (page: number) => { internalMockOrgStoreState.memberCurrentPage = page; };
export const mockSetMemberPageSize = (size: number) => { internalMockOrgStoreState.memberPageSize = size; };
export const mockSetMemberTotalCount = (count: number) => { internalMockOrgStoreState.memberTotalCount = count; };

export const getInternalInviteUserSpy = () => internalInviteUserSpy;
export const getInternalUpdateOrganizationSpy = () => internalUpdateOrganizationSpy;
export const getInternalOpenDeleteDialogSpy = () => internalOpenDeleteDialogSpy;
export const getInternalUpdateMemberRoleSpy = () => internalUpdateMemberRoleSpy;
export const getInternalRemoveMemberSpy = () => internalRemoveMemberSpy;
export const getInternalFetchCurrentOrganizationMembersSpy = () => internalFetchCurrentOrganizationMembersSpy;

// --- Exported Mock Hook Implementations (to be used by vi.mock factory) ---

// --- Auth Store Mock Logic ---
const internalMockAuthStoreGetState = (): MockAuthStoreState => internalMockAuthStoreState;

function useAuthStoreHookImpl<TResult>(selector?: (state: MockAuthStoreState) => TResult): TResult | MockAuthStoreState {
  const state = internalMockAuthStoreGetState();
  return selector ? selector(state) : state;
}

export const mockedUseAuthStoreHookLogic = Object.assign(
  useAuthStoreHookImpl,
  {
    getState: internalMockAuthStoreGetState,
    // Add other static methods like setState, subscribe, destroy if the actual useAuthStore has them and they need mocking
    // For example:
    // setState: vi.fn(), 
    // subscribe: vi.fn(() => vi.fn()),
    // destroy: vi.fn(),
  }
);

// --- Organization Store Mock Logic ---
export const internalMockOrgStoreGetState = (): MockOrganizationStoreInternalStateType => internalMockOrgStoreState;

export type FullMockOrgStoreState = MockOrganizationStoreStateValues & MockOrganizationStoreActions;

function useOrganizationStoreHookImpl<TResult>(selector?: (state: FullMockOrgStoreState) => TResult): TResult | FullMockOrgStoreState {
  const stateValues = internalMockOrgStoreGetState(); 
  const allActions = createMockActions();
  const combinedState: FullMockOrgStoreState = {
      ...allActions, 
      ...stateValues,
  };
  return selector ? selector(combinedState) : combinedState;
}

const organizationStoreGetState = (): FullMockOrgStoreState => {
    const stateValues = internalMockOrgStoreGetState();
    const allActions = createMockActions();
    return { ...allActions, ...stateValues };
};

export const mockedUseOrganizationStoreHookLogic = Object.assign(
  useOrganizationStoreHookImpl,
  {
    getState: organizationStoreGetState,
    // Add other static methods like setState, subscribe, destroy if the actual useOrganizationStore has them and they need mocking
    // For example:
    // setState: vi.fn((updater) => { /* logic to update internalMockOrgStoreState */ }),
    // subscribe: vi.fn(() => vi.fn()),
    // destroy: vi.fn(),
  }
);

// --- Create Mock Store Function (Revised) ---
export const createMockOrganizationStore = (overrideActions?: Partial<MockOrganizationStoreActions>) => {
  const defaultActions = createMockActions();
  const actions = { ...defaultActions, ...overrideActions }; 

  let stateValues: MockOrganizationStoreStateValues = {
      userOrganizations: [],
      currentOrganizationId: null,
      currentOrganizationDetails: null,
      currentOrganizationMembers: [],
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
      memberCurrentPage: 1,
      memberPageSize: 10,
      memberTotalCount: 0,
      isCreateModalOpen: false,
      isDeleteDialogOpen: false,
  };

  return {
      getState: (): MockOrganizationStoreStateValues & MockOrganizationStoreActions => ({ ...stateValues, ...actions }),
      setState: (newState: Partial<MockOrganizationStoreStateValues>) => {
          stateValues = { ...stateValues, ...newState };
      },
      ...actions,
  };
};

// --- Exported Reset Function ---
export const resetAllStoreMocks = () => {
  // Reset Auth Store
  internalMockAuthStoreState = {
    user: null, session: null, profile: null, isLoading: false, error: null, navigate: null,
  };

  // Reset Organization Store spies
  internalInviteUserSpy.mockClear().mockResolvedValue(true);
  internalUpdateOrganizationSpy.mockClear().mockResolvedValue(true);
  internalOpenDeleteDialogSpy.mockClear();
  internalUpdateMemberRoleSpy.mockClear().mockResolvedValue(true);
  internalRemoveMemberSpy.mockClear().mockResolvedValue(true);
  internalFetchCurrentOrganizationMembersSpy.mockClear().mockResolvedValue(undefined);

  // Reset Organization Store state values to their initial defaults
  internalMockOrgStoreState = {
    // OrganizationState
    userOrganizations: [],
    currentOrganizationId: null,
    currentOrganizationDetails: null,
    currentOrganizationMembers: [],
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
    memberCurrentPage: 1,
    memberPageSize: 10,
    memberTotalCount: 0,
    // OrganizationUIState
    isCreateModalOpen: false,
    isDeleteDialogOpen: false,
    // Spied Actions (re-assign spies after clearing them)
    inviteUser: internalInviteUserSpy,
    updateOrganization: internalUpdateOrganizationSpy,
    openDeleteDialog: internalOpenDeleteDialogSpy,
    updateMemberRole: internalUpdateMemberRoleSpy,
    removeMember: internalRemoveMemberSpy,
    fetchCurrentOrganizationMembers: internalFetchCurrentOrganizationMembersSpy,
  };
};

// Export the mocked hook logic directly as useOrganizationStore for easier consumption in vi.mock factory
export const useOrganizationStore = mockedUseOrganizationStoreHookLogic;

// Explicitly export the selector (using its imported alias)
export { selectCurrentUserRoleInOrg }; 