import {
    assertEquals,
    assert,
  } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
  import { spy, stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
  import { Database } from '../types_db.ts';
  import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
  import {
    isRecord,
} from '../_shared/utils/type_guards.ts';
  import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
  import { 
    ExecuteModelCallAndSaveParams, 
    PromptConstructionPayload,
    SourceDocument,
    DocumentRelationships,
} from '../dialectic-service/dialectic.interface.ts';
import { Messages, AiModelExtendedConfig } from '../_shared/types.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { createMockTokenWalletService } from '../_shared/services/tokenWalletService.mock.ts';
import { countTokens } from '../_shared/utils/tokenizer_utils.ts';
import { 
  ICompressionStrategy, 
  getSortedCompressionCandidates 
} from '../_shared/utils/vector_utils.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { CountTokensFn } from '../_shared/types/tokenizer.types.ts';
import { createMockDownloadFromStorage } from '../_shared/supabase_storage_utils.mock.ts';
import { 
    createMockJob, 
    testPayload, 
    mockSessionData, 
    mockProviderData, 
    mockFullProviderData, 
    setupMockClient, 
    getMockDeps 
} from './executeModelCallAndSave.test.ts';


Deno.test('resource documents are used for sizing but not included in ChatApiRequest.messages', async () => {
  const { client: dbClient } = setupMockClient({
      'ai_providers': {
          select: { data: [mockFullProviderData], error: null }
      },
      'dialectic_project_resources': {
          select: () => {
            return Promise.resolve({
              data: [
                {
                  id: 'doc-xyz',
                  content: 'DOC: sizing only',
                  created_at: new Date().toISOString(),
                  stage_slug: 'test-stage',
                  project_id: 'project-abc',
                  session_id: 'session-456',
                  iteration_number: 1,
                  resource_type: 'rendered_document',
                  // Path deconstructor expects directory in storage_path and full file name in file_name
                  storage_path: 'project-abc/session_session-456/iteration_1/test-stage/documents',
                  file_name: 'modelA_1_business_case.md',
                  storage_bucket: 'test-bucket'
                }
              ],
              error: null
            });
          }
      }
  });

    const docEncoded = new TextEncoder().encode('DOC: sizing only');
    const docBuffer = new ArrayBuffer(docEncoded.byteLength);
    new Uint8Array(docBuffer).set(docEncoded);
    const deps = getMockDeps({
        downloadFromStorage: createMockDownloadFromStorage({ mode: 'success', data: docBuffer }),
    });
    const callModelSpy = spy(deps, 'callUnifiedAIModel');

    // Capture full sized payload (no casts), and also a simple string view for doc presence
    let sizedPayload: {
        systemInstruction?: string;
        message?: string;
        messages?: { role: 'system'|'user'|'assistant'; content: string }[];
        resourceDocuments?: { id?: string; content: string }[];
    } | null = null;
    let messagesSeenByCounter: string[] | null = null;
    const countStub = stub(deps, 'countTokens', (...args: unknown[]) => {
        const payload = args.length > 1 ? args[1] : undefined;
        const collected: string[] = [];
        if (isRecord(payload)) {
            const sys = typeof payload['systemInstruction'] === 'string' ? payload['systemInstruction'] : undefined;
            const msg = typeof payload['message'] === 'string' ? payload['message'] : undefined;

            const msgsUnknown = payload['messages'];
            const msgs: { role: 'system'|'user'|'assistant'; content: string }[] = [];
            if (Array.isArray(msgsUnknown)) {
                for (const m of msgsUnknown) {
                    if (isRecord(m) && typeof m.content === 'string' && typeof m.role === 'string') {
                        if (m.role === 'user' || m.role === 'assistant' || m.role === 'system') {
                            msgs.push({ role: m.role, content: m.content });
                            collected.push(`${m.role}:${m.content}`);
                        }
                    }
                }
            }

            const docsUnknown = payload['resourceDocuments'];
            const docs: { id?: string; content: string }[] = [];
            if (Array.isArray(docsUnknown)) {
                for (const d of docsUnknown) {
                    if (isRecord(d) && typeof d.content === 'string') {
                        const docId = typeof d.id === 'string' ? d.id : undefined;
                        docs.push({ id: docId, content: d.content });
                        collected.push(`user:${d.content}`);
                    }
                }
            }

            sizedPayload = { systemInstruction: sys, message: msg, messages: msgs, resourceDocuments: docs };
        }
        messagesSeenByCounter = collected;
        return 10;
    });

    const docs: SourceDocument[] = [
        {
            id: 'doc-xyz',
            content: 'DOC: sizing only',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_id: 'user-789',
            session_id: 'session-1',
            iteration_number: 1,
            target_contribution_id: 'contrib-1',
            document_relationships: null,
            mime_type: 'text/plain',
            citations: [],
            contribution_type: 'source_document',
            edit_version: 1,
            error: null,
            file_name: 'doc.txt',
            is_latest_edit: true,
            model_id: 'model-1',
            model_name: 'Model',
            original_model_contribution_id: null,
            processing_time_ms: 0,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 1,
            storage_bucket: 'b',
            storage_path: 'p',
            tokens_used_input: 0,
            tokens_used_output: 0,
            stage: 'test-stage',
            is_header: false,
            source_prompt_resource_id: null,
        },
    ];

    const payload: PromptConstructionPayload = {
        systemInstruction: 'sys',
        conversationHistory: [{ role: 'user', content: 'HIST' }],
        resourceDocuments: docs,
        currentUserPrompt: 'CURR',
    };

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(testPayload),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: payload,
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
    inputsRequired: [
      { type: 'document', slug: 'test-stage', document_key: FileType.business_case }
    ],
    };

    await executeModelCallAndSave(params);

    // Assert sizing saw docs as user messages
    assert(messagesSeenByCounter !== null, 'countTokens should have been called');
    const seen: string[] = messagesSeenByCounter ? messagesSeenByCounter : [];
    assert(seen.some((s: string) => s.includes('DOC: sizing only')), 'Resource docs should be included in token counting input');

    // Assert ChatApiRequest.messages did not include docs
    assert(callModelSpy.calls.length === 1, 'Model should be called once');
    const arg = callModelSpy.calls[0].args[0];
    assert(isRecord(arg) && Array.isArray(arg.messages), 'ChatApiRequest should have messages');
    const msgs = arg.messages;
    assert(!msgs.some(m => m.content === 'DOC: sizing only'), 'Resource docs must not be included in ChatApiRequest.messages');

    // Identity check: the four-field object sized equals the four fields sent
    // Normalize messages without casts
    const msgsUnknown2 = Array.isArray(arg['messages']) ? arg['messages'] : [];
    const normalizedMessages: { role: 'system'|'user'|'assistant'; content: string }[] = [];
    for (const m of msgsUnknown2) {
        if (isRecord(m)) {
            const roleVal = typeof m['role'] === 'string' ? m['role'] : undefined;
            const contentVal = typeof m['content'] === 'string' ? m['content'] : undefined;
            if ((roleVal === 'user' || roleVal === 'assistant' || roleVal === 'system') && typeof contentVal === 'string') {
                const r = roleVal; // narrowed to union by guard
                normalizedMessages.push({ role: r, content: contentVal });
            }
        }
    }

    // Normalize resourceDocuments without casts
    const docsUnknown2 = Array.isArray(arg['resourceDocuments']) ? arg['resourceDocuments'] : [];
    const normalizedDocs: { id?: string; content: string }[] = [];
    for (const d of docsUnknown2) {
        if (isRecord(d)) {
            const idVal = typeof d['id'] === 'string' ? d['id'] : undefined;
            const contentVal = typeof d['content'] === 'string' ? d['content'] : undefined;
            if (typeof contentVal === 'string') {
                normalizedDocs.push({ id: idVal, content: contentVal });
            }
        }
    }

    const sentFour = {
        systemInstruction: typeof arg['systemInstruction'] === 'string' ? arg['systemInstruction'] : undefined,
        message: typeof arg['message'] === 'string' ? arg['message'] : undefined,
        messages: normalizedMessages,
        resourceDocuments: normalizedDocs,
    };
    assert(sizedPayload !== null, 'countTokens should have captured the full payload');
    assertEquals(sentFour, sizedPayload);

    countStub.restore();
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
        context_window_tokens: 100,
        provider_max_output_tokens: 50,
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

    let countCallIdx = 0;
    const deterministicCountTokens: CountTokensFn = () => {
        countCallIdx++;
        return countCallIdx === 1 ? 213 : 90;
    };
    const deps = getMockDeps({
        tokenWalletService: mockTokenWalletService,
        ragService: mockRagService,
        countTokens: deterministicCountTokens,
    });

    // NEW: Configure the RAG service mock to return a short summary.
    mockRagService.setConfig({
        mockContextResult: 'short summary',
    });

    // Provide a long history, one of which is already indexed
    const payloadWithHistoryIds: PromptConstructionPayload = {
        systemInstruction: '',
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
        job: createMockJob({ ...testPayload, walletId: 'wallet-ghi' }),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: payloadWithHistoryIds,
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
        inputsRelevance: [],
    };

    // 2. Act
    await executeModelCallAndSave(params);

    // 3. Assert
    assertEquals(ragSpy.calls.length, 1, "RAG service should be called");
    
    const ragArgs = ragSpy.calls[0].args[0]; // sourceDocumentsForRag
    assertEquals(ragArgs.length, 1, "RAG service should only be called with one document.");
    assertEquals(ragArgs[0].id, 'history-msg-4', "The un-indexed document should be the one passed to RAG.");
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
            is_header: false,
            source_prompt_resource_id: null,
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
            is_header: false,
            source_prompt_resource_id: null,
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
            is_header: false,
            source_prompt_resource_id: null,
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
    
    const deps = getMockDeps({
        tokenWalletService: mockTokenWalletService,
        ragService: mockRagService,
        countTokens,
    });
    
    // CORRECTED: Create a mock compression strategy to control the exact return value.
    const mockCompressionStrategy: ICompressionStrategy = async () => {
        // This mock will return candidates in a predefined order, ignoring the actual scoring logic.
        return Promise.resolve([
            { id: 'docB', content: 'Low relevance B', sourceType: 'document', originalIndex: 1, valueScore: 0.1, effectiveScore: 0.1 },
            { id: 'docC', content: 'Low relevance C', sourceType: 'document', originalIndex: 2, valueScore: 0.2, effectiveScore: 0.2 },
            { id: 'history-msg-4', content: 'History message 4', sourceType: 'history', originalIndex: 4, valueScore: 0.3, effectiveScore: 0.3 },
            { id: 'docA', content: 'High relevance A', sourceType: 'document', originalIndex: 0, valueScore: 0.9, effectiveScore: 0.9 },
    ]);
    };

    if (!isRecord(mockFullProviderData.config)) {
        throw new Error('Test setup error: mockFullProviderData.config is not an object');
    }

    // Configure token limits
    const limitedConfig = {
        ...mockFullProviderData.config,
        context_window_tokens: 100, // Force compression with real tokenizer
        provider_max_output_tokens: 50,
    };
    if (!isRecord(limitedConfig)) throw new Error("Test config error");

    // Mock DB calls
    const { client: dbClient } = setupMockClient({
        'ai_providers': { select: { data: [{ ...mockFullProviderData, config: limitedConfig }], error: null } },
        'dialectic_memory': { select: { data: [{ source_contribution_id: 'history-msg-3' }], error: null } },
    });

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob({ ...testPayload, walletId: 'wallet-ghi' }),
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
        inputsRelevance: [],
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
        context_window_tokens: 20,
        provider_max_output_tokens: 50,
    };

    const { client: dbClient } = setupMockClient({
        'ai_providers': {
            select: { data: [{ ...mockFullProviderData, config: limitedConfig }], error: null }
        },
        'dialectic_memory': {
            select: { data: [], error: null } // No indexed chunks
        }
    });

    const deps = getMockDeps({ ragService: mockRagService, countTokens });

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
            { id: 'history-msg-4', role: 'assistant', content: 'This is an interstitial message to create a valid middle.' },
            { id: 'history-msg-5', role: 'user', content: 'This is the penultimate message.' },
            { id: 'history-msg-6', role: 'assistant', content: 'This is the second to last message.' },
            { id: 'history-msg-7', role: 'assistant', content: 'This is the final message before the current prompt.' },
        ],
        resourceDocuments: [],
        currentUserPrompt: "This is the current user prompt.",
    };

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob({ ...testPayload, walletId: 'wallet-ghi' }),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: oversizedPayload,
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

// After compression, enforce allowed input headroom before provider call
// End-state assertion: if final token count exceeds allowed input (provider_max_input_tokens - (plannedMaxOutputTokens + safetyBuffer)),
// the provider must NOT be called.
Deno.test('does not call provider if final input exceeds allowed headroom after compression', async () => {
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  const cfg = {
    ...mockFullProviderData.config,
    context_window_tokens: 100,      // loop fits when <= 100
    provider_max_input_tokens: 100,      // basis for allowed input
    provider_max_output_tokens: 50,      // planned output budget
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
  };
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [{ ...mockFullProviderData, config: cfg }], error: null } },
  });

  // Large balance so plannedMaxOutputTokens == provider_max_output_tokens
  const { instance: mockTokenWalletService } = createMockTokenWalletService({
    getBalance: () => Promise.resolve('1000000'),
  });

  const mockRag = new MockRagService();
  mockRag.setConfig({ mockContextResult: 'summary', mockTokensUsed: 10 });
  const deps = getMockDeps({ tokenWalletService: mockTokenWalletService, ragService: mockRag });
  const modelSpy = spy(deps, 'callUnifiedAIModel');

  // Token counter: first call oversized (200), second call fits maxTokens (50) but violates allowed headroom
  let callIdx = 0;
  let lastCount = -1;
  const countStub = stub(deps, 'countTokens', () => {
    callIdx++;
    lastCount = callIdx === 1 ? 200 : 50;
    return lastCount;
  });

  const oneCandidateStrategy: ICompressionStrategy = async () => ([
    { id: 'history-msg-3', content: 'long content', sourceType: 'history', originalIndex: 3, valueScore: 0.5, effectiveScore: 0.5 },
  ]);

  const payload: PromptConstructionPayload = {
    systemInstruction: '',
    conversationHistory: [
      { id: 'history-msg-0', role: 'system', content: 'You are a helpful assistant.' },
      { id: 'history-msg-1', role: 'user', content: 'first' },
      { id: 'history-msg-2', role: 'assistant', content: 'second' },
      { id: 'history-msg-3', role: 'user', content: 'very long middle that should be summarized' },
      { id: 'history-msg-4', role: 'assistant', content: 'tail-1' },
    ],
    resourceDocuments: [],
    currentUserPrompt: 'current',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-abc' }),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy: oneCandidateStrategy,
    inputsRelevance: [],
  };

  let threw = false;
  try {
    await executeModelCallAndSave(params);
  } catch (e: unknown) {
    threw = true;
    assert(e instanceof ContextWindowError, 'Expected a ContextWindowError for headroom violation.');
  }

  // Compute allowed input per end-state rule
  const safetyBuffer = 32;
  const allowedInput = (cfg.provider_max_input_tokens || 0) - ((cfg.provider_max_output_tokens || 0) + safetyBuffer);

  // End-state assertions: must not call provider if violating allowed headroom
  assert(threw, 'Expected headroom violation to throw before provider call.');
  assert(lastCount > allowedInput, 'Test setup error: final token count should exceed allowed input.');
  assertEquals(modelSpy.calls.length, 0, 'Provider must not be called when final input exceeds allowed headroom.');

  countStub.restore();
});

Deno.test('proceeds when final input equals allowed headroom (boundary success)', async () => {
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  const cfg = {
    ...mockFullProviderData.config,
    context_window_tokens: 1000,     // ensure non-oversized path
    provider_max_input_tokens: 100,      // basis for allowed input
    provider_max_output_tokens: 50,      // planned output budget
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
  };
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [{ ...mockFullProviderData, config: cfg }], error: null } },
  });

  // Large balance so plannedMaxOutputTokens == provider_max_output_tokens
  const { instance: mockTokenWalletService } = createMockTokenWalletService({
    getBalance: () => Promise.resolve('1000000'),
  });

  const deps = getMockDeps({ tokenWalletService: mockTokenWalletService });
  const modelSpy = spy(deps, 'callUnifiedAIModel');

  // allowedInput = provider_max_input_tokens - (provider_max_output_tokens + 32)
  const safetyBuffer = 32;
  const allowedInput = (cfg.provider_max_input_tokens || 0) - ((cfg.provider_max_output_tokens || 0) + safetyBuffer);

  // Token counter returns exactly allowed input (boundary success)
  const countStub = stub(deps, 'countTokens', () => allowedInput);

  const payload: PromptConstructionPayload = {
    systemInstruction: '',
    conversationHistory: [
      { role: 'user', content: 'seed' },
    ],
    resourceDocuments: [],
    currentUserPrompt: 'current',
  };

  const stageSlug = 'thesis';
  const rootId = 'root-prev';
  const rel: DocumentRelationships = { [stageSlug]: rootId };
  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-xyz', stageSlug, document_relationships: rel }),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
    inputsRelevance: [],
  };

  await executeModelCallAndSave(params);

  // Expect provider to be called exactly once when at boundary
  assertEquals(modelSpy.calls.length, 1, 'Provider should be called when final input equals allowed headroom.');
  countStub.restore();
});

Deno.test('fails when final input exceeds allowed headroom by 1 token (boundary failure)', async () => {
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  const cfg = {
    ...mockFullProviderData.config,
    context_window_tokens: 1000,     // ensure non-oversized path
    provider_max_input_tokens: 100,
    provider_max_output_tokens: 50,
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
  };
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [{ ...mockFullProviderData, config: cfg }], error: null } },
  });

  const { instance: mockTokenWalletService } = createMockTokenWalletService({
    getBalance: () => Promise.resolve('1000000'),
  });

  const deps = getMockDeps({ tokenWalletService: mockTokenWalletService });
  const modelSpy = spy(deps, 'callUnifiedAIModel');

  const safetyBuffer = 32;
  const allowedInput = (cfg.provider_max_input_tokens || 0) - ((cfg.provider_max_output_tokens || 0) + safetyBuffer);

  // Return one token over the allowed input
  const countStub = stub(deps, 'countTokens', () => allowedInput + 1);

  const payload: PromptConstructionPayload = {
    systemInstruction: '',
    conversationHistory: [ { role: 'user', content: 'seed' } ],
    resourceDocuments: [],
    currentUserPrompt: 'current',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-xyz' }),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
    inputsRelevance: [],
  };

  let threw = false;
  try {
    await executeModelCallAndSave(params);
  } catch (e: unknown) {
    threw = true;
    assert(e instanceof ContextWindowError, 'Expected a ContextWindowError for boundary headroom violation.');
  }
  assert(threw, 'Expected failure when exceeding allowed input headroom by 1 token.');
  assertEquals(modelSpy.calls.length, 0, 'Provider must not be called when exceeding allowed input.');
  countStub.restore();
});

Deno.test('enforces strict user-assistant alternation in ChatApiRequest after compression', async () => {
  // Arrange: configure compression and create a history that violates alternation (two assistants in a row)
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  const cfg = {
    ...mockFullProviderData.config,
    context_window_tokens: 50,
    provider_max_input_tokens: 10000,
    provider_max_output_tokens: 50,
  };
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [{ ...mockFullProviderData, config: cfg }], error: null } },
    'dialectic_memory': { select: { data: [], error: null } },
  });

  const deps = getMockDeps();
  const modelSpy = spy(deps, 'callUnifiedAIModel');

  // Token count: first oversized, then fits
  let idx = 0;
  const countStub = stub(deps, 'countTokens', () => (++idx === 1 ? 100 : 40));

  // Candidates will compress mids, keeping anchors that may violate alternation
  const mockCompressionStrategy: ICompressionStrategy = async () => ([
    { id: 'mid-1', content: 'MID-1', sourceType: 'history', originalIndex: 2, valueScore: 0.2, effectiveScore: 0.2 },
    { id: 'mid-2', content: 'MID-2', sourceType: 'history', originalIndex: 3, valueScore: 0.3, effectiveScore: 0.3 },
  ]);

  const conversation: Messages[] = [
    { id: 'u-0', role: 'user', content: 'ORIGINAL USER' },
    { id: 'a-0', role: 'assistant', content: 'FIRST ASSIST' },
    { id: 'mid-1', role: 'user', content: 'MID-1' },
    { id: 'mid-2', role: 'assistant', content: 'MID-2' },
    { id: 'a-1', role: 'assistant', content: 'TAIL ASSIST 1' }, // consecutive assistant
    { id: 'a-2', role: 'assistant', content: 'TAIL ASSIST 2' }, // consecutive assistant
    { id: 'u-last', role: 'user', content: 'Please continue.' },
  ];

  const stageSlug2 = 'thesis';
  const rootId2 = 'prev';
  const rel2: DocumentRelationships = { [stageSlug2]: rootId2 };
  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({
      ...testPayload,
      walletId: 'wallet-turn',
      target_contribution_id: rootId2,
      continueUntilComplete: true,
      continuation_count: 1,
      stageSlug: stageSlug2,
      document_relationships: rel2,
    }),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: {
      systemInstruction: 'SYS',
      conversationHistory: conversation,
      resourceDocuments: [],
      currentUserPrompt: 'Please continue.',
    },
    sessionData: mockSessionData,
    compressionStrategy: mockCompressionStrategy,
    inputsRelevance: [],
  };

  // Act
  await executeModelCallAndSave(params);

  // Assert: captured adapter request must have strict alternation (ignoring 'system') starting and ending with 'user'
  assertEquals(modelSpy.calls.length, 1, 'Model should be called once');
  const arg = modelSpy.calls[0].args[0];
  assert(isRecord(arg) && Array.isArray(arg.messages), 'ChatApiRequest should contain messages');
  const msgsUnknown = arg['messages'];
  const roles: ('user'|'assistant')[] = [];
  for (const m of (Array.isArray(msgsUnknown) ? msgsUnknown : [])) {
    if (isRecord(m)) {
      const roleVal = typeof m['role'] === 'string' ? m['role'] : undefined;
      const contentVal = typeof m['content'] === 'string' ? m['content'] : undefined;
      if ((roleVal === 'user' || roleVal === 'assistant') && typeof contentVal === 'string') {
        roles.push(roleVal);
      }
    }
  }

  // RED expectations (should fail with current implementation):
  assertEquals(roles[0], 'user', 'First message should be user');
  for (let i = 0; i < roles.length - 1; i++) {
    assert(roles[i] !== roles[i + 1], 'Adjacent messages must alternate user/assistant');
  }
  assertEquals(roles[roles.length - 1], 'user', 'Last message should be user (continuation)');

  countStub.restore();
});

Deno.test('preserves continuation anchors after compression', async () => {
  // Arrange: force compression with controlled token counts
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  const cfg = {
    ...mockFullProviderData.config,
    context_window_tokens: 50,
    provider_max_input_tokens: 10000,
    provider_max_output_tokens: 50,
  };
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [{ ...mockFullProviderData, config: cfg }], error: null } },
    'dialectic_memory': { select: { data: [], error: null } },
  });

  const deps = getMockDeps();
  const modelSpy = spy(deps, 'callUnifiedAIModel');

  // Stub token counter: first call oversized (100), second call fits (40)
  let countIdx = 0;
  const countStub = stub(deps, 'countTokens', () => {
    countIdx++;
    return countIdx === 1 ? 100 : 40;
  });

  // Mock compression ordering: select only middle items, preserve anchors by design
  const mockCompressionStrategy: ICompressionStrategy = async () => ([
    { id: 'mid-1', content: 'MID-1', sourceType: 'history', originalIndex: 3, valueScore: 0.2, effectiveScore: 0.2 },
    { id: 'mid-2', content: 'MID-2', sourceType: 'history', originalIndex: 4, valueScore: 0.3, effectiveScore: 0.3 },
  ]);

  // Build conversation with explicit anchors
  const conversation: Messages[] = [
    { id: 'orig-user', role: 'user', content: 'ORIGINAL USER' },           // original user (anchor)
    { id: 'first-assistant', role: 'assistant', content: 'FIRST ASSIST' }, // first assistant (anchor)
    { id: 'mid-1', role: 'user', content: 'MID-1' },
    { id: 'mid-2', role: 'assistant', content: 'MID-2' },
    { id: 'last-assistant-1', role: 'assistant', content: 'TAIL ASSIST 1' }, // last two assistants (anchors)
    { id: 'user-interstitial', role: 'user', content: 'Okay, go on.' }, // Injected to maintain turn order
    { id: 'last-assistant-2', role: 'assistant', content: 'TAIL ASSIST 2' },
    { id: 'please-continue', role: 'user', content: 'Please continue.' },   // single trailing continuation
  ];

  const stageSlug3 = 'thesis';
  const rootId3 = 'prev-contrib-id';
  const rel3: DocumentRelationships = { [stageSlug3]: rootId3 };
  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({
      ...testPayload,
      walletId: 'wallet-ctn',
      target_contribution_id: rootId3,
      continueUntilComplete: true,
      continuation_count: 1,
      stageSlug: stageSlug3,
      document_relationships: rel3,
    }),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: {
      systemInstruction: 'SYS',
      conversationHistory: conversation,
      resourceDocuments: [],
      currentUserPrompt: 'Please continue.',
    },
    sessionData: mockSessionData,
    compressionStrategy: mockCompressionStrategy,
    inputsRelevance: [],
  };

  // Act
  await executeModelCallAndSave(params);

  // Assert
  assertEquals(modelSpy.calls.length, 1, 'Model should be called once after compression fits.');
  const arg = modelSpy.calls[0].args[0];
  assert(isRecord(arg) && Array.isArray(arg.messages), 'ChatApiRequest should contain messages');

  // Normalize messages without casts
  const msgsUnknown = arg['messages'];
  const normalized: { role: 'system'|'user'|'assistant'; content: string }[] = [];
  if (Array.isArray(msgsUnknown)) {
    for (const m of msgsUnknown) {
      if (isRecord(m)) {
        const roleVal = typeof m['role'] === 'string' ? m['role'] : undefined;
        const contentVal = typeof m['content'] === 'string' ? m['content'] : undefined;
        if ((roleVal === 'user' || roleVal === 'assistant' || roleVal === 'system') && typeof contentVal === 'string') {
          const r = roleVal;
          normalized.push({ role: r, content: contentVal });
        }
      }
    }
  }

  // Invariants:
  // - original user present
  assert(normalized.some(m => m.role === 'user' && m.content === 'ORIGINAL USER'), 'Original user message must be preserved');
  // - first assistant present
  assert(normalized.some(m => m.role === 'assistant' && m.content === 'FIRST ASSIST'), 'First assistant message must be preserved');
  // - last two assistants present (by content)
  assert(normalized.some(m => m.role === 'assistant' && m.content === 'TAIL ASSIST 1'), 'Tail assistant 1 must be preserved');
  assert(normalized.some(m => m.role === 'assistant' && m.content === 'TAIL ASSIST 2'), 'Tail assistant 2 must be preserved');
  // - single trailing "Please continue." user message
  const lastMsg = normalized[normalized.length - 1];
  assert(lastMsg && lastMsg.role === 'user' && lastMsg.content === 'Please continue.', 'The trailing message must be the continuation prompt');

  countStub.restore();
});

Deno.test('RAG debits use stable idempotency keys tied to job and candidate', async () => {
  // Arrange: force two compression iterations with non-zero tokensUsed each time
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  const cfg = {
    ...mockFullProviderData.config,
    context_window_tokens: 100,
    provider_max_input_tokens: 10000,
    provider_max_output_tokens: 50,
  };

  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [{ ...mockFullProviderData, config: cfg }], error: null } },
  });

  // Token wallet mock to capture debit calls
  const { instance: mockTokenWalletService, stubs: walletStubs } = createMockTokenWalletService();

  // RAG mock to return a positive tokensUsed value on each iteration
  const mockRag = new MockRagService();
  mockRag.setConfig({ mockContextResult: 'summary', mockTokensUsed: 7 });

  // Dependencies
  const counts = [300, 150, 80];
  const deterministicCountTokens: CountTokensFn = () => {
    const next = counts.shift();
    if (typeof next !== 'number') return 80; // fallback safe fit
    return next;
  };
  const deps = getMockDeps({
    tokenWalletService: mockTokenWalletService,
    ragService: mockRag,
    countTokens: deterministicCountTokens,
  });

  // Two candidates processed in order
  const mockCompressionStrategy: ICompressionStrategy = async () => ([
    { id: 'cand-1', content: 'long content A', sourceType: 'document', originalIndex: 0, valueScore: 0.2, effectiveScore: 0.2 },
    { id: 'cand-2', content: 'long content B', sourceType: 'history', originalIndex: 1, valueScore: 0.3, effectiveScore: 0.3 },
  ]);

  const payload: PromptConstructionPayload = {
    systemInstruction: '',
    conversationHistory: [ { role: 'user', content: 'seed' }, { role: 'assistant', content: 'reply' } ],
    resourceDocuments: [ { id: 'docX', content: 'very long doc', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: 'user-789', session_id: 'session-1', iteration_number: 1, target_contribution_id: 'contribution-1', document_relationships: null, mime_type: 'text/plain', citations: [], contribution_type: 'source_document', edit_version: 1, error: null, file_name: 'docX.txt', is_latest_edit: true, model_id: 'model-1', model_name: 'test-model', original_model_contribution_id: 'contribution-1', processing_time_ms: 100, prompt_template_id_used: null, raw_response_storage_path: null, seed_prompt_url: null, size_bytes: 100, storage_bucket: 'test-bucket', storage_path: 'test/path', tokens_used_input: 10, tokens_used_output: 20, stage: 'test-stage', is_header: false, source_prompt_resource_id: null } ],
    currentUserPrompt: 'current',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-stable' }),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy: mockCompressionStrategy,
    inputsRelevance: [],
  };

  // Act
  await executeModelCallAndSave(params);

  // Assert: exactly two wallet debits recorded for RAG, with stable idempotency keys
  const calls = walletStubs.recordTransaction.calls;
  assertEquals(calls.length, 2, 'Expected one debit per RAG compression iteration');

  // Expected stable scheme: rag:<jobId>:<candidateId>
  const jobId = 'job-id-123';
  const expectedKeys = new Set([`rag:${jobId}:cand-1`, `rag:${jobId}:cand-2`]);
  const seenKeys = new Set<string>();

  for (const c of calls) {
    const arg = c.args[0] as { walletId: string; type: string; amount: string; recordedByUserId: string; idempotencyKey: string; relatedEntityId?: string; relatedEntityType?: string; notes?: string };
    assertEquals(arg.type, 'DEBIT_USAGE');
    assertEquals(arg.relatedEntityType, 'rag_compression');
    assert(arg.relatedEntityId === 'cand-1' || arg.relatedEntityId === 'cand-2', 'relatedEntityId should match candidate id');
    assert(typeof arg.idempotencyKey === 'string' && arg.idempotencyKey.length > 0, 'idempotencyKey should be present');
    const expectedKey = `rag:${jobId}:${arg.relatedEntityId}`;
    // RED: enforce stable key formula; current implementation uses random UUID and should fail here
    assertEquals(arg.idempotencyKey, expectedKey, 'idempotencyKey must be stable and derived from job and candidate');
    seenKeys.add(arg.idempotencyKey);
  }

  assertEquals(seenKeys.size, 2, 'Idempotency keys should be unique per candidate and stable across retries');
});

// Recompute SSOT after RAG debit reduces balance
Deno.test('recomputes SSOT output after RAG debit reduces balance', async () => {
  if (!isRecord(mockFullProviderData.config)) throw new Error('Test setup error: config not object');
  const cfg = {
    ...mockFullProviderData.config,
    context_window_tokens: 100,       // force compression
    provider_max_input_tokens: 200,
    provider_max_output_tokens: 1000,
    input_token_cost_rate: 1,         // costful RAG to reduce balance
    output_token_cost_rate: 1,
  };
  const { client: dbClient } = setupMockClient({ 'ai_providers': { select: { data: [{ ...mockFullProviderData, config: cfg }], error: null } } });

  // Balance high enough for first SSOT; then reduced via RAG debit to shrink SSOT
  // Start balance 200; initial SSOT_output ~ floor(0.8*200 / 1) = 160
  const { instance: mockTokenWalletService, stubs } = createMockTokenWalletService({ getBalance: () => Promise.resolve('700') });

  const mockRag = new MockRagService();
  mockRag.setConfig({ mockContextResult: 'short', mockTokensUsed: 50 });
  const deps = getMockDeps({ tokenWalletService: mockTokenWalletService, ragService: mockRag });
  const modelSpy = spy(deps, 'callUnifiedAIModel');

  // Count tokens path: initial tokenCount oversized (300), after first compression (150), after second (80) fits
  let idx = 0;
  const countStub = stub(deps, 'countTokens', () => (++idx === 1 ? 300 : (idx === 2 ? 150 : 80)));

  const mockCompressionStrategy: ICompressionStrategy = async () => ([
    { id: 'cand-1', content: 'long-1', sourceType: 'document', originalIndex: 1, valueScore: 0.1, effectiveScore: 0.1 },
    { id: 'cand-2', content: 'long-2', sourceType: 'history', originalIndex: 2, valueScore: 0.2, effectiveScore: 0.2 },
  ]);

  const payload: PromptConstructionPayload = {
    systemInstruction: '',
    conversationHistory: [ { role: 'user', content: 'seed' }, { role: 'assistant', content: 'reply' } ],
    resourceDocuments: [],
    currentUserPrompt: 'CURR',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-ssot-recompute' }),
    projectOwnerUserId: 'user-xyz',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy: mockCompressionStrategy,
    inputsRelevance: [],
  };

  await executeModelCallAndSave(params);

  // Assert: wallet debits occurred for RAG
  assert(stubs.recordTransaction.calls.length >= 1, 'Expected at least one RAG debit to reduce balance');
  // Provider called once at the end
  assertEquals(modelSpy.calls.length, 1, 'Model should be called once after recomputation enforces new headroom');

  countStub.restore();
});

// Final ChatApiRequest.cap equals SSOT(final input)
Deno.test('final ChatApiRequest.max_tokens_to_generate equals SSOT(final input)', async () => {
  if (!isRecord(mockFullProviderData.config)) throw new Error('Test setup error: config not object');
  const cfg = {
    ...mockFullProviderData.config,
    context_window_tokens: 1000,      // ensure non-oversized final after one compression cycle
    provider_max_input_tokens: 10000,
    provider_max_output_tokens: 500,
    input_token_cost_rate: 1,
    output_token_cost_rate: 2,
  };
  const { client: dbClient } = setupMockClient({ 'ai_providers': { select: { data: [{ ...mockFullProviderData, config: cfg }], error: null } } });

  // Balance chosen so SSOT_output = floor(0.8*balance / output_rate)
  // balance=1000 => floor(800/2)=400
  const { instance: mockTokenWalletService } = createMockTokenWalletService({ getBalance: () => Promise.resolve('1000') });
  const deps = getMockDeps({ tokenWalletService: mockTokenWalletService });
  const modelSpy = spy(deps, 'callUnifiedAIModel');

  // Token counter: initial count fits window (50) so we use non-oversized path, but we still want to validate cap equals SSOT
  const countStub = stub(deps, 'countTokens', () => 50);

  const payload: PromptConstructionPayload = {
    systemInstruction: 'SYS',
    conversationHistory: [ { role: 'user', content: 'hello' } ],
    resourceDocuments: [],
    currentUserPrompt: 'CURR',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-final-ssot' }),
    projectOwnerUserId: 'user-xyz',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
    inputsRelevance: [],
  };

  await executeModelCallAndSave(params);
  assertEquals(modelSpy.calls.length, 1, 'Model should be called once');
  const sent = modelSpy.calls[0].args[0] as { max_tokens_to_generate?: number };
  assertEquals(sent.max_tokens_to_generate, 400, 'Final cap must equal SSOT output for final-sized payload');

  countStub.restore();
});

// SSOT cap is threaded unchanged to /chat in compression path
Deno.test('threads SSOT cap unchanged to callUnifiedAIModel in compression path', async () => {
  if (!isRecord(mockFullProviderData.config)) throw new Error('Test setup error: config not object');
  const cfg = {
    ...mockFullProviderData.config,
    context_window_tokens: 600,       // force compression path with ample headroom for SSOT output
    provider_max_input_tokens: 10000, // avoid input headroom conflicts in this identity test
    provider_max_output_tokens: 1000, // not limiting
    input_token_cost_rate: 0,         // simplify SSOT to budget/output only
    output_token_cost_rate: 2,
  };
  const { client: dbClient } = setupMockClient({ 'ai_providers': { select: { data: [{ ...mockFullProviderData, config: cfg }], error: null } } });

  // Wallet balance => SSOT_output = floor(0.8 * balance / output_rate) = floor(800 / 2) = 400
  const { instance: mockTokenWalletService } = createMockTokenWalletService({ getBalance: () => Promise.resolve('1000') });
  const deps = getMockDeps({ tokenWalletService: mockTokenWalletService });
  const modelSpy = spy(deps, 'callUnifiedAIModel');

  // Token counter: start oversized, compress to fit
  let idx = 0;
  const countStub = stub(deps, 'countTokens', () => (++idx === 1 ? 700 : 90));

  // One or more candidates to trigger RAG/compression loop
  const mockCompressionStrategy: ICompressionStrategy = async () => ([
    { id: 'cand-1', content: 'long-1', sourceType: 'document', originalIndex: 1, valueScore: 0.1, effectiveScore: 0.1 },
  ]);

  const payload: PromptConstructionPayload = {
    systemInstruction: '',
    conversationHistory: [ { role: 'user', content: 'seed' }, { role: 'assistant', content: 'reply' } ],
    resourceDocuments: [],
    currentUserPrompt: 'CURR',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-rag-identity' }),
    projectOwnerUserId: 'user-xyz',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy: mockCompressionStrategy,
    inputsRelevance: [],
  };

  await executeModelCallAndSave(params);
  assertEquals(modelSpy.calls.length, 1, 'Model should be called once after compression fits');
  const sent = modelSpy.calls[0].args[0] as { max_tokens_to_generate?: number };
  assertEquals(sent.max_tokens_to_generate, 400, 'SSOT cap must be forwarded unchanged to callUnifiedAIModel');

  countStub.restore();
});

// 113.A RED: Allowed input headroom uses SSOT (budget-based) not provider cap
Deno.test('uses SSOT-based output headroom (budget) to compute allowed input during compression', async () => {
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  // Model config: provider output cap large; input rate = 0 so SSOT output depends only on balance (0.8 * balance / output_rate)
  const cfg = {
    ...mockFullProviderData.config,
    context_window_tokens: 100,        // force compression
    provider_max_input_tokens: 200,    // headroom basis
    provider_max_output_tokens: 1000,  // not limiting; SSOT (budget) should dominate
    input_token_cost_rate: 0,          // make SSOT output independent of tokenCount
    output_token_cost_rate: 1,
  };

  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [{ ...mockFullProviderData, config: cfg }], error: null } },
    'dialectic_memory': { select: { data: [], error: null } },
  });

  // Wallet balance => SSOT_output = floor(0.8 * balance / output_rate) = 80
  const { instance: mockTokenWalletService } = createMockTokenWalletService({ getBalance: () => Promise.resolve('100') });

  const deps = getMockDeps({ tokenWalletService: mockTokenWalletService });
  const modelSpy = spy(deps, 'callUnifiedAIModel');

  // Token counter sequence: initial oversized (120), first compression (89) still violates headroom, second (88) fits
  // Allowed input based on SSOT:  allowedInput = provider_max_input_tokens - (SSOT_output + 32) = 200 - (80 + 32) = 88
  let idx = 0;
  const countStub = stub(deps, 'countTokens', () => {
    idx++;
    return idx === 1 ? 120 : (idx === 2 ? 89 : 88);
  });

  // Compression strategy to ensure at least two iterations
  const mockCompressionStrategy: ICompressionStrategy = async () => ([
      { id: 'cand-1', content: 'middle-1', sourceType: 'history', originalIndex: 3, valueScore: 0.2, effectiveScore: 0.2 },
    { id: 'cand-2', content: 'middle-2', sourceType: 'document', originalIndex: 1, valueScore: 0.3, effectiveScore: 0.3 },
  ]);

  const payload: PromptConstructionPayload = {
    systemInstruction: '',
    conversationHistory: [
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'A'.repeat(400) },
      { role: 'assistant', content: 'B' },
    ],
    resourceDocuments: [],
    currentUserPrompt: 'CURR',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-ssot' }),
    projectOwnerUserId: 'user-abc',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy: mockCompressionStrategy,
    inputsRelevance: [],
  };

  await executeModelCallAndSave(params);

  // Assert: provider called exactly once when final input equals SSOT-based allowed input (88)
  assertEquals(modelSpy.calls.length, 1, 'Model should be called once, only when SSOT headroom condition is met.');

  countStub.restore();
});

// Error specificity in worker - missing wallet should throw a clear, unique message and never call provider
Deno.test('error specificity: missing wallet throws "Wallet is required to process model calls." and does not call provider', async () => {
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
  });

  const deps = getMockDeps();
  const modelSpy = spy(deps, 'callUnifiedAIModel');

  const payload: PromptConstructionPayload = {
    systemInstruction: '',
    conversationHistory: [ { role: 'user', content: 'hello' } ],
    resourceDocuments: [],
    currentUserPrompt: 'current',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: '' }), // missing wallet
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
    inputsRelevance: [],
  };

  let threw = false;
  try {
    await executeModelCallAndSave(params);
  } catch (e: unknown) {
    threw = true;
    assert(e instanceof Error, 'Expected an Error to be thrown');
    if (e instanceof Error) {
      assertEquals(e.message, 'Wallet is required to process model calls.');
    }
  }
  assert(threw, 'Expected an error to be thrown for missing wallet');
  assertEquals(modelSpy.calls.length, 0, 'Provider should not be called when wallet is missing');
});

// Error specificity in worker - missing critical dependency throws a clear, unique message and never calls provider
Deno.test("error specificity: missing 'countTokens' dependency throws and does not call provider", async () => {
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
  });

  const baseDeps = getMockDeps();
  const modelSpy = spy(baseDeps, 'callUnifiedAIModel');
  // Intentionally pass an invalid deps object for error-handling test: remove countTokens
  const badDeps = { ...baseDeps } as unknown as typeof baseDeps;
  delete (badDeps as unknown as Record<string, unknown>)['countTokens'];

  const payload: PromptConstructionPayload = {
    systemInstruction: '',
    conversationHistory: [ { role: 'user', content: 'hello' } ],
    resourceDocuments: [],
    currentUserPrompt: 'current',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps: badDeps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-xyz' }),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
    inputsRelevance: [],
  };

  let threw = false;
  try {
    await executeModelCallAndSave(params);
  } catch (e: unknown) {
    threw = true;
    assert(e instanceof Error, 'Expected an Error to be thrown');
    if (e instanceof Error) {
      assertEquals(e.message, "Dependency 'countTokens' is not provided.");
    }
  }
  assert(threw, "Expected an error to be thrown when 'countTokens' is missing");
  assertEquals(modelSpy.calls.length, 0, 'Provider should not be called when a critical dependency is missing');
});

// 123.g: Preflight should reject when compression + planned embeddings + final send would exceed 80% of balance
Deno.test('preflight rejects when total planned spend (compression + embeddings + final) exceeds 80% budget', async () => {
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }

  // Math setup (do the math first):
  // - Balance B = 375 -> 80% of B = 300
  // - initialTokenCount = 300, context_window_tokens (cw) = 200 (oversized)
  //   tokensToBeRemoved = 300 - 200 = 100
  // - input_token_cost_rate = 1, output_token_cost_rate = 1
  //   estimatedCompressionCost = 100, estimatedFinalPromptCost = 200 => input-only total = 300 (== 80% of B) → passes
  // - planned embedding queries add any positive cost E > 0 → total > 300 → should be rejected by preflight

  const cfg: AiModelExtendedConfig = {
    ...mockFullProviderData.config,
    context_window_tokens: 200,
    provider_max_input_tokens: 0,     // treat as Infinity in headroom logic
    provider_max_output_tokens: 1000, // not limiting
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
    api_identifier: 'test-api',
    tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
  };

  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [{ ...mockFullProviderData, config: cfg }], error: null } },
  });

  // Wallet balance B = 375
  const { instance: mockTokenWalletService } = createMockTokenWalletService({
    getBalance: () => Promise.resolve('450'),
  });

  const mockRag = new MockRagService();
  mockRag.setConfig({ mockContextResult: 'short summary', mockTokensUsed: 10 });
  const deps = getMockDeps({ tokenWalletService: mockTokenWalletService, ragService: mockRag });

  // Token counter: first call oversized (300), after one compression fits exactly cw (200)
  let idx = 0;
  const countStub = stub(deps, 'countTokens', () => (++idx === 1 ? 300 : 200));

  // Provide one compression candidate so the function would proceed if preflight does not reject
  const oneCandidateStrategy: ICompressionStrategy = async () => ([
    { id: 'cand-embed', content: 'long content to summarize', sourceType: 'history', originalIndex: 1, valueScore: 0.5, effectiveScore: 0.5 },
  ]);

  const payload: PromptConstructionPayload = {
    systemInstruction: 'SYS',
    conversationHistory: [ { role: 'user', content: 'hello' } ],
    resourceDocuments: [],
    currentUserPrompt: 'current',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-embeds-preflight' }),
    projectOwnerUserId: 'user-emb',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy: oneCandidateStrategy,
    inputsRelevance: [],
  };

  let threw = false;
  try {
    await executeModelCallAndSave(params);
  } catch (e: unknown) {
    threw = true;
    // Expect the specific rationality (80%) error to be thrown once embedding costs are included in preflight
    if (e instanceof Error) {
      assert(e.message.includes('80%') || e.message.includes('exceeds 80%'), `Expected preflight 80% rejection message, got: ${e.message}`);
    }
  }

  // End-state expectation: with embedding costs included, preflight should reject
  // Current implementation excludes embeddings in preflight, so this test should fail (RED) until fixed.
  assert(threw, 'Preflight should reject when planned total (including embeddings) exceeds 80% of balance.');

  countStub.restore();
});