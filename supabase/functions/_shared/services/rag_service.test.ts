// supabase/functions/_shared/services/rag_service.test.ts
import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  describe,
  it,
  afterEach,
} from 'https://deno.land/std@0.224.0/testing/bdd.ts';
import { spy, stub, type Stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { AiModelExtendedConfig } from '../types.ts';
import type { Database } from '../../types_db.ts';
import { RagService } from './rag_service.ts';
import { IRagServiceDependencies, IRagSourceDocument } from './rag_service.interface.ts';
import { MockLogger } from '../logger.mock.ts';
import { createMockSupabaseClient, type MockSupabaseClientSetup, type MockSupabaseDataConfig } from '../supabase.mock.ts';
import { IEmbeddingClient, IIndexingService } from './indexing_service.interface.ts';
import { RagServiceError } from '../utils/errors.ts';
import { PostgrestError } from 'npm:@supabase/postgrest-js@1.15.5';
import { EmbeddingClient } from './indexing_service.ts';
import { DummyAdapter } from '../ai_service/dummy_adapter.ts';
import { MOCK_PROVIDER } from '../ai_service/dummy_adapter.test.ts';
import { createMockTokenWalletService } from '../services/tokenWalletService.mock.ts';

// Helper to create a compliant PostgrestError mock
const createMockPostgrestError = (message: string): PostgrestError & { name: string } => ({
    message,
    details: 'Mocked details',
    hint: 'Mocked hint',
    code: 'MOCK123',
    name: 'PostgrestError',
});

describe('RagService', () => {
  let service: RagService;
  let deps: IRagServiceDependencies;
  let mockIndexingService: IIndexingService;
  let mockEmbeddingClient: IEmbeddingClient;
  let setup: MockSupabaseClientSetup;
  let indexDocumentStub: Stub | undefined;

  const mockSourceDocuments: IRagSourceDocument[] = [
    { id: 'doc1', content: 'This is the first document.' },
    { id: 'doc2', content: 'This is the second document.' },
    { id: 'doc3', content: 'This is the third document.' },
  ];

  const mockModelConfig: AiModelExtendedConfig = {
    api_identifier: 'gpt-4',
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
    tokenization_strategy: { type: 'none' },
    provider_max_input_tokens: 8192,
  };

  function initializeService(config: MockSupabaseDataConfig = {}) {
    setup = createMockSupabaseClient('test-user-id', config);
    mockIndexingService = {
        indexDocument: () => Promise.resolve({ success: true, tokensUsed: 0 }),
    };
    // Use real EmbeddingClient with DummyAdapter
    const dummyAdapter = new DummyAdapter(MOCK_PROVIDER, 'dummy-key', new MockLogger());
    mockEmbeddingClient = new EmbeddingClient(dummyAdapter);

    deps = {
      dbClient: setup.client as unknown as SupabaseClient<Database>,
      logger: new MockLogger(),
      indexingService: mockIndexingService,
      embeddingClient: mockEmbeddingClient,
    };
    service = new RagService(deps);
  }

  afterEach(() => {
    indexDocumentStub?.restore();
    setup?.clearAllStubs?.();
  });

  describe('Just-in-Time Indexing', () => {
    it('should call IndexingService for documents that are not yet indexed', async () => {
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_memory: {
            select: { data: [{ source_contribution_id: 'doc1' }], error: null },
          },
        },
        rpcResults: {
            match_dialectic_chunks: { data: [], error: null },
        }
      };
      initializeService(config);
      const indexDocumentSpy = spy(deps.indexingService, 'indexDocument');

      await service.getContextForModel(mockSourceDocuments, mockModelConfig, 'session-123', 'synthesis');

      assertEquals(indexDocumentSpy.calls.length, 2);
      assertEquals(indexDocumentSpy.calls[0].args[1], 'doc2');
      assertEquals(indexDocumentSpy.calls[1].args[1], 'doc3');
    });

    it('should NOT call IndexingService if all documents are already indexed', async () => {
        const config: MockSupabaseDataConfig = {
            genericMockResults: {
              dialectic_memory: {
                select: { data: mockSourceDocuments.map(d => ({ source_contribution_id: d.id })), error: null },
              },
            },
            rpcResults: {
                match_dialectic_chunks: { data: [], error: null },
            }
          };
        initializeService(config);
        const indexDocumentSpy = spy(deps.indexingService, 'indexDocument');
  
        await service.getContextForModel(mockSourceDocuments, mockModelConfig, 'session-123', 'synthesis');
  
        assertEquals(indexDocumentSpy.calls.length, 0);
    });
  });

  describe('Advanced Retrieval', () => {
    it('should generate multiple queries, call embedding client for each, call RPC, and assemble a final context', async () => {
        const mockRpcResponse = [
            { id: 'chunk1', content: 'Unique chunk from query 1', metadata: { source_contribution_id: 'doc1' }, similarity: 0.9, rank: 10 },
            { id: 'chunk2', content: 'Common chunk', metadata: { source_contribution_id: 'doc2' }, similarity: 0.8, rank: 2 },
            { id: 'chunk3', content: 'Unique chunk from query 2', metadata: { source_contribution_id: 'doc3' }, similarity: 0.85, rank: 8 },
        ];
        const mockEmbeddings = [
            { id: 'chunk1', embedding: JSON.stringify([0.1, 0.2, 0.3]) },
            { id: 'chunk2', embedding: JSON.stringify([0.4, 0.5, 0.6]) },
            { id: 'chunk3', embedding: JSON.stringify([0.7, 0.8, 0.9]) },
        ];
        
        initializeService({
            genericMockResults: {
              dialectic_memory: {
                select: { data: mockEmbeddings, error: null },
              },
            },
            rpcResults: {
                match_dialectic_chunks: { data: mockRpcResponse, error: null },
            }
        });

        const embeddingSpy = spy(deps.embeddingClient, 'getEmbedding');
        const rpcSpy = setup.spies.rpcSpy;

        const result = await service.getContextForModel([], mockModelConfig, 'session-123', 'synthesis');

        assert(embeddingSpy.calls.length >= 2, "Should have generated embeddings for multiple queries");
        assertEquals(rpcSpy.calls.length, 3, "Should have called the RPC for each generated query");
        
        assertExists(result.context);
        assert(result.context!.includes("--- Retrieved Context ---"), "Context should have a header");
        assert(result.context!.includes("Unique chunk from query 1"));
        assert(result.context!.includes("Common chunk"));
        assert(result.context!.includes("Unique chunk from query 2"));
        assert(result.context!.includes("--- End of Retrieved Context ---"), "Context should have a footer");
    });

    // Expect billing for query embeddings (wallet debits per query)
    it('bills 1:1 for query embeddings via token wallet', async () => {
      initializeService({
        genericMockResults: { dialectic_memory: { select: { data: [], error: null } } },
        rpcResults: { match_dialectic_chunks: { data: [], error: null } },
      });

      const mockWallet = createMockTokenWalletService();
      deps.tokenWalletService = mockWallet.instance;
      service = new RagService(deps);
      const embeddingSpy = spy(deps.embeddingClient, 'getEmbedding');

      await service.getContextForModel([], mockModelConfig, 'session-wallet', 'synthesis');

      // Desired behavior: a wallet debit per query embedding generated
      const expectedDebits = embeddingSpy.calls.length;
      const actualDebits = mockWallet.stubs.recordTransaction.calls.length;
      assert(expectedDebits >= 2, 'Should generate multiple query embeddings');
      assertEquals(actualDebits, expectedDebits);
    });

    it('should correctly select diverse documents using MMR', async () => {
        const mockRpcResponse = [
            // Highest rank, but will be very similar to another high-rank chunk
            { id: 'chunkA1', content: 'Architecture about API gateways', metadata: {}, rank: 10, similarity: 0.99 },
            // Second highest rank, very similar to chunkA1
            { id: 'chunkA2', content: 'More architecture about API gateways', metadata: {}, rank: 9, similarity: 0.98 },
            // Lower rank, but semantically unique
            { id: 'chunkB1', content: 'Discussion of database indexing strategies', metadata: {}, rank: 8, similarity: 0.8 },
            // Another unique, but lower-ranked chunk
            { id: 'chunkC1', content: 'Security concerns with token handling', metadata: {}, rank: 7, similarity: 0.7 },
        ];
        
        const mockEmbeddings = [
            { id: 'chunkA1', embedding: JSON.stringify([0.1, 0.9, 0.1]) },
            { id: 'chunkA2', embedding: JSON.stringify([0.15, 0.85, 0.15]) }, // Still similar, but less so
            { id: 'chunkB1', embedding: JSON.stringify([0.9, 0.1, 0.1]) },   // very different
            { id: 'chunkC1', embedding: JSON.stringify([0.1, 0.1, 0.9]) },   // very different
        ];

        initializeService({
            genericMockResults: {
              dialectic_memory: { select: { data: mockEmbeddings, error: null } },
            },
            rpcResults: {
                match_dialectic_chunks: { data: mockRpcResponse, error: null },
            }
        });

        const result = await service.getContextForModel([], mockModelConfig, 'session-123', 'synthesis');
        
        assertExists(result.context);
        // 1. The highest ranked item is always selected first.
        assert(result.context!.includes('Architecture about API gateways'), "The highest-ranked chunk (chunkA1) should always be selected first.");

        // 2. MMR should select the next most diverse, relevant items.
        // It should pick B1 and C1 over A2 because they are more diverse.
        assert(result.context!.includes('database indexing strategies'), "MMR should have selected the diverse chunkB1.");
        assert(result.context!.includes('token handling'), "MMR should have selected the diverse chunkC1.");

    });


    it('should return a message if no relevant chunks are found', async () => {
        initializeService({
            genericMockResults: {
              dialectic_memory: { select: { data: [], error: null } },
            },
            rpcResults: {
                match_dialectic_chunks: { data: [], error: null },
            }
        });

        const result = await service.getContextForModel([], mockModelConfig, 'session-123', 'synthesis');

        assertEquals(result.context, "No relevant context was found for this stage.");
        assertEquals(result.error, undefined);
    });
  });

  describe('Resiliency and Retries', () => {
    it('should retry a failed database select and succeed on the second attempt', async () => {
      let callCount = 0;
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_memory: {
            select: () => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve({ data: null, error: createMockPostgrestError("Transient DB Error"), count: 0, status: 500, statusText: 'Internal Server Error' });
              }
              return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' });
            },
          },
        },
        rpcResults: { match_dialectic_chunks: { data: [], error: null } },
      };
      initializeService(config);
      const indexDocumentSpy = spy(deps.indexingService, 'indexDocument');
      
      const result = await service.getContextForModel(mockSourceDocuments, mockModelConfig, 'session-123', 'synthesis');

      assert(result.context !== null);
      assertEquals(result.error, undefined);
      assertEquals(callCount, 2, "Database select should have been called twice");
      assertEquals(indexDocumentSpy.calls.length, 3, "Indexing should proceed after successful retry");
    });

    it('should permanently fail if database select consistently fails', async () => {
        const config: MockSupabaseDataConfig = {
            genericMockResults: {
              dialectic_memory: {
                select: { data: null, error: createMockPostgrestError("Permanent DB Error") },
              },
            },
          };
        initializeService(config);
        const indexDocumentSpy = spy(deps.indexingService, 'indexDocument');

        const result = await service.getContextForModel(mockSourceDocuments, mockModelConfig, 'session-123', 'synthesis');

        assertEquals(result.context, null);
        assertExists(result.error);
        assert(result.error.message.includes("Failed to index one or more documents: DB query failed: Permanent DB Error"));
        assertEquals(indexDocumentSpy.calls.length, 0, "Indexing service should not be called if DB query fails");
    });

    it('should retry a failed indexing call for one document and succeed overall', async () => {
        initializeService({
            genericMockResults: { 
                dialectic_memory: { select: { data: [], error: null } },
            },
            rpcResults: { match_dialectic_chunks: { data: [], error: null } },
        });

        let doc2Attempt = 0;
        indexDocumentStub = stub(deps.indexingService, 'indexDocument', (sessionId, sourceContributionId, documentContent, metadata) => {
            if (sourceContributionId === 'doc2') {
                doc2Attempt++;
                if (doc2Attempt === 1) {
                    return Promise.resolve({ success: false, error: new Error("Transient Indexing Error"), tokensUsed: 0 });
                }
            }
            return Promise.resolve({ success: true, tokensUsed: 0 });
        });

        const result = await service.getContextForModel(mockSourceDocuments, mockModelConfig, 'session-123', 'synthesis');
        
        assertEquals(result.error, undefined);
        assert(result.context !== null);
        assertEquals(doc2Attempt, 2, "Indexing for doc2 should have been attempted twice");
        assertEquals(indexDocumentStub.calls.length, 4, "Total indexing calls should be 4 (1 for doc1, 2 for doc2, 1 for doc3)");
    });

    it('should permanently fail if one document consistently fails to index', async () => {
        initializeService({
            genericMockResults: { dialectic_memory: { select: { data: [], error: null } } },
        });
    
        indexDocumentStub = stub(deps.indexingService, 'indexDocument', (sessionId, sourceContributionId, documentContent, metadata) => {
            if (sourceContributionId === 'doc2') {
                return Promise.resolve({ success: false, error: new Error("Permanent Indexing Error"), tokensUsed: 0 });
            }
            return Promise.resolve({ success: true, tokensUsed: 0 });
        });
    
        const result = await service.getContextForModel(mockSourceDocuments, mockModelConfig, 'session-123', 'synthesis');
    
        assertExists(result.error);
        assertEquals(result.context, null);
        assert(result.error instanceof RagServiceError, "Error should be a RagServiceError");
        assert(result.error.message.includes("Failed to index one or more documents: Permanent Indexing Error"), `Unexpected error message: ${result.error.message}`);
    });
  });

  describe('Financial Tracking', () => {
    it('should return the total tokens used for indexing new documents', async () => {
        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_memory: {
                    select: { data: [{ source_contribution_id: 'doc1' }], error: null },
                },
            },
            rpcResults: {
                match_dialectic_chunks: { data: [], error: null },
            }
        };
        initializeService(config);
        
        // Stub the indexing service to return a specific token count
        indexDocumentStub = stub(deps.indexingService, 'indexDocument', () => {
            return Promise.resolve({ success: true, tokensUsed: 123 });
        });

        const documentsToIndex = [
            { id: 'doc1', content: 'Already indexed.' },
            { id: 'doc2', content: 'Needs indexing.' },
        ];

        const result = await service.getContextForModel(documentsToIndex, mockModelConfig, 'session-123', 'synthesis');

        // This test will fail because the property doesn't exist on the interface yet.
        assertEquals(result.tokensUsedForIndexing, 123);
    });
  });
});
