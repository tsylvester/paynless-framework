import { assertEquals, assertExists, assertObjectMatch } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.192.0/testing/bdd.ts";
import { stub, type Stub } from "https://deno.land/std@0.192.0/testing/mock.ts";

import { updateProjectDomain } from './updateProjectDomain.ts';
import type { UpdateProjectDomainPayload, DialecticProject } from "./dialectic.interface.ts";
import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig,
    type IMockSupabaseClient,
    type MockSupabaseClientSetup,
} from '../_shared/supabase.mock.ts';
import type { SupabaseClient, PostgrestError, User } from "@supabase/supabase-js";
import type { ILogger, LogMetadata, GetUserFn, ServiceError, GetUserFnResult } from '../_shared/types.ts';

const mockLogger: ILogger = {
    debug: (message: string, metadata?: LogMetadata) => console.debug("[DEBUG]", message, metadata || ''),
    info: (message: string, metadata?: LogMetadata) => console.log("[INFO]", message, metadata || ''),
    warn: (message: string, metadata?: LogMetadata) => console.warn("[WARN]", message, metadata || ''),
    error: (message: string | Error, metadata?: LogMetadata) => console.error("[ERROR]", message, metadata || ''),
};

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

const mockAuthFunctions = {
    getUser: async (): Promise<GetUserFnResult> => ({
         data: { user: createMockSupabaseUser('default-user') }, 
         error: null 
    })
};

describe('updateProjectDomain', () => {
    let mockGetUserFnStub: Stub<typeof mockAuthFunctions, [], Promise<GetUserFnResult>>;
    let mockSupabaseSetup: MockSupabaseClientSetup;
    let mockDbAdminClient: IMockSupabaseClient;

    const defaultUserId = 'test-user-123';
    const defaultProjectId = 'project-abc-789';
    const defaultDomainId = 'domain-uuid-111';
    const defaultDomainName = 'Software Development';
    const defaultDomainDescription = 'The process of creating software.';
    const mockDate = new Date().toISOString();

    beforeEach(() => {
        mockGetUserFnStub = stub(mockAuthFunctions, "getUser", async () => ({ data: { user: createMockSupabaseUser(defaultUserId) }, error: null }));
        
        const defaultConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_projects: {
                    update: async () => ({
                        data: [{
                            id: defaultProjectId, 
                            user_id: defaultUserId, 
                            project_name: 'Test Project', 
                            initial_user_prompt: "Initial prompt",
                            selected_domain_id: defaultDomainId,
                            repo_url: null,
                            status: "active",
                            created_at: mockDate, 
                            updated_at: mockDate,
                            domain: { name: defaultDomainName, description: defaultDomainDescription } 
                        }],
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
        if (mockSupabaseSetup && mockSupabaseSetup.clearAllStubs) {
            mockSupabaseSetup.clearAllStubs();
        }
    });

    it('should return error if projectId is missing', async () => {
        const payload: UpdateProjectDomainPayload = { projectId: '', selectedDomainId: defaultDomainId };
        const result = await updateProjectDomain(mockAuthFunctions.getUser as GetUserFn, mockDbAdminClient as any, payload, mockLogger);
        
        assertExists(result.error);
        assertEquals(result.error.message, 'projectId is required');
        assertEquals(result.error.status, 400);
    });

    it('should return error if selectedDomainId is missing', async () => {
        const payload: UpdateProjectDomainPayload = { projectId: defaultProjectId, selectedDomainId: '' };
        const result = await updateProjectDomain(mockAuthFunctions.getUser as GetUserFn, mockDbAdminClient as any, payload, mockLogger);
        
        assertExists(result.error);
        assertEquals(result.error.message, 'selectedDomainId is required');
        assertEquals(result.error.status, 400);
    });

    it('should return error if user is not authenticated', async () => {
        mockGetUserFnStub.restore();
        mockGetUserFnStub = stub(mockAuthFunctions, "getUser", async () => ({ data: { user: null }, error: { message: "User not authenticated", status: 401, code: 'AUTH_ERROR' } as ServiceError }));
        const payload: UpdateProjectDomainPayload = { projectId: defaultProjectId, selectedDomainId: defaultDomainId };
        const result = await updateProjectDomain(mockAuthFunctions.getUser as GetUserFn, mockDbAdminClient as any, payload, mockLogger);

        assertExists(result.error);
        assertEquals(result.error.message, 'User not authenticated');
        assertEquals(result.error.status, 401);
    });

    it('should successfully update selected_domain_id', async () => {
        const newDomainId = 'domain-uuid-222';
        const newDomainName = 'Financial Analysis';
        const newDomainDescription = 'Analyzing financial data.';
        const payload: UpdateProjectDomainPayload = { projectId: defaultProjectId, selectedDomainId: newDomainId };
        
        const expectedData: Partial<DialecticProject> = { 
            id: defaultProjectId, 
            selected_domain_id: newDomainId,
            domain_name: newDomainName,
            domain_description: newDomainDescription
        };

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_projects: {
                    update: async (state) => {
                        assertEquals((state.updateData as Partial<DialecticProject>)?.selected_domain_id, newDomainId);
                        return {
                            data: [{
                                id: defaultProjectId, 
                                user_id: defaultUserId, 
                                project_name: 'Test Project', 
                                initial_user_prompt: 'prompt',
                                selected_domain_id: newDomainId, 
                                repo_url: null, status: 'active', created_at: mockDate, updated_at: mockDate,
                                domain: { name: newDomainName, description: newDomainDescription }
                            }],
                            error: null, count: 1, status: 200, statusText: 'OK'
                        };
                    }
                }
            }
        };
        if (mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
        mockSupabaseSetup = createMockSupabaseClient(defaultUserId, config);
        mockDbAdminClient = mockSupabaseSetup.client;

        const result = await updateProjectDomain(mockAuthFunctions.getUser as GetUserFn, mockDbAdminClient as any, payload, mockLogger);

        assertExists(result.data);
        assertEquals(result.error, undefined);
        assertObjectMatch(result.data as DialecticProject, expectedData);
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

        const payload: UpdateProjectDomainPayload = { projectId: 'non-existent-project', selectedDomainId: defaultDomainId };
        const result = await updateProjectDomain(mockAuthFunctions.getUser as GetUserFn, mockDbAdminClient as any, payload, mockLogger);

        assertExists(result.error);
        assertEquals(result.error.status, 404);
        assertEquals(result.error.code, 'NOT_FOUND_OR_FORBIDDEN');
    });

    it('should return error if domainId is invalid (foreign key violation)', async () => {
        const invalidDomainId = 'invalid-domain-uuid';
        const dbError: PostgrestError = { 
            name: 'PostgrestError', 
            message: 'insert or update on table "dialectic_projects" violates foreign key constraint "dialectic_projects_selected_domain_id_fkey"', 
            code: '23503', 
            details: `Key (selected_domain_id)=(${invalidDomainId}) is not present in table "dialectic_domains".`, 
            hint: '' 
        };
        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_projects: {
                    update: async () => ({ data: null, error: dbError, count: 0, status: 400, statusText: 'Bad Request' })
                }
            }
        };
        if (mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
        mockSupabaseSetup = createMockSupabaseClient(defaultUserId, config);
        mockDbAdminClient = mockSupabaseSetup.client;

        const payload: UpdateProjectDomainPayload = { projectId: defaultProjectId, selectedDomainId: invalidDomainId };
        const result = await updateProjectDomain(mockAuthFunctions.getUser as GetUserFn, mockDbAdminClient as any, payload, mockLogger);

        assertExists(result.error);
        assertEquals(result.error.status, 400);
        assertEquals(result.error.code, 'INVALID_DOMAIN_ID');
        assertExists(result.error.message.includes('Invalid domainId'));
    });
});
