// supabase/functions/_shared/services/rag_service.ts
import { RagServiceError } from '../utils/errors.ts';
import type { 
    IRagServiceDependencies,
    IRagSourceDocument,
    IRagContextResult,
    IRagService
} from './rag_service.interface.ts';
import type { AiModelExtendedConfig } from '../types.ts';
import { isDialecticChunkMetadata } from '../utils/type_guards.ts';
import { cosineSimilarity } from '../utils/vector_utils.ts';

type CandidateChunk = { id: string, content: string; metadata: unknown; rank: number, embedding: number[] };

function isCandidateChunk(item: Record<string, unknown>): item is CandidateChunk {
    return (
        typeof item.id === 'string' &&
        typeof item.content === 'string' &&
        typeof item.rank === 'number' &&
        Array.isArray(item.embedding)
    );
}

export class RagService implements IRagService {
  private deps: IRagServiceDependencies;

  constructor(dependencies: IRagServiceDependencies) {
    this.deps = dependencies;
  }

  private async _retry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxAttempts = 3,
    delayMs = 100,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            this.deps.logger.warn(`[RagService] Attempt ${attempt} for ${operationName} failed.`, { error });
            if (attempt === maxAttempts) {
                this.deps.logger.error(`[RagService] All ${maxAttempts} attempts for ${operationName} failed.`, { error });
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt - 1)));
        }
    }
    throw new RagServiceError(`Retry logic failed unexpectedly for ${operationName}.`);
  }

  public async getContextForModel(
    sourceDocuments: IRagSourceDocument[],
    _modelConfig: AiModelExtendedConfig,
    sessionId: string,
    stageSlug: string,
  ): Promise<IRagContextResult> {
    this.deps.logger.info(`[RagService] Starting context retrieval for session ${sessionId}.`);

    try {
        const indexingResult = await this.ensureDocumentsAreIndexed(sourceDocuments, sessionId);
        if (!indexingResult.success) {
            const err = indexingResult.error || new Error("Unknown indexing failure.");
            this.deps.logger.error('[RagService] Halting context retrieval due to indexing failure.', { error: err.message });
            return { context: null, error: new RagServiceError(`Failed to index one or more documents: ${err.message}`) };
        }
        
        this.deps.logger.info('[RagService] Documents indexed. Proceeding with advanced retrieval.');
        
        const finalContext = await this.performAdvancedRetrieval(sessionId, stageSlug);

        return { context: finalContext };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.deps.logger.error(`[RagService] An unexpected error occurred during context retrieval.`, { error: errorMessage });
      return { context: null, error: new RagServiceError(errorMessage) };
    }
  }

  private async ensureDocumentsAreIndexed(
    documents: IRagSourceDocument[],
    sessionId: string
  ): Promise<{ success: boolean; error?: Error }> {
    if (documents.length === 0) {
        this.deps.logger.info('[RagService] No source documents provided; skipping indexing check.');
        return { success: true };
    }

    const documentIds = documents.map(doc => doc.id);
    this.deps.logger.info(`[RagService] Checking indexing status for ${documentIds.length} documents.`);

    try {
      const { data: indexedChunks } = await this._retry(
        async () => {
          const result = await this.deps.dbClient
              .from('dialectic_memory')
              .select('source_contribution_id')
              .in('source_contribution_id', documentIds);
          if (result.error) throw new RagServiceError(`DB query failed: ${result.error.message}`);
          return result;
        },
        'Querying dialectic_memory'
      );

      const indexedDocIds = new Set((indexedChunks || []).map(chunk => chunk.source_contribution_id).filter((id): id is string => id !== null));
      const docsToIndex = documents.filter(doc => !indexedDocIds.has(doc.id));

      if (docsToIndex.length === 0) {
        this.deps.logger.info('[RagService] All documents are already indexed.');
        return { success: true };
      }

      this.deps.logger.info(`[RagService] Found ${docsToIndex.length} documents to index.`);

      const indexingPromises = docsToIndex.map(doc => 
          this._retry(
              async () => {
                  const result = await this.deps.indexingService.indexDocument(sessionId, doc.id, doc.content, {});
                  if (!result.success) throw result.error || new RagServiceError("Indexing failed without specific error.");
                  return result;
              },
              `Indexing document ${doc.id}`
          )
      );

      await Promise.all(indexingPromises);
      this.deps.logger.info(`[RagService] Successfully indexed ${docsToIndex.length} new documents.`);
      return { success: true };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.deps.logger.error(`[RagService] Failed to ensure documents were indexed after all retries.`, { error: err.message });
      return { success: false, error: err };
    }
  }

  private performMmrSelection(
    candidates: CandidateChunk[],
    primaryQueryEmbedding: number[],
    lambda: number,
    k: number
  ): CandidateChunk[] {
    if (candidates.length === 0) {
        return [];
    }

    // Calculate relevance score for all candidates against the primary query
    const candidatesWithRelevance = candidates.map(c => ({
        ...c,
        relevance: cosineSimilarity(c.embedding, primaryQueryEmbedding)
    }));

    // Find the most relevant item and add it to the final list
    candidatesWithRelevance.sort((a,b) => b.relevance - a.relevance);
    
    const finalContextChunks: (CandidateChunk & { relevance: number })[] = [];
    const bestCandidate = candidatesWithRelevance.shift();
    if(bestCandidate) finalContextChunks.push(bestCandidate);

    const maxCandidates = Math.min(k, candidatesWithRelevance.length + finalContextChunks.length);

    // Iteratively select the best candidates using MMR
    while (finalContextChunks.length < maxCandidates && candidatesWithRelevance.length > 0) {
        let bestMmrScore = -Infinity;
        let bestCandidateIndex = -1;

        for (let i = 0; i < candidatesWithRelevance.length; i++) {
            const candidate = candidatesWithRelevance[i];
            const relevance = candidate.relevance;
            
            let maxSimilarity = 0;
            for (const selected of finalContextChunks) {
                const similarity = cosineSimilarity(candidate.embedding, selected.embedding);
                if (similarity > maxSimilarity) {
                    maxSimilarity = similarity;
                }
            }
            
            const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;
            if (mmrScore > bestMmrScore) {
                bestMmrScore = mmrScore;
                bestCandidateIndex = i;
            }
        }

        if (bestCandidateIndex !== -1) {
            finalContextChunks.push(candidatesWithRelevance[bestCandidateIndex]);
            candidatesWithRelevance.splice(bestCandidateIndex, 1);
        } else {
            break;
        }
    }
    
    return finalContextChunks;
  }

  private async performAdvancedRetrieval(sessionId: string, stageSlug: string): Promise<string> {
    // 1. Generate Multiple Queries
    const queries = [
        `Synthesize the provided context into a unified document for the ${stageSlug} stage.`,
        `Identify unique, novel, or high-risk architectural proposals related to the ${stageSlug} stage.`,
        `Find conflicting or contradictory recommendations for the ${stageSlug} stage.`,
    ];
    
    const primaryQueryEmbedding = await this.deps.embeddingClient.createEmbedding(queries[0]);
    const allChunks = new Map<string, { content: string; metadata: unknown; rank: number }>();

    // 2. Retrieve Superset
    for (const queryText of queries) {
        const embedding = await this.deps.embeddingClient.createEmbedding(queryText);

        const { data: chunks, error } = await this.deps.dbClient.rpc('match_dialectic_chunks', {
            query_embedding: `[${embedding.join(',')}]`,
            query_text: queryText,
            match_threshold: 0.1,
            match_count: 10,
            session_id_filter: sessionId,
        });

        if (error) {
            this.deps.logger.warn(`[RagService] RPC call failed for query "${queryText}"`, { error });
            continue;
        }

        if (chunks) {
            chunks.forEach(chunk => {
                if (!allChunks.has(chunk.id)) {
                    allChunks.set(chunk.id, { content: chunk.content, metadata: chunk.metadata, rank: chunk.rank });
                }
            });
        }
    }

    if (allChunks.size === 0) {
        this.deps.logger.warn(`[RagService] No relevant chunks found for stage ${stageSlug}.`);
        return "No relevant context was found for this stage.";
    }

    // 3. Re-rank for Diversity using MMR
    const candidateIds = Array.from(allChunks.keys());
    const { data: candidateEmbeddings, error: embeddingError } = await this.deps.dbClient
      .from('dialectic_memory')
      .select('id, embedding')
      .in('id', candidateIds);

    if (embeddingError) {
      throw new RagServiceError(`Failed to fetch embeddings for MMR: ${embeddingError.message}`);
    }

    const embeddingMap = new Map<string, number[]>(
        candidateEmbeddings
            .filter((e): e is { id: string; embedding: string } => typeof e.embedding === 'string')
            .map(e => [e.id, JSON.parse(e.embedding)])
    );

    const candidates = Array.from(allChunks.entries())
      .map(([id, chunkData]) => ({ id, ...chunkData, embedding: embeddingMap.get(id)}))
      .filter((c): c is CandidateChunk => isCandidateChunk(c));
      
    const finalContextChunks = this.performMmrSelection(candidates, primaryQueryEmbedding, 0.7, 20);

    // 4. Assemble Final Prompt
    let retrievedContext = "--- Retrieved Context ---\n\n";
    finalContextChunks.forEach((chunk, index) => {
        const metadata = chunk.metadata;
        const sourceId = isDialecticChunkMetadata(metadata) ? metadata.source_contribution_id : 'Unknown';
        retrievedContext += `[Context Snippet ${index + 1} | Source: ${sourceId}]\n`;
        retrievedContext += `${chunk.content}\n\n`;
    });
    retrievedContext += "--- End of Retrieved Context ---";

    this.deps.logger.info(`[RagService] Assembled RAG context with ${finalContextChunks.length} chunks using MMR.`);
    return retrievedContext;
  }
}
