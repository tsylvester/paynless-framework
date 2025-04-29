import { vi } from 'vitest';
import type { Organization, OrganizationMember, ApiResponse, OrganizationMemberWithProfile } from '@paynless/types';

// Mock implementations using vi.fn()
// Define expected argument types and return shapes based on common patterns
export const mockListUserOrganizations = vi.fn<[string], Promise<ApiResponse<Organization[]>>>(); // Arg: userId
export const mockGetOrganizationDetails = vi.fn<[string], Promise<ApiResponse<Organization>>>(); // Arg: orgId
export const mockCreateOrganization = vi.fn<[Pick<Organization, 'name' | 'visibility'>], Promise<ApiResponse<Organization>>>();
export const mockDeleteOrganization = vi.fn<[string], Promise<ApiResponse<void>>>(); // Arg: orgId
export const mockGetCurrentOrganization = vi.fn<[], Promise<ApiResponse<Organization | null>>>();
export const mockUpdateOrganization = vi.fn<[string, Partial<Organization>], Promise<ApiResponse<Organization>>>(); // Args: orgId, data
// Update mockGetOrganizationMembers signature if it returns members with profiles
export const mockGetOrganizationMembers = vi.fn<[string], Promise<ApiResponse<OrganizationMemberWithProfile[]>>>(); // Arg: orgId
export const mockRemoveOrganizationMember = vi.fn<[string, string], Promise<ApiResponse<void>>>(); // Args: orgId, userId
export const mockLeaveOrganization = vi.fn<[string], Promise<ApiResponse<void>>>(); // Arg: orgId
// Add more mocks as needed (e.g., for handling invites, roles)

// Default mock data aligned with actual type from linter error
export const defaultMockOrganization: Organization = {
  id: 'org-123',
  name: 'Default Mock Inc.',
  created_at: new Date().toISOString(),
  visibility: 'private',
  deleted_at: null,
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
             role: 'user'
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
             role: 'user'
          }
    },
]

// Reset function
export const resetOrganizationMocks = () => {
  mockListUserOrganizations.mockReset();
  mockGetOrganizationDetails.mockReset();
  mockCreateOrganization.mockReset();
  mockDeleteOrganization.mockReset();
  mockGetCurrentOrganization.mockReset();
  mockUpdateOrganization.mockReset();
  mockGetOrganizationMembers.mockReset();
  mockRemoveOrganizationMember.mockReset();
  mockLeaveOrganization.mockReset();

  // Set default successful resolutions with error: undefined and status code
  mockListUserOrganizations.mockResolvedValue({ status: 200, data: [{ ...defaultMockOrganization }], error: undefined });
  mockGetOrganizationDetails.mockResolvedValue({ status: 200, data: { ...defaultMockOrganization }, error: undefined });
  mockCreateOrganization.mockResolvedValue({ status: 201, data: { ...defaultMockOrganization, id: 'new-org-id' }, error: undefined });
  mockDeleteOrganization.mockResolvedValue({ status: 204, data: undefined, error: undefined }); // 204 for successful void response
  mockGetCurrentOrganization.mockResolvedValue({ status: 200, data: { ...defaultMockOrganization }, error: undefined });
  mockUpdateOrganization.mockResolvedValue({ status: 200, data: { ...defaultMockOrganization }, error: undefined });
  mockGetOrganizationMembers.mockResolvedValue({ status: 200, data: [...defaultMockMembers], error: undefined });
  mockRemoveOrganizationMember.mockResolvedValue({ status: 204, data: undefined, error: undefined }); // 204 for successful void response
  mockLeaveOrganization.mockResolvedValue({ status: 204, data: undefined, error: undefined }); // 204 for successful void response
};

// Initialize with default mocks
// resetOrganizationMocks(); 