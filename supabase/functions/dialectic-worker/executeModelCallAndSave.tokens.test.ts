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
import { FileType } from '../_shared/types/file_manager.types.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { createMockTokenWalletService } from '../_shared/services/tokenWalletService.mock.ts';
import { countTokens } from '../_shared/utils/tokenizer_utils.ts';
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

Deno.test('compression path throws when wallet service missing', async () => {
    // Arrange oversized condition
    if (!isRecord(mockFullProviderData.config)) {
        throw new Error('Test setup error: mockFullProviderData.config is not an object');
    }
    const tightConfig = {
        ...mockFullProviderData.config,
        context_window_tokens: 50,
    };
    const { client: dbClient } = setupMockClient({
        'ai_providers': {
            select: { data: [{ ...mockFullProviderData, config: tightConfig }], error: null }
        }
    });

    const deps = getMockDeps();
    // Ensure other services exist, but remove wallet to trigger error
    deps.ragService = new MockRagService();
    // deno-lint-ignore no-explicit-any
    deps.tokenWalletService = undefined;
    const initialTokenCount = 200; // > max
    const countStub = stub(deps, 'countTokens', () => initialTokenCount);

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob({ ...testPayload, walletId: 'wallet-ghi' }),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: { systemInstruction: '', conversationHistory: [], resourceDocuments: [], currentUserPrompt: '' },
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
    };

    // Act & Assert
    let threw = false;
    try {
        await executeModelCallAndSave(params);
    } catch (e: unknown) {
        threw = true;
        if (e instanceof Error) {
            assert(e.message.includes('Token wallet service is required for affordability preflight'), `Unexpected error: ${e.message}`);
        } else {
            assert(false, 'Threw non-Error');
        }
    }
    assert(threw, 'Expected an error to be thrown when wallet service is missing.');
    countStub.restore();
});

Deno.test('should throw if walletId is missing (preflight, non-oversized) before any provider call', async () => {
    const { client: dbClient } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });

    const deps = getMockDeps();
    let providerCalled = 0;
    deps.callUnifiedAIModel = async () => {
        providerCalled++;
        return { content: 'AI', contentType: 'text/plain', inputTokens: 1, outputTokens: 1, processingTimeMs: 1, rawProviderResponse: { mock: 'response' } };
    };
    // Under limit to ensure non-oversized path
    deps.countTokens = () => 10;

    const job = createMockJob({ ...testPayload });
    // Intentionally set walletId to undefined for test
    // deno-lint-ignore no-explicit-any
    (job.payload as any).walletId = undefined;

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job,
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: { systemInstruction: '', conversationHistory: [], resourceDocuments: [], currentUserPrompt: 'hello' },
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
    };

    let threw = false;
    try {
        await executeModelCallAndSave(params);
    } catch (e: unknown) {
        threw = true;
        if (e instanceof Error) {
            assert(e.message.toLowerCase().includes('wallet'), `Unexpected error: ${e.message}`);
        }
    }
    assert(threw, 'Expected error when walletId is missing.');
    assertEquals(providerCalled, 0, 'Provider must not be called without wallet preflight.');
});

// Non-oversized - missing tokenWalletService should fail before provider call
Deno.test('preflight (non-oversized) fails when tokenWalletService is missing before any provider call', async () => {
  const { client: dbClient } = setupMockClient({
    'ai_providers': {
      select: { data: [mockFullProviderData], error: null }
    }
  });

  const deps = getMockDeps();
  // Remove wallet service to simulate missing dependency
  // deno-lint-ignore no-explicit-any
  (deps as any).tokenWalletService = undefined;
  let providerCalled = 0;
  deps.callUnifiedAIModel = async () => {
    providerCalled++;
    return { content: 'AI', contentType: 'text/plain', inputTokens: 1, outputTokens: 1, processingTimeMs: 1, rawProviderResponse: { mock: 'response' } };
  };
  // Ensure non-oversized
  deps.countTokens = () => 10;

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-xyz' }),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: { systemInstruction: '', conversationHistory: [], resourceDocuments: [], currentUserPrompt: 'hello' },
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
  };

  let threw = false;
  try {
    await executeModelCallAndSave(params);
  } catch (_e: unknown) {
    threw = true;
  }
  // expected failure: should error and not call provider
  assert(threw, 'Expected preflight failure when tokenWalletService is missing.');
  assertEquals(providerCalled, 0, 'Provider must not be called when wallet service is missing in preflight.');
});

// Non-oversized - invalid model cost rates produce preflight error
Deno.test('preflight (non-oversized) fails when model cost rates are invalid', async () => {
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  // output_token_cost_rate <= 0 is invalid for preflight
  const invalidCostConfig = {
    ...mockFullProviderData.config,
    output_token_cost_rate: 0,
  };
  const { client: dbClient } = setupMockClient({
    'ai_providers': {
      select: { data: [{ ...mockFullProviderData, config: invalidCostConfig }], error: null }
    }
  });

  const { instance: mockTokenWalletService } = createMockTokenWalletService({
    getBalance: () => Promise.resolve('100'),
  });

  const deps = getMockDeps(mockTokenWalletService);
  let providerCalled = 0;
  deps.callUnifiedAIModel = async () => {
    providerCalled++;
    return { content: 'AI', contentType: 'text/plain', inputTokens: 1, outputTokens: 1, processingTimeMs: 1, rawProviderResponse: { mock: 'response' } };
  };
  deps.countTokens = () => 10; // non-oversized

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-xyz' }),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: { systemInstruction: '', conversationHistory: [], resourceDocuments: [], currentUserPrompt: 'hello' },
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
  };

  let threw = false;
  try {
    await executeModelCallAndSave(params);
  } catch (_e: unknown) {
    threw = true;
  }
  assert(threw, 'Expected preflight failure for invalid model cost rates.');
  assertEquals(providerCalled, 0, 'Provider must not be called when model cost rates are invalid.');
});

// Non-oversized - NSF preflight should fail before provider call
Deno.test('preflight (non-oversized) fails for NSF when total estimated cost exceeds wallet balance', async () => {
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  const costConfig = {
    ...mockFullProviderData.config,
    input_token_cost_rate: 1,
    output_token_cost_rate: 10,
  };
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [{ ...mockFullProviderData, config: costConfig }], error: null } },
  });

  // Very low balance to trigger NSF even for small input
  const { instance: mockTokenWalletService, stubs } = createMockTokenWalletService({
    getBalance: () => Promise.resolve('5'),
  });

  const deps = getMockDeps(mockTokenWalletService);
  let providerCalled = 0;
  deps.callUnifiedAIModel = async () => {
    providerCalled++;
    return { content: 'AI', contentType: 'text/plain', inputTokens: 1, outputTokens: 1, processingTimeMs: 1, rawProviderResponse: { mock: 'response' } };
  };
  deps.countTokens = () => 10; // input cost = 10 > balance alone

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-xyz' }),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: { systemInstruction: '', conversationHistory: [], resourceDocuments: [], currentUserPrompt: 'hello' },
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
    inputsRelevance: [],
  };

  let threw = false;
  try {
    await executeModelCallAndSave(params);
  } catch (_e: unknown) {
    threw = true;
  }
  assert(threw, 'Expected preflight NSF failure before provider call.');
  assertEquals(providerCalled, 0, 'Provider must not be called when NSF is detected in preflight.');
  assertEquals(stubs.recordTransaction.calls.length, 0, 'No debit should occur during preflight failures.');
});

Deno.test('should orchestrate RAG and debit tokens for un-indexed history chunks', async () => {
    // Arrange: provider config with tight window to force compression
    if (!isRecord(mockFullProviderData.config)) {
        throw new Error('Test setup error: mockFullProviderData.config is not an object');
    }
    const limitedConfig = {
        ...mockFullProviderData.config,
        context_window_tokens: 100, // triggers compression
        provider_max_output_tokens: 50, // bounds planned output
    };
    const { client: dbClient } = setupMockClient({
        'ai_providers': {
            select: { data: [{ ...mockFullProviderData, config: limitedConfig }], error: null }
        }
    });

    // Wallet mock from factory with deterministic local counter and persistent logs
    let debitCallCount = 0;
    const { instance: mockTokenWalletService, stubs: tokenWalletStubs } = createMockTokenWalletService({
        recordTransaction: async (params) => {
            debitCallCount++;
            console.log('[TEST] recordTransaction called', { amount: params.amount, notes: params.notes, relatedEntityId: params.relatedEntityId });
            const now = new Date();
            return Promise.resolve({
                transactionId: 'txn-rag',
                walletId: params.walletId,
                type: params.type,
                amount: params.amount,
                balanceAfterTxn: '100',
                recordedByUserId: params.recordedByUserId,
                relatedEntityId: params.relatedEntityId,
                relatedEntityType: params.relatedEntityType,
                idempotencyKey: params.idempotencyKey,
                notes: params.notes,
                timestamp: now,
            });
        }
    });

    // Deps with injected wallet and deterministic RAG
    const deps = getMockDeps(mockTokenWalletService);
    const mockRag = new MockRagService();
    mockRag.setConfig({ mockContextResult: 'summary', mockTokensUsed: 10 });
    deps.ragService = mockRag;

    // Deterministic two-step counter: oversized then fits
    let tokenCalls = 0;
    deps.countTokens = () => {
        tokenCalls++;
        return tokenCalls === 1 ? 200 : 50;
    };

    // Single candidate in the mutable middle ensures exactly one RAG call
    const oneCandidateStrategy: ICompressionStrategy = async () => ([
        { id: 'history-msg-3', content: 'long content', sourceType: 'history', originalIndex: 3, valueScore: 0.5, effectiveScore: 0.5 },
    ]);

    // History with a mutable middle item (id matches strategy)
    const prompt: PromptConstructionPayload = {
        systemInstruction: 'You are a helpful assistant.',
        conversationHistory: [
            { id: 'history-msg-0', role: 'system', content: 'You are a helpful assistant.' },
            { id: 'history-msg-1', role: 'user', content: 'first' },
            { id: 'history-msg-2', role: 'assistant', content: 'second' },
            { id: 'history-msg-3', role: 'user', content: 'very long middle that should be summarized' },
            { id: 'history-msg-4', role: 'assistant', content: 'tail-1' },
            { id: 'history-msg-5', role: 'assistant', content: 'tail-2' },
        ],
        resourceDocuments: [],
        currentUserPrompt: 'current',
    };

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob({ ...testPayload, walletId: 'wallet-ghi' }),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: prompt,
        sessionData: mockSessionData,
        compressionStrategy: oneCandidateStrategy,
        inputsRelevance: [],
    };

    // Act
    await executeModelCallAndSave(params);

    // Assert: exactly one debit recorded with positive amount and proper notes
    const debitCalls = tokenWalletStubs.recordTransaction.calls.length;
    console.log('[TEST] debitCallCount/local, stubCalls', { debitCallCount, stubCalls: debitCalls });
    assertEquals(debitCallCount, 1, 'recordTransaction should be called exactly once (local counter)');
    assertEquals(debitCalls, 1, 'recordTransaction should be called exactly once (stub)');
    const callArg = debitCalls > 0 ? tokenWalletStubs.recordTransaction.calls[0].args[0] : undefined;
    assert(isRecord(callArg), 'recordTransaction arg should be an object');
    const notesVal = isRecord(callArg) && typeof callArg['notes'] === 'string' ? callArg['notes'] : '';
    assert(notesVal.includes('RAG compression'), 'notes should include RAG compression');
    const amtUnknown = isRecord(callArg) ? callArg['amount'] : undefined;
    const amtNum = typeof amtUnknown === 'string' ? Number(amtUnknown) : (typeof amtUnknown === 'number' ? amtUnknown : NaN);
    assert(!Number.isNaN(amtNum) && amtNum > 0, 'amount should be > 0');
});

Deno.test('does not debit when compression tokensUsedForIndexing is zero', async () => {
    // Arrange
    if (!isRecord(mockFullProviderData.config)) {
        throw new Error('Test setup error: mockFullProviderData.config is not an object');
    }
    const limitedConfig = {
        ...mockFullProviderData.config,
        context_window_tokens: 100,
        provider_max_output_tokens: 50,
    };
    const { client: dbClient } = setupMockClient({
        'ai_providers': {
            select: { data: [{ ...mockFullProviderData, config: limitedConfig }], error: null }
        }
    });

    const { instance: mockTokenWalletService, stubs: tokenWalletStubs } = createMockTokenWalletService();

    const deps = getMockDeps(mockTokenWalletService);
    const mockRag = new MockRagService();
    mockRag.setConfig({ mockContextResult: 'summary', mockTokensUsed: 0 });
    deps.ragService = mockRag;

    let tokenCalls = 0;
    deps.countTokens = () => {
        tokenCalls++;
        return tokenCalls === 1 ? 200 : 50;
    };

    const oneCandidateStrategy: ICompressionStrategy = async () => ([
        { id: 'history-msg-3', content: 'long content', sourceType: 'history', originalIndex: 3, valueScore: 0.5, effectiveScore: 0.5 },
    ]);

    const prompt: PromptConstructionPayload = {
        systemInstruction: 'You are a helpful assistant.',
        conversationHistory: [
            { id: 'history-msg-0', role: 'system', content: 'You are a helpful assistant.' },
            { id: 'history-msg-1', role: 'user', content: 'first' },
            { id: 'history-msg-2', role: 'assistant', content: 'second' },
            { id: 'history-msg-3', role: 'user', content: 'very long middle that should be summarized' },
        ],
        resourceDocuments: [],
        currentUserPrompt: 'current',
    };

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob({ ...testPayload, walletId: 'wallet-ghi' }),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: prompt,
        sessionData: mockSessionData,
        compressionStrategy: oneCandidateStrategy,
        inputsRelevance: [],
    };

    // Act
    await executeModelCallAndSave(params);

    // Assert: no debit when tokensUsedForIndexing is zero
    assertEquals(tokenWalletStubs.recordTransaction.calls.length, 0, 'recordTransaction should not be called');
});

Deno.test('should throw an error if the estimated cost exceeds the 80% rationality threshold', async () => {
    // 1. Arrange
    const mockRagService = new MockRagService();
    const ragSpy = spy(mockRagService, 'getContextForModel');
    
    const mockBalance = 1000; // Balance such that cost can exceed 80% threshold when oversized.
    
    // This is the correct pattern: get default deps, then create and overwrite the specific mock.
    const deps = getMockDeps();
    let providerCalled = 0;
    deps.callUnifiedAIModel = async () => {
        providerCalled++;
        return { content: 'AI', contentType: 'text/plain', inputTokens: 1, outputTokens: 1, processingTimeMs: 1, rawProviderResponse: { mock: 'response' } };
    };
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
        context_window_tokens: 100,
        input_token_cost_rate: 1, // 1 token cost per input token for easy math
    };
    if (!isRecord(costConfig)) throw new Error("Test config error");
    
    const initialTokenCount = 500; // With input_rate=1 and target window=100, total_estimated_full_op ≈ 900 (> 80% of 1000, < 1000)
    const countTokensStub = stub(deps, 'countTokens', () => initialTokenCount);
    
    // Total cost calculation under current logic (including embeddings):
    // tokens_to_be_removed = 500 - 100 = 400
    // estimated_rag_cost = 400 * 1 = 400
    // estimated_final_prompt_cost = 100 * 1 = 100
    // plus remaining input tokens cost (window) + reduction mechanics yield a total around 900
    // 80% of balance (1000) is 800. Since ~900 > 800 and < 1000, this should fail the rationality check (not absolute NSF).
    const { client: dbClient } = setupMockClient({
        'ai_providers': { select: { data: [{ ...mockFullProviderData, config: costConfig }], error: null } },
    });
    
    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob({ ...testPayload, walletId: 'wallet-ghi' }),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: { systemInstruction: '', conversationHistory: [], resourceDocuments: [], currentUserPrompt: '' }, // content doesn't matter, we mock countTokens
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
        inputsRelevance: [],
    };
    
    // 2. Act & 3. Assert
    let errorThrown = false;
    try {
        await executeModelCallAndSave(params);
    } catch (e: unknown) {
        errorThrown = true;
        if (e instanceof Error) {
            assert(e.message.includes("exceeds 80% of the user's balance"), `Error message was: "${e.message}"`);
        } else {
            assert(false, "Threw something that was not an Error");
        }
    }

    assert(errorThrown, "Expected an error to be thrown for rationality check failure.");
    assertEquals(ragSpy.calls.length, 0, "RAG service should not be called if rationality check fails.");
    assertEquals(providerCalled, 0, "Provider should not be called if rationality check fails.");
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
    let providerCalled = 0;
    deps.callUnifiedAIModel = async () => {
        providerCalled++;
        return { content: 'AI', contentType: 'text/plain', inputTokens: 1, outputTokens: 1, processingTimeMs: 1, rawProviderResponse: { mock: 'response' } };
    };
    deps.ragService = mockRagService;
    deps.tokenWalletService = mockTokenWalletService;

    if (!isRecord(mockFullProviderData.config)) {
        throw new Error('Test setup error: mockFullProviderData.config is not an object');
    }
    const costConfig = {
        ...mockFullProviderData.config,
        context_window_tokens: 100,
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
        job: createMockJob({ ...testPayload, walletId: 'wallet-ghi' }),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: { systemInstruction: '', conversationHistory: [], resourceDocuments: [], currentUserPrompt: '' },
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
        inputsRelevance: [],
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
    assertEquals(providerCalled, 0, "Provider should not be called if affordability check fails.");
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
    deps.countTokens = countTokens; // Use real token counter
    
    // Configure the RAG service to return a result that is small enough to pass the test.
    mockRagService.setConfig({
        mockContextResult: '', // Make compression maximally effective
    });

    if (!isRecord(mockFullProviderData.config)) {
        throw new Error('Test setup error: mockFullProviderData.config is not an object');
    }

    const costConfig = {
        ...mockFullProviderData.config,
        context_window_tokens: 100,
        input_token_cost_rate: 1,
        provider_max_output_tokens: 5,
        provider_max_input_tokens: 200,
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
        job: createMockJob({ ...testPayload, walletId: 'wallet-ghi' }),
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
                { id: 'history-msg-4', role: 'assistant', content: 'This is an interstitial message to create a valid middle.' },
                { id: 'history-msg-5', role: 'user', content: 'This is the penultimate message.' },
                { id: 'history-msg-6', role: 'assistant', content: 'This is the second to last message.' },
                { id: 'history-msg-7', role: 'assistant', content: 'This is the final message before the current prompt.' },
            ],
             resourceDocuments: [], 
             currentUserPrompt: '',
        },
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
        inputsRelevance: [],
    };

    // 2. Act
    await executeModelCallAndSave(params);

    // 3. Assert
    assertEquals(ragSpy.calls.length, 1, 'RAG service should be called once for compression.');
    
    // Ensure getBalance is called exactly once at the beginning.
    assertEquals(tokenWalletStubs.getBalance.calls.length, 1, 'getBalance should be called exactly once at the beginning.');
});

Deno.test('should use source documents for token estimation before prompt assembly', async () => {
    const mockRagService = new MockRagService();
    const ragSpy = spy(mockRagService, 'getContextForModel');

    if (!isRecord(mockFullProviderData.config)) {
        throw new Error('Test setup error: mockFullProviderData.config is not an object');
    }

    const limitedConfig = {
        ...mockFullProviderData.config,
        context_window_tokens: 100,
        provider_max_output_tokens: 50,
    };

    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [{ ...mockFullProviderData, config: limitedConfig }], error: null }
        },
        // Executor now gathers its own documents; seed a large matching rendered document in resources
        'dialectic_project_resources': {
            select: () => {
                return Promise.resolve({
                    data: [
                        {
                            id: 'doc-oversize',
                            content: 'X'.repeat(2000),
                            stage_slug: 'test-stage',
                            project_id: 'project-abc',
                            session_id: 'session-456',
                            iteration_number: 1,
                            resource_type: 'rendered_document',
                            created_at: new Date().toISOString(),
                            // Use document-centric path so the parser can extract stage + documentKey
                            storage_path: 'project-abc/session_session-456/iteration_1/test-stage/documents',
                            file_name: 'modelA_1_business_case.md',
                        }
                    ],
                    error: null
                });
            }
        },
        'dialectic_feedback': { select: { data: [], error: null } },
    });

    const deps = getMockDeps();
    deps.ragService = mockRagService;
    deps.countTokens = countTokens;

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob({ ...testPayload, walletId: 'wallet-ghi' }),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: {
            systemInstruction: 'System instruction',
            conversationHistory: [],
            resourceDocuments: [], // assembler no longer provides docs to executor sizing
            currentUserPrompt: 'User prompt',
        },
        // New executor behavior: provide inputsRequired so it gathers matching docs
        inputsRequired: [
            // document_key must match the parsed key (without extension)
            { type: 'document', slug: 'test-stage', document_key: FileType.business_case },
        ],
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
        inputsRelevance: [],
    };

    await executeModelCallAndSave(params);

    assertEquals(ragSpy.calls.length, 1, "Expected RAG service to be called for compression");

    clearAllStubs?.();
});
