import {
    assertEquals,
    assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy, stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Database } from '../types_db.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import type { 
    UnifiedAIResponse,
} from '../dialectic-service/dialectic.interface.ts';

// Import test fixtures from main test file
import {
    buildExecuteParams,
    createMockJob,
    testPayload,
    mockFullProviderData,
    mockContribution,
    setupMockClient,
    getMockDeps,
} from './executeModelCallAndSave.test.ts';

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

