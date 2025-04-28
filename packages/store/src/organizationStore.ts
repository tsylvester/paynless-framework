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
type OrganizationStoreImplementation = OrganizationState & OrganizationActions & InternalOrganizationActions;

// Instantiate the specific client - assuming the main 'api' export *is* the base client instance
// const orgApiClient = new OrganizationApiClient(api as ApiClient); 

export const useOrganizationStore = create<OrganizationStoreImplementation>((set, get) => ({
  ...initialState,

  // --- Helper Actions ---
  _setError: (error: string | null) => set({ error, isLoading: false }),
  _setLoading: (loading: boolean) => set({ isLoading: loading }),

  // --- Main Actions (Implementations remain the same) ---
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
    // Implementation TBD
    const { currentOrganizationId } = get();
    if (currentOrganizationId) {
        logger.info(`[OrganizationStore] fetchCurrentOrganizationMembers called for ${currentOrganizationId} - TBD`);
    }
  },

  softDeleteOrganization: async (orgId: string): Promise<boolean> => {
    // Implementation TBD
    logger.info(`[OrganizationStore] softDeleteOrganization called for ${orgId} - TBD`);
    return false;
  },

})); 