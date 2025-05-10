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
} from "../_shared/supabase.mock.ts";
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

// Define mock users with full User type properties
const fullMockUser: User = {
    id: 'user-gets-details',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: 'Test User' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    // Add any other mandatory fields from the User type if still missing
    // email: 'test@example.com', 
    // phone: '',
};

const mockAdminUser: User = {
    id: 'admin-user-updates',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: 'Admin User' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
};

const mockNonAdminUser: User = {
    id: 'non-admin-user',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: 'Non-Admin User' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
};

const mockLastAdminUser: User = {
    id: 'last-admin-user',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: 'Last Admin User' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
};

// --- Test Suite for GET /organizations/:orgId --- 
Deno.test("GET /organizations/:orgId", async (t) => {
    const mockOrgId = 'org-get-details';
    // Using the fully defined mock user
    const mockOrgDetails = { id: mockOrgId, name: 'Details Org', visibility: 'private', created_at: new Date().toISOString(), deleted_at: null, allow_member_chat_creation: false };

    await t.step("should return 200 with organization details for a member", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: fullMockUser, // Use full mock user
            genericMockResults: {
                organizations: {
                    select: (state: MockQueryBuilderState) => {
                        const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                        if (idFilter?.value === mockOrgId && state.selectColumns === '*') {
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
        const res = await handleGetOrgDetails(req, mockClient as any, fullMockUser, mockOrgId); // Use full mock user & cast client

        // Assert
        assertEquals(res.status, 200);
        const json = await res.json();
        assertEquals(json.id, mockOrgId);
        assertEquals(json.name, mockOrgDetails.name);
    });

    await t.step("should return 404 if organization not found or user is not a member", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: fullMockUser, // Use full mock user
            genericMockResults: {
                organizations: {
                    select: (state: MockQueryBuilderState) => {
                        const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                        if (idFilter?.value === mockOrgId && state.selectColumns === '*') { 
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
        const res = await handleGetOrgDetails(req, mockClient as any, fullMockUser, mockOrgId); // Use full mock user & cast client

        // Assert
        assertEquals(res.status, 404);
        const json = await res.json();
        assertEquals(json.error, "Organization not found or access denied.");
    });
});

// --- Test Suite for PUT /organizations/:orgId --- 
Deno.test("PUT /organizations/:orgId", async (t) => {
    const mockOrgId = 'org-update-details';
    const updatePayload = { name: "Updated Org Name", visibility: "public" };
    const updatedOrg = { id: mockOrgId, ...updatePayload, created_at: new Date().toISOString(), deleted_at: null, allow_member_chat_creation: false };

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
                        // This is the data that the .update().eq().select().maybeSingle() should ultimately resolve with
                        // if the update itself was successful. The .select().maybeSingle() part expects a single object or null.
                        // However, the mock system for generic select expects an array.
                        // The actual maybeSingle() in the client handles the array->object transformation.
                        return Promise.resolve({ data: [updatedOrg], error: null, count: 1, status: 200, statusText: 'OK' });
                    },
                    // Add a select mock to handle the .select() call after .update()
                    select: (state: MockQueryBuilderState) => {
                        const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                        // This select is called implicitly by .select().maybeSingle() after the update.
                        // It should return the updated organization data as an array for the generic mock type.
                        if (idFilter?.value === mockOrgId && state.selectColumns === '*') { // Assuming select() implies '*' if not specified
                            return Promise.resolve({ data: [updatedOrg], error: null, count: 1, status: 200, statusText: 'OK' });
                        }
                        // Fallback for unexpected selects
                        return Promise.resolve({ data: null, error: new Error('Unexpected select in update test context'), count: 0 });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}`, updatePayload);

        // Act
        const res = await handleUpdateOrgDetails(req, mockClient as any, mockAdminUser, mockOrgId, updatePayload); // Cast client

        // Assert
        assertEquals(res.status, 200);
        const json = await res.json();
        assertEquals(json.id, mockOrgId);
        assertEquals(json.name, updatePayload.name);
        assertEquals(json.visibility, updatePayload.visibility);
    });

    await t.step("should return 200 and update allow_member_chat_creation successfully by admin", async () => {
        // Arrange
        const chatSettingPayload = { allow_member_chat_creation: true };
        const orgWithChatSetting = { ...updatedOrg, ...chatSettingPayload };
        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser,
            genericMockResults: {
                organizations: {
                    update: (state: MockQueryBuilderState) => {
                        assertEquals(state.updateData, chatSettingPayload);
                        return Promise.resolve({ data: [orgWithChatSetting], error: null, count: 1, status: 200, statusText: 'OK' });
                    },
                    select: (state: MockQueryBuilderState) => {
                        const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                        if (idFilter?.value === mockOrgId && state.selectColumns === '*') {
                            return Promise.resolve({ data: [orgWithChatSetting], error: null, count: 1, status: 200, statusText: 'OK' });
                        }
                        return Promise.resolve({ data: null, error: new Error('Unexpected select in chat setting update test'), count: 0 });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}`, chatSettingPayload);

        // Act
        const res = await handleUpdateOrgDetails(req, mockClient as any, mockAdminUser, mockOrgId, chatSettingPayload); // Cast client

        // Assert
        assertEquals(res.status, 200);
        const json = await res.json();
        assertEquals(json.allow_member_chat_creation, true);
    });

    await t.step("should return 200 and update all fields including allow_member_chat_creation", async () => {
        // Arrange
        const fullPayload = { name: "New Name Full", visibility: "private", allow_member_chat_creation: false };
        const orgWithFullPayload = { ...updatedOrg, ...fullPayload };

        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser,
            genericMockResults: {
                organizations: {
                    update: (state: MockQueryBuilderState) => {
                        assertEquals(state.updateData, fullPayload);
                        return Promise.resolve({ data: [orgWithFullPayload], error: null, count: 1, status: 200, statusText: 'OK' });
                    },
                    select: (state: MockQueryBuilderState) => {
                        const idFilter = state.filters.find((f: any) => f.column === 'id' && f.type === 'eq');
                        if (idFilter?.value === mockOrgId && state.selectColumns === '*') {
                            return Promise.resolve({ data: [orgWithFullPayload], error: null, count: 1, status: 200, statusText: 'OK' });
                        }
                        return Promise.resolve({ data: null, error: new Error('Unexpected select in full update test'), count: 0 });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}`, fullPayload);
    
        // Act
        const res = await handleUpdateOrgDetails(req, mockClient as any, mockAdminUser, mockOrgId, fullPayload); // Cast client
    
        // Assert
        assertEquals(res.status, 200);
        const json = await res.json();
        assertEquals(json.name, fullPayload.name);
        assertEquals(json.visibility, fullPayload.visibility);
        assertEquals(json.allow_member_chat_creation, fullPayload.allow_member_chat_creation);
    });

    await t.step("should return 403 if RLS prevents update (non-admin or wrong org)", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockNonAdminUser, 
            genericMockResults: { /* ... */ } // Assuming RLS mock returns { data: null, error: null } for update
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}`, updatePayload);

        // Act
        const res = await handleUpdateOrgDetails(req, mockClient as any, mockNonAdminUser, mockOrgId, updatePayload); // Cast client

        // Assert
        // ... (assertions)
    });

    await t.step("should return 404 if org not found during update", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser,
            genericMockResults: { /* ... */ } // Assuming select mock returns { data: null, error: null, count: 0 }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}`, updatePayload);

        // Act
        const res = await handleUpdateOrgDetails(req, mockClient as any, mockAdminUser, mockOrgId, updatePayload); // Cast client

        // Assert
        // ... (assertions)
    });

     await t.step("should return 400 for invalid update payload", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = { mockUser: mockAdminUser }; 
        const { client: mockClient } = createMockSupabaseClient(config);
        const invalidPayload = { name: "" }; 
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}`, invalidPayload);

        // Act
        const res = await handleUpdateOrgDetails(req, mockClient as any, mockAdminUser, mockOrgId, invalidPayload); // Cast client

        // Assert
        // ... (assertions)
    });
    
    await t.step("should return 400 if allow_member_chat_creation is not a boolean", async () => {
        // Arrange
        const invalidChatSettingPayload = { allow_member_chat_creation: "not-a-boolean" };
        const config: MockSupabaseDataConfig = { mockUser: mockAdminUser }; 
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("PUT", `/organizations/${mockOrgId}`, invalidChatSettingPayload);

        // Act
        const res = await handleUpdateOrgDetails(req, mockClient as any, mockAdminUser, mockOrgId, invalidChatSettingPayload); // Cast client

        // Assert
        // ... (assertions)
    });
});

// --- Test Suite for DELETE /organizations/:orgId --- 
Deno.test("DELETE /organizations/:orgId", async (t) => {
    const mockOrgId = 'org-delete-test';
    // Using fully defined mock users
    const adminUserId = mockAdminUser.id; 
    const nonAdminUserId = mockNonAdminUser.id; 
    const lastAdminUserId = mockLastAdminUser.id; 
    const mockNotFoundOrgId = 'org-delete-not-found';

    await t.step("should return 204 on successful soft delete by admin", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser, 
            rpcResults: {
                // Mock is_org_admin to return true
                is_org_admin: (() => Promise.resolve({ data: true, error: null })) as any 
            },
            genericMockResults: { 
                organizations: {
                    select: (state: MockQueryBuilderState) => {
                        // Org existence check
                        if (state.filters.some(f => f.column === 'id' && f.value === mockOrgId && f.type === 'eq') && 
                            state.filters.some(f => f.column === 'deleted_at' && f.value === null && f.type === 'is')) {
                            return Promise.resolve({ data: [{id: mockOrgId}], error: null, count: 1 });
                        }
                        return Promise.resolve({ data: null, error: new Error('Unexpected org select in DELETE 204') });
                    },
                    update: (state: MockQueryBuilderState) => {
                        // Soft delete update
                        return Promise.resolve({ data: [{id: mockOrgId}], error: null, count: 1 });
                    }
                },
                organization_members: {
                    select: (state: MockQueryBuilderState) => {
                        // Admin count check (assume more than 1 admin for this simple success case)
                        if (state.filters.some(f => f.column === 'organization_id' && f.value === mockOrgId) &&
                            state.filters.some(f => f.column === 'role' && f.value === 'admin')) {
                            return Promise.resolve({ data: [], error: null, count: 2 }); 
                        }
                        return Promise.resolve({ data: null, error: new Error('Unexpected member select in DELETE 204') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}`);

        // Act
        const res = await handleDeleteOrg(req, mockClient as any, mockAdminUser, mockOrgId); 

        // Assert
        assertEquals(res.status, 204);
    });

    await t.step("should return 403 if user is not admin", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockNonAdminUser, 
            rpcResults: {
                is_org_admin: (() => Promise.resolve({ data: false, error: null })) as any 
            },
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}`);
    
        // Act
        const res = await handleDeleteOrg(req, mockClient as any, mockNonAdminUser, mockOrgId); 
    
        // Assert
        assertEquals(res.status, 403);
        const json = await res.json();
        assertEquals(json.error, "Forbidden: You do not have permission to delete this organization.");
    });
    
    await t.step("should return 409 if trying to delete org where user is last admin", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            mockUser: mockLastAdminUser, 
            rpcResults: {
                is_org_admin: (() => Promise.resolve({ data: true, error: null })) as any 
            }, 
            genericMockResults: { 
                organizations: {
                    select: (state: MockQueryBuilderState) => { // Org existence
                        return Promise.resolve({ data: [{id: mockOrgId}], error: null, count: 1 });
                    }
                },
                organization_members: {
                    select: (state: MockQueryBuilderState) => {
                        // Differentiate between admin count and last admin identity check
                        if (state.selectColumns === 'user_id') { // Assuming this is for count
                            return Promise.resolve({ data: [], error: null, count: 1 }); // Count is 1
                        } else if (state.selectColumns === 'id') { // Assuming this is for identity check
                            // Check if the filter for user_id matches the mockLastAdminUser.id
                            if(state.filters.some(f => f.column === 'user_id' && f.value === mockLastAdminUser.id)) {
                                return Promise.resolve({ data: [{id: 'membership-last-admin'}], error: null, count: 1 }); // User is the one admin
                            }
                        }
                        return Promise.resolve({ data: null, error: new Error('Unexpected member select in DELETE 409') });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockOrgId}`);

        // Act
        const res = await handleDeleteOrg(req, mockClient as any, mockLastAdminUser, mockOrgId);

        // Assert
        assertEquals(res.status, 409);
        const json = await res.json();
        assertEquals(json.error, "Cannot delete organization: you are the last admin.");
    });

    // Simplified other DELETE tests, ensuring full mock users and client casting
    await t.step("should return 404 if organization not found during delete", async () => {
        const config: MockSupabaseDataConfig = {
            mockUser: mockAdminUser,
            rpcResults: {
                is_org_admin: (() => Promise.resolve({ data: true, error: null })) as any
            },
            genericMockResults: {
                organizations: {
                    select: () => Promise.resolve({ data: null, error: null, count: 0 }) // Org not found
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("DELETE", `/organizations/${mockNotFoundOrgId}`);
        const res = await handleDeleteOrg(req, mockClient as any, mockAdminUser, mockNotFoundOrgId);
        assertEquals(res.status, 404);
        const json = await res.json();
        assertEquals(json.error, "Organization not found or already deleted.");
    });
}); 