import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
// Update the import path for the handler
import { handleCreateOrganization } from "./create.ts"; 
import { 
    createMockSupabaseClient, 
    MockSupabaseDataConfig, 
    MockQueryBuilderState 
} from "../_shared/supabase.mock.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
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

// --- Test Suite for POST /organizations --- 
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
        const body = { name: mockOrgName, visibility: mockOrgVisibility }; // Pass body separately

        // Act
        // Call the specific handler now
        const res = await handleCreateOrganization(req, mockClient, mockUser as User, body); 

        // Assert
        assertEquals(res.status, 201);
        const json = await res.json();
        assertEquals(json.id, mockNewOrgId);
        assertEquals(json.name, mockOrgName);
        assertEquals(json.visibility, mockOrgVisibility);
        assertExists(json.created_at);
        assert(spies.rpcSpy.calls.length > 0, "RPC spy was not called"); 
        const rpcArgs = spies.rpcSpy.calls[0].args; 
        assertEquals(rpcArgs[0], 'create_org_and_admin_member'); 
        assertEquals(rpcArgs[1]?.p_user_id, mockUser.id); 
        assertEquals(rpcArgs[1]?.p_org_name, mockOrgName);
        assertEquals(rpcArgs[1]?.p_org_visibility, mockOrgVisibility);
    });

    // Note: Auth failure (401) is typically handled before specific endpoint logic,
    // so it might remain in the main index.ts tests or shared tests.
    // For now, we comment it out here as it's not handled within handleCreateOrganization.
    /*
    await t.step("should return 401 if user is not authenticated", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = {
            simulateAuthError: new Error("Authentication required")
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("POST", "/organizations", { name: "Auth Test Org" });
        req.headers.delete('Authorization'); 
        const body = { name: "Auth Test Org" };

        // Act
        // This would typically be caught before handleCreateOrganization is called
        // const res = await handleCreateOrganization(req, mockClient, null, body); 

        // Assert
        // assertEquals(res.status, 401); 
        // ...
    });
    */

    await t.step("should return 400 if name is missing", async () => {
        // Arrange
        const mockUser = { id: 'user-validation-test' };
        const config: MockSupabaseDataConfig = { mockUser }; 
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("POST", "/organizations", { visibility: "private" });
        const body = { visibility: "private" }; // Missing name

        // Act
        const res = await handleCreateOrganization(req, mockClient, mockUser as User, body);

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
        const body = { name: "ab" };

        // Act
        const res = await handleCreateOrganization(req, mockClient, mockUser as User, body);

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
            rpcResults: { 
                 create_org_and_admin_member: () => Promise.resolve({ data: null, error: rpcError })
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("POST", "/organizations", { name: "RPC Fail Test Org" });
        const body = { name: "RPC Fail Test Org" };

        // Act
        const res = await handleCreateOrganization(req, mockClient, mockUser as User, body);

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
            rpcResults: { 
                create_org_and_admin_member: () => Promise.resolve({ data: mockNewOrgId, error: null })
            },
            genericMockResults: {
                organizations: {
                    select: (state: MockQueryBuilderState) => { 
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
        const body = { name: "Org Fetch Fail Test" };

        // Act
        const res = await handleCreateOrganization(req, mockClient, mockUser as User, body);

        // Assert
        assertEquals(res.status, 500);
        const json = await res.json();
        assertEquals(json.error, "Organization created, but failed to fetch details.");
    });
}); 