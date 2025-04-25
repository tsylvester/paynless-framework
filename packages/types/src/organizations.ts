import type { Database } from '@paynless/db-types';

// Base types derived from the generated Database type
type OrganizationsTable = Database['public']['Tables']['organizations'];
type OrganizationMembersTable = Database['public']['Tables']['organization_members'];

// --- Organization Types ---
export type Organization = OrganizationsTable['Row'];
export type OrganizationInsert = OrganizationsTable['Insert'];
export type OrganizationUpdate = OrganizationsTable['Update'];

// --- Organization Member Types ---
export type OrganizationMember = OrganizationMembersTable['Row'];
export type OrganizationMemberInsert = OrganizationMembersTable['Insert'];
export type OrganizationMemberUpdate = OrganizationMembersTable['Update'];

// TODO: Define composite types if needed, e.g., MemberWithProfile
// export type OrganizationMemberWithProfile = OrganizationMember & {
//   profile: Database['public']['Tables']['user_profiles']['Row'] | null;
// }; 