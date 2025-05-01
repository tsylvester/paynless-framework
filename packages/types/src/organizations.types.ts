import type { Database } from '@paynless/db-types';
import type { UserProfile } from './auth.types';
//import { ApiError } from './api.types'; // Add import for ApiError

// Base types derived from the generated Database type
type OrganizationsTable = Database['public']['Tables']['organizations'];
type OrganizationMembersTable = Database['public']['Tables']['organization_members'];
type InvitesTable = Database['public']['Tables']['invites']; // Add invites table type

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
   user_profiles: UserProfile | null;
};

// TODO: Define composite types if needed, e.g., MemberWithProfile
// export type OrganizationMemberWithProfile = OrganizationMember & {
//   profile: Database['public']['Tables']['user_profiles']['Row'] | null;
// }; 

// --- Invite Type ---
export type Invite = InvitesTable['Row'];
export type InviteInsert = InvitesTable['Insert'];
export type InviteUpdate = InvitesTable['Update'];

// --- Membership Request Type (Derived from Member for consistency) ---
// Represents a user's request to join (often corresponds to a member record with 'pending_approval' status)
export type MembershipRequest = OrganizationMemberWithProfile & {
    status: 'pending_approval'; // Explicitly define the status for requests
};

// --- Enriched Pending Types (for PendingActionsCard) ---

// Invite enriched with the inviter's profile
export type PendingInviteWithInviter = Invite & {
  invited_by_profile: UserProfile | null; // Profile of the user who sent invite
};

// MembershipRequest enriched with the requester's email (from auth.users)
export type PendingRequestWithDetails = MembershipRequest & {
    user_email: string | null; // Email of the user requesting to join
};

// --- Zustand Store Types (Consolidated) ---
export interface OrganizationState {
  userOrganizations: Organization[];
  currentOrganizationId: string | null;
  currentOrganizationDetails: Organization | null;
  currentOrganizationMembers: OrganizationMemberWithProfile[];
  currentPendingInvites: PendingInviteWithInviter[]; // <<< Use the new enriched type
  currentPendingRequests: PendingRequestWithDetails[]; // <<< Use the new enriched type
  currentInviteDetails: InviteDetails | null; // Details of an invite being viewed/acted upon
  isLoading: boolean;
  isFetchingInviteDetails: boolean; // Loading state specifically for invite details
  fetchInviteDetailsError: string | null; // Error state specifically for invite details
  error: string | null;
  // --- Pagination State ---
  orgListPage: number;
  orgListPageSize: number;
  orgListTotalCount: number;
}

// Type for the details needed on the Invite Accept page
export interface InviteDetails {
    organizationName: string;
    organizationId: string;
}

// Type definition for the paginated response from listUserOrganizations
export interface PaginatedOrganizationsResponse {
    organizations: Organization[];
    totalCount: number;
}

// Uses DB-derived Invite and the defined MembershipRequest
// This type is used by the API client for getPendingOrgActions
export interface PendingOrgItems {
    invites: Invite[]; // API returns base Invite
    requests: MembershipRequest[]; // API returns base MembershipRequest
}

export interface OrganizationActions {
  fetchUserOrganizations: (options?: { page?: number, limit?: number }) => Promise<void>;
  setCurrentOrganizationId: (orgId: string | null) => void;
  fetchOrganizationDetails: (orgId: string) => Promise<void>;
  fetchCurrentOrganizationMembers: () => Promise<void>;
  createOrganization: (name: string, visibility?: 'private' | 'public') => Promise<Organization | null>;
  softDeleteOrganization: (orgId: string) => Promise<boolean>;
  updateOrganization: (orgId: string, updates: Partial<Organization>) => Promise<boolean>;
  leaveOrganization: (orgId: string) => Promise<boolean>;
  inviteUser: (identifier: string, role: string) => Promise<Invite | null>; 
  updateMemberRole: (membershipId: string, role: string) => Promise<boolean>;
  removeMember: (membershipId: string) => Promise<boolean>;
  acceptInvite: (token: string) => Promise<boolean>;
  declineInvite: (token: string) => Promise<boolean>;
  requestJoin: (orgId: string) => Promise<MembershipRequest | null>; 
  approveRequest: (membershipId: string) => Promise<boolean>;
  denyRequest: (membershipId: string) => Promise<boolean>;
  cancelInvite: (inviteId: string) => Promise<boolean>;
  fetchInviteDetails: (token: string) => Promise<InviteDetails | null>; 
  // --- Pagination Actions ---
  setOrgListPage: (page: number) => void;
  setOrgListPageSize: (size: number) => void;
}

export type OrganizationStoreType = OrganizationState & OrganizationActions;