import { assertEquals, assert, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleListOrganizations } from "./list.ts"; 
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
 
        // Assert response structure (object with 'organizations' array and 'totalCount')
        assertExists(json.organizations, "Response should have an 'organizations' property");
        assert(Array.isArray(json.organizations), "Response organizations should be an array");
        assertEquals(json.organizations.length, 2, "Should return 2 organizations in the array");
        assertExists(json.totalCount, "Response should have a 'totalCount' property");
        assertEquals(json.totalCount, 2, "Total count should be 2");

        // Check properties of the first organization within the 'organizations' array
        const org1 = json.organizations[0];
        assertExists(org1.id);
        assertExists(org1.name);
        assertEquals(org1.name, "Org One"); // Example check based on mock data
    });

    await t.step("should return specific page and limit based on query params", async () => {
        // Arrange
        const mockUser = { id: 'user-paginates-orgs' };
        const mockOrgPage = [
            { organizations: { id: 'org3', name: 'Org Three', visibility: 'private', created_at: new Date().toISOString() } }
            // Assume page 2 only has one item for limit 5, but total is more
        ];
        const totalMockOrgs = 7; // Example total count
        const requestedPage = 2;
        const requestedLimit = 5;
        const expectedStartIndex = 5; // (2 - 1) * 5
        const expectedEndIndex = 9; // 5 + 5 - 1

        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            genericMockResults: {
                organization_members: { 
                    select: (state: MockQueryBuilderState) => {
                        // Verify pagination range is applied correctly
                        assertEquals(state.rangeFrom, expectedStartIndex, "Range start index should match calculation");
                        assertEquals(state.rangeTo, expectedEndIndex, "Range end index should match calculation");
                        // Return the specific page data and the total count
                        return Promise.resolve({ data: mockOrgPage, error: null, count: totalMockOrgs });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("GET", `/organizations?page=${requestedPage}&limit=${requestedLimit}`);

        // Act
        const res = await handleListOrganizations(req, mockClient, mockUser as User);

        // Assert
        assertEquals(res.status, 200);
        const json = await res.json();

        assertExists(json.organizations, "Response should have 'organizations' property");
        assertEquals(json.organizations.length, mockOrgPage.length, "Should return correct number of orgs for the page");
        assertExists(json.totalCount, "Response should have 'totalCount' property");
        assertEquals(json.totalCount, totalMockOrgs, "Total count should reflect all organizations");
        assertEquals(json.organizations[0].id, 'org3', "Correct organization ID for the page");
    });

    await t.step("should return empty array and zero count if user has no organizations", async () => {
        // Arrange
        const mockUser = { id: 'user-no-orgs' };
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            genericMockResults: {
                organization_members: { 
                    select: () => {
                        // Simulate DB returning no rows and count 0
                        return Promise.resolve({ data: [], error: null, count: 0 });
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

        assertExists(json.organizations, "Response should have 'organizations' property");
        assertEquals(json.organizations.length, 0, "Organizations array should be empty");
        assertExists(json.totalCount, "Response should have 'totalCount' property");
        assertEquals(json.totalCount, 0, "Total count should be 0");
    });

    await t.step("should return 500 if database query fails", async () => {
        // Arrange
        const mockUser = { id: 'user-db-error' };
        const dbError = { message: 'Connection timed out', code: 'PGRST00' }; // Example DB error
        const config: MockSupabaseDataConfig = {
            mockUser: mockUser,
            genericMockResults: {
                organization_members: { 
                    select: () => {
                        // Simulate DB query returning an error
                        return Promise.resolve({ data: null, error: dbError, count: null });
                    }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(config);
        const req = createMockRequest("GET", "/organizations");

        // Act
        const res = await handleListOrganizations(req, mockClient, mockUser as User);

        // Assert
        assertEquals(res.status, 500);
        const json = await res.json();
        assertEquals(json.error, "Failed to retrieve organizations.");
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