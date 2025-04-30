import { vi } from 'vitest';
import type { OrganizationApiClient } from '../organizations.api';
import {
    Organization,
    OrganizationMember,
    OrganizationInvite,
    ApiResponse,
    ApiError,
    OrganizationMemberWithUser,
    InviteDetailsWithOrgName
} from '@paynless/types';

/**
 * Creates a reusable mock object for the OrganizationApiClient, suitable for Vitest unit tests.
 * Provides vi.fn() implementations for all OrganizationApiClient methods.
 *
 * @returns A mocked OrganizationApiClient instance.
 */
export const createMockOrganizationApiClient = (): OrganizationApiClient => ({
    getUserOrganizations: vi.fn<[], Promise<ApiResponse<Organization[]>>>(),
    getOrganizationMembers: vi.fn<[string], Promise<ApiResponse<OrganizationMemberWithUser[]>>>(),
    createOrganization: vi.fn<[{ name: string }], Promise<ApiResponse<Organization>>>(),
    deleteOrganization: vi.fn<[string], Promise<ApiResponse<void>>>(),
    leaveOrganization: vi.fn<[string], Promise<ApiResponse<void>>>(),
    updateOrganization: vi.fn<[string, { name?: string, visibility?: 'public' | 'private' }], Promise<ApiResponse<Organization>>>(),
    removeOrganizationMember: vi.fn<[string, string], Promise<ApiResponse<void>>>(),
    updateOrganizationMemberRole: vi.fn<[string, string, 'admin' | 'member'], Promise<ApiResponse<OrganizationMember>>>(),
    inviteUserByEmail: vi.fn<[string, { email: string; role: 'admin' | 'member' }], Promise<ApiResponse<OrganizationInvite>>>(),
    getOrganizationInvites: vi.fn<[string], Promise<ApiResponse<OrganizationInvite[]>>>(),
    getInviteDetails: vi.fn<[string], Promise<ApiResponse<InviteDetailsWithOrgName>>>(),
    acceptOrganizationInvite: vi.fn<[string], Promise<ApiResponse<void>>>(),
    declineOrganizationInvite: vi.fn<[string], Promise<ApiResponse<void>>>(),
    revokeInvite: vi.fn<[string], Promise<ApiResponse<void>>>(),
    // Ensure all methods from the actual OrganizationApiClient are mocked
});

/**
 * Resets all mock functions within a given mock OrganizationApiClient instance.
 * Useful for cleaning up mocks between tests (e.g., in `beforeEach`).
 *
 * @param mockClient - The mock OrganizationApiClient instance to reset.
 */
export const resetMockOrganizationApiClient = (mockClient: OrganizationApiClient) => {
    mockClient.getUserOrganizations.mockReset();
    mockClient.getOrganizationMembers.mockReset();
    mockClient.createOrganization.mockReset();
    mockClient.deleteOrganization.mockReset();
    mockClient.leaveOrganization.mockReset();
    mockClient.updateOrganization.mockReset();
    mockClient.removeOrganizationMember.mockReset();
    mockClient.updateOrganizationMemberRole.mockReset();
    mockClient.inviteUserByEmail.mockReset();
    mockClient.getOrganizationInvites.mockReset();
    mockClient.getInviteDetails.mockReset();
    mockClient.acceptOrganizationInvite.mockReset();
    mockClient.declineOrganizationInvite.mockReset();
    mockClient.revokeInvite.mockReset();
};

// Optional: Export a default instance if needed, though creating fresh ones might be safer
// export const mockOrganizationApiClient = createMockOrganizationApiClient(); 