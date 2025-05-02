import { create } from 'zustand';
import { vi } from 'vitest';
// Import the actual state type from the correct package
import type { OrganizationState } from '@paynless/types';

// Define a baseline state 
const baselineOrgState: Partial<OrganizationState> = {
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
    isCreateModalOpen: false,
    isDeleteDialogOpen: false,
    orgListPage: 1,
    orgListPageSize: 5, 
    orgListTotalCount: 0,
};

export const createMockOrganizationStore = (initialState?: Partial<OrganizationState>) => {
  const mergedInitialState = { ...baselineOrgState, ...initialState };

  // Create the mock store using Zustand's create but with mocked actions
  return create<OrganizationState>((set, get) => ({
    // --- State Properties (Use merged initial state) ---
    userOrganizations: mergedInitialState.userOrganizations ?? [],
    currentOrganizationId: mergedInitialState.currentOrganizationId ?? null,
    currentOrganizationDetails: mergedInitialState.currentOrganizationDetails ?? null,
    currentOrganizationMembers: mergedInitialState.currentOrganizationMembers ?? [],
    currentPendingInvites: mergedInitialState.currentPendingInvites ?? [],
    currentPendingRequests: mergedInitialState.currentPendingRequests ?? [],
    currentInviteDetails: mergedInitialState.currentInviteDetails ?? null,
    isLoading: mergedInitialState.isLoading ?? false,
    isFetchingInviteDetails: mergedInitialState.isFetchingInviteDetails ?? false,
    fetchInviteDetailsError: mergedInitialState.fetchInviteDetailsError ?? null,
    error: mergedInitialState.error ?? null,
    isCreateModalOpen: mergedInitialState.isCreateModalOpen ?? false,
    isDeleteDialogOpen: mergedInitialState.isDeleteDialogOpen ?? false,
    orgListPage: mergedInitialState.orgListPage ?? 1,
    orgListPageSize: mergedInitialState.orgListPageSize ?? 5,
    orgListTotalCount: mergedInitialState.orgListTotalCount ?? 0,

    // --- Actions (Provide vi.fn() mocks) ---
    setCurrentOrganizationId: vi.fn((orgId) => set({ currentOrganizationId: orgId })),
    fetchUserOrganizations: vi.fn(),
    fetchCurrentOrganizationDetails: vi.fn(),
    createOrganization: vi.fn(),
    updateOrganization: vi.fn(),
    softDeleteOrganization: vi.fn(),
    openCreateModal: vi.fn(() => set({ isCreateModalOpen: true })),
    closeCreateModal: vi.fn(() => set({ isCreateModalOpen: false })),
    openDeleteDialog: vi.fn(() => set({ isDeleteDialogOpen: true })),
    closeDeleteDialog: vi.fn(() => set({ isDeleteDialogOpen: false })),
    inviteUser: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
    leaveOrganization: vi.fn(),
    fetchCurrentOrganizationMembers: vi.fn(),
    cancelInvite: vi.fn(),
    acceptInvite: vi.fn(),
    declineInvite: vi.fn(),
    requestJoin: vi.fn(),
    approveRequest: vi.fn(),
    denyRequest: vi.fn(),
    fetchInviteDetails: vi.fn(),
    setOrgListPage: vi.fn((page) => set({ orgListPage: page })),
    setOrgListPageSize: vi.fn((size) => { 
        set({ orgListPageSize: size, orgListPage: 1 }); // Reset to page 1 on size change
        // Optionally trigger refetch if needed by tests
        // get().fetchUserOrganizations({ page: 1, limit: size }); 
    }),
    
    // --- Selectors (Provide basic implementations if needed by component logic) ---
    // selectCurrentUserRoleInOrg: vi.fn((userId: string | null | undefined) => { ... return role ...}),
    // Example basic selector mock:
    selectCurrentUserRoleInOrg: vi.fn().mockReturnValue(null), // Default to null or implement logic
    memberCurrentPage: 1,
    memberPageSize: 5,
    memberTotalCount: 0,
  }));
};

// Optionally, export a pre-created instance for simple use cases
// export const mockOrgStore = createMockOrganizationStore(); 