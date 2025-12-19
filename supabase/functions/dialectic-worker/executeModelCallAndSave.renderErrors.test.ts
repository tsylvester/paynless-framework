import {
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
 * These tests prove that the try-catch block at lines 1423-1425 swallows exceptions
 * during RENDER job enqueueing, preventing error propagation to the caller.
 *
 * Tests cover:
 * - Validation failures (missing documentKey, missing documentIdentity)
 * - Database insert failures (RLS policy rejection, FK constraint violation)
 * - Query failures (shouldEnqueueRenderJob throwing database errors)
 *
 * Expected: All tests FAIL initially because try-catch swallows exceptions.
 * After fix: All tests PASS because exceptions are thrown and propagated.
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

Deno.test('executeModelCallAndSave throws exception when RENDER payload validation fails for missing documentKey', async () => {
    // Arrange: Create an EXECUTE job with markdown output_type
    const markdownPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        stageSlug: DialecticStageSlug.Thesis,
        canonicalPathParams: {
            contributionType: 'thesis',
            stageSlug: DialecticStageSlug.Thesis,
        },
        // NOT providing document_relationships - this causes validatedDocumentKey to be undefined
    };

    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
        })
    ));

    // Mock shouldEnqueueRenderJob to return true (rendering required)
    const shouldEnqueueRenderJobStub = stub(
        await import('../_shared/utils/shouldEnqueueRenderJob.ts'),
        'shouldEnqueueRenderJob',
        () => Promise.resolve(true)
    );

    const jobWithoutDocumentKey = createMockJob(markdownPayload, {
        job_type: 'EXECUTE',
    });

    try {
        // Act & Assert: Function should throw for missing documentKey validation
        await assertRejects(
            async () => {
                await executeModelCallAndSave(
                    buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
                        job: jobWithoutDocumentKey,
                    })
                );
            },
            Error,
            'documentKey is required for RENDER job'
        );

        // This test FAILS initially because the current try-catch (lines 1423-1425)
        // swallows the validation exception, allowing the function to complete without throwing.
        // After fix: This test PASSES because validation happens OUTSIDE try-catch and throws immediately.
    } finally {
        shouldEnqueueRenderJobStub.restore();
        clearAllStubs;
    }
});

Deno.test('executeModelCallAndSave throws exception when RENDER payload validation fails for missing documentIdentity', async () => {
    // Arrange: Create an EXECUTE job with markdown output_type but invalid documentIdentity
    const markdownPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        stageSlug: DialecticStageSlug.Thesis,
        canonicalPathParams: {
            contributionType: 'thesis',
            stageSlug: DialecticStageSlug.Thesis,
        },
        document_relationships: {
            source_group: 'group-123',
            thesis: 'doc-456',
        },
        // We'll set projectId to empty to make documentIdentity extraction fail
        projectId: '',
    };

    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
        })
    ));

    // Mock shouldEnqueueRenderJob to return true
    const shouldEnqueueRenderJobStub = stub(
        await import('../_shared/utils/shouldEnqueueRenderJob.ts'),
        'shouldEnqueueRenderJob',
        () => Promise.resolve(true)
    );

    const jobWithInvalidIdentity = createMockJob(markdownPayload, {
        job_type: 'EXECUTE',
    });

    try {
        // Act & Assert: Function should throw for missing documentIdentity validation
        await assertRejects(
            async () => {
                await executeModelCallAndSave(
                    buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
                        job: jobWithInvalidIdentity,
                    })
                );
            },
            Error,
            'documentIdentity is required for RENDER job'
        );

        // This test FAILS initially because try-catch swallows the validation exception.
        // After fix: PASSES because validation is OUTSIDE try-catch.
    } finally {
        shouldEnqueueRenderJobStub.restore();
        clearAllStubs;
    }
});

Deno.test('executeModelCallAndSave throws exception when database insert fails for RENDER job', async () => {
    // Arrange: Create an EXECUTE job with markdown output_type and valid payload
    const markdownPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
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

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
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

    const fileManager = new MockFileManagerService();
    const contributionWithRelationships = {
        ...mockContribution,
        document_relationships: { thesis: 'doc-456' },
    };
    fileManager.setUploadAndRegisterFileResponse(contributionWithRelationships, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
        })
    ));

    // Mock shouldEnqueueRenderJob to return true
    const shouldEnqueueRenderJobStub = stub(
        await import('../_shared/utils/shouldEnqueueRenderJob.ts'),
        'shouldEnqueueRenderJob',
        () => Promise.resolve(true)
    );

    const jobWithValidPayload = createMockJob(markdownPayload, {
        job_type: 'EXECUTE',
        session_id: 'session-456',
        user_id: 'user-789',
    });

    try {
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
            'Failed to insert RENDER job'
        );

        // This test FAILS initially because lines 1416-1421 only log the renderInsertError
        // without throwing, and the try-catch swallows any exception that might occur.
        // After fix: PASSES because database insert errors are thrown and propagated.
    } finally {
        shouldEnqueueRenderJobStub.restore();
        clearAllStubs;
    }
});

Deno.test('executeModelCallAndSave throws exception when shouldEnqueueRenderJob query fails', async () => {
    // Arrange: Create an EXECUTE job with markdown output_type
    const markdownPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
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
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
        })
    ));

    // Mock shouldEnqueueRenderJob to throw a database error (simulating connection failure)
    const shouldEnqueueRenderJobStub = stub(
        await import('../_shared/utils/shouldEnqueueRenderJob.ts'),
        'shouldEnqueueRenderJob',
        () => Promise.reject(new Error('Database connection failed: timeout after 30s'))
    );

    const jobWithMarkdown = createMockJob(markdownPayload, {
        job_type: 'EXECUTE',
    });

    try {
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

        // This test FAILS initially because the try-catch at lines 1423-1425
        // swallows the exception from shouldEnqueueRenderJob.
        // After fix: PASSES because exceptions are re-thrown to the caller.
    } finally {
        shouldEnqueueRenderJobStub.restore();
        clearAllStubs;
    }
});
