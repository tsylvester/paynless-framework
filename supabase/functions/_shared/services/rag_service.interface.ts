// supabase/functions/_shared/services/rag_service.interface.ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { ILogger } from '../types.ts';
import type { Database } from '../../types_db.ts';
import { IEmbeddingClient, IIndexingService } from './indexing_service.interface.ts';
import type { AiModelExtendedConfig } from '../types.ts';

/**
 * @interface IRagServiceDependencies
 * @description Defines the dependencies required by the RagService.
 * This includes a Supabase database client, a logger for outputting information,
 * the indexing service for embedding documents, and an embedding client.
 */
export interface IRagServiceDependencies {
  dbClient: SupabaseClient<Database>;
  logger: ILogger;
  indexingService: IIndexingService;
  embeddingClient: IEmbeddingClient;
}

/**
 * @interface IRagSourceDocument
 * @description Represents a source document to be used for context retrieval.
 * Each document must have a unique ID and content.
 */
export interface IRagSourceDocument {
    id: string;
    content: string;
    // We can add metadata here later if needed, e.g., source_type
}

/**
 * @interface IRagContextResult
 * @description Represents the result of a context retrieval operation.
 * It contains the generated context string or an error if the operation failed.
 */
export interface IRagContextResult {
    context: string | null;
    tokensUsedForIndexing?: number;
    error?: Error;
}

export interface IRagService {
    getContextForModel(
        sourceDocuments: IRagSourceDocument[],
        modelConfig: AiModelExtendedConfig,
        sessionId: string,
        stageSlug: string,
    ): Promise<IRagContextResult>;
}
