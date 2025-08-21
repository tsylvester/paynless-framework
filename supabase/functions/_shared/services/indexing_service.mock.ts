// supabase/functions/_shared/services/indexing_service.mock.ts
import { IndexingService } from './indexing_service.ts';
import { ILogger } from '../types.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export class MockIndexingService extends IndexingService {
  constructor() {
    const mockSupabase = {
      from: () => ({
        insert: () => ({ error: null }),
      }),
    } as unknown as SupabaseClient;

    const mockLogger: ILogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    };

    const mockTextSplitter = {
      splitText: (text: string) => Promise.resolve([text]),
    };

    const mockEmbeddingClient = {
      createEmbedding: (_text: string) => Promise.resolve([0.1]),
    };

    super(mockSupabase, mockLogger, mockTextSplitter, mockEmbeddingClient);
  }

  override indexDocument = (
    _sessionId: string,
    _sourceContributionId: string,
    _documentContent: string,
    _metadata: Record<string, unknown>,
  ): Promise<{ success: boolean; error?: Error }> => {
    return Promise.resolve({ success: true });
  };
}

