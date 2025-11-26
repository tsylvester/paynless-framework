import {
    assertEquals,
    assert,
    assertExists,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy, stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Database } from '../types_db.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import type { 
    UnifiedAIResponse,
    HeaderContext,
    SystemMaterials,
    HeaderContextArtifact,
    ContextForDocument,
    ContentToInclude,
    ExecuteModelCallAndSaveParams,
    DialecticExecuteJobPayload,
} from '../dialectic-service/dialectic.interface.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';
import { sanitizeJsonContent } from '../_shared/utils/jsonSanitizer.ts';

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
import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';

/**
 * Creates a typed mock UnifiedAIResponse object.
 * Mirrors the production UnifiedAIResponse interface from dialectic.interface.ts.
 */
export const createMockUnifiedAIResponse = (overrides: Partial<UnifiedAIResponse> = {}): UnifiedAIResponse => ({
    content: '{"content": "Default AI response"}',
    contentType: 'application/json',
    inputTokens: 10,
    outputTokens: 20,
    processingTimeMs: 100,
    rawProviderResponse: { mock: 'response' },
    ...overrides,
});

Deno.test('when the model produces malformed JSON, it should trigger a retry, not a continuation', async () => {
    // Arrange
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });
    
    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;
    
    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '\'{"key": "value", "incomplete\'', // Single quotes wrapping incomplete JSON
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    const continueJobSpy = spy(deps, 'continueJob');
    const retryJobSpy = spy(deps, 'retryJob');

    const job = createMockJob(testPayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert
    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 0, "Should not save the malformed artifact.");
    assertEquals(continueJobSpy.calls.length, 0, "Should NOT call continueJob for a parsing failure.");
    assertEquals(retryJobSpy.calls.length, 1, "Should call retryJob to recover from the error.");

    const retryArgs = retryJobSpy.calls[0].args;
    assertEquals(retryArgs[2].id, job.id, "Should retry the correct job.");
    assertEquals(retryArgs[3], job.attempt_count + 1, "Should increment the attempt count.");
    assert(retryArgs[4][0].error.includes('Malformed JSON'), "Should include the correct error reason in the retry details.");

    clearAllStubs?.();
});

Deno.test('when the model produces JSON wrapped in common patterns, it should sanitize and parse successfully', async () => {
    // Arrange
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });
    
    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;
    
    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '\'{"key": "value"}\'', // Single quotes wrapping valid JSON
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    const continueJobSpy = spy(deps, 'continueJob');
    const retryJobSpy = spy(deps, 'retryJob');

    const job = createMockJob(testPayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert
    assertEquals(retryJobSpy.calls.length, 0, "Should NOT call retryJob when JSON is successfully sanitized and parsed.");
    assertEquals(continueJobSpy.calls.length, 0, "Should NOT call continueJob when finish_reason is 'stop' and no continuation is needed.");
    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 1, "Should save the successfully parsed artifact.");

    clearAllStubs?.();
});

Deno.test('when the model produces JSON wrapped in triple backticks, it should sanitize and parse successfully', async () => {
    // Arrange
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });
    
    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;
    
    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '```json\n{"key": "value"}\n```', // Triple backticks with json tag wrapping valid JSON
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    const continueJobSpy = spy(deps, 'continueJob');
    const retryJobSpy = spy(deps, 'retryJob');

    const job = createMockJob(testPayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert
    assertEquals(retryJobSpy.calls.length, 0, "Should NOT call retryJob when JSON is successfully sanitized and parsed.");
    assertEquals(continueJobSpy.calls.length, 0, "Should NOT call continueJob when finish_reason is 'stop' and no continuation is needed.");
    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 1, "Should save the successfully parsed artifact.");

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave saves sanitized content for all content types', async () => {
    // Arrange: Create valid JSON content and wrap it in markdown fences (like the AI returns)
    const validJsonContent = '{"key": "value", "nested": {"field": "data"}}';
    const contentWithMarkdownFences = `\`\`\`json\n${validJsonContent}\n\`\`\``;
    
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    // Mock AI response with markdown fences (the actual problem scenario)
    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: contentWithMarkdownFences, // Wrapped in markdown fences
            contentType: 'application/json',
            inputTokens: 100,
            outputTokens: 200,
            processingTimeMs: 500,
            rawProviderResponse: { finish_reason: 'stop' },
            finish_reason: 'stop',
        })
    ));

    const job = createMockJob(testPayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: The saved content MUST equal the sanitized content (for ALL content types)
    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'FileManager.uploadAndRegisterFile should be called');
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    
    assert(isRecord(uploadContext), 'Upload context should be a record');
    assertExists(uploadContext.fileContent, 'Upload context should have fileContent');
    assert(typeof uploadContext.fileContent === 'string', 'fileContent must be a string');
    
    const savedContent: string = uploadContext.fileContent;
    
    // CRITICAL: Get what the sanitizer would produce from the original content with markdown fences
    const sanitizationResult = sanitizeJsonContent(contentWithMarkdownFences);
    const expectedSanitizedContent = sanitizationResult.sanitized;
    
    // CRITICAL: The saved content MUST equal the sanitized content
    // This proves that executeModelCallAndSave saves the sanitized output for ALL content types,
    // not the raw unsanitized content with markdown fences
    assertEquals(
        savedContent,
        expectedSanitizedContent,
        `Saved content must equal the sanitized content for ALL content types. ` +
        `Saved: ${savedContent.substring(0, 50)}... ` +
        `Expected (sanitized): ${expectedSanitizedContent.substring(0, 50)}... ` +
        `Original (with fences): ${contentWithMarkdownFences.substring(0, 50)}...`
    );

    clearAllStubs?.();
});

