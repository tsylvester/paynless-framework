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
import type { SupabaseClient, PostgrestError, User } from "@supabase/supabase-js";
import type { ILogger, LogMetadata, GetUserFn, ServiceError, GetUserFnResult } from '../_shared/types.ts';

// Removed local DI Interface definitions as they conflict with or are superseded by shared/imported types
// --- START: Local DI Interfaces from updateProjectDomainTag.ts ---
// interface User { ... }
// interface AuthError { ... }
// interface GetUserFnResult { ... }
// interface GetUserFn { ... }
// --- END: Local DI Interfaces ---

// IsValidDomainTagFn is specific to this service's DI
interface IsValidDomainTagFn {
  (dbClient: SupabaseClient, domainTag: string): Promise<boolean>;
}

const mockLogger: ILogger = {
    debug: (message: string, metadata?: LogMetadata) => console.debug("[DEBUG]", message, metadata || ''),
    info: (message: string, metadata?: LogMetadata) => console.log("[INFO]", message, metadata || ''),
    warn: (message: string, metadata?: LogMetadata) => console.warn("[WARN]", message, metadata || ''),
    error: (message: string | Error, metadata?: LogMetadata) => console.error("[ERROR]", message, metadata || ''),
};

// Helper function to create a more complete mock Supabase User
const createMockSupabaseUser = (id: string, email?: string): User => ({
    id,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: `Test User ${id}` },
    aud: 'authenticated',
    confirmation_sent_at: new Date().toISOString(),
    recovery_sent_at: new Date().toISOString(),
    email_change_sent_at: new Date().toISOString(),
    new_email: undefined,
    new_phone: undefined,
    invited_at: undefined,
    action_link: undefined,
    email: email || `${id}@example.com`,
    phone: undefined,
    created_at: new Date().toISOString(),
    confirmed_at: new Date().toISOString(),
    email_confirmed_at: new Date().toISOString(),
    phone_confirmed_at: undefined,
    last_sign_in_at: new Date().toISOString(),
    role: 'authenticated',
    updated_at: new Date().toISOString(),
    identities: [],
    factors: [],
});

// Helper objects for stubbing using the correct User type
const mockAuthFunctions = {
    getUser: async (): Promise<GetUserFnResult> => ({
         data: { user: createMockSupabaseUser('default-user') }, 
         error: null 
    })
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
        mockGetUserFnStub = stub(mockAuthFunctions, "getUser", async () => ({ data: { user: createMockSupabaseUser(defaultUserId) }, error: null }));
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
        const result = await updateProjectDomainTag(mockAuthFunctions.getUser as GetUserFn, mockDbAdminClient as any, mockValidationFunctions.isValidTag, payload, mockLogger);
        
        assertExists(result.error);
        assertEquals(result.error.message, 'projectId is required');
        assertEquals(result.error.status, 400);
        assertEquals(result.error.code, 'VALIDATION_ERROR');
    });

    it('should return error if user is not authenticated', async () => {
        mockGetUserFnStub.restore(); // restore default stub
        mockGetUserFnStub = stub(mockAuthFunctions, "getUser", async () => ({ data: { user: null }, error: { message: "User not authenticated", status: 401, code: 'AUTH_ERROR' } as ServiceError }));
        const payload: UpdateProjectDomainTagPayload = { projectId: defaultProjectId, domainTag: 'test' };
        const result = await updateProjectDomainTag(mockAuthFunctions.getUser as GetUserFn, mockDbAdminClient as any, mockValidationFunctions.isValidTag, payload, mockLogger);

        assertExists(result.error);
        assertEquals(result.error.message, 'User not authenticated');
        assertEquals(result.error.status, 401);
        assertEquals(result.error.code, 'AUTH_ERROR');
    });

    it('should return error if domainTag is invalid', async () => {
        mockIsValidDomainTagFnStub.restore();
        mockIsValidDomainTagFnStub = stub(mockValidationFunctions, "isValidTag", async () => false);
        const payload: UpdateProjectDomainTagPayload = { projectId: defaultProjectId, domainTag: 'invalid-tag' };
        const result = await updateProjectDomainTag(mockAuthFunctions.getUser as GetUserFn, mockDbAdminClient as any, mockValidationFunctions.isValidTag, payload, mockLogger);

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

        const result = await updateProjectDomainTag(mockAuthFunctions.getUser as GetUserFn, mockDbAdminClient as any, mockValidationFunctions.isValidTag, payload, mockLogger);

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

        const result = await updateProjectDomainTag(mockAuthFunctions.getUser as GetUserFn, mockDbAdminClient as any, mockValidationFunctions.isValidTag, payload, mockLogger);

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
        const result = await updateProjectDomainTag(mockAuthFunctions.getUser as GetUserFn, mockDbAdminClient as any, mockValidationFunctions.isValidTag, payload, mockLogger);

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
        const result = await updateProjectDomainTag(mockAuthFunctions.getUser as GetUserFn, mockDbAdminClient as any, mockValidationFunctions.isValidTag, payload, mockLogger);

        assertExists(result.error);
        assertEquals(result.error.message, 'Failed to update project domain tag');
        assertEquals(result.error.details, dbError.message);
        assertEquals(result.error.status, 500);
        assertEquals(result.error.code, 'DB_UPDATE_ERROR');
    });
});
