import { RelevanceRule } from '../../dialectic-service/dialectic.interface.ts';
import { ILogger, Messages, ResourceDocuments } from '../types.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../../types_db.ts';
import { IEmbeddingClient } from '../services/indexing_service.interface.ts';
import { CompressionCandidate } from './vector_utils.ts';

export interface CompressionStrategyDeps {
    dbClient: SupabaseClient<Database>;
    embeddingClient?: IEmbeddingClient;
    logger?: ILogger;
}

export interface CompressionStrategyParams {
    inputsRelevance?: RelevanceRule[];
}

export interface CompressionStrategyPayload {
    documents: ResourceDocuments;
    history: Messages[];
    currentUserPrompt: string;
}

export interface ICompressionStrategy {
    (
        deps: CompressionStrategyDeps,
        params: CompressionStrategyParams,
        payload: CompressionStrategyPayload,
    ): Promise<CompressionCandidate[]>;
}
