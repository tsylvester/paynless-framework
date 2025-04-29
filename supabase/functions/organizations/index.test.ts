import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleOrganizationRequest } from "./index.ts"; // Use the exported handler
import { 
    createMockSupabaseClient, 
    MockSupabaseDataConfig, 
    MockQueryBuilderState 
} from "../_shared/test-utils.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { User } from "@supabase/supabase-js"; // Import User type if needed for casting

// Helper to create a mock request
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

// --- Test Suites --- 
Deno.test("POST /organizations", async (t) => {

    await t.step("should create an organization and return 201 with details on success", async () => {
        // Arrange
        const mockUser = { id: 'user-creates-org' };
        const mockOrgName = "Success Org";
        const mockOrgVisibility = "private";
        const mockNewOrgId = 'org-id-success';
        const mockCreatedOrg = { id: mockNewOrgId, name: mockOrgName, visibility: mockOrgVisibility, created_at: new Date().toISOString(), deleted_at: null };

        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            rpcResults: { 
                create_org_and_admin_member: () => Promise.resolve({ data: mockNewOrgId, error: null })
            },
            genericMockResults: {
                organizations: {
                    select: (state: MockQueryBuilderState) => {
                        const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                        if (idFilter?.value === mockNewOrgId) {
                            return Promise.resolve({ data: [mockCreatedOrg], error: null, count: 1, status: 200, statusText: 'OK' });
                        }
                        return Promise.resolve({ data: null, error: new Error('Unexpected select') });
                    }
                }
            }
        };
        const { client: mockClient, spies } = createMockSupabaseClient(config);
        const req = createMockRequest("POST", "/organizations", { name: mockOrgName, visibility: mockOrgVisibility });

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 201);
        const json = await res.json();
        assertEquals(json.id, mockNewOrgId);
        assertEquals(json.name, mockOrgName);
        assertEquals(json.visibility, mockOrgVisibility);
        assertExists(json.created_at);
        assert(spies.rpcSpy.calls.length > 0, "RPC spy was not called"); // Check if RPC was called
        const rpcArgs = spies.rpcSpy.calls[0].args; // Get args from the spy
        assertEquals(rpcArgs[0], 'create_org_and_admin_member'); // Check function name
        assertEquals(rpcArgs[1]?.p_user_id, mockUser.id); // Check payload arg
        assertEquals(rpcArgs[1]?.p_org_name, mockOrgName);
        assertEquals(rpcArgs[1]?.p_org_visibility, mockOrgVisibility);
    });

    await t.step("should return 401 if user is not authenticated", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            simulateAuthError: new Error("Authentication required")
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("POST", "/organizations", { name: "Auth Test Org" });
        req.headers.delete('Authorization'); 

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 401);
        const json = await res.json();
        assertEquals(json.error, "Unauthorized");
    });

    await t.step("should return 400 if name is missing", async () => {
        // Arrange
        const mockUser = { id: 'user-validation-test' };
        const config: MockSupabaseDataConfig = { mockUser }; 
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("POST", "/organizations", { visibility: "private" });

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 400);
        const json = await res.json();
        assertExists(json.error);
        assertEquals(json.error, "Organization name is required and must be at least 3 characters long.");
    });

    await t.step("should return 400 if name is too short", async () => {
        // Arrange
        const mockUser = { id: 'user-validation-test-2' };
        const config: MockSupabaseDataConfig = { mockUser };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("POST", "/organizations", { name: "ab" });

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 400);
        const json = await res.json();
        assertExists(json.error);
        assertEquals(json.error, "Organization name is required and must be at least 3 characters long.");
    });

    await t.step("should return 500 if RPC call fails", async () => {
        // Arrange
        const mockUser = { id: 'user-rpc-fail' };
        const rpcError = { message: "Intentional RPC failure", code: 'P0001' };
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            rpcResults: { // Configure RPC mock failure
                 create_org_and_admin_member: () => Promise.resolve({ data: null, error: rpcError })
            }
            // No genericMockResults needed if only testing RPC failure
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("POST", "/organizations", { name: "RPC Fail Test Org" });

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 500);
        const json = await res.json();
        assert(json.error.includes(rpcError.message), `Expected error message to include: ${rpcError.message}, but got: ${json.error}`);
    });

    await t.step("should return 500 if fetching created org details fails", async () => {
        // Arrange
        const mockUser = { id: 'user-fetch-fail' };
        const mockNewOrgId = 'org-id-fetch-fail';
        const fetchError = { message: "SELECT failed", code: 'P0002' };
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            rpcResults: { // RPC Succeeds
                create_org_and_admin_member: () => Promise.resolve({ data: mockNewOrgId, error: null })
            },
            genericMockResults: {
                organizations: {
                    select: (state: MockQueryBuilderState) => { // Select Fails
                         const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                         if (idFilter?.value === mockNewOrgId) {
                            return Promise.resolve({ data: null, error: fetchError });
                         }
                         return Promise.resolve({ data: null, error: new Error('Unexpected select') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("POST", "/organizations", { name: "Org Fetch Fail Test" });

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 500);
        const json = await res.json();
        assertEquals(json.error, "Organization created, but failed to fetch details.");
    });
});

Deno.test("GET /organizations", async (t) => {
    await t.step("should return 200 with a list of organizations for the authenticated user", async () => {
        // Arrange
        const mockUser = { id: 'user-gets-orgs' };
        const mockOrgs = [
            { id: 'org1', name: 'Org One', visibility: 'private', created_at: new Date().toISOString(), deleted_at: null },
            { id: 'org2', name: 'Org Two', visibility: 'public', created_at: new Date().toISOString(), deleted_at: null }
        ];
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            genericMockResults: {
                organizations: {
                    select: (state: MockQueryBuilderState) => {
                        assertEquals(state.tableName, 'organizations');
                        return Promise.resolve({ data: mockOrgs, error: null, count: mockOrgs.length });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("GET", "/organizations");

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 200);
        const json = await res.json();
        assert(Array.isArray(json), "Response should be an array");
        assertEquals(json.length, mockOrgs.length);
        assertEquals(json[0].id, mockOrgs[0].id);
        assertEquals(json[1].name, mockOrgs[1].name);
    });

    await t.step("should return 401 if user is not authenticated", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = { simulateAuthError: new Error("Auth required") };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("GET", "/organizations");
        req.headers.delete('Authorization');

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 401);
    });
});

Deno.test("GET /organizations/:orgId", async (t) => {
    const mockOrgId = 'org-get-details';
    const mockUser = { id: 'user-gets-details' };
    const mockOrgDetails = { id: mockOrgId, name: 'Details Org', visibility: 'private', created_at: new Date().toISOString(), deleted_at: null };

    await t.step("should return 200 with organization details for a member", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            genericMockResults: {
                organizations: {
                    select: (state: MockQueryBuilderState) => {
                        const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                        if (idFilter?.value === mockOrgId) {
                            return Promise.resolve({ data: [mockOrgDetails], error: null, count: 1 });
                        }
                        return Promise.resolve({ data: null, error: new Error('Unexpected select') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("GET", `/organizations/${mockOrgId}`);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 200);
        const json = await res.json();
        assertEquals(json.id, mockOrgId);
        assertEquals(json.name, mockOrgDetails.name);
    });

    await t.step("should return 404 if organization not found or user is not a member", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            genericMockResults: {
                organizations: {
                    select: (state: MockQueryBuilderState) => {
                        const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                        if (idFilter?.value === mockOrgId) {
                            return Promise.resolve({ data: [], error: null, count: 0 });
                        }
                        return Promise.resolve({ data: null, error: new Error('Unexpected select') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("GET", `/organizations/${mockOrgId}`);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 404);
        const json = await res.json();
        assertEquals(json.error, "Organization not found or access denied.");
    });
});

Deno.test("PUT /organizations/:orgId", async (t) => {
    const mockOrgId = 'org-update-details';
    const mockAdminUser = { id: 'admin-user-updates' };
    const updatePayload = { name: "Updated Org Name", visibility: "public" };
    const updatedOrg = { id: mockOrgId, ...updatePayload, created_at: new Date().toISOString(), deleted_at: null };

    await t.step("should return 200 with updated details if admin updates successfully", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser,
            genericMockResults: {
                organizations: {
                    update: (state: MockQueryBuilderState) => {
                        assertEquals(state.updateData, updatePayload); 
                        const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                        assertEquals(idFilter?.value, mockOrgId);
                        return Promise.resolve({ data: [updatedOrg], error: null, count: 1 });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}`, updatePayload);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 200);
        const json = await res.json();
        assertEquals(json.id, mockOrgId);
        assertEquals(json.name, updatePayload.name);
        assertEquals(json.visibility, updatePayload.visibility);
    });

    await t.step("should return 403 if non-admin attempts update", async () => {
        // Arrange
        const mockNonAdminUser = { id: 'non-admin-user' };
        const config: MockSupabaseDataConfig = {
            mockUser: mockNonAdminUser,
            genericMockResults: {
                organizations: {
                    update: (state: MockQueryBuilderState) => {
                        const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                        if (idFilter?.value === mockOrgId) {
                            return Promise.resolve({ data: [], error: null, count: 0 });
                        }
                        return Promise.resolve({ data: null, error: new Error('Unexpected update')});
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}`, updatePayload);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 403); // Or 404 depending on how RLS failure is interpreted
        const json = await res.json();
        assertEquals(json.error, "Forbidden: You do not have permission to update this organization.");
    });

     await t.step("should return 400 for invalid update payload", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = { mockUser: mockAdminUser }; // Admin user
        const { client: mockClient } = createMockSupabaseClient(config);
        const invalidPayload = { name: "" }; // Invalid name
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}`, invalidPayload);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 400);
        const json = await res.json();
        assertEquals(json.error, "Invalid update payload. Name must be at least 3 characters.");
    });
});

Deno.test("DELETE /organizations/:orgId", async (t) => {
    const mockOrgId = 'org-delete-test';
    const mockAdminUser = { id: 'admin-user-deletes' };
    
    await t.step("should return 204 on successful soft delete by admin", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser,
            rpcResults: { // Assume soft delete uses an RPC to check last admin
                soft_delete_organization: () => Promise.resolve({ data: true, error: null }) // RPC returns true on success
            }
        };
        const { client: mockClient, spies } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}`);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 204);
        assert(spies.rpcSpy.calls.length > 0, "RPC spy was not called");
        assertEquals(spies.rpcSpy.calls[0].args[0], 'soft_delete_organization');
        assertEquals(spies.rpcSpy.calls[0].args[1]?.p_org_id, mockOrgId);
        assertEquals(spies.rpcSpy.calls[0].args[1]?.p_user_id, mockAdminUser.id);
    });

    await t.step("should return 403 if non-admin attempts delete", async () => {
        // Arrange
        const mockNonAdminUser = { id: 'non-admin-delete' };
         const config: MockSupabaseDataConfig = {
            mockUser: mockNonAdminUser,
            rpcResults: { // RPC check should fail for non-admin
                soft_delete_organization: () => Promise.resolve({ data: null, error: { message: "Permission Denied", code: "42501" } })
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}`);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 403); 
        const json = await res.json();
        assert(json.error.includes("Permission Denied"));
    });
    
    await t.step("should return 409 if last admin attempts delete", async () => {
        // Arrange
         const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser,
            rpcResults: { // RPC check detects last admin
                soft_delete_organization: () => Promise.resolve({ data: false, error: { message: "Cannot delete org with last admin", code: "P0001" } })
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}`);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 409); // Conflict
        const json = await res.json();
        assert(json.error.includes("last admin"));
    });

    await t.step("should return 404 if organization not found", async () => {
        // Arrange
         const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser,
            rpcResults: { // RPC check finds no org
                soft_delete_organization: () => Promise.resolve({ data: null, error: { message: "Organization not found", code: "PGRST116" } })
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/not-a-real-org`);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 404);
        const json = await res.json();
        assert(json.error.includes("not found"));
    });
});

Deno.test("GET /organizations/:orgId/members", async (t) => {
    const mockOrgId = 'org-get-members';
    const mockUser = { id: 'user-gets-members' };
    const mockMembers = [
        { user_id: mockUser.id, role: 'admin', status: 'active', profiles: { full_name: 'Admin User' } },
        { user_id: 'member-id-2', role: 'member', status: 'active', profiles: { full_name: 'Member Two' } }
    ];

    await t.step("should return 200 with list of members for an org member", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            genericMockResults: {
                organization_members: {
                    select: (state: MockQueryBuilderState) => {
                        assertEquals(state.tableName, 'organization_members');
                        const orgIdFilter = state.filters.find((f: any) => f.column === 'organization_id' && f.type === 'eq');
                        if (orgIdFilter?.value === mockOrgId) {
                            return Promise.resolve({ data: mockMembers, error: null });
                        }
                        return Promise.resolve({ data: null, error: new Error('Unexpected select') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("GET", `/organizations/${mockOrgId}/members`);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 200);
        const json = await res.json();
        assert(Array.isArray(json));
        assertEquals(json.length, mockMembers.length);
        assertEquals(json[0].user_id, mockMembers[0].user_id);
        assertEquals(json[0].profiles.full_name, mockMembers[0].profiles.full_name);
    });

    await t.step("should return 403/404 if user not member or org not found", async () => {
        // Arrange
         const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            genericMockResults: {
                organization_members: { 
                    select: (state: MockQueryBuilderState) => {
                         const orgIdFilter = state.filters.find((f: any) => f.column === 'organization_id' && f.type === 'eq');
                         if (orgIdFilter?.value === mockOrgId) {
                            return Promise.resolve({ data: [], error: null });
                         }
                         return Promise.resolve({ data: null, error: new Error('Unexpected select') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("GET", `/organizations/${mockOrgId}/members`);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 403); // Or 404 depending on implementation
        const json = await res.json();
        assertEquals(json.error, "Forbidden: You do not have permission to view members of this organization.");
    });
});

Deno.test("POST /organizations/:orgId/invites", async (t) => {
    const mockOrgId = 'org-invite-user';
    const mockAdminUser = { id: 'admin-invites' };
    const invitePayload = { email: "invited@example.com", role: "member" };
    const mockInvite = { id: 'invite-123', organization_id: mockOrgId, invited_email: invitePayload.email, role_to_assign: invitePayload.role, status: 'pending' };

    await t.step("should return 201 on successful invite by admin", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser,
            genericMockResults: {
                organization_members: { select: () => Promise.resolve({ data: [], error: null }) }, 
                invites: { 
                    select: () => Promise.resolve({ data: [], error: null }),
                    insert: (state: MockQueryBuilderState) => {
                        const insertData = state.insertData as any[];
                        assertEquals(insertData[0].organization_id, mockOrgId);
                        assertEquals(insertData[0].invited_email, invitePayload.email);
                        assertEquals(insertData[0].role_to_assign, invitePayload.role);
                        assertEquals(insertData[0].invited_by_user_id, mockAdminUser.id);
                        return Promise.resolve({ data: [mockInvite], error: null, count: 1 }); 
                    }
                } 
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("POST", `/organizations/${mockOrgId}/invites`, invitePayload);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 201); // 201 Created (or 200/204 depending on design)
        // Optionally check response body if invite details are returned
        const json = await res.json(); 
        assertEquals(json.id, mockInvite.id);
        assertEquals(json.invited_email, invitePayload.email);
    });

    await t.step("should return 403 if non-admin attempts invite", async () => {
        // Arrange - Mock RLS preventing the insert
        // This is tricky without a dedicated RPC. We simulate by having insert return an error
        // or by having a prior check (like is_org_admin RPC) fail.
        const mockNonAdmin = { id: 'non-admin-invites' };
        const config: MockSupabaseDataConfig = {
            mockUser: mockNonAdmin,
             genericMockResults: {
                 invites: { 
                     insert: () => Promise.resolve({ data: null, error: { message: "permission denied for table invites", code: "42501" } })
                 } 
             }
            // Alternative: Mock an RPC check for admin role failing
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("POST", `/organizations/${mockOrgId}/invites`, invitePayload);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 403);
        const json = await res.json();
        assertEquals(json.error, "Forbidden: You do not have permission to invite members to this organization.");
    });
    
    await t.step("should return 409 if user is already invited or member", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser,
            genericMockResults: {
                organization_members: { // Mock finding an existing active member
                    select: () => Promise.resolve({ data: [{ user_id: 'existing-user-id', email: invitePayload.email, status: 'active' }], error: null }) 
                }, 
                invites: { // Mock finding an existing pending invite (or check both)
                    select: () => Promise.resolve({ data: [], error: null })
                } 
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("POST", `/organizations/${mockOrgId}/invites`, invitePayload);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 409); // Conflict
        const json = await res.json();
        assertEquals(json.error, "User is already a member or has a pending invite.");
    });

     await t.step("should return 400 for invalid email or role", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = { mockUser: mockAdminUser };
        const { client: mockClient } = createMockSupabaseClient(config);
        const invalidPayload = { email: "not-an-email", role: "invalid-role" };
        const req = createMockRequest("POST", `/organizations/${mockOrgId}/invites`, invalidPayload);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 400);
        const json = await res.json();
        assert(json.error.includes("Invalid email address") || json.error.includes("Invalid role specified"));
    });
});

Deno.test("PUT /organizations/:orgId/members/:membershipId/role", async (t) => {
    const mockOrgId = 'org-update-role';
    const mockMembershipId = 'membership-to-update';
    const mockAdminUser = { id: 'admin-updates-role' };
    const rolePayload = { role: "admin" };
    const updatedMember = { id: mockMembershipId, organization_id: mockOrgId, role: "admin", status: 'active' };

    await t.step("should return 200/204 on successful role update by admin", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser,
            genericMockResults: {
                organization_members: {
                    update: (state: MockQueryBuilderState) => {
                        assertEquals(state.updateData, rolePayload);
                        const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                        assertEquals(idFilter?.value, mockMembershipId);
                        return Promise.resolve({ data: [updatedMember], error: null, count: 1 }); 
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}/members/${mockMembershipId}/role`, rolePayload);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
        // Optionally check body if 200 is returned
    });
    
    await t.step("should return 403 if non-admin attempts update", async () => {
        // Arrange
        const mockNonAdmin = { id: 'non-admin-updates-role' };
        const config: MockSupabaseDataConfig = {
            mockUser: mockNonAdmin,
            genericMockResults: {
                organization_members: {
                    update: () => Promise.resolve({ data: [], error: null, count: 0 })
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}/members/${mockMembershipId}/role`, rolePayload);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 403); // Or 404
        const json = await res.json();
        assertEquals(json.error, "Forbidden: You do not have permission to update member roles.");
    });

     await t.step("should return 400/409 if changing role of last admin", async () => {
        // Arrange: Simulate the DB trigger/check preventing the update
        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser,
            genericMockResults: {
                organization_members: { 
                    update: () => Promise.resolve({ data: null, error: { message: "Cannot remove last admin", code: "P0001" } })
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        // Payload attempts to change the role FROM admin (implicitly the last one in this mock)
        const demotePayload = { role: "member" }; 
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}/members/${mockMembershipId}/role`, demotePayload);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 409); // Conflict or maybe 400 Bad Request
        const json = await res.json();
        assert(json.error.includes("last admin"));
    });
});

Deno.test("DELETE /organizations/:orgId/members/:membershipId", async (t) => {
    const mockOrgId = 'org-remove-member';
    const mockMembershipId = 'membership-to-remove';
    const mockAdminUser = { id: 'admin-removes-member' };
    const mockUserBeingRemoved = { id: 'user-being-removed' }; // Assume this ID corresponds to mockMembershipId

    await t.step("should return 204 on successful removal by admin", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser,
            genericMockResults: {
                organization_members: { 
                    delete: (state: MockQueryBuilderState) => {
                         const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                         assertEquals(idFilter?.value, mockMembershipId);
                         return Promise.resolve({ data: [{ id: mockMembershipId }], error: null, count: 1 }); 
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}/members/${mockMembershipId}`);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 204); 
    });

    // Add test for self-removal if that logic is implemented

    await t.step("should return 403 if non-admin attempts removal of another member", async () => {
         // Arrange
        const mockNonAdmin = { id: 'non-admin-removes' };
        const config: MockSupabaseDataConfig = {
            mockUser: mockNonAdmin,
            genericMockResults: {
                organization_members: {
                    delete: () => Promise.resolve({ data: [], error: null, count: 0 })
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}/members/${mockMembershipId}`);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 403); // Or 404
        const json = await res.json();
        assertEquals(json.error, "Forbidden: You do not have permission to remove this member.");
    });

    await t.step("should return 400/409 if removing the last admin", async () => {
        // Arrange: Simulate the DB trigger/check preventing the delete
        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser, 
            genericMockResults: {
                organization_members: { 
                    delete: () => Promise.resolve({ data: null, error: { message: "Cannot remove last admin", code: "P0001" } })
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        // Assume mockMembershipId corresponds to the last admin
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}/members/${mockMembershipId}`);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 409); // Conflict or maybe 400 Bad Request
        const json = await res.json();
        assert(json.error.includes("last admin"));
    });
});

// --- Add test suites for other endpoints like invite accept/decline etc. --- 