// supabase/functions/dialectic-worker/createJobContext/JobContext.mock.ts

import { JobContextParams } from './JobContext.interface.ts';
import { MockFileManagerService } from '../../_shared/services/file_manager.mock.ts';
import { MockRagService } from '../../_shared/services/rag_service.mock.ts';
import { MockIndexingService } from '../../_shared/services/indexing_service.mock.ts';
import { createMockAdminTokenWalletService } from '../../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts';
import { createMockUserTokenWalletService } from '../../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts';
import { createDocumentRendererMock } from '../../_shared/services/document_renderer.mock.ts';
import { MockPromptAssembler } from '../../_shared/prompt-assembler/prompt-assembler.mock.ts';
import { mockNotificationService } from '../../_shared/utils/notification.service.mock.ts';
import { MockLogger } from '../../_shared/logger.mock.ts';
import { createMockDownloadFromStorage } from '../../_shared/supabase_storage_utils.mock.ts';
import { mockSendMessageStream } from '../../_shared/ai_service/ai_provider.mock.ts';
import {
    IJobContext,
    IPlanJobContext,
    IPrepareModelJobContext,
    IRenderJobContext,
} from './JobContext.interface.ts';
import { createMockFindSourceDocuments } from '../findSourceDocuments.mock.ts';
import { extractSourceGroupFragment } from '../../_shared/utils/path_utils.ts';
import { pickLatest } from '../../_shared/utils/pickLatest.ts';
import { applyInputsRequiredScope } from '../../_shared/utils/applyInputsRequiredScope.ts';
import { validateWalletBalance } from '../../_shared/utils/validateWalletBalance.ts';
import { validateModelCostRates } from '../../_shared/utils/validateModelCostRates.ts';
import { resolveFinishReason } from '../../_shared/utils/resolveFinishReason.ts';
import { isIntermediateChunk } from '../../_shared/utils/isIntermediateChunk.ts';
import { determineContinuation } from '../../_shared/utils/determineContinuation/determineContinuation.ts';
import { buildUploadContext } from '../../_shared/utils/buildUploadContext/buildUploadContext.ts';
import type { BoundPrepareModelJobFn } from './JobContext.interface.ts';
import type { DebitTokens } from '../../_shared/utils/debitTokens.interface.ts';
import type { BoundExecuteModelCallAndSaveFn } from '../executeModelCallAndSave/executeModelCallAndSave.interface.ts';
import type { BoundEnqueueModelCallFn } from '../enqueueModelCall/enqueueModelCall.interface.ts';
import type { BoundEnqueueRenderJobFn } from '../enqueueRenderJob/enqueueRenderJob.interface.ts';
import type { BoundGatherArtifactsFn } from '../gatherArtifacts/gatherArtifacts.interface.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import type {
    CompressPromptDeps,
    CompressPromptFn,
    CompressPromptParams,
    CompressPromptPayload,
    CompressPromptSuccessReturn,
} from '../compressPrompt/compressPrompt.interface.ts';
import {
    buildCompressPromptParams,
    buildCompressPromptPayload,
} from '../compressPrompt/compressPrompt.mock.ts';
import type {
    CalculateAffordabilityDeps,
    CalculateAffordabilityFn,
    CalculateAffordabilityParams,
    CalculateAffordabilityPayload,
} from '../calculateAffordability/calculateAffordability.interface.ts';
import {
    buildCalculateAffordabilityDirectReturn,
    buildMockBoundCalculateAffordabilityFn,
    buildMockCalculateAffordabilityFn,
} from '../calculateAffordability/calculateAffordability.mock.ts';
import { createJobContext } from './createJobContext.ts';

type JobContextParamsOverrides = { [K in keyof JobContextParams]?: JobContextParams[K] };



export function createMockBoundExecuteModelCallAndSave(): BoundExecuteModelCallAndSaveFn {
    return async () => ({
        error: new Error('mock bound executeModelCallAndSave not implemented'),
        retriable: false,
    });
}

export function createMockBoundEnqueueModelCall(): BoundEnqueueModelCallFn {
    return async () => ({
        error: new Error('mock bound enqueueModelCall not implemented'),
        retriable: false,
    });
}

export function createMockBoundEnqueueRenderJob(): BoundEnqueueRenderJobFn {
    return async () => ({
        error: new Error('mock bound enqueueRenderJob not implemented'),
        retriable: false,
    });
}

export function createMockBoundGatherArtifacts(): BoundGatherArtifactsFn {
    return async () => ({
        artifacts: [],
    });
}

/**
 * Unbound `compressPrompt` that records every `CompressPromptDeps` passed by the slicer binding.
 */
export function createCompressPromptFn(): {
    compressPromptFn: CompressPromptFn;
    recordedCompressDeps: CompressPromptDeps[];
} {
    const recordedCompressDeps: CompressPromptDeps[] = [];
    const compressPromptFn: CompressPromptFn = async (
        deps: CompressPromptDeps,
        _params: CompressPromptParams,
        payload: CompressPromptPayload,
    ): Promise<CompressPromptSuccessReturn> => {
        recordedCompressDeps.push(deps);
        const out: CompressPromptSuccessReturn = {
            chatApiRequest: payload.chatApiRequest,
            resolvedInputTokenCount: 0,
            resourceDocuments: payload.resourceDocuments,
        };
        return out;
    };
    return { compressPromptFn, recordedCompressDeps };
}

/**
 * Unbound `calculateAffordability` that records every `CalculateAffordabilityDeps` passed by the slicer binding.
 */
export function createCalculateAffordabilityFn(): {
    calculateAffordabilityFn: CalculateAffordabilityFn;
    recordedAffordabilityDeps: CalculateAffordabilityDeps[];
} {
    const recordedAffordabilityDeps: CalculateAffordabilityDeps[] = [];
    const calculateAffordabilityFn: CalculateAffordabilityFn = buildMockCalculateAffordabilityFn({
        resolve: async (
            deps: CalculateAffordabilityDeps,
            _params: CalculateAffordabilityParams,
            _payload: CalculateAffordabilityPayload,
        ) => {
            recordedAffordabilityDeps.push(deps);
            return buildCalculateAffordabilityDirectReturn(0);
        },
    });
    return { calculateAffordabilityFn, recordedAffordabilityDeps };
}

/**
 * Unbound `calculateAffordability` that invokes `deps.compressPrompt` once (contract: bound compress receives root-shaped deps).
 */
export function createContractCalculateAffordabilityFnThatCallsCompressPrompt(
    dbClient: SupabaseClient<Database>,
): { calculateAffordabilityFn: CalculateAffordabilityFn } {
    const calculateAffordabilityFn: CalculateAffordabilityFn = buildMockCalculateAffordabilityFn({
        resolve: async (
            deps: CalculateAffordabilityDeps,
            _params: CalculateAffordabilityParams,
            _payload: CalculateAffordabilityPayload,
        ) => {
            await deps.compressPrompt(
                buildCompressPromptParams(dbClient),
                buildCompressPromptPayload(),
            );
            return buildCalculateAffordabilityDirectReturn(0);
        },
    });
    return { calculateAffordabilityFn };
}

/**
 * Helper: Creates mock JobContextParams with all required fields
 * Uses existing mock services from the codebase
 */
export function createMockJobContextParams(overrides?: JobContextParamsOverrides): JobContextParams {
    const fileManager = new MockFileManagerService();
    const ragService = new MockRagService();
    const indexingService = new MockIndexingService();
    const adminTokenWalletService = createMockAdminTokenWalletService().instance;
    const userTokenWalletService = createMockUserTokenWalletService().instance;
    const documentRenderer = createDocumentRendererMock().renderer;
    const promptAssembler = new MockPromptAssembler();
    const logger = new MockLogger();
    const mockDownloadFn = createMockDownloadFromStorage({ mode: 'success', data: new ArrayBuffer(0) });
    const findSourceDocuments = createMockFindSourceDocuments({ mode: 'empty' });
    const prepareModelJob: BoundPrepareModelJobFn = async () => ({
        error: new Error('mock prepareModelJob not implemented'),
        retriable: false,
    });
    const debitTokens: DebitTokens = async () => ({
        error: new Error('mock debitTokens not implemented'),
        retriable: false,
    });
    const boundGatherArtifacts: BoundGatherArtifactsFn = createMockBoundGatherArtifacts();
    const baseParams: JobContextParams = {
        logger: logger,
        fileManager: fileManager,
        downloadFromStorage: mockDownloadFn,
        deleteFromStorage: async () => ({ error: null }),
        getAiProviderAdapter: () => ({
            sendMessage: async () => ({
                role: 'assistant',
                content: 'mock',
                ai_provider_id: null,
                system_prompt_id: null,
                token_usage: null,
            }),
            sendMessageStream: mockSendMessageStream,
            listModels: async () => [],
        }),
        getAiProviderConfig: async () => ({
            api_identifier: 'mock-model',
            input_token_cost_rate: 0.001,
            output_token_cost_rate: 0.002,
            tokenization_strategy: { type: 'none' },
        }),
        ragService: ragService,
        indexingService: indexingService,
        embeddingClient: {
            getEmbedding: async () => ({
                embedding: [],
                usage: { prompt_tokens: 0, total_tokens: 0 },
            }),
        },
        countTokens: () => 0,
        adminTokenWalletService: adminTokenWalletService,
        userTokenWalletService: userTokenWalletService,
        notificationService: mockNotificationService,
        getSeedPromptForStage: async () => ({
            content: 'Seed prompt content',
            fullPath: 'test/path/seed.txt',
            bucket: 'test-bucket',
            path: 'test/path',
            fileName: 'seed.txt',
        }),
        promptAssembler: promptAssembler,
        getExtensionFromMimeType: () => '.txt',
        extractSourceGroupFragment: extractSourceGroupFragment,
        randomUUID: () => 'test-uuid',
        shouldEnqueueRenderJob: async () => ({
            shouldRender: false,
            reason: 'is_json',
        }),
        getGranularityPlanner: () => () => [],
        planComplexStage: async () => [],
        findSourceDocuments: findSourceDocuments,
        documentRenderer: documentRenderer,
        continueJob: async () => ({ enqueued: false }),
        retryJob: async () => ({}),
        prepareModelJob: prepareModelJob,
        debitTokens: debitTokens,
        pickLatest: pickLatest,
        applyInputsRequiredScope: applyInputsRequiredScope,
        validateWalletBalance: validateWalletBalance,
        validateModelCostRates: validateModelCostRates,
        resolveFinishReason: resolveFinishReason,
        isIntermediateChunk: isIntermediateChunk,
        determineContinuation: determineContinuation,
        buildUploadContext: buildUploadContext,
        gatherArtifacts: boundGatherArtifacts,
    };

    if (!overrides) {
        return baseParams;
    }

    return {
        ...baseParams,
        ...overrides,
    };
}

/**
 * `IJobContext` built only from `JobContextParams` mapping — does not call `createJobContext`.
 * For guard tests, interface tests, and any caller that must not depend on the composition root.
 */
export function buildIJobContext(): IJobContext {
    const params: JobContextParams = createMockJobContextParams();
    return {
        logger: params.logger,
        fileManager: params.fileManager,
        downloadFromStorage: params.downloadFromStorage,
        deleteFromStorage: params.deleteFromStorage,
        getAiProviderAdapter: params.getAiProviderAdapter,
        getAiProviderConfig: params.getAiProviderConfig,
        ragService: params.ragService,
        indexingService: params.indexingService,
        embeddingClient: params.embeddingClient,
        countTokens: params.countTokens,
        adminTokenWalletService: params.adminTokenWalletService,
        userTokenWalletService: params.userTokenWalletService,
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
        getGranularityPlanner: params.getGranularityPlanner,
        planComplexStage: params.planComplexStage,
        findSourceDocuments: params.findSourceDocuments,
        documentRenderer: params.documentRenderer,
        prepareModelJob: params.prepareModelJob,
        debitTokens: params.debitTokens,
    };
}

/**
 * `IPlanJobContext` slice from a guard-test root (no slicer import).
 */
export function buildIPlanJobContext(root?: IJobContext): IPlanJobContext {
    const r: IJobContext = root !== undefined ? root : buildIJobContext();
    return {
        logger: r.logger,
        notificationService: r.notificationService,
        getGranularityPlanner: r.getGranularityPlanner,
        planComplexStage: r.planComplexStage,
        findSourceDocuments: r.findSourceDocuments,
    };
}

/**
 * `IRenderJobContext` slice from a guard-test root (no slicer import).
 */
export function buildIRenderJobContext(root?: IJobContext): IRenderJobContext {
    const r: IJobContext = root !== undefined ? root : buildIJobContext();
    return {
        logger: r.logger,
        fileManager: r.fileManager,
        downloadFromStorage: r.downloadFromStorage,
        deleteFromStorage: r.deleteFromStorage,
        notificationService: r.notificationService,
        documentRenderer: r.documentRenderer,
    };
}

/**
 * Typed object satisfying `IPrepareModelJobContext` for interface / guard contract tests (no slicer).
 * Optional `root` pins raw-field equality when assertions compare against `buildIJobContext()`.
 */
export function buildIPrepareModelJobContext(root?: IJobContext): IPrepareModelJobContext {
    const r: IJobContext = root !== undefined ? root : buildIJobContext();
    return {
        logger: r.logger,
        applyInputsRequiredScope: r.applyInputsRequiredScope,
        countTokens: r.countTokens,
        adminTokenWalletService: r.adminTokenWalletService,
        validateWalletBalance: r.validateWalletBalance,
        validateModelCostRates: r.validateModelCostRates,
        ragService: r.ragService,
        embeddingClient: r.embeddingClient,
        enqueueModelCall: createMockBoundEnqueueModelCall(),
        calculateAffordability: buildMockBoundCalculateAffordabilityFn(),
    };
}

/**
 * Helper: Creates mock IJobContext with the same production utility bindings as
 * `createMockJobContextParams` (including the eight EMCAS pure utilities from `_shared/utils/`).
 */
export function createMockRootContext(overrides?: JobContextParamsOverrides): IJobContext {
    return createJobContext(createMockJobContextParams(overrides));
}