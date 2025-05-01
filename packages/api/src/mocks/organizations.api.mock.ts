import { Mock, vi } from 'vitest';
import type { OrganizationApiClient } from '../organizations.api'; // Assuming this type includes the *actual* methods
import {
    Organization,
    OrganizationMemberWithProfile, // <<< Use correct type from actual client
    Invite, // Use correct type
    ApiResponse,
    ApiError,
    // OrganizationMemberWithUser, // <<< Remove potentially incorrect type
    InviteDetails, // <<< Use correct type for getInviteDetails
    OrganizationMember, // Add if needed by updateMemberRole return
    PendingOrgItems // Add if needed by getPendingOrgActions
} from '@paynless/types';

/**
 * Creates a reusable mock object for the OrganizationApiClient, suitable for Vitest unit tests.
 * Provides vi.fn() implementations for all OrganizationApiClient methods based on organizations.api.ts.
 *
 * @returns A mocked OrganizationApiClient instance.
 */
export const createMockOrganizationApiClient = (): Record<keyof OrganizationApiClient, Mock> => ({
    // <<< Use actual method names and types from organizations.api.ts >>>
    createOrganization: vi.fn<[Pick<Organization, 'name' | 'visibility'>], Promise<ApiResponse<Organization>>>(),
    updateOrganization: vi.fn<[string, Partial<Organization>], Promise<ApiResponse<Organization>>>(),
    listUserOrganizations: vi.fn<[], Promise<ApiResponse<Organization[]>>>(), // Renamed
    getOrganizationDetails: vi.fn<[string], Promise<ApiResponse<Organization>>>(), // Added
    getOrganizationMembers: vi.fn<[string], Promise<ApiResponse<OrganizationMemberWithProfile[]>>>(), // Correct return type
    inviteUserByEmail: vi.fn<[string, string, string], Promise<ApiResponse<Invite>>>(),
    inviteUserById: vi.fn<[string, string, string], Promise<ApiResponse<Invite>>>(), // Added if exists
    acceptOrganizationInvite: vi.fn<[string], Promise<ApiResponse<{ message: string; membershipId: string; organizationId: string }>>>(),
    declineOrganizationInvite: vi.fn<[string], Promise<ApiResponse<void>>>(),
    requestToJoinOrganization: vi.fn<[string], Promise<ApiResponse<any>>>(), // Added if exists
    approveJoinRequest: vi.fn<[string], Promise<ApiResponse<void>>>(), // Added if exists
    updateMemberRole: vi.fn<[string, string], Promise<ApiResponse<void>>>(), // Renamed & updated signature
    removeMember: vi.fn<[string], Promise<ApiResponse<void>>>(), // Renamed
    deleteOrganization: vi.fn<[string], Promise<ApiResponse<void>>>(),
    leaveOrganization: vi.fn<[string], Promise<ApiResponse<void>>>(),
    cancelInvite: vi.fn<[string, string], Promise<ApiResponse<void>>>(), // Renamed
    denyJoinRequest: vi.fn<[string], Promise<ApiResponse<void>>>(), // Added if exists
    getPendingOrgActions: vi.fn<[string], Promise<ApiResponse<PendingOrgItems>>>(), // Added if exists
    getInviteDetails: vi.fn<[string], Promise<ApiResponse<{ organizationName: string; organizationId: string }>>>(), // Correct return type
    
    // deleteOrganization: vi.fn<[string], Promise<ApiResponse<void>>>(), // Already included
    // leaveOrganization: vi.fn<[string], Promise<ApiResponse<void>>>(), // REMOVED - Not in client
    // getOrganizationInvites: vi.fn<[string], Promise<ApiResponse<OrganizationInvite[]>>>(), // Maybe replaced by getPendingOrgActions?
});

/**
 * Resets all mock functions within a given mock OrganizationApiClient instance.
 * Useful for cleaning up mocks between tests (e.g., in `beforeEach`).
 *
 * @param mockClient - The mock OrganizationApiClient instance to reset.
 */
export const resetMockOrganizationApiClient = (mockClient: Record<keyof OrganizationApiClient, Mock>) => {
    // <<< Reset based on the actual methods >>>
    mockClient.createOrganization.mockReset();
    mockClient.updateOrganization.mockReset();
    mockClient.listUserOrganizations.mockReset();
    mockClient.getOrganizationDetails.mockReset();
    mockClient.getOrganizationMembers.mockReset();
    mockClient.inviteUserByEmail.mockReset();
    mockClient.inviteUserById?.mockReset(); // Use optional chaining if method might not exist
    mockClient.acceptOrganizationInvite.mockReset();
    mockClient.declineOrganizationInvite.mockReset();
    mockClient.requestToJoinOrganization?.mockReset();
    mockClient.approveJoinRequest?.mockReset();
    mockClient.updateMemberRole.mockReset();
    mockClient.removeMember.mockReset();
    mockClient.deleteOrganization.mockReset();
    mockClient.cancelInvite.mockReset();
    mockClient.denyJoinRequest?.mockReset();
    mockClient.getPendingOrgActions?.mockReset();
    mockClient.getInviteDetails.mockReset();
};

// Optional: Export a default instance if needed, though creating fresh ones might be safer
// export const mockOrganizationApiClient = createMockOrganizationApiClient();