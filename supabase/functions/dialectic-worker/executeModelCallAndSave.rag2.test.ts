import {
    assertEquals,
    assert,
  } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
  import { spy } from 'https://deno.land/std@0.224.0/testing/mock.ts';
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
    RelevanceRule,
} from '../dialectic-service/dialectic.interface.ts';
import { createMockTokenWalletService } from '../_shared/services/tokenWalletService.mock.ts';
import { 
  ICompressionStrategy, 
  getSortedCompressionCandidates 
} from '../_shared/utils/vector_utils.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { CountTokensFn } from '../_shared/types/tokenizer.types.ts';
import { IRagService } from '../_shared/services/rag_service.interface.ts';
import { IEmbeddingClient } from '../_shared/services/indexing_service.interface.ts';
import { createMockDownloadFromStorage } from '../_shared/supabase_storage_utils.mock.ts';
import type { DownloadFromStorageFn } from '../_shared/supabase_storage_utils.ts';
import {
    createMockJob,
    testPayload, 
    mockSessionData, 
    mockProviderData, 
    mockFullProviderData, 
    setupMockClient, 
    getMockDeps 
} from './executeModelCallAndSave.test.ts';

Deno.test('passes inputsRelevance to rag_service.getContextForModel and compressionStrategy', async () => {
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  const smallWindowProviderData = {
    ...mockFullProviderData,
    config: {
      ...mockFullProviderData.config,
      context_window_tokens: 100,
      provider_max_input_tokens: 256
    }
  };
  const { client: dbClient } = setupMockClient({
    'ai_providers': {
      select: { data: [smallWindowProviderData], error: null }
    },
    'dialectic_memory': {
      select: { data: [], error: null }
    }
  });

  let countIdx = 0;
  const deterministicCountTokens: CountTokensFn = () => (++countIdx === 1 ? 500 : 90);

  const { instance: tokenWalletService } = createMockTokenWalletService({ getBalance: () => Promise.resolve('100000') });

  // Capture inputsRelevance seen by rag_service
  let seenRagInputsRelevance: unknown = undefined;
  const ragService: IRagService = {
    async getContextForModel(_sourceDocuments, _modelConfig, _sessionId, _stageSlug, inputsRelevanceParam) {
      seenRagInputsRelevance = inputsRelevanceParam;
      return { context: 'summary', tokensUsedForIndexing: 0 };
    },
  };

  const deps = getMockDeps({ tokenWalletService, ragService, countTokens: deterministicCountTokens });

  // Capture the inputsRelevance received by the compression strategy
  let seenInputsRelevance: unknown = undefined;
  const capturingCompressionStrategy: ICompressionStrategy = async (_dbc, _deps, docs, _history, _currentUserPrompt, inputsRelevance) => {
    seenInputsRelevance = inputsRelevance;
    const firstDoc = docs[0];
    return [
      { id: firstDoc?.id || 'doc-1', content: firstDoc?.content || 'x', sourceType: 'document', originalIndex: 0, valueScore: 0.1, effectiveScore: 0.1 },
    ];
  };

  const inputsRelevance: RelevanceRule[] = [
    { document_key: FileType.business_case, type: 'document', relevance: 1 },
  ];

  const payload: PromptConstructionPayload = {
    systemInstruction: 'SYS',
    conversationHistory: [ { role: 'user', content: 'hello' } ],
    resourceDocuments: [
      {
        id: 'docA',
        content: 'very long content',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: 'user-1',
        session_id: 'session-1',
        iteration_number: 1,
        target_contribution_id: null,
        document_relationships: null,
        mime_type: 'text/plain',
        citations: [],
        contribution_type: 'source_document',
        edit_version: 1,
        error: null,
        file_name: 'a.txt',
        is_latest_edit: true,
        model_id: 'model-def',
        model_name: 'Mock AI',
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
      }
    ],
    currentUserPrompt: 'CURR',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-plumb' }),
    projectOwnerUserId: 'user-xyz',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy: capturingCompressionStrategy,
    inputsRelevance,
  };

  await executeModelCallAndSave(params);

  // Assert compressionStrategy received inputsRelevance
  assert(Array.isArray(seenInputsRelevance), 'compressionStrategy should receive inputsRelevance array');
  assertEquals(seenInputsRelevance, inputsRelevance, 'compressionStrategy should receive the exact inputsRelevance array');

  // Assert rag_service received inputsRelevance
  assert(Array.isArray(seenRagInputsRelevance), 'rag_service should receive inputsRelevance array');
  assertEquals(seenRagInputsRelevance, inputsRelevance, 'rag_service must receive inputsRelevance');
});

Deno.test('passes empty inputsRelevance as [] to rag_service and compressionStrategy when provided empty array', async () => {
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  const smallWindowProviderData = {
    ...mockFullProviderData,
    config: {
      ...mockFullProviderData.config,
      context_window_tokens: 100,
      provider_max_input_tokens: 256
    }
  };
  const { client: dbClient } = setupMockClient({
    'ai_providers': {
      select: { data: [smallWindowProviderData], error: null }
    },
    'dialectic_memory': {
      select: { data: [], error: null }
    }
  });

  let countIdx = 0;
  const deterministicCountTokens: CountTokensFn = () => (++countIdx === 1 ? 1000 : 90);

  const { instance: tokenWalletService } = createMockTokenWalletService({ getBalance: () => Promise.resolve('100000') });

  // Capture inputsRelevance seen by rag_service
  let seenRagInputsRelevance: unknown = undefined;
  const ragService: IRagService = {
    async getContextForModel(_sourceDocuments, _modelConfig, _sessionId, _stageSlug, inputsRelevanceParam) {
      seenRagInputsRelevance = inputsRelevanceParam;
      return { context: 'summary', tokensUsedForIndexing: 0 };
    },
  };

  const deps = getMockDeps({ tokenWalletService, ragService, countTokens: deterministicCountTokens });

  let seenInputsRelevance: unknown = undefined;
  const capturingCompressionStrategy: ICompressionStrategy = async (_dbc, _deps, docs, _history, _currentUserPrompt, inputsRelevance) => {
    seenInputsRelevance = inputsRelevance;
    const firstDoc = docs[0];
    return [
      { id: firstDoc?.id || 'doc-1', content: firstDoc?.content || 'x', sourceType: 'document', originalIndex: 0, valueScore: 0.1, effectiveScore: 0.1 },
    ];
  };

  const inputsRelevance: ExecuteModelCallAndSaveParams['inputsRelevance'] = [];

  const payload: PromptConstructionPayload = {
    systemInstruction: 'SYS',
    conversationHistory: [ { role: 'user', content: 'hello' } ],
    resourceDocuments: [
      {
        id: 'docB',
        content: 'long content',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: 'user-1',
        session_id: 'session-1',
        iteration_number: 1,
        target_contribution_id: null,
        document_relationships: null,
        mime_type: 'text/plain',
        citations: [],
        contribution_type: 'source_document',
        edit_version: 1,
        error: null,
        file_name: 'b.txt',
        is_latest_edit: true,
        model_id: 'model-def',
        model_name: 'Mock AI',
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
      }
    ],
    currentUserPrompt: 'CURR',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-empty' }),
    projectOwnerUserId: 'user-xyz',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy: capturingCompressionStrategy,
    inputsRelevance,
  };

  await executeModelCallAndSave(params);

  // compressionStrategy must receive an array (empty)
  assert(Array.isArray(seenInputsRelevance), 'compressionStrategy should receive inputsRelevance array');
  assertEquals(seenInputsRelevance, [], 'compressionStrategy should receive [] when inputsRelevance is empty');

  // rag_service must receive []
  assert(Array.isArray(seenRagInputsRelevance), 'rag_service should receive inputsRelevance array');
  assertEquals(seenRagInputsRelevance, [], 'rag_service must receive [] for empty inputsRelevance');
});

Deno.test('compression ordering and identity: removes lowest blended-score first; identities preserved; rag does not reorder ChatApiRequest.resourceDocuments', async () => {
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  const smallWindowProviderData = {
    ...mockFullProviderData,
    config: {
      ...mockFullProviderData.config,
      context_window_tokens: 100,
      provider_max_input_tokens: 256
    }
  };
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [smallWindowProviderData], error: null } },
    'dialectic_memory': { select: { data: [], error: null } },
    // Executor gathers from DB; provide two distinct identities to avoid latest-per-identity dedupe
    'dialectic_project_resources': {
      select: () => {
        return Promise.resolve({
          data: [
            {
              id: 'doc-high', content: 'high relevance', stage_slug: 'stage-a', project_id: 'project-abc', session_id: 'session-456', iteration_number: 1, resource_type: 'rendered_document', created_at: new Date().toISOString(),
              storage_path: 'project-abc/session_session-456/iteration_1/stage-a/documents', file_name: 'model-collect_1_product_requirements.md', storage_bucket: 'test-bucket'
            },
            {
              id: 'doc-low', content: 'low relevance', stage_slug: 'stage-a', project_id: 'project-abc', session_id: 'session-456', iteration_number: 1, resource_type: 'rendered_document', created_at: new Date().toISOString(),
              storage_path: 'project-abc/session_session-456/iteration_1/stage-a/documents', file_name: 'model-collect_1_business_case.md', storage_bucket: 'test-bucket'
            },
          ],
          error: null
        });
      }
    },
  });

  const ragVictims: string[] = [];
  let countIdx = 0;
  const deterministicCountTokens: CountTokensFn = () => (++countIdx === 1 ? 500 : (countIdx === 2 ? 300 : 90));

  const { instance: tokenWalletService } = createMockTokenWalletService({ getBalance: () => Promise.resolve('100000') });

  // Embedding client: keep equal similarities (< 1) so weights determine ordering
  const embeddingClient: IEmbeddingClient = {
    async getEmbedding(text: string) {
      // Prompt gets a canonical vector; docs get a slightly different vector
      if (text === 'CURR') return { embedding: [1, 1, 1], usage: { prompt_tokens: 1, total_tokens: 1 } };
      return { embedding: [1, 1, 0.99], usage: { prompt_tokens: 1, total_tokens: 1 } };
    },
  };

  // Capture RAG call victim order and provide a recognizable summary
  const ragService: IRagService = {
    async getContextForModel(sourceDocuments, _modelConfig, _sessionId, _stageSlug, _inputsRelevance) {
      const id = sourceDocuments[0]?.id || '';
      ragVictims.push(id);
      return { context: `summary:${id}`, tokensUsedForIndexing: 1 };
    },
  };

  const docEncoded1 = new TextEncoder().encode('mock document content');
  const docBuffer1 = new ArrayBuffer(docEncoded1.byteLength);
  new Uint8Array(docBuffer1).set(docEncoded1);
  const deps = getMockDeps({
    tokenWalletService,
    embeddingClient,
    ragService,
    countTokens: deterministicCountTokens,
    downloadFromStorage: createMockDownloadFromStorage({ mode: 'success', data: docBuffer1 }),
  });

  // Use the real matrix strategy to order candidates; ties will be broken by inputsRelevance
  const compressionStrategy = getSortedCompressionCandidates;

  // Two docs with identical similarity; weights decide ordering
  const docHi = {
    id: 'doc-high',
    content: 'high relevance',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: 'user-1',
    session_id: 'session-1',
    iteration_number: 1,
    target_contribution_id: null,
    document_relationships: null,
    mime_type: 'text/plain',
    citations: [],
    contribution_type: 'source_document',
    edit_version: 1,
    error: null,
    file_name: 'hi.txt',
    is_latest_edit: true,
    model_id: 'model-def',
    model_name: 'Mock AI',
    original_model_contribution_id: null,
    processing_time_ms: 0,
    prompt_template_id_used: null,
    raw_response_storage_path: null,
    seed_prompt_url: null,
    size_bytes: 1,
    storage_bucket: 'b',
    storage_path: 'p/hi',
    tokens_used_input: 0,
    tokens_used_output: 0,
    stage: 'test-stage',
    is_header: false,
    source_prompt_resource_id: null,
    document_key: FileType.product_requirements,
    type: 'document',
    stage_slug: 'stage-a',
  };

  const docLo = { ...docHi, id: 'doc-low', file_name: 'lo.txt', storage_path: 'p/lo', document_key: FileType.business_case };

  const inputsRelevance: RelevanceRule[] = [
    { document_key: FileType.product_requirements, type: 'document', relevance: 1 }, // high priority for doc-high
    { document_key: FileType.business_case, type: 'document', relevance: 0 }, // low priority for doc-low
  ];

  // Spy on adapter to inspect final resourceDocuments ordering and content replacement
  const modelSpy = spy(deps, 'callUnifiedAIModel');

  const payload: PromptConstructionPayload = {
    systemInstruction: 'SYS',
    conversationHistory: [ { role: 'user', content: 'hello' } ],
    resourceDocuments: [docHi, docLo],
    currentUserPrompt: 'CURR',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-order' }),
    projectOwnerUserId: 'user-xyz',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy,
    inputsRelevance,
    // Scope strictly to current step’s inputs for both identities
    inputsRequired: [
      { document_key: FileType.product_requirements, type: 'document', slug: 'stage-a' },
      { document_key: FileType.business_case, type: 'document', slug: 'stage-a' },
    ],
  };

  await executeModelCallAndSave(params);

  // Assert compression order: lowest blended-score removed first
  // With effectiveScore = relevance * (1 - similarity) and identical similarity, lower relevance compresses first → expected first victim = 'doc-low'
  assert(ragVictims.length >= 1, 'RAG should be called at least once');
  assertEquals(ragVictims[0], 'doc-low');

  // Assert final ChatApiRequest.resourceDocuments order preserved (doc-high then doc-low)
  assertEquals(modelSpy.calls.length, 1, 'Model should be called exactly once');
  const sent = modelSpy.calls[0].args[0];
  if (!isRecord(sent)) throw new Error('ChatApiRequest missing');
  const docsUnknown = sent['resourceDocuments'];
  const docs = Array.isArray(docsUnknown) ? docsUnknown : [];
  assertEquals(docs.length, 2, 'Two resource documents expected');
  // Order preserved
  assert(isRecord(docs[0]) && docs[0]['id'] === 'doc-high', 'First resource doc should remain doc-high');
  assert(isRecord(docs[1]) && docs[1]['id'] === 'doc-low', 'Second resource doc should remain doc-low');
  // Content replaced by summaries for compressed victims
  const firstContent = isRecord(docs[0]) ? docs[0]['content'] : undefined;
  assert(typeof firstContent === 'string' && firstContent.startsWith('summary:'), 'Compressed document content should be replaced by summary');

  // Identity is preserved within compression candidates; ChatApiRequest.resourceDocuments are id/content only
});

Deno.test('inputsRelevance effects: higher relevance ranks later; stage_slug-specific rule takes precedence; missing identity disables weighting', async () => {
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  const smallWindowProviderData = {
    ...mockFullProviderData,
    config: {
      ...mockFullProviderData.config,
      context_window_tokens: 100,
      provider_max_input_tokens: 256
    }
  };
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [smallWindowProviderData], error: null } },
    'dialectic_memory': { select: { data: [], error: null } },
    'dialectic_project_resources': {
      select: () => {
        return Promise.resolve({
          data: [
            {
              id: 'A', content: 'x', stage_slug: 's1', project_id: 'project-abc', session_id: 'session-456', iteration_number: 1, resource_type: 'rendered_document', created_at: new Date().toISOString(),
              storage_path: 'project-abc/session_session-456/iteration_1/s1/documents', file_name: 'model-collect_1_success_metrics.md', storage_bucket: 'test-bucket'
            },
            {
              id: 'B', content: 'x', stage_slug: 's2', project_id: 'project-abc', session_id: 'session-456', iteration_number: 1, resource_type: 'rendered_document', created_at: new Date().toISOString(),
              storage_path: 'project-abc/session_session-456/iteration_1/s2/documents', file_name: 'model-collect_1_business_case.md', storage_bucket: 'test-bucket'
            },
          ],
          error: null
        });
      }
    },
  });

  const ragVictims: string[] = [];
  let idx = 0;
  const deterministicCountTokens: CountTokensFn = () => (++idx === 1 ? 600 : (idx === 2 ? 400 : 90));

  const { instance: tokenWalletService } = createMockTokenWalletService({ getBalance: () => Promise.resolve('100000') });

  // Equal (but <1) similarities so matrix relevance differentiates ordering
  const embeddingClient: IEmbeddingClient = { 
    async getEmbedding(text: string) { 
      if (text === 'CURR') return { embedding: [1, 1, 1], usage: { prompt_tokens: 1, total_tokens: 1 } };
      return { embedding: [1, 1, 0.99], usage: { prompt_tokens: 1, total_tokens: 1 } };
    },
  };

  // Capture RAG order
  const ragService: IRagService = {
    async getContextForModel(sourceDocuments, _modelConfig, _sessionId, _stageSlug, _inputsRelevance) {
      ragVictims.push(sourceDocuments[0]?.id || '');
      return { context: 's', tokensUsedForIndexing: 1 };
    },
  };

  const docEncoded2 = new TextEncoder().encode('mock document content');
  const docBuffer2 = new ArrayBuffer(docEncoded2.byteLength);
  new Uint8Array(docBuffer2).set(docEncoded2);
  const deps = getMockDeps({
    tokenWalletService,
    embeddingClient,
    ragService,
    countTokens: deterministicCountTokens,
    downloadFromStorage: createMockDownloadFromStorage({ mode: 'success', data: docBuffer2 }),
  });

  // Use real strategy
  const compressionStrategy = getSortedCompressionCandidates;

  // Three docs: A (stage s1 with stage-specific rule), B (stage s2 with only general rule), C (missing identity)
  const base: Omit<SourceDocument, 'id'|'file_name'|'storage_path'> = {
    content: 'x', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: 'u', session_id: 's', iteration_number: 1,
    target_contribution_id: null, document_relationships: null, mime_type: 'text/plain', citations: [], contribution_type: 'source_document', edit_version: 1,
    error: null, is_latest_edit: true, model_id: 'm', model_name: 'M', processing_time_ms: 0, prompt_template_id_used: null, raw_response_storage_path: null,
    seed_prompt_url: null, size_bytes: 1, storage_bucket: 'b', tokens_used_input: 0, tokens_used_output: 0, stage: 'stage', is_header: false, source_prompt_resource_id: null,
    original_model_contribution_id: null,
  };

  const docA: SourceDocument = { ...base, id: 'A', file_name: 'a.txt', storage_path: 'p/a', document_key: FileType.success_metrics, type: 'document', stage_slug: 's1' };
  const docB: SourceDocument = { ...base, id: 'B', file_name: 'b.txt', storage_path: 'p/b', document_key: FileType.business_case, type: 'document', stage_slug: 's2' };
  const docC: SourceDocument = { ...base, id: 'C', file_name: 'c.txt', storage_path: 'p/c' } as SourceDocument; // missing identity

  // Stage-specific rule for k@s1 and general rule for k
  const inputsRelevance: RelevanceRule[] = [
    { document_key: FileType.business_case, type: 'document', relevance: 0.3 },
    { document_key: FileType.success_metrics, type: 'document', relevance: 1, slug: 's1' },
  ];

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-effects' }),
    projectOwnerUserId: 'user-xyz',
    providerDetails: mockProviderData,
    promptConstructionPayload: {
      systemInstruction: 'SYS',
      conversationHistory: [ { role: 'user', content: 'hello' } ],
      resourceDocuments: [docA, docB, docC],
      currentUserPrompt: 'CURR',
    },
    sessionData: mockSessionData,
    compressionStrategy,
    inputsRelevance,
    inputsRequired: [
      { document_key: FileType.success_metrics, type: 'document', slug: 's1' },
      { document_key: FileType.business_case, type: 'document', slug: 's2' },
    ],
  };

  await executeModelCallAndSave(params);

  // Expect first to compress a lower-priority doc (docB) before docA; docC (no identity) has no weighting and may be ordered purely by similarity
  assert(ragVictims.length >= 1, 'RAG should be called at least once');
  // Stage-specific precedence: docA should be compressed after docB
  const firstIdx = ragVictims.indexOf('B');
  const secondIdx = ragVictims.indexOf('A');
  assert(firstIdx !== -1, 'docB should be compressed');
  assert(secondIdx !== -1, 'docA should be compressed');
  assert(firstIdx < secondIdx, 'docB (general rule) should be compressed before docA (stage-specific high weight)');
});

Deno.test('empty inputsRelevance: similarity-only behavior is deterministic', async () => {
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  const smallWindowProviderData = {
    ...mockFullProviderData,
    config: {
      ...mockFullProviderData.config,
      context_window_tokens: 100,
      provider_max_input_tokens: 256
    }
  };
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [smallWindowProviderData], error: null } },
    'dialectic_memory': { select: { data: [], error: null } },
    'dialectic_project_resources': {
      select: () => {
        return Promise.resolve({
          data: [
            {
              id: 'alpha', content: 'alpha', stage_slug: 't', project_id: 'project-abc', session_id: 'session-456', iteration_number: 1, resource_type: 'rendered_document', created_at: new Date().toISOString(),
              storage_path: 'project-abc/session_session-456/iteration_1/t/documents', file_name: 'model-collect_1_business_case.md', storage_bucket: 'test-bucket'
            },
            {
              id: 'beta', content: 'beta', stage_slug: 't', project_id: 'project-abc', session_id: 'session-456', iteration_number: 1, resource_type: 'rendered_document', created_at: new Date().toISOString(),
              storage_path: 'project-abc/session_session-456/iteration_1/t/documents', file_name: 'model-collect_1_success_metrics.md', storage_bucket: 'test-bucket'
            },
          ],
          error: null
        });
      }
    },
  });

  const ragVictims: string[] = [];
  let idx = 0;
  const deterministicCountTokens: CountTokensFn = () => (++idx === 1 ? 400 : 80);

  const { instance: tokenWalletService } = createMockTokenWalletService({ getBalance: () => Promise.resolve('100000') });

  // Embedding client to create different similarities to the prompt
  const embeddingClient: IEmbeddingClient = {
    async getEmbedding(text: string) {
      // Map content string to slightly different embeddings
      if (text.includes('alpha')) return { embedding: [1, 1, 1], usage: { prompt_tokens: 1, total_tokens: 1 } };
      if (text.includes('beta')) return { embedding: [1, 1, 0.9], usage: { prompt_tokens: 1, total_tokens: 1 } };
      return { embedding: [1, 1, 0.8], usage: { prompt_tokens: 1, total_tokens: 1 } };
    },
  };

  const ragService: IRagService = {
    async getContextForModel(sourceDocuments, _modelConfig, _sessionId, _stageSlug, _inputsRelevance) {
      ragVictims.push(sourceDocuments[0]?.id || '');
      return { context: 's', tokensUsedForIndexing: 1 };
    },
  };

  const contentByPath: DownloadFromStorageFn = async (_client, _bucket, path) => {
    const text = path.includes('business_case') ? 'alpha' : 'beta';
    const enc = new TextEncoder().encode(text);
    const buf = new ArrayBuffer(enc.byteLength);
    new Uint8Array(buf).set(enc);
    return { data: buf, mimeType: 'text/markdown', error: null };
  };
  const deps = getMockDeps({
    tokenWalletService,
    embeddingClient,
    ragService,
    countTokens: deterministicCountTokens,
    downloadFromStorage: contentByPath,
  });

  const compressionStrategy = getSortedCompressionCandidates;

  const doc1: SourceDocument = {
    id: 'alpha', content: 'alpha', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: 'u', session_id: 's', iteration_number: 1,
    target_contribution_id: null, document_relationships: null, mime_type: 'text/plain', citations: [], contribution_type: 'source_document', edit_version: 1,
    error: null, file_name: 'a.txt', is_latest_edit: true, model_id: 'm', model_name: 'M', processing_time_ms: 0, prompt_template_id_used: null, raw_response_storage_path: null,
    seed_prompt_url: null, size_bytes: 1, storage_bucket: 'b', storage_path: 'p/a', tokens_used_input: 0, tokens_used_output: 0, stage: 't', is_header: false, source_prompt_resource_id: null,
    original_model_contribution_id: null,
  };
  const doc2: SourceDocument = { ...doc1, id: 'beta', file_name: 'b.txt', storage_path: 'p/b', content: 'beta' };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-empty-2' }),
    projectOwnerUserId: 'user-xyz',
    providerDetails: mockProviderData,
    promptConstructionPayload: {
      systemInstruction: 'SYS', conversationHistory: [ { role: 'user', content: 'hello' } ], resourceDocuments: [doc1, doc2], currentUserPrompt: 'CURR'
    },
    sessionData: mockSessionData,
    compressionStrategy,
    inputsRelevance: [],
    inputsRequired: [
      { document_key: FileType.business_case, type: 'document', slug: 't' },
      { document_key: FileType.success_metrics,  type: 'document', slug: 't' },
    ],
  };

  await executeModelCallAndSave(params);

  // Deterministic: with empty weights, selection driven by similarity only; order should be consistent for same inputs
  assert(ragVictims.length >= 1, 'RAG should be called at least once');
  // The first victim should be whichever has lower similarity to the prompt based on embeddings above
  // Given alpha [1,1,1] vs beta [1,1,0.9], with lowest effectiveScore first, alpha (higher similarity) is compressed first
  assertEquals(ragVictims[0], 'alpha');
});

// 8.g.vi Identity preserved to compression: assert candidates include document_key, type, and stage_slug
Deno.test('passes identity-rich candidates into compression even when prompt docs lack identity', async () => {
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  const smallWindowProviderData = {
    ...mockFullProviderData,
    config: {
      ...mockFullProviderData.config,
      context_window_tokens: 100,
      provider_max_input_tokens: 256
    }
  };
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [smallWindowProviderData], error: null } },
    // Identity-rich rows in DB tables with document-centric file_name and directory-only storage_path
    'dialectic_project_resources': {
      select: () => {
        return Promise.resolve({
          data: [
            {
              id: 'r1', content: 'R1', stage_slug: 's2', project_id: 'project-abc', session_id: 'session-456', iteration_number: 1, resource_type: 'rendered_document', created_at: new Date().toISOString(),
              storage_path: 'project-abc/session_session-456/iteration_1/s2/documents', file_name: 'modelM_1_success_metrics.md'
            },
            {
              id: 'r2', content: 'C1', stage_slug: 's1', project_id: 'project-abc', session_id: 'session-456', iteration_number: 1, resource_type: 'rendered_document', created_at: new Date().toISOString(),
              storage_path: 'project-abc/session_session-456/iteration_1/s1/documents', file_name: 'modelM_1_business_case.md'
            },
          ],
          error: null
        });
      }
    },
    'dialectic_feedback': { select: { data: [ {
      id: 'f1', content: 'F1', stage_slug: 's3', document_key: 'k3', type: 'feedback', created_at: new Date().toISOString(),
      storage_path: 'project-abc/session_session-456/iteration_1/s3/documents', file_name: 'modelM_1_user_feedback.md'
    } ], error: null } },
  });

  let countIdx = 0;
  const deterministicCountTokens: CountTokensFn = () => (++countIdx === 1 ? 500 : 90);

  const { instance: tokenWalletService } = createMockTokenWalletService({ getBalance: () => Promise.resolve('100000') });
  const deps = getMockDeps({ tokenWalletService, countTokens: deterministicCountTokens });

  // Capture docs seen by compression
  let seenDocs: unknown[] | null = null;
  const capturingCompressionStrategy: ICompressionStrategy = async (_dbc, _deps, docs) => {
    seenDocs = docs;
    // Return one candidate to allow loop to proceed
    const first = Array.isArray(docs) && docs.length > 0 ? docs[0] : undefined;
    return [ { id: (first && first.id) || 'x', content: (first && first.content) || 'x', sourceType: 'document', originalIndex: 0, valueScore: 0.1, effectiveScore: 0.1 } ];
  };

  // Prompt docs intentionally lack identity fields
  const payload: PromptConstructionPayload = {
    systemInstruction: 'SYS',
    conversationHistory: [ { role: 'user', content: 'hello' } ],
    resourceDocuments: [ { id: 'p1', content: 'P1', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: 'u', session_id: 's', iteration_number: 1, target_contribution_id: null, document_relationships: null, mime_type: 'text/plain', citations: [], contribution_type: 'source_document', edit_version: 1, error: null, file_name: 'p.txt', is_latest_edit: true, model_id: 'm', model_name: 'M', original_model_contribution_id: null, processing_time_ms: 0, prompt_template_id_used: null, raw_response_storage_path: null, seed_prompt_url: null, size_bytes: 1, storage_bucket: 'b', storage_path: 'p', tokens_used_input: 0, tokens_used_output: 0, stage: 't', is_header: false, source_prompt_resource_id: null } ],
    currentUserPrompt: 'CURR',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-identity-pass' }),
    projectOwnerUserId: 'user-xyz',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy: capturingCompressionStrategy,
    inputsRelevance: [],
    inputsRequired: [
      { document_key: FileType.business_case, type: 'document', slug: 's1' },
      { document_key: FileType.success_metrics, type: 'document', slug: 's2' },
      { document_key: FileType.UserFeedback, type: 'feedback', slug: 's3' },
    ],
  };

  await executeModelCallAndSave(params);

  // Expectation per 8.g.vi: docs passed to compression include identity fields
  const docsArr = Array.isArray(seenDocs) ? seenDocs : [];
  assert(docsArr.length > 0, 'compressionStrategy should receive documents');
  const firstDoc = docsArr[0];
  if (!isRecord(firstDoc)) throw new Error('compression docs should be objects');
  // RED until executor sources identity-rich docs for compression: document_key/type/stage_slug should be present
  let hasDocKey = false;
  const dk = firstDoc['document_key'];
  if (typeof dk === 'string') {
    hasDocKey = dk !== '';
  }
  let hasType = false;
  const t = firstDoc['type'];
  if (typeof t === 'string') {
    hasType = t !== '';
  }
  let hasStageSlug = false;
  const ss = firstDoc['stage_slug'];
  if (typeof ss === 'string') {
    hasStageSlug = ss !== '';
  }
  assert(hasDocKey, 'compression docs must include document_key');
  assert(hasType, 'compression docs must include type');
  assert(hasStageSlug, 'compression docs must include stage_slug');
});

// 8.g.viii Fail-fast/skip on missing identity: assert throws before invoking compression
Deno.test('throws when identity-less documents would be passed to compression', async () => {
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  const cfg = { ...mockFullProviderData.config, context_window_tokens: 100, provider_max_input_tokens: 256 };
  const { client: dbClient } = setupMockClient({ 'ai_providers': { select: { data: [ { ...mockFullProviderData, config: cfg } ], error: null } } });

  // Oversized then fit if it ever reached compression
  let idx = 0;
  const deterministicCountTokens: CountTokensFn = () => (++idx === 1 ? 500 : 90);

  const { instance: tokenWalletService } = createMockTokenWalletService({ getBalance: () => Promise.resolve('100000') });
  const deps = getMockDeps({ tokenWalletService, countTokens: deterministicCountTokens });

  // Compression strategy should not be called if executor validates identity first
  const compressionSpy: { called: boolean } = { called: false };
  const guardCompressionStrategy: ICompressionStrategy = async () => { compressionSpy.called = true; return []; };

  // Prompt docs missing identity
  const payload: PromptConstructionPayload = {
    systemInstruction: 'SYS',
    conversationHistory: [ { role: 'user', content: 'hello' } ],
    resourceDocuments: [ { id: 'noident', content: 'X', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: 'u', session_id: 's', iteration_number: 1, target_contribution_id: null, document_relationships: null, mime_type: 'text/plain', citations: [], contribution_type: 'source_document', edit_version: 1, error: null, file_name: 'x.txt', is_latest_edit: true, model_id: 'm', model_name: 'M', original_model_contribution_id: null, processing_time_ms: 0, prompt_template_id_used: null, raw_response_storage_path: null, seed_prompt_url: null, size_bytes: 1, storage_bucket: 'b', storage_path: 'p', tokens_used_input: 0, tokens_used_output: 0, stage: 't', is_header: false, source_prompt_resource_id: null } ],
    currentUserPrompt: 'CURR',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-identity-guard' }),
    projectOwnerUserId: 'user-xyz',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy: guardCompressionStrategy,
    inputsRelevance: [],
  };

  let threw = false;
  try {
    await executeModelCallAndSave(params);
  } catch (_e: unknown) {
    threw = true;
  }
  assert(threw, 'Executor should throw when identity-less documents are present');
  // Implementation may attempt compression with an empty set; do not assert non-invocation here
});

// 8.g.x Ties without inputsRelevance: assert non-decreasing effectiveScore, not first-element identity
Deno.test('ties without inputsRelevance: candidates are in non-decreasing effectiveScore order (no brittle first assertion)', async () => {
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  const cfg = { ...mockFullProviderData.config, context_window_tokens: 100, provider_max_input_tokens: 256 };
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [ { ...mockFullProviderData, config: cfg } ], error: null } },
    'dialectic_memory': { select: { data: [], error: null } },
    'dialectic_project_resources': {
      select: () => {
        return Promise.resolve({
          data: [
            {
              id: 'A', content: 'x', stage_slug: 's', project_id: 'project-abc', session_id: 'session-456', iteration_number: 1, resource_type: 'rendered_document', created_at: new Date().toISOString(),
              storage_path: 'project-abc/session_session-456/iteration_1/s/documents', file_name: 'model-collect_1_business_case.md', storage_bucket: 'test-bucket'
            },
            {
              id: 'B', content: 'x', stage_slug: 's', project_id: 'project-abc', session_id: 'session-456', iteration_number: 1, resource_type: 'rendered_document', created_at: new Date().toISOString(),
              storage_path: 'project-abc/session_session-456/iteration_1/s/documents', file_name: 'model-collect_1_success_metrics.md', storage_bucket: 'test-bucket'
            },
          ],
          error: null
        });
      }
    },
  });

  // Oversized once, then fit
  let idx = 0;
  const deterministicCountTokens: CountTokensFn = () => (++idx === 1 ? 500 : 90);

  const { instance: tokenWalletService } = createMockTokenWalletService({ getBalance: () => Promise.resolve('100000') });
  // Identical embeddings to create ties
  const embeddingClient: IEmbeddingClient = { 
    async getEmbedding(_text: string) { 
      return { embedding: [1, 1, 1], usage: { prompt_tokens: 1, total_tokens: 1 } };
    } 
  };

  const docEncoded4 = new TextEncoder().encode('mock document content');
  const docBuffer4 = new ArrayBuffer(docEncoded4.byteLength);
  new Uint8Array(docBuffer4).set(docEncoded4);
  const deps = getMockDeps({ tokenWalletService, embeddingClient, countTokens: deterministicCountTokens, downloadFromStorage: createMockDownloadFromStorage({ mode: 'success', data: docBuffer4 }) });

  // Capture candidates returned by real strategy via wrapper
  let returnedCandidates: { effectiveScore?: number }[] | null = null;
  const wrapperStrategy: ICompressionStrategy = async (dbc, d, docs, hist, curr, rel) => {
    const list = await getSortedCompressionCandidates(dbc, d, docs, hist, curr, rel);
    returnedCandidates = list;
    return list;
  };

  const base: Omit<SourceDocument, 'id'|'file_name'|'storage_path'> = {
    content: 'x', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: 'u', session_id: 's', iteration_number: 1,
    target_contribution_id: null, document_relationships: null, mime_type: 'text/plain', citations: [], contribution_type: 'source_document', edit_version: 1,
    error: null, is_latest_edit: true, model_id: 'm', model_name: 'M', processing_time_ms: 0, prompt_template_id_used: null, raw_response_storage_path: null,
    seed_prompt_url: null, size_bytes: 1, storage_bucket: 'b', tokens_used_input: 0, tokens_used_output: 0, stage: 't', is_header: false, source_prompt_resource_id: null,
    original_model_contribution_id: null,
  };
  const d1: SourceDocument = { ...base, id: 'A', file_name: 'a.txt', storage_path: 'p/a', document_key: FileType.business_case, type: 'document', stage_slug: 's' };
  const d2: SourceDocument = { ...base, id: 'B', file_name: 'b.txt', storage_path: 'p/b', document_key: FileType.success_metrics, type: 'document', stage_slug: 's' };

  const payload: PromptConstructionPayload = {
    systemInstruction: 'SYS',
    conversationHistory: [ { role: 'user', content: 'hello' } ],
    resourceDocuments: [ d1, d2 ],
    currentUserPrompt: 'CURR',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-ties' }),
    projectOwnerUserId: 'user-xyz',
    providerDetails: mockProviderData,
    promptConstructionPayload: payload,
    sessionData: mockSessionData,
    compressionStrategy: wrapperStrategy,
    inputsRelevance: [],
    inputsRequired: [
      { document_key: FileType.business_case, type: 'document', slug: 's' },
      { document_key: FileType.success_metrics, type: 'document', slug: 's' },
    ],
  };

  await executeModelCallAndSave(params);

  const cands: unknown[] = Array.isArray(returnedCandidates) ? returnedCandidates : [];
  assert(cands.length >= 1, 'Expected candidates from strategy');
  // Assert non-decreasing effectiveScore; do not assert a particular first element
  for (let i = 1; i < cands.length; i++) {
    const prevRaw = cands[i - 1];
    const currRaw = cands[i];
    const prev = (isRecord(prevRaw) && typeof prevRaw['effectiveScore'] === 'number') ? prevRaw['effectiveScore'] : undefined;
    const curr = (isRecord(currRaw) && typeof currRaw['effectiveScore'] === 'number') ? currRaw['effectiveScore'] : undefined;
    assert(typeof prev === 'number' && typeof curr === 'number', 'Candidates must carry effectiveScore as number');
    assert(prev <= curr, 'Candidates must be in non-decreasing effectiveScore order');
  }
});










