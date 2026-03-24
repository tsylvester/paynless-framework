import {
    assertEquals,
    assertExists,
    assert,
    assertRejects,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import {
    stub,
} from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Database } from '../types_db.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { isModelContributionContext } from '../_shared/utils/type-guards/type_guards.file_manager.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import type {
    DialecticJobRow,
    ExecuteModelCallAndSaveParams,
    DialecticExecuteJobPayload,
    IDialecticJobDeps,
    UnifiedAIResponse,
    ContextForDocument,
    DocumentRelationships,
} from '../dialectic-service/dialectic.interface.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';
import { IExecuteJobContext } from './JobContext.interface.ts';

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

        const deps = getMockDeps();
        assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
        const fileManager: MockFileManagerService = deps.fileManager;
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

        const rootPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: documentKey,
            document_key: documentKey,
            stageSlug: stageSlug,
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: stageSlug,
            },
            document_relationships: {
                source_group: '550e8400-e29b-41d4-a716-446655440000',
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

        const deps = getMockDeps();
        assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
        const fileManager: MockFileManagerService = deps.fileManager;
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

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
            document_relationships: {
                source_group: '550e8400-e29b-41d4-a716-446655440000',
                [stageSlug]: 'contrib-root-123',
            },
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

        const deps = getMockDeps();
        assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
        const fileManager: MockFileManagerService = deps.fileManager;
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

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
            document_relationships: {
                source_group: '550e8400-e29b-41d4-a716-446655440000',
                [stageSlug]: 'contrib-root-123',
            },
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

        const deps = getMockDeps();
        assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
        const fileManager: MockFileManagerService = deps.fileManager;
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

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
            document_relationships: {
                source_group: '550e8400-e29b-41d4-a716-446655440000',
                [stageSlug]: 'contrib-root-123',
            },
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

        const deps = getMockDeps();
        assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
        const fileManager: MockFileManagerService = deps.fileManager;
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

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
            document_relationships: {
                source_group: '550e8400-e29b-41d4-a716-446655440000',
                [stageSlug]: 'contrib-root-123',
            },
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

        const deps = getMockDeps();
        assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
        const fileManager: MockFileManagerService = deps.fileManager;
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

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
            document_relationships: {
                source_group: '550e8400-e29b-41d4-a716-446655440000',
                [stageSlug]: 'contrib-root-123',
            },
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

        const deps = getMockDeps();
        assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
        const fileManager: MockFileManagerService = deps.fileManager;
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

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
            document_relationships: {
                source_group: '550e8400-e29b-41d4-a716-446655440000',
                [stageSlug]: 'contrib-root-123',
            },
        };
        // Intentionally invalidate type at runtime without using TypeScript casting.
        Reflect.set(continuationPayload, 'continuation_count', 'invalid');

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

// Helper to create a typed UnifiedAIResponse for continuation limit tests
const createMockUnifiedAIResponse = (overrides: Partial<UnifiedAIResponse> = {}): UnifiedAIResponse => ({
    content: '{"content": "Default AI response"}',
    contentType: 'application/json',
    inputTokens: 10,
    outputTokens: 20,
    processingTimeMs: 100,
    rawProviderResponse: { mock: 'response' },
    finish_reason: 'stop',
    ...overrides,
});

Deno.test('executeModelCallAndSave - Fix 2: continuation_limit_reached handling', async (t) => {
    const stageSlug = 'thesis';
    const documentKey = FileType.business_case;
    const rootId = 'root-contrib-abc';

    const expectedSchema: ContextForDocument = {
        document_key: FileType.business_case,
        content_to_include: {
            executive_summary: '',
            market_analysis: '',
            financial_projections: '',
        },
    };

    await t.step('Fix 2.i: when continueResult.reason === continuation_limit_reached, modelProcessingResult.status is continuation_limit_reached', async () => {
        const { client: dbClient, spies, clearAllStubs } = setupMockClient({
            'ai_providers': {
                select: { data: [mockFullProviderData], error: null }
            }
        });

        const deps: IExecuteJobContext = getMockDeps();
        assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
        const fileManager: MockFileManagerService = deps.fileManager;
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

        const continueJobStub = stub(deps, 'continueJob', async () => ({
            enqueued: false,
            reason: 'continuation_limit_reached',
        }));

        const callUnifiedAIModelStub = stub(
            deps,
            'callUnifiedAIModel',
            async (): Promise<UnifiedAIResponse> =>
                createMockUnifiedAIResponse({
                    content: '{"content": "Partial content from model"}',
                    finish_reason: 'length',
                }),
        );

        const continuationPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: documentKey,
            document_key: documentKey,
            stageSlug: stageSlug,
            continueUntilComplete: true,
            continuation_count: 4,
            target_contribution_id: rootId,
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: stageSlug,
            },
            document_relationships: {
                source_group: '550e8400-e29b-41d4-a716-446655440000',
                [stageSlug]: rootId,
            },
            context_for_documents: [expectedSchema],
        };

        const job = createMockJob(continuationPayload, {
            target_contribution_id: rootId,
        });

        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job,
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            promptConstructionPayload: buildPromptPayload(),
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
            inputsRequired: [],
        };

        await executeModelCallAndSave(params);

        // Assert: the job update's results field should contain status 'continuation_limit_reached'
        const historicSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(historicSpies, 'Job update spies should exist');

        const finalUpdateCallArgs = historicSpies.callsArgs.find((args: unknown[]) => {
            const payload = args[0];
            return isRecord(payload) && typeof payload.results === 'string' && payload.results.includes('continuation_limit_reached');
        });
        assertExists(finalUpdateCallArgs, 'Final job update should contain modelProcessingResult.status === continuation_limit_reached');

        continueJobStub.restore();
        callUnifiedAIModelStub.restore();
        clearAllStubs?.();
    });

    await t.step('Fix 2.ii: when continueResult.reason === continuation_limit_reached, assembleAndSaveFinalDocument is called with rootIdFromSaved and expectedSchema', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient({
            'ai_providers': {
                select: { data: [mockFullProviderData], error: null }
            }
        });

        const deps: IExecuteJobContext = getMockDeps();
        assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
        const fileManager: MockFileManagerService = deps.fileManager;

        // Set up the contribution to return with document_relationships pointing to rootId
        const contributionWithRelationships = {
            ...mockContribution,
            document_relationships: { [stageSlug]: rootId },
        };
        fileManager.setUploadAndRegisterFileResponse(contributionWithRelationships, null);

        const continueJobStub = stub(deps, 'continueJob', async () => ({
            enqueued: false,
            reason: 'continuation_limit_reached',
        }));

        const callUnifiedAIModelStub = stub(
            deps,
            'callUnifiedAIModel',
            async (): Promise<UnifiedAIResponse> =>
                createMockUnifiedAIResponse({
                    content: '{"content": "Partial content from model"}',
                    finish_reason: 'length',
                }),
        );

        const continuationPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: documentKey,
            document_key: documentKey,
            stageSlug: stageSlug,
            continueUntilComplete: true,
            continuation_count: 4,
            target_contribution_id: rootId,
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: stageSlug,
            },
            document_relationships: {
                source_group: '550e8400-e29b-41d4-a716-446655440000',
                [stageSlug]: rootId,
            },
            context_for_documents: [expectedSchema],
        };

        const job = createMockJob(continuationPayload, {
            target_contribution_id: rootId,
        });

        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job,
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            promptConstructionPayload: buildPromptPayload(),
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
            inputsRequired: [],
        };

        await executeModelCallAndSave(params);

        // Assert: assembleAndSaveFinalDocument should be called with rootId and matching ContextForDocument
        assertEquals(fileManager.assembleAndSaveFinalDocument.calls.length, 1,
            'assembleAndSaveFinalDocument should be called once when continuation limit reached');
        assertEquals(fileManager.assembleAndSaveFinalDocument.calls[0].args[0], rootId,
            'assembleAndSaveFinalDocument should be called with rootIdFromSaved');
        assertEquals(fileManager.assembleAndSaveFinalDocument.calls[0].args[1], expectedSchema,
            'assembleAndSaveFinalDocument should be called with matching ContextForDocument');

        continueJobStub.restore();
        callUnifiedAIModelStub.restore();
        clearAllStubs?.();
    });

    await t.step('Fix 2.iii: when continuation_limit_reached but rootIdFromSaved equals contribution.id (single chunk), assembleAndSaveFinalDocument is NOT called', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient({
            'ai_providers': {
                select: { data: [mockFullProviderData], error: null }
            }
        });

        const deps: IExecuteJobContext = getMockDeps();
        assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
        const fileManager: MockFileManagerService = deps.fileManager;

        // The contribution's own ID matches rootIdFromSaved — single-chunk scenario
        const singleChunkContribution = {
            ...mockContribution,
            id: 'single-chunk-contrib',
            document_relationships: { [stageSlug]: 'single-chunk-contrib' },
        };
        fileManager.setUploadAndRegisterFileResponse(singleChunkContribution, null);

        const continueJobStub = stub(deps, 'continueJob', async () => ({
            enqueued: false,
            reason: 'continuation_limit_reached',
        }));

        const callUnifiedAIModelStub = stub(
            deps,
            'callUnifiedAIModel',
            async (): Promise<UnifiedAIResponse> =>
                createMockUnifiedAIResponse({
                    content: '{"content": "Partial content"}',
                    finish_reason: 'length',
                }),
        );

        const continuationPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: documentKey,
            document_key: documentKey,
            stageSlug: stageSlug,
            continueUntilComplete: true,
            continuation_count: 4,
            target_contribution_id: 'single-chunk-contrib',
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: stageSlug,
            },
            document_relationships: {
                source_group: '550e8400-e29b-41d4-a716-446655440000',
                [stageSlug]: 'single-chunk-contrib',
            },
            context_for_documents: [expectedSchema],
        };

        const job = createMockJob(continuationPayload, {
            target_contribution_id: 'single-chunk-contrib',
        });

        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job,
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            promptConstructionPayload: buildPromptPayload(),
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
            inputsRequired: [],
        };

        await executeModelCallAndSave(params);

        // Assert: assembleAndSaveFinalDocument should NOT be called — single-chunk artifacts don't need assembly
        assertEquals(fileManager.assembleAndSaveFinalDocument.calls.length, 0,
            'assembleAndSaveFinalDocument should NOT be called when rootIdFromSaved === contribution.id (single chunk)');

        continueJobStub.restore();
        callUnifiedAIModelStub.restore();
        clearAllStubs?.();
    });

    await t.step('Fix 2.iv: when continueResult.enqueued === true (normal continuation), assembleAndSaveFinalDocument is NOT called and status is needs_continuation', async () => {
        const { client: dbClient, spies, clearAllStubs } = setupMockClient({
            'ai_providers': {
                select: { data: [mockFullProviderData], error: null }
            }
        });

        const deps: IExecuteJobContext = getMockDeps();
        assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
        const fileManager: MockFileManagerService = deps.fileManager;

        const contributionWithRelationships = {
            ...mockContribution,
            document_relationships: { [stageSlug]: rootId },
        };
        fileManager.setUploadAndRegisterFileResponse(contributionWithRelationships, null);

        const continueJobStub = stub(deps, 'continueJob', async () => ({
            enqueued: true,
        }));

        const callUnifiedAIModelStub = stub(
            deps,
            'callUnifiedAIModel',
            async (): Promise<UnifiedAIResponse> =>
                createMockUnifiedAIResponse({
                    content: '{"content": "Partial content from model"}',
                    finish_reason: 'length',
                }),
        );

        const continuationPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: documentKey,
            document_key: documentKey,
            stageSlug: stageSlug,
            continueUntilComplete: true,
            continuation_count: 2,
            target_contribution_id: rootId,
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: stageSlug,
            },
            document_relationships: {
                source_group: '550e8400-e29b-41d4-a716-446655440000',
                [stageSlug]: rootId,
            },
            context_for_documents: [expectedSchema],
        };

        const job = createMockJob(continuationPayload, {
            target_contribution_id: rootId,
        });

        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job,
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            promptConstructionPayload: buildPromptPayload(),
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
            inputsRequired: [],
        };

        await executeModelCallAndSave(params);

        // Assert: assembleAndSaveFinalDocument should NOT be called for normal continuation
        assertEquals(fileManager.assembleAndSaveFinalDocument.calls.length, 0,
            'assembleAndSaveFinalDocument should NOT be called when continuation is successfully enqueued');

        // Assert: status should be needs_continuation (existing behavior)
        const historicSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(historicSpies, 'Job update spies should exist');

        const finalUpdateCallArgs = historicSpies.callsArgs.find((args: unknown[]) => {
            const payload = args[0];
            return isRecord(payload) && typeof payload.results === 'string' && payload.results.includes('needs_continuation');
        });
        assertExists(finalUpdateCallArgs, 'Final job update should contain modelProcessingResult.status === needs_continuation');

        continueJobStub.restore();
        callUnifiedAIModelStub.restore();
        clearAllStubs?.();
    });

    await t.step('Fix 2.v: when continueUntilComplete is false and finish_reason is stop, assembleAndSaveFinalDocument is NOT called and status is completed', async () => {
        const { client: dbClient, spies, clearAllStubs } = setupMockClient({
            'ai_providers': {
                select: { data: [mockFullProviderData], error: null }
            }
        });

        const deps: IExecuteJobContext = getMockDeps();
        assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
        const fileManager: MockFileManagerService = deps.fileManager;
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

        const callUnifiedAIModelStub = stub(
            deps,
            'callUnifiedAIModel',
            async (): Promise<UnifiedAIResponse> =>
                createMockUnifiedAIResponse({
                    content: '{"content": "Complete content"}',
                    finish_reason: 'stop',
                }),
        );

        const nonContinuationPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: documentKey,
            document_key: documentKey,
            stageSlug: stageSlug,
            continueUntilComplete: false,
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: stageSlug,
            },
            document_relationships: {
                source_group: '550e8400-e29b-41d4-a716-446655440000',
            },
        };

        const job = createMockJob(nonContinuationPayload);

        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job,
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            promptConstructionPayload: buildPromptPayload(),
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
            inputsRequired: [],
        };

        await executeModelCallAndSave(params);

        // Assert: assembleAndSaveFinalDocument should NOT be called — no continuation, single-chunk completion
        assertEquals(fileManager.assembleAndSaveFinalDocument.calls.length, 0,
            'assembleAndSaveFinalDocument should NOT be called for non-continuation jobs with no multi-chunk assembly');

        // Assert: status should be completed (existing behavior)
        const historicSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(historicSpies, 'Job update spies should exist');

        const finalUpdateCallArgs = historicSpies.callsArgs.find((args: unknown[]) => {
            const payload = args[0];
            return isRecord(payload) && typeof payload.results === 'string' && payload.results.includes('"completed"');
        });
        assertExists(finalUpdateCallArgs, 'Final job update should contain modelProcessingResult.status === completed');

        callUnifiedAIModelStub.restore();
        clearAllStubs?.();
    });
});

