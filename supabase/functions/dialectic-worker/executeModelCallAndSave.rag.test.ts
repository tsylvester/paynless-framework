import {
    assertEquals,
    assert,
  } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
  import { spy, stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
  import type { Database } from '../types_db.ts';
  import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
  import {
    isRecord,
} from '../_shared/utils/type_guards.ts';
  import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
  import type { 
    ExecuteModelCallAndSaveParams, 
    PromptConstructionPayload,
    SourceDocument
} from '../dialectic-service/dialectic.interface.ts';
import { Messages } from '../_shared/types.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { createMockTokenWalletService } from '../_shared/services/tokenWalletService.mock.ts';
import { countTokensForMessages } from '../_shared/utils/tokenizer_utils.ts';
import { ICompressionStrategy, getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';

import { 
    createMockJob, 
    testPayload, 
    mockSessionData, 
    mockProviderData, 
    mockFullProviderData, 
    setupMockClient, 
    getMockDeps 
} from './executeModelCallAndSave.test.ts';

Deno.test('should orchestrate RAG and debit tokens for un-indexed history chunks', async () => {
    // 1. Arrange
    const mockRagService = new MockRagService();
    const ragSpy = spy(mockRagService, 'getContextForModel');

    const { instance: mockTokenWalletService, stubs: tokenWalletStubs } = createMockTokenWalletService();

    if (!isRecord(mockFullProviderData.config)) {
        throw new Error('Test setup error: mockFullProviderData.config is not an object');
    }

    const limitedConfig = {
        ...mockFullProviderData.config,
        max_context_window_tokens: 100,
        context_window_tokens: 100,
    };

    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [{ ...mockFullProviderData, config: limitedConfig }], error: null }
        },
        'token_wallets': {
            select: { data: [{ wallet_id: 'wallet-ghi', user_id: 'user-789', balance: 100000, currency: 'AI_TOKEN' }], error: null }
        },
        'dialectic_memory': {
            select: { data: [{ id: 'indexed-chunk-id', content: 'This is the first message.', source_contribution_id: 'history-msg-1' }], error: null }
        }
    });

    const deps = getMockDeps();
    deps.ragService = mockRagService;
    deps.tokenWalletService = mockTokenWalletService;
    
    let tokenCallCount = 0;
    deps.countTokens = () => {
        tokenCallCount++;
        if (tokenCallCount === 1) {
            return 150; // Initial oversized count
        }
        return 50; // Count after one compression
    };

    // NEW: Configure the RAG service mock to return a short summary.
    mockRagService.setConfig({
        mockContextResult: 'short summary',
        mockTokensUsed: 10, // Simulate a cost for the RAG operation
    });

    const longHistoryPayload: PromptConstructionPayload = {
        systemInstruction: 'You are a helpful assistant.',
        conversationHistory: [
            // --- Immutable Head ---
            { id: 'history-msg-0', role: 'system', content: 'You are a helpful assistant.' },
            { id: 'history-msg-1', role: 'user', content: 'This is the first message.' },
            { id: 'history-msg-2', role: 'assistant', content: 'This is the second message.' },
            // --- Mutable Middle ---
            { id: 'history-msg-3', role: 'user', content: 'This is the third message, which is now significantly longer to ensure it absolutely needs to be indexed and will exceed the context window. To achieve this, I will add a substantial amount of additional text here to make sure it is long enough to push us well over the one hundred token limit for this specific test case, which is a much better approach than manipulating the configuration and hoping for the best. This method ensures that the test is robust and accurately reflects the real-world scenario where a long conversation history requires summarization before being passed to the model for processing, which is the entire point of this unit test.' },
            // --- Immutable Tail ---
            { id: 'history-msg-4', role: 'user', content: 'This is the penultimate message.' },
            { id: 'history-msg-5', role: 'assistant', content: 'This is the second to last message.' },
            { id: 'history-msg-6', role: 'assistant', content: 'This is the final message before the current prompt.' },
        ],
        resourceDocuments: [],
        currentUserPrompt: "This is the current user prompt.",
    };

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(testPayload),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: longHistoryPayload,
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
    };

    // 2. Act
    await executeModelCallAndSave(params);

    // 3. Assert
    assertEquals(ragSpy.calls.length, 1, "RAG service should be called to compress the oversized history");
    assertEquals(tokenWalletStubs.recordTransaction.calls.length, 1, "recordTransaction should be called once for the un-indexed chunk");
    
    const transactionArgs = tokenWalletStubs.recordTransaction.calls[0].args[0];
    assert(isRecord(transactionArgs), "recordTransaction call arguments should be an object");
    assert(typeof transactionArgs.notes === 'string' && transactionArgs.notes.includes('RAG compression'), 'Transaction notes should indicate a RAG compression cost');
    assert(Number(transactionArgs.amount) > 0, "Transaction amount should be greater than zero");
});

Deno.test('should only pass un-indexed documents to the RAG service', async () => {
    // 1. Arrange
    const mockRagService = new MockRagService();
    const ragSpy = spy(mockRagService, 'getContextForModel');

    const { instance: mockTokenWalletService } = createMockTokenWalletService();

    if (!isRecord(mockFullProviderData.config)) {
        throw new Error('Test setup error: mockFullProviderData.config is not an object');
    }

    const limitedConfig = {
        ...mockFullProviderData.config,
        max_context_window_tokens: 100,
        context_window_tokens: 100,
    };

    // Mock the DB to return only one of the two history messages
    const { client: dbClient } = setupMockClient({
        'ai_providers': {
            select: { data: [{ ...mockFullProviderData, config: limitedConfig }], error: null }
        },
        'dialectic_memory': {
            select: { data: [{ source_contribution_id: 'history-msg-3' }], error: null }
        }
    });

    const deps = getMockDeps();
    deps.ragService = mockRagService;
    deps.tokenWalletService = mockTokenWalletService;
    deps.countTokens = countTokensForMessages; // Use the real token counter

    // NEW: Configure the RAG service mock to return a short summary.
    mockRagService.setConfig({
        mockContextResult: 'short summary',
    });

    // Provide a long history, one of which is already indexed
    const payloadWithHistoryIds: PromptConstructionPayload = {
        systemInstruction: 'You are a helpful assistant.',
        conversationHistory: [
            // --- Immutable Head ---
            { id: 'history-msg-0', role: 'system', content: 'You are a helpful assistant.' },
            { id: 'history-msg-1', role: 'user', content: 'This is the first message.' },
            { id: 'history-msg-2', role: 'assistant', content: 'This is the second message.' },
            // --- Mutable Middle ---
            { id: 'history-msg-3', role: 'user', content: 'This is the third message (already indexed).' },
            { id: 'history-msg-4', role: 'assistant', content: 'This is the fourth message (not indexed), and it is very long to ensure it exceeds the token limit. To do that, we must add a great deal of text. This additional text will push the character count well over the four hundred character threshold needed to exceed the one hundred token limit when using the rough character count estimation strategy. This is the only way to properly test the RAG service invocation logic.' },
            { id: 'history-msg-5', role: 'user', content: 'This is another message in the mutable middle.' },
            { id: 'history-msg-6', role: 'assistant', content: 'This is yet another message in the mutable middle.' },
            // --- Immutable Tail ---
            { id: 'history-msg-7', role: 'user', content: 'This is the penultimate message.' },
            { id: 'history-msg-8', role: 'assistant', content: 'This is the final message before the current prompt.' },
        ],
        resourceDocuments: [],
        currentUserPrompt: "This is the current user prompt.",
    };

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(testPayload),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: payloadWithHistoryIds,
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
    };

    // 2. Act
    await executeModelCallAndSave(params);

    // 3. Assert
    assertEquals(ragSpy.calls.length, 1, "RAG service should be called");
    
    const ragArgs = ragSpy.calls[0].args[0]; // sourceDocumentsForRag
    assertEquals(ragArgs.length, 1, "RAG service should only be called with one document.");
    assertEquals(ragArgs[0].id, 'history-msg-4', "The un-indexed document should be the one passed to RAG.");
});

Deno.test('should throw an error if the estimated cost exceeds the 20% rationality threshold', async () => {
    // 1. Arrange
    const mockRagService = new MockRagService();
    const ragSpy = spy(mockRagService, 'getContextForModel');
    
    const mockBalance = 1000; // Set a balance where the cost IS affordable but NOT rational.
    
    // This is the correct pattern: get default deps, then create and overwrite the specific mock.
    const deps = getMockDeps();
    const { instance: mockTokenWalletService } = createMockTokenWalletService({
        getBalance: () => Promise.resolve(mockBalance.toString()),
    });
    deps.ragService = mockRagService;
    deps.tokenWalletService = mockTokenWalletService;

    if (!isRecord(mockFullProviderData.config)) {
        throw new Error('Test setup error: mockFullProviderData.config is not an object');
    }

    const costConfig = {
        ...mockFullProviderData.config,
        max_context_window_tokens: 100,
        context_window_tokens: 100,
        input_token_cost_rate: 1, // 1 token cost per input token for easy math
    };
    if (!isRecord(costConfig)) throw new Error("Test config error");
    
    const initialTokenCount = 251; // This will now result in a cost of 251
    const countTokensStub = stub(deps, 'countTokens', () => initialTokenCount);
    
    // Total cost calculation based on the logic to be implemented:
    // tokens_to_be_removed = 251 - 100 = 151
    // estimated_rag_cost = 151 * 1 = 151
    // estimated_final_prompt_cost = 100 * 1 = 100
    // total_estimated_input_cost = 151 + 100 = 251
    // 20% of balance (1000) is 200. Since 251 > 200, this should fail.
    const { client: dbClient } = setupMockClient({
        'ai_providers': { select: { data: [{ ...mockFullProviderData, config: costConfig }], error: null } },
    });
    
    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(testPayload),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: { systemInstruction: '', conversationHistory: [], resourceDocuments: [], currentUserPrompt: '' }, // content doesn't matter, we mock countTokens
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
    };
    
    // 2. Act & 3. Assert
    let errorThrown = false;
    try {
        await executeModelCallAndSave(params);
    } catch (e: unknown) {
        errorThrown = true;
        if (e instanceof Error) {
            assert(e.message.includes("exceeds 20% of the user's balance"), `Error message was: "${e.message}"`);
        } else {
            assert(false, "Threw something that was not an Error");
        }
    }

    assert(errorThrown, "Expected an error to be thrown for rationality check failure.");
    assertEquals(ragSpy.calls.length, 0, "RAG service should not be called if rationality check fails.");
    countTokensStub.restore();
});

Deno.test('should throw an error if the estimated cost exceeds the absolute balance', async () => {
    // 1. Arrange
    const mockRagService = new MockRagService();
    const ragSpy = spy(mockRagService, 'getContextForModel');
    
    const mockBalance = 250; // Exactly 1 less than the required 251
    const { instance: mockTokenWalletService } = createMockTokenWalletService({
        getBalance: () => Promise.resolve(mockBalance.toString()),
    });
    
    const deps = getMockDeps();
    deps.ragService = mockRagService;
    deps.tokenWalletService = mockTokenWalletService;

    if (!isRecord(mockFullProviderData.config)) {
        throw new Error('Test setup error: mockFullProviderData.config is not an object');
    }
    const costConfig = {
        ...mockFullProviderData.config,
        max_context_window_tokens: 100,
        input_token_cost_rate: 1, 
    };
    if (!isRecord(costConfig)) throw new Error("Test config error");

    const initialTokenCount = 251; // Oversized prompt, will cost 251
    const countTokensStub = stub(deps, 'countTokens', () => initialTokenCount);
    
    const { client: dbClient } = setupMockClient({
        'ai_providers': { select: { data: [{ ...mockFullProviderData, config: costConfig }], error: null } },
    });
    
    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(testPayload),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: { systemInstruction: '', conversationHistory: [], resourceDocuments: [], currentUserPrompt: '' },
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
    };
    
    // 2. Act & 3. Assert
    let errorThrown = false;
    try {
        await executeModelCallAndSave(params);
    } catch (e: unknown) {
        errorThrown = true;
        if (e instanceof Error) {
            assert(e.message.includes('Insufficient funds for the entire operation'), `Error message was: "${e.message}"`);
        } else {
            assert(false, "Threw something that was not an Error");
        }
    }

    assert(errorThrown, "Expected an error to be thrown for absolute affordability failure.");
    assertEquals(ragSpy.calls.length, 0, "RAG service should not be called if affordability check fails.");
    countTokensStub.restore();
});

Deno.test('should perform affordable compression, checking balance once', async () => {
    // 1. Arrange
    const mockRagService = new MockRagService();
    const ragSpy = spy(mockRagService, 'getContextForModel');
    
    const { instance: mockTokenWalletService, stubs: tokenWalletStubs } = createMockTokenWalletService({
        getBalance: () => Promise.resolve('1000000'), // Huge balance
    });

    const deps = getMockDeps(mockTokenWalletService);
    deps.ragService = mockRagService;
    deps.countTokens = countTokensForMessages; // Use real token counter
    
    // Configure the RAG service to return a result that is small enough to pass the test.
    mockRagService.setConfig({
        mockContextResult: '', // Make compression maximally effective
    });

    if (!isRecord(mockFullProviderData.config)) {
        throw new Error('Test setup error: mockFullProviderData.config is not an object');
    }

    const costConfig = {
        ...mockFullProviderData.config,
        max_context_window_tokens: 100,
        context_window_tokens: 100,
        input_token_cost_rate: 1, 
    };
    if (!isRecord(costConfig)) throw new Error("Test config error");
    
    const initialTokenCount = 150; 
    
    const { client: dbClient } = setupMockClient({
        'ai_providers': { select: { data: [{ ...mockFullProviderData, config: costConfig }], error: null } },
    });

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(testPayload),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        // Provide a payload that can be compressed
        promptConstructionPayload: { 
             systemInstruction: '', 
             conversationHistory: [
                // --- Immutable Head ---
                { id: 'history-msg-0', role: 'system', content: 'You are a helpful assistant.' },
                { id: 'history-msg-1', role: 'user', content: 'This is the first message.' },
                { id: 'history-msg-2', role: 'assistant', content: 'This is the second message.' },
                // --- Mutable Middle ---
                { id: 'history-msg-3', role: 'user', content: 'This is the third message, which is now significantly longer to ensure it absolutely needs to be indexed and will exceed the context window. To achieve this, I will add a substantial amount of additional text here to make sure it is long enough to push us well over the one hundred token limit for this specific test case, which is a much better approach than manipulating the configuration and hoping for the best. This method ensures that the test is robust and accurately reflects the real-world scenario where a long conversation history requires summarization before being passed to the model for processing, which is the entire point of this unit test.' },
                // --- Immutable Tail ---
                { id: 'history-msg-4', role: 'user', content: 'This is the penultimate message.' },
                { id: 'history-msg-5', role: 'assistant', content: 'This is the second to last message.' },
                { id: 'history-msg-6', role: 'assistant', content: 'This is the final message before the current prompt.' },
            ],
             resourceDocuments: [], 
             currentUserPrompt: '',
        },
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
    };

    // 2. Act
    await executeModelCallAndSave(params);

    // 3. Assert
    assertEquals(ragSpy.calls.length, 1, 'RAG service should be called once for compression.');
    
    // Ensure getBalance is called exactly once at the beginning.
    assertEquals(tokenWalletStubs.getBalance.calls.length, 1, 'getBalance should be called exactly once at the beginning.');
});

Deno.test('should iteratively compress the lowest-value candidate until the prompt fits', async () => {
    // 1. Arrange
    // Test data
    const conversationHistory: Messages[] = [
        // --- Immutable Head ---
        { id: 'history-msg-0', role: 'system', content: 'You are a helpful assistant.' },
        { id: 'history-msg-1', role: 'user', content: 'message 1' },
        { id: 'history-msg-2', role: 'assistant', content: 'message 2' },
        // --- Mutable Middle ---
        { id: 'history-msg-3', role: 'user', content: 'message 3' },
        // --- Immutable Tail ---
        { id: 'history-msg-4', role: 'user', content: 'This is message 4 and it is very long and should be compressed. We have to make this message long enough to push the token count over the limit, so I am adding a lot of extra text here to make sure that it happens every time the test is run. This is the final message before the current prompt. We have to make this message long enough to push the token count over the limit, so I am adding a lot of extra text here to make sure that it happens every time the test is run.' },
        { id: 'history-msg-5', role: 'assistant', content: 'message 5' },
        { id: 'history-msg-6', role: 'user', content: 'message 6' },
        { id: 'history-msg-7', role: 'assistant', content: 'message 7' },
    ];
    const documents: SourceDocument[] = [
        { 
            id: 'docA', 
            content: 'High relevance document that is also very long.', 
            contribution_type: 'source_document',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_id: 'user-789',
            mime_type: 'text/plain',
            citations: null,
            edit_version: 1,
            error: null,
            file_name: 'docA.txt',
            size_bytes: 100,
            storage_bucket: 'test-bucket',
            storage_path: 'test/path/docA.txt',
            target_contribution_id: null,
            tokens_used_input: 10,
            tokens_used_output: 20,
            document_relationships: null,
            is_latest_edit: true,
            iteration_number: 1,
            model_id: 'model-def',
            model_name: 'Mock AI',
            original_model_contribution_id: null,
            processing_time_ms: 100,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            session_id: 'session-123',
            stage: 'test-stage',
        },
        { 
            id: 'docB', 
            content: 'Low relevance document, but very very long to ensure it pushes the token count over the limit, so I am adding a lot of extra text here to make sure that it happens reliably every single time the test is run. This is critical for the test to pass.', 
            contribution_type: 'source_document',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_id: 'user-789',
            mime_type: 'text/plain',
            citations: null,
            edit_version: 1,
            error: null,
            file_name: 'docB.txt',
            size_bytes: 100,
            storage_bucket: 'test-bucket',
            storage_path: 'test/path/docB.txt',
            target_contribution_id: null,
            tokens_used_input: 10,
            tokens_used_output: 20,
            document_relationships: null,
            is_latest_edit: true,
            iteration_number: 1,
            model_id: 'model-def',
            model_name: 'Mock AI',
            original_model_contribution_id: null,
            processing_time_ms: 100,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            session_id: 'session-123',
            stage: 'test-stage',
        },
        { 
            id: 'docC', 
            content: 'Low relevance document, also very very long to ensure it pushes the token count over the limit, so I am adding a lot of extra text here to make sure that it happens reliably every single time the test is run.', 
            contribution_type: 'source_document',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_id: 'user-789',
            mime_type: 'text/plain',
            citations: null,
            edit_version: 1,
            error: null,
            file_name: 'docC.txt',
            size_bytes: 100,
            storage_bucket: 'test-bucket',
            storage_path: 'test/path/docC.txt',
            target_contribution_id: null,
            tokens_used_input: 10,
            tokens_used_output: 20,
            document_relationships: null,
            is_latest_edit: true,
            iteration_number: 1,
            model_id: 'model-def',
            model_name: 'Mock AI',
            original_model_contribution_id: null,
            processing_time_ms: 100,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            session_id: 'session-123',
            stage: 'test-stage',
        },
    ];
    const currentUserPrompt = "This is the current prompt.";

    // Mocks and Spies
    const mockRagService = new MockRagService();
    // NEW: Configure RAG to produce short summaries
    mockRagService.setConfig({
        mockContextResult: 'summary', // ~3 tokens
        mockTokensUsed: 5, // Simulate RAG cost
    });
    const ragSpy = spy(mockRagService, 'getContextForModel');
    
    const { instance: mockTokenWalletService, stubs: tokenWalletStubs } = createMockTokenWalletService({
        getBalance: () => Promise.resolve('1000000'), // Huge balance
    });
    
    const deps = getMockDeps(mockTokenWalletService);
    deps.ragService = mockRagService;
    
    // CORRECTED: Create a mock compression strategy to control the exact return value.
    const mockCompressionStrategy: ICompressionStrategy = async () => {
        // This mock will return candidates in a predefined order, ignoring the actual scoring logic.
        return Promise.resolve([
            { id: 'docB', content: 'Low relevance B', sourceType: 'document', originalIndex: 1, valueScore: 0.1 },
            { id: 'docC', content: 'Low relevance C', sourceType: 'document', originalIndex: 2, valueScore: 0.2 },
            { id: 'history-msg-4', content: 'History message 4', sourceType: 'history', originalIndex: 4, valueScore: 0.3 },
            { id: 'docA', content: 'High relevance A', sourceType: 'document', originalIndex: 0, valueScore: 0.9 },
        ]);
    };

    if (!isRecord(mockFullProviderData.config)) {
        throw new Error('Test setup error: mockFullProviderData.config is not an object');
    }

    // Configure token limits
    const limitedConfig = {
        ...mockFullProviderData.config,
        max_context_window_tokens: 100, // REDUCED: Force compression logic to trigger with the real tokenizer
        context_window_tokens: 100,
        // Rough token count: 'Low relevance...' is 10 tokens. Others are ~2-5. Total will be > 15.
    };
    if (!isRecord(limitedConfig)) throw new Error("Test config error");

    // Mock DB calls
    const { client: dbClient } = setupMockClient({
        'ai_providers': { select: { data: [{ ...mockFullProviderData, config: limitedConfig }], error: null } },
        'dialectic_memory': { select: { data: [{ source_contribution_id: 'history-msg-3' }], error: null } },
    });

    // Assemble dependencies
    deps.countTokens = countTokensForMessages; // Use real token counter

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(testPayload),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: {
            systemInstruction: 'System instruction.',
            conversationHistory: conversationHistory,
            resourceDocuments: documents,
            currentUserPrompt: currentUserPrompt,
        },
        sessionData: mockSessionData,
        compressionStrategy: mockCompressionStrategy,
    };

    // 2. Act
    await executeModelCallAndSave(params);

    // 3. Assert
    // CORRECTED: Assert against the stub returned by the factory
    assertEquals(tokenWalletStubs.getBalance.calls.length, 1, "getBalance should be called exactly once at the beginning.");
    assertEquals(ragSpy.calls.length, 3, "RAG service should be called three times to compress prompt");
    const firstRagCallArgs = ragSpy.calls[0].args[0];
    assert(firstRagCallArgs[0].id === 'docB' || firstRagCallArgs[0].id === 'docC', "The lowest-value candidate (docB or docC) should have been selected for RAG first");
    const secondRagCallArgs = ragSpy.calls[1].args[0];
    assert(secondRagCallArgs[0].id === 'docB' || secondRagCallArgs[0].id === 'docC', "The other lowest-value candidate (docB or docC) should have been selected for RAG second");
    const thirdRagCallArgs = ragSpy.calls[2].args[0];
    assertEquals(thirdRagCallArgs[0].id, 'history-msg-4', "The third-lowest-value candidate (h4) should have been selected for RAG third");

    // We can't easily assert the final prompt structure without more complex mocking,
    // but the spy assertions above prove the core logic of selection and processing.
});

Deno.test('should throw ContextWindowError if compression fails to reduce size sufficiently', async () => {
    // 1. Arrange
    const mockRagService = new MockRagService();
    const ragSpy = spy(mockRagService, 'getContextForModel');
    
    // Configure RAG to return content that is *still too long*
    mockRagService.setConfig({
        mockContextResult: 'This is a summary that is not short enough.',
    });

    if (!isRecord(mockFullProviderData.config)) {
        throw new Error('Test setup error: mockFullProviderData.config is not an object');
    }

    // Set a very tight token limit
    const limitedConfig = {
        ...mockFullProviderData.config,
        max_context_window_tokens: 20,
        context_window_tokens: 20,
    };

    const { client: dbClient } = setupMockClient({
        'ai_providers': {
            select: { data: [{ ...mockFullProviderData, config: limitedConfig }], error: null }
        },
        'dialectic_memory': {
            select: { data: [], error: null } // No indexed chunks
        }
    });

    const deps = getMockDeps();
    deps.ragService = mockRagService;
    deps.countTokens = countTokensForMessages; // Use the real token counter

    // Provide a payload that will definitely be oversized
    const oversizedPayload: PromptConstructionPayload = {
        systemInstruction: 'You are a helpful assistant.',
        conversationHistory: [
            // --- Immutable Head ---
            { id: 'history-msg-0', role: 'system', content: 'You are a helpful assistant.' },
            { id: 'history-msg-1', role: 'user', content: 'This is the first message.' },
            { id: 'history-msg-2', role: 'assistant', content: 'This is the second message.' },
            // --- Mutable Middle ---
            { id: 'history-msg-3', role: 'user', content: 'This is the third message, which is now significantly longer to ensure it absolutely needs to be indexed and will exceed the context window. To achieve this, I will add a substantial amount of additional text here to make sure it is long enough to push us well over the one hundred token limit for this specific test case, which is a much better approach than manipulating the configuration and hoping for the best. This method ensures that the test is robust and accurately reflects the real-world scenario where a long conversation history requires summarization before being passed to the model for processing, which is the entire point of this unit test.' },
            // --- Immutable Tail ---
            { id: 'history-msg-4', role: 'user', content: 'This is the penultimate message.' },
            { id: 'history-msg-5', role: 'assistant', content: 'This is the second to last message.' },
            { id: 'history-msg-6', role: 'assistant', content: 'This is the final message before the current prompt.' },
        ],
        resourceDocuments: [],
        currentUserPrompt: "This is the current user prompt.",
    };

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(testPayload),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: oversizedPayload,
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
    };

    // 2. Act & 3. Assert
    let errorThrown = false;
    try {
        await executeModelCallAndSave(params);
    } catch (e: unknown) {
        errorThrown = true;
        assert(e instanceof ContextWindowError, `Expected ContextWindowError, but got ${e ? e.constructor.name : 'undefined'}`);
        if (e instanceof Error) {
            // CORRECTED: Assert against the actual, more specific error message.
            assert(e.message.includes('still exceeds model limit'), `Error message was: "${e.message}"`);
        }
    }
    assert(errorThrown, "Expected an error to be thrown when compression is impossible.");
    // All candidates (in this case, just one from history) should have been processed
    assertEquals(ragSpy.calls.length, 1, "RAG service should have been called for the one available candidate.");
});

Deno.test('should use source documents for token estimation before prompt assembly', async () => {
    const mockRagService = new MockRagService();
    const ragSpy = spy(mockRagService, 'getContextForModel');

    if (!isRecord(mockFullProviderData.config)) {
        throw new Error('Test setup error: mockFullProviderData.config is not an object');
    }

    const limitedConfig = {
        ...mockFullProviderData.config,
        max_context_window_tokens: 100,
        context_window_tokens: 100,
    };

    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [{ ...mockFullProviderData, config: limitedConfig }], error: null }
        }
    });

    const deps = getMockDeps();
    deps.ragService = mockRagService;
    deps.countTokens = countTokensForMessages;

    const largeSourceDoc = {
        id: 'doc-1',
        content: 'This is a very long source document that is clearly over one hundred tokens all by itself, which should force the RAG service to be called for compression to avoid a context window error downstream. To ensure this, I am adding a lot of extra text to this string. This additional text will push the character count well over the four hundred character threshold needed to exceed the one hundred token limit when using the rough character count estimation strategy, which divides the total number of characters by four. This is the only way to properly test the RAG service invocation logic.',
        metadata: {},
        created_at: new Date().toISOString(),
        iteration_number: 1,
        session_id: 'session-1',
        target_contribution_id: 'contribution-1',
        user_id: 'user-789',
        document_relationships: null,
        updated_at: new Date().toISOString(),
        mime_type: 'text/plain',
        citations: [],
        contribution_type: 'source_document',
        edit_version: 1,
        error: null,
        file_name: 'test.txt',
        is_latest_edit: true,
        model_id: 'model-1',
        model_name: 'test-model',
        original_model_contribution_id: 'contribution-1',
        processing_time_ms: 100,
        is_active: true,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        status: 'completed',
        is_default_embedding: false,
        stage: 'test-stage',
        storage_bucket: 'test-bucket',
        storage_path: 'test/path',
        tokens_used_input: 10,
        tokens_used_output: 20,
    };

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(testPayload),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: {
            systemInstruction: 'System instruction',
            conversationHistory: [],
            resourceDocuments: [largeSourceDoc],
            currentUserPrompt: 'User prompt',
        },
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
    };

    await executeModelCallAndSave(params);

    assertEquals(ragSpy.calls.length, 1, "Expected RAG service to be called for compression");

    clearAllStubs?.();
});