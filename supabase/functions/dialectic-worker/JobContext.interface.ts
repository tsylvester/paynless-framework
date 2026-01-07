// supabase/functions/dialectic-worker/JobContext.interface.ts

import { ILogger } from '../_shared/types.ts';
import { IFileManager } from '../_shared/types/file_manager.types.ts';
import { DownloadFromStorageFn } from '../_shared/supabase_storage_utils.ts';
import { DeleteFromStorageFn } from '../_shared/supabase_storage_utils.ts';
import { GetAiProviderAdapterFn } from '../_shared/types.ts';
import { IRagService } from '../_shared/services/rag_service.interface.ts';
import { IIndexingService } from '../_shared/services/indexing_service.interface.ts';
import { IEmbeddingClient } from '../_shared/services/indexing_service.interface.ts';
import { ITokenWalletService } from '../_shared/types/tokenWallet.types.ts';
import { NotificationServiceType } from '../_shared/types/notification.service.types.ts';
import { CallUnifiedAIModelFn } from '../dialectic-service/dialectic.interface.ts';
import { GetAiProviderConfigFn } from '../dialectic-service/dialectic.interface.ts';
import { CountTokensFn } from '../_shared/types/tokenizer.types.ts';
import {
    GetSeedPromptForStageFn,
    PlanComplexStageFn,
    IContinueJobDeps,
    IContinueJobResult,
    FailedAttemptError,
    UnifiedAIResponse,
    DialecticContributionRow,
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticRecipeStep,
    SourceDocument,
} from '../dialectic-service/dialectic.interface.ts';
import { IPromptAssembler } from '../_shared/prompt-assembler/prompt-assembler.interface.ts';
import { GetExtensionFromMimeTypeFn } from '../_shared/path_utils.ts';
import { ShouldEnqueueRenderJobFn } from '../_shared/types/shouldEnqueueRenderJob.interface.ts';
import { IDocumentRenderer } from '../_shared/services/document_renderer.interface.ts';
import { GetGranularityPlannerFn } from '../dialectic-service/dialectic.interface.ts';
import { ExecuteModelCallAndSaveParams } from '../dialectic-service/dialectic.interface.ts';
import { Database } from '../types_db.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Function type for continueJob orchestration utility.
 * Continues processing a job by creating and enqueueing follow-up jobs.
 */
export type ContinueJobFn = (
    deps: IContinueJobDeps,
    dbClient: SupabaseClient<Database>,
    job: Database['public']['Tables']['dialectic_generation_jobs']['Row'],
    aiResponse: UnifiedAIResponse,
    savedContribution: DialecticContributionRow,
    projectOwnerUserId: string
) => Promise<IContinueJobResult>;

/**
 * Function type for retryJob orchestration utility.
 * Retries a failed job by resetting its status and re-enqueueing it.
 */
export type RetryJobFn = (
    deps: { logger: ILogger; notificationService: NotificationServiceType },
    dbClient: SupabaseClient<Database>,
    job: Database['public']['Tables']['dialectic_generation_jobs']['Row'],
    currentAttempt: number,
    failedContributionAttempts: FailedAttemptError[],
    projectOwnerUserId: string
) => Promise<{ error?: Error }>;

/**
 * Function type for executeModelCallAndSave.
 * Executes an AI model call and saves the results to storage and database.
 */
export type ExecuteModelCallAndSaveFn = (
    params: ExecuteModelCallAndSaveParams
) => Promise<void>;

/**
 * Function type for findSourceDocuments.
 * Retrieves source documents required for a PLAN step to build child job payloads.
 */
export type FindSourceDocumentsFn = (
    dbClient: SupabaseClient<Database>,
    parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload },
    inputsRequired: DialecticRecipeStep['inputs_required'],
) => Promise<SourceDocument[]>;

/**
 * Base context providing logging capabilities.
 * All contexts extend this to ensure consistent logging.
 */
export interface ILoggerContext {
    readonly logger: ILogger;
}

/**
 * Base context providing file management and storage operations.
 * Used by functions that need to read/write files to Supabase Storage.
 */
export interface IFileContext {
    readonly fileManager: IFileManager;
    readonly downloadFromStorage: DownloadFromStorageFn;
    readonly deleteFromStorage: DeleteFromStorageFn;
}

/**
 * Base context providing AI model invocation and configuration.
 * Used by functions that need to call AI models or manage model providers.
 */
export interface IModelContext {
    readonly callUnifiedAIModel: CallUnifiedAIModelFn;
    readonly getAiProviderAdapter: GetAiProviderAdapterFn;
    readonly getAiProviderConfig: GetAiProviderConfigFn;
}

/**
 * Base context providing RAG (Retrieval-Augmented Generation) operations.
 * Used by functions that need indexing, embeddings, or semantic search.
 */
export interface IRagContext {
    readonly ragService: IRagService;
    readonly indexingService: IIndexingService;
    readonly embeddingClient: IEmbeddingClient;
    readonly countTokens: CountTokensFn;
}

/**
 * Base context providing token wallet operations.
 * Used by functions that need to debit/credit token wallets.
 */
export interface ITokenContext {
    readonly tokenWalletService: ITokenWalletService;
}

/**
 * Base context providing notification services.
 * Used by functions that need to send user notifications.
 */
export interface INotificationContext {
    readonly notificationService: NotificationServiceType;
}

/**
 * Context for EXECUTE job processing.
 * Provides all dependencies needed by executeModelCallAndSave and related functions.
 * Combines base contexts (logger, file, model, RAG, token, notification) with EXECUTE-specific utilities.
 * Includes orchestration callbacks (continueJob, retryJob) for job lifecycle management.
 */
export interface IExecuteJobContext extends
    ILoggerContext,
    IFileContext,
    IModelContext,
    IRagContext,
    ITokenContext,
    INotificationContext {
    // EXECUTE-specific utilities
    readonly getSeedPromptForStage: GetSeedPromptForStageFn;
    readonly promptAssembler: IPromptAssembler;
    readonly getExtensionFromMimeType: GetExtensionFromMimeTypeFn;
    readonly randomUUID: () => string;
    readonly shouldEnqueueRenderJob: ShouldEnqueueRenderJobFn;
    // Orchestration callbacks (needed by executeModelCallAndSave)
    readonly continueJob: ContinueJobFn;
    readonly retryJob: RetryJobFn;
}

/**
 * Context for PLAN job processing.
 * Provides dependencies needed by processComplexJob and planComplexStage.
 * Minimal context with logging, planning utilities, and notification service.
 */
export interface IPlanJobContext extends
    ILoggerContext,
    INotificationContext {
    readonly getGranularityPlanner: GetGranularityPlannerFn;
    readonly planComplexStage: PlanComplexStageFn;
    readonly findSourceDocuments: FindSourceDocumentsFn;
}

/**
 * Context for RENDER job processing.
 * Provides dependencies needed by processRenderJob and renderDocument.
 * Combines logger, file, and notification contexts with document rendering service.
 */
export interface IRenderJobContext extends
    ILoggerContext,
    IFileContext,
    INotificationContext {
    readonly documentRenderer: IDocumentRenderer;
}

/**
 * Root context interface representing the complete dependency bundle.
 * Constructed once at application boundary and passed to processJob.
 * Extends all composed contexts (IExecuteJobContext, IPlanJobContext, IRenderJobContext).
 * Includes additional orchestration utilities for top-level job management.
 */
export interface IJobContext extends
    IExecuteJobContext,
    IPlanJobContext,
    IRenderJobContext {
    readonly continueJob: ContinueJobFn;
    readonly retryJob: RetryJobFn;
    readonly executeModelCallAndSave: ExecuteModelCallAndSaveFn;
}

/**
 * Parameters for constructing IJobContext.
 * Each field maps to the corresponding IJobContext field.
 * All fields are required and must be explicitly provided to createJobContext factory.
 */
export interface JobContextParams {
    readonly logger: ILogger;
    readonly fileManager: IFileManager;
    readonly downloadFromStorage: DownloadFromStorageFn;
    readonly deleteFromStorage: DeleteFromStorageFn;
    readonly callUnifiedAIModel: CallUnifiedAIModelFn;
    readonly getAiProviderAdapter: GetAiProviderAdapterFn;
    readonly getAiProviderConfig: GetAiProviderConfigFn;
    readonly ragService: IRagService;
    readonly indexingService: IIndexingService;
    readonly embeddingClient: IEmbeddingClient;
    readonly countTokens: CountTokensFn;
    readonly tokenWalletService: ITokenWalletService;
    readonly notificationService: NotificationServiceType;
    readonly getSeedPromptForStage: GetSeedPromptForStageFn;
    readonly promptAssembler: IPromptAssembler;
    readonly getExtensionFromMimeType: GetExtensionFromMimeTypeFn;
    readonly randomUUID: () => string;
    readonly shouldEnqueueRenderJob: ShouldEnqueueRenderJobFn;
    readonly getGranularityPlanner: GetGranularityPlannerFn;
    readonly planComplexStage: PlanComplexStageFn;
    readonly findSourceDocuments: FindSourceDocumentsFn;
    readonly documentRenderer: IDocumentRenderer;
    readonly continueJob: ContinueJobFn;
    readonly retryJob: RetryJobFn;
    readonly executeModelCallAndSave: ExecuteModelCallAndSaveFn;
}
