import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrganizationApiClient } from './organizations.api';
import { ApiClient } from './apiClient'; // Import base client type
import { ApiResponse, ApiError, Organization, OrganizationInsert, OrganizationUpdate, OrganizationMemberWithProfile } from '@paynless/types';

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

  // --- getOrganizationMembers --- //
  describe('getOrganizationMembers', () => {
    it('should call apiClient.get with correct endpoint and return members with profiles', async () => {
      // Define mock member data using the imported type
      const mockMembers: OrganizationMemberWithProfile[] = [
        {
          id: 'mem1', organization_id: orgId, user_id: 'user1', role: 'admin', status: 'active', created_at: 'd1',
          user_profiles: { id: 'user1', first_name: 'Admin', last_name: 'User', email: 'admin@test.com', role: 'user', created_at: 'dp1', updated_at: 'dp1', deleted_at: null, avatar_url: null } // Nested profile
        },
        {
          id: 'mem2', organization_id: orgId, user_id: 'user2', role: 'member', status: 'active', created_at: 'd2',
          user_profiles: { id: 'user2', first_name: 'Member', last_name: 'User', email: 'member@test.com', role: 'user', created_at: 'dp2', updated_at: 'dp2', deleted_at: null, avatar_url: null }
        },
         {
          id: 'mem3', organization_id: orgId, user_id: 'user3', role: 'member', status: 'pending', created_at: 'd3',
          user_profiles: null // Example of a member without a linked profile
        },
      ];
      const mockResponse: ApiResponse<OrganizationMemberWithProfile[]> = { status: 200, data: mockMembers };

      vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.getOrganizationMembers(orgId);

      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      expect(mockApiClient.get).toHaveBeenCalledWith(`organizations/${orgId}/members`);
      expect(result).toEqual(mockResponse);
      expect(result.data).toHaveLength(3);
      expect(result.data?.[0].user_profiles?.first_name).toBe('Admin'); // Check nested data
      expect(result.data?.[2].user_profiles).toBeNull();
    });

    it('should return empty array in data if API returns success with no members', async () => {
      const mockResponse: ApiResponse<OrganizationMemberWithProfile[]> = { status: 200, data: [] };

      vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.getOrganizationMembers(orgId);

      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      expect(mockApiClient.get).toHaveBeenCalledWith(`organizations/${orgId}/members`);
      expect(result).toEqual(mockResponse);
      expect(result.data).toEqual([]);
    });

    it('should return error response if organization not found (404)', async () => {
      const mockError: ApiError = { message: 'Org Not Found', code: 'PGRST116' };
      const mockResponse: ApiResponse<OrganizationMemberWithProfile[]> = { status: 404, error: mockError };

      vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.getOrganizationMembers(orgId);

      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      expect(mockApiClient.get).toHaveBeenCalledWith(`organizations/${orgId}/members`);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
      expect(result.error).toEqual(mockError);
    });

    it('should return error response if access is forbidden (403)', async () => {
      const mockError: ApiError = { message: 'Forbidden', code: 'RLS_ERROR' };
      const mockResponse: ApiResponse<OrganizationMemberWithProfile[]> = { status: 403, error: mockError };

      vi.mocked(mockApiClient.get).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.getOrganizationMembers(orgId);

      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      expect(mockApiClient.get).toHaveBeenCalledWith(`organizations/${orgId}/members`);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
      expect(result.error).toEqual(mockError);
    });
  });

  // --- inviteUserByEmail --- //
  describe('inviteUserByEmail', () => {
    const inviteEmail = 'new@example.com';
    const inviteRole = 'member';
    const endpoint = `organizations/${orgId}/invites`;
    const payload = { email: inviteEmail, role: inviteRole };

    it('should call apiClient.post with correct endpoint and payload, returning 201/204 on success', async () => {
        // The backend might return 201 with invite details or just 204 No Content.
        // Test for 201 first, can add a 204 case if needed.
        const mockInviteResponse = { id: 'new-invite-id', invited_email: inviteEmail, status: 'pending' /* ... other fields */ }; // Adjust based on actual API response
        const mockResponse: ApiResponse<any> = { status: 201, data: mockInviteResponse }; // Assuming 201 returns data

        vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

        const result = await organizationApiClient.inviteUserByEmail(orgId, inviteEmail, inviteRole);

        expect(mockApiClient.post).toHaveBeenCalledTimes(1);
        expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, payload);
        expect(result).toEqual(mockResponse);
    });

    it('should return error response if user is already member/invited (409)', async () => {
        const mockError: ApiError = { message: 'User already invited or member', code: '409' };
        const mockResponse: ApiResponse<any> = { status: 409, error: mockError };

        vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

        const result = await organizationApiClient.inviteUserByEmail(orgId, inviteEmail, inviteRole);

        expect(mockApiClient.post).toHaveBeenCalledTimes(1);
        expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, payload);
        expect(result).toEqual(mockResponse);
        expect(result.data).toBeUndefined();
        expect(result.error).toEqual(mockError);
    });

    it('should return error response if user is not admin (403)', async () => {
        const mockError: ApiError = { message: 'Forbidden', code: '403' };
        const mockResponse: ApiResponse<any> = { status: 403, error: mockError };

        vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

        const result = await organizationApiClient.inviteUserByEmail(orgId, inviteEmail, inviteRole);

        expect(mockApiClient.post).toHaveBeenCalledTimes(1);
        expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, payload);
        expect(result).toEqual(mockResponse);
        expect(result.data).toBeUndefined();
        expect(result.error).toEqual(mockError);
    });

    it('should return error response for other API failures', async () => {
        const mockError: ApiError = { message: 'Internal Server Error', code: '500' };
        const mockResponse: ApiResponse<any> = { status: 500, error: mockError };

        vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

        const result = await organizationApiClient.inviteUserByEmail(orgId, inviteEmail, inviteRole);

        expect(mockApiClient.post).toHaveBeenCalledTimes(1);
        expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, payload);
        expect(result).toEqual(mockResponse);
        expect(result.data).toBeUndefined();
        expect(result.error).toEqual(mockError);
    });
  });

  // --- inviteUserById --- //
  describe('inviteUserById', () => {
    const inviteUserId = 'user-id-to-invite';
    const inviteRole = 'member';
    const endpoint = `organizations/${orgId}/invites`;
    const payload = { invitedUserId: inviteUserId, role: inviteRole };

    it('should call apiClient.post with correct endpoint and payload, returning 201/204 on success', async () => {
        const mockInviteResponse = { id: 'new-invite-id-by-user', invited_email: 'resolved@example.com', status: 'pending' /* ... */ };
        const mockResponse: ApiResponse<any> = { status: 201, data: mockInviteResponse }; 

      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

        const result = await organizationApiClient.inviteUserById(orgId, inviteUserId, inviteRole);

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
        expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, payload);
      expect(result).toEqual(mockResponse);
    });

    it('should return error response if user is already member/invited (409)', async () => {
        const mockError: ApiError = { message: 'User already invited or member', code: '409' };
        const mockResponse: ApiResponse<any> = { status: 409, error: mockError };

        vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

        const result = await organizationApiClient.inviteUserById(orgId, inviteUserId, inviteRole);

        expect(mockApiClient.post).toHaveBeenCalledTimes(1);
        expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, payload);
        expect(result).toEqual(mockResponse);
        expect(result.data).toBeUndefined();
        expect(result.error).toEqual(mockError);
    });

    it('should return error response if invited user ID not found (404)', async () => {
        const mockError: ApiError = { message: 'Invited user ID not found', code: '404' };
        const mockResponse: ApiResponse<any> = { status: 404, error: mockError };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

        const result = await organizationApiClient.inviteUserById(orgId, inviteUserId, inviteRole);

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
        expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, payload);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
        expect(result.error).toEqual(mockError);
    });

    it('should return error response if inviting user is not admin (403)', async () => {
        const mockError: ApiError = { message: 'Forbidden', code: '403' };
        const mockResponse: ApiResponse<any> = { status: 403, error: mockError };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

        const result = await organizationApiClient.inviteUserById(orgId, inviteUserId, inviteRole);

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
        expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, payload);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
        expect(result.error).toEqual(mockError);
    });

    it('should return error response for other API failures (e.g., email lookup failed)', async () => {
        const mockError: ApiError = { message: 'Internal Server Error', code: '500' };
        const mockResponse: ApiResponse<any> = { status: 500, error: mockError };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

        const result = await organizationApiClient.inviteUserById(orgId, inviteUserId, inviteRole);

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
        expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, payload);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
        expect(result.error).toEqual(mockError);
    });
  });

  // --- acceptOrganizationInvite --- //
  describe('acceptOrganizationInvite', () => {
    const inviteToken = 'test-invite-token';
    const endpoint = `organizations/invites/${inviteToken}/accept`;
    const expectedSuccessData = { 
        message: "Invite accepted successfully.", 
        membershipId: 'new-membership-id', 
        organizationId: orgId // Expect orgId to be returned
    };

    it('should call apiClient.post with correct endpoint (no payload) and return success data', async () => {
        const mockResponse: ApiResponse<typeof expectedSuccessData> = { status: 200, data: expectedSuccessData };

        vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

        const result = await organizationApiClient.acceptOrganizationInvite(inviteToken);

        expect(mockApiClient.post).toHaveBeenCalledTimes(1);
        expect(mockApiClient.post).toHaveBeenCalledWith(`organizations/invites/${inviteToken}/accept`, undefined);
        expect(result).toEqual(mockResponse);
        expect(result.error).toBeUndefined();
    });

    it('should return error response if invite token is invalid/used/expired (404/410)', async () => {
        const mockError: ApiError = { message: 'Invite not found or used', code: '404' };
        const mockResponse: ApiResponse<void> = { status: 404, error: mockError };

        vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

        const result = await organizationApiClient.acceptOrganizationInvite(inviteToken);

        expect(mockApiClient.post).toHaveBeenCalledTimes(1);
        expect(mockApiClient.post).toHaveBeenCalledWith(`organizations/invites/${inviteToken}/accept`, undefined);
        expect(result).toEqual(mockResponse);
        expect(result.data).toBeUndefined();
        expect(result.error).toEqual(mockError);
    });

     it('should return error response if user is not the invitee (403)', async () => {
        const mockError: ApiError = { message: 'Forbidden', code: '403' };
        const mockResponse: ApiResponse<void> = { status: 403, error: mockError };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.acceptOrganizationInvite(inviteToken);

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
        expect(mockApiClient.post).toHaveBeenCalledWith(`organizations/invites/${inviteToken}/accept`, undefined);
      expect(result).toEqual(mockResponse);
        expect(result.data).toBeUndefined();
        expect(result.error).toEqual(mockError);
    });

    it('should return error response if user already member (409)', async () => {
        const mockError: ApiError = { message: 'Conflict: User already member', code: '409' };
        const mockResponse: ApiResponse<void> = { status: 409, error: mockError };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.acceptOrganizationInvite(inviteToken);

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
        expect(mockApiClient.post).toHaveBeenCalledWith(`organizations/invites/${inviteToken}/accept`, undefined);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
        expect(result.error).toEqual(mockError);
    });

    it('should return error response for other API failures', async () => {
        const mockError: ApiError = { message: 'Internal Server Error', code: '500' };
      const mockResponse: ApiResponse<void> = { status: 500, error: mockError };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.acceptOrganizationInvite(inviteToken);

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
        expect(mockApiClient.post).toHaveBeenCalledWith(`organizations/invites/${inviteToken}/accept`, undefined);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
        expect(result.error).toEqual(mockError);
    });
  });

  // --- requestToJoinOrganization --- //
  describe('requestToJoinOrganization', () => {
    const endpoint = `organizations/${orgId}/requests`;

    it('should call apiClient.post with correct endpoint and empty payload, returning 201/204', async () => {
      // Backend might return 201 with pending membership details or just 204
      const mockResponse: ApiResponse<any> = { status: 201, data: { id: 'new-request-id', status: 'pending' } }; // Example 201 response
      // OR: const mockResponse: ApiResponse<void> = { status: 204, data: undefined }; 

      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.requestToJoinOrganization(orgId);

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
      // Request endpoint doesn't typically need a body from the client
      expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, undefined); // Expecting undefined payload
      expect(result).toEqual(mockResponse);
    });

    it('should return error response if organization not found (404)', async () => {
      const mockError: ApiError = { message: 'Organization not found', code: '404' };
      const mockResponse: ApiResponse<void> = { status: 404, error: mockError };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);
      
      const result = await organizationApiClient.requestToJoinOrganization(orgId);

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
      expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, undefined);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
    });

    it('should return error response if user already member or request pending (409)', async () => {
      const mockError: ApiError = { message: 'Already member or request pending', code: '409' };
      const mockResponse: ApiResponse<void> = { status: 409, error: mockError };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);
      
      const result = await organizationApiClient.requestToJoinOrganization(orgId);

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
      expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, undefined);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
    });
    
    it('should return error response if org is not public or not accepting requests (403)', async () => {
      const mockError: ApiError = { message: 'Organization not accepting requests', code: '403' };
      const mockResponse: ApiResponse<void> = { status: 403, error: mockError };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);
      
      const result = await organizationApiClient.requestToJoinOrganization(orgId);

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
      expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, undefined);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
    });
  });

  // --- approveJoinRequest --- //
  describe('approveJoinRequest', () => {
    const membershipId = 'test-membership-id';
    const endpoint = `organizations/members/${membershipId}/approve`; // Endpoint defined in test plan, but backend uses PUT .../status
    const statusEndpoint = `organizations/members/${membershipId}/status`; // Actual backend endpoint

    it('should call the correct endpoint on successful approval', async () => {
        mockApiClient.put.mockResolvedValue({ status: 204, data: null }); // Approve might return 204 or updated member
        await organizationApiClient.approveJoinRequest(membershipId);
        expect(mockApiClient.put).toHaveBeenCalledWith(statusEndpoint, { status: 'active' }); // Assert PUT .../status with status: active
    });

    // --- Add Deny Test Case --- 
    it('should call the correct endpoint on successful denial', async () => {
        mockApiClient.put.mockResolvedValue({ status: 204, data: null }); // Deny returns 204
        // Assuming a denyJoinRequest function exists or will be added
        await organizationApiClient.denyJoinRequest(membershipId); 
        expect(mockApiClient.put).toHaveBeenCalledWith(statusEndpoint, { status: 'removed' }); // Assert PUT .../status with status: removed
    });
    // --- End Add Deny Test Case ---

    it('should throw error if membership not found (404)', async () => {
        // Create a plain object matching the ApiError structure
        const mockErrorObject: ApiError = { message: 'Membership not found', code: '404' }; 
        // Mock resolved value with an error response, not a rejection
        const mockResponse: ApiResponse<void> = { status: 404, error: mockErrorObject }; 
        mockApiClient.put.mockResolvedValue(mockResponse);

        // Call the function and assert the response object
        const result = await organizationApiClient.approveJoinRequest(membershipId);
        expect(result.status).toBe(404);
        expect(result.error).toEqual(mockErrorObject);
        expect(result.data).toBeUndefined();
    });

    it('should return error response if approver lacks permissions (403)', async () => {
      const mockError: ApiError = { message: 'Forbidden', code: '403' };
      const mockResponse: ApiResponse<void> = { status: 403, error: mockError };

      // Use the corrected endpoint for the mock check
      vi.mocked(mockApiClient.put).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.approveJoinRequest(membershipId);

      expect(mockApiClient.put).toHaveBeenCalledTimes(1);
      // Assert it was called with the correct endpoint and payload
      expect(mockApiClient.put).toHaveBeenCalledWith(statusEndpoint, { status: 'active' }); 
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
    });

    it('should return error response if membership already active (e.g., 409)', async () => {
      const mockError: ApiError = { message: 'Member already active', code: '409' }; // Or maybe a 400 Bad Request
      const mockResponse: ApiResponse<void> = { status: 409, error: mockError };

      // Use the corrected endpoint for the mock check
      vi.mocked(mockApiClient.put).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.approveJoinRequest(membershipId);

      expect(mockApiClient.put).toHaveBeenCalledTimes(1);
       // Assert it was called with the correct endpoint and payload
      expect(mockApiClient.put).toHaveBeenCalledWith(statusEndpoint, { status: 'active' });
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
    });

  });

  // --- cancelInvite --- //
  describe('cancelInvite', () => {
    const inviteId = 'invite-to-cancel-456';
    // Assuming the client needs the orgId for the endpoint
    const endpoint = `organizations/${orgId}/invites/${inviteId}`; 

    it('should call apiClient.delete with correct endpoint, returning 204', async () => {
      const mockResponse: ApiResponse<void> = { status: 204, data: undefined };

      vi.mocked(mockApiClient.delete).mockResolvedValue(mockResponse);

      // Note: cancelInvite might need orgId depending on its signature
      const result = await organizationApiClient.cancelInvite(orgId, inviteId);

      expect(mockApiClient.delete).toHaveBeenCalledTimes(1);
      expect(mockApiClient.delete).toHaveBeenCalledWith(endpoint);
      expect(result).toEqual(mockResponse);
      expect(result.error).toBeUndefined();
    });

    it('should return error response if invite not found or not pending (404)', async () => {
      const mockError: ApiError = { message: 'Invite not found or not pending', code: '404' };
      const mockResponse: ApiResponse<void> = { status: 404, error: mockError };

      vi.mocked(mockApiClient.delete).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.cancelInvite(orgId, inviteId);

      expect(mockApiClient.delete).toHaveBeenCalledTimes(1);
      expect(mockApiClient.delete).toHaveBeenCalledWith(endpoint);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
    });

    it('should return error response if canceller lacks permissions (403)', async () => {
      const mockError: ApiError = { message: 'Forbidden', code: '403' };
      const mockResponse: ApiResponse<void> = { status: 403, error: mockError };

      vi.mocked(mockApiClient.delete).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.cancelInvite(orgId, inviteId);

      expect(mockApiClient.delete).toHaveBeenCalledTimes(1);
      expect(mockApiClient.delete).toHaveBeenCalledWith(endpoint);
      expect(result).toEqual(mockResponse);
      expect(result.data).toBeUndefined();
    });

  });

  // --- updateMemberRole --- //
  describe('updateMemberRole', () => {
    const membershipId = 'mem-to-update-role-456';
    const newRole = 'admin';

    it('should call apiClient.put with correct endpoint and role payload', async () => {
      const expectedPayload = { role: newRole };
      const mockResponse: ApiResponse<void> = { status: 204, data: undefined };
      vi.mocked(mockApiClient.put).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.updateMemberRole(membershipId, newRole);

      expect(mockApiClient.put).toHaveBeenCalledTimes(1);
      expect(mockApiClient.put).toHaveBeenCalledWith(`organizations/members/${membershipId}/role`, expectedPayload);
      expect(result).toEqual(mockResponse);
    });

    it('should return error response if membership not found (404)', async () => {
      const expectedPayload = { role: newRole };
      const mockError: ApiError = { message: 'Membership not found', code: 'NOT_FOUND' };
      const mockResponse: ApiResponse<void> = { status: 404, error: mockError };
      vi.mocked(mockApiClient.put).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.updateMemberRole(membershipId, newRole);

      expect(mockApiClient.put).toHaveBeenCalledTimes(1);
      expect(mockApiClient.put).toHaveBeenCalledWith(`organizations/members/${membershipId}/role`, expectedPayload);
      expect(result).toEqual(mockResponse);
    });

    it('should return error response if updater lacks permissions (403)', async () => {
      const expectedPayload = { role: newRole };
      const mockError: ApiError = { message: 'Forbidden', code: 'RLS_ERROR' };
      const mockResponse: ApiResponse<void> = { status: 403, error: mockError };
      vi.mocked(mockApiClient.put).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.updateMemberRole(membershipId, newRole);

      expect(mockApiClient.put).toHaveBeenCalledTimes(1);
      expect(mockApiClient.put).toHaveBeenCalledWith(`organizations/members/${membershipId}/role`, expectedPayload);
      expect(result).toEqual(mockResponse);
    });
    
    it('should return error response if attempting to remove last admin (e.g., 400)', async () => {
      const expectedPayload = { role: 'member' }; // Trying to downgrade last admin
      const mockError: ApiError = { message: 'Cannot remove last admin', code: 'LAST_ADMIN_ERROR' };
      const mockResponse: ApiResponse<void> = { status: 400, error: mockError }; // Or 403?
      vi.mocked(mockApiClient.put).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.updateMemberRole(membershipId, 'member');

      expect(mockApiClient.put).toHaveBeenCalledTimes(1);
      expect(mockApiClient.put).toHaveBeenCalledWith(`organizations/members/${membershipId}/role`, expectedPayload);
      expect(result).toEqual(mockResponse);
    });
  });

  // --- removeMember --- //
  describe('removeMember', () => {
    const membershipId = 'mem-to-remove-789';

    it('should call apiClient.delete with correct endpoint', async () => {
      const mockResponse: ApiResponse<void> = { status: 204, data: undefined };
      vi.mocked(mockApiClient.delete).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.removeMember(membershipId);

      expect(mockApiClient.delete).toHaveBeenCalledTimes(1);
      expect(mockApiClient.delete).toHaveBeenCalledWith(`organizations/members/${membershipId}`);
      expect(result).toEqual(mockResponse);
    });

    it('should return error response if membership not found (404)', async () => {
      const mockError: ApiError = { message: 'Membership not found', code: 'NOT_FOUND' };
      const mockResponse: ApiResponse<void> = { status: 404, error: mockError };
      vi.mocked(mockApiClient.delete).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.removeMember(membershipId);

      expect(mockApiClient.delete).toHaveBeenCalledTimes(1);
      expect(mockApiClient.delete).toHaveBeenCalledWith(`organizations/members/${membershipId}`);
      expect(result).toEqual(mockResponse);
    });

    it('should return error response if remover lacks permissions (403)', async () => {
      const mockError: ApiError = { message: 'Forbidden', code: 'RLS_ERROR' };
      const mockResponse: ApiResponse<void> = { status: 403, error: mockError };
      vi.mocked(mockApiClient.delete).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.removeMember(membershipId);

      expect(mockApiClient.delete).toHaveBeenCalledTimes(1);
      expect(mockApiClient.delete).toHaveBeenCalledWith(`organizations/members/${membershipId}`);
      expect(result).toEqual(mockResponse);
    });
    
     it('should return error response if attempting to remove last admin (e.g., 400)', async () => {
      const mockError: ApiError = { message: 'Cannot remove last admin', code: 'LAST_ADMIN_ERROR' };
      const mockResponse: ApiResponse<void> = { status: 400, error: mockError };
      vi.mocked(mockApiClient.delete).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.removeMember(membershipId);

      expect(mockApiClient.delete).toHaveBeenCalledTimes(1);
      expect(mockApiClient.delete).toHaveBeenCalledWith(`organizations/members/${membershipId}`);
      expect(result).toEqual(mockResponse);
    });
  });

  // --- deleteOrganization (soft delete) --- //
  describe('deleteOrganization', () => {
    it('should call apiClient.delete with correct organization endpoint', async () => {
      const mockResponse: ApiResponse<void> = { status: 204, data: undefined };
      vi.mocked(mockApiClient.delete).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.deleteOrganization(orgId);

      expect(mockApiClient.delete).toHaveBeenCalledTimes(1);
      expect(mockApiClient.delete).toHaveBeenCalledWith(`organizations/${orgId}`);
      expect(result).toEqual(mockResponse);
    });

    it('should return error response if organization not found (404)', async () => {
      const mockError: ApiError = { message: 'Organization not found', code: 'NOT_FOUND' };
      const mockResponse: ApiResponse<void> = { status: 404, error: mockError };
      vi.mocked(mockApiClient.delete).mockResolvedValue(mockResponse);

      const result = await organizationApiClient.deleteOrganization(orgId);

      expect(mockApiClient.delete).toHaveBeenCalledTimes(1);
      expect(mockApiClient.delete).toHaveBeenCalledWith(`organizations/${orgId}`);
      expect(result).toEqual(mockResponse);
    });

    it('should return error response if deleter lacks permissions (403)', async () => {
       const mockError: ApiError = { message: 'Forbidden - Only admins can delete', code: 'RLS_ERROR' };
       const mockResponse: ApiResponse<void> = { status: 403, error: mockError };
       vi.mocked(mockApiClient.delete).mockResolvedValue(mockResponse);

       const result = await organizationApiClient.deleteOrganization(orgId);

       expect(mockApiClient.delete).toHaveBeenCalledTimes(1);
       expect(mockApiClient.delete).toHaveBeenCalledWith(`organizations/${orgId}`);
       expect(result).toEqual(mockResponse);
    });
  });

}); 