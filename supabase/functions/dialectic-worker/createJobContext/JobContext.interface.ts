// supabase/functions/dialectic-worker/JobContext.interface.ts

import { ApiKeyForProviderFn, FinishReason, GetAiProviderAdapterFn, ILogger } from '../../_shared/types.ts';
import { ResourceDocument, ResolveCompressionSourceFn } from '../../_shared/utils/resolveCompressionSource/resolveCompressionSource.interface.ts'
import { IFileManager, ModelContributionUploadContext, ResourceUploadContext } from '../../_shared/types/file_manager.types.ts';
import { DownloadFromStorageFn } from '../../_shared/supabase_storage_utils.ts';
import { DeleteFromStorageFn } from '../../_shared/supabase_storage_utils.ts';
import { IAdminTokenWalletService } from '../../_shared/services/tokenwallet/admin/adminTokenWalletService.interface.ts';
import { IUserTokenWalletService } from '../../_shared/services/tokenwallet/client/userTokenWalletService.interface.ts';
import { NotificationServiceType } from '../../_shared/types/notification.service.types.ts';
import { GetAiProviderConfigFn } from '../../dialectic-service/dialectic.interface.ts';
import { CountTokensDeps, CountTokensFn } from '../../_shared/types/tokenizer.types.ts';
import {
    GetSeedPromptForStageFn,
    PlanComplexStageFn,
    UnifiedAIResponse,
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticRecipeStep,
    InputRule,
    SourceDocument,
} from '../../dialectic-service/dialectic.interface.ts';
import { IPromptAssembler } from '../../_shared/prompt-assembler/prompt-assembler.interface.ts';
import { GetExtensionFromMimeTypeFn } from '../../_shared/path_utils.ts';
import { ExtractSourceGroupFragmentFn } from '../../_shared/utils/path_utils.ts';
import { ShouldEnqueueRenderJobFn } from '../../_shared/types/shouldEnqueueRenderJob.interface.ts';
import { IDocumentRenderer } from '../../_shared/services/document_renderer/renderDocument/renderDocument.interface.ts';
import type { AssembleContributionChainFn } from '../../_shared/services/document_renderer/assembleContributionChain/assembleContributionChain.provides.ts';
import type { LoadDocumentTemplateFn } from '../../_shared/services/document_renderer/loadDocumentTemplate/loadDocumentTemplate.provides.ts';
import type { MergeChunkContentFn } from '../../_shared/services/document_renderer/mergeChunkContent/mergeChunkContent.provides.ts';
import { GetGranularityPlannerFn } from '../../dialectic-service/dialectic.interface.ts';
import { Database } from '../../types_db.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ValidatedCostRates } from '../../_shared/utils/validateModelCostRates.ts';
import {
    DetermineContinuationParams,
    DetermineContinuationResult,
} from '../../_shared/utils/determineContinuation/determineContinuation.interface.ts';
import { BuildUploadContextParams, BuildUploadContextResourceParams } from '../../_shared/utils/buildUploadContext/buildUploadContext.interface.ts';
import { BoundEnqueueModelCallFn, EnqueueModelCallFn } from '../enqueueModelCall/enqueueModelCall.interface.ts';
import { CalculateAffordabilityFn, BoundCalculateAffordabilityFn } from '../calculateAffordability/calculateAffordability.interface.ts';
import type { GetMaxOutputTokensFn } from '../calculateAffordability/calculateAffordability.interface.ts';
import { PrepareModelJobFn, BoundPrepareModelJobFn } from '../prepareModelJob/prepareModelJob.interface.ts';
import { GatherArtifactsFn, BoundGatherArtifactsFn } from '../gatherArtifacts/gatherArtifacts.interface.ts';
import type { ComputeJobSig } from "../../_shared/utils/computeJobSig/computeJobSig.interface.ts";
import { RetryJobFn, BoundRetryJobFn } from '../retryJob/retryJob.interface.ts';
import { CompressPromptFn, BoundCompressPromptFn } from '../compressPrompt/compressPrompt.interface.ts';
import { enqueueCompressJobsFn } from '../enqueueCompressJobs/enqueueCompressJobs.interface.ts';
import { GetSortedCompressionCandidatesFn } from '../../_shared/utils/vector_utils/vector_utils.interface.ts';
import { ApplyCompressionOverlayFn } from '../applyCompressionOverlay/applyCompressionOverlay.interface.ts';
import { ITextSplitter } from '../../_shared/utils/text_splitter.interface.ts';
import { ConstructStoragePathFn } from '../../_shared/utils/path_constructor.types.ts';
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
 * Assembles `ModelContributionUploadContext | ResourceUploadContext` from pre-resolved fields.
 * `buildUploadContext.ts` produces BOTH arms: the contribution arm (EXECUTE jobs) and the
 * resource arm (COMPRESS jobs). The resource arm's consumer is `saveResponse.ts`'s COMPRESS tail.
 * Matches `_shared/utils/buildUploadContext/buildUploadContext.ts`.
 */
export type BuildUploadContextFn = (
    params: BuildUploadContextParams | BuildUploadContextResourceParams,
) => ModelContributionUploadContext | ResourceUploadContext;

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
 * Base context providing token wallet operations.
 * Used by functions that need to debit/credit token wallets.
 */
export interface ITokenContext {
    readonly adminTokenWalletService: IAdminTokenWalletService;
    readonly userTokenWalletService: IUserTokenWalletService;
}

/**
 * Base context providing notification services.
 * Used by functions that need to send user notifications.
 */
export interface INotificationContext {
    readonly notificationService: NotificationServiceType;
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
    readonly assembleContributionChain: AssembleContributionChainFn;
    readonly loadDocumentTemplate: LoadDocumentTemplateFn;
    readonly mergeChunkContent: MergeChunkContentFn;
}

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
    readonly countTokens: CountTokensFn;
    readonly adminTokenWalletService: IAdminTokenWalletService;
    readonly userTokenWalletService: IUserTokenWalletService;
    readonly pickLatest: PickLatestFn;
    readonly applyInputsRequiredScope: ApplyInputsRequiredScopeFn;
    readonly validateWalletBalance: ValidateWalletBalanceFn;
    readonly validateModelCostRates: ValidateModelCostRatesFn;
    readonly getMaxOutputTokens: GetMaxOutputTokensFn;
    readonly retryJob: BoundRetryJobFn;
    readonly promptAssembler: IPromptAssembler;
    readonly getSeedPromptForStage: GetSeedPromptForStageFn;
    readonly gatherArtifacts: BoundGatherArtifactsFn;
    // Top-level orchestration — pre-bound closure for job processing
    readonly prepareModelJob: BoundPrepareModelJobFn;
    readonly enqueueModelCall: BoundEnqueueModelCallFn;
    readonly computeJobSig: ComputeJobSig;
    readonly calculateAffordability: BoundCalculateAffordabilityFn;
    readonly compressPrompt: BoundCompressPromptFn;
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
    readonly countTokens: CountTokensFn;
    readonly adminTokenWalletService: IAdminTokenWalletService;
    readonly userTokenWalletService: IUserTokenWalletService;
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
    readonly assembleContributionChain: AssembleContributionChainFn;
    readonly loadDocumentTemplate: LoadDocumentTemplateFn;
    readonly mergeChunkContent: MergeChunkContentFn;
    readonly retryJob: RetryJobFn;
    readonly gatherArtifacts: GatherArtifactsFn;
    readonly prepareModelJob: PrepareModelJobFn;
    readonly enqueueModelCall: EnqueueModelCallFn;
    readonly pickLatest: PickLatestFn;
    readonly applyInputsRequiredScope: ApplyInputsRequiredScopeFn;
    readonly validateWalletBalance: ValidateWalletBalanceFn;
    readonly validateModelCostRates: ValidateModelCostRatesFn;
    readonly getMaxOutputTokens: GetMaxOutputTokensFn;
    readonly computeJobSig: ComputeJobSig;
    readonly compressPrompt: CompressPromptFn;
    readonly calculateAffordability: CalculateAffordabilityFn;
    readonly enqueueCompressJobs: enqueueCompressJobsFn;
    readonly getSortedCompressionCandidates: GetSortedCompressionCandidatesFn;
    readonly applyCompressionOverlay: ApplyCompressionOverlayFn;
    readonly textSplitter: ITextSplitter;
    readonly constructStoragePath: ConstructStoragePathFn;
    readonly tokenizerDeps: CountTokensDeps;
    readonly netlifyQueueUrl: string;
    readonly netlifyApiKey: string;
    readonly apiKeyForProvider: ApiKeyForProviderFn;
    readonly resolveCompressionSource: ResolveCompressionSourceFn;
}
