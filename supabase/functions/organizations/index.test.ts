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
        assertEquals(json.error?.message, "Unauthorized", "Expected error message to be 'Unauthorized'"); // Check the message property
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
            // Mock the structure returned by the query, including the nested organizations object
            { organizations: { id: 'org1', name: 'Org One', visibility: 'private', created_at: new Date().toISOString() } },
            { organizations: { id: 'org2', name: 'Org Two', visibility: 'public', created_at: new Date().toISOString() } }
        ];
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            genericMockResults: {
                organization_members: { // Mock the organization_members table
                    select: (state: MockQueryBuilderState) => {
                        // Check if the query is for the specific user and status
                        const userFilter = state.filters.find((f: any) => f.column === 'user_id' && f.value === mockUser.id);
                        const statusFilter = state.filters.find((f: any) => f.column === 'status' && f.value === 'active');
                        if (userFilter && statusFilter) {
                            return Promise.resolve({ data: mockOrgs, error: null, count: mockOrgs.length });
                        }
                        return Promise.resolve({ data: null, error: new Error('Unexpected select in GET /organizations test') });
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
        assertEquals(json[0].id, mockOrgs[0].organizations.id);
        assertEquals(json[1].name, mockOrgs[1].organizations.name);
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
    const adminUserId = 'admin-user-deletes';
    const nonAdminUserId = 'non-admin-delete';
    const lastAdminUserId = 'last-admin-user'; // Use a distinct ID for clarity

    await t.step("should return 204 on successful soft delete by admin", async () => {
        // Arrange
        const mockUser = { id: adminUserId };
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            rpcResults: {
                // Mock admin check: Success
                is_org_admin: () => {
                    return Promise.resolve({ data: true, error: null });
                }
            },
            genericMockResults: {
                organization_members: {
                    // Mock last admin check: Returns multiple admins or not the current user
                    select: (state: MockQueryBuilderState) => {
                        assertEquals(state.filters.find(f => f.column === 'organization_id')?.value, mockOrgId);
                        assertEquals(state.filters.find(f => f.column === 'role')?.value, 'admin');
                        assertEquals(state.filters.find(f => f.column === 'status')?.value, 'active');
                        // Return multiple admins, or one admin that isn't the current user
                        return Promise.resolve({ data: [{ user_id: 'other-admin-id' }, { user_id: adminUserId }], error: null });
                    }
                },
                organizations: {
                    // Mock the successful update for soft delete
                    update: (state: MockQueryBuilderState) => {
                        assertEquals(state.filters.find(f => f.column === 'id')?.value, mockOrgId);
                        return Promise.resolve({ data: [{ id: mockOrgId }], error: null, count: 1 });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}`);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 204);
        // No body assertion needed for 204
    });

    await t.step("should return 403 if non-admin attempts delete", async () => {
        // Arrange
        const mockUser = { id: nonAdminUserId };
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            rpcResults: {
                // Mock admin check: Fails (user is not admin)
                is_org_admin: () => {
                    return Promise.resolve({ data: false, error: null });
                }
            }
            // No query builder mocks needed as it should fail at the RPC check
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}`);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 403);
        const json = await res.json();
        assertEquals(json.error, "Forbidden: You do not have permission to delete this organization.");
    });
    
    await t.step("should return 409 if last admin attempts delete", async () => {
        // Arrange
        const mockUser = { id: lastAdminUserId }; // Use the specific last admin ID
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            rpcResults: {
                // Mock admin check: Success
                is_org_admin: () => {
                    return Promise.resolve({ data: true, error: null });
                }
            },
            genericMockResults: {
                organization_members: {
                    // Mock last admin check: Returns ONLY the current user as admin
                    select: (state: MockQueryBuilderState) => {
                        assertEquals(state.filters.find(f => f.column === 'organization_id')?.value, mockOrgId);
                        assertEquals(state.filters.find(f => f.column === 'role')?.value, 'admin');
                        assertEquals(state.filters.find(f => f.column === 'status')?.value, 'active');
                        // Return only the current user
                        return Promise.resolve({ data: [{ user_id: lastAdminUserId }], error: null });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}`);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 409);
        const json = await res.json();
        assertEquals(json.error, "Conflict: Cannot delete organization as you are the only administrator.");
    });

    await t.step("should return 404 if organization not found", async () => {
        // Arrange
        const nonExistentOrgId = 'org-delete-not-found'; // Use a distinct ID
        const mockUser = { id: adminUserId }; // An admin user
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            rpcResults: {
                // Mock admin check: Success (admin is trying)
                is_org_admin: () => {
                    return Promise.resolve({ data: true, error: null });
                }
            },
            genericMockResults: {
                organization_members: {
                    // Mock last admin check: Pass (return multiple admins)
                    select: (state: MockQueryBuilderState) => {
                        assertEquals(state.filters.find(f => f.column === 'organization_id')?.value, nonExistentOrgId);
                        return Promise.resolve({ data: [{ user_id: 'other-admin' }, { user_id: adminUserId }], error: null });
                    }
                },
                organizations: {
                    // Mock the update failing (count 0)
                    update: (state: MockQueryBuilderState) => {
                        assertEquals(state.filters.find(f => f.column === 'id')?.value, nonExistentOrgId);
                        return Promise.resolve({ data: null, error: null, count: 0 });
                    },
                    // Mock the existence check: Fails (org does not exist)
                    select: (state: MockQueryBuilderState) => {
                        assertEquals(state.filters.find(f => f.column === 'id')?.value, nonExistentOrgId);
                        // Check if it's the existence check based on selection/head option
                        if (state.selectColumns === 'id') {
                            return Promise.resolve({ data: null, error: null, count: 0 });
                        }
                        return Promise.resolve({ data: null, error: new Error("Unexpected select in DELETE 404 test") });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${nonExistentOrgId}`);

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 404);
        const json = await res.json();
        assertEquals(json.error, "Not Found: Organization not found.");
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
                organization_members: { // This table is queried
                    select: (state: MockQueryBuilderState) => {
                        // Check if this is the membership count check (head request)
                        const isMembershipCheck = state.filters.some(f => f.column === 'user_id' && f.value === mockUser.id)
                                               && state.filters.some(f => f.column === 'status' && f.value === 'active')
                                               && state.filters.some(f => f.column === 'organization_id' && f.value === mockOrgId)
                                               && state.selectColumns === 'id'; 

                        if (isMembershipCheck) {
                            // For the 403 test, return count 0, simulating user not an active member
                            console.log(`[Mock QB organization_members] Mocking membership check for user ${mockUser.id} in org ${mockOrgId}: Returning count 0`);
                            return Promise.resolve({ data: null, error: null, count: 0 }); 
                        } else if (state.filters.some(f => f.column === 'organization_id' && f.value === mockOrgId)) {
                            // Handle the initial select for members list (can return empty or mock data, doesn't matter as the check should fail first)
                            return Promise.resolve({ data: [], error: null });
                        } else {
                            // Fallback for unexpected selects on this table in this test
                            console.error("[Mock QB organization_members] Unexpected select query in GET members 403 test:", state);
                            return Promise.resolve({ data: null, error: new Error('Unexpected select query in GET members 403 test') });
                        }
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
    const adminUserId = 'admin-invites';
    const nonAdminUserId = 'non-admin-invites';
    const inviteEmail = 'invited@example.com';
    const inviteRole = 'member';
    const mockInviteId = 'invite-123';
    const mockInviteToken = 'mock-token-uuid';

    await t.step("should return 201 on successful invite by admin", async () => {
        // Arrange
        const mockUser = { id: adminUserId };
        const mockNewInvite = {
            id: mockInviteId,
            organization_id: mockOrgId,
            invited_email: inviteEmail,
            role_to_assign: inviteRole,
            invited_by_user_id: adminUserId,
            invite_token: mockInviteToken,
            status: 'pending',
            created_at: new Date().toISOString()
        };
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            rpcResults: {
                // Mock admin check: Success
                is_org_admin: () => {
                    return Promise.resolve({ data: true, error: null });
                }
            },
            genericMockResults: {
                organization_members: {
                    // Mock existing member check: No existing member found
                    select: (state: MockQueryBuilderState) => {
                        const emailFilter = state.filters.find(f => f.column === 'profiles!inner(email)');
                        if (emailFilter?.value === inviteEmail) {
                            return Promise.resolve({ data: null, error: null, count: 0 }); // No member found
                        }
                        return Promise.resolve({ data: null, error: new Error("Unexpected member select in POST invite test") });
                    }
                },
                invites: {
                    // Mock existing invite check: No existing invite found
                    select: (state: MockQueryBuilderState) => {
                        const emailFilter = state.filters.find(f => f.column === 'invited_email');
                        if (emailFilter?.value === inviteEmail && state.filters.some(f=> f.column === 'status' && f.value === 'pending')) {
                            return Promise.resolve({ data: null, error: null, count: 0 }); // No invite found
                        }
                        return Promise.resolve({ data: null, error: new Error("Unexpected invite select in POST invite test") });
                    },
                    // Mock insert: Success
                    insert: (state: MockQueryBuilderState) => {
                        // Assuming insertData is the single object payload for single inserts
                        const insertedRow = state.insertData as any; 
                        assertEquals(insertedRow?.organization_id, mockOrgId);
                        assertEquals(insertedRow?.invited_email, inviteEmail);
                        assertEquals(insertedRow?.role_to_assign, inviteRole);
                        assertEquals(insertedRow?.invited_by_user_id, adminUserId);
                        assertExists(insertedRow?.invite_token);
                        // Return the data for the created invite
                        return Promise.resolve({ data: [mockNewInvite], error: null, count: 1 });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("POST", `/organizations/${mockOrgId}/invites`, { email: inviteEmail, role: inviteRole });

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 201);
        const json = await res.json();
        assertEquals(json.id, mockInviteId);
        assertEquals(json.invited_email, inviteEmail);
        assertEquals(json.role_to_assign, inviteRole);
        assertEquals(json.status, 'pending');
    });

    await t.step("should return 403 if non-admin attempts invite", async () => {
        // Arrange
        const mockUser = { id: nonAdminUserId };
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            rpcResults: {
                // Mock admin check: Fails
                is_org_admin: () => {
                    return Promise.resolve({ data: false, error: null });
                }
            }
            // No QB mocks needed
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("POST", `/organizations/${mockOrgId}/invites`, { email: inviteEmail, role: inviteRole });

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 403);
        const json = await res.json();
        assertEquals(json.error, "Forbidden: You do not have permission to invite members to this organization.");
    });
    
    await t.step("should return 409 if user is already invited or member", async () => {
        // Arrange
        const mockUser = { id: adminUserId };
        const existingMember = { user_id: 'existing-user-id', status: 'active' }; // Or status: 'pending'
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            rpcResults: {
                // Mock admin check: Success
                is_org_admin: () => {
                    return Promise.resolve({ data: true, error: null });
                }
            },
            genericMockResults: {
                organization_members: {
                    // Mock existing member check: Found
                    select: (state: MockQueryBuilderState) => {
                        // Mock existing member check: Found
                        const emailFilter = state.filters.find(f => f.column === 'profiles!inner(email)');
                        if (emailFilter?.value === inviteEmail) {
                            return Promise.resolve({ data: [existingMember], error: null, count: 1 }); // Member found
                        }
                        return Promise.resolve({ data: null, error: null, count: 0 });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("POST", `/organizations/${mockOrgId}/invites`, { email: inviteEmail, role: inviteRole });

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assertEquals(res.status, 409); // Conflict
        const json = await res.json();
        assertEquals(json.error, "User is already a member or has a pending invite.");
    });

     await t.step("should return 400 for invalid email or role", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = { mockUser: { id: adminUserId } };
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
    const adminUserId = 'admin-updates-role';
    const nonAdminUserId = 'non-admin-updates-role';
    const lastAdminUserId = 'last-admin-in-role-test'; // Distinct ID

    await t.step("should return 200/204 on successful role update by admin", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: { id: adminUserId },
            genericMockResults: {
                organization_members: {
                    update: (state: MockQueryBuilderState) => {
                        assertEquals(state.updateData, { role: "admin" });
                        const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                        assertEquals(idFilter?.value, mockMembershipId);
                        return Promise.resolve({ data: [{ id: mockMembershipId, role: "admin" }], error: null, count: 1 }); 
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}/members/${mockMembershipId}/role`, { role: "admin" });

        // Act
        const res = await handleOrganizationRequest(req, mockClient);

        // Assert
        assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
        // No body assertion for 204
    });
    
    await t.step("should return 403 if non-admin attempts update", async () => {
        // Arrange
        const mockUser = nonAdminUserId;
        const config: MockSupabaseDataConfig = {
            mockUser: { id: mockUser },
            genericMockResults: {
                organization_members: {
                    update: () => Promise.resolve({ data: [], error: null, count: 0 })
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}/members/${mockMembershipId}/role`, { role: "admin" });

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
            mockUser: { id: adminUserId },
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