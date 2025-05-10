import { create } from 'zustand';
import { persist } from 'zustand/middleware';
// Import store types from the types package
import {
    Organization,
    OrganizationMemberWithProfile,
    InviteDetails,
    MembershipRequest,
    OrganizationState,
    OrganizationActions,
    OrganizationUIState,
    OrganizationUIActions,
    OrganizationUpdate,
} from '@paynless/types';
// Import the specific client class and the base api object
import { 
    getApiClient,
} from '@paynless/api';
import { useAuthStore } from './authStore'; // To get user ID
import { logger } from '@paynless/utils';
// import { useAnalyticsStore } from './analyticsStore'; // Removed - Store not found / incorrect scope

// --- Store Type (Use imported type) ---
// type OrganizationStore = OrganizationState & OrganizationActions; 
// We'll use OrganizationStoreType for the create function signature

// --- Initial State (Define using the imported type) ---
// Define initial values for pagination
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10; // <<< Change to 10

// Combine the imported state with our UI state
const initialState: OrganizationState & OrganizationUIState = {
  userOrganizations: [],
  currentOrganizationId: null,
  currentOrganizationDetails: null,
  currentOrganizationMembers: [],
  // Member Pagination State
  memberCurrentPage: DEFAULT_PAGE,
  memberPageSize: DEFAULT_PAGE_SIZE,
  memberTotalCount: 0,
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
  // Pagination State
  orgListPage: DEFAULT_PAGE,
  orgListPageSize: DEFAULT_PAGE_SIZE,
  orgListTotalCount: 0,
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
export type OrganizationStoreImplementation = 
    OrganizationState & 
    OrganizationUIState & 
    OrganizationActions & 
    OrganizationUIActions & 
    InternalOrganizationActions;

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

      // --- Pagination Actions ---
      setOrgListPage: (page: number) => {
        logger.debug(`[OrganizationStore] Setting Org List Page: ${page}`);
        set({ orgListPage: page });
        get().fetchUserOrganizations({ page }); // Refetch data for the new page
      },
      setOrgListPageSize: (size: number) => {
        logger.debug(`[OrganizationStore] Setting Org List Page Size: ${size}`);
        set({ orgListPageSize: size, orgListPage: 1 }); // Reset to page 1 and set new size
        get().fetchUserOrganizations({ page: 1, limit: size }); // Refetch data with new size
      },

      // --- Main Actions (Modified fetchUserOrganizations only) ---
      fetchUserOrganizations: async (options?: { page?: number, limit?: number }) => {
        const { _setLoading, _setError, orgListPage, orgListPageSize } = get();
        const currentPage = options?.page ?? orgListPage;
        const currentLimit = options?.limit ?? orgListPageSize;
        logger.debug(`[OrganizationStore] Fetching User Orgs - Page: ${currentPage}, Limit: ${currentLimit}`);

        _setLoading(true);
        _setError(null); // Clear previous errors

        const isAuthenticated = !!useAuthStore.getState().user;
        if (!isAuthenticated) {
            logger.warn('[OrganizationStore] fetchUserOrganizations - User not authenticated. Aborting fetch.');
            _setError('User not authenticated');
            // Reset list, total count, and page number on auth error
            set({ userOrganizations: [], orgListTotalCount: 0, orgListPage: 1, isLoading: false }); 
            return;
        }

        try {
          const apiClient = getApiClient();
          // Pass page and limit to the API client method
          const response = await apiClient.organizations.listUserOrganizations(currentPage, currentLimit);

          // <<< CHANGE TO INFO LEVEL >>>
          logger.info('[OrganizationStore] fetchUserOrganizations - Raw API response', { 
            status: response.status, 
            error: response.error, 
            data: JSON.stringify(response.data) // Convert data to string for logging if complex
          });

          if (response.error || response.status >= 300 || !response.data) {
            logger.error('[OrganizationStore] fetchUserOrganizations - API Error or No Data', { error: response.error, status: response.status, hasData: !!response.data });
            _setError(response.error?.message ?? 'Failed to fetch organizations');
            // Reset list and total count, keep current page/size
            set({ userOrganizations: [], orgListTotalCount: 0 }); 
          } else {
            // We expect PaginatedOrganizationsResponse here
            // <<< REMOVE JSON.parse(), use response.data directly >>>
            /*
            let parsedData: { organizations: Organization[], totalCount: number } | null = null;
            try {
              // <<< PARSE THE JSON STRING HERE >>>
              parsedData = JSON.parse(response.data as any); // Use 'as any' temporarily if TS complains about string type
            } catch (parseError) {
                logger.error('[OrganizationStore] fetchUserOrganizations - Failed to parse API response JSON', { rawData: response.data, error: parseError });
                _setError('Failed to process server response.');
                set({ userOrganizations: [], orgListTotalCount: 0 }); 
                return; // Exit if parsing failed
            }
            */
            
            // Assume response.data is already the parsed object
            const organizations = response.data.organizations ?? [];
            const totalCount = response.data.totalCount ?? 0;
            
            logger.debug('[OrganizationStore] fetchUserOrganizations - Extracted data:', { organizations, totalCount });

            const activeOrgs = organizations.filter((org: Organization) => !org.deleted_at);
            
            logger.debug(`[OrganizationStore] Received ${activeOrgs.length} active orgs, totalCount: ${totalCount}`);
            set({
              userOrganizations: activeOrgs,
              orgListTotalCount: totalCount,
              // Update page/size state ONLY if they were passed in options (to reflect the current fetch)
              ...(options?.page !== undefined && { orgListPage: options.page }),
              ...(options?.limit !== undefined && { orgListPageSize: options.limit }),
              error: null, // Clear error on success
            });
          }
        } catch (err: unknown) {
           const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
           logger.error('[OrganizationStore] fetchUserOrganizations - Unexpected Error', { message: errorMessage });
           _setError(errorMessage);
           // Reset list and total count, keep current page/size
           set({ userOrganizations: [], orgListTotalCount: 0 });
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
            // Reset member pagination state on org switch
            memberCurrentPage: DEFAULT_PAGE,
            memberPageSize: DEFAULT_PAGE_SIZE,
            memberTotalCount: 0,
            currentPendingInvites: [], // Also clear pending lists
            currentPendingRequests: [],
            currentInviteDetails: null,
            error: null, // Clear errors on context switch
        });

        // --- BEGIN Backend Profile Update --- 
        const userId = useAuthStore.getState().user?.id;
        if (userId) {
          // Call updateProfile from authStore asynchronously
          // We don't await it here to avoid blocking UI state update
          // Error handling will happen within updateProfile or be logged
          logger.debug(`[OrganizationStore] Triggering profile update for user ${userId} with last_selected_org_id: ${orgId}`);
          useAuthStore.getState().updateProfile({ last_selected_org_id: orgId })
            .catch(err => {
                // Log error if the async profile update fails, but don't set store error state here
                logger.error('[OrganizationStore] Background profile update failed:', { userId, orgId, error: err?.message });
            });
        } else {
            logger.warn('[OrganizationStore] Cannot update profile: User ID not found in authStore.');
        }
        // --- END Backend Profile Update ---

        logger.info(`[OrganizationStore] Switched current organization context to: ${orgId}`);
      },

      fetchCurrentOrganizationDetails: async () => {
        const { _setLoading, _setError, currentOrganizationId } = get();
        _setLoading(true);
        _setError(null);

        if (!currentOrganizationId) {
          logger.warn('[OrganizationStore] fetchCurrentOrganizationDetails - No current organization ID set.');
          _setError('No organization selected');
          set({ currentOrganizationDetails: null, isLoading: false }); // Clear details, set loading false
          return; // Exit early
        }

        try {
          const apiClient = getApiClient();
          const response = await apiClient.organizations.getOrganizationDetails(currentOrganizationId);

          if (response.error || response.status >= 300) {
            const errorLog = { 
                message: response.error?.message ?? 'Unknown API Error', 
                code: response.error?.code, 
                status: response.status 
            };
            logger.error('[OrganizationStore] fetchCurrentOrganizationDetails - API Error', { orgId: currentOrganizationId, ...errorLog });
            _setError(response.error?.message ?? 'Failed to fetch organization details');
            set({ currentOrganizationDetails: null }); // Clear details on error
          } else {
            set({ currentOrganizationDetails: response.data }); // Set details on success
            _setError(null); // Explicitly clear error
          }
        } catch (err: unknown) {
          logger.error('[OrganizationStore] fetchCurrentOrganizationDetails - Unexpected Error', { orgId: currentOrganizationId, message: err instanceof Error ? err.message : String(err) });
          _setError(err instanceof Error ? err.message : 'An unexpected error occurred');
          set({ currentOrganizationDetails: null }); // Clear details on error
        } finally {
          _setLoading(false);
        }
      },

      fetchCurrentOrganizationMembers: async (options?: { page?: number, limit?: number }) => {
        const { currentOrganizationId, memberCurrentPage, memberPageSize, _setLoading, _setError } = get();
        const currentPage = options?.page ?? memberCurrentPage;
        const currentLimit = options?.limit ?? memberPageSize;
        
        const userId = useAuthStore.getState().user?.id; // Get current user ID

        if (!currentOrganizationId) {
          logger.warn('[OrganizationStore] fetchCurrentOrganizationMembers - No current organization selected.');
          set({ 
            currentOrganizationMembers: [], 
            memberTotalCount: 0, // Reset count
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
            memberTotalCount: 0, // Reset count
            currentPendingInvites: [], // Clear pending state
            currentPendingRequests: [], // Clear pending state
            isLoading: false 
          }); 
          return;
        }
        
        logger.debug(`[OrganizationStore] Fetching Org Members - Org: ${currentOrganizationId}, Page: ${currentPage}, Limit: ${currentLimit}`);
        _setLoading(true);
        _setError(null);
        // Reset pending lists initially
        set({ currentPendingInvites: [], currentPendingRequests: [] }); 

        let currentUserRole: 'admin' | 'member' | null = null;

        try {
          const apiClient = getApiClient();

          // Call the updated API client method with pagination parameters
          const membersResponse = await apiClient.organizations.getOrganizationMembers(
             currentOrganizationId, 
             currentPage, 
             currentLimit
          );

          // *** TODO: Adapt response handling when API actually returns paginated data ***
          // The current API client method likely returns OrganizationMemberWithProfile[] directly,
          // not { members: [], totalCount: number }. We'll pretend it does for now to match the test setup,
          // but this will need fixing when the API/Client are updated.

          // --- START ACTUAL PAGINATED RESPONSE HANDLING ---
          if (membersResponse.error || membersResponse.status >= 300 || !membersResponse.data) { // Check for error or missing data
              const errorLog = { /* ... */ };
              logger.error('[OrganizationStore] fetchCurrentOrganizationMembers - API Error (Members)', { orgId: currentOrganizationId, ...errorLog });
              _setError(membersResponse.error?.message ?? 'Failed to fetch organization members');
              set({ currentOrganizationMembers: [], memberTotalCount: 0 }); 
              _setLoading(false); 
              return; 
          } else {
              // Extract data directly from the PaginatedMembersResponse structure
              const fetchedMembers = membersResponse.data.members ?? [];
              const totalCount = membersResponse.data.totalCount ?? 0;

              set({ 
                  currentOrganizationMembers: fetchedMembers, 
                  memberTotalCount: totalCount,
                  memberCurrentPage: currentPage, 
                  memberPageSize: currentLimit, 
                  error: null, 
              }); 
          }
          // --- END ACTUAL PAGINATED RESPONSE HANDLING ---

          // 2. Determine Current User's Role
          // FIX LINTER ERROR: Add type to parameter
          const currentUserMembership = get().currentOrganizationMembers.find((member: OrganizationMemberWithProfile) => member.user_id === userId);
          currentUserRole = currentUserMembership?.role as 'admin' | 'member' | null;

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
            } catch (pendingErr: unknown) {
                 // Log error but don't overwrite the primary members list or main error state
                logger.error('[OrganizationStore] fetchCurrentOrganizationMembers - Unexpected Error (Pending Actions)', { orgId: currentOrganizationId, message: pendingErr instanceof Error ? pendingErr.message : String(pendingErr) });
                 // Set pending lists to empty on error, but keep active members
                set({ currentPendingInvites: [], currentPendingRequests: [] }); 
            }
          } else {
              // Non-admin, ensure pending lists are clear
              set({ currentPendingInvites: [], currentPendingRequests: [] });
          }

        } catch (err: unknown) {
          logger.error('[OrganizationStore] fetchCurrentOrganizationMembers - Unexpected Error', { orgId: currentOrganizationId, message: err instanceof Error ? err.message : String(err) });
          _setError(err instanceof Error ? err.message : 'An unexpected error occurred');
          set({ currentOrganizationMembers: [], memberTotalCount: 0, currentPendingInvites: [], currentPendingRequests: [] }); // Clear members, count & pending on error
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
            // eslint-disable-next-line prefer-const
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
        } catch (err: unknown) {
          logger.error('[OrganizationStore] softDeleteOrganization - Unexpected Error', { orgId, message: err instanceof Error ? err.message : String(err) });
          _setError(err instanceof Error ? err.message : 'An unexpected error occurred during deletion');
          set({ isLoading: false }); // Ensure loading is false on unexpected error
          return false; // Indicate failure
        } 
        // No finally block needed as loading/return is handled in branches
      },

      // --- Add createOrganization Action ---
      createOrganization: async (name: string, visibility: 'private' | 'public' = 'private'): Promise<boolean> => {
        const { _setLoading, _setError, setCurrentOrganizationId } = get();
        _setLoading(true);
        _setError(null);

        try {
          const apiClient = getApiClient();
          const response = await apiClient.organizations.createOrganization({
            name,
            visibility,
          });

          if (response.error || !response.data) { // Check error or missing data
            const errorMsg = response.error?.message ?? 'Failed to create organization';
            logger.error('[OrganizationStore] createOrganization - API Error', { name, visibility, error: errorMsg, status: response.status });
            _setError(errorMsg);
            return false; // Return boolean failure
          } else {
            const newOrg: Organization = response.data;
            logger.info(`[OrganizationStore] Successfully created organization ${newOrg.id} (${newOrg.name}).`);

            // Update state: Add new org to the list
            set((state) => ({
              userOrganizations: [...state.userOrganizations, newOrg],
              error: null, // Clear error on success
            }));

            // Switch to the new organization
            setCurrentOrganizationId(newOrg.id);

            // Navigate (optional)
            const navigate = useAuthStore.getState().navigate;
            if (navigate) {
              navigate('/organizations');
            } else {
              logger.warn('[OrganizationStore] Navigate function not available in authStore.');
            }

            return true; // Return boolean success
          }
        } catch (err: unknown) {
          logger.error('[OrganizationStore] createOrganization - Unexpected Error', { name, visibility, message: err instanceof Error ? err.message : String(err) });
          _setError(err instanceof Error ? err.message : 'An unexpected error occurred while creating the organization');
          return false; // FIX: Return boolean
        } finally {
          _setLoading(false);
        }
      },

      updateOrganization: async (orgId: string, updates: Partial<Organization>): Promise<boolean> => {
        const { _setLoading, _setError, currentOrganizationId, userOrganizations } = get();
        _setLoading(true);
        _setError(null);

        try {
          const apiClient = getApiClient();
          const response = await apiClient.organizations.updateOrganization(orgId, updates);

          if (response.error || response.status >= 300 || !response.data) {
            const errorMsg = response.error?.message ?? 'Failed to update organization';
            logger.error('[OrganizationStore] updateOrganization - API Error', { orgId, updates, error: errorMsg, status: response.status });
            _setError(errorMsg);
            return false; // Indicate failure
          } else {
            const updatedOrg = response.data;
            logger.info(`[OrganizationStore] Successfully updated organization ${orgId}.`);

            // Update the list of user organizations
            const updatedUserOrgs = userOrganizations.map(org => 
                org.id === orgId ? updatedOrg : org
            );

            // eslint-disable-next-line prefer-const
            let updatedState: Partial<OrganizationState & OrganizationUIState> = {
                userOrganizations: updatedUserOrgs,
                isLoading: false,
                error: null,
            };

            // If the updated organization is the current one, update details too
            if (currentOrganizationId === orgId) {
                updatedState.currentOrganizationDetails = updatedOrg;
            }

            set(updatedState);
            return true; // Indicate success
          }
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred during organization update';
          logger.error('[OrganizationStore] updateOrganization - Unexpected Error', { orgId, updates, message: errorMsg });
          _setError(errorMsg);
          return false; // Indicate failure
        } finally {
          _setLoading(false);
        }
      },
      // +++ Add leaveOrganization +++
      leaveOrganization: async (orgId: string): Promise<boolean> => {
        const { _setLoading, _setError, currentOrganizationId, userOrganizations } = get();
        _setLoading(true);
        _setError(null);

        // Check authentication
        const isAuthenticated = !!useAuthStore.getState().user;
        if (!isAuthenticated) {
          logger.warn('[OrganizationStore] leaveOrganization - User not authenticated.');
          _setError('User not authenticated');
          _setLoading(false);
          return false;
        }

        try {
          const apiClient = getApiClient();
          const response = await apiClient.organizations.leaveOrganization(orgId);

          if (response.error || response.status >= 300) {
            const errorLog = {
                message: response.error?.message ?? 'Unknown API Error',
                code: response.error?.code,
                status: response.status
            };
            logger.error('[OrganizationStore] leaveOrganization - API Error', { orgId, ...errorLog });
            _setError(response.error?.message ?? 'Failed to leave organization');
            _setLoading(false);
            return false; // Indicate failure
          } else {
            // Success: Remove org from list and potentially clear current context
            const updatedOrgs = userOrganizations.filter(org => org.id !== orgId);
            let updatedState: Partial<OrganizationState & OrganizationUIState> = {
                userOrganizations: updatedOrgs,
                isLoading: false,
                error: null,
            };

            if (currentOrganizationId === orgId) {
              logger.info(`[OrganizationStore] Left current organization ${orgId}. Clearing context.`);
              updatedState = {
                ...updatedState,
                currentOrganizationId: null,
                currentOrganizationDetails: null,
                currentOrganizationMembers: [],
                currentPendingInvites: [], // Clear pending too
                currentPendingRequests: [], // Clear pending too
              };
            }

            set(updatedState);
            logger.info(`[OrganizationStore] Successfully left organization ${orgId}.`);
            return true; // Indicate success
          }
        } catch (err: unknown) {
          logger.error('[OrganizationStore] leaveOrganization - Unexpected Error', { orgId, message: err instanceof Error ? err.message : String(err) });
          _setError(err instanceof Error ? err.message : 'An unexpected error occurred while leaving the organization');
          set({ isLoading: false }); // Ensure loading is false on unexpected error
          return false; // Indicate failure
        }
      },
      // +++ End leaveOrganization +++

      // --- Add inviteUser Action ---
      inviteUser: async (email: string, role: 'admin' | 'member'): Promise<boolean> => {
        const { _setLoading, _setError, fetchCurrentOrganizationMembers, currentOrganizationId } = get();

        if (!currentOrganizationId) {
          const errorMsg = 'No organization selected to invite user to.';
          logger.error(`[OrganizationStore] ${errorMsg}`);
          _setError(errorMsg);
          return false; // Return boolean
        }

        _setLoading(true);
        _setError(null);

        try {
          const apiClient = getApiClient();
          // Assuming inviteUserByEmail is the correct method
          const response = await apiClient.organizations.inviteUserByEmail(currentOrganizationId, email, role);

          // Check the response status or error property from ApiResponse
          if (response.error || response.status >= 400) {
            const errorMsg = response.error?.message || `Failed to invite ${email}`;
            logger.error(`[OrganizationStore] Error inviting user: ${errorMsg}`, { status: response.status, code: response.error?.code });
            _setError(errorMsg);
            _setLoading(false);
            return false; // Return boolean failure
          } else {
            logger.info(`[OrganizationStore] Successfully invited ${email} to org ${currentOrganizationId}`);
            // Optionally refetch members/pending items after successful invite
            // Use void operator to ignore the promise returned by fetchCurrentOrganizationMembers
            void fetchCurrentOrganizationMembers();
            _setLoading(false);
            return true; // Return boolean success
          }
        } catch (error) {
          const errorMsg = `An unexpected error occurred while inviting ${email}`;
          if (error instanceof Error) {
              logger.error(`[OrganizationStore] ${errorMsg}`, { errorMessage: error.message });
          } else {
              logger.error(`[OrganizationStore] ${errorMsg}`, { errorDetails: String(error) });
          }
          _setError(errorMsg);
          _setLoading(false);
          return false; // Return boolean failure
        }
      }, // <--- Ensure this comma is present before the next action/property


      updateMemberRole: async (membershipId: string, role: string): Promise<boolean> => {
        const { _setLoading, _setError, currentOrganizationMembers } = get();
        _setLoading(true);
        _setError(null);

        try {
          const apiClient = getApiClient();
          const response = await apiClient.organizations.updateMemberRole(membershipId, role);

          if (response.error || response.status >= 300) {
            // Handle potential "last admin" error specifically if API provides hints
            // For now, just log and set the generic error message
            const errorMsg = response.error?.message ?? 'Failed to update member role';
            logger.error('[OrganizationStore] updateMemberRole - API Error', { membershipId, role, error: errorMsg, status: response.status });
            _setError(errorMsg);
            return false; // Indicate failure
          } else {
            logger.info(`[OrganizationStore] Successfully updated role for membership ${membershipId} to ${role}.`);

            // Update the member in the current list
            const updatedMembers = currentOrganizationMembers.map(member => 
              member.id === membershipId ? { ...member, role: role as 'admin' | 'member' } : member
            );

            set({ 
              currentOrganizationMembers: updatedMembers,
              isLoading: false,
              error: null 
            });
            return true; // Indicate success
          }
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred during role update';
          logger.error('[OrganizationStore] updateMemberRole - Unexpected Error', { membershipId, role, message: errorMsg });
          _setError(errorMsg);
          return false; // Indicate failure
        } finally {
          // Ensure loading is set to false, but error handling is done in catch/if blocks
          // We only set isLoading false here if it wasn't already set by an error return
          if (get().isLoading) { 
              set({ isLoading: false });
          }
        }
      },

      removeMember: async (membershipId: string): Promise<boolean> => {
        const { _setLoading, _setError, currentOrganizationMembers } = get();
        _setLoading(true);
        _setError(null);

        try {
          const apiClient = getApiClient();
          const response = await apiClient.organizations.removeMember(membershipId);

          if (response.error || response.status >= 300) {
            // Handle potential "last admin" error specifically if API provides hints
            const errorMsg = response.error?.message ?? 'Failed to remove member';
            logger.error('[OrganizationStore] removeMember - API Error', { membershipId, error: errorMsg, status: response.status });
            _setError(errorMsg);
            return false; // Indicate failure
          } else {
            logger.info(`[OrganizationStore] Successfully removed membership ${membershipId}.`);

            // Filter the member out of the current list
            const updatedMembers = currentOrganizationMembers.filter(member => 
              member.id !== membershipId
            );

            set({ 
              currentOrganizationMembers: updatedMembers,
              isLoading: false,
              error: null 
            });
            return true; // Indicate success
          }
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred during member removal';
          logger.error('[OrganizationStore] removeMember - Unexpected Error', { membershipId, message: errorMsg });
          _setError(errorMsg);
          return false; // Indicate failure
        } finally {
          // Ensure loading is set to false if not already handled by error return
          if (get().isLoading) { 
              set({ isLoading: false });
          }
        }
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
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred during invite acceptance';
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
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred during invite decline';
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
                return response.data as MembershipRequest | null;
            }
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred during join request';
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
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred during request approval';
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
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred during request denial';
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
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred during invite cancellation';
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
        } catch (err: unknown) {
            logger.error('[OrganizationStore] fetchInviteDetails - Unexpected Error', { token, message: err instanceof Error ? err.message : String(err) });
            set({ fetchInviteDetailsError: err instanceof Error ? err.message : 'An unexpected error occurred fetching invite details.', isFetchingInviteDetails: false });
            return null;
        }
      },

      // --- Selector Implementation ---
      // selectCurrentUserRoleInOrg: () => { // REMOVE THIS BLOCK
      //   const { currentOrganizationMembers, currentOrganizationId } = get();
      //   const userId = useAuthStore.getState().user?.id;

      //   if (!userId || !currentOrganizationId || !currentOrganizationMembers || currentOrganizationMembers.length === 0) {
      //     return null;
      //   }

      //   const currentUserMemberInfo = currentOrganizationMembers.find(member => member.user_id === userId);
      //   
      //   // The role in OrganizationMember is a string, but we expect 'admin' | 'member'.
      //   // Perform a cast or validation if necessary, though for mock purposes it might not matter as much.
      //   return currentUserMemberInfo ? (currentUserMemberInfo.role as 'admin' | 'member') : null;
      // },

      // selectIsDeleteDialogOpen: () => get().isDeleteDialogOpen, // REMOVE THIS LINE

      // selectCanCreateOrganizationChats: () => { // REMOVE THIS BLOCK
      //   const { currentOrganizationDetails } = get();
      //   if (!currentOrganizationDetails) return false;
      //   // For now, only the explicit setting. Role-based overrides could be added.
      //   return !!currentOrganizationDetails.allow_member_chat_creation;
      // },

      updateOrganizationSettings: async (orgId: string, settings: { allow_member_chat_creation: boolean }): Promise<boolean> => {
        const { _setLoading, _setError, currentOrganizationId, currentOrganizationDetails, userOrganizations } = get(); // Get current details and list
        
        const isCurrentOrg = orgId === currentOrganizationId;
        
        _setLoading(true);
        _setError(null);
        
        try {
            const apiClient = getApiClient();
            // Align with the backend change: use updateOrganization which hits PUT /organizations/:orgId
            // The OrganizationUpdate type should include allow_member_chat_creation as an optional field.
            const response = await apiClient.organizations.updateOrganization(orgId, settings as Partial<OrganizationUpdate>); // Cast settings to allow partial update

            if (response.error || !response.data) {
                const errorMsg = response.error?.message ?? 'Failed to update organization settings';
                logger.error('[OrganizationStore] updateOrganizationSettings - API Error', { orgId, settings, error: errorMsg, status: response.status });
                _setError(errorMsg);
                return false;
            } else {
                const updatedOrgDetails = response.data; // This will be the full updated Organization object
                logger.info(`[OrganizationStore] Successfully updated organization settings for ${orgId}.`);
                
                // Optimistically update currentOrganizationDetails if it's the same org
                // and merge with existing details to preserve other fields not returned by a partial update
                // However, PUT usually returns the full resource, so merging might not be strictly needed if response.data is complete.
                if (isCurrentOrg) {
                    set({ 
                        currentOrganizationDetails: {
                            ...(currentOrganizationDetails || {}), // Keep existing details
                            ...updatedOrgDetails, // Override with new data from response
                        } as Organization, // Ensure the merged type is Organization
                        error: null 
                    });
                } else {
                    set({ error: null }); 
                }

                // Also update the organization in the userOrganizations list
                set(state => ({
                    userOrganizations: state.userOrganizations.map(org => 
                        org.id === orgId ? { ...org, ...updatedOrgDetails } : org
                    ),
                    error: null, 
                }));

                // Analytics event (example)
                // const analytics = useAnalyticsStore.getState(); 
                // analytics.trackEvent('member_chat_creation_toggled', { 
                //     organization_id: orgId,
                //     enabled: settings.allow_member_chat_creation 
                // });

                return true; 
            }
        } catch (err: unknown) { 
            const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred during settings update';
            logger.error('[OrganizationStore] updateOrganizationSettings - Unexpected Error', { orgId, settings, message: errorMsg });
            _setError(errorMsg);
            return false;
        } finally {
             _setLoading(false);
        }
      },

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