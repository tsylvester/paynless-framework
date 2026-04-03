// supabase/functions/dialectic-worker/createJobContext.ts

import {
    IJobContext,
    JobContextParams,
    IExecuteModelCallContext,
    IPrepareModelJobContext,
    IPlanJobContext,
    IRenderJobContext,
} from './JobContext.interface.ts';
import { BoundExecuteModelCallAndSaveFn } from '../executeModelCallAndSave/executeModelCallAndSave.interface.ts';
import { BoundEnqueueRenderJobFn } from '../enqueueRenderJob/enqueueRenderJob.interface.ts';
import { CompressPromptFn } from '../compressPrompt/compressPrompt.interface.ts';
import { BoundCompressPromptFn } from '../compressPrompt/compressPrompt.interface.ts';
import { CalculateAffordabilityFn } from '../calculateAffordability/calculateAffordability.interface.ts';
import { BoundCalculateAffordabilityFn } from '../calculateAffordability/calculateAffordability.interface.ts';
/**
 * Factory function to construct IJobContext at application boundary.
 * All fields are required and must be explicitly provided.
 *
 * @param params - All dependencies needed for complete job context
 * @returns Fully constructed IJobContext with all fields
 */
export function createJobContext(params: JobContextParams): IJobContext {
    return {
        // From ILoggerContext
        logger: params.logger,

        // From IFileContext
        fileManager: params.fileManager,
        downloadFromStorage: params.downloadFromStorage,
        deleteFromStorage: params.deleteFromStorage,

        // From IModelContext
        getAiProviderAdapter: params.getAiProviderAdapter,
        getAiProviderConfig: params.getAiProviderConfig,

        // From IRagContext
        ragService: params.ragService,
        indexingService: params.indexingService,
        embeddingClient: params.embeddingClient,
        countTokens: params.countTokens,

        // From ITokenContext
        tokenWalletService: params.tokenWalletService,

        // From INotificationContext
        notificationService: params.notificationService,

        promptAssembler: params.promptAssembler,
        getSeedPromptForStage: params.getSeedPromptForStage,
        gatherArtifacts: params.gatherArtifacts,

        continueJob: params.continueJob,
        retryJob: params.retryJob,

        pickLatest: params.pickLatest,
        applyInputsRequiredScope: params.applyInputsRequiredScope,
        validateWalletBalance: params.validateWalletBalance,
        validateModelCostRates: params.validateModelCostRates,
        resolveFinishReason: params.resolveFinishReason,
        isIntermediateChunk: params.isIntermediateChunk,
        determineContinuation: params.determineContinuation,
        buildUploadContext: params.buildUploadContext,

        // From IPlanJobContext (PLAN-specific)
        getGranularityPlanner: params.getGranularityPlanner,
        planComplexStage: params.planComplexStage,
        findSourceDocuments: params.findSourceDocuments,

        // From IRenderJobContext (RENDER-specific)
        documentRenderer: params.documentRenderer,

        // From IJobContext (orchestration)
        prepareModelJob: params.prepareModelJob,
        debitTokens: params.debitTokens,
    };
}

/**
 * Context slicer: Extracts IExecuteModelCallContext subset from root IJobContext.
 * Used by processJob to pass only executeModelCallAndSave dependencies.
 *
 * @param root - Complete IJobContext from application boundary
 * @returns IExecuteModelCallContext with only fields needed for executeModelCallAndSave
 */
export function createExecuteModelCallContext(root: IJobContext): IExecuteModelCallContext {
    return {
        logger: root.logger,
        fileManager: root.fileManager,
        getAiProviderAdapter: root.getAiProviderAdapter,
        tokenWalletService: root.tokenWalletService,
        notificationService: root.notificationService,
        continueJob: root.continueJob,
        retryJob: root.retryJob,
        resolveFinishReason: root.resolveFinishReason,
        isIntermediateChunk: root.isIntermediateChunk,
        determineContinuation: root.determineContinuation,
        buildUploadContext: root.buildUploadContext,
        debitTokens: root.debitTokens,
    };
}

/**
 * Context slicer: Extracts IPrepareModelJobContext subset from root IJobContext.
 * Picks 8 raw fields from IJobContext and receives 2 pre-bound orchestrator closures
 * plus compressPrompt and calculateAffordability factories (bound here with root deps).
 *
 * @param root - Complete IJobContext from application boundary
 * @param boundEmcas - Pre-bound executeModelCallAndSave closure
 * @param boundRender - Pre-bound enqueueRenderJob closure
 * @param compressPromptFn - Unbound compressPrompt implementation
 * @param calculateAffordabilityFn - Unbound calculateAffordability implementation
 * @returns IPrepareModelJobContext with only fields needed for prepareModelJob
 */
export function createPrepareModelJobContext(
    root: IJobContext,
    boundEmcas: BoundExecuteModelCallAndSaveFn,
    boundRender: BoundEnqueueRenderJobFn,
    compressPromptFn: CompressPromptFn,
    calculateAffordabilityFn: CalculateAffordabilityFn,
): IPrepareModelJobContext {
    const boundCompressPrompt: BoundCompressPromptFn = (params, payload) =>
        compressPromptFn(
            {
                logger: root.logger,
                ragService: root.ragService,
                embeddingClient: root.embeddingClient,
                tokenWalletService: root.tokenWalletService,
                countTokens: root.countTokens,
            },
            params,
            payload,
        );

    const calculateAffordability: BoundCalculateAffordabilityFn = (params, payload) =>
        calculateAffordabilityFn(
            {
                logger: root.logger,
                countTokens: root.countTokens,
                compressPrompt: boundCompressPrompt,
            },
            params,
            payload,
        );

    return {
        logger: root.logger,
        applyInputsRequiredScope: root.applyInputsRequiredScope,
        countTokens: root.countTokens,
        tokenWalletService: root.tokenWalletService,
        validateWalletBalance: root.validateWalletBalance,
        validateModelCostRates: root.validateModelCostRates,
        ragService: root.ragService,
        embeddingClient: root.embeddingClient,
        executeModelCallAndSave: boundEmcas,
        enqueueRenderJob: boundRender,
        calculateAffordability,
    };
}

/**
 * Context slicer: Extracts IPlanJobContext subset from root IJobContext.
 * Used by processJob to pass only PLAN-specific dependencies to processComplexJob/planComplexStage.
 *
 * @param root - Complete IJobContext from application boundary
 * @returns IPlanJobContext with only fields needed for PLAN job processing
 */
export function createPlanJobContext(root: IJobContext): IPlanJobContext {
    return {
        // From ILoggerContext
        logger: root.logger,

        // From INotificationContext
        notificationService: root.notificationService,

        // PLAN-specific utilities
        getGranularityPlanner: root.getGranularityPlanner,
        planComplexStage: root.planComplexStage,
        findSourceDocuments: root.findSourceDocuments,
    };
}

/**
 * Context slicer: Extracts IRenderJobContext subset from root IJobContext.
 * Used by processJob to pass only RENDER-specific dependencies to processRenderJob/renderDocument.
 *
 * @param root - Complete IJobContext from application boundary
 * @returns IRenderJobContext with only fields needed for RENDER job processing
 */
export function createRenderJobContext(root: IJobContext): IRenderJobContext {
    return {
        // From ILoggerContext
        logger: root.logger,

        // From IFileContext
        fileManager: root.fileManager,
        downloadFromStorage: root.downloadFromStorage,
        deleteFromStorage: root.deleteFromStorage,

        // From INotificationContext
        notificationService: root.notificationService,

        // RENDER-specific utilities
        documentRenderer: root.documentRenderer,
    };
}
