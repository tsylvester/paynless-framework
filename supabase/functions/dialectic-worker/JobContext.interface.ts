// supabase/functions/dialectic-worker/JobContext.interface.ts

import { FinishReason, GetAiProviderAdapterFn, ILogger, ResourceDocument } from '../_shared/types.ts';
import { IFileManager, ModelContributionUploadContext } from '../_shared/types/file_manager.types.ts';
import { DownloadFromStorageFn } from '../_shared/supabase_storage_utils.ts';
import { DeleteFromStorageFn } from '../_shared/supabase_storage_utils.ts';
import { IRagService } from '../_shared/services/rag_service.interface.ts';
import { IIndexingService } from '../_shared/services/indexing_service.interface.ts';
import { IEmbeddingClient } from '../_shared/services/indexing_service.interface.ts';
import { ITokenWalletService } from '../_shared/types/tokenWallet.types.ts';
import { NotificationServiceType } from '../_shared/types/notification.service.types.ts';
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
    InputRule,
    SourceDocument,
} from '../dialectic-service/dialectic.interface.ts';
import { IPromptAssembler } from '../_shared/prompt-assembler/prompt-assembler.interface.ts';
import { GetExtensionFromMimeTypeFn } from '../_shared/path_utils.ts';
import { ExtractSourceGroupFragmentFn } from '../_shared/utils/path_utils.ts';
import { ShouldEnqueueRenderJobFn } from '../_shared/types/shouldEnqueueRenderJob.interface.ts';
import { IDocumentRenderer } from '../_shared/services/document_renderer.interface.ts';
import { GetGranularityPlannerFn } from '../dialectic-service/dialectic.interface.ts';
import { Database } from '../types_db.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ValidatedCostRates } from '../_shared/utils/validateModelCostRates.ts';
import {
    DetermineContinuationParams,
    DetermineContinuationResult,
} from '../_shared/utils/determineContinuation/determineContinuation.interface.ts';
import { BuildUploadContextParams } from '../_shared/utils/buildUploadContext/buildUploadContext.interface.ts';
import { DebitTokens } from '../_shared/utils/debitTokens.interface.ts';
import { BoundExecuteModelCallAndSaveFn } from './executeModelCallAndSave/executeModelCallAndSave.interface.ts';
import { BoundEnqueueRenderJobFn } from './enqueueRenderJob/enqueueRenderJob.interface.ts';
import { PrepareModelJobParams, PrepareModelJobPayload, PrepareModelJobReturn } from './prepareModelJob/prepareModelJob.interface.ts';

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
 * Function type for findSourceDocuments.
 * Retrieves source documents required for a PLAN step to build child job payloads.
 */
export type FindSourceDocumentsFn = (
    dbClient: SupabaseClient<Database>,
    parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload },
    inputsRequired: DialecticRecipeStep['inputs_required'],
) => Promise<SourceDocument[]>;

/**
 * Selects the row with the latest `created_at` from a non-empty array.
 * Matches `_shared/utils/pickLatest.ts`.
 */
export type PickLatestFn = <T extends { created_at: string }>(rows: T[]) => T;

/**
 * Filters gathered resource documents to inputs-required scope.
 * Matches `_shared/utils/applyInputsRequiredScope.ts`.
 */
export type ApplyInputsRequiredScopeFn = (
    docs: Required<ResourceDocument>[],
    inputsRequired: InputRule[] | undefined,
) => Required<ResourceDocument>[];

/**
 * Parses and validates a wallet balance string.
 * Matches `_shared/utils/validateWalletBalance.ts`.
 */
export type ValidateWalletBalanceFn = (
    walletBalanceStr: string,
    walletId: string,
) => number;

/**
 * Validates input/output token cost rates from model config.
 * Matches `_shared/utils/validateModelCostRates.ts`.
 */
export type ValidateModelCostRatesFn = (
    inputRate: number | null,
    outputRate: number | null,
) => ValidatedCostRates;

/**
 * Resolves finish_reason from a unified AI response.
 * Matches `_shared/utils/resolveFinishReason.ts`.
 */
export type ResolveFinishReasonFn = (aiResponse: UnifiedAIResponse) => FinishReason;

/**
 * Gates whether the current chunk is intermediate (skip sanitize/parse).
 * Matches `_shared/utils/isIntermediateChunk.ts`.
 */
export type IsIntermediateChunkFn = (
    resolvedFinish: FinishReason,
    continueUntilComplete: boolean,
) => boolean;

/**
 * Decides whether the job should continue (continuation triggers).
 * Matches `_shared/utils/determineContinuation/determineContinuation.ts`.
 */
export type DetermineContinuationFn = (
    params: DetermineContinuationParams,
) => DetermineContinuationResult;

/**
 * Assembles `ModelContributionUploadContext` from pre-resolved fields.
 * Matches `_shared/utils/buildUploadContext/buildUploadContext.ts`.
 */
export type BuildUploadContextFn = (
    params: BuildUploadContextParams,
) => ModelContributionUploadContext;

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
 * Context slice for slimmed executeModelCallAndSave (Zones E-G).
 * 12 fields, no base context extensions — cherry-picks only what Zones E-G actually call.
 * Constructed by createExecuteModelCallContext slicer from IJobContext raw fields.
 */
export interface IExecuteModelCallContext {
    readonly logger: ILogger;
    readonly fileManager: IFileManager;
    readonly getAiProviderAdapter: GetAiProviderAdapterFn;
    readonly tokenWalletService: ITokenWalletService;
    readonly notificationService: NotificationServiceType;
    readonly continueJob: ContinueJobFn;
    readonly retryJob: RetryJobFn;
    readonly resolveFinishReason: ResolveFinishReasonFn;
    readonly isIntermediateChunk: IsIntermediateChunkFn;
    readonly determineContinuation: DetermineContinuationFn;
    readonly buildUploadContext: BuildUploadContextFn;
    readonly debitTokens: DebitTokens;
}

/**
 * Context slice for prepareModelJob (Zones A-D).
 * 12 fields, no base context extensions — cherry-picks only what Zones A-D actually call
 * plus 2 pre-bound orchestrator closures.
 * Constructed by createPrepareModelJobContext slicer from IJobContext raw fields + pre-bound closures.
 */
export interface IPrepareModelJobContext {
    readonly logger: ILogger;
    readonly pickLatest: PickLatestFn;
    readonly downloadFromStorage: DownloadFromStorageFn;
    readonly applyInputsRequiredScope: ApplyInputsRequiredScopeFn;
    readonly countTokens: CountTokensFn;
    readonly tokenWalletService: ITokenWalletService;
    readonly validateWalletBalance: ValidateWalletBalanceFn;
    readonly validateModelCostRates: ValidateModelCostRatesFn;
    readonly ragService: IRagService;
    readonly embeddingClient: IEmbeddingClient;
    readonly executeModelCallAndSave: BoundExecuteModelCallAndSaveFn;
    readonly enqueueRenderJob: BoundEnqueueRenderJobFn;
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
 * Pre-bound prepareModelJob closure type.
 * 2-arg closure constructed at composition root — deps are already bound.
 */
export type BoundPrepareModelJobFn = (
    params: PrepareModelJobParams,
    payload: PrepareModelJobPayload,
) => Promise<PrepareModelJobReturn>;

/**
 * Root context interface representing the complete dependency bundle.
 * Constructed once at application boundary and passed to processJob.
 * Extends IPlanJobContext and IRenderJobContext for plan/render fields.
 * Does NOT extend IExecuteModelCallContext or IPrepareModelJobContext — those contain
 * pre-bound closures that IJobContext does not natively have. IJobContext is the fat root
 * holding all RAW fields; slicers construct per-function contexts from it.
 */
export interface IJobContext extends
    IPlanJobContext,
    IRenderJobContext {
    // Raw fields needed by slicers (not inherited from IPlanJobContext or IRenderJobContext)
    readonly getAiProviderAdapter: GetAiProviderAdapterFn;
    readonly getAiProviderConfig: GetAiProviderConfigFn;
    readonly ragService: IRagService;
    readonly indexingService: IIndexingService;
    readonly embeddingClient: IEmbeddingClient;
    readonly countTokens: CountTokensFn;
    readonly tokenWalletService: ITokenWalletService;
    readonly pickLatest: PickLatestFn;
    readonly applyInputsRequiredScope: ApplyInputsRequiredScopeFn;
    readonly validateWalletBalance: ValidateWalletBalanceFn;
    readonly validateModelCostRates: ValidateModelCostRatesFn;
    readonly continueJob: ContinueJobFn;
    readonly retryJob: RetryJobFn;
    readonly resolveFinishReason: ResolveFinishReasonFn;
    readonly isIntermediateChunk: IsIntermediateChunkFn;
    readonly determineContinuation: DetermineContinuationFn;
    readonly buildUploadContext: BuildUploadContextFn;
    readonly debitTokens: DebitTokens;
    readonly promptAssembler: IPromptAssembler;
    readonly getSeedPromptForStage: GetSeedPromptForStageFn;
    // Top-level orchestration — pre-bound closure for job processing
    readonly prepareModelJob: BoundPrepareModelJobFn;
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
    readonly extractSourceGroupFragment: ExtractSourceGroupFragmentFn;
    readonly randomUUID: () => string;
    readonly shouldEnqueueRenderJob: ShouldEnqueueRenderJobFn;
    readonly getGranularityPlanner: GetGranularityPlannerFn;
    readonly planComplexStage: PlanComplexStageFn;
    readonly findSourceDocuments: FindSourceDocumentsFn;
    readonly documentRenderer: IDocumentRenderer;
    readonly continueJob: ContinueJobFn;
    readonly retryJob: RetryJobFn;
    readonly prepareModelJob: BoundPrepareModelJobFn;
    readonly debitTokens: DebitTokens;
    readonly pickLatest: PickLatestFn;
    readonly applyInputsRequiredScope: ApplyInputsRequiredScopeFn;
    readonly validateWalletBalance: ValidateWalletBalanceFn;
    readonly validateModelCostRates: ValidateModelCostRatesFn;
    readonly resolveFinishReason: ResolveFinishReasonFn;
    readonly isIntermediateChunk: IsIntermediateChunkFn;
    readonly determineContinuation: DetermineContinuationFn;
    readonly buildUploadContext: BuildUploadContextFn;
}
