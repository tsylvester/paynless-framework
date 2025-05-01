import { ApiClient } from './apiClient'; // <<< Import base ApiClient
import { 
  ApiResponse, 
  Organization, 
  OrganizationInsert, 
  OrganizationUpdate, 
  OrganizationMemberWithProfile, 
  Invite, 
  PendingOrgItems, 
  PaginatedOrganizationsResponse,
  PendingInviteWithInviter,
  PendingRequestWithDetails
} from '@paynless/types'; // <<< Import types

export class OrganizationApiClient {
  // Store the main ApiClient instance
  private client: ApiClient;

  // Constructor expects the main ApiClient
  constructor(client: ApiClient) {
    this.client = client;
  }

  /**
   * Creates a new organization.
   * Uses the main client's post method.
   * @param orgData - The data for the new organization (name, visibility).
   * @returns The ApiResponse containing the newly created organization details or an error.
   */
  async createOrganization(
    orgData: Pick<OrganizationInsert, 'name' | 'visibility'>
  ): Promise<ApiResponse<Organization>> {
    const payload = {
        name: orgData.name,
        visibility: orgData.visibility ?? 'private', // Default visibility
    };
    // Use the injected ApiClient's post method
    return this.client.post<Organization, typeof payload>('organizations', payload);
  }

  /**
   * Updates an existing organization's details.
   * Uses the main client's put method.
   * @param orgId - The ID of the organization to update.
   * @param updateData - The fields to update.
   * @returns The ApiResponse containing the updated organization details or an error.
   */
  async updateOrganization(
    orgId: string, 
    updateData: OrganizationUpdate
  ): Promise<ApiResponse<Organization>> {
     // Use the injected ApiClient's put method
    return this.client.put<Organization, OrganizationUpdate>(`organizations/${orgId}`, updateData);
  }

  /**
   * Lists non-deleted organizations the current user is an active member of, supporting pagination.
   * Uses the main client's get method.
   * @param page - Optional page number for pagination.
   * @param limit - Optional page size limit for pagination.
   * @returns An ApiResponse containing paginated organization details and total count, or an error.
   */
  async listUserOrganizations(
      page?: number, 
      limit?: number
  ): Promise<ApiResponse<PaginatedOrganizationsResponse>> {
    // Build query parameters object
    const searchParams = new URLSearchParams();
    if (page !== undefined) searchParams.append('page', String(page));
    if (limit !== undefined) searchParams.append('limit', String(limit));

    // Construct URL with query parameters
    const queryString = searchParams.toString();
    const url = queryString ? `organizations?${queryString}` : 'organizations';
    
    // Use the injected ApiClient's get method with the constructed URL
    // Explicitly type the generic parameter for the get method
    const response = await this.client.get<PaginatedOrganizationsResponse>(url); 
    
    // Ensure data structure is correct on success (Optional, but good practice)
    if (response.status >= 200 && response.status < 300 && !response.error && response.data) {
        // Ensure the nested properties exist, default to empty/zero if not
        response.data = {
            organizations: response.data.organizations ?? [],
            totalCount: response.data.totalCount ?? 0,
        };
    } else if (response.status >= 200 && response.status < 300 && !response.error) {
        // Handle case where response.data itself might be null/undefined on success
         response.data = {
            organizations: [],
            totalCount: 0,
        };
    }
    return response;
  }

  // --- Placeholder methods need refactoring to use this.client --- //

  /**
   * Fetches details for a specific organization.
   * Uses the main client's get method.
   * @param orgId - The ID of the organization to fetch.
   * @returns An ApiResponse containing the organization details or an error (e.g., 404 Not Found).
   */
  async getOrganizationDetails(orgId: string): Promise<ApiResponse<Organization>> { // Return type is Org, not Org | null
    // Use the injected ApiClient's get method
    return this.client.get<Organization>(`organizations/${orgId}`);
    // The base client's request method handles response processing and error wrapping.
    // Caller should check response.status and response.error to handle not found (404) etc.
  }

  /**
   * Fetches the members of a specific organization, including their profiles.
   * Uses the main client's get method.
   * @param orgId - The ID of the organization whose members to fetch.
   * @returns An ApiResponse containing an array of members with profiles or an error.
   */
  async getOrganizationMembers(orgId: string): Promise<ApiResponse<OrganizationMemberWithProfile[]>> {
    // Use the injected ApiClient's get method
    const response = await this.client.get<OrganizationMemberWithProfile[]>(`organizations/${orgId}/members`);
    // Ensure data is always an array on success
    if (response.status >= 200 && response.status < 300 && !response.error) {
        response.data = response.data ?? [];
    }
    return response;
  }

  /**
   * Invites a user to an organization.
   * Uses the main client's post method.
   * @param orgId - The ID of the organization to invite to.
   * @param email - The email of the person to invite.
   * @param role - The role to assign to the invitee (e.g., 'member', 'admin').
   * @returns An ApiResponse, typically with no data on success (e.g., status 204) or an error.
   */
  async inviteUserByEmail(orgId: string, email: string, role: string): Promise<ApiResponse<any>> {
    const payload = { email, role };
    // Use the injected ApiClient's post method
    // Assuming backend returns the created Invite object
    return this.client.post<Invite, typeof payload>(`organizations/${orgId}/invites`, payload);
  }

  /**
   * Invites a known user (by their ID) to an organization.
   * Uses the main client's post method.
   * @param orgId - The ID of the organization to invite to.
   * @param userId - The ID of the user to invite.
   * @param role - The role to assign to the invitee (e.g., 'member', 'admin').
   * @returns An ApiResponse containing invite details or an error.
   */
  async inviteUserById(orgId: string, userId: string, role: string): Promise<ApiResponse<any>> {
    const payload = { invitedUserId: userId, role }; // Use 'invitedUserId' as key
    // Assuming backend returns the created Invite object
    return this.client.post<Invite, typeof payload>(`organizations/${orgId}/invites`, payload);
  }

  /**
   * Accepts an invitation to join an organization.
   * Uses the main client's post method.
   * @param inviteToken - The unique token identifying the invitation.
   * @returns An ApiResponse, typically with no data on success (e.g., status 204) or an error.
   */
  async acceptOrganizationInvite(inviteToken: string): Promise<ApiResponse<{ message: string; membershipId: string; organizationId: string }>> {
    // Use the injected ApiClient's post method
    // Backend returns { message, membershipId, organizationId } on success
    // Corrected path includes /organizations/
    return this.client.post<{ message: string; membershipId: string; organizationId: string }, undefined>(`organizations/invites/${inviteToken}/accept`, undefined);
  }

  /**
   * Declines an invitation to join an organization.
   * Uses the main client's post method.
   * @param inviteToken - The unique token identifying the invitation.
   * @returns An ApiResponse, typically with no data on success (e.g., status 204) or an error.
   */
  async declineOrganizationInvite(inviteToken: string): Promise<ApiResponse<void>> {
    // Use the injected ApiClient's post method
    // Backend endpoint: POST /organizations/invites/:inviteToken/decline (Corrected path)
    return this.client.post<void, undefined>(`organizations/invites/${inviteToken}/decline`, undefined);
  }

  /**
   * Requests to join a public organization.
   * Uses the main client's post method.
   * @param orgId - The ID of the organization to request joining.
   * @returns An ApiResponse, typically with no data on success (e.g., status 204) or an error.
   */
  async requestToJoinOrganization(orgId: string): Promise<ApiResponse<any>> {
    // Backend endpoint: POST /organizations/:orgId/requests
    // Assuming the backend needs no specific payload from the client for this action.
    // The backend infers the user from the auth context.
    // Adjust expected return type <T> if backend provides data (e.g., pending membership record)
    return this.client.post<any, undefined>(`organizations/${orgId}/requests`, undefined);
  }

  /**
   * Approves a pending join request for a membership.
   * Uses the main client's put method.
   * @param membershipId - The ID of the organization_members record representing the request.
   * @returns An ApiResponse, typically with no data on success (e.g., status 204) or an error.
   */
  async approveJoinRequest(membershipId: string): Promise<ApiResponse<void>> {
    // Backend endpoint: PUT /organizations/members/:membershipId/status { status: 'active' }
    const payload = { status: 'active' };
    // Use the actual backend endpoint and payload
    return this.client.put<void, typeof payload>(`organizations/members/${membershipId}/status`, payload);
  }

  /**
   * Updates the role of an existing organization member.
   * Uses the main client's put method.
   * @param membershipId - The ID of the organization_members record to update.
   * @param newRole - The new role to assign.
   * @returns An ApiResponse, typically with no data on success (e.g., status 204) or an error.
   */
  async updateMemberRole(membershipId: string, newRole: string): Promise<ApiResponse<void>> {
    const payload = { role: newRole };
    return this.client.put<void, typeof payload>(`organizations/members/${membershipId}/role`, payload);
  }

  /**
   * Removes a member from an organization.
   * Uses the main client's delete method.
   * @param membershipId - The ID of the organization_members record to remove.
   * @returns An ApiResponse, typically with no data on success (e.g., status 204) or an error.
   */
  async removeMember(membershipId: string): Promise<ApiResponse<void>> {
    return this.client.delete<void>(`organizations/members/${membershipId}`);
  }

  /**
   * Allows the currently authenticated user to leave an organization.
   * Uses the main client's delete method against a specific 'leave' endpoint.
   * @param orgId - The ID of the organization to leave.
   * @returns An ApiResponse, typically with no data on success (e.g., status 204) or an error.
   */
  async leaveOrganization(orgId: string): Promise<ApiResponse<void>> {
    // Assuming the backend has an endpoint like /organizations/:orgId/members/leave
    // The backend uses the authenticated user's context to determine which member to remove.
    return this.client.delete<void>(`organizations/${orgId}/members/leave`);
  }

  /**
   * Soft deletes an organization.
   * Uses the main client's delete method. The backend handles setting the deleted_at timestamp.
   * @param orgId - The ID of the organization to soft delete.
   * @returns An ApiResponse, typically with no data on success (e.g., status 204) or an error.
   */
  async deleteOrganization(orgId: string): Promise<ApiResponse<void>> {
    return this.client.delete<void>(`organizations/${orgId}`);
  }

  /**
   * Cancels a pending invitation for an organization (Admin only).
   * Uses the main client's delete method.
   * @param orgId - The ID of the organization the invite belongs to.
   * @param inviteId - The ID of the invitation to cancel.
   * @returns An ApiResponse, typically with no data on success (e.g., status 204) or an error.
   */
  async cancelInvite(orgId: string, inviteId: string): Promise<ApiResponse<void>> {
    return this.client.delete<void>(`organizations/${orgId}/invites/${inviteId}`);
  }

  /**
   * Denies a pending join request for a membership (Admin only).
   * Uses the main client's put method to update the member status to 'removed'.
   * @param membershipId - The ID of the organization_members record representing the request.
   * @returns An ApiResponse, typically with no data on success (e.g., status 204) or an error.
   */
  async denyJoinRequest(membershipId: string): Promise<ApiResponse<void>> {
    const payload = { status: 'removed' };
    return this.client.put<void, typeof payload>(`organizations/members/${membershipId}/status`, payload);
  }

  /**
   * Fetches pending invites and join requests for an organization (Admin only).
   * Uses the main client's get method.
   * @param orgId - The ID of the organization.
   * @returns An ApiResponse containing lists of pending invites and requests or an error.
   */
  async getPendingOrgActions(orgId: string): Promise<ApiResponse<{ invites: PendingInviteWithInviter[], requests: PendingRequestWithDetails[] }>> {
    // Backend endpoint: GET /organizations/:orgId/pending (example)
    // The actual fetch might return base types; casting/assuming enrichment happens in backend or needs client-side mapping
    const response = await this.client.get<PendingOrgItems>(`organizations/${orgId}/pending`); 
    
    // IMPORTANT: If backend doesn't return enriched types, this cast is unsafe.
    // The backend function MUST perform the JOINs to include user_profiles and invited_by_profile.
    // For now, we cast the response data assuming the backend provides the enriched structure.
    const enrichedData = response.data as { invites: PendingInviteWithInviter[], requests: PendingRequestWithDetails[] } | undefined;

    // Ensure data structure is correct on success, providing empty arrays if parts are missing
    if (response.status >= 200 && response.status < 300 && !response.error) {
        response.data = {
            invites: enrichedData?.invites ?? [],
            requests: enrichedData?.requests ?? []
        };
    } else if (response.status >= 200 && response.status < 300 && !response.error) {
         // Handle case where response.data itself might be null/undefined on success
         response.data = {
            invites: [],
            requests: []
        };
    }
    // Cast the entire response to match the function's Promise signature
    return response as ApiResponse<{ invites: PendingInviteWithInviter[], requests: PendingRequestWithDetails[] }>;
  }

  /**
   * Fetches minimal details for an invite using its token, primarily for the accept page.
   * Uses the main client's get method against a dedicated public endpoint.
   * @param inviteToken - The unique token identifying the invitation.
   * @returns An ApiResponse containing necessary invite details (like org name/ID) or an error.
   */
  async getInviteDetails(inviteToken: string): Promise<ApiResponse<{ organizationName: string; organizationId: string }>> {
    // Example public endpoint: GET /organizations/invites/:inviteToken/details (Corrected path)
    // This endpoint should NOT require authentication but use the token to find the invite.
    // It should only return non-sensitive data needed for the accept page.
    // Corrected path includes /organizations/
    return this.client.get<{ organizationName: string; organizationId: string }>(`organizations/invites/${inviteToken}/details`, { isPublic: false });
  }
} 