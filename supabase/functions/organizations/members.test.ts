import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
    handleListMembers,
    handleUpdateMemberRole,
    handleRemoveMember
} from "./members.ts"; 
import { 
    createMockSupabaseClient, 
    MockSupabaseDataConfig, 
    MockQueryBuilderState 
} from "../_shared/test-utils.ts";
import { User } from "@supabase/supabase-js";

// Helper to create a mock request (copied from original index.test.ts)
const createMockRequest = (method: string, path: string, body?: Record<string, unknown>): Request => {
    const headers = new Headers({
        'Content-Type': 'application/json',
    });
    if (method !== 'GET' && method !== 'HEAD') {
        headers.set('Authorization', 'Bearer fake-token'); // Add default auth
    }
    return new Request(`http://localhost${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
};

// --- Test Suite for GET /organizations/:orgId/members --- 
Deno.test("GET /organizations/:orgId/members", async (t) => {
    const mockOrgId = 'org-get-members';
    const mockUser = { id: 'user-gets-members' };
    const mockMembers = [
        { id: 'mem1', user_id: mockUser.id, role: 'admin', status: 'active', profiles: { full_name: 'Admin User' } },
        { id: 'mem2', user_id: 'member-id-2', role: 'member', status: 'active', profiles: { full_name: 'Member Two' } }
    ];

    await t.step("should return 200 with list of members for an org member", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            genericMockResults: {
                organization_members: {
                    select: (state: MockQueryBuilderState) => {
                        // Check for the preliminary membership check first
                        const isMembershipCheck = state.filters.some(f => f.column === 'user_id' && f.value === mockUser.id)
                                               && state.filters.some(f => f.column === 'status' && f.value === 'active')
                                               && state.selectColumns === 'id';
                        if (isMembershipCheck) {
                             return Promise.resolve({ data: null, error: null, count: 1 }); // User is a member
                        }
                        
                        // Check for the actual member list query
                         const orgIdFilter = state.filters.find((f: any) => f.column === 'organization_id' && f.type === 'eq');
                        if (orgIdFilter?.value === mockOrgId && state.selectColumns?.includes('profiles')) { 
                            assert(state.selectColumns?.includes('profiles'), 'Select should include profiles');
                            return Promise.resolve({ data: mockMembers, error: null });
                        }
                        return Promise.resolve({ data: null, error: new Error('Unexpected select in GET members test') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("GET", `/organizations/${mockOrgId}/members`);

        // Act
        const res = await handleListMembers(req, mockClient, mockUser as User, mockOrgId);

        // Assert
        assertEquals(res.status, 200);
        const json = await res.json();
        assert(Array.isArray(json));
        assertEquals(json.length, mockMembers.length);
        assertEquals(json[0].user_id, mockMembers[0].user_id);
        assertEquals(json[0].profiles.full_name, mockMembers[0].profiles.full_name);
    });

    await t.step("should return 403 if user not member", async () => {
        // Arrange
         const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            genericMockResults: {
                organization_members: { 
                    select: (state: MockQueryBuilderState) => {
                        // Mock the preliminary membership check failing
                         const isMembershipCheck = state.filters.some(f => f.column === 'user_id' && f.value === mockUser.id)
                                               && state.filters.some(f => f.column === 'status' && f.value === 'active')
                                               && state.selectColumns === 'id';
                        if (isMembershipCheck) {
                            return Promise.resolve({ data: null, error: null, count: 0 }); // User is NOT a member
                        }
                       return Promise.resolve({ data: null, error: new Error('Unexpected select in GET members 403 test') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("GET", `/organizations/${mockOrgId}/members`);

        // Act
        const res = await handleListMembers(req, mockClient, mockUser as User, mockOrgId);

        // Assert
        assertEquals(res.status, 403); 
        const json = await res.json();
        assertEquals(json.error, "Forbidden: You do not have permission to view members of this organization.");
    });
});

// --- Test Suite for PUT /organizations/:orgId/members/:membershipId/role --- 
Deno.test("PUT /organizations/:orgId/members/:membershipId/role", async (t) => {
    const mockOrgId = 'org-update-role';
    const mockMembershipId = 'membership-to-update';
    const adminUserId = 'admin-updates-role';
    const nonAdminUserId = 'non-admin-updates-role';
    const rolePayload = { role: "admin" };

    await t.step("should return 204 on successful role update by admin", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: { id: adminUserId },
            genericMockResults: {
                organization_members: {
                    update: (state: MockQueryBuilderState) => {
                        assertEquals(state.updateData, rolePayload);
                        const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                        const orgFilter = state.filters.find((f: any) => f.column === 'organization_id' && f.type === 'eq');
                        assertEquals(idFilter?.value, mockMembershipId);
                        assertEquals(orgFilter?.value, mockOrgId);
                        // Simulate successful update returning the updated data
                        return Promise.resolve({ data: [{ id: mockMembershipId, role: "admin" }], error: null, count: 1 }); 
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}/members/${mockMembershipId}/role`, rolePayload);

        // Act
        const res = await handleUpdateMemberRole(req, mockClient, { id: adminUserId } as User, mockOrgId, mockMembershipId, rolePayload);

        // Assert
        assertEquals(res.status, 204); 
    });
    
    await t.step("should return 403 if RLS prevents update", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: { id: nonAdminUserId }, // Non-admin user
            genericMockResults: {
                organization_members: {
                    update: () => Promise.resolve({ data: null, error: null, count: 0 }), // RLS blocks, returns 0 count
                    // Mock the existence check needed for 403 vs 404
                    select: (state: MockQueryBuilderState) => {
                         const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                         const orgFilter = state.filters.find((f: any) => f.column === 'organization_id' && f.type === 'eq');
                         if (idFilter?.value === mockMembershipId && orgFilter?.value === mockOrgId && state.selectColumns === 'id') {
                             return Promise.resolve({ data: [{ id: mockMembershipId }], error: null, count: 1 }); // Member exists
                         }
                         return Promise.resolve({ data: null, error: new Error('Unexpected select in PUT role 403') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}/members/${mockMembershipId}/role`, rolePayload);

        // Act
        const res = await handleUpdateMemberRole(req, mockClient, { id: nonAdminUserId } as User, mockOrgId, mockMembershipId, rolePayload);

        // Assert
        assertEquals(res.status, 403);
        const json = await res.json();
        assertEquals(json.error, "Forbidden: You do not have permission to update member roles.");
    });

     await t.step("should return 409 if changing role of last admin (DB error)", async () => {
        // Arrange
        const lastAdminError = { message: "Cannot change the role of the last admin", code: "P0001" };
        const config: MockSupabaseDataConfig = {
            mockUser: { id: adminUserId },
            genericMockResults: {
                organization_members: { 
                    update: () => Promise.resolve({ data: null, error: lastAdminError }) // Simulate DB trigger error
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const demotePayload = { role: "member" }; 
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}/members/${mockMembershipId}/role`, demotePayload);

        // Act
        const res = await handleUpdateMemberRole(req, mockClient, { id: adminUserId } as User, mockOrgId, mockMembershipId, demotePayload);

        // Assert
        assertEquals(res.status, 409); 
        const json = await res.json();
        assert(json.error.includes("last admin"));
    });

     await t.step("should return 404 if membership is not found", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: { id: adminUserId },
            genericMockResults: {
                organization_members: {
                    update: () => Promise.resolve({ data: null, error: null, count: 0 }), // Update affects 0 rows
                    // Mock the existence check needed for 403 vs 404
                    select: (state: MockQueryBuilderState) => {
                         const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                         const orgFilter = state.filters.find((f: any) => f.column === 'organization_id' && f.type === 'eq');
                         if (idFilter?.value === mockMembershipId && orgFilter?.value === mockOrgId && state.selectColumns === 'id') {
                             return Promise.resolve({ data: null, error: null, count: 0 }); // Member does NOT exist
                         }
                         return Promise.resolve({ data: null, error: new Error('Unexpected select in PUT role 404') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}/members/${mockMembershipId}/role`, rolePayload);

        // Act
        const res = await handleUpdateMemberRole(req, mockClient, { id: adminUserId } as User, mockOrgId, mockMembershipId, rolePayload);

        // Assert
        assertEquals(res.status, 404);
        const json = await res.json();
        assertEquals(json.error, "Membership not found.");
    });
});

// --- Test Suite for DELETE /organizations/:orgId/members/:membershipId --- 
Deno.test("DELETE /organizations/:orgId/members/:membershipId", async (t) => {
    const mockOrgId = 'org-remove-member';
    const mockMembershipId = 'membership-to-remove';
    const mockAdminUser = { id: 'admin-removes-member' };
    const mockNonAdminUser = { id: 'non-admin-removes' };

    await t.step("should return 204 on successful removal by admin", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser,
            genericMockResults: {
                organization_members: { 
                    delete: (state: MockQueryBuilderState) => {
                         const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                         const orgFilter = state.filters.find((f: any) => f.column === 'organization_id' && f.type === 'eq');
                         assertEquals(idFilter?.value, mockMembershipId);
                         assertEquals(orgFilter?.value, mockOrgId);
                         return Promise.resolve({ data: [{ id: mockMembershipId }], error: null, count: 1 }); // Simulate 1 row deleted
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}/members/${mockMembershipId}`);

        // Act
        const res = await handleRemoveMember(req, mockClient, mockAdminUser as User, mockOrgId, mockMembershipId);

        // Assert
        assertEquals(res.status, 204); 
    });

    await t.step("should return 403 if RLS prevents removal", async () => {
         // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockNonAdminUser,
            genericMockResults: {
                organization_members: {
                    delete: () => Promise.resolve({ data: null, error: null, count: 0 }), // RLS blocks, 0 count
                    // Mock existence check
                    select: (state: MockQueryBuilderState) => {
                         const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                         const orgFilter = state.filters.find((f: any) => f.column === 'organization_id' && f.type === 'eq');
                         if (idFilter?.value === mockMembershipId && orgFilter?.value === mockOrgId && state.selectColumns === 'id') {
                             return Promise.resolve({ data: [{id: mockMembershipId}], error: null, count: 1 }); // Member exists
                         }
                         return Promise.resolve({ data: null, error: new Error('Unexpected select in DELETE member 403') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}/members/${mockMembershipId}`);

        // Act
        const res = await handleRemoveMember(req, mockClient, mockNonAdminUser as User, mockOrgId, mockMembershipId);

        // Assert
        assertEquals(res.status, 403);
        const json = await res.json();
        assertEquals(json.error, "Forbidden: You do not have permission to remove this member.");
    });

    await t.step("should return 409 if removing the last admin (DB error)", async () => {
        // Arrange
        const lastAdminError = { message: "Cannot remove the last admin", code: "P0001" };
        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser, 
            genericMockResults: {
                organization_members: { 
                    delete: () => Promise.resolve({ data: null, error: lastAdminError }) // Simulate DB trigger error
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}/members/${mockMembershipId}`);

        // Act
        const res = await handleRemoveMember(req, mockClient, mockAdminUser as User, mockOrgId, mockMembershipId);

        // Assert
        assertEquals(res.status, 409); 
        const json = await res.json();
        assert(json.error.includes("last admin"));
    });

     await t.step("should return 404 if membership is not found", async () => {
         // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser,
            genericMockResults: {
                organization_members: {
                    delete: () => Promise.resolve({ data: null, error: null, count: 0 }), // Delete affects 0 rows
                    // Mock existence check
                    select: (state: MockQueryBuilderState) => {
                         const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                         const orgFilter = state.filters.find((f: any) => f.column === 'organization_id' && f.type === 'eq');
                         if (idFilter?.value === mockMembershipId && orgFilter?.value === mockOrgId && state.selectColumns === 'id') {
                             return Promise.resolve({ data: null, error: null, count: 0 }); // Member does NOT exist
                         }
                         return Promise.resolve({ data: null, error: new Error('Unexpected select in DELETE member 404') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}/members/${mockMembershipId}`);

        // Act
        const res = await handleRemoveMember(req, mockClient, mockAdminUser as User, mockOrgId, mockMembershipId);

        // Assert
        assertEquals(res.status, 404);
        const json = await res.json();
        assertEquals(json.error, "Membership not found.");
    });
}); 