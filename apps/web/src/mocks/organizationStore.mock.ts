import { vi } from 'vitest';
import type {
    User,
    UserProfile,
    OrganizationMemberWithProfile,
    AuthStore,
    Organization,
    OrganizationState,
    OrganizationActions,
    OrganizationUIState,
    OrganizationUIActions
} from '@paynless/types';

// Import ACTUAL selectors that will be used by the mock logic AND potentially re-exported
import {
    selectCurrentUserRoleInOrg  // Import with an alias
} from '../../../../packages/store/src/organizationStore.selectors';

// --- Mock State and Types (Internal to this implementation file) ---
type MockAuthStoreState = Pick<AuthStore, 'user' | 'session' | 'profile' | 'isLoading' | 'error' | 'navigate'>;

// Define the shape of our mock OrganizationStore's state values
type MockOrganizationStoreStateValues = OrganizationState & OrganizationUIState;

// Define the shape of our mock OrganizationStore's actions
// This combines OrganizationActions and OrganizationUIActions
type MockOrganizationStoreActions = {
    [K in keyof (OrganizationActions & OrganizationUIActions)]: ReturnType<typeof vi.fn>;
};

// Define the shape of our mock OrganizationStore's state more precisely for what's used
// This combines parts of OrganizationState, OrganizationUIState, and specific actions.
// It should align with what the actual store's state structure is for the parts being mocked.
type MockOrganizationStoreInternalStateType =
    MockOrganizationStoreStateValues & // Use the new state values type
    // Only include actions that are directly part of the internal state or explicitly spied upon.
    // Other actions will be part of the `createMockActions` utility.
    // For `OrganizationStoreType` properties not in `OrganizationState` or `OrganizationUIState`,
    // they are mainly actions or selectors. Selectors are handled by direct import if needed (like selectCurrentUserRoleInOrg).
    // Actions are mostly covered by `createMockActions` or the spied actions below.
    Pick<MockOrganizationStoreActions,
        'inviteUser' |
        'updateOrganization' |
        'openDeleteDialog' | // This is a UI action, but often spied on
        'updateMemberRole' |
        'removeMember' |
        'fetchCurrentOrganizationMembers'
        // Add other specific actions here if they need to be part of the internal default state
        // and are not covered by createMockActions being spread into the final mock store.
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

const internalInviteUserSpy = vi.fn().mockResolvedValue(true); // Keep the spy internal
const internalUpdateOrganizationSpy = vi.fn(); // New spy for updateOrganization
const internalOpenDeleteDialogSpy = vi.fn();   // New spy for openDeleteDialog
// New spies for MemberListCard actions
const internalUpdateMemberRoleSpy = vi.fn();
const internalRemoveMemberSpy = vi.fn();
const internalFetchCurrentOrganizationMembersSpy = vi.fn();

// Helper to create mock actions
const createMockActions = (): MockOrganizationStoreActions => ({
    // OrganizationActions
    fetchUserOrganizations: vi.fn().mockImplementation(() => {
        // console.log('[Mock Store] fetchUserOrganizations called by test'); // Optional debug
        return Promise.resolve(undefined); // Simulate async action
    }),
    setCurrentOrganizationId: vi.fn(),
    fetchCurrentOrganizationDetails: vi.fn().mockResolvedValue(undefined),
    fetchCurrentOrganizationMembers: internalFetchCurrentOrganizationMembersSpy.mockResolvedValue(undefined), // Use spy
    createOrganization: vi.fn().mockResolvedValue(true),
    softDeleteOrganization: vi.fn().mockResolvedValue(true),
    updateOrganization: internalUpdateOrganizationSpy.mockResolvedValue(true), // Use spy
    inviteUser: internalInviteUserSpy.mockResolvedValue(true), // Use spy
    leaveOrganization: vi.fn().mockResolvedValue(true),
    updateMemberRole: internalUpdateMemberRoleSpy.mockResolvedValue(true), // Use spy
    removeMember: internalRemoveMemberSpy.mockResolvedValue(true), // Use spy
    acceptInvite: vi.fn().mockResolvedValue(true),
    declineInvite: vi.fn().mockResolvedValue(true),
    requestJoin: vi.fn().mockResolvedValue(null),
    approveRequest: vi.fn().mockResolvedValue(true),
    denyRequest: vi.fn().mockResolvedValue(true),
    cancelInvite: vi.fn().mockResolvedValue(true),
    fetchInviteDetails: vi.fn().mockResolvedValue(null),
    updateOrganizationSettings: vi.fn().mockResolvedValue(true),
    setOrgListPage: vi.fn(),
    setOrgListPageSize: vi.fn(),
    // OrganizationUIActions
    openCreateModal: vi.fn(),
    closeCreateModal: vi.fn(),
    openDeleteDialog: internalOpenDeleteDialogSpy, // Use spy
    closeDeleteDialog: vi.fn(),
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

export const mockedUseAuthStoreHookLogic = <TResult>(selector?: (state: MockAuthStoreState) => TResult): TResult | MockAuthStoreState => {
  const state = internalMockAuthStoreGetState();
  return selector ? selector(state) : state;
};
// Attach .getState() to the logic function itself if tests/selectors expect it on the hook function
(mockedUseAuthStoreHookLogic as any).getState = internalMockAuthStoreGetState;


const internalMockOrgStoreGetState = (): MockOrganizationStoreInternalStateType => internalMockOrgStoreState;

export const mockedUseOrganizationStoreHookLogic = <TResult>(selector?: (state: MockOrganizationStoreInternalStateType) => TResult): TResult | MockOrganizationStoreInternalStateType => {
  const state = internalMockOrgStoreGetState();
  return selector ? selector(state) : state;
};
// Attach .getState()
(mockedUseOrganizationStoreHookLogic as any).getState = internalMockOrgStoreGetState;


// --- Create Mock Store Function (Revised) ---
// Allow overriding specific actions for more targeted testing
export const createMockOrganizationStore = (overrideActions?: Partial<MockOrganizationStoreActions>) => {
  const defaultActions = createMockActions();
  const actions = { ...defaultActions, ...overrideActions }; // Apply overrides

  let stateValues: MockOrganizationStoreStateValues = {
      // Initialize with all state properties from OrganizationState & OrganizationUIState
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
      // getState returns the shape Zustand selectors expect (state values + actions)
      getState: (): MockOrganizationStoreStateValues & MockOrganizationStoreActions => ({ ...stateValues, ...actions }),
      // setState updates only the stateValues part
      setState: (newState: Partial<MockOrganizationStoreStateValues>) => {
          stateValues = { ...stateValues, ...newState };
      },
      // Expose actions directly on the returned store object for easy access in tests
      ...actions,
  };
};

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
    // Spied Actions
    inviteUser: internalInviteUserSpy, 
    updateOrganization: internalUpdateOrganizationSpy,
    openDeleteDialog: internalOpenDeleteDialogSpy,
    updateMemberRole: internalUpdateMemberRoleSpy,
    removeMember: internalRemoveMemberSpy,
    fetchCurrentOrganizationMembers: internalFetchCurrentOrganizationMembersSpy,
  };
};

// This file no longer exports useAuthStore or useOrganizationStore directly.
// Those will be constructed in the test file's vi.mock factory
// using mockedUseAuthStoreHookLogic and mockedUseOrganizationStoreHookLogic. 

// Explicitly export the selector (using its imported alias)
export { selectCurrentUserRoleInOrg }; 