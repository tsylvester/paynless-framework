// supabase/functions/dialectic-worker/JobContext.mock.ts

import { JobContextParams } from './JobContext.interface.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { MockIndexingService } from '../_shared/services/indexing_service.mock.ts';
import { createMockTokenWalletService } from '../_shared/services/tokenWalletService.mock.ts';
import { createDocumentRendererMock } from '../_shared/services/document_renderer.mock.ts';
import { MockPromptAssembler } from '../_shared/prompt-assembler/prompt-assembler.mock.ts';
import { mockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { MockLogger } from '../_shared/logger.mock.ts';
import { createMockDownloadFromStorage } from '../_shared/supabase_storage_utils.mock.ts';
import { IJobContext } from './JobContext.interface.ts';

/**
 * Helper: Creates mock JobContextParams with all required fields
 * Uses existing mock services from the codebase
 */
export function createMockJobContextParams(): JobContextParams {
    const fileManager = new MockFileManagerService();
    const ragService = new MockRagService();
    const indexingService = new MockIndexingService();
    const tokenWalletService = createMockTokenWalletService().instance;
    const documentRenderer = createDocumentRendererMock().renderer;
    const promptAssembler = new MockPromptAssembler();
    const logger = new MockLogger();
    const mockDownloadFn = createMockDownloadFromStorage({ mode: 'success', data: new ArrayBuffer(0) });

    return {
        logger: logger,
        fileManager: fileManager,
        downloadFromStorage: mockDownloadFn,
        deleteFromStorage: async () => ({ error: null }),
        callUnifiedAIModel: async () => ({
            content: '{"content": "AI response content"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 20,
            processingTimeMs: 100,
            rawProviderResponse: { mock: 'response' },
        }),
        getAiProviderAdapter: () => ({
            sendMessage: async () => ({
                role: 'assistant',
                content: 'mock',
                ai_provider_id: null,
                system_prompt_id: null,
                token_usage: null,
            }),
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
        tokenWalletService: tokenWalletService,
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
        randomUUID: () => 'test-uuid',
        shouldEnqueueRenderJob: async () => ({
            shouldRender: false,
            reason: 'is_json',
        }),
        getGranularityPlanner: () => () => [],
        planComplexStage: async () => [],
        documentRenderer: documentRenderer,
        continueJob: async () => ({ enqueued: false }),
        retryJob: async () => ({}),
        executeModelCallAndSave: async () => {},
    };
}

/**
 * Helper: Creates mock IJobContext with all 24 fields
 */
export function createMockRootContext(): IJobContext {
    const params = createMockJobContextParams();
    return {
        logger: params.logger,
        fileManager: params.fileManager,
        downloadFromStorage: params.downloadFromStorage,
        deleteFromStorage: params.deleteFromStorage,
        callUnifiedAIModel: params.callUnifiedAIModel,
        getAiProviderAdapter: params.getAiProviderAdapter,
        getAiProviderConfig: params.getAiProviderConfig,
        ragService: params.ragService,
        indexingService: params.indexingService,
        embeddingClient: params.embeddingClient,
        countTokens: params.countTokens,
        tokenWalletService: params.tokenWalletService,
        notificationService: params.notificationService,
        getSeedPromptForStage: params.getSeedPromptForStage,
        promptAssembler: params.promptAssembler,
        getExtensionFromMimeType: params.getExtensionFromMimeType,
        randomUUID: params.randomUUID,
        shouldEnqueueRenderJob: params.shouldEnqueueRenderJob,
        getGranularityPlanner: params.getGranularityPlanner,
        planComplexStage: params.planComplexStage,
        documentRenderer: params.documentRenderer,
        continueJob: params.continueJob,
        retryJob: params.retryJob,
        executeModelCallAndSave: params.executeModelCallAndSave,
    };
}