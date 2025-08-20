// supabase/functions/_shared/utils/vector_utils.test.ts
import {
  assertAlmostEquals,
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cosineSimilarity, scoreResourceDocuments, scoreHistory, getSortedCompressionCandidates } from "./vector_utils.ts";
import type { CompressionCandidate } from "./vector_utils.ts";
import type { SourceDocument, ExecuteModelCallAndSaveParams } from "../../dialectic-service/dialectic.interface.ts";
import type { IEmbeddingClient } from "../services/indexing_service.interface.ts";
import type { EmbeddingResponse, Messages } from '../types.ts';
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { type Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../supabase.mock.ts";


Deno.test("cosineSimilarity: calculates similarity for basic vectors", () => {
  const vecA = [1, 2, 3];
  const vecB = [4, 5, 6];
  const expected = 0.974631846;
  assertAlmostEquals(cosineSimilarity(vecA, vecB), expected, 1e-7, "Failed on basic vector similarity");
});

Deno.test("cosineSimilarity: returns 1 for identical vectors", () => {
  const vecA = [1, 2, 3];
  const vecB = [1, 2, 3];
  assertEquals(cosineSimilarity(vecA, vecB), 1, "Failed on identical vectors");
});

Deno.test("cosineSimilarity: returns 1 for identical long vectors", () => {
    const vecA = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const vecB = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
         assertAlmostEquals(cosineSimilarity(vecA, vecB), 1, 1e-7, "Failed on identical long vectors");
});

Deno.test("cosineSimilarity: returns -1 for opposite vectors", () => {
  const vecA = [1, 2, 3];
  const vecB = [-1, -2, -3];
  assertAlmostEquals(cosineSimilarity(vecA, vecB), -1, 1e-7, "Failed on opposite vectors");
});

Deno.test("cosineSimilarity: returns 0 for orthogonal vectors", () => {
  const vecA = [1, 0];
  const vecB = [0, 1];
  assertEquals(cosineSimilarity(vecA, vecB), 0, "Failed on orthogonal vectors");
});

Deno.test("cosineSimilarity: returns 0 for more complex orthogonal vectors", () => {
    const vecA = [2, 3, -1];
    const vecB = [4, -2, 2]; // dot product is 8 - 6 - 2 = 0
    assertEquals(cosineSimilarity(vecA, vecB), 0, "Failed on complex orthogonal vectors");
});

Deno.test("cosineSimilarity: returns 0 for vectors with different lengths", () => {
  const vecA = [1, 2, 3];
  const vecB = [1, 2];
  assertEquals(cosineSimilarity(vecA, vecB), 0, "Failed on different length vectors");
});

Deno.test("cosineSimilarity: returns 0 when one vector is a zero vector", () => {
  const vecA = [1, 2, 3];
  const vecB = [0, 0, 0];
  assertEquals(cosineSimilarity(vecA, vecB), 0, "Failed when one vector is zero");
});

Deno.test("cosineSimilarity: returns 0 when both vectors are zero vectors", () => {
    const vecA = [0, 0, 0];
    const vecB = [0, 0, 0];
    assertEquals(cosineSimilarity(vecA, vecB), 0, "Failed when both vectors are zero");
});

Deno.test("cosineSimilarity: returns 0 for empty vectors", () => {
  const vecA: number[] = [];
  const vecB: number[] = [];
  assertEquals(cosineSimilarity(vecA, vecB), 0, "Failed for empty vectors");
});

// --- Tests for Compression Helpers ---

const mockEmbeddingClient: IEmbeddingClient = {
    getEmbedding: async (text: string): Promise<EmbeddingResponse> => {
        let vector: number[] = Array(3).fill(0); // 3-dimensional for simplicity
        if (text === 'prompt') vector = [1, 1, 1];
        else if (text === 'high relevance') vector = [1, 1, 0.9];
        else if (text === 'low relevance') vector = [1, 1, -3]; // Yields a negative dot product
        else if (text === 'no relevance') vector = [-1, -1, -1];
        
        return Promise.resolve({
            embedding: vector,
            usage: { prompt_tokens: text.length, total_tokens: text.length },
        });
    }
};

const mockSourceDocument = (overrides: Partial<SourceDocument>): SourceDocument => ({
    id: 'doc-1',
    content: 'default content',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: 'user-123',
    session_id: 'session-123',
    iteration_number: 1,
    target_contribution_id: null,
    document_relationships: null,
    mime_type: 'text/plain',
    citations: null,
    contribution_type: 'source_document',
    edit_version: 1,
    error: null,
    file_name: 'test.txt',
    is_latest_edit: true,
    model_id: null,
    model_name: null,
    original_model_contribution_id: null,
    processing_time_ms: null,
    prompt_template_id_used: null,
    raw_response_storage_path: null,
    seed_prompt_url: null,
    size_bytes: 100,
    storage_bucket: 'test',
    storage_path: 'test.txt',
    tokens_used_input: null,
    tokens_used_output: null,
    stage: 'test',
    ...overrides,
});

const deps: ExecuteModelCallAndSaveParams['deps'] = { embeddingClient: mockEmbeddingClient, getSeedPromptForStage: () => Promise.resolve({
  content: '',
  fullPath: '',
  bucket: '',
  path: '',
  fileName: '',
}),
continueJob: () => Promise.resolve({
  error: undefined,
  enqueued: true,
}),
retryJob: () => Promise.resolve({
  error: undefined,
  enqueued: true,
}),
notificationService: {
  sendContributionStartedEvent: () => Promise.resolve(),
  sendDialecticContributionStartedEvent: () => Promise.resolve(),
  sendContributionReceivedEvent: () => Promise.resolve(),
  sendContributionRetryingEvent: () => Promise.resolve(),
  sendContributionGenerationCompleteEvent: () => Promise.resolve(),
  sendContributionGenerationContinuedEvent: () => Promise.resolve(),
  sendDialecticProgressUpdateEvent: () => Promise.resolve(),
  sendContributionFailedNotification: () => Promise.resolve(),
},
executeModelCallAndSave: () => Promise.resolve(),
downloadFromStorage: () => Promise.resolve({
  data: new ArrayBuffer(0),
  error: null,
}),
getExtensionFromMimeType: () => '',
logger: {
  info: () => {},
  error: () => {},
  debug: () => {},
  warn: () => {},
},
randomUUID: () => '',
fileManager: {
  uploadAndRegisterFile: () => Promise.resolve({
      record: {
          id: '',
          name: '',
          size: 0,
          type: '',
          url: '',
          created_at: '',
          file_name: '',
          mime_type: '',
          project_id: '',
          resource_description: {},
          size_bytes: 0,
          storage_bucket: '',
          storage_path: '',
          updated_at: '',
          user_id: '',
      },
      error: null,
  }),
  assembleAndSaveFinalDocument: () => Promise.resolve({
    record: {
      id: '',
      name: '',
      size: 0,
      type: '',
      url: '',
      created_at: '',
      file_name: '',
      mime_type: '',
      project_id: '',
      resource_description: {},
      size_bytes: 0,
      storage_bucket: '',
      storage_path: '',
      updated_at: '',
      user_id: '',
    },
    error: null,
    finalPath: null,
  }),
},
deleteFromStorage: () => Promise.resolve({
  success: true,
  error: null,
}),
};

Deno.test("scoreResourceDocuments", async (t) => {

    const currentUserPrompt = 'prompt';

    await t.step("should return an empty array if no documents are provided", async () => {
        const result = await scoreResourceDocuments(deps, [], currentUserPrompt);
        assertEquals(result.length, 0);
    });

    await t.step("should score documents based on cosine similarity", async () => {
        const documents = [
            mockSourceDocument({ id: 'doc-high', content: 'high relevance' }),
            mockSourceDocument({ id: 'doc-low', content: 'low relevance' }),
        ];
        const result = await scoreResourceDocuments(deps, documents, currentUserPrompt);
        
        assertEquals(result.length, 2);
        const highRelevanceDoc = result.find(d => d.id === 'doc-high');
        const lowRelevanceDoc = result.find(d => d.id === 'doc-low');

        assertExists(highRelevanceDoc);
        assertExists(lowRelevanceDoc);

        assertEquals(highRelevanceDoc.sourceType, 'document');
        assert(highRelevanceDoc.valueScore > lowRelevanceDoc.valueScore, "High relevance doc should have a higher score");
    });
});

Deno.test("scoreHistory", async (t) => {
    const fullHistory: Messages[] = [
        { id: 'msg-0', role: 'system', content: 'system prompt' },
        { id: 'msg-1', role: 'user', content: 'user prompt 1' },
        { id: 'msg-2', role: 'assistant', content: 'assistant response 1' },
        { id: 'msg-3', role: 'user', content: 'user prompt 2' },
        { id: 'msg-4', role: 'assistant', content: 'assistant response 2' },
        { id: 'msg-5', role: 'user', content: 'user prompt 3' },
        { id: 'msg-6', role: 'assistant', content: 'assistant response 3' }
    ];

    await t.step("should correctly identify and score the mutable middle, excluding head and tail", () => {
        const candidates = scoreHistory(fullHistory);

        // Head (3) and Tail (3) are immutable. Middle is msg-3.
        assertEquals(candidates.length, 1);
        
        const candidateIds = candidates.map(c => c.id);
        assert(candidateIds.includes('msg-3'), "msg-3 should be a candidate");
        
        // Assert that immutable tail messages are NOT candidates
        assert(!candidateIds.includes('msg-4'), "msg-4 should be immutable");
        assert(!candidateIds.includes('msg-5'), "msg-5 should be immutable");
        assert(!candidateIds.includes('msg-6'), "msg-6 should be immutable");
    });

    await t.step("should return an empty array if history is too short to have a middle part", () => {
        const shortHistory: Messages[] = fullHistory.slice(0, 6); // 3 head + 3 tail = 6, no middle
        const candidates = scoreHistory(shortHistory);
        assertEquals(candidates.length, 0);
    });
});

Deno.test("getSortedCompressionCandidates", async (t) => {
   
    const resourceDocuments = [
        mockSourceDocument({ id: 'doc-high', content: 'high relevance' }), // High score
        mockSourceDocument({ id: 'doc-low', content: 'low relevance' }),   // Low score
    ];

    const conversationHistory: Messages[] = [
        { id: 'msg-0', role: 'system', content: 'system prompt' },
        { id: 'msg-1', role: 'user', content: 'user prompt 1' },
        { id: 'msg-2', role: 'assistant', content: 'assistant response 1' },
        { id: 'msg-3', role: 'user', content: 'user prompt 2' }, // oldest mutable, score 0
        { id: 'msg-4', role: 'assistant', content: 'assistant response 2' },
        { id: 'msg-5', role: 'user', content: 'user prompt 3' },
        { id: 'msg-6', role: 'assistant', content: 'assistant response 3' }, // newest mutable, score 1
    ];
    
    await t.step("should combine and sort candidates from both sources", async () => {
        const { client: dbClient } = createMockSupabaseClient('user-123', {
            genericMockResults: {
                'dialectic_memory': {
                    select: {
                        data: [], // No indexed chunks for this test
                        error: null 
                    }
                }
            }
        });

        const result = await getSortedCompressionCandidates(dbClient as unknown as SupabaseClient<Database>, deps, resourceDocuments, conversationHistory, 'prompt');

        // We expect 1 history candidate + 2 document candidates
        assertEquals(result.length, 3);
        
        // The lowest score should be the 'low relevance' document, as its relevance is very low
        assertEquals(result[0].id, 'doc-low');
        assertEquals(result[0].sourceType, 'document');

        // The next lowest score should be the oldest history message
        assertEquals(result[1].id, 'msg-3');
        assertEquals(result[1].sourceType, 'history');
        
        // The highest score should be the 'high relevance' document
        assertEquals(result[2].id, 'doc-high');
        assertEquals(result[2].sourceType, 'document');
        
        // Check that scores are sorted ascending
        for (let i = 0; i < result.length - 1; i++) {
            assert(result[i].valueScore <= result[i+1].valueScore, `Score at index ${i} (${result[i].valueScore}) should be <= score at ${i+1} (${result[i+1].valueScore})`);
        }
    });

    await t.step("should filter out candidates that are already indexed", async () => {
        // Arrange
        const { client: dbClient } = createMockSupabaseClient('user-123', {
            genericMockResults: {
                'dialectic_memory': {
                    select: {
                        data: [{ source_contribution_id: 'doc-low' }], // doc-low is already indexed
                        error: null 
                    }
                }
            }
        });

        const result = await getSortedCompressionCandidates(
            dbClient as unknown as SupabaseClient<Database>,
            deps, 
            resourceDocuments, 
            conversationHistory, 
            'prompt'
        );

        // Assert
        // All candidates were passed in, but one was already indexed.
        assertEquals(result.length, 2, "Should return only the un-indexed candidates");
        
        // The lowest-value candidate ('doc-low') should have been filtered out.
        // The new lowest-value candidate should be the next one in line ('msg-3').
        assertEquals(result[0].id, 'msg-3', "The lowest value, un-indexed candidate should be first.");
    });
});

// 25.a RED: Role-aware preservation anchors for compression
Deno.test("getSortedCompressionCandidates - role-aware anchors preserved; non-anchored early messages are candidates (RED)", async () => {
  const { client: dbClient } = createMockSupabaseClient('user-123', {
    genericMockResults: {
      'dialectic_memory': {
        select: { data: [], error: null }
      }
    }
  });

  // Build a history where the second-to-last assistant is NOT within the last 3 by index
  // Indices: 0..11
  const history: Messages[] = [
    { id: 'msg-0', role: 'system', content: 'system prompt' },
    { id: 'msg-1', role: 'user', content: 'SEED: Original user prompt' },
    { id: 'msg-2', role: 'assistant', content: 'First assistant reply' },
    { id: 'msg-3', role: 'user', content: 'early user' },
    { id: 'msg-4', role: 'assistant', content: 'assistant mid 1' },
    { id: 'msg-5', role: 'user', content: 'mid user' },
    { id: 'msg-6', role: 'assistant', content: 'assistant mid 2' },
    { id: 'msg-7', role: 'user', content: 'mid user 2' },
    { id: 'msg-8', role: 'assistant', content: 'assistant mid 3 (second-to-last assistant)' },
    { id: 'msg-9', role: 'user', content: 'another user' },
    { id: 'msg-10', role: 'assistant', content: 'LAST assistant reply' },
    { id: 'msg-11', role: 'user', content: 'Please continue.' },
  ];

  const result = await getSortedCompressionCandidates(
    dbClient as unknown as SupabaseClient<Database>,
    deps,
    [],
    history,
    'prompt'
  );

  const candidateIds = result.filter(c => c.sourceType === 'history').map(c => c.id);

  // Role-aware preserved anchors that must NOT be candidates
  // - First user (seed) and first assistant
  // - Last two assistant replies (msg-10 and msg-8 here, even though msg-8 is not in the last 3 by index)
  // - Final user "Please continue."
  assert(!candidateIds.includes('msg-1'), 'First user (seed) should be preserved');
  assert(!candidateIds.includes('msg-2'), 'First assistant should be preserved');
  assert(!candidateIds.includes('msg-10'), 'Last assistant should be preserved');
  assert(!candidateIds.includes('msg-11'), 'Final user "Please continue." should be preserved');

  // This is the critical RED assertion: the second-to-last assistant (msg-8) must also be preserved
  // Current index-based logic will incorrectly include it as a candidate, causing this test to fail.
  assert(!candidateIds.includes('msg-8'), 'Second-to-last assistant should be preserved (role-aware)');
});

