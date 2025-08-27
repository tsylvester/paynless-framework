// supabase/functions/_shared/services/indexing_service.test.ts
import { test } from 'https://deno.land/std@0.224.0/testing/bdd.ts';
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertSpyCall, spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ILogger } from '../types.ts';
import { IndexingService, EmbeddingClient } from './indexing_service.ts';
import { ITextSplitter, IndexDocumentResult } from './indexing_service.interface.ts';
import { createMockSupabaseClient } from '../supabase.mock.ts';
import { mockOpenAiAdapter, mockGetEmbeddingSpy } from '../ai_service/openai_adapter.mock.ts';
import { type Database } from '../../../functions/types_db.ts';
import { DummyAdapter } from "../ai_service/dummy_adapter.ts";
import { MOCK_PROVIDER } from "../ai_service/dummy_adapter.test.ts";
import { assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createMockTokenWalletService } from "../services/tokenWalletService.mock.ts";

// Mocks
class MockLogger implements ILogger {
  info = () => {};
  warn = () => {};
  error = () => {};
  debug = () => {};
}

class MockTextSplitter implements ITextSplitter {
  splitText(text: string): Promise<string[]> {
    return Promise.resolve([text.substring(0, text.length / 2), text.substring(text.length / 2)]);
  }
}

test('IndexingService should process and index a document successfully', async () => {
  // Arrange
  const { client: mockSupabaseClient, spies } = createMockSupabaseClient();
  const logger = new MockLogger();
  const textSplitter = new MockTextSplitter();
  const mockWallet = createMockTokenWalletService();
  const embeddingClient = new EmbeddingClient(mockOpenAiAdapter);
  const service = new IndexingService(mockSupabaseClient as unknown as SupabaseClient<Database>, logger, textSplitter, embeddingClient, mockWallet.instance);

  const textSplitterSpy = spy(textSplitter, 'splitText');
  
  const sessionId = 'session-123';
  const contributionId = 'contrib-456';
  const documentContent = 'This is a test document.';
  const metadata = { source: 'test' };

  // Act
  const result: IndexDocumentResult = await service.indexDocument(sessionId, contributionId, documentContent, metadata);

  // Assert
  assertEquals(result.success, true);
  assertEquals(result.tokensUsed, 10);
  assertSpyCall(textSplitterSpy, 0, { args: [documentContent] });
  
  // Use the type-safe spy from the mock
  assertSpyCall(mockGetEmbeddingSpy, 0);
  assertSpyCall(mockGetEmbeddingSpy, 1);
  
  assertSpyCall(spies.fromSpy, 0, { args: ['dialectic_memory'] });
  
  const insertSpy = spies.getLatestQueryBuilderSpies('dialectic_memory')?.insert;
  if (!insertSpy) throw new Error("Insert spy not found");

  assertSpyCall(insertSpy, 0);
  const insertedData = insertSpy.calls[0].args[0];
  assertEquals(insertedData.length, 2);
  assertEquals(insertedData[0].session_id, sessionId);
  assertEquals(insertedData[0].source_contribution_id, contributionId);
  assertEquals(insertedData[0].content, 'This is a te');
  assertEquals(insertedData[0].embedding, `[${Array(1536).fill(0.1).join(',')}]`);
});

Deno.test("EmbeddingClient should be instantiable with any valid AiProviderAdapter", () => {
    // This test confirms that EmbeddingClient is decoupled from a concrete
    // adapter and can be instantiated with any class that conforms to the
    // AiProviderAdapterInstance interface.
    
    const dummyAdapter = new DummyAdapter(MOCK_PROVIDER, "dummy-key", new MockLogger());

    // This line should now compile without error.
    const client = new EmbeddingClient(dummyAdapter);

    // Assert that the client was created successfully.
    assertExists(client);
});

Deno.test('IndexingService uses DummyAdapter embeddings (deterministic vector, non-zero usage, persisted length 32)', async () => {
  // Arrange
  const { client: mockSupabaseClient, spies } = createMockSupabaseClient();
  const logger = new MockLogger();
  const textSplitter = new MockTextSplitter(); // yields 2 chunks
  const mockWallet = createMockTokenWalletService();
  const dummyAdapter = new DummyAdapter(MOCK_PROVIDER, 'dummy-key', logger);
  const getEmbeddingSpy = spy(dummyAdapter, 'getEmbedding');
  const embeddingClient = new EmbeddingClient(dummyAdapter);
  const service = new IndexingService(
    mockSupabaseClient as unknown as SupabaseClient<Database>,
    logger,
    textSplitter,
    embeddingClient,
    mockWallet.instance
  );

  const sessionId = 'session-abc';
  const contributionId = 'contrib-def';
  const documentContent = 'Deterministic embeddings make RAG testing safe.';
  const metadata = { source: 'unit-test' };

  // Act
  const result: IndexDocumentResult = await service.indexDocument(
    sessionId,
    contributionId,
    documentContent,
    metadata,
  );

  // Assert: tokensUsed aggregated from adapter usage should be > 0
  assertEquals(result.success, true);
  assertEquals(result.tokensUsed > 0, true);

  // Assert: adapter embedding called once per chunk (2 chunks)
  assertSpyCall(getEmbeddingSpy, 0);
  assertSpyCall(getEmbeddingSpy, 1);

  // Assert: insert occurred into dialectic_memory with 32-dim embedding arrays as JSON strings
  assertSpyCall(spies.fromSpy, 0, { args: ['dialectic_memory'] });
  const insertSpy = spies.getLatestQueryBuilderSpies('dialectic_memory')?.insert;
  if (!insertSpy) throw new Error('Insert spy not found');
  assertSpyCall(insertSpy, 0);
  const inserted = insertSpy.calls[0].args[0];
  // Should insert 2 rows (2 chunks)
  assertEquals(Array.isArray(inserted), true);
  assertEquals(inserted.length, 2);
  // Embedding field is a JSON array string; parse and check length
  const emb0 = JSON.parse(inserted[0].embedding);
  const emb1 = JSON.parse(inserted[1].embedding);
  assertEquals(Array.isArray(emb0), true);
  assertEquals(Array.isArray(emb1), true);
  assertEquals(emb0.length, 32);
  assertEquals(emb1.length, 32);
});

// Billing RED test (ignored until DI is wired): asserts 1:1 debits per chunk with idempotent keys
Deno.test('IndexingService bills embeddings 1:1 per chunk with idempotent keys', async () => {
  const { client: mockSupabaseClient } = createMockSupabaseClient();
  const logger = new MockLogger();
  const textSplitter = new MockTextSplitter(); // splits into 2 chunks

  const dummyAdapter = new DummyAdapter(MOCK_PROVIDER, 'dummy-key', logger);
  const embeddingClient = new EmbeddingClient(dummyAdapter);

  // Prepare mock wallet service and capture debits
  const mockWallet = createMockTokenWalletService();

  // Construct service (DI for wallet to be added in GREEN step)
  const service = new IndexingService(
    mockSupabaseClient as unknown as SupabaseClient<Database>,
    logger,
    textSplitter,   
    embeddingClient,
    mockWallet.instance
  );

  const sessionId = 'sess-bill-1';
  const contributionId = 'contrib-bill-1';
  const documentContent = 'Billing over two chunks to ensure two debit calls.';
  const metadata = { source: 'unit-test' };

  const result: IndexDocumentResult = await service.indexDocument(sessionId, contributionId, documentContent, metadata);

  // Desired final state assertions (will fail until DI is implemented)
  const expectedKeys = new Set([
    `embed:${sessionId}:${contributionId}:1`,
    `embed:${sessionId}:${contributionId}:2`,
  ]);

  const recordTxnCalls = mockWallet.stubs.recordTransaction.calls;
  const seenKeys = new Set(recordTxnCalls.map((call: typeof recordTxnCalls[number]) => call.args[0]?.idempotencyKey as string));
  let totalDebited = 0;
  for (const call of recordTxnCalls as typeof recordTxnCalls) {
    const amt = call.args[0]?.amount ?? '0';
    totalDebited += parseFloat(amt);
  }

  assertEquals(seenKeys, expectedKeys);
  assertEquals(totalDebited, result.tokensUsed);
});
