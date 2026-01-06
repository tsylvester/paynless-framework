import {
    assert,
    assertRejects,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import { Database } from '../types_db.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import {
    DialecticExecuteJobPayload,
    UnifiedAIResponse,
} from '../dialectic-service/dialectic.interface.ts';
import { FileType, DialecticStageSlug } from '../_shared/types/file_manager.types.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { ShouldEnqueueRenderJobResult } from '../_shared/types/shouldEnqueueRenderJob.interface.ts';

// Import test fixtures from main test file
import {
    buildExecuteParams,
    createMockJob,
    testPayload,
    mockContribution,
    mockFullProviderData,
    setupMockClient,
    getMockDeps,
} from './executeModelCallAndSave.test.ts';

/**
 * Test file for RENDER job error handling in executeModelCallAndSave.
 *
 * These tests prove that the try-catch block swallows exceptions
 * during RENDER job enqueueing, preventing error propagation to the caller.
 *
 * Tests cover:
 * - Validation failures (missing documentKey, missing documentIdentity)
 * - Database insert failures (RLS policy rejection, FK constraint violation)
 * - Query failures (shouldEnqueueRenderJob throwing database errors)
 */

const createMockUnifiedAIResponse = (overrides: Partial<UnifiedAIResponse> = {}): UnifiedAIResponse => ({
    content: '{"content": "Default AI response"}',
    contentType: 'application/json',
    inputTokens: 10,
    outputTokens: 20,
    processingTimeMs: 100,
    rawProviderResponse: { mock: 'response' },
    ...overrides,
});

Deno.test('executeModelCallAndSave throws exception when document_relationships update fails during initialization', async () => {
    // Arrange: Create an EXECUTE job with markdown output_type
    // The code will try to initialize document_relationships, but if the update fails, it should throw
    const markdownPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: FileType.business_case,
        projectId: 'project-abc',
        sessionId: 'session-456',
        stageSlug: DialecticStageSlug.Thesis,
        canonicalPathParams: {
            contributionType: 'thesis',
            stageSlug: DialecticStageSlug.Thesis,
        },
        // NOT providing document_relationships - code will try to initialize it
    };

    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        // Mock dialectic_contributions.update to FAIL - this prevents document_relationships initialization
        'dialectic_contributions': {
            update: {
                data: null,
                error: {
                    message: 'Database update failed',
                    code: 'PGRST000',
                },
            },
        },
    });

    const deps = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    const contributionWithoutRelationships = {
        ...mockContribution,
        document_relationships: null,
    };
    fileManager.setUploadAndRegisterFileResponse(contributionWithoutRelationships, null);

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
        })
    ));

    // Mock shouldEnqueueRenderJob to return true (rendering required)
    stub(deps, 'shouldEnqueueRenderJob', async (): Promise<ShouldEnqueueRenderJobResult> => ({ shouldRender: true, reason: 'is_markdown' }));

    const jobWithoutRelationships = createMockJob(markdownPayload, {
        job_type: 'EXECUTE',
    });

    // Act & Assert: Function should throw when document_relationships update fails
    await assertRejects(
        async () => {
            await executeModelCallAndSave(
                buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
                    job: jobWithoutRelationships,
                })
            );
        },
        Error,
        'document_relationships[thesis] is required and must be persisted before RENDER job creation'
    );

    if (clearAllStubs) clearAllStubs();
});

Deno.test('executeModelCallAndSave throws exception when document_relationships update fails during initialization (missing stage key)', async () => {
    // Arrange: Create an EXECUTE job with markdown output_type
    // Contribution has document_relationships but missing the stageSlug key, so code will try to initialize it
    const markdownPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: FileType.business_case,
        projectId: 'project-abc',
        sessionId: 'session-456',
        stageSlug: DialecticStageSlug.Thesis,
        canonicalPathParams: {
            contributionType: 'thesis',
            stageSlug: DialecticStageSlug.Thesis,
        },
    };

    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        // Mock dialectic_contributions.update to FAIL - this prevents document_relationships initialization
        'dialectic_contributions': {
            update: {
                data: null,
                error: {
                    message: 'Database update failed',
                    code: 'PGRST000',
                },
            },
        },
    });

    const deps = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    // Contribution with document_relationships but missing the stageSlug key (Thesis)
    // Code will try to initialize it, but update fails
    const contributionMissingStageKey = {
        ...mockContribution,
        document_relationships: {
            source_group: 'group-123',
            // Missing 'thesis' key - code will try to initialize but update fails
        },
    };
    fileManager.setUploadAndRegisterFileResponse(contributionMissingStageKey, null);

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
        })
    ));

    // Mock shouldEnqueueRenderJob to return true
    stub(deps, 'shouldEnqueueRenderJob', async (): Promise<ShouldEnqueueRenderJobResult> => ({ shouldRender: true, reason: 'is_markdown' }));

    const jobWithMissingStageKey = createMockJob(markdownPayload, {
        job_type: 'EXECUTE',
    });

    // Act & Assert: Function should throw when document_relationships update fails
    await assertRejects(
        async () => {
            await executeModelCallAndSave(
                buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
                    job: jobWithMissingStageKey,
                })
            );
        },
        Error,
        'document_relationships[thesis] is required and must be persisted before RENDER job creation'
    );

    if (clearAllStubs) clearAllStubs();
});

Deno.test('executeModelCallAndSave throws exception when database insert fails for RENDER job', async () => {
    // Arrange: Create an EXECUTE job with markdown output_type and valid payload
    const markdownPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: FileType.business_case, // Required for early validation
        projectId: 'project-abc',
        sessionId: 'session-456',
        stageSlug: DialecticStageSlug.Thesis,
        canonicalPathParams: {
            contributionType: 'thesis',
            stageSlug: DialecticStageSlug.Thesis,
        },
        document_relationships: {
            source_group: 'group-123',
            thesis: 'doc-456',
        },
        user_jwt: 'valid-jwt-token',
        model_id: 'model-def',
        walletId: 'wallet-ghi',
    };

    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        // Mock dialectic_contributions.update for document_relationships initialization
        'dialectic_contributions': {
            update: { data: [], error: null }
        },
        // Mock dialectic_generation_jobs insert to FAIL (simulating RLS policy rejection)
        'dialectic_generation_jobs': {
            insert: {
                data: null,
                error: {
                    message: 'RLS policy violation: User does not have permission to insert RENDER job',
                    code: '42501',
                },
            },
        },
    });

    const deps = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    const contributionWithRelationships = {
        ...mockContribution,
        document_relationships: { thesis: 'doc-456' },
    };
    fileManager.setUploadAndRegisterFileResponse(contributionWithRelationships, null);

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
        })
    ));

    // Mock shouldEnqueueRenderJob to return true
    stub(deps, 'shouldEnqueueRenderJob', async (): Promise<ShouldEnqueueRenderJobResult> => ({ shouldRender: true, reason: 'is_markdown' }));

    const jobWithValidPayload = createMockJob(markdownPayload, {
        job_type: 'EXECUTE',
        session_id: 'session-456',
        user_id: 'user-789',
    });

    // Act & Assert: Function should throw when database insert fails
    await assertRejects(
        async () => {
            await executeModelCallAndSave(
                buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
                    job: jobWithValidPayload,
                })
            );
        },
        Error,
        'Failed to insert RENDER job due to database constraint violation'
    );

    if (clearAllStubs) clearAllStubs();
});

Deno.test('executeModelCallAndSave throws exception when shouldEnqueueRenderJob query fails', async () => {
    // Arrange: Create an EXECUTE job with markdown output_type
    const markdownPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: FileType.business_case, // Required for early validation
        projectId: 'project-abc',
        sessionId: 'session-456',
        stageSlug: DialecticStageSlug.Thesis,
        canonicalPathParams: {
            contributionType: 'thesis',
            stageSlug: DialecticStageSlug.Thesis,
        },
        document_relationships: {
            thesis: 'doc-root-123', // Required for documentIdentity
        },
    };

    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
    });

    const deps = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    const contributionWithRelationships = {
        ...mockContribution,
        document_relationships: { thesis: 'doc-root-123' },
    };
    fileManager.setUploadAndRegisterFileResponse(contributionWithRelationships, null);

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
        })
    ));

    // Mock shouldEnqueueRenderJob to throw a database error (simulating connection failure)
    stub(deps, 'shouldEnqueueRenderJob', () => Promise.reject(new Error('Database connection failed: timeout after 30s')));

    const jobWithMarkdown = createMockJob(markdownPayload, {
        job_type: 'EXECUTE',
    });

    // Act & Assert: Function should throw when shouldEnqueueRenderJob fails
    await assertRejects(
        async () => {
            await executeModelCallAndSave(
                buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
                    job: jobWithMarkdown,
                })
            );
        },
        Error,
        'Database connection failed'
    );

    if (clearAllStubs) clearAllStubs();
});
