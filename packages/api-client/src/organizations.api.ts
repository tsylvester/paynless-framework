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

  async getOrganizationMembers(orgId: string): Promise<ApiResponse<any[]>> { // TODO: Define Member type with profile
     console.warn('getOrganizationMembers needs refactoring to use ApiClient.get');
    // TODO: Refactor to use return this.client.get<MemberWithProfile[]>(`organizations/${orgId}/members`);
     return { status: 501, error: { message: 'Not implemented', code: 'NOT_IMPLEMENTED' } };
  }

  async inviteUserToOrganization(orgId: string, emailOrUserId: string, role: string): Promise<ApiResponse<void>> {
    console.warn('inviteUserToOrganization needs refactoring to use ApiClient.post');
    // TODO: Refactor to use return this.client.post<void, { emailOrUserId: string; role: string }>(`organizations/${orgId}/invites`, { emailOrUserId, role });
     return { status: 501, error: { message: 'Not implemented', code: 'NOT_IMPLEMENTED' } };
  }

  async acceptOrganizationInvite(inviteTokenOrId: string): Promise<ApiResponse<void>> {
     console.warn('acceptOrganizationInvite needs refactoring to use ApiClient.post');
    // TODO: Refactor to use return this.client.post<void, { inviteTokenOrId: string }>(`organizations/invites/accept`, { inviteTokenOrId });
     return { status: 501, error: { message: 'Not implemented', code: 'NOT_IMPLEMENTED' } };
  }

  async requestToJoinOrganization(orgId: string): Promise<ApiResponse<void>> {
    console.warn('requestToJoinOrganization needs refactoring to use ApiClient.post');
    // TODO: Refactor to use return this.client.post<void, {}>(`organizations/${orgId}/requests`, {});
     return { status: 501, error: { message: 'Not implemented', code: 'NOT_IMPLEMENTED' } };
  }

  async approveJoinRequest(membershipId: string): Promise<ApiResponse<void>> {
    console.warn('approveJoinRequest needs refactoring to use ApiClient.put');
    // TODO: Refactor to use return this.client.put<void, {}>(`organizations/members/${membershipId}/approve`, {});
     return { status: 501, error: { message: 'Not implemented', code: 'NOT_IMPLEMENTED' } };
  }

  async updateMemberRole(membershipId: string, newRole: string): Promise<ApiResponse<void>> {
     console.warn('updateMemberRole needs refactoring to use ApiClient.put');
    // TODO: Refactor to use return this.client.put<void, { role: string }>(`organizations/members/${membershipId}/role`, { role: newRole });
     return { status: 501, error: { message: 'Not implemented', code: 'NOT_IMPLEMENTED' } };
  }

  async removeMember(membershipId: string): Promise<ApiResponse<void>> {
     console.warn('removeMember needs refactoring to use ApiClient.delete');
    // TODO: Refactor to use return this.client.delete<void>(`organizations/members/${membershipId}`);
     return { status: 501, error: { message: 'Not implemented', code: 'NOT_IMPLEMENTED' } };
  }

  async deleteOrganization(orgId: string): Promise<ApiResponse<void>> {
    console.warn('deleteOrganization (soft delete) needs refactoring to use ApiClient.delete');
    // TODO: Refactor to use return this.client.delete<void>(`organizations/${orgId}`); // Backend handles soft delete
     return { status: 501, error: { message: 'Not implemented', code: 'NOT_IMPLEMENTED' } };
  }
} 