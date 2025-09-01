// supabase/functions/_shared/services/indexing_service.ts
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { RecursiveCharacterTextSplitter } from 'npm:langchain/text_splitter';
import { type Database, type TablesInsert } from '../../../functions/types_db.ts';
import { ILogger, AiProviderAdapterInstance, EmbeddingResponse } from '../types.ts';
import type { ITokenWalletService } from '../types/tokenWallet.types.ts';
import { IndexingError } from '../utils/errors.ts';
import { ITextSplitter, IEmbeddingClient, IndexDocumentResult } from './indexing_service.interface.ts';

export class LangchainTextSplitter implements ITextSplitter {
  private splitter: RecursiveCharacterTextSplitter;

  constructor(options?: { chunkSize?: number; chunkOverlap?: number }) {
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: options?.chunkSize || 1000,
      chunkOverlap: options?.chunkOverlap || 200,
    });
  }

  async splitText(text: string): Promise<string[]> {
    return this.splitter.splitText(text);
  }
}

export class EmbeddingClient implements IEmbeddingClient {
  constructor(private adapter: AiProviderAdapterInstance) {}

  async getEmbedding(text: string): Promise<EmbeddingResponse> {
    if (!this.adapter.getEmbedding) {
      throw new IndexingError("The provided AI adapter does not support embeddings.");
    }
    // The adapter is now responsible for returning the correct EmbeddingResponse shape.
    // This client just passes the request through.
    const embeddingResponse = await this.adapter.getEmbedding(text);
    
    // A simple validation to ensure the adapter fulfilled its contract.
    if (!embeddingResponse || !embeddingResponse.embedding || !embeddingResponse.usage) {
        throw new IndexingError("Invalid response from embedding adapter: Missing embedding or usage data.");
    }
    return embeddingResponse;
  }
}

export class IndexingService {
  constructor(
    private supabaseClient: SupabaseClient<Database>,
    private logger: ILogger,
    private textSplitter: ITextSplitter,
    private embeddingClient: IEmbeddingClient,
    private tokenWalletService: ITokenWalletService,
  ) {}

  async indexDocument(
    sessionId: string,
    sourceContributionId: string,
    documentContent: string,
    metadata: Record<string, unknown>,
  ): Promise<IndexDocumentResult> {
    this.logger.info(
      `[IndexingService] Starting indexing for contribution ${sourceContributionId} in session ${sessionId}.`,
    );

    try {
      const chunks = await this.textSplitter.splitText(documentContent);
      this.logger.info(`[IndexingService] Split document into ${chunks.length} chunks.`);

      const embeddingResponses = await Promise.all(
        chunks.map((chunk) => this.embeddingClient.getEmbedding(chunk)),
      );
      this.logger.info(`[IndexingService] Generated ${embeddingResponses.length} embeddings.`);

      const totalTokensUsed = embeddingResponses.reduce((sum, response) => sum + response.usage.total_tokens, 0);

      // Record per-chunk debit at 1:1 tokens used with idempotent keys
      for (let i = 0; i < embeddingResponses.length; i++) {
        const usage = embeddingResponses[i].usage;
        const idempotencyKey = `embed:${sessionId}:${sourceContributionId}:${i + 1}`;
        const amountStr = String(usage.total_tokens);
        try {
          await this.tokenWalletService.recordTransaction({
            walletId: `embedding-${sessionId}`,
            type: 'DEBIT_USAGE',
            amount: amountStr,
            recordedByUserId: 'system',
            idempotencyKey,
            relatedEntityId: sourceContributionId,
            relatedEntityType: 'dialectic_memory',
            notes: 'RAG indexing embedding debit (1:1)',
          });
        } catch (err) {
          this.logger.warn('[IndexingService] Failed to record embedding debit transaction', { error: err instanceof Error ? err.message : String(err), idempotencyKey });
        }
      }

      // Guard: ensure embeddings are 3072-dim before inserting
      const expectedEmbeddingDim = 3072;
      for (let i = 0; i < embeddingResponses.length; i++) {
        const embeddingVector = embeddingResponses[i].embedding;
        if (!Array.isArray(embeddingVector) || embeddingVector.length !== expectedEmbeddingDim) {
          this.logger.error('[IndexingService] Embedding dimension mismatch', {
            index: i,
            length: Array.isArray(embeddingVector) ? embeddingVector.length : null,
          });
          throw new IndexingError('Embedding dimension mismatch; expected 3072.');
        }
      }

      const recordsToInsert: TablesInsert<'dialectic_memory'>[] = chunks.map((chunk, index) => ({
        session_id: sessionId,
        source_contribution_id: sourceContributionId,
        content: chunk,
        metadata: { ...metadata, chunk: index + 1, total_chunks: chunks.length },
        embedding: `[${embeddingResponses[index].embedding.join(',')}]`,
      }));

      const { error } = await this.supabaseClient
        .from('dialectic_memory')
        .insert(recordsToInsert);

      if (error) {
        this.logger.error(
          `[IndexingService] Failed to insert memory chunks for contribution ${sourceContributionId}.`,
          { error },
        );
        throw new IndexingError(`Database insert failed: ${error.message}`);
      }

      this.logger.info(
        `[IndexingService] Successfully indexed ${recordsToInsert.length} chunks for contribution ${sourceContributionId}.`,
      );
      return { success: true, tokensUsed: totalTokensUsed };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[IndexingService] An unexpected error occurred during indexing for contribution ${sourceContributionId}.`,
        { error: errorMessage },
      );
      return { success: false, tokensUsed: 0, error: error instanceof Error ? error : new IndexingError(errorMessage) };
    }
  }
}
