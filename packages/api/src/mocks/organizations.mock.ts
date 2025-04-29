import { vi } from 'vitest';
import type { Organization, OrganizationMember, ApiResponse } from '@paynless/types';

// Mock implementations using vi.fn()
// Define expected argument types and return shapes based on common patterns
export const mockGetCurrentOrganization = vi.fn<[], Promise<ApiResponse<Organization | null>>>();
export const mockUpdateOrganization = vi.fn<[Partial<Organization>], Promise<ApiResponse<Organization>>>();
export const mockGetOrganizationMembers = vi.fn<[], Promise<ApiResponse<OrganizationMember[]>>>();
export const mockRemoveOrganizationMember = vi.fn<[string], Promise<ApiResponse<void>>>(); // Arg: userId
export const mockLeaveOrganization = vi.fn<[], Promise<ApiResponse<void>>>();
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
export const defaultMockMembers: OrganizationMember[] = [
    { 
        organization_id: 'org-123', 
        user_id: 'user-owner-1', 
        role: 'owner', 
        id: 'om-1',
        status: 'active',
        created_at: new Date().toISOString(),
    },
    { 
        organization_id: 'org-123',
        user_id: 'user-member-2',
        role: 'member',
        id: 'om-2',
        status: 'active',
        created_at: new Date().toISOString(),
    },
]

// Reset function
export const resetOrganizationMocks = () => {
  mockGetCurrentOrganization.mockReset();
  mockUpdateOrganization.mockReset();
  mockGetOrganizationMembers.mockReset();
  mockRemoveOrganizationMember.mockReset();
  mockLeaveOrganization.mockReset();

  // Set default successful resolutions with error: undefined and status code
  mockGetCurrentOrganization.mockResolvedValue({ status: 200, data: { ...defaultMockOrganization }, error: undefined });
  mockUpdateOrganization.mockResolvedValue({ status: 200, data: { ...defaultMockOrganization }, error: undefined });
  mockGetOrganizationMembers.mockResolvedValue({ status: 200, data: [...defaultMockMembers], error: undefined });
  mockRemoveOrganizationMember.mockResolvedValue({ status: 204, data: undefined, error: undefined }); // 204 for successful void response
  mockLeaveOrganization.mockResolvedValue({ status: 204, data: undefined, error: undefined }); // 204 for successful void response
};

// Initialize with default mocks
resetOrganizationMocks(); 