import { ApiClient } from './apiClient'; // <<< Import base ApiClient
import { ApiResponse, Organization, OrganizationInsert, OrganizationUpdate } from '@paynless/types'; // <<< Import types

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
   * Lists all non-deleted organizations the current user is an active member of.
   * Uses the main client's get method.
   * @param userId - (Potentially redundant if backend uses auth context) The ID of the user.
   * @returns An ApiResponse containing an array of organization details or an error.
   */
  async listUserOrganizations(userId: string): Promise<ApiResponse<Organization[]>> {
    // userId might not be needed if the backend endpoint implicitly uses the authenticated user
    // Use the injected ApiClient's get method
    const response = await this.client.get<Organization[]>('organizations');
    
    // Ensure data is always an array on success, even if API returns null/undefined
    if (response.status >= 200 && response.status < 300 && !response.error) {
        response.data = response.data ?? [];
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
   * @param emailOrUserId - The email or user ID of the person to invite.
   * @param role - The role to assign to the invitee (e.g., 'member', 'admin').
   * @returns An ApiResponse, typically with no data on success (e.g., status 204) or an error.
   */
  async inviteUserToOrganization(orgId: string, emailOrUserId: string, role: string): Promise<ApiResponse<void>> {
    const payload = { emailOrUserId, role };
    // Use the injected ApiClient's post method
    // Expecting no content (void) on success, so specify void as the return type T
    return this.client.post<void, typeof payload>(`organizations/${orgId}/invites`, payload);
  }

  /**
   * Accepts an invitation to join an organization.
   * Uses the main client's post method.
   * @param inviteTokenOrId - The unique token or ID identifying the invitation.
   * @returns An ApiResponse, typically with no data on success (e.g., status 204) or an error.
   */
  async acceptOrganizationInvite(inviteTokenOrId: string): Promise<ApiResponse<void>> {
     const payload = { inviteTokenOrId };
     // Use the injected ApiClient's post method
     return this.client.post<void, typeof payload>('organizations/invites/accept', payload);
  }

  /**
   * Requests to join a public organization.
   * Uses the main client's post method.
   * @param orgId - The ID of the organization to request joining.
   * @returns An ApiResponse, typically with no data on success (e.g., status 204) or an error.
   */
  async requestToJoinOrganization(orgId: string): Promise<ApiResponse<void>> {
    // Sending an empty payload for this request
    return this.client.post<void, {}>(`organizations/${orgId}/requests`, {});
  }

  /**
   * Approves a pending join request for a membership.
   * Uses the main client's put method.
   * @param membershipId - The ID of the organization_members record representing the request.
   * @returns An ApiResponse, typically with no data on success (e.g., status 204) or an error.
   */
  async approveJoinRequest(membershipId: string): Promise<ApiResponse<void>> {
    // Sending an empty payload for approval
    return this.client.put<void, {}>(`organizations/members/${membershipId}/approve`, {});
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
   * Soft deletes an organization.
   * Uses the main client's delete method. The backend handles setting the deleted_at timestamp.
   * @param orgId - The ID of the organization to soft delete.
   * @returns An ApiResponse, typically with no data on success (e.g., status 204) or an error.
   */
  async deleteOrganization(orgId: string): Promise<ApiResponse<void>> {
    return this.client.delete<void>(`organizations/${orgId}`);
  }
} 