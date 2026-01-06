// supabase/functions/dialectic-worker/createJobContext.ts

import { 
    IJobContext, 
    JobContextParams, 
    IExecuteJobContext, 
    IPlanJobContext, 
    IRenderJobContext 
} from './JobContext.interface.ts';

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
        callUnifiedAIModel: params.callUnifiedAIModel,
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

        // From IExecuteJobContext (EXECUTE-specific)
        getSeedPromptForStage: params.getSeedPromptForStage,
        promptAssembler: params.promptAssembler,
        getExtensionFromMimeType: params.getExtensionFromMimeType,
        randomUUID: params.randomUUID,
        shouldEnqueueRenderJob: params.shouldEnqueueRenderJob,

        // From IPlanJobContext (PLAN-specific)
        getGranularityPlanner: params.getGranularityPlanner,
        planComplexStage: params.planComplexStage,

        // From IRenderJobContext (RENDER-specific)
        documentRenderer: params.documentRenderer,

        // From IJobContext (orchestration)
        continueJob: params.continueJob,
        retryJob: params.retryJob,
        executeModelCallAndSave: params.executeModelCallAndSave,
    };
}

/**
 * Context slicer: Extracts IExecuteJobContext subset from root IJobContext.
 * Used by processJob to pass only EXECUTE-specific dependencies to processSimpleJob/executeModelCallAndSave.
 *
 * @param root - Complete IJobContext from application boundary
 * @returns IExecuteJobContext with only fields needed for EXECUTE job processing
 */
export function createExecuteJobContext(root: IJobContext): IExecuteJobContext {
    return {
        // From ILoggerContext
        logger: root.logger,

        // From IFileContext
        fileManager: root.fileManager,
        downloadFromStorage: root.downloadFromStorage,
        deleteFromStorage: root.deleteFromStorage,

        // From IModelContext
        callUnifiedAIModel: root.callUnifiedAIModel,
        getAiProviderAdapter: root.getAiProviderAdapter,
        getAiProviderConfig: root.getAiProviderConfig,

        // From IRagContext
        ragService: root.ragService,
        indexingService: root.indexingService,
        embeddingClient: root.embeddingClient,
        countTokens: root.countTokens,

        // From ITokenContext
        tokenWalletService: root.tokenWalletService,

        // From INotificationContext
        notificationService: root.notificationService,

        // EXECUTE-specific utilities
        getSeedPromptForStage: root.getSeedPromptForStage,
        promptAssembler: root.promptAssembler,
        getExtensionFromMimeType: root.getExtensionFromMimeType,
        randomUUID: root.randomUUID,
        shouldEnqueueRenderJob: root.shouldEnqueueRenderJob,

        // Orchestration callbacks (needed by executeModelCallAndSave)
        continueJob: root.continueJob,
        retryJob: root.retryJob,
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

        // PLAN-specific utilities
        getGranularityPlanner: root.getGranularityPlanner,
        planComplexStage: root.planComplexStage,
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
