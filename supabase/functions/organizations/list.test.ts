import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleListOrganizations } from "./list.ts"; 
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

// --- Test Suite for GET /organizations --- 
Deno.test("GET /organizations", async (t) => {
    await t.step("should return 200 with a list of organizations for the authenticated user", async () => {
        // Arrange
        const mockUser = { id: 'user-gets-orgs' };
        const mockOrgs = [
            { organizations: { id: 'org1', name: 'Org One', visibility: 'private', created_at: new Date().toISOString() } },
            { organizations: { id: 'org2', name: 'Org Two', visibility: 'public', created_at: new Date().toISOString() } }
        ];
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            genericMockResults: {
                organization_members: { 
                    select: (state: MockQueryBuilderState) => {
                        const userFilter = state.filters.find((f: any) => f.column === 'user_id' && f.value === mockUser.id);
                        const statusFilter = state.filters.find((f: any) => f.column === 'status' && f.value === 'active');
                        if (userFilter && statusFilter) {
                            // Ensure the select string matches the handler's select
                            assert(state.selectColumns?.includes('organizations'), 'Select string should include organizations join');
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
        const res = await handleListOrganizations(req, mockClient, mockUser as User);

        // Assert
        assertEquals(res.status, 200);
        const json = await res.json();
        assert(Array.isArray(json), "Response should be an array");
        assertEquals(json.length, mockOrgs.length);
        assertEquals(json[0].id, mockOrgs[0].organizations.id);
        assertEquals(json[1].name, mockOrgs[1].organizations.name);
    });

    // Note: Auth failure (401) is typically handled before specific endpoint logic,
    // so it might remain in the main index.ts tests or shared tests.
    /* 
    await t.step("should return 401 if user is not authenticated", async () => {
        // Arrange
        const config: MockSupabaseDataConfig = { simulateAuthError: new Error("Auth required") };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("GET", "/organizations");
        req.headers.delete('Authorization');

        // Act
        // const res = await handleListOrganizations(req, mockClient, null); // Would fail earlier

        // Assert
        // assertEquals(res.status, 401);
    });
    */
}); 