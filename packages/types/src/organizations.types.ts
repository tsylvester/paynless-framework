import type { Database } from '@paynless/db-types';
//import { ApiError } from './api.types'; // Add import for ApiError

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

// --- Membership Request Type (Derived from Member for consistency) ---
// Represents a user's request to join (often corresponds to a member record with 'pending_approval' status)
export type MembershipRequest = OrganizationMemberWithProfile & {
    status: 'pending_approval'; // Explicitly define the status for requests
};

// --- Zustand Store Types (Consolidated) ---

export interface OrganizationState {
  userOrganizations: Organization[];
  currentOrganizationId: string | null;
  currentOrganizationDetails: Organization | null;
  currentOrganizationMembers: OrganizationMemberWithProfile[];
  currentPendingInvites: Invite[]; // Use DB-derived Invite type
  currentPendingRequests: MembershipRequest[]; // Use MembershipRequest type
  currentInviteDetails: InviteDetails | null; // Details of an invite being viewed/acted upon
  isLoading: boolean;
  isFetchingInviteDetails: boolean; // Loading state specifically for invite details
  fetchInviteDetailsError: string | null; // Error state specifically for invite details
  error: string | null;
}

// Type for the details needed on the Invite Accept page
export interface InviteDetails {
    organizationName: string;
    organizationId: string;
}

// Uses DB-derived Invite and the defined MembershipRequest
export interface PendingOrgItems {
    invites: Invite[];
    requests: MembershipRequest[];
}

export interface OrganizationActions {
  fetchUserOrganizations: () => Promise<void>;
  setCurrentOrganizationId: (orgId: string | null) => void;
  fetchOrganizationDetails: (orgId: string) => Promise<void>;
  fetchCurrentOrganizationMembers: () => Promise<void>;
  createOrganization: (name: string, visibility?: 'private' | 'public') => Promise<Organization | null>;
  softDeleteOrganization: (orgId: string) => Promise<boolean>;
  updateOrganization: (orgId: string, updates: Partial<Organization>) => Promise<boolean>;
  leaveOrganization: (orgId: string) => Promise<boolean>;
  inviteUser: (identifier: string, role: string) => Promise<Invite | null>; // Identifier can be email or userId
  updateMemberRole: (membershipId: string, role: string) => Promise<boolean>;
  removeMember: (membershipId: string) => Promise<boolean>;
  acceptInvite: (token: string) => Promise<boolean>;
  declineInvite: (token: string) => Promise<boolean>;
  requestJoin: (orgId: string) => Promise<MembershipRequest | null>; // Return request or null
  approveRequest: (membershipId: string) => Promise<boolean>;
  denyRequest: (membershipId: string) => Promise<boolean>;
  cancelInvite: (inviteId: string) => Promise<boolean>;
  fetchInviteDetails: (token: string) => Promise<InviteDetails | null>; // Action to get details for accept page
}

export type OrganizationStoreType = OrganizationState & OrganizationActions;

// Type for API responses, generic over the data type T
// export type ApiResponse<T> = {
//   status: number;
//   data: T | undefined;
//   error: ApiError | undefined; // Use defined ApiError type
// };

// Represents an invitation to join an organization
// export type Invite = {
//   id: string; // Typically a UUID
//   organization_id: string;
//   email: string; // Email address invited
//   role: 'admin' | 'member'; // Role assigned upon acceptance
//   status: 'pending' | 'accepted' | 'declined' | 'cancelled'; // Status of the invite
//   created_at: string; // ISO date string
//   invited_by_user_id?: string | null; // User who sent the invite
//   token?: string | null; // Optional invite token if used
// };
//
// // Represents a request from a user to join an organization
// export type MembershipRequest = {
//     id: string; // Request identifier (e.g., organization_member id if status is 'pending_approval')
//     organization_id: string;
//     user_id: string;
//     status: 'pending_approval'; // Status indicating it's a request awaiting action
//     created_at: string; // ISO date string
//     user_profiles: UserProfilesTable['Row'] | null; // Include user profile info for display
// };
//
// // Combined type for pending items related to an organization
// export type PendingOrgItems = {
//     invites: Invite[]; // Array of pending invitations sent out
//     requests: MembershipRequest[]; // Array of pending join requests
// }; 