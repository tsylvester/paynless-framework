import {
    assertEquals,
    assertExists,
    assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Database } from '../types_db.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    isRecord,
} from '../_shared/utils/type_guards.ts';
import { isHeaderContext } from '../_shared/utils/type-guards/type_guards.dialectic.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import type {
    UnifiedAIResponse,
    ExecuteModelCallAndSaveParams,
    DialecticExecuteJobPayload,
    HeaderContext,
    ContextForDocument,
    ContentToInclude,
    SystemMaterials,
    HeaderContextArtifact,
} from '../dialectic-service/dialectic.interface.ts';

import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';

import {
    createMockJob,
    mockSessionData,
    mockProviderData,
    mockFullProviderData,
    setupMockClient,
    getMockDeps,
    mockContribution,
    buildPromptPayload,
} from './executeModelCallAndSave.test.ts';

import { FileType } from '../_shared/types/file_manager.types.ts';
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts';
import type { IExecuteJobContext } from './JobContext.interface.ts';

// Helper to create a valid HeaderContext structure
function createValidHeaderContext(): HeaderContext {
    const systemMaterials: SystemMaterials = {
        executive_summary: 'Test executive summary',
        input_artifacts_summary: 'Test input artifacts summary',
        stage_rationale: 'Test stage rationale',
    };

    const headerContextArtifact: HeaderContextArtifact = {
        type: 'header_context',
        document_key: FileType.HeaderContext,
        artifact_class: 'header_context',
        file_type: 'json',
    };

    const contentToInclude: ContentToInclude = {
        field1: 'filled value 1',
        field2: ['item1', 'item2'],
    };

    const contextForDocuments: ContextForDocument[] = [
        {
            document_key: FileType.business_case,
            content_to_include: contentToInclude,
        },
    ];

    return {
        system_materials: systemMaterials,
        header_context_artifact: headerContextArtifact,
        context_for_documents: contextForDocuments,
    };
}

// Helper to create mock UnifiedAIResponse with HeaderContext content
function createMockHeaderContextResponse(headerContext: HeaderContext): UnifiedAIResponse {
    return {
        content: JSON.stringify(headerContext),
        contentType: 'application/json',
        inputTokens: 100,
        outputTokens: 200,
        processingTimeMs: 500,
        rawProviderResponse: { finish_reason: 'stop' },
        finish_reason: 'stop',
    };
}

// Helper to create mock EXECUTE job payload for header_context output
// Note: In the actual system, PLAN jobs create EXECUTE child jobs with output_type: HeaderContext.
// These EXECUTE jobs are processed by processSimpleJob -> executeModelCallAndSave.
// This test validates that executeModelCallAndSave correctly saves header_context artifacts
// with context_for_documents (not files_to_generate) when processing such EXECUTE jobs.
function createMockHeaderContextJobPayload(overrides: Partial<DialecticExecuteJobPayload> = {}): DialecticExecuteJobPayload {
    return {
        prompt_template_id: 'test-prompt',
        inputs: {},
        output_type: FileType.HeaderContext,
        projectId: 'project-abc',
        sessionId: 'session-456',
        stageSlug: 'thesis',
        model_id: 'model-def',
        iterationNumber: 1,
        continueUntilComplete: false,
        walletId: 'wallet-ghi',
        user_jwt: 'jwt.token.here',
        canonicalPathParams: {
            contributionType: 'thesis',
            stageSlug: 'thesis',
        },
        ...overrides,
    };
}

Deno.test('executeModelCallAndSave - header_context response saves with context_for_documents and no files_to_generate (Gap 6)', async () => {
    // Arrange: Create a valid HeaderContext structure
    const validHeaderContext = createValidHeaderContext();
    
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const savedContribution = {
        ...mockContribution,
        contribution_type: 'header_context',
        file_name: 'header_context.json',
        mime_type: 'application/json',
    };

    const deps: IExecuteJobContext = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockHeaderContextResponse(validHeaderContext)
    ));

    const headerContextJobPayload = createMockHeaderContextJobPayload();
    const job = createMockJob(headerContextJobPayload);
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

    // Act
    await executeModelCallAndSave(params);

    // Assert: Verify the saved content matches valid HeaderContext structure
    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'FileManager.uploadAndRegisterFile should be called');
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    
    assert(isRecord(uploadContext), 'Upload context should be a record');
    assertExists(uploadContext.fileContent, 'Upload context should have fileContent');
    assert(typeof uploadContext.fileContent === 'string', 'fileContent must be a string');
    
    assert(uploadContext.fileContent.includes('context_for_documents'), 'Saved content should contain context_for_documents');
    assert(!uploadContext.fileContent.includes('files_to_generate'), 'Saved content should NOT contain files_to_generate');

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - header_context response with files_to_generate should fail validation (Gap 6)', async () => {
    // Arrange: Create HeaderContext structure with invalid files_to_generate property
    // Using type cast exception per Instructions for Agent section 5: intentionally malformed objects in error-handling tests
    const invalidHeaderContext = {
        ...createValidHeaderContext(),
        files_to_generate: [
            {
                from_document_key: FileType.business_case,
                template_filename: 'test.md',
            },
        ],
    } as HeaderContext;

    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps: IExecuteJobContext = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockHeaderContextResponse(invalidHeaderContext)
    ));

    const headerContextJobPayload = createMockHeaderContextJobPayload();
    const job = createMockJob(headerContextJobPayload);
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

    // Act
    await executeModelCallAndSave(params);

    // Assert: Verify the saved content is rejected by type guard
    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'FileManager.uploadAndRegisterFile should be called');
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    
    assert(isRecord(uploadContext), 'Upload context should be a record');
    assertExists(uploadContext.fileContent, 'Upload context should have fileContent');
    
    // Parse the saved content
    assert(typeof uploadContext.fileContent === 'string', 'fileContent must be a string');
    let parsedContent: unknown;
    try {
        parsedContent = JSON.parse(uploadContext.fileContent);
    } catch (e) {
        throw new Error(`Failed to parse saved content as JSON: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Validate that content with files_to_generate is rejected by type guard
    assert(!isHeaderContext(parsedContent), 'HeaderContext with files_to_generate should fail type guard validation');
    
    // Verify the parsed content does have files_to_generate
    assert(isRecord(parsedContent), 'Parsed content should be a record');
    assert('files_to_generate' in parsedContent, 'Parsed content should have files_to_generate property (proving invalid structure)');

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - header_context response with missing context_for_documents should fail validation (Gap 6)', async () => {
    // Arrange: Create invalid HeaderContext structure missing context_for_documents
    // Using type cast exception per Instructions for Agent section 5: intentionally malformed objects in error-handling tests
    const invalidHeaderContext = {
        system_materials: {
            executive_summary: 'Test executive summary',
            input_artifacts_summary: 'Test input artifacts summary',
            stage_rationale: 'Test stage rationale',
        },
        header_context_artifact: {
            type: 'header_context',
            document_key: FileType.HeaderContext,
            artifact_class: 'header_context',
            file_type: 'json',
        },
        // Missing context_for_documents
    } as HeaderContext;

    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps: IExecuteJobContext = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockHeaderContextResponse(invalidHeaderContext)
    ));

    const headerContextJobPayload = createMockHeaderContextJobPayload();
    const job = createMockJob(headerContextJobPayload);
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

    // Act
    await executeModelCallAndSave(params);

    // Assert: Verify the saved content fails type guard validation
    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'FileManager.uploadAndRegisterFile should be called');
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    
    assert(isRecord(uploadContext), 'Upload context should be a record');
    assertExists(uploadContext.fileContent, 'Upload context should have fileContent');
    
    // Parse the saved content
    assert(typeof uploadContext.fileContent === 'string', 'fileContent must be a string');
    let parsedContent: unknown;
    try {
        parsedContent = JSON.parse(uploadContext.fileContent);
    } catch (e) {
        throw new Error(`Failed to parse saved content as JSON: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Validate that content missing context_for_documents is rejected by type guard
    assert(!isHeaderContext(parsedContent), 'HeaderContext missing context_for_documents should fail type guard validation');

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - header_context output saves contribution with correct contribution_type (Gap 6)', async () => {
    // Arrange
    const validHeaderContext = createValidHeaderContext();
    
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const savedContribution = {
        ...mockContribution,
        contribution_type: 'header_context',
        file_name: 'header_context.json',
        mime_type: 'application/json',
    };

    const deps: IExecuteJobContext = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockHeaderContextResponse(validHeaderContext)
    ));

    const headerContextJobPayload = createMockHeaderContextJobPayload();
    const job = createMockJob(headerContextJobPayload);
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

    // Act
    await executeModelCallAndSave(params);

    // Assert: Verify the contribution type is set correctly
    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'FileManager.uploadAndRegisterFile should be called');
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    
    assert(isRecord(uploadContext), 'Upload context should be a record');
    assertExists(uploadContext.pathContext, 'Upload context should have pathContext');
    
    // Verify fileType is HeaderContext for PLAN jobs
    if (isRecord(uploadContext.pathContext) && 'fileType' in uploadContext.pathContext) {
        assertEquals(uploadContext.pathContext.fileType, FileType.HeaderContext, 'PLAN job should save with fileType HeaderContext');
    }

    clearAllStubs?.();
});

