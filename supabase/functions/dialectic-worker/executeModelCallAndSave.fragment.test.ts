import {
    assertEquals,
    assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Database } from '../types_db.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { mockContribution } from './executeModelCallAndSave.test.ts';
import {
    isRecord,
} from '../_shared/utils/type_guards.ts';
import { isModelContributionContext } from '../_shared/utils/type-guards/type_guards.file_manager.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import type { 
    SelectedAiProvider, 
    DialecticExecuteJobPayload,
    UnifiedAIResponse,
    DocumentRelationships,
} from '../dialectic-service/dialectic.interface.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import type { IExecuteJobContext } from './JobContext.interface.ts';

// Import shared test helpers from main test file
import {
    buildExecuteParams,
    createMockJob,
    mockProviderData,
    mockFullProviderData,
    setupMockClient,
    getMockDeps,
} from './executeModelCallAndSave.test.ts';

// Test 71.c.i: Assert PathContext includes sourceGroupFragment when job.payload.document_relationships.source_group is present
Deno.test('executeModelCallAndSave - 71.c.i: PathContext includes sourceGroupFragment when document_relationships.source_group is present', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps: IExecuteJobContext = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const documentRelationships: DocumentRelationships = {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
    };

    const payload: DialecticExecuteJobPayload = {
        prompt_template_id: 'test-prompt',
        inputs: {},
        output_type: FileType.business_case,
        projectId: 'project-123',
        sessionId: 'session-123',
        stageSlug: 'thesis',
        model_id: 'model-def',
        iterationNumber: 1,
        continueUntilComplete: false,
        walletId: 'wallet-ghi',
        user_jwt: 'jwt.token.here',
        document_key: 'business_case',
        canonicalPathParams: {
            contributionType: 'thesis',
            stageSlug: 'thesis',
        },
        document_relationships: documentRelationships,
    };

    const job = createMockJob(payload, {
        attempt_count: 0,
        job_type: 'EXECUTE',
    });

    const providerDetails: SelectedAiProvider = {
        id: 'model-def',
        provider: 'mock-provider',
        name: 'Mock AI',
        api_identifier: 'claude-opus',
    };

    const callUnifiedAISpy = stub(
        deps,
        'callUnifiedAIModel',
        async (): Promise<UnifiedAIResponse> => ({
            content: '{"content": "AI response content"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 20,
            processingTimeMs: 100,
            finish_reason: 'stop',
            rawProviderResponse: { mock: 'response' },
        }),
    );

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    await executeModelCallAndSave(params);

    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    assert(isModelContributionContext(uploadContext), 'uploadContext should be ModelContributionUploadContext');
    
    // RED: This test must initially FAIL because sourceGroupFragment is not yet extracted and added to pathContext
    assertEquals(uploadContext.pathContext.sourceGroupFragment, '550e8400', 'pathContext.sourceGroupFragment should be "550e8400" (first 8 chars after hyphen removal)');

    callUnifiedAISpy.restore();
    clearAllStubs?.();
});

// Test 71.c.ii: Assert fragment extraction handles UUID with hyphens correctly
Deno.test('executeModelCallAndSave - 71.c.ii: fragment extraction handles UUID with hyphens correctly', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps: IExecuteJobContext = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const documentRelationships: DocumentRelationships = {
        source_group: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    };

    const payload: DialecticExecuteJobPayload = {
        prompt_template_id: 'test-prompt',
        inputs: {},
        output_type: FileType.HeaderContext,
        document_key: 'header_context',
        projectId: 'project-123',
        sessionId: 'session-123',
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
        document_relationships: documentRelationships,
    };

    const job = createMockJob(payload, {
        attempt_count: 0,
        job_type: 'EXECUTE',
    });

    const providerDetails: SelectedAiProvider = {
        id: 'model-def',
        provider: 'mock-provider',
        name: 'Mock AI',
        api_identifier: 'claude-opus',
    };

    const callUnifiedAISpy = stub(
        deps,
        'callUnifiedAIModel',
        async (): Promise<UnifiedAIResponse> => ({
            content: '{"content": "AI response content"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 20,
            processingTimeMs: 100,
            finish_reason: 'stop',
            rawProviderResponse: { mock: 'response' },
        }),
    );

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    await executeModelCallAndSave(params);

    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    assert(isModelContributionContext(uploadContext), 'uploadContext should be ModelContributionUploadContext');
    
    // RED: This test must initially FAIL because fragment extraction is not yet implemented
    assertEquals(uploadContext.pathContext.sourceGroupFragment, 'a1b2c3d4', 'pathContext.sourceGroupFragment should be "a1b2c3d4" (hyphens removed, first 8 chars, lowercase)');

    callUnifiedAISpy.restore();
    clearAllStubs?.();
});

// Test 71.c.iii: Assert PathContext works without source_group (backward compatibility)
Deno.test('executeModelCallAndSave - 71.c.iii: PathContext works without source_group (backward compatibility)', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps: IExecuteJobContext = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const payload: DialecticExecuteJobPayload = {
        prompt_template_id: 'test-prompt',
        inputs: {},
        output_type: FileType.HeaderContext,
        document_key: 'header_context',
        projectId: 'project-123',
        sessionId: 'session-123',
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
        // document_relationships is not provided (backward compatibility)
    };

    const job = createMockJob(payload, {
        attempt_count: 0,
        job_type: 'EXECUTE',
    });

    const providerDetails: SelectedAiProvider = {
        id: 'model-def',
        provider: 'mock-provider',
        name: 'Mock AI',
        api_identifier: 'claude-opus',
    };

    const callUnifiedAISpy = stub(
        deps,
        'callUnifiedAIModel',
        async (): Promise<UnifiedAIResponse> => ({
            content: '{"content": "AI response content"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 20,
            processingTimeMs: 100,
            finish_reason: 'stop',
            rawProviderResponse: { mock: 'response' },
        }),
    );

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    await executeModelCallAndSave(params);

    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    assert(isModelContributionContext(uploadContext), 'uploadContext should be ModelContributionUploadContext');
    
    // Backward compatibility: sourceGroupFragment should be undefined when source_group is not present
    assertEquals(uploadContext.pathContext.sourceGroupFragment, undefined, 'pathContext.sourceGroupFragment should be undefined when document_relationships.source_group is not present');

    callUnifiedAISpy.restore();
    clearAllStubs?.();
});

// Test 71.c.iv: Assert fragment extraction handles undefined source_group gracefully
Deno.test('executeModelCallAndSave - 71.c.iv: fragment extraction handles undefined source_group gracefully', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps: IExecuteJobContext = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const documentRelationships: DocumentRelationships = {
        // source_group is explicitly not set (undefined)
    };

    const payload: DialecticExecuteJobPayload = {
        prompt_template_id: 'test-prompt',
        inputs: {},
        output_type: FileType.HeaderContext,
        document_key: 'header_context',
        projectId: 'project-123',
        sessionId: 'session-123',
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
        document_relationships: documentRelationships,
    };

    const job = createMockJob(payload, {
        attempt_count: 0,
        job_type: 'EXECUTE',
    });

    const providerDetails: SelectedAiProvider = {
        id: 'model-def',
        provider: 'mock-provider',
        name: 'Mock AI',
        api_identifier: 'claude-opus',
    };

    const callUnifiedAISpy = stub(
        deps,
        'callUnifiedAIModel',
        async (): Promise<UnifiedAIResponse> => ({
            content: '{"content": "AI response content"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 20,
            processingTimeMs: 100,
            finish_reason: 'stop',
            rawProviderResponse: { mock: 'response' },
        }),
    );

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    // Should not throw an error when source_group is undefined
    await executeModelCallAndSave(params);

    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    assert(isModelContributionContext(uploadContext), 'uploadContext should be ModelContributionUploadContext');
    
    // Fragment should be undefined when source_group is undefined
    assertEquals(uploadContext.pathContext.sourceGroupFragment, undefined, 'pathContext.sourceGroupFragment should be undefined when source_group is undefined');

    callUnifiedAISpy.restore();
    clearAllStubs?.();
});

// Test 71.c.v: Assert sourceAnchorModelSlug propagates correctly for antithesis patterns
Deno.test('executeModelCallAndSave - 71.c.v: sourceAnchorModelSlug propagates correctly for antithesis patterns', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps: IExecuteJobContext = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const documentRelationships: DocumentRelationships = {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
    };

    const payload: DialecticExecuteJobPayload = {
        prompt_template_id: 'test-prompt',
        inputs: {},
        output_type: FileType.business_case,
        projectId: 'project-123',
        sessionId: 'session-123',
        stageSlug: 'antithesis',
        model_id: 'model-def',
        iterationNumber: 1,
        continueUntilComplete: false,
        walletId: 'wallet-ghi',
        user_jwt: 'jwt.token.here',
        document_key: 'business_case',
        canonicalPathParams: {
            contributionType: 'antithesis',
            stageSlug: 'antithesis',
            sourceAnchorModelSlug: 'gpt-4', // From planner for antithesis pattern
        },
        document_relationships: documentRelationships,
    };

    const job = createMockJob(payload, {
        attempt_count: 0,
        job_type: 'EXECUTE',
    });

    const providerDetails: SelectedAiProvider = {
        id: 'model-def',
        provider: 'mock-provider',
        name: 'Mock AI',
        api_identifier: 'claude-opus',
    };

    const callUnifiedAISpy = stub(
        deps,
        'callUnifiedAIModel',
        async (): Promise<UnifiedAIResponse> => ({
            content: '{"content": "AI response content"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 20,
            processingTimeMs: 100,
            finish_reason: 'stop',
            rawProviderResponse: { mock: 'response' },
        }),
    );

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    await executeModelCallAndSave(params);

    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    assert(isModelContributionContext(uploadContext), 'uploadContext should be ModelContributionUploadContext');
    
    // Verify sourceAnchorModelSlug propagates via restOfCanonicalPathParams spread
    assertEquals(uploadContext.pathContext.sourceAnchorModelSlug, 'gpt-4', 'pathContext.sourceAnchorModelSlug should be "gpt-4" (from canonicalPathParams)');
    assertEquals(uploadContext.pathContext.stageSlug, 'antithesis', 'pathContext.stageSlug should be "antithesis"');
    
    // Verify fragment also propagates for complete antithesis pattern
    assertEquals(uploadContext.pathContext.sourceGroupFragment, '550e8400', 'pathContext.sourceGroupFragment should be "550e8400" (fragment from source_group)');

    callUnifiedAISpy.restore();
    clearAllStubs?.();
});

// Test 71.c.vi: Assert canonicalPathParams from planner includes sourceAnchorModelSlug for antithesis jobs
Deno.test('executeModelCallAndSave - 71.c.vi: canonicalPathParams includes sourceAnchorModelSlug for antithesis HeaderContext jobs', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps: IExecuteJobContext = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    // Simulate antithesis HeaderContext job with sourceAnchorModelSlug from planner
    const payload: DialecticExecuteJobPayload = {
        prompt_template_id: 'test-prompt',
        inputs: {},
        output_type: FileType.HeaderContext,
        document_key: 'header_context',
        projectId: 'project-123',
        sessionId: 'session-123',
        stageSlug: 'antithesis',
        model_id: 'model-def',
        iterationNumber: 1,
        continueUntilComplete: false,
        walletId: 'wallet-ghi',
        user_jwt: 'jwt.token.here',
        canonicalPathParams: {
            contributionType: 'antithesis',
            stageSlug: 'antithesis',
            sourceAnchorModelSlug: 'gpt-4', // Extracted from anchor document's model_name by planner
        },
        document_relationships: {
            source_group: '550e8400-e29b-41d4-a716-446655440000',
        },
    };

    const job = createMockJob(payload, {
        attempt_count: 0,
        job_type: 'EXECUTE',
    });

    const providerDetails: SelectedAiProvider = {
        id: 'model-def',
        provider: 'mock-provider',
        name: 'Mock AI',
        api_identifier: 'claude-opus',
    };

    const callUnifiedAISpy = stub(
        deps,
        'callUnifiedAIModel',
        async (): Promise<UnifiedAIResponse> => ({
            content: '{"content": "AI response content"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 20,
            processingTimeMs: 100,
            finish_reason: 'stop',
            rawProviderResponse: { mock: 'response' },
        }),
    );

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    await executeModelCallAndSave(params);

    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    assert(isModelContributionContext(uploadContext), 'uploadContext should be ModelContributionUploadContext');
    
    // Verify sourceAnchorModelSlug from canonicalPathParams propagates to pathContext
    assertEquals(uploadContext.pathContext.sourceAnchorModelSlug, 'gpt-4', 'pathContext.sourceAnchorModelSlug should be "gpt-4" (from canonicalPathParams via restOfCanonicalPathParams spread)');
    assertEquals(uploadContext.pathContext.stageSlug, 'antithesis', 'pathContext.stageSlug should be "antithesis"');
    
    // This enables antithesis pattern detection in constructStoragePath
    // The pathContext should have both sourceAnchorModelSlug and stageSlug for proper pattern matching

    callUnifiedAISpy.restore();
    clearAllStubs?.();
});
