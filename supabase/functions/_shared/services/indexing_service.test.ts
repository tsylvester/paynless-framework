// supabase/functions/_shared/services/indexing_service.test.ts
import { test } from 'https://deno.land/std@0.224.0/testing/bdd.ts';
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertSpyCall, spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ILogger } from '../types.ts';
import { IndexingService, OpenAIEmbeddingClient } from './indexing_service.ts';
import { ITextSplitter, IndexDocumentResult } from './indexing_service.interface.ts';
import { createMockSupabaseClient } from '../supabase.mock.ts';
import { mockOpenAiAdapter, mockGetEmbeddingSpy } from '../ai_service/openai_adapter.mock.ts';
import { type Database } from '../../../functions/types_db.ts';
import { DummyAdapter } from "../ai_service/dummy_adapter.ts";
import { MOCK_PROVIDER } from "../ai_service/dummy_adapter.test.ts";
import { assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

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
  
  const embeddingClient = new OpenAIEmbeddingClient(mockOpenAiAdapter);
  const service = new IndexingService(mockSupabaseClient as unknown as SupabaseClient<Database>, logger, textSplitter, embeddingClient);

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

Deno.test("OpenAIEmbeddingClient should be instantiable with any valid AiProviderAdapter", () => {
    // This test confirms that OpenAIEmbeddingClient is decoupled from a concrete
    // adapter and can be instantiated with any class that conforms to the
    // AiProviderAdapterInstance interface.
    
    const dummyAdapter = new DummyAdapter(MOCK_PROVIDER, "dummy-key", new MockLogger());

    // This line should now compile without error.
    const client = new OpenAIEmbeddingClient(dummyAdapter);

    // Assert that the client was created successfully.
    assertExists(client);
});
