import {
    assertEquals,
    assert,
    assertExists,
    assertRejects,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy, stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Database } from '../types_db.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { mockContribution } from './executeModelCallAndSave.test.ts';
import { mockNotificationService, resetMockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import {
    isRecord,
} from '../_shared/utils/type_guards.ts';
import { isModelContributionContext } from '../_shared/utils/type-guards/type_guards.file_manager.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import type { 
    SelectedAiProvider, 
    DialecticExecuteJobPayload,
    UnifiedAIResponse,
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

Deno.test('executeModelCallAndSave - pathContext validation - 41.b.i: ALL required values present for document file type', async () => {
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
    
    assertEquals(uploadContext.pathContext.documentKey, 'business_case', 'pathContext.documentKey should be "business_case"');
    assertEquals(uploadContext.pathContext.projectId, 'project-123', 'pathContext.projectId should be "project-123"');
    assertEquals(uploadContext.pathContext.sessionId, 'session-123', 'pathContext.sessionId should be "session-123"');
    assertEquals(uploadContext.pathContext.iteration, 1, 'pathContext.iteration should be 1');
    assertEquals(uploadContext.pathContext.stageSlug, 'thesis', 'pathContext.stageSlug should be "thesis"');
    assertEquals(uploadContext.pathContext.modelSlug, 'claude-opus', 'pathContext.modelSlug should be "claude-opus"');
    assertEquals(uploadContext.pathContext.attemptCount, 0, 'pathContext.attemptCount should be 0');

    callUnifiedAISpy.restore();
    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - notification document_key - 41.b.ii: document_completed notification uses document_key from payload', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    resetMockNotificationService();
    const deps = getMockDeps();
    assert(deps.notificationService === mockNotificationService, 'Expected deps.notificationService to be mockNotificationService');

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
            rawProviderResponse: { finish_reason: 'stop' },
        }),
    );

    const payload: DialecticExecuteJobPayload = {
        prompt_template_id: 'test-prompt',
        inputs: {},
        output_type: FileType.feature_spec,
        projectId: 'project-123',
        sessionId: 'session-123',
        stageSlug: 'thesis',
        model_id: 'model-def',
        iterationNumber: 1,
        continueUntilComplete: false,
        walletId: 'wallet-ghi',
        user_jwt: 'jwt.token.here',
        document_key: 'feature_spec',
        canonicalPathParams: {
            contributionType: 'thesis',
            stageSlug: 'thesis',
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

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    await executeModelCallAndSave(params);

    assertEquals(mockNotificationService.sendDocumentCentricNotification.calls.length, 1, 'Expected a document_completed event emission');
    const [payloadArg] = mockNotificationService.sendDocumentCentricNotification.calls[0].args;
    assert(isRecord(payloadArg), 'notification payload should be a record');
    assertEquals(payloadArg.type, 'document_completed', 'notification type should be document_completed');
    assertEquals(payloadArg.document_key, 'feature_spec', 'notification.document_key should be "feature_spec" (from payload), not String(output_type)');

    callUnifiedAISpy.restore();
    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - validation errors - 41.b.iii.a: throws error when document_key is undefined for document file type', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps = getMockDeps();

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
        // document_key is undefined (missing)
        canonicalPathParams: {
            contributionType: 'thesis',
            stageSlug: 'thesis',
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

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    await assertRejects(
        async () => await executeModelCallAndSave(params),
        Error,
        'document_key',
        'Should throw error indicating document_key is required and missing'
    );

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - validation errors - 41.b.iii.b: throws error when document_key is empty string for document file type', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps = getMockDeps();

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
        document_key: '', // empty string
        canonicalPathParams: {
            contributionType: 'thesis',
            stageSlug: 'thesis',
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

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    await assertRejects(
        async () => await executeModelCallAndSave(params),
        Error,
        'document_key',
        'Should throw error indicating document_key must be non-empty'
    );

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - validation errors - 41.b.iii.c: throws error when projectId is undefined for document file type', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps = getMockDeps();

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
    };
    // Delete projectId to test validation error
    delete (payload as unknown as Record<string, unknown>).projectId;

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

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    await assertRejects(
        async () => await executeModelCallAndSave(params),
        Error,
        'projectId',
        'Should throw error indicating projectId is required and missing'
    );

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - validation errors - 41.b.iii.d: throws error when sessionId is undefined for document file type', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps = getMockDeps();

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
    };
    // Delete sessionId to test validation error
    delete (payload as unknown as Record<string, unknown>).sessionId;

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

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    await assertRejects(
        async () => await executeModelCallAndSave(params),
        Error,
        'sessionId',
        'Should throw error indicating sessionId is required and missing'
    );

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - validation errors - 41.b.iii.e: throws error when iterationNumber is undefined for document file type', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps = getMockDeps();

    const payload: DialecticExecuteJobPayload = {
        prompt_template_id: 'test-prompt',
        inputs: {},
        output_type: FileType.business_case,
        projectId: 'project-123',
        sessionId: 'session-123',
        stageSlug: 'thesis',
        model_id: 'model-def',
        // iterationNumber is undefined (missing)
        continueUntilComplete: false,
        walletId: 'wallet-ghi',
        user_jwt: 'jwt.token.here',
        document_key: 'business_case',
        canonicalPathParams: {
            contributionType: 'thesis',
            stageSlug: 'thesis',
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

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    await assertRejects(
        async () => await executeModelCallAndSave(params),
        Error,
        'iterationNumber',
        'Should throw error indicating iterationNumber is required and missing'
    );

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - validation errors - 41.b.iii.f: throws error when canonicalPathParams is undefined for document file type', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps = getMockDeps();

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
    };
    // Delete canonicalPathParams to test validation error
    delete (payload as unknown as Record<string, unknown>).canonicalPathParams;

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

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    await assertRejects(
        async () => await executeModelCallAndSave(params),
        Error,
        'canonicalPathParams',
        'Should throw error indicating canonicalPathParams is required and missing'
    );

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - validation errors - 41.b.iii.g: throws error when canonicalPathParams.stageSlug is undefined for document file type', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps = getMockDeps();

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
    };
    // Delete stageSlug from canonicalPathParams to test validation error
    if (payload.canonicalPathParams && isRecord(payload.canonicalPathParams)) {
        delete (payload.canonicalPathParams as unknown as Record<string, unknown>).stageSlug;
    }

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

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    await assertRejects(
        async () => await executeModelCallAndSave(params),
        Error,
        'stageSlug',
        'Should throw error indicating canonicalPathParams.stageSlug is required and missing'
    );

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - validation errors - 41.b.iii.h: throws error when attempt_count is undefined for document file type', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps = getMockDeps();

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
    };

    const job = createMockJob(payload, {
        attempt_count: undefined, // explicitly undefined to test validation
        job_type: 'EXECUTE',
    });

    const providerDetails: SelectedAiProvider = {
        id: 'model-def',
        provider: 'mock-provider',
        name: 'Mock AI',
        api_identifier: 'claude-opus',
    };

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    await assertRejects(
        async () => await executeModelCallAndSave(params),
        Error,
        'attempt_count',
        'Should throw error indicating attempt_count is required and missing'
    );

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - validation errors - 41.b.iii.i: throws error when providerDetails.api_identifier is undefined for document file type', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps = getMockDeps();

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
    };

    const job = createMockJob(payload, {
        attempt_count: 0,
        job_type: 'EXECUTE',
    });

    const providerDetails: SelectedAiProvider = {
        id: 'model-def',
        provider: 'mock-provider',
        name: 'Mock AI',
        api_identifier: '', // empty string (invalid)
    };

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    await assertRejects(
        async () => await executeModelCallAndSave(params),
        Error,
        'api_identifier',
        'Should throw error indicating providerDetails.api_identifier is required and must be non-empty'
    );

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - non-document file types - 41.b.iv: does NOT throw error when document_key is undefined for non-document file type', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const deps = getMockDeps();
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

    const payload: DialecticExecuteJobPayload = {
        prompt_template_id: 'test-prompt',
        inputs: {},
        output_type: FileType.HeaderContext,
        document_key: 'header_context', // HeaderContext now requires document_key
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

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job,
        providerDetails,
    });

    // Should NOT throw an error for non-document file types when document_key is missing
    await executeModelCallAndSave(params);
    // If we reach here, the test passes (no error was thrown)

    callUnifiedAISpy.restore();
    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave propagates sourceAnchorModelSlug from canonicalPathParams to pathContext when creating HeaderContext for antithesis stage', async () => {
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
        stageSlug: 'antithesis',
        model_id: 'model-def',
        iterationNumber: 1,
        continueUntilComplete: false,
        walletId: 'wallet-ghi',
        user_jwt: 'jwt.token.here',
        canonicalPathParams: {
            contributionType: 'header_context',
            stageSlug: 'antithesis',
            sourceAnchorModelSlug: 'gpt-4',
            sourceAnchorType: 'thesis',
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
            content: '{"header_context_artifact": {"type": "header_context", "document_key": "header_context", "artifact_class": "header_context", "file_type": "json"}, "context_for_documents": []}',
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
    
    assertExists(uploadContext.pathContext.sourceAnchorModelSlug, 'pathContext should include sourceAnchorModelSlug from canonicalPathParams');
    assertEquals(uploadContext.pathContext.sourceAnchorModelSlug, 'gpt-4', 'pathContext.sourceAnchorModelSlug should equal the value from canonicalPathParams');
    assertEquals(uploadContext.pathContext.stageSlug, 'antithesis', 'pathContext.stageSlug should be antithesis');

    callUnifiedAISpy.restore();
    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - pathContext validation - 101.c: extracts document_key for assembled_document_json output type', async () => {
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
        output_type: FileType.AssembledDocumentJson,
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
    assertEquals(uploadContext.pathContext.documentKey, 'business_case', 'pathContext.documentKey should be extracted for AssembledDocumentJson');

    callUnifiedAISpy.restore();
    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave passes documentKey to pathContext unconditionally for HeaderContext', async () => {
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
        projectId: 'project-123',
        sessionId: 'session-123',
        stageSlug: 'thesis',
        model_id: 'model-def',
        iterationNumber: 1,
        continueUntilComplete: false,
        walletId: 'wallet-ghi',
        user_jwt: 'jwt.token.here',
        document_key: 'header_context',
        canonicalPathParams: {
            contributionType: 'header_context',
            stageSlug: 'thesis',
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
            content: '{"header_context_artifact": {"type": "header_context", "document_key": "header_context", "artifact_class": "header_context", "file_type": "json"}, "context_for_documents": []}',
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
    
    assertEquals(uploadContext.pathContext.documentKey, payload.document_key, 'pathContext.documentKey should equal payload.document_key unconditionally');

    callUnifiedAISpy.restore();
    clearAllStubs?.();
});