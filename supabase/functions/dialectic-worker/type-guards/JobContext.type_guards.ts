// supabase/functions/dialectic-worker/type-guards/JobContexts.type_guards.ts

import { isRecord } from '../../_shared/utils/type-guards/type_guards.common.ts';
import {
    ILoggerContext,
    IFileContext,
    IModelContext,
    IRagContext,
    ITokenContext,
    INotificationContext,
    IExecuteJobContext,
    IPlanJobContext,
    IRenderJobContext,
    IJobContext,
} from '../JobContext.interface.ts';

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
        'callUnifiedAIModel' in value &&
        'getAiProviderAdapter' in value &&
        'getAiProviderConfig' in value &&
        typeof value.callUnifiedAIModel === 'function' &&
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
        'tokenWalletService' in value &&
        typeof value.tokenWalletService === 'object' &&
        value.tokenWalletService !== null
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

export function isIExecuteJobContext(value: unknown): value is IExecuteJobContext {
    if (!isILoggerContext(value)) return false;
    if (!isIFileContext(value)) return false;
    if (!isIModelContext(value)) return false;
    if (!isIRagContext(value)) return false;
    if (!isITokenContext(value)) return false;
    if (!isINotificationContext(value)) return false;
    if (!isRecord(value)) return false;

    return (
        'getSeedPromptForStage' in value &&
        'promptAssembler' in value &&
        'getExtensionFromMimeType' in value &&
        'extractSourceGroupFragment' in value &&
        'randomUUID' in value &&
        'shouldEnqueueRenderJob' in value &&
        'continueJob' in value &&
        'retryJob' in value &&
        typeof value.getSeedPromptForStage === 'function' &&
        typeof value.promptAssembler === 'object' &&
        value.promptAssembler !== null &&
        typeof value.getExtensionFromMimeType === 'function' &&
        typeof value.extractSourceGroupFragment === 'function' &&
        typeof value.randomUUID === 'function' &&
        typeof value.shouldEnqueueRenderJob === 'function' &&
        typeof value.continueJob === 'function' &&
        typeof value.retryJob === 'function'
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
    if (!isIExecuteJobContext(value)) return false;
    if (!isIPlanJobContext(value)) return false;
    if (!isIRenderJobContext(value)) return false;
    if (!isRecord(value)) return false;

    return (
        'continueJob' in value &&
        'retryJob' in value &&
        'executeModelCallAndSave' in value &&
        typeof value.continueJob === 'function' &&
        typeof value.retryJob === 'function' &&
        typeof value.executeModelCallAndSave === 'function'
    );
}
