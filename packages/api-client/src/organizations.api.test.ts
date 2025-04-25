import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrganizationApiClient } from './organizations.api';
import { ApiClient } from './apiClient'; // Import base client type
import { ApiResponse, ApiError, Organization, OrganizationInsert, OrganizationUpdate } from '@paynless/types';

// --- Mock the ApiClient dependency directly --- 
const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  // Add other methods if OrganizationApiClient uses them
} as unknown as ApiClient; // Cast to satisfy constructor, focusing on used methods

// Instantiate the client under test, injecting the mock dependency
const organizationApiClient = new OrganizationApiClient(mockApiClient);

describe('OrganizationApiClient', () => {
  const userId = 'test-user-id';
  const orgId = 'test-org-id';

  beforeEach(() => {
    // Reset mocks on the mock object
    vi.mocked(mockApiClient.get).mockReset();
    vi.mocked(mockApiClient.post).mockReset();
    vi.mocked(mockApiClient.put).mockReset();
    vi.mocked(mockApiClient.delete).mockReset();
  });

  // --- createOrganization --- //
  describe('createOrganization', () => {
    it('should call apiClient.post with correct endpoint and data, returning org', async () => {
      const orgName = 'New Test Org';
      const visibility = 'private';
      const inputData: Pick<OrganizationInsert, 'name' | 'visibility'> = { name: orgName, visibility };
      const expectedPayload = { name: orgName, visibility };
      const mockReturnedOrg: Organization = {
        id: orgId,
        name: orgName,
        visibility: visibility,
        created_at: new Date().toISOString(),
        deleted_at: null
      };
      const mockResponse: ApiResponse<Organization> = { status: 201, data: mockReturnedOrg };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.createOrganization(inputData);

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
      expect(mockApiClient.post).toHaveBeenCalledWith('organizations', expectedPayload);
      expect(result).toEqual(mockResponse);
    });

     it('should call apiClient.post with default visibility if not provided', async () => {
      const orgName = 'Default Private Org';
      const inputData = { name: orgName }; // No visibility
      const expectedPayload = { name: orgName, visibility: 'private' };
      const mockReturnedOrg: Organization = {
        id: orgId,
        name: orgName,
        visibility: 'private',
        created_at: new Date().toISOString(),
        deleted_at: null
      };
       const mockResponse: ApiResponse<Organization> = { status: 201, data: mockReturnedOrg };

       vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

       // Adjust based on how createOrganization actually handles optional visibility
       // If it requires the property, provide it:
       // const result = await organizationApiClient.createOrganization({ ...inputData, visibility: 'private' });
       // If it allows omitting it, the input is fine:
       const result = await organizationApiClient.createOrganization(inputData as any); // Use type assertion if needed

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
      expect(mockApiClient.post).toHaveBeenCalledWith('organizations', expectedPayload); // Verify default is sent
      expect(result).toEqual(mockResponse);
    });

    it('should return error response if apiClient.post fails', async () => {
      const orgName = 'Fail Org';
      // Provide minimal valid input (adjust if visibility is optional)
      const inputData: Pick<OrganizationInsert, 'name' | 'visibility'> = { name: orgName, visibility: 'private' };
      const mockError: ApiError = { message: 'Create failed', code: '500' };
      const mockResponse: ApiResponse<Organization> = { status: 500, error: mockError };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.createOrganization(inputData);

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
    });
  });

  // --- updateOrganization --- //
  describe('updateOrganization', () => {
    it('should call apiClient.put with correct endpoint and data, returning org', async () => {
      const updateData: OrganizationUpdate = { name: 'Updated Org Name', visibility: 'public' };
      const mockReturnedOrg: Organization = {
        id: orgId,
        name: 'Updated Org Name',
        visibility: 'public',
        created_at: new Date().toISOString(),
        deleted_at: null
      };
      const mockResponse: ApiResponse<Organization> = { status: 200, data: mockReturnedOrg };

       vi.mocked(mockApiClient.put).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.updateOrganization(orgId, updateData);

      expect(mockApiClient.put).toHaveBeenCalledTimes(1);
      expect(mockApiClient.put).toHaveBeenCalledWith(`organizations/${orgId}`, updateData);
      expect(result).toEqual(mockResponse);
    });

    it('should return error response if apiClient.put fails', async () => {
      const updateData: OrganizationUpdate = { name: 'Fail Update' };
      const mockError: ApiError = { message: 'Update failed', code: '403' };
      const mockResponse: ApiResponse<Organization> = { status: 403, error: mockError };

       vi.mocked(mockApiClient.put).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.updateOrganization(orgId, updateData);

      expect(mockApiClient.put).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
    });
  });

  // --- listUserOrganizations --- //
  describe('listUserOrganizations', () => {
    it('should call apiClient.get with correct endpoint and return orgs', async () => {
       const mockOrgs: Organization[] = [
        { id: orgId, name: 'Org 1', visibility: 'private', created_at: 'date1', deleted_at: null },
        { id: 'org2', name: 'Org 2', visibility: 'private', created_at: 'date2', deleted_at: null }
      ];
       const mockResponse: ApiResponse<Organization[]> = { status: 200, data: mockOrgs }; // Correct data type

       vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.listUserOrganizations(userId);

      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      expect(mockApiClient.get).toHaveBeenCalledWith('organizations');
      expect(result).toEqual(mockResponse);
    });

    it('should return empty array in data if API returns success with no orgs', async () => {
      const mockResponse: ApiResponse<Organization[]> = { status: 200, data: [] }; // Correct data type

      vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.listUserOrganizations(userId);

      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      expect(mockApiClient.get).toHaveBeenCalledWith('organizations');
      expect(result).toEqual(mockResponse);
      expect(result.data).toEqual([]);
    });

    it('should return error response if apiClient.get fails', async () => {
      const mockError: ApiError = { message: 'List failed', code: 'AUTH_ERROR' };
      const mockResponse: ApiResponse<Organization[]> = { status: 401, error: mockError }; // Correct data type

      vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.listUserOrganizations(userId);

      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
    });
  });

  // --- getOrganizationDetails --- //
  describe('getOrganizationDetails', () => {
    it('should call apiClient.get with correct endpoint and return organization data', async () => {
      const mockOrg: Organization = {
        id: orgId,
        name: 'Test Org Details',
        visibility: 'private',
        created_at: 'date1',
        deleted_at: null
      };
      const mockResponse: ApiResponse<Organization> = { status: 200, data: mockOrg };

      vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.getOrganizationDetails(orgId);

      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      expect(mockApiClient.get).toHaveBeenCalledWith(`organizations/${orgId}`);
      expect(result).toEqual(mockResponse);
    });

    it('should return error response if organization not found (404)', async () => {
      const mockError: ApiError = { message: 'Not Found', code: 'PGRST116' }; // Example Supabase code
      const mockResponse: ApiResponse<Organization> = { status: 404, error: mockError };

      vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.getOrganizationDetails(orgId);

      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      expect(mockApiClient.get).toHaveBeenCalledWith(`organizations/${orgId}`);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
      expect(result.error).toEqual(mockError);
    });

    it('should return error response if apiClient.get fails for other reasons', async () => {
      const mockError: ApiError = { message: 'Internal Server Error', code: '500' };
      const mockResponse: ApiResponse<Organization> = { status: 500, error: mockError };

      vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.getOrganizationDetails(orgId);

      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      expect(mockApiClient.get).toHaveBeenCalledWith(`organizations/${orgId}`);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
      expect(result.error).toEqual(mockError);
    });
  });

  // TODO: Add tests for getOrganizationMembers
  // TODO: Add tests for inviteUserToOrganization (Likely apiClient.post(`organizations/${orgId}/invites`, { emailOrUserId, role }))
  // TODO: Add tests for acceptOrganizationInvite (Likely apiClient.post(`organizations/invites/accept`, { inviteTokenOrId }))
  // TODO: Add tests for requestToJoinOrganization (Likely apiClient.post(`organizations/${orgId}/requests`))
  // TODO: Add tests for approveJoinRequest (Likely apiClient.put(`organizations/members/${membershipId}/approve`, {}))
  // TODO: Add tests for updateMemberRole (Likely apiClient.put(`organizations/members/${membershipId}/role`, { role }))
  // TODO: Add tests for removeMember (Likely apiClient.delete(`organizations/members/${membershipId}`))
  // TODO: Add tests for deleteOrganization (soft delete) (Likely apiClient.delete(`organizations/${orgId}`))

}); 