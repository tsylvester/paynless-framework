import { vi } from 'vitest';
// Import all needed types directly from the package
import type { 
    Organization, 
    ApiResponse, 
    OrganizationMemberWithProfile, 
    PendingOrgItems 
} from '@paynless/types';

// Mock implementations using vi.fn()
// Define expected argument types and return shapes based on common patterns
export const mockListUserOrganizations = vi.fn<[string], Promise<ApiResponse<Organization[]>>>(); // Arg: userId
export const mockSetCurrentOrganizationSettings = vi.fn<[string], Promise<ApiResponse<Organization>>>(); // Arg: orgId
export const mockCreateOrganization = vi.fn<[Pick<Organization, 'name' | 'visibility'>], Promise<ApiResponse<Organization>>>();
export const mockDeleteOrganization = vi.fn<[string], Promise<ApiResponse<void>>>(); // Arg: orgId
export const mockGetCurrentOrganization = vi.fn<[], Promise<ApiResponse<Organization | null>>>();
export const mockUpdateOrganization = vi.fn<[string, Partial<Organization>], Promise<ApiResponse<Organization>>>(); // Args: orgId, data
// Update mockGetOrganizationMembers signature if it returns members with profiles
export const mockGetOrganizationMembers = vi.fn<[string], Promise<ApiResponse<OrganizationMemberWithProfile[]>>>(); // Arg: orgId
export const mockRemoveOrganizationMember = vi.fn<[string, string], Promise<ApiResponse<void>>>(); // Args: orgId, userId
export const mockLeaveOrganization = vi.fn<[string], Promise<ApiResponse<void>>>(); // Arg: orgId
// Add mock for accepting invite
export const mockAcceptOrganizationInvite = vi.fn<[string], Promise<ApiResponse<{ success: boolean }>>>(); // Arg: inviteToken
// Add mock for declining invite
export const mockDeclineOrganizationInvite = vi.fn<[string], Promise<ApiResponse<{ success: boolean }>>>(); // Arg: inviteToken
// Add mock for requesting to join
export const mockRequestToJoinOrganization = vi.fn<[string], Promise<ApiResponse<void>>>(); // Arg: orgId
// Add mock for approving join request
export const mockApproveJoinRequest = vi.fn<[string], Promise<ApiResponse<void>>>(); // Arg: membershipId
// Add mock for denying join request
export const mockDenyJoinRequest = vi.fn<[string], Promise<ApiResponse<void>>>(); // Arg: membershipId
// Add mock for cancelling an invite
export const mockCancelInvite = vi.fn<[string, string], Promise<ApiResponse<void>>>(); // Args: orgId, inviteId
// Add mock for inviting user by email
export const mockInviteUserByEmail = vi.fn<[string, string, string], Promise<ApiResponse<any>>>(); // Args: orgId, email, role
// Add mock for getting pending invites/requests
export const mockGetPendingItems = vi.fn<[string], Promise<ApiResponse<PendingOrgItems>>>(); // Args: orgId
// Add more mocks as needed (e.g., for handling invites, roles)

// Default mock data aligned with actual type from linter error
export const defaultMockOrganization: Organization = {
  id: 'org-123',
  name: 'Default Mock Inc.',
  created_at: new Date().toISOString(),
  visibility: 'private',
  deleted_at: null,
  allow_member_chat_creation: true,
  token_usage_policy: 'member_tokens',
};

// Correct defaultMockMembers based on actual type from linter error
// Update this if mockGetOrganizationMembers returns OrganizationMemberWithProfile
export const defaultMockMembers: OrganizationMemberWithProfile[] = [ // Use OrganizationMemberWithProfile
    { 
        organization_id: 'org-123', 
        user_id: 'user-owner-1', 
        role: 'owner', 
        id: 'om-1',
        status: 'active',
        created_at: new Date().toISOString(),
        user_profiles: { // Add user_profiles object
             id: 'user-owner-1', 
             first_name: 'Owner',
             last_name: 'User',
             updated_at: new Date().toISOString(), 
             created_at: new Date().toISOString(),
             role: 'user',
             last_selected_org_id: null,
             chat_context: null,
             profile_privacy_setting: 'private',
             is_subscribed_to_newsletter: false,
             has_seen_welcome_modal: false,
          }
    },
    { 
        organization_id: 'org-123',
        user_id: 'user-member-2',
        role: 'member',
        id: 'om-2',
        status: 'active',
        created_at: new Date().toISOString(),
        user_profiles: { // Add user_profiles object
             id: 'user-member-2', 
             first_name: 'Member',
             last_name: 'User',
             updated_at: new Date().toISOString(), 
             created_at: new Date().toISOString(),
             role: 'user',
             last_selected_org_id: null,
             chat_context: null,
             profile_privacy_setting: 'private',
             is_subscribed_to_newsletter: false,
             has_seen_welcome_modal: false,
          }
    },
]

// Reset function
export const resetOrganizationMocks = () => {
  mockListUserOrganizations.mockReset();
  mockSetCurrentOrganizationSettings.mockReset();
  mockCreateOrganization.mockReset();
  mockDeleteOrganization.mockReset();
  mockGetCurrentOrganization.mockReset();
  mockUpdateOrganization.mockReset();
  mockGetOrganizationMembers.mockReset();
  mockRemoveOrganizationMember.mockReset();
  mockLeaveOrganization.mockReset();
  mockAcceptOrganizationInvite.mockReset();
  mockDeclineOrganizationInvite.mockReset();
  mockRequestToJoinOrganization.mockReset();
  mockApproveJoinRequest.mockReset();
  mockDenyJoinRequest.mockReset();
  mockCancelInvite.mockReset();
  mockInviteUserByEmail.mockReset();
  mockGetPendingItems.mockReset();

  // Set default successful resolutions with error: undefined and status code
  mockListUserOrganizations.mockResolvedValue({ status: 200, data: [{ ...defaultMockOrganization }], error: undefined });
  mockSetCurrentOrganizationSettings.mockResolvedValue({ status: 200, data: { ...defaultMockOrganization }, error: undefined });
  mockCreateOrganization.mockResolvedValue({ status: 201, data: { ...defaultMockOrganization, id: 'new-org-id' }, error: undefined });
  mockDeleteOrganization.mockResolvedValue({ status: 204, data: undefined, error: undefined }); // 204 for successful void response
  mockGetCurrentOrganization.mockResolvedValue({ status: 200, data: { ...defaultMockOrganization }, error: undefined });
  mockUpdateOrganization.mockResolvedValue({ status: 200, data: { ...defaultMockOrganization }, error: undefined });
  mockGetOrganizationMembers.mockResolvedValue({ status: 200, data: [...defaultMockMembers], error: undefined });
  mockRemoveOrganizationMember.mockResolvedValue({ status: 204, data: undefined, error: undefined }); // 204 for successful void response
  mockLeaveOrganization.mockResolvedValue({ status: 204, data: undefined, error: undefined }); // 204 for successful void response
  mockAcceptOrganizationInvite.mockResolvedValue({ status: 200, data: { success: true }, error: undefined }); // Default success for accept
  mockDeclineOrganizationInvite.mockResolvedValue({ status: 200, data: { success: true }, error: undefined }); // Default success for decline
  mockRequestToJoinOrganization.mockResolvedValue({ status: 200, data: undefined, error: undefined }); // Default success for request join
  mockApproveJoinRequest.mockResolvedValue({ status: 200, data: undefined, error: undefined }); // Default success for approve join
  mockDenyJoinRequest.mockResolvedValue({ status: 200, data: undefined, error: undefined }); // Default success for deny join
  mockCancelInvite.mockResolvedValue({ status: 200, data: undefined, error: undefined }); // Default success for cancel invite
  mockInviteUserByEmail.mockResolvedValue({ status: 201, data: { id: 'new-invite-123' }, error: undefined }); // Default success for invite by email
  mockGetPendingItems.mockResolvedValue({ status: 200, data: { invites: [], requests: [] }, error: undefined }); // Default success for get pending (empty lists)

};

// Initialize with default mocks
// resetOrganizationMocks(); 