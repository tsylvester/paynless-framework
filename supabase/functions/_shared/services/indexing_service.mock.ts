// supabase/functions/_shared/services/indexing_service.mock.ts
import { IndexingService } from './indexing_service.ts';
import type { IndexDocumentResult } from './indexing_service.interface.ts';
import { createMockTokenWalletService } from './tokenWalletService.mock.ts';
import { MockLogger } from '../logger.mock.ts';
import { ILogger } from '../types.ts';
import { createMockSupabaseClient } from '../supabase.mock.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../../../functions/types_db.ts';

export class MockIndexingService extends IndexingService {
  constructor() {
    const { client: mockSupabaseClient } = createMockSupabaseClient();

    const mockLogger: ILogger = new MockLogger();
    const mockTextSplitter = {
      splitText: (text: string) => Promise.resolve([text]),
    };

    const mockEmbeddingClient = {
      getEmbedding: async (_text: string) => ({
        embedding: [0.1],
        usage: { prompt_tokens: 0, total_tokens: 0 },
      }),
    };

    const mockTokenWalletService = createMockTokenWalletService().instance;

    super(mockSupabaseClient as unknown as SupabaseClient<Database>, mockLogger, mockTextSplitter, mockEmbeddingClient, mockTokenWalletService);
  }

  override indexDocument = (
    _sessionId: string,
    _sourceContributionId: string,
    _documentContent: string,
    _metadata: Record<string, unknown>,
  ): Promise<IndexDocumentResult> => {
    return Promise.resolve({ success: true, tokensUsed: 0 });
  };
}

