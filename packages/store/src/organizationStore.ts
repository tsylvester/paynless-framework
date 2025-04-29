import { create } from 'zustand';
// Import store types from the types package
import {
    Organization,
    OrganizationMemberWithProfile as _OrganizationMemberWithProfile,
    ApiError as _ApiError,
    OrganizationState,
    OrganizationActions,
    OrganizationStoreType as _OrganizationStoreType
} from '@paynless/types';
// Import the specific client class and the base api object
import { 
    api, 
    getApiClient,
    OrganizationApiClient as _OrganizationApiClient,
    ApiClient as _ApiClient
} from '@paynless/api';
import { useAuthStore } from './authStore'; // To get user ID
import { logger } from '@paynless/utils';

// --- State Interface (REMOVED - Imported from @paynless/types) ---
// interface OrganizationState { ... }

// --- Actions Interface (REMOVED - Imported from @paynless/types) ---
// Note: Internal actions (_setError, _setLoading) are part of the implementation,
// not the public interface defined in OrganizationActions.
// interface OrganizationActions { ... }

// --- Store Type (Use imported type) ---
// type OrganizationStore = OrganizationState & OrganizationActions; 
// We'll use OrganizationStoreType for the create function signature

// --- Initial State (Define using the imported type) ---
const initialState: OrganizationState = {
  userOrganizations: [],
  currentOrganizationId: null,
  currentOrganizationDetails: null,
  currentOrganizationMembers: [],
  isLoading: false,
  error: null,
};

// --- Store Implementation ---
// Define internal action types separately if needed for clarity within the store
interface InternalOrganizationActions {
  _setError: (error: string | null) => void;
  _setLoading: (loading: boolean) => void;
}

// Combine the public actions and internal actions for the create function implementation type
// Ensure this includes the newly added OrganizationActions from the types package
type OrganizationStoreImplementation = OrganizationState & OrganizationActions & InternalOrganizationActions;

// Instantiate the specific client - assuming the main 'api' export *is* the base client instance
// const orgApiClient = new OrganizationApiClient(api as ApiClient); 

export const useOrganizationStore = create<OrganizationStoreImplementation>((set, get) => ({
  ...initialState,

  // --- Helper Actions ---
  _setError: (error: string | null) => set({ error, isLoading: false }),
  _setLoading: (loading: boolean) => set({ isLoading: loading }),

  // --- Main Actions (Existing implementations) ---
  fetchUserOrganizations: async () => {
    const { _setLoading, _setError } = get();
    _setLoading(true);
    _setError(null); // Clear previous errors

    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      logger.warn('[OrganizationStore] fetchUserOrganizations - User not authenticated.');
      _setError('User not authenticated');
      set({ userOrganizations: [] }); // Clear orgs if not logged in
      return;
    }

    try {
      // Use the factory method api.organizations() to get the client instance
      // Correctly access the organizations property and its method
      // --- TEMPORARY WORKAROUND: Cast to 'any' due to export type issue ---
      const response = await (api as any).organizations.listUserOrganizations(userId);

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
      // Use the factory method api.organizations() to get the client instance
      // --- TEMPORARY WORKAROUND: Cast to 'any' due to export type issue ---
      const response = await (api as any).organizations.getOrganizationDetails(orgId);

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
    
    if (!currentOrganizationId) {
      logger.warn('[OrganizationStore] fetchCurrentOrganizationMembers - No current organization selected.');
      // Optionally set error or just return
      // _setError('No organization selected'); 
      set({ currentOrganizationMembers: [], isLoading: false }); // Clear members if no org selected
      return;
    }
    
    _setLoading(true);
    _setError(null);

    try {
      // Use the factory method api.organizations() to get the client instance
      // --- TEMPORARY WORKAROUND: Cast to 'any' due to export type issue ---
      const response = await (api as any).organizations.getOrganizationMembers(currentOrganizationId);

      if (response.error || response.status >= 300) {
        const errorLog = { 
            message: response.error?.message ?? 'Unknown API Error', 
            code: response.error?.code, 
            status: response.status 
        };
        logger.error('[OrganizationStore] fetchCurrentOrganizationMembers - API Error', { orgId: currentOrganizationId, ...errorLog });
        _setError(response.error?.message ?? 'Failed to fetch organization members');
        set({ currentOrganizationMembers: [] }); // Clear members on error
      } else {
        set({ currentOrganizationMembers: response.data ?? [] }); // Set members on success, default to empty array
        _setError(null); // Explicitly clear error
      }
    } catch (err: any) {
      logger.error('[OrganizationStore] fetchCurrentOrganizationMembers - Unexpected Error', { orgId: currentOrganizationId, message: err?.message });
      _setError(err.message ?? 'An unexpected error occurred');
      set({ currentOrganizationMembers: [] }); // Clear members on error
    } finally {
      _setLoading(false);
    }
  },

  softDeleteOrganization: async (orgId: string): Promise<boolean> => {
    const { _setLoading, _setError, currentOrganizationId, userOrganizations } = get();
    _setLoading(true);
    _setError(null);

    try {
      // Use the factory method api.organizations() to get the client instance
      // --- TEMPORARY WORKAROUND: Cast to 'any' due to export type issue ---
      const response = await (api as any).organizations.deleteOrganization(orgId);

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
        let updatedState: Partial<OrganizationState> = { 
            userOrganizations: updatedOrgs,
            isLoading: false,
            error: null
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
    // Remove fetchUserOrganizations as it's not used when updating state directly
    const { _setLoading, _setError } = get(); 
    _setLoading(true);
    _setError(null);

    try {
      // --- TEMPORARY WORKAROUND: Cast to 'any' due to export type issue ---
      const response = await (api as any).organizations.createOrganization({
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

  inviteUser: async (_emailOrUserId: string, _role: string): Promise<boolean> => {
    // Implementation will be added in the GREEN step
    throw new Error('inviteUser not implemented');
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
  requestJoin: async (orgId: string): Promise<boolean> => {
    const { _setLoading, _setError } = get();
    _setLoading(true);
    _setError(null);
    try {
        const apiClient = getApiClient();
        // Use the correct API client method as defined in organizations.api.ts
        const response = await apiClient.organizations.requestToJoinOrganization(orgId);

        if (response.error || response.status >= 300) {
            const errorMsg = response.error?.message ?? 'Failed to request join';
            logger.error('[OrganizationStore] requestJoin - API Error', { orgId, error: errorMsg, status: response.status });
            _setError(errorMsg);
            return false;
        } else {
            logger.info('[OrganizationStore] Join request submitted successfully', { orgId });
            // Optional: Refetch pending requests or members if UI needs update
            // get().fetchCurrentOrganizationMembers(); // Or a dedicated pending list fetch
            return true;
        }
    } catch (err: any) {
        const errorMsg = err.message ?? 'An unexpected error occurred during join request';
        logger.error('[OrganizationStore] requestJoin - Unexpected Error', { orgId, message: errorMsg });
        _setError(errorMsg);
        return false;
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
  denyRequest: async (_membershipId: string): Promise<boolean> => {
     throw new Error('denyRequest not implemented');
  },
  cancelInvite: async (_inviteId: string): Promise<boolean> => {
     throw new Error('cancelInvite not implemented');
  },

})); 