import { create } from 'zustand';
import { persist } from 'zustand/middleware';
// Import store types from the types package
import {
    Organization,
    OrganizationMemberWithProfile,
    Invite,
    InviteDetails,
    MembershipRequest,
    OrganizationState,
    OrganizationActions,
} from '@paynless/types';
// Import the specific client class and the base api object
import { 
    getApiClient,
} from '@paynless/api';
import { useAuthStore } from './authStore'; // To get user ID
import { logger } from '@paynless/utils';

// --- State Interface (REMOVED - Imported from @paynless/types) ---
// We need to augment the imported state for UI elements NOT defined in the type package
interface OrganizationUIState {
    isCreateModalOpen: boolean;
    isDeleteDialogOpen: boolean;
}

// --- Actions Interface (REMOVED - Imported from @paynless/types) ---
// We need to augment the imported actions for UI elements NOT defined in the type package
interface OrganizationUIActions {
    openCreateModal: () => void;
    closeCreateModal: () => void;
    openDeleteDialog: () => void;
    closeDeleteDialog: () => void;
}

// --- Store Type (Use imported type) ---
// type OrganizationStore = OrganizationState & OrganizationActions; 
// We'll use OrganizationStoreType for the create function signature

// --- Initial State (Define using the imported type) ---
// Combine the imported state with our UI state
const initialState: OrganizationState & OrganizationUIState = {
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
  // UI State
  isCreateModalOpen: false, 
  isDeleteDialogOpen: false,
};

// --- Store Implementation ---
// Define internal action types separately if needed for clarity within the store
interface InternalOrganizationActions {
  _setError: (error: string | null) => void;
  _setLoading: (loading: boolean) => void;
}

// Combine the public actions and internal actions for the create function implementation type
// Ensure this includes the newly added OrganizationActions from the types package
// Also include our UI Actions
// And include the selector method signature
type OrganizationStoreImplementation = 
    OrganizationState & 
    OrganizationUIState & 
    OrganizationActions & 
    OrganizationUIActions & 
    InternalOrganizationActions & 
    {
        selectCurrentUserRoleInOrg: () => 'admin' | 'member' | null;
        selectIsDeleteDialogOpen: () => boolean;
    };

// Instantiate the specific client - assuming the main 'api' export *is* the base client instance
// const orgApiClient = new OrganizationApiClient(api as ApiClient); 

// Wrap the creator function with persist middleware
export const useOrganizationStore = create<OrganizationStoreImplementation>()(
  persist(
    (set, get) => ({
      ...initialState,

      // --- Helper Actions ---
      _setError: (error: string | null) => set({ error, isLoading: false }),
      _setLoading: (loading: boolean) => set({ isLoading: loading }),

      // --- UI Actions ---
      openCreateModal: () => set({ isCreateModalOpen: true }),
      closeCreateModal: () => set({ isCreateModalOpen: false }),
      openDeleteDialog: () => set({ isDeleteDialogOpen: true }),
      closeDeleteDialog: () => set({ isDeleteDialogOpen: false }),

      // --- Main Actions (Existing implementations) ---
      fetchUserOrganizations: async () => {
        const { _setLoading, _setError } = get();
        _setLoading(true);
        _setError(null); // Clear previous errors

        // Check authentication locally before making API call, even if API uses RLS
        const isAuthenticated = !!useAuthStore.getState().user;
        if (!isAuthenticated) {
            logger.warn('[OrganizationStore] fetchUserOrganizations - User not authenticated. Aborting fetch.');
            _setError('User not authenticated');
            set({ userOrganizations: [], isLoading: false });
            return;
        }

        try {
          const apiClient = getApiClient();
          const response = await apiClient.organizations.listUserOrganizations();

          if (response.error || response.status >= 300) {
            // Log only the error message or relevant parts
            const errorLog = { 
                message: response.error?.message ?? 'Unknown API Error', 
                code: response.error?.code, 
                status: response.status 
            };
            logger.error('[OrganizationStore] fetchUserOrganizations - API Error', errorLog);
            _setError(response.error?.message ?? 'Failed to fetch organizations');
            set({ userOrganizations: [] }); 
          } else {
            // Filter out soft-deleted organizations
            const activeOrgs = (response.data ?? []).filter((org: Organization) => !org.deleted_at);
            set({ userOrganizations: activeOrgs });
            _setError(null); // Explicitly clear error on success
          }
        } catch (err: any) {
           // Log the caught error message
           logger.error('[OrganizationStore] fetchUserOrganizations - Unexpected Error', { message: err?.message });
           _setError(err.message ?? 'An unexpected error occurred');
           set({ userOrganizations: [] });
        } finally {
          _setLoading(false);
        }
      },

      setCurrentOrganizationId: (orgId: string | null) => {
        const { currentOrganizationId } = get();
        if (orgId === currentOrganizationId) return; // No change

        set({ 
            currentOrganizationId: orgId,
            // Clear details and members when switching orgs
            currentOrganizationDetails: null, 
            currentOrganizationMembers: [],
            currentPendingInvites: [], // Also clear pending lists
            currentPendingRequests: [],
            error: null, // Clear errors on context switch
        });
        // Optionally trigger fetch for details/members of the new orgId here or let UI do it
        if (orgId) {
            get().fetchOrganizationDetails(orgId);
            get().fetchCurrentOrganizationMembers();
        }
        logger.info(`[OrganizationStore] Switched current organization context to: ${orgId}`);
      },

      fetchOrganizationDetails: async (orgId: string) => {
        const { _setLoading, _setError } = get();
        _setLoading(true);
        _setError(null);

        try {
          const apiClient = getApiClient();
          const response = await apiClient.organizations.getOrganizationDetails(orgId);

          if (response.error || response.status >= 300) {
            const errorLog = { 
                message: response.error?.message ?? 'Unknown API Error', 
                code: response.error?.code, 
                status: response.status 
            };
            logger.error('[OrganizationStore] fetchOrganizationDetails - API Error', { orgId, ...errorLog });
            _setError(response.error?.message ?? 'Failed to fetch organization details');
            set({ currentOrganizationDetails: null }); // Clear details on error
          } else {
            set({ currentOrganizationDetails: response.data }); // Set details on success
            _setError(null); // Explicitly clear error
          }
        } catch (err: any) {
          logger.error('[OrganizationStore] fetchOrganizationDetails - Unexpected Error', { orgId, message: err?.message });
          _setError(err.message ?? 'An unexpected error occurred');
          set({ currentOrganizationDetails: null }); // Clear details on error
        } finally {
          _setLoading(false);
        }
      },

      fetchCurrentOrganizationMembers: async () => {
        const { currentOrganizationId, _setLoading, _setError } = get();
        const userId = useAuthStore.getState().user?.id; // Get current user ID

        if (!currentOrganizationId) {
          logger.warn('[OrganizationStore] fetchCurrentOrganizationMembers - No current organization selected.');
          set({ 
            currentOrganizationMembers: [], 
            currentPendingInvites: [], // Clear pending state
            currentPendingRequests: [], // Clear pending state
            isLoading: false 
          }); 
          return;
        }

        if (!userId) {
          logger.warn('[OrganizationStore] fetchCurrentOrganizationMembers - User not authenticated.');
          _setError('User not authenticated');
          set({ 
            currentOrganizationMembers: [], 
            currentPendingInvites: [], // Clear pending state
            currentPendingRequests: [], // Clear pending state
            isLoading: false 
          }); 
          return;
        }
        
        _setLoading(true);
        _setError(null);
        // Reset pending lists initially
        set({ currentPendingInvites: [], currentPendingRequests: [] }); 

        let activeMembers: OrganizationMemberWithProfile[] = [];
        let currentUserRole: 'admin' | 'member' | null = null;

        try {
          const apiClient = getApiClient();
          const membersResponse = await apiClient.organizations.getOrganizationMembers(currentOrganizationId);

          if (membersResponse.error || membersResponse.status >= 300) {
            const errorLog = { 
                message: membersResponse.error?.message ?? 'Unknown API Error fetching members', 
                code: membersResponse.error?.code, 
                status: membersResponse.status 
            };
            logger.error('[OrganizationStore] fetchCurrentOrganizationMembers - API Error (Members)', { orgId: currentOrganizationId, ...errorLog });
            _setError(membersResponse.error?.message ?? 'Failed to fetch organization members');
            set({ currentOrganizationMembers: [] }); // Clear members on error
            _setLoading(false); // Stop loading
            return; // Don't proceed if members fetch failed
          } 
            
          activeMembers = membersResponse.data ?? [];
          set({ currentOrganizationMembers: activeMembers }); 

          // 2. Determine Current User's Role (Internally - no need to store separately if we have a selector)
          const currentUserMembership = activeMembers.find(member => member.user_id === userId);
          currentUserRole = currentUserMembership?.role as 'admin' | 'member' | null; // Assuming role is 'admin' or 'member'

          if (!currentUserRole) {
             logger.warn(`[OrganizationStore] fetchCurrentOrganizationMembers - Current user ${userId} not found in active members list for org ${currentOrganizationId}.`);
             // Non-member, treat as non-admin. No further fetches needed. Proceed to finally block.
          }

          // 3. Fetch Pending Actions if Admin
          if (currentUserRole === 'admin') {
            logger.info(`[OrganizationStore] User ${userId} is admin for org ${currentOrganizationId}. Fetching pending actions.`);
            try {
                // Assuming an API function exists like getPendingOrgActions
                // Use the same apiClient instance from above

                const pendingResponse = await apiClient.organizations.getPendingOrgActions(currentOrganizationId);

                if (pendingResponse.error || pendingResponse.status >= 300) {
                    const errorLog = { 
                        message: pendingResponse.error?.message ?? 'Unknown API Error fetching pending actions', 
                        code: pendingResponse.error?.code, 
                        status: pendingResponse.status 
                    };
                     // Log error but don't overwrite the primary members list or main error state
                    logger.error('[OrganizationStore] fetchCurrentOrganizationMembers - API Error (Pending Actions)', { orgId: currentOrganizationId, ...errorLog });
                    // Set pending lists to empty on error, but keep active members
                    set({ currentPendingInvites: [], currentPendingRequests: [] }); 
                } else {
                    // Set pending lists on success
                    console.log('[OrganizationStore] Pending Actions API Response Body:', pendingResponse.data); 
                    set({ 
                        currentPendingInvites: pendingResponse.data?.invites ?? [], 
                        currentPendingRequests: pendingResponse.data?.requests ?? [] 
                    });
                    _setError(null); // Clear main error state if pending fetch succeeded after members fetch
                }
            } catch (pendingErr: any) {
                 // Log error but don't overwrite the primary members list or main error state
                logger.error('[OrganizationStore] fetchCurrentOrganizationMembers - Unexpected Error (Pending Actions)', { orgId: currentOrganizationId, message: pendingErr?.message });
                 // Set pending lists to empty on error, but keep active members
                set({ currentPendingInvites: [], currentPendingRequests: [] }); 
            }
          } else {
              // Non-admin, ensure pending lists are clear
              set({ currentPendingInvites: [], currentPendingRequests: [] });
          }

        } catch (err: any) {
          logger.error('[OrganizationStore] fetchCurrentOrganizationMembers - Unexpected Error', { orgId: currentOrganizationId, message: err?.message });
          _setError(err.message ?? 'An unexpected error occurred');
          set({ currentOrganizationMembers: [], currentPendingInvites: [], currentPendingRequests: [] }); // Clear members & pending on error
        } finally {
          _setLoading(false);
        }
      },

      softDeleteOrganization: async (orgId: string): Promise<boolean> => {
        const { _setLoading, _setError, currentOrganizationId, userOrganizations, closeDeleteDialog } = get();
        _setLoading(true);
        _setError(null);

        try {
          const apiClient = getApiClient();
          const response = await apiClient.organizations.deleteOrganization(orgId);

          if (response.error || response.status >= 300) {
            const errorLog = { 
                message: response.error?.message ?? 'Unknown API Error', 
                code: response.error?.code, 
                status: response.status 
            };
            logger.error('[OrganizationStore] softDeleteOrganization - API Error', { orgId, ...errorLog });
            _setError(response.error?.message ?? 'Failed to delete organization');
            _setLoading(false); // Ensure loading is false even on error
            return false; // Indicate failure
          } else {
            // Success: Remove org from list and potentially clear current context
            const updatedOrgs = userOrganizations.filter(org => org.id !== orgId);
            let updatedState: Partial<OrganizationState & OrganizationUIState> = { 
                userOrganizations: updatedOrgs,
                isLoading: false,
                error: null,
                // isDeleteDialogOpen will be handled by closeDeleteDialog call
            };

            if (currentOrganizationId === orgId) {
                logger.info(`[OrganizationStore] Current organization ${orgId} was deleted. Clearing context.`);
                updatedState = {
                    ...updatedState,
                    currentOrganizationId: null,
                    currentOrganizationDetails: null,
                    currentOrganizationMembers: [],
                };
            }
            
            set(updatedState);
            logger.info(`[OrganizationStore] Successfully soft-deleted organization ${orgId}.`);
            closeDeleteDialog(); // Call close action on success
            return true; // Indicate success
          }
        } catch (err: any) {
          logger.error('[OrganizationStore] softDeleteOrganization - Unexpected Error', { orgId, message: err?.message });
          _setError(err.message ?? 'An unexpected error occurred during deletion');
          set({ isLoading: false }); // Ensure loading is false on unexpected error
          return false; // Indicate failure
        } 
        // No finally block needed as loading/return is handled in branches
      },

      // --- Add createOrganization Action ---
      createOrganization: async (name: string, visibility: 'private' | 'public' = 'private'): Promise<Organization | null> => {
        const { _setLoading, _setError } = get(); 
        _setLoading(true);
        _setError(null);

        try {
          const apiClient = getApiClient();
          const response = await apiClient.organizations.createOrganization({
            name,
            visibility,
          });

          if (response.error || response.status >= 300 || !response.data) {
            const errorLog = { 
                message: response.error?.message ?? 'Unknown API Error', 
                code: response.error?.code, 
                status: response.status 
            };
            logger.error('[OrganizationStore] createOrganization - API Error', { name, visibility, ...errorLog });
            _setError(response.error?.message ?? 'Failed to create organization');
            return null; // Indicate failure
          } else {
            const newOrg: Organization = response.data;
            logger.info(`[OrganizationStore] Successfully created organization ${newOrg.id} (${newOrg.name}).`);
            
            // Update state: Add new org to the list and potentially set as current
            set((state) => ({
              userOrganizations: [...state.userOrganizations, newOrg],
              // Optionally set the new org as current immediately
              // currentOrganizationId: newOrg.id, 
              // currentOrganizationDetails: newOrg, 
              // currentOrganizationMembers: [], // Clear members if setting current
              error: null, // Clear error on success
            }));

            // Alternative to updating state directly: Refetch the list
            // await fetchUserOrganizations(); // Might cause a flicker

            return newOrg; // Return the created org object
          }
        } catch (err: any) {
          logger.error('[OrganizationStore] createOrganization - Unexpected Error', { name, visibility, message: err?.message });
          _setError(err.message ?? 'An unexpected error occurred while creating the organization');
          return null; // Indicate failure
        } finally {
          _setLoading(false);
        }
      },

      updateOrganization: async (_orgId: string, _updates: Partial<Organization>): Promise<boolean> => {
        // Implementation will be added in the GREEN step
        throw new Error('updateOrganization not implemented');
      },

      inviteUser: async (emailOrUserId: string, role: string): Promise<Invite | null> => {
        // For now, assume emailOrUserId is always an email
        // Future enhancement: check if it looks like a UUID vs email
        const email = emailOrUserId;

        const { _setLoading, _setError, currentOrganizationId } = get(); 
        _setLoading(true);
        _setError(null);

        if (!currentOrganizationId) {
          const errorMsg = 'Cannot invite user without organization context.';
          logger.error('[OrganizationStore] inviteUser - Error', { email, role, error: errorMsg });
          _setError(errorMsg);
          return null;
        }

        try {
            const apiClient = getApiClient();
            // Determine if identifier is email or user ID (simple check)
            const isEmail = emailOrUserId.includes('@');
            let response;
            if (isEmail) {
              response = await apiClient.organizations.inviteUserByEmail(currentOrganizationId, emailOrUserId, role);
            } else {
              // Assuming it's a user ID if not an email
              response = await apiClient.organizations.inviteUserById(currentOrganizationId, emailOrUserId, role);
            }

            if (response.error || response.status >= 300) {
                const errorMsg = response.error?.message ?? 'Failed to invite user';
                logger.error('[OrganizationStore] inviteUser - API Error', { orgId: currentOrganizationId, email, role, error: errorMsg, status: response.status });
                _setError(errorMsg);
                return null;
            } else {
                logger.info(`[OrganizationStore] User ${emailOrUserId} invited to org ${currentOrganizationId} with role ${role}.`);
                get().fetchCurrentOrganizationMembers(); // Refetch to update pending list
                return response.data ?? null;
            }
        } catch (err: any) {
            const errorMsg = err.message ?? 'An unexpected error occurred during invite';
            logger.error('[OrganizationStore] inviteUser - Unexpected Error', { orgId: currentOrganizationId, email, role, message: errorMsg });
            _setError(errorMsg);
            return null;
        } finally {
            _setLoading(false);
        }
      },

      updateMemberRole: async (_membershipId: string, _role: string): Promise<boolean> => {
        // Implementation will be added in the GREEN step
        throw new Error('updateMemberRole not implemented');
      },

      removeMember: async (_membershipId: string): Promise<boolean> => {
        // Implementation will be added in the GREEN step
        throw new Error('removeMember not implemented');
      },

      // --- Implement acceptInvite --- 
      acceptInvite: async (token: string): Promise<boolean> => {
        const { _setLoading, _setError, fetchUserOrganizations } = get(); 
        _setLoading(true);
        _setError(null);
        try {
          // Use getApiClient() to ensure correct type
          const apiClient = getApiClient(); 
          const response = await apiClient.organizations.acceptOrganizationInvite(token);

          if (response.error || response.status >= 300) {
            const errorMsg = response.error?.message ?? 'Failed to accept invite';
            logger.error('[OrganizationStore] acceptInvite - API Error', { token, error: errorMsg, status: response.status });
            _setError(errorMsg);
            return false;
          } else {
            logger.info('[OrganizationStore] Invite accepted successfully', { token });
            fetchUserOrganizations(); 
            const { currentOrganizationId } = get();
            const acceptedOrgId = response.data?.organizationId;
            if (acceptedOrgId && acceptedOrgId === currentOrganizationId) {
                get().fetchCurrentOrganizationMembers();
            }
            return true;
          }
        } catch (err: any) {
          const errorMsg = err.message ?? 'An unexpected error occurred during invite acceptance';
          logger.error('[OrganizationStore] acceptInvite - Unexpected Error', { token, message: errorMsg });
          _setError(errorMsg);
          return false;
        } finally {
          _setLoading(false);
        }
      },
      // --- Placeholder new actions ---
      declineInvite: async (token: string): Promise<boolean> => {
        const { _setLoading, _setError } = get(); 
        _setLoading(true);
        _setError(null);
        try {
          const apiClient = getApiClient(); 
          // Assuming the API client method exists and is named declineOrganizationInvite
          const response = await apiClient.organizations.declineOrganizationInvite(token);

          if (response.error || response.status >= 300) {
            const errorMsg = response.error?.message ?? 'Failed to decline invite';
            logger.error('[OrganizationStore] declineInvite - API Error', { token, error: errorMsg, status: response.status });
            _setError(errorMsg);
            return false;
          } else {
            logger.info('[OrganizationStore] Invite declined successfully', { token });
            // No state update usually needed, maybe refetch pending invites if shown to user?
            return true;
          }
        } catch (err: any) {
          const errorMsg = err.message ?? 'An unexpected error occurred during invite decline';
          logger.error('[OrganizationStore] declineInvite - Unexpected Error', { token, message: errorMsg });
          _setError(errorMsg);
          return false;
        } finally {
          _setLoading(false);
        }
      },
      requestJoin: async (orgId: string): Promise<MembershipRequest | null> => {
        const { _setLoading, _setError } = get();
        const userId = useAuthStore.getState().user?.id;

        if (!userId) {
          logger.warn('[OrganizationStore] requestJoin - User not authenticated.');
          _setError('User not authenticated');
          return null;
        }

        _setLoading(true);
        _setError(null);

        try {
            const apiClient = getApiClient();
            const response = await apiClient.organizations.requestToJoinOrganization(orgId);

            if (response.error || response.status >= 300) {
                const errorMsg = response.error?.message ?? 'Failed to request join';
                logger.error('[OrganizationStore] requestJoin - API Error', { orgId, error: errorMsg, status: response.status });
                _setError(errorMsg);
                return null;
            } else {
                logger.info(`[OrganizationStore] User ${userId} requested to join org ${orgId}.`);
                return response.data ?? null;
            }
        } catch (err: any) {
            const errorMsg = err.message ?? 'An unexpected error occurred during join request';
            logger.error('[OrganizationStore] requestJoin - Unexpected Error', { orgId, message: errorMsg });
            _setError(errorMsg);
            return null;
        } finally {
            _setLoading(false);
        }
      },
      approveRequest: async (membershipId: string): Promise<boolean> => {
        const { _setLoading, _setError, fetchCurrentOrganizationMembers } = get();
        _setLoading(true);
        _setError(null);
        try {
            const apiClient = getApiClient();
            // Use the correct API client method as defined in organizations.api.ts
            const response = await apiClient.organizations.approveJoinRequest(membershipId);

            if (response.error || response.status >= 300) {
                const errorMsg = response.error?.message ?? 'Failed to approve join request';
                logger.error('[OrganizationStore] approveRequest - API Error', { membershipId, error: errorMsg, status: response.status });
                _setError(errorMsg);
                return false;
            } else {
                logger.info('[OrganizationStore] Join request approved successfully', { membershipId });
                // Refetch members list to update status from pending to active
                fetchCurrentOrganizationMembers(); 
                return true;
            }
        } catch (err: any) {
            const errorMsg = err.message ?? 'An unexpected error occurred during request approval';
            logger.error('[OrganizationStore] approveRequest - Unexpected Error', { membershipId, message: errorMsg });
            _setError(errorMsg);
            return false;
        } finally {
            _setLoading(false);
        }
      },
      denyRequest: async (membershipId: string): Promise<boolean> => {
        const { _setLoading, _setError, fetchCurrentOrganizationMembers } = get();
        _setLoading(true);
        _setError(null);
        try {
            const apiClient = getApiClient();
            // Use the correct API client method as defined in organizations.api.ts
            const response = await apiClient.organizations.denyJoinRequest(membershipId);

            if (response.error || response.status >= 300) {
                const errorMsg = response.error?.message ?? 'Failed to deny join request';
                logger.error('[OrganizationStore] denyRequest - API Error', { membershipId, error: errorMsg, status: response.status });
                _setError(errorMsg);
                return false;
            } else {
                logger.info('[OrganizationStore] Join request denied successfully', { membershipId });
                // Refetch members list to remove the denied request (status becomes 'removed' or similar)
                fetchCurrentOrganizationMembers(); 
                return true;
            }
        } catch (err: any) {
            const errorMsg = err.message ?? 'An unexpected error occurred during request denial';
            logger.error('[OrganizationStore] denyRequest - Unexpected Error', { membershipId, message: errorMsg });
            _setError(errorMsg);
            return false;
        } finally {
            _setLoading(false);
        }
      },
      cancelInvite: async (inviteId: string): Promise<boolean> => {
        const { _setLoading, _setError, currentOrganizationId, fetchCurrentOrganizationMembers } = get(); // Add fetchCurrentOrganizationMembers
        _setLoading(true);
        _setError(null);

        if (!currentOrganizationId) {
          const errorMsg = 'Cannot cancel invite without organization context.';
          logger.error('[OrganizationStore] cancelInvite - Error', { inviteId, error: errorMsg });
          _setError(errorMsg);
          return false;
        }

        try {
            const apiClient = getApiClient();
            // Use the correct API client method as defined in organizations.api.ts
            const response = await apiClient.organizations.cancelInvite(currentOrganizationId, inviteId);

            if (response.error || response.status >= 300) {
                const errorMsg = response.error?.message ?? 'Failed to cancel invite';
                logger.error('[OrganizationStore] cancelInvite - API Error', { orgId: currentOrganizationId, inviteId, error: errorMsg, status: response.status });
                _setError(errorMsg);
                return false;
            } else {
                logger.info('[OrganizationStore] Invite cancelled successfully', { orgId: currentOrganizationId, inviteId });
                fetchCurrentOrganizationMembers(); // Refetch members/pending items
                return true;
            }
        } catch (err: any) {
            const errorMsg = err.message ?? 'An unexpected error occurred during invite cancellation';
            logger.error('[OrganizationStore] cancelInvite - Unexpected Error', { orgId: currentOrganizationId, inviteId, message: errorMsg });
            _setError(errorMsg);
            return false;
        } finally {
            _setLoading(false);
        }
      },

      fetchInviteDetails: async (token: string): Promise<InviteDetails | null> => {
        set({ isFetchingInviteDetails: true, fetchInviteDetailsError: null, currentInviteDetails: null });
        try {
            const apiClient = getApiClient();
            const response = await apiClient.organizations.getInviteDetails(token);

            if (response.error || response.status >= 300) {
                const errorMsg = response.error?.message ?? 'Failed to fetch invite details. The invite may be invalid or expired.';
                logger.error('[OrganizationStore] fetchInviteDetails - API Error', { token, status: response.status, error: response.error });
                set({ fetchInviteDetailsError: errorMsg, isFetchingInviteDetails: false });
                return null;
            } else {
                // Assuming response.data has the structure { organizationName: string, organizationId: string }
                const details: InviteDetails = response.data as InviteDetails; 
                set({ currentInviteDetails: details, isFetchingInviteDetails: false });
                return details;
            }
        } catch (err: any) {
            logger.error('[OrganizationStore] fetchInviteDetails - Unexpected Error', { token, message: err?.message });
            set({ fetchInviteDetailsError: err.message ?? 'An unexpected error occurred fetching invite details.', isFetchingInviteDetails: false });
            return null;
        }
      },

      // --- Selector Implementation ---
      selectCurrentUserRoleInOrg: (): 'admin' | 'member' | null => {
        const { currentOrganizationMembers } = get();
        const userId = useAuthStore.getState().user?.id;

        if (!userId || !currentOrganizationMembers || currentOrganizationMembers.length === 0) {
          return null; // No user or no members loaded
        }

        const currentUserMembership = currentOrganizationMembers.find(member => member.user_id === userId);
        return currentUserMembership?.role as 'admin' | 'member' | null; // Return role or null if not found
      },

      selectIsDeleteDialogOpen: (): boolean => get().isDeleteDialogOpen,

    }),
    {
      name: 'organization-storage', // Unique name for localStorage key
      partialize: (state) => ({ 
          currentOrganizationId: state.currentOrganizationId 
      }), // Only persist currentOrganizationId
      // storage: createJSONStorage(() => localStorage), // Optional: default is localStorage
    }
  )
); 