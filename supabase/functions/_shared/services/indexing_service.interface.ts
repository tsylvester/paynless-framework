// supabase/functions/_shared/services/indexing_service.interface.ts

/**
 * @interface IIndexingService
 * @description Defines the contract for a service that can index documents.
 */
export interface IIndexingService {
  /**
   * @method indexDocument
   * @description Splits a document into chunks, generates embeddings, and saves them to the database.
   * @param sessionId The ID of the current session.
   * @param sourceContributionId The ID of the source contribution.
   * @param documentContent The text content of the document to index.
   * @param metadata Additional metadata to store with the indexed chunks.
   * @returns A promise that resolves to an object indicating success or failure.
   */
  indexDocument(
    sessionId: string,
    sourceContributionId: string,
    documentContent: string,
    metadata: Record<string, unknown>
  ): Promise<{ success: boolean; error?: Error }>;
}

export interface ITextSplitter {
    splitText(text: string): Promise<string[]>;
  }
  
  export interface IEmbeddingClient {
    createEmbedding(text: string): Promise<number[]>;
  }