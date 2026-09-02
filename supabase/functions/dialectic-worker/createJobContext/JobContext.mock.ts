// supabase/functions/dialectic-worker/createJobContext/JobContext.mock.ts

import { JobContextParams, IJobContext, IPlanJobContext, IRenderJobContext } from './JobContext.interface.ts';
import { MockFileManagerService } from '../../_shared/services/file_manager.mock.ts';
import { createMockAdminTokenWalletService } from '../../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts';
import { createMockUserTokenWalletService } from '../../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts';
import { buildIDocumentRenderer } from '../../_shared/services/document_renderer/renderDocument/renderDocument.mock.ts';
import { buildIPromptAssembler } from '../../_shared/prompt-assembler/prompt-assembler.mock.ts';
import { mockNotificationService } from '../../_shared/utils/notification.service.mock.ts';
import { MockLogger } from '../../_shared/logger.mock.ts';
import { createMockDownloadFromStorage } from '../../_shared/supabase_storage_utils.mock.ts';
import { mockSendMessageStream } from '../../_shared/ai_service/ai_provider.mock.ts';
import { createMockFindSourceDocuments } from '../findSourceDocuments.mock.ts';
import { extractSourceGroupFragment } from '../../_shared/utils/path_utils.ts';
import { pickLatest } from '../../_shared/utils/pickLatest.ts';
import { applyInputsRequiredScope } from '../../_shared/utils/applyInputsRequiredScope.ts';
import { validateWalletBalance } from '../../_shared/utils/validateWalletBalance.ts';
import { validateModelCostRates } from '../../_shared/utils/validateModelCostRates.ts';
import type { ITextSplitter } from '../../_shared/utils/text_splitter.interface.ts';
import type { CountTokensDeps } from '../../_shared/types/tokenizer.types.ts';
import type { ApiKeyForProviderFn } from '../../_shared/types.ts';
import { mockRetryJob, mockBoundRetryJobFn } from '../retryJob/retryJob.mock.ts';
import { mockPrepareModelJob, mockBoundPrepareModelJob, buildPrepareModelJobDeps } from '../prepareModelJob/prepareModelJob.mock.ts';
import { mockCompressPrompt, mockBoundCompressPrompt } from '../compressPrompt/compressPrompt.mock.ts';
import { mockCalculateAffordability, mockBoundCalculateAffordability, mockGetMaxOutputTokens } from '../calculateAffordability/calculateAffordability.mock.ts';
import { mockenqueueCompressJobsFn } from '../enqueueCompressJobs/enqueueCompressJobs.mock.ts';
import { mockGetSortedCompressionCandidates } from '../../_shared/utils/vector_utils/vector_utils.mock.ts';
import { mockApplyCompressionOverlay } from '../applyCompressionOverlay/applyCompressionOverlay.mock.ts';
import { mockGatherArtifacts, mockBoundGatherArtifacts } from '../gatherArtifacts/gatherArtifacts.mock.ts';
import { mockEnqueueModelCallFn, mockBoundEnqueueModelCallFn } from '../enqueueModelCall/enqueueModelCall.mock.ts';
import { buildCountTokensDeps, createMockCountTokens } from '../../_shared/utils/tokenizer_utils.mock.ts';
import { mockComputeJobSig } from '../../_shared/utils/computeJobSig/computeJobSig.mock.ts';
import { mockConstructStoragePath } from '../../_shared/utils/path_constructor.mock.ts';
import { mockAssembleContributionChain } from '../../_shared/services/document_renderer/assembleContributionChain/assembleContributionChain.mock.ts';
import { mockLoadDocumentTemplate } from '../../_shared/services/document_renderer/loadDocumentTemplate/loadDocumentTemplate.mock.ts';
import { mockMergeChunkContent } from '../../_shared/services/document_renderer/mergeChunkContent/mergeChunkContent.mock.ts';
import { mockResolveCompressionSource } from '../../_shared/utils/resolveCompressionSource/resolveCompressionSource.mock.ts';

// --- JobContextParams ---

export type JobContextParamsOverrides = Partial<JobContextParams>;

export function buildJobContextParams(overrides?: JobContextParamsOverrides): JobContextParams {
    const fileManager = new MockFileManagerService();
    const adminTokenWalletService = createMockAdminTokenWalletService().instance;
    const userTokenWalletService = createMockUserTokenWalletService().instance;
    const documentRenderer = buildIDocumentRenderer();
    const promptAssembler = buildIPromptAssembler();
    const logger = new MockLogger();
    const mockDownloadFn = createMockDownloadFromStorage({ mode: 'success', data: new ArrayBuffer(0) });
    const findSourceDocuments = createMockFindSourceDocuments({ mode: 'empty' });
    const textSplitter: ITextSplitter = {
        splitText: async () => [],
    };
    const tokenizerDeps: CountTokensDeps = buildCountTokensDeps();
    const apiKeyForProvider: ApiKeyForProviderFn = () => null;
    const base: JobContextParams = {
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
        countTokens: createMockCountTokens(),
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
        assembleContributionChain: mockAssembleContributionChain,
        loadDocumentTemplate: mockLoadDocumentTemplate,
        mergeChunkContent: mockMergeChunkContent,
        retryJob: mockRetryJob,
        gatherArtifacts: mockGatherArtifacts,
        prepareModelJob: mockPrepareModelJob,
        enqueueModelCall: mockEnqueueModelCallFn,
        pickLatest: pickLatest,
        applyInputsRequiredScope: applyInputsRequiredScope,
        validateWalletBalance: validateWalletBalance,
        validateModelCostRates: validateModelCostRates,
        getMaxOutputTokens: mockGetMaxOutputTokens,
        computeJobSig: mockComputeJobSig,
        compressPrompt: mockCompressPrompt,
        calculateAffordability: mockCalculateAffordability,
        enqueueCompressJobs: mockenqueueCompressJobsFn,
        getSortedCompressionCandidates: mockGetSortedCompressionCandidates,
        applyCompressionOverlay: mockApplyCompressionOverlay,
        textSplitter: textSplitter,
        constructStoragePath: mockConstructStoragePath,
        tokenizerDeps: tokenizerDeps,
        netlifyQueueUrl: 'https://mock-netlify-queue.example.com',
        netlifyApiKey: 'mock-netlify-api-key',
        apiKeyForProvider: apiKeyForProvider,
        resolveCompressionSource: mockResolveCompressionSource,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type JobContextParamsCorruptions = { [K in keyof JobContextParams]?: unknown };

export function invalidateJobContextParams(corruptions: JobContextParamsCorruptions): unknown {
    return { ...buildJobContextParams(), ...corruptions };
}

// --- IJobContext ---

export type IJobContextOverrides = Partial<IJobContext>;

export function buildIJobContext(): IJobContext {
    const params = buildJobContextParams();
    return {
        logger: params.logger,
        fileManager: params.fileManager,
        downloadFromStorage: params.downloadFromStorage,
        deleteFromStorage: params.deleteFromStorage,
        getAiProviderAdapter: params.getAiProviderAdapter,
        getAiProviderConfig: params.getAiProviderConfig,
        countTokens: params.countTokens,
        adminTokenWalletService: params.adminTokenWalletService,
        userTokenWalletService: params.userTokenWalletService,
        notificationService: params.notificationService,
        promptAssembler: params.promptAssembler,
        getSeedPromptForStage: params.getSeedPromptForStage,
        gatherArtifacts: mockBoundGatherArtifacts,
        enqueueModelCall: mockBoundEnqueueModelCallFn,
        retryJob: mockBoundRetryJobFn,
        pickLatest: params.pickLatest,
        applyInputsRequiredScope: params.applyInputsRequiredScope,
        validateWalletBalance: params.validateWalletBalance,
        validateModelCostRates: params.validateModelCostRates,
        getMaxOutputTokens: params.getMaxOutputTokens,
        getGranularityPlanner: params.getGranularityPlanner,
        planComplexStage: params.planComplexStage,
        findSourceDocuments: params.findSourceDocuments,
        documentRenderer: params.documentRenderer,
        assembleContributionChain: mockAssembleContributionChain,
        loadDocumentTemplate: mockLoadDocumentTemplate,
        mergeChunkContent: params.mergeChunkContent,
        prepareModelJob: mockBoundPrepareModelJob,
        computeJobSig: params.computeJobSig,
        calculateAffordability: mockBoundCalculateAffordability,
        compressPrompt: mockBoundCompressPrompt,
    };
}

export type IJobContextCorruptions = { [K in keyof IJobContext]?: unknown };

export function invalidateIJobContext(corruptions: IJobContextCorruptions): unknown {
    return { ...buildIJobContext(), ...corruptions };
}

// --- Context slice builders ---

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
        assembleContributionChain: r.assembleContributionChain,
        loadDocumentTemplate: r.loadDocumentTemplate,
        mergeChunkContent: r.mergeChunkContent,
    };
}
