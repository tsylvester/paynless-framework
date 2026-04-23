// supabase/functions/dialectic-worker/type-guards/JobContexts.type_guards.ts

import { isRecord } from '../../_shared/utils/type-guards/type_guards.common.ts';
import {
    ILoggerContext,
    IFileContext,
    IModelContext,
    IRagContext,
    ITokenContext,
    INotificationContext,
    IPrepareModelJobContext,
    ISaveResponseContext,
    IPlanJobContext,
    IRenderJobContext,
    IJobContext,
} from './JobContext.interface.ts';

export function isILoggerContext(value: unknown): value is ILoggerContext {
    if (!isRecord(value)) {
        return false;
    }
    return 'logger' in value && typeof value.logger === 'object' && value.logger !== null;
}

export function isIFileContext(value: unknown): value is IFileContext {
    if (!isRecord(value)) {
        return false;
    }
    return (
        'fileManager' in value &&
        'downloadFromStorage' in value &&
        'deleteFromStorage' in value &&
        typeof value.fileManager === 'object' &&
        value.fileManager !== null &&
        typeof value.downloadFromStorage === 'function' &&
        typeof value.deleteFromStorage === 'function'
    );
}

export function isIModelContext(value: unknown): value is IModelContext {
    if (!isRecord(value)) {
        return false;
    }
    return (
        'getAiProviderAdapter' in value &&
        'getAiProviderConfig' in value &&
        typeof value.getAiProviderAdapter === 'function' &&
        typeof value.getAiProviderConfig === 'function'
    );
}

export function isIRagContext(value: unknown): value is IRagContext {
    if (!isRecord(value)) {
        return false;
    }
    return (
        'ragService' in value &&
        'indexingService' in value &&
        'embeddingClient' in value &&
        'countTokens' in value &&
        typeof value.ragService === 'object' &&
        value.ragService !== null &&
        typeof value.indexingService === 'object' &&
        value.indexingService !== null &&
        typeof value.embeddingClient === 'object' &&
        value.embeddingClient !== null &&
        typeof value.countTokens === 'function'
    );
}

export function isITokenContext(value: unknown): value is ITokenContext {
    if (!isRecord(value)) {
        return false;
    }
    return (
        'adminTokenWalletService' in value &&
        typeof value.adminTokenWalletService === 'object' &&
        value.adminTokenWalletService !== null &&
        'userTokenWalletService' in value &&
        typeof value.userTokenWalletService === 'object' &&
        value.userTokenWalletService !== null
    );
}

export function isINotificationContext(value: unknown): value is INotificationContext {
    if (!isRecord(value)) {
        return false;
    }
    return (
        'notificationService' in value &&
        typeof value.notificationService === 'object' &&
        value.notificationService !== null
    );
}

export function isIPrepareModelJobContext(value: unknown): value is IPrepareModelJobContext {
    if (!isRecord(value)) return false;

    return (
        'logger' in value && typeof value.logger === 'object' && value.logger !== null &&
        'applyInputsRequiredScope' in value && typeof value.applyInputsRequiredScope === 'function' &&
        'countTokens' in value && typeof value.countTokens === 'function' &&
        'adminTokenWalletService' in value && typeof value.adminTokenWalletService === 'object' && value.adminTokenWalletService !== null &&
        'validateWalletBalance' in value && typeof value.validateWalletBalance === 'function' &&
        'validateModelCostRates' in value && typeof value.validateModelCostRates === 'function' &&
        'ragService' in value && typeof value.ragService === 'object' && value.ragService !== null &&
        'embeddingClient' in value && typeof value.embeddingClient === 'object' && value.embeddingClient !== null &&
        'enqueueModelCall' in value && typeof value.enqueueModelCall === 'function' &&
        'calculateAffordability' in value && typeof value.calculateAffordability === 'function'
    );
}

export function isISaveResponseContext(value: unknown): value is ISaveResponseContext {
    if (!isRecord(value)) return false;

    return (
        'enqueueRenderJob' in value && typeof value.enqueueRenderJob === 'function' &&
        'debitTokens' in value && typeof value.debitTokens === 'function'
    );
}

export function isIPlanJobContext(value: unknown): value is IPlanJobContext {
    if (!isILoggerContext(value)) return false;
    if (!isRecord(value)) return false;

    return (
        'getGranularityPlanner' in value &&
        'planComplexStage' in value &&
        typeof value.getGranularityPlanner === 'function' &&
        typeof value.planComplexStage === 'function'
    );
}

export function isIRenderJobContext(value: unknown): value is IRenderJobContext {
    if (!isILoggerContext(value)) return false;
    if (!isIFileContext(value)) return false;
    if (!isINotificationContext(value)) return false;
    if (!isRecord(value)) return false;

    return (
        'documentRenderer' in value &&
        typeof value.documentRenderer === 'object' &&
        value.documentRenderer !== null
    );
}

export function isIJobContext(value: unknown): value is IJobContext {
    if (!isIPlanJobContext(value)) return false;
    if (!isIRenderJobContext(value)) return false;
    if (!isRecord(value)) return false;

    return (
        'getAiProviderAdapter' in value && typeof value.getAiProviderAdapter === 'function' &&
        'getAiProviderConfig' in value && typeof value.getAiProviderConfig === 'function' &&
        'ragService' in value && typeof value.ragService === 'object' && value.ragService !== null &&
        'indexingService' in value && typeof value.indexingService === 'object' && value.indexingService !== null &&
        'embeddingClient' in value && typeof value.embeddingClient === 'object' && value.embeddingClient !== null &&
        'countTokens' in value && typeof value.countTokens === 'function' &&
        'adminTokenWalletService' in value && typeof value.adminTokenWalletService === 'object' && value.adminTokenWalletService !== null &&
        'userTokenWalletService' in value && typeof value.userTokenWalletService === 'object' && value.userTokenWalletService !== null &&
        'pickLatest' in value && typeof value.pickLatest === 'function' &&
        'applyInputsRequiredScope' in value && typeof value.applyInputsRequiredScope === 'function' &&
        'validateWalletBalance' in value && typeof value.validateWalletBalance === 'function' &&
        'validateModelCostRates' in value && typeof value.validateModelCostRates === 'function' &&
        'continueJob' in value && typeof value.continueJob === 'function' &&
        'retryJob' in value && typeof value.retryJob === 'function' &&
        'resolveFinishReason' in value && typeof value.resolveFinishReason === 'function' &&
        'isIntermediateChunk' in value && typeof value.isIntermediateChunk === 'function' &&
        'determineContinuation' in value && typeof value.determineContinuation === 'function' &&
        'buildUploadContext' in value && typeof value.buildUploadContext === 'function' &&
        'debitTokens' in value && typeof value.debitTokens === 'function' &&
        'promptAssembler' in value && typeof value.promptAssembler === 'object' && value.promptAssembler !== null &&
        'getSeedPromptForStage' in value && typeof value.getSeedPromptForStage === 'function' &&
        'prepareModelJob' in value && typeof value.prepareModelJob === 'function' &&
        'sanitizeJsonContent' in value && typeof value.sanitizeJsonContent === 'function' &&
        'computeJobSig' in value && typeof value.computeJobSig === 'function'
    );
}
