import type { Database } from '@paynless/db-types';

// Base types derived from the generated Database type
type OrganizationsTable = Database['public']['Tables']['organizations'];
type OrganizationMembersTable = Database['public']['Tables']['organization_members'];
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

// --- Zustand Store Types ---

// Define the state structure for the organization store
export interface OrganizationState {
  userOrganizations: Organization[];
  currentOrganizationId: string | null;
  currentOrganizationDetails: Organization | null;
  currentOrganizationMembers: OrganizationMemberWithProfile[];
  isLoading: boolean;
  error: string | null; // Store error messages as strings
}

// Define the actions interface for the organization store
export interface OrganizationActions {
  createOrganization: (name: string, visibility?: 'private' | 'public') => Promise<Organization | null>;
  fetchUserOrganizations: () => Promise<void>;
  setCurrentOrganizationId: (orgId: string | null) => void;
  fetchOrganizationDetails: (orgId: string) => Promise<void>;
  fetchCurrentOrganizationMembers: () => Promise<void>; // Fetches for currentOrganizationId
  softDeleteOrganization: (orgId: string) => Promise<boolean>; // Returns success status
  inviteUser: (emailOrUserId: string, role: string) => Promise<boolean>; // Returns true on success
  updateMemberRole: (membershipId: string, role: string) => Promise<boolean>; // Returns true on success
  removeMember: (membershipId: string) => Promise<boolean>; // Returns true on success
  acceptInvite: (token: string) => Promise<boolean>; // Returns true on success
  declineInvite: (token: string) => Promise<boolean>; // Returns true on success
  requestJoin: (orgId: string) => Promise<boolean>; // Returns true on success
  approveRequest: (membershipId: string) => Promise<boolean>; // Returns true on success
  denyRequest: (membershipId: string) => Promise<boolean>; // Returns true on success
  cancelInvite: (inviteId: string) => Promise<boolean>; // Returns true on success
  // Internal helper actions might not need to be exported if not used outside the store
  // _setError: (error: string | null) => void;
  // _setLoading: (loading: boolean) => void;
}

// Combined store type (might be useful for consumers)
export type OrganizationStoreType = OrganizationState & OrganizationActions; 