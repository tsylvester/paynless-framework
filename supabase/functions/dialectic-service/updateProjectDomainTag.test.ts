import { assertEquals, assertExists, assertObjectMatch } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.192.0/testing/bdd.ts";
import { stub, type Stub } from "https://deno.land/std@0.192.0/testing/mock.ts";

import { updateProjectDomainTag } from './updateProjectDomainTag.ts';
import type { UpdateProjectDomainTagPayload, DialecticProject } from "./dialectic.interface.ts";
import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig,
    type IMockSupabaseClient,
    type MockSupabaseClientSetup,
    type MockQueryBuilderState
} from '../_shared/supabase.mock.ts';
import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";

// --- START: Local DI Interfaces from updateProjectDomainTag.ts ---
interface User {
  id: string;
}
interface AuthError {
    message: string;
    status?: number;
}
interface GetUserFnResult {
  data: { user: User | null };
  error: AuthError | null;
}
interface GetUserFn {
  (): Promise<GetUserFnResult>;
}
interface IsValidDomainTagFn {
  (dbClient: SupabaseClient, domainTag: string): Promise<boolean>;
}
// --- END: Local DI Interfaces ---

// Helper objects for stubbing
const mockAuthFunctions = {
    getUser: async (): Promise<GetUserFnResult> => ({ data: { user: { id: 'default-user' } }, error: null })
};

const mockValidationFunctions = {
    isValidTag: async (_dbClient: SupabaseClient, _domainTag: string): Promise<boolean> => true
};

describe('updateProjectDomainTag', () => {
    let mockGetUserFnStub: Stub<typeof mockAuthFunctions, [], Promise<GetUserFnResult>>;
    let mockIsValidDomainTagFnStub: Stub<typeof mockValidationFunctions, [SupabaseClient, string], Promise<boolean>>;
    let mockSupabaseSetup: MockSupabaseClientSetup;
    let mockDbAdminClient: IMockSupabaseClient;

    const defaultUserId = 'test-user-123';
    const defaultProjectId = 'project-abc-789';
    const mockDate = new Date().toISOString();
    const defaultInitialPrompt = "Initial prompt";
    const defaultRepoUrl = "https://example.com/repo.git";
    const defaultStatus = "active";

    beforeEach(() => {
        // Stub the methods on the helper objects
        mockGetUserFnStub = stub(mockAuthFunctions, "getUser", async () => ({ data: { user: { id: defaultUserId } }, error: null }));
        mockIsValidDomainTagFnStub = stub(mockValidationFunctions, "isValidTag", async () => true); 

        const defaultConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_projects: {
                    update: async () => ({
                        data: [{
                            id: defaultProjectId, 
                            user_id: defaultUserId, 
                            project_name: 'Test Project', 
                            initial_user_prompt: defaultInitialPrompt,
                            selected_domain_tag: 'new-tag', 
                            repo_url: defaultRepoUrl,
                            status: defaultStatus,
                            created_at: mockDate, 
                            updated_at: mockDate 
                        } as DialecticProject],
                        error: null, count: 1, status: 200, statusText: 'OK'
                    })
                }
            }
        };
        mockSupabaseSetup = createMockSupabaseClient(defaultUserId, defaultConfig);
        mockDbAdminClient = mockSupabaseSetup.client;
    });

    afterEach(() => {
        mockGetUserFnStub.restore();
        mockIsValidDomainTagFnStub.restore();
        if (mockSupabaseSetup && mockSupabaseSetup.clearAllStubs) {
            mockSupabaseSetup.clearAllStubs();
        }
    });

    it('should return error if projectId is missing', async () => {
        const payload: UpdateProjectDomainTagPayload = { projectId: '', domainTag: 'test' };
        const result = await updateProjectDomainTag(mockAuthFunctions.getUser, mockDbAdminClient as any, mockValidationFunctions.isValidTag, payload);
        
        assertExists(result.error);
        assertEquals(result.error.message, 'projectId is required');
        assertEquals(result.error.status, 400);
        assertEquals(result.error.code, 'VALIDATION_ERROR');
    });

    it('should return error if user is not authenticated', async () => {
        mockGetUserFnStub.restore(); // restore default stub
        mockGetUserFnStub = stub(mockAuthFunctions, "getUser", async () => ({ data: { user: null }, error: { message: "Auth failed"} }));
        const payload: UpdateProjectDomainTagPayload = { projectId: defaultProjectId, domainTag: 'test' };
        const result = await updateProjectDomainTag(mockAuthFunctions.getUser, mockDbAdminClient as any, mockValidationFunctions.isValidTag, payload);

        assertExists(result.error);
        assertEquals(result.error.message, 'User not authenticated');
        assertEquals(result.error.status, 401);
        assertEquals(result.error.code, 'AUTH_ERROR');
    });

    it('should return error if domainTag is invalid', async () => {
        mockIsValidDomainTagFnStub.restore();
        mockIsValidDomainTagFnStub = stub(mockValidationFunctions, "isValidTag", async () => false);
        const payload: UpdateProjectDomainTagPayload = { projectId: defaultProjectId, domainTag: 'invalid-tag' };
        const result = await updateProjectDomainTag(mockAuthFunctions.getUser, mockDbAdminClient as any, mockValidationFunctions.isValidTag, payload);

        assertExists(result.error);
        assertEquals(result.error.message, 'Invalid domainTag: "invalid-tag"');
        assertEquals(result.error.status, 400);
        assertEquals(result.error.code, 'INVALID_DOMAIN_TAG');
    });

    it('should successfully update domainTag to a new value', async () => {
        const newTag = 'awesome-tag';
        const payload: UpdateProjectDomainTagPayload = { projectId: defaultProjectId, domainTag: newTag };
        
        const expectedData: DialecticProject = { 
            id: defaultProjectId, 
            user_id: defaultUserId, 
            project_name: 'Test Project', 
            initial_user_prompt: defaultInitialPrompt,
            selected_domain_tag: newTag, 
            repo_url: defaultRepoUrl,
            status: defaultStatus,
            created_at: mockDate, 
            updated_at: mockDate 
        }; 

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_projects: {
                    update: async (state: MockQueryBuilderState) => { 
                        assertEquals((state.updateData as Partial<DialecticProject>)?.selected_domain_tag, newTag);
                        return {
                            data: [expectedData],
                            error: null, count: 1, status: 200, statusText: 'OK'
                        };
                    }
                }
            }
        };
        if (mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
        mockSupabaseSetup = createMockSupabaseClient(defaultUserId, config);
        mockDbAdminClient = mockSupabaseSetup.client;

        const result = await updateProjectDomainTag(mockAuthFunctions.getUser, mockDbAdminClient as any, mockValidationFunctions.isValidTag, payload);

        assertExists(result.data);
        assertEquals(result.error, undefined);
        assertObjectMatch(result.data as DialecticProject, { id: defaultProjectId, selected_domain_tag: newTag });
        assertEquals(mockIsValidDomainTagFnStub.calls.length, 1);
    });

    it('should successfully update domainTag to null', async () => {
        const payload: UpdateProjectDomainTagPayload = { projectId: defaultProjectId, domainTag: null };
        const expectedData: DialecticProject = { 
            id: defaultProjectId, 
            user_id: defaultUserId, 
            project_name: 'Test Project', 
            initial_user_prompt: defaultInitialPrompt,
            selected_domain_tag: null, 
            repo_url: defaultRepoUrl,
            status: defaultStatus,
            created_at: mockDate, 
            updated_at: mockDate 
        }; 
        
        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_projects: {
                    update: async (state: MockQueryBuilderState) => {
                        assertEquals((state.updateData as Partial<DialecticProject>)?.selected_domain_tag, null);
                        return { data: [expectedData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                }
            }
        };
        if (mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
        mockSupabaseSetup = createMockSupabaseClient(defaultUserId, config);
        mockDbAdminClient = mockSupabaseSetup.client;

        const result = await updateProjectDomainTag(mockAuthFunctions.getUser, mockDbAdminClient as any, mockValidationFunctions.isValidTag, payload);

        assertExists(result.data);
        assertEquals(result.error, undefined);
        assertObjectMatch(result.data as DialecticProject, { id: defaultProjectId, selected_domain_tag: null });
        assertEquals(mockIsValidDomainTagFnStub.calls.length, 0); 
    });

    it('should return error if project not found or access denied (PGRST116)', async () => {
        const dbError: PostgrestError = { name: 'PostgrestError', message: 'No rows found', code: 'PGRST116', details: '', hint: '' };
        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_projects: {
                    update: async () => ({ data: null, error: dbError, count: 0, status: 404, statusText: 'Not Found' })
                }
            }
        };
        if (mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
        mockSupabaseSetup = createMockSupabaseClient(defaultUserId, config);
        mockDbAdminClient = mockSupabaseSetup.client;

        const payload: UpdateProjectDomainTagPayload = { projectId: 'non-existent-project', domainTag: 'test' };
        const result = await updateProjectDomainTag(mockAuthFunctions.getUser, mockDbAdminClient as any, mockValidationFunctions.isValidTag, payload);

        assertExists(result.error);
        assertEquals(result.error.message, 'Project not found or access denied');
        assertEquals(result.error.status, 404);
        assertEquals(result.error.code, 'NOT_FOUND_OR_FORBIDDEN');
    });

    it('should return error for other DB errors during update', async () => {
        const dbError = { name: 'DatabaseError', message: 'Something went wrong', code: 'XXYYZ' };
        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_projects: {
                    update: async () => ({ data: null, error: dbError as any, count: 0, status: 500, statusText: 'Server Error' })
                }
            }
        };
        if (mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
        mockSupabaseSetup = createMockSupabaseClient(defaultUserId, config);
        mockDbAdminClient = mockSupabaseSetup.client;

        const payload: UpdateProjectDomainTagPayload = { projectId: defaultProjectId, domainTag: 'test' };
        const result = await updateProjectDomainTag(mockAuthFunctions.getUser, mockDbAdminClient as any, mockValidationFunctions.isValidTag, payload);

        assertExists(result.error);
        assertEquals(result.error.message, 'Failed to update project domain tag');
        assertEquals(result.error.details, dbError.message);
        assertEquals(result.error.status, 500);
        assertEquals(result.error.code, 'DB_UPDATE_ERROR');
    });
});
