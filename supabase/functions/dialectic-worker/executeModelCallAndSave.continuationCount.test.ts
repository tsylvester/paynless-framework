import {
    assertEquals,
    assertExists,
    assert,
    assertRejects,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import type { Database } from '../types_db.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { isModelContributionContext } from '../_shared/utils/type-guards/type_guards.file_manager.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import type { 
    DialecticJobRow, 
    ExecuteModelCallAndSaveParams, 
    DialecticExecuteJobPayload,
    IDialecticJobDeps,
} from '../dialectic-service/dialectic.interface.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';

// Import test fixtures from main test file
import {
    buildExecuteParams,
    createMockJob,
    testPayload,
    mockFullProviderData,
    mockContribution,
    setupMockClient,
    getMockDeps,
    mockSessionData,
    mockProviderData,
    buildPromptPayload,
} from './executeModelCallAndSave.test.ts';

Deno.test('executeModelCallAndSave - Step 12.b: requires continuation_count for continuation chunks', async (t) => {
    const stageSlug = 'thesis';
    const documentKey = FileType.business_case;

    await t.step('12.b.i: root chunk (no target_contribution_id) has isContinuation: false and turnIndex: undefined', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient({
            'ai_providers': {
                select: { data: [mockFullProviderData], error: null }
            }
        });

        const fileManager = new MockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
        const deps = getMockDeps();
        deps.fileManager = fileManager;

        const rootPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: documentKey,
            document_key: documentKey,
            stageSlug: stageSlug,
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: stageSlug,
            },
            // No target_contribution_id - this is a root chunk (omit property entirely)
            // continuation_count is also omitted for root chunks
        };

        const rootJob = createMockJob(rootPayload, {
            target_contribution_id: null,
        });

        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: rootJob,
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            promptConstructionPayload: buildPromptPayload(),
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
            inputsRequired: [],
        };

        await executeModelCallAndSave(params);

        assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
        const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
        
        if (!isModelContributionContext(uploadContext)) {
            throw new Error("Test setup error: uploadContext was not of type ModelContributionUploadContext");
        }

        assertEquals(uploadContext.pathContext.isContinuation, false, 'Root chunk should have isContinuation: false');
        assertEquals(uploadContext.pathContext.turnIndex, undefined, 'Root chunk should have turnIndex: undefined');

        clearAllStubs?.();
    });

    await t.step('12.b.ii: continuation chunk with continuation_count: 1 has isContinuation: true and turnIndex: 1', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient({
            'ai_providers': {
                select: { data: [mockFullProviderData], error: null }
            }
        });

        const fileManager = new MockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
        const deps = getMockDeps();
        deps.fileManager = fileManager;

        const continuationPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: documentKey,
            document_key: documentKey,
            stageSlug: stageSlug,
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: stageSlug,
            },
            target_contribution_id: 'contrib-root-123',
            continuation_count: 1,
            document_relationships: { [stageSlug]: 'contrib-root-123' },
        };

        const continuationJob = createMockJob(continuationPayload, {
            target_contribution_id: 'contrib-root-123',
        });

        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: continuationJob,
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            promptConstructionPayload: buildPromptPayload(),
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
            inputsRequired: [],
        };

        await executeModelCallAndSave(params);

        assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
        const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
        
        if (!isModelContributionContext(uploadContext)) {
            throw new Error("Test setup error: uploadContext was not of type ModelContributionUploadContext");
        }

        assertEquals(uploadContext.pathContext.isContinuation, true, 'Continuation chunk should have isContinuation: true');
        assertEquals(uploadContext.pathContext.turnIndex, 1, 'Continuation chunk with continuation_count: 1 should have turnIndex: 1');

        clearAllStubs?.();
    });

    await t.step('12.b.iii: continuation chunk with continuation_count: 2 has isContinuation: true and turnIndex: 2', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient({
            'ai_providers': {
                select: { data: [mockFullProviderData], error: null }
            }
        });

        const fileManager = new MockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
        const deps = getMockDeps();
        deps.fileManager = fileManager;

        const continuationPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: documentKey,
            document_key: documentKey,
            stageSlug: stageSlug,
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: stageSlug,
            },
            target_contribution_id: 'contrib-root-123',
            continuation_count: 2,
            document_relationships: { [stageSlug]: 'contrib-root-123' },
        };

        const continuationJob = createMockJob(continuationPayload, {
            target_contribution_id: 'contrib-root-123',
        });

        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: continuationJob,
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            promptConstructionPayload: buildPromptPayload(),
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
            inputsRequired: [],
        };

        await executeModelCallAndSave(params);

        assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
        const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
        
        if (!isModelContributionContext(uploadContext)) {
            throw new Error("Test setup error: uploadContext was not of type ModelContributionUploadContext");
        }

        assertEquals(uploadContext.pathContext.isContinuation, true, 'Continuation chunk should have isContinuation: true');
        assertEquals(uploadContext.pathContext.turnIndex, 2, 'Continuation chunk with continuation_count: 2 should have turnIndex: 2');

        clearAllStubs?.();
    });

    await t.step('12.b.iv: continuation chunk with undefined continuation_count throws error', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient({
            'ai_providers': {
                select: { data: [mockFullProviderData], error: null }
            }
        });

        const fileManager = new MockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
        const deps = getMockDeps();
        deps.fileManager = fileManager;

        const continuationPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: documentKey,
            document_key: documentKey,
            stageSlug: stageSlug,
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: stageSlug,
            },
            target_contribution_id: 'contrib-root-123',
            continuation_count: undefined,
            document_relationships: { [stageSlug]: 'contrib-root-123' },
        };

        const continuationJob = createMockJob(continuationPayload, {
            target_contribution_id: 'contrib-root-123',
        });

        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: continuationJob,
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            promptConstructionPayload: buildPromptPayload(),
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
            inputsRequired: [],
        };

        await assertRejects(
            async () => await executeModelCallAndSave(params),
            Error,
            'continuation_count is required and must be a number > 0 for continuation chunks'
        );

        clearAllStubs?.();
    });

    await t.step('12.b.v: continuation chunk with continuation_count: 0 throws error', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient({
            'ai_providers': {
                select: { data: [mockFullProviderData], error: null }
            }
        });

        const fileManager = new MockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
        const deps = getMockDeps();
        deps.fileManager = fileManager;

        const continuationPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: documentKey,
            document_key: documentKey,
            stageSlug: stageSlug,
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: stageSlug,
            },
            target_contribution_id: 'contrib-root-123',
            continuation_count: 0,
            document_relationships: { [stageSlug]: 'contrib-root-123' },
        };

        const continuationJob = createMockJob(continuationPayload, {
            target_contribution_id: 'contrib-root-123',
        });

        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: continuationJob,
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            promptConstructionPayload: buildPromptPayload(),
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
            inputsRequired: [],
        };

        await assertRejects(
            async () => await executeModelCallAndSave(params),
            Error,
            'continuation_count is required and must be a number > 0 for continuation chunks'
        );

        clearAllStubs?.();
    });

    await t.step('12.b.vi: continuation chunk with continuation_count: -1 throws error', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient({
            'ai_providers': {
                select: { data: [mockFullProviderData], error: null }
            }
        });

        const fileManager = new MockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
        const deps = getMockDeps();
        deps.fileManager = fileManager;

        const continuationPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: documentKey,
            document_key: documentKey,
            stageSlug: stageSlug,
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: stageSlug,
            },
            target_contribution_id: 'contrib-root-123',
            continuation_count: -1,
            document_relationships: { [stageSlug]: 'contrib-root-123' },
        };

        const continuationJob = createMockJob(continuationPayload, {
            target_contribution_id: 'contrib-root-123',
        });

        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: continuationJob,
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            promptConstructionPayload: buildPromptPayload(),
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
            inputsRequired: [],
        };

        await assertRejects(
            async () => await executeModelCallAndSave(params),
            Error,
            'continuation_count is required and must be a number > 0 for continuation chunks'
        );

        clearAllStubs?.();
    });

    await t.step('12.b.vii: continuation chunk with non-number continuation_count throws error', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient({
            'ai_providers': {
                select: { data: [mockFullProviderData], error: null }
            }
        });

        const fileManager = new MockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
        const deps = getMockDeps();
        deps.fileManager = fileManager;

        const continuationPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: documentKey,
            document_key: documentKey,
            stageSlug: stageSlug,
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: stageSlug,
            },
            target_contribution_id: 'contrib-root-123',
            continuation_count: 'invalid' as any, // Intentionally invalid type for testing
            document_relationships: { [stageSlug]: 'contrib-root-123' },
        };

        const continuationJob = createMockJob(continuationPayload, {
            target_contribution_id: 'contrib-root-123',
        });

        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: continuationJob,
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            promptConstructionPayload: buildPromptPayload(),
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
            inputsRequired: [],
        };

        await assertRejects(
            async () => await executeModelCallAndSave(params),
            Error,
            'continuation_count is required and must be a number > 0 for continuation chunks'
        );

        clearAllStubs?.();
    });
});

