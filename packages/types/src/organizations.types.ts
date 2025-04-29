import type { Database } from '@paynless/db-types';
import { ApiError } from './api.types'; // Add import for ApiError

// Base types derived from the generated Database type
type OrganizationsTable = Database['public']['Tables']['organizations'];
type OrganizationMembersTable = Database['public']['Tables']['organization_members'];
type InvitesTable = Database['public']['Tables']['invites']; // Add invites table type
// Assume profile table type
type UserProfilesTable = Database['public']['Tables']['user_profiles'];

// --- Organization Types ---
export type Organization = OrganizationsTable['Row'];
export type OrganizationInsert = OrganizationsTable['Insert'];
export type OrganizationUpdate = OrganizationsTable['Update'];

// --- Organization Member Types ---
export type OrganizationMember = OrganizationMembersTable['Row'];
export type OrganizationMemberInsert = OrganizationMembersTable['Insert'];
export type OrganizationMemberUpdate = OrganizationMembersTable['Update'];

// Define composite type for Member with Profile
// Used when fetching members to display names, avatars etc.
export type OrganizationMemberWithProfile = OrganizationMember & {
  // Embed the profile directly. Adjust 'user_profiles' if table name differs.
  // Use Partial<> if profile might be missing due to DB constraints/errors,
  // or make it nullable if the JOIN could legitimately find no profile.
   user_profiles: UserProfilesTable['Row'] | null;
};

// TODO: Define composite types if needed, e.g., MemberWithProfile
// export type OrganizationMemberWithProfile = OrganizationMember & {
//   profile: Database['public']['Tables']['user_profiles']['Row'] | null;
// }; 

// --- Invite Type ---
export type Invite = InvitesTable['Row'];
export type InviteInsert = InvitesTable['Insert'];
export type InviteUpdate = InvitesTable['Update'];

// --- Zustand Store Types (Consolidated) ---

export interface OrganizationState {
  userOrganizations: Organization[];
  currentOrganizationId: string | null;
  currentOrganizationDetails: Organization | null;
  currentOrganizationMembers: OrganizationMemberWithProfile[];
    currentPendingInvites: Invite[];
    currentPendingRequests: OrganizationMemberWithProfile[];
  isLoading: boolean;
    error: string | null;
}

export interface PendingOrgItems {
    invites: Invite[];
    requests: OrganizationMemberWithProfile[];
}
  
export interface OrganizationActions {
  fetchUserOrganizations: () => Promise<void>;
  setCurrentOrganizationId: (orgId: string | null) => void;
  fetchOrganizationDetails: (orgId: string) => Promise<void>;
    fetchCurrentOrganizationMembers: () => Promise<void>;
    fetchPendingItems: () => Promise<void>;
    createOrganization: (name: string, visibility?: 'private' | 'public') => Promise<Organization | null>;
    softDeleteOrganization: (orgId: string) => Promise<boolean>;
    updateOrganization: (orgId: string, updates: Partial<Organization>) => Promise<boolean>;
    inviteUser: (emailOrUserId: string, role: string) => Promise<boolean>;
    updateMemberRole: (membershipId: string, role: string) => Promise<boolean>;
    removeMember: (membershipId: string) => Promise<boolean>;
    acceptInvite: (token: string) => Promise<boolean>;
    declineInvite: (token: string) => Promise<boolean>;
    requestJoin: (orgId: string) => Promise<boolean>;
    approveRequest: (membershipId: string) => Promise<boolean>;
    denyRequest: (membershipId: string) => Promise<boolean>;
    cancelInvite: (inviteId: string) => Promise<boolean>;
}
  
export type OrganizationStoreType = OrganizationState & OrganizationActions; 