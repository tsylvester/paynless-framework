import { createSelector } from 'reselect';
import type { OrganizationState, OrganizationUIState, OrganizationMember } from '@paynless/types';
import { useAuthStore } from './authStore'; // For selectCurrentUserRoleInOrg

// Base Selectors
export const selectCurrentOrganizationMembers = (state: OrganizationState) => state.currentOrganizationMembers;
export const selectCurrentOrganizationId = (state: OrganizationState) => state.currentOrganizationId;
export const selectCurrentOrganizationDetails = (state: OrganizationState) => state.currentOrganizationDetails;
export const selectUserIdFromAuth = () => useAuthStore.getState().user?.id;

/**
 * Selects the current user's role in the currently selected organization.
 * Returns 'admin', 'member', or null if not applicable.
 */
export const selectCurrentUserRoleInOrg = createSelector(
  [selectCurrentOrganizationMembers, selectCurrentOrganizationId, selectUserIdFromAuth],
  (currentOrganizationMembers, currentOrganizationId, userId): OrganizationMember['role'] | null => {
    if (!userId || !currentOrganizationId || !currentOrganizationMembers || currentOrganizationMembers.length === 0) {
      return null;
    }
    const currentUserMemberInfo = currentOrganizationMembers.find(member => member.user_id === userId);
    return currentUserMemberInfo ? currentUserMemberInfo.role : null;
  }
);

/**
 * Selects whether the current user can create organization chats based on organization settings.
 * This selector currently only checks the 'allow_member_chat_creation' flag.
 * It could be extended to consider user roles (e.g., from selectCurrentUserRoleInOrg).
 */
export const selectCanCreateOrganizationChats = createSelector(
  [selectCurrentOrganizationDetails, selectCurrentUserRoleInOrg], // Added selectCurrentUserRoleInOrg for potential future use
  (currentOrganizationDetails, _currentUserRole): boolean => { // currentUserRole is available if needed
    if (!currentOrganizationDetails) {
      return false;
    }
    // For now, only the explicit setting. Role-based overrides could be added here.
    // Example: if (currentUserRole === 'admin') return true;
    return !!currentOrganizationDetails.allow_member_chat_creation;
  }
);

// Example of a simple selector that might not need reselect but included for consistency if desired
/**
 * Selects if the delete organization dialog is open.
 */
export const selectIsDeleteDialogOpen = (state: OrganizationUIState) => state.isDeleteDialogOpen; 