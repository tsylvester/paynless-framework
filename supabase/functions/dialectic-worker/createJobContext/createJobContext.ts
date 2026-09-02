// supabase/functions/dialectic-worker/createJobContext.ts

import {
    IJobContext,
    JobContextParams,
    IPlanJobContext,
    IRenderJobContext,
} from './JobContext.interface.ts';
import { BoundEnqueueModelCallFn } from '../enqueueModelCall/enqueueModelCall.interface.ts';
import { BoundCompressPromptFn } from '../compressPrompt/compressPrompt.interface.ts';
import { BoundCalculateAffordabilityFn } from '../calculateAffordability/calculateAffordability.interface.ts';
import { BoundPrepareModelJobFn, PrepareModelJobDeps } from '../prepareModelJob/prepareModelJob.interface.ts';
import { BoundGatherArtifactsFn } from '../gatherArtifacts/gatherArtifacts.interface.ts';
import { BoundRetryJobFn } from '../retryJob/retryJob.interface.ts';
import { BoundApplyCompressionOverlayFn } from '../applyCompressionOverlay/applyCompressionOverlay.interface.ts';
import { BoundenqueueCompressJobsFn } from '../enqueueCompressJobs/enqueueCompressJobs.interface.ts';
import { BoundGetSortedCompressionCandidatesFn } from '../../_shared/utils/vector_utils/vector_utils.interface.ts';
import { BoundCountTokensFn } from '../../_shared/types/tokenizer.types.ts';
import { BoundResolveCompressionSourceFn } from '../../_shared/utils/resolveCompressionSource/resolveCompressionSource.interface.ts';

/**
 * Factory function to construct IJobContext at application boundary.
 * All fields are required and must be explicitly provided.
 *
 * @param params - All dependencies needed for complete job context
 * @returns Fully constructed IJobContext with all fields
 */
export function createJobContext(params: JobContextParams): IJobContext {
    const boundCountTokens: BoundCountTokensFn = (payload, modelConfig) =>
        params.countTokens(params.tokenizerDeps, payload, modelConfig);

    const boundResolveCompressionSource: BoundResolveCompressionSourceFn = (p, pl) =>
        params.resolveCompressionSource({ logger: params.logger }, p, pl);

    const boundGetSortedCompressionCandidates: BoundGetSortedCompressionCandidatesFn = (p, pl) =>
        params.getSortedCompressionCandidates({ logger: params.logger, countTokens: boundCountTokens, resolveCompressionSource: boundResolveCompressionSource }, p, pl);

    const boundEnqueueCompressJobs: BoundenqueueCompressJobsFn = (p, pl) =>
        params.enqueueCompressJobs({ logger: params.logger, textSplitter: params.textSplitter, countTokens: params.countTokens, constructStoragePath: params.constructStoragePath }, p, pl);

    const boundCompressPrompt: BoundCompressPromptFn = (p, pl) =>
        params.compressPrompt({ logger: params.logger, getSortedCompressionCandidates: boundGetSortedCompressionCandidates, enqueueCompressJobs: boundEnqueueCompressJobs, constructStoragePath: params.constructStoragePath, downloadFromStorage: params.downloadFromStorage, countTokens: params.countTokens, resolveCompressionSource: boundResolveCompressionSource }, p, pl);

    const boundCalculateAffordability: BoundCalculateAffordabilityFn = (p, pl) =>
        params.calculateAffordability({ logger: params.logger, countTokens: params.countTokens, getMaxOutputTokens: params.getMaxOutputTokens }, p, pl);

    const boundEnqueueModelCall: BoundEnqueueModelCallFn = (p, pl) =>
        params.enqueueModelCall({ logger: params.logger, netlifyQueueUrl: params.netlifyQueueUrl, netlifyApiKey: params.netlifyApiKey, apiKeyForProvider: params.apiKeyForProvider, computeJobSig: params.computeJobSig }, p, pl);

    const boundApplyCompressionOverlay: BoundApplyCompressionOverlayFn = (p, pl) =>
        params.applyCompressionOverlay({ logger: params.logger, downloadFromStorage: params.downloadFromStorage, resolveCompressionSource: boundResolveCompressionSource }, p, pl);

    const boundGatherArtifacts: BoundGatherArtifactsFn = (p, pl) =>
        params.gatherArtifacts({ logger: params.logger, pickLatest: params.pickLatest, downloadFromStorage: params.downloadFromStorage, applyCompressionOverlay: boundApplyCompressionOverlay }, p, pl);

    const boundRetryJob: BoundRetryJobFn = (p, pl) =>
        params.retryJob({ logger: params.logger, notificationService: params.notificationService }, p, pl);

    const boundPrepareModelJob: BoundPrepareModelJobFn = (p, pl) =>
        params.prepareModelJob(createPrepareModelJobContext(root), p, pl);

    const root: IJobContext = {
        // From ILoggerContext
        logger: params.logger,

        // From IFileContext
        fileManager: params.fileManager,
        downloadFromStorage: params.downloadFromStorage,
        deleteFromStorage: params.deleteFromStorage,

        // From IModelContext
        getAiProviderAdapter: params.getAiProviderAdapter,
        getAiProviderConfig: params.getAiProviderConfig,

        countTokens: params.countTokens,

        // From ITokenContext
        adminTokenWalletService: params.adminTokenWalletService,
        userTokenWalletService: params.userTokenWalletService,

        // From INotificationContext
        notificationService: params.notificationService,

        promptAssembler: params.promptAssembler,
        getSeedPromptForStage: params.getSeedPromptForStage,
        gatherArtifacts: boundGatherArtifacts,

        retryJob: boundRetryJob,

        pickLatest: params.pickLatest,
        applyInputsRequiredScope: params.applyInputsRequiredScope,
        validateWalletBalance: params.validateWalletBalance,
        validateModelCostRates: params.validateModelCostRates,
        getMaxOutputTokens: params.getMaxOutputTokens,

        // From IPlanJobContext (PLAN-specific)
        getGranularityPlanner: params.getGranularityPlanner,
        planComplexStage: params.planComplexStage,
        findSourceDocuments: params.findSourceDocuments,

        // From IRenderJobContext (RENDER-specific)
        documentRenderer: params.documentRenderer,
        assembleContributionChain: params.assembleContributionChain,
        loadDocumentTemplate: params.loadDocumentTemplate,
        mergeChunkContent: params.mergeChunkContent,

        // From IJobContext (orchestration — bound closures)
        prepareModelJob: boundPrepareModelJob,
        enqueueModelCall: boundEnqueueModelCall,
        computeJobSig: params.computeJobSig,
        calculateAffordability: boundCalculateAffordability,
        compressPrompt: boundCompressPrompt,
    };

    return root;
}

/**
 * Context slicer: Extracts PrepareModelJobDeps subset from root IJobContext.
 * Projects each PrepareModelJobDeps member from the root member of the same name,
 * except tokenWalletService, which is read from root.userTokenWalletService.
 *
 * @param root - Complete IJobContext from application boundary
 * @returns PrepareModelJobDeps with only fields needed for prepareModelJob
 */
export function createPrepareModelJobContext(root: IJobContext): PrepareModelJobDeps {
    return {
        logger: root.logger,
        applyInputsRequiredScope: root.applyInputsRequiredScope,
        tokenWalletService: root.userTokenWalletService,
        validateWalletBalance: root.validateWalletBalance,
        validateModelCostRates: root.validateModelCostRates,
        calculateAffordability: root.calculateAffordability,
        enqueueModelCall: root.enqueueModelCall,
        compressPrompt: root.compressPrompt,
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
        assembleContributionChain: root.assembleContributionChain,
        loadDocumentTemplate: root.loadDocumentTemplate,
        mergeChunkContent: root.mergeChunkContent,
    };
}
