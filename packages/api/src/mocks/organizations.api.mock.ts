import { vi, type Mock } from 'vitest';
import type { OrganizationApiClient } from '../organizations.api';
import type {
    Organization,
    OrganizationInsert,
    OrganizationUpdate,
    Invite,
    ApiResponse,
    PaginatedOrganizationsResponse,
    PendingInviteWithInviter,
    PendingRequestWithDetails,
    PaginatedMembersResponse,
    // OrganizationMember is not directly used in these mock return types,
    // OrganizationMemberWithProfile is used by getOrganizationMembers
} from '@paynless/types';

/**
 * Creates a reusable mock object for the OrganizationApiClient.
 * Provides vi.fn() implementations for all OrganizationApiClient methods.
 */
export const createMockOrganizationApiClient = (): OrganizationApiClient => ({
    createOrganization: vi.fn() as Mock<[Pick<OrganizationInsert, 'name' | 'visibility'>], Promise<ApiResponse<Organization>>>,
    updateOrganization: vi.fn() as Mock<[string, OrganizationUpdate], Promise<ApiResponse<Organization>>>,
    listUserOrganizations: vi.fn() as Mock<[number?, number?], Promise<ApiResponse<PaginatedOrganizationsResponse>>>,
    getOrganizationDetails: vi.fn() as Mock<[string], Promise<ApiResponse<Organization>>>,
    getOrganizationMembers: vi.fn() as Mock<[string, number?, number?], Promise<ApiResponse<PaginatedMembersResponse>>>,
    updateOrganizationSettings: vi.fn() as Mock<[string, { allow_member_chat_creation: boolean }], Promise<ApiResponse<Organization>>>,
    inviteUserByEmail: vi.fn() as Mock<[string, string, string], Promise<ApiResponse<Invite>>>,
    inviteUserById: vi.fn() as Mock<[string, string, string], Promise<ApiResponse<Invite>>>,
    acceptOrganizationInvite: vi.fn() as Mock<[string], Promise<ApiResponse<{ message: string; membershipId: string; organizationId: string }>>>,
    declineOrganizationInvite: vi.fn() as Mock<[string], Promise<ApiResponse<void>>>,
    requestToJoinOrganization: vi.fn() as Mock<[string], Promise<ApiResponse<unknown>>>,
    approveJoinRequest: vi.fn() as Mock<[string], Promise<ApiResponse<void>>>,
    updateMemberRole: vi.fn() as Mock<[string, string], Promise<ApiResponse<void>>>,
    removeMember: vi.fn() as Mock<[string], Promise<ApiResponse<void>>>,
    leaveOrganization: vi.fn() as Mock<[string], Promise<ApiResponse<void>>>,
    deleteOrganization: vi.fn() as Mock<[string], Promise<ApiResponse<void>>>,
    cancelInvite: vi.fn() as Mock<[string, string], Promise<ApiResponse<void>>>,
    denyJoinRequest: vi.fn() as Mock<[string], Promise<ApiResponse<void>>>,
    getPendingOrgActions: vi.fn() as Mock<[string], Promise<ApiResponse<{ invites: PendingInviteWithInviter[], requests: PendingRequestWithDetails[] }>>>,
    getInviteDetails: vi.fn() as Mock<[string], Promise<ApiResponse<{ organizationName: string; organizationId: string }>>>,
}) as unknown as OrganizationApiClient;

/**
 * Resets all mock functions within a given mock OrganizationApiClient instance.
 */
export const resetMockOrganizationApiClient = (mockClient: OrganizationApiClient) => {
    (mockClient.createOrganization as Mock).mockReset();
    (mockClient.updateOrganization as Mock).mockReset();
    (mockClient.listUserOrganizations as Mock).mockReset();
    (mockClient.getOrganizationDetails as Mock).mockReset();
    (mockClient.getOrganizationMembers as Mock).mockReset();
    (mockClient.updateOrganizationSettings as Mock).mockReset();
    (mockClient.inviteUserByEmail as Mock).mockReset();
    (mockClient.inviteUserById as Mock).mockReset();
    (mockClient.acceptOrganizationInvite as Mock).mockReset();
    (mockClient.declineOrganizationInvite as Mock).mockReset();
    (mockClient.requestToJoinOrganization as Mock).mockReset();
    (mockClient.approveJoinRequest as Mock).mockReset();
    (mockClient.updateMemberRole as Mock).mockReset();
    (mockClient.removeMember as Mock).mockReset();
    (mockClient.leaveOrganization as Mock).mockReset();
    (mockClient.deleteOrganization as Mock).mockReset();
    (mockClient.cancelInvite as Mock).mockReset();
    (mockClient.denyJoinRequest as Mock).mockReset();
    (mockClient.getPendingOrgActions as Mock).mockReset();
    (mockClient.getInviteDetails as Mock).mockReset();
};

// Optional: Export a default instance if needed, though creating fresh ones might be safer
// export const mockOrganizationApiClient = createMockOrganizationApiClient();