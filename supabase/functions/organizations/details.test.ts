import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
// Import the specific handlers
import { 
    handleGetOrgDetails, 
    handleUpdateOrgDetails, 
    handleDeleteOrg 
} from "./details.ts"; 
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

// --- Test Suite for GET /organizations/:orgId --- 
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
                        if (idFilter?.value === mockOrgId && state.selectColumns === '*') { // Match the handler's select
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
        const res = await handleGetOrgDetails(req, mockClient, mockUser as User, mockOrgId);

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
                        if (idFilter?.value === mockOrgId && state.selectColumns === '*') { 
                             // Simulate RLS or not found by returning null
                            return Promise.resolve({ data: null, error: null }); 
                        }
                        return Promise.resolve({ data: null, error: new Error('Unexpected select') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("GET", `/organizations/${mockOrgId}`);

        // Act
        const res = await handleGetOrgDetails(req, mockClient, mockUser as User, mockOrgId);

        // Assert
        assertEquals(res.status, 404);
        const json = await res.json();
        assertEquals(json.error, "Organization not found or access denied.");
    });
});

// --- Test Suite for PUT /organizations/:orgId --- 
Deno.test("PUT /organizations/:orgId", async (t) => {
    const mockOrgId = 'org-update-details';
    const mockAdminUser = { id: 'admin-user-updates' };
    const mockNonAdminUser = { id: 'non-admin-user' };
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
        const res = await handleUpdateOrgDetails(req, mockClient, mockAdminUser as User, mockOrgId, updatePayload);

        // Assert
        assertEquals(res.status, 200);
        const json = await res.json();
        assertEquals(json.id, mockOrgId);
        assertEquals(json.name, updatePayload.name);
        assertEquals(json.visibility, updatePayload.visibility);
    });

    await t.step("should return 403 if RLS prevents update (non-admin or wrong org)", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockNonAdminUser, // Non-admin user
            genericMockResults: {
                organizations: {
                    update: (state: MockQueryBuilderState) => {
                        // RLS prevents update, returns null data and no error
                        return Promise.resolve({ data: null, error: null });
                    },
                    // Mock the existence check (returns org exists)
                    select: (state: MockQueryBuilderState) => {
                         const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                         if (idFilter?.value === mockOrgId && state.selectColumns === 'id') { 
                            return Promise.resolve({ data: [{id: mockOrgId}], error: null, count: 1 });
                        }
                         return Promise.resolve({ data: null, error: new Error('Unexpected select in PUT 403') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}`, updatePayload);

        // Act
        const res = await handleUpdateOrgDetails(req, mockClient, mockNonAdminUser as User, mockOrgId, updatePayload);

        // Assert
        assertEquals(res.status, 403); 
        const json = await res.json();
        assertEquals(json.error, "Forbidden: You do not have permission to update this organization.");
    });

    await t.step("should return 404 if org not found during update", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser, // Admin user
            genericMockResults: {
                organizations: {
                    update: (state: MockQueryBuilderState) => {
                        // Update returns null data
                        return Promise.resolve({ data: null, error: null });
                    },
                    // Mock the existence check (returns org not found)
                    select: (state: MockQueryBuilderState) => {
                        const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                         if (idFilter?.value === mockOrgId && state.selectColumns === 'id') { 
                            return Promise.resolve({ data: null, error: null, count: 0 }); // Simulate not found
                        }
                         return Promise.resolve({ data: null, error: new Error('Unexpected select in PUT 404') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}`, updatePayload);

        // Act
        const res = await handleUpdateOrgDetails(req, mockClient, mockAdminUser as User, mockOrgId, updatePayload);

        // Assert
        assertEquals(res.status, 404);
        const json = await res.json();
        assertEquals(json.error, "Organization not found.");
    });

     await t.step("should return 400 for invalid update payload", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = { mockUser: mockAdminUser }; 
        const { client: mockClient } = createMockSupabaseClient(config);
        const invalidPayload = { name: "" }; // Invalid name
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}`, invalidPayload);

        // Act
        const res = await handleUpdateOrgDetails(req, mockClient, mockAdminUser as User, mockOrgId, invalidPayload);

        // Assert
        assertEquals(res.status, 400);
        const json = await res.json();
        assertEquals(json.error, "Invalid update payload. Name must be at least 3 characters.");
    });
});

// --- Test Suite for DELETE /organizations/:orgId --- 
Deno.test("DELETE /organizations/:orgId", async (t) => {
    const mockOrgId = 'org-delete-test';
    const adminUserId = 'admin-user-deletes';
    const nonAdminUserId = 'non-admin-delete';
    const lastAdminUserId = 'last-admin-user'; 
    const mockNotFoundOrgId = 'org-delete-not-found';

    await t.step("should return 204 on successful soft delete by admin", async () => {
        // Arrange
        const mockUser = { id: adminUserId };
        const existingOrg = { id: mockOrgId }; // Data for existence check
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            rpcResults: {
                is_org_admin: () => Promise.resolve({ data: true, error: null })
            },
            genericMockResults: {
                organizations: {
                    // Mock the existence check - return the org
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'id' && f.value === mockOrgId && f.type === 'eq') && 
                            state.filters.some(f => f.column === 'deleted_at' && f.value === null && f.type === 'is') &&
                            state.selectColumns === 'id') 
                        {
                            console.log('[Test 204 Mock] Matched org existence check, returning org.');
                            return Promise.resolve({ data: [existingOrg], error: null, count: 1 });
                        }
                        console.warn('[Test 204 Mock] organizations.select did NOT match existence check. State:', state);
                        return Promise.resolve({ data: null, error: new Error('Unexpected org select in 204 test') });
                    },
                    // Mock the successful update for soft delete
                    update: (state: MockQueryBuilderState) => {
                        const idFilter = state.filters.find(f => f.column === 'id' && f.type === 'eq');
                        const deletedAtFilter = state.filters.find(f => f.column === 'deleted_at' && f.type === 'is');
                        assertEquals(idFilter?.value, mockOrgId);
                        assertEquals(deletedAtFilter?.value, null); // Check .is('deleted_at', null) filter
                        assert(state.updateData && typeof state.updateData === 'object' && 'deleted_at' in state.updateData);
                        console.log('[Test 204 Mock] Matched org update for soft delete.');
                        return Promise.resolve({ data: [{ id: mockOrgId }], error: null, count: 1 });
                    }
                },
                organization_members: {
                    // Mock last admin check: Returns multiple admins (count 2)
                    select: (state: MockQueryBuilderState) => {
                        // This mock is for the admin COUNT check
                         if (state.filters.some(f => f.column === 'organization_id' && f.value === mockOrgId) &&
                             state.filters.some(f => f.column === 'role' && f.value === 'admin') &&
                             state.filters.some(f => f.column === 'status' && f.value === 'active') &&
                             state.selectColumns === 'user_id' /* Check head:true ? count:exact? */) 
                         {
                            console.log('[Test 204 Mock] Matched member count check, returning count 2.');
                            // Return count 2 for the admin count query
                            // NOTE: The actual data might not matter if count: 'exact', head: true is used
                            return Promise.resolve({ data: [], error: null, count: 2 }); 
                         }
                         console.warn('[Test 204 Mock] organization_members.select did NOT match count check. State:', state);
                         return Promise.resolve({ data: null, error: new Error('Unexpected member select in 204 test') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}`);

        // Act
        const res = await handleDeleteOrg(req, mockClient, mockUser as User, mockOrgId);

        // Assert
        assertEquals(res.status, 204);
        assertEquals(await res.text(), ''); // No content
    });

    await t.step("should return 403 if non-admin attempts delete", async () => {
        // Arrange
        const mockUser = { id: nonAdminUserId };
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            rpcResults: {
                is_org_admin: () => Promise.resolve({ data: false, error: null }) // Non-admin
            }
            // No DB mocks needed as it fails on RPC check
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}`);

        // Act
        const res = await handleDeleteOrg(req, mockClient, mockUser as User, mockOrgId);

        // Assert
        assertEquals(res.status, 403);
        const json = await res.json();
        assertEquals(json.error, "Forbidden: You do not have permission to delete this organization.");
    });
    
    await t.step("should return 409 if last admin attempts delete", async () => {
        // Arrange
        const mockUser = { id: lastAdminUserId }; // Current user is the last admin
        const existingOrg = { id: mockOrgId };
        const lastAdminMembership = { id: 'membership-last-admin' };
        let adminCountCheckDone = false; // Flag to differentiate select calls

        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            rpcResults: {
                is_org_admin: () => Promise.resolve({ data: true, error: null }) // User IS admin
            },
            genericMockResults: {
                organizations: {
                     // Mock the existence check - return the org
                    select: (state: MockQueryBuilderState) => {
                        if (state.filters.some(f => f.column === 'id' && f.value === mockOrgId && f.type === 'eq') && 
                            state.filters.some(f => f.column === 'deleted_at' && f.value === null && f.type === 'is') &&
                            state.selectColumns === 'id') 
                        {
                             console.log('[Test 409 Mock] Matched org existence check, returning org.');
                            return Promise.resolve({ data: [existingOrg], error: null, count: 1 });
                        }
                        console.warn('[Test 409 Mock] organizations.select did NOT match existence check. State:', state);
                        return Promise.resolve({ data: null, error: new Error('Unexpected org select in 409 test') });
                    }
                },
                organization_members: {
                    select: (state: MockQueryBuilderState) => {
                        // First call: Admin COUNT check
                        if (!adminCountCheckDone && 
                            state.filters.some(f => f.column === 'organization_id' && f.value === mockOrgId) &&
                            state.filters.some(f => f.column === 'role' && f.value === 'admin') &&
                            state.filters.some(f => f.column === 'status' && f.value === 'active') &&
                            state.selectColumns === 'user_id' /* count:exact, head:true */) 
                        {
                            console.log('[Test 409 Mock] Matched member count check, returning count 1.');
                            adminCountCheckDone = true;
                            return Promise.resolve({ data: [], error: null, count: 1 }); // Return count 1
                        }
                        // Second call: Last admin IDENTITY check
                        else if (adminCountCheckDone &&
                                 state.filters.some(f => f.column === 'organization_id' && f.value === mockOrgId) &&
                                 state.filters.some(f => f.column === 'role' && f.value === 'admin') &&
                                 state.filters.some(f => f.column === 'status' && f.value === 'active') &&
                                 state.filters.some(f => f.column === 'user_id' && f.value === lastAdminUserId) && // Checking current user ID
                                 state.selectColumns === 'id')
                        {
                             console.log('[Test 409 Mock] Matched last admin identity check, returning membership.');
                            return Promise.resolve({ data: [lastAdminMembership], error: null, count: 1 }); // Return the user's membership
                        }
                        console.warn('[Test 409 Mock] organization_members.select did NOT match count OR identity check. State:', state);
                        return Promise.resolve({ data: null, error: new Error('Unexpected member select in 409 test') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}`);

        // Act
        const res = await handleDeleteOrg(req, mockClient, mockUser as User, mockOrgId);

        // Assert
        assertEquals(res.status, 409); // Conflict
        const json = await res.json();
        assertEquals(json.error, "Cannot delete organization: you are the last admin.");
    });

    await t.step("should return 404 if organization not found during delete", async () => {
        // Arrange
        const mockUser = { id: adminUserId }; // An admin user attempts delete
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            rpcResults: {
                is_org_admin: () => Promise.resolve({ data: true, error: null })
            },
            genericMockResults: {
                organizations: {
                    // Mock the existence check - return null
                    select: (state: MockQueryBuilderState) => {
                         if (state.filters.some(f => f.column === 'id' && f.value === mockNotFoundOrgId && f.type === 'eq') && 
                            state.filters.some(f => f.column === 'deleted_at' && f.value === null && f.type === 'is') &&
                            state.selectColumns === 'id') 
                        {
                             console.log('[Test 404 Mock] Matched org existence check, returning null (not found).');
                            return Promise.resolve({ data: null, error: null, count: 0 }); // Simulate not found
                        }
                        console.warn('[Test 404 Mock] organizations.select did NOT match existence check. State:', state);
                        return Promise.resolve({ data: null, error: new Error('Unexpected org select in 404 test') });
                    }
                }
                // No need to mock organization_members as it fails on the first check
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockNotFoundOrgId}`);

        // Act
        const res = await handleDeleteOrg(req, mockClient, mockUser as User, mockNotFoundOrgId);

        // Assert
        assertEquals(res.status, 404);
        const json = await res.json();
        // Correct the expected error message
        assertEquals(json.error, "Organization not found or already deleted."); 
    });
}); 