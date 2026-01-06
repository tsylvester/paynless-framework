// supabase/functions/dialectic-worker/type-guards/JobContexts.type_guards.test.ts

import { describe, it } from 'https://deno.land/std@0.170.0/testing/bdd.ts';
import { assertEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import {
    isILoggerContext,
    isIFileContext,
    isIModelContext,
    isIRagContext,
    isITokenContext,
    isINotificationContext,
    isIExecuteJobContext,
    isIPlanJobContext,
    isIRenderJobContext,
    isIJobContext,
} from './JobContext.type_guards.ts';

describe('JobContexts Type Guards', () => {
    describe('isILoggerContext', () => {
        it('returns true for valid logger context', () => {
            const mockLogger = {
                info: () => {},
                warn: () => {},
                error: () => {},
                debug: () => {},
            };
            const context = { logger: mockLogger };

            assertEquals(isILoggerContext(context), true);
        });

        it('returns false for missing logger', () => {
            const context = {};

            assertEquals(isILoggerContext(context), false);
        });
    });

    describe('isIFileContext', () => {
        it('returns true for valid file context', () => {
            const mockFileManager = { upload: () => {}, download: () => {} };
            const mockDownloadFromStorage = () => Promise.resolve({ data: null, error: null });
            const mockDeleteFromStorage = () => Promise.resolve({ error: null });

            const context = {
                fileManager: mockFileManager,
                downloadFromStorage: mockDownloadFromStorage,
                deleteFromStorage: mockDeleteFromStorage,
            };

            assertEquals(isIFileContext(context), true);
        });

        it('returns false for partial file context', () => {
            const mockFileManager = { upload: () => {}, download: () => {} };
            const context = { fileManager: mockFileManager };

            assertEquals(isIFileContext(context), false);
        });
    });

    describe('isIModelContext', () => {
        it('returns true for valid model context with all three fields', () => {
            const mockCallUnifiedAIModel = () => Promise.resolve({ content: '', error: null });
            const mockGetAiProviderAdapter = () => null;
            const mockGetAiProviderConfig = () => Promise.resolve({} as any);

            const context = {
                callUnifiedAIModel: mockCallUnifiedAIModel,
                getAiProviderAdapter: mockGetAiProviderAdapter,
                getAiProviderConfig: mockGetAiProviderConfig,
            };

            assertEquals(isIModelContext(context), true);
        });
    });

    describe('isIRagContext', () => {
        it('returns true for valid RAG context with all four fields', () => {
            const mockRagService = { search: () => {} };
            const mockIndexingService = { index: () => {} };
            const mockEmbeddingClient = { embed: () => {} };
            const mockCountTokens = () => 0;

            const context = {
                ragService: mockRagService,
                indexingService: mockIndexingService,
                embeddingClient: mockEmbeddingClient,
                countTokens: mockCountTokens,
            };

            assertEquals(isIRagContext(context), true);
        });
    });

    describe('isITokenContext', () => {
        it('returns true for valid token context', () => {
            const mockTokenWalletService = { debit: () => {}, credit: () => {} };
            const context = { tokenWalletService: mockTokenWalletService };

            assertEquals(isITokenContext(context), true);
        });
    });

    describe('isINotificationContext', () => {
        it('returns true for valid notification context', () => {
            const mockNotificationService = { send: () => {} };
            const context = { notificationService: mockNotificationService };

            assertEquals(isINotificationContext(context), true);
        });
    });

    describe('isIExecuteJobContext', () => {
        it('returns true for valid execute context with all required fields', () => {
            const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
            const mockFileManager = { upload: () => {}, download: () => {} };
            const mockDownloadFromStorage = () => Promise.resolve({ data: null, error: null });
            const mockDeleteFromStorage = () => Promise.resolve({ error: null });
            const mockCallUnifiedAIModel = () => Promise.resolve({ content: '', error: null });
            const mockGetAiProviderAdapter = () => null;
            const mockGetAiProviderConfig = () => Promise.resolve({} as any);
            const mockRagService = { search: () => {} };
            const mockIndexingService = { index: () => {} };
            const mockEmbeddingClient = { embed: () => {} };
            const mockCountTokens = () => 0;
            const mockTokenWalletService = { debit: () => {}, credit: () => {} };
            const mockNotificationService = { send: () => {} };
            const mockGetSeedPromptForStage = () => Promise.resolve({ content: '', fullPath: '', bucket: '', path: '', fileName: '' });
            const mockPromptAssembler = { assemble: () => {} };
            const mockGetExtensionFromMimeType = () => '.txt';
            const mockRandomUUID = () => 'uuid';
            const mockShouldEnqueueRenderJob = () => Promise.resolve({ shouldRender: false, reason: 'is_json' as const });
            const mockContinueJob = () => Promise.resolve({ enqueued: false });
            const mockRetryJob = () => Promise.resolve({});

            const context = {
                logger: mockLogger,
                fileManager: mockFileManager,
                downloadFromStorage: mockDownloadFromStorage,
                deleteFromStorage: mockDeleteFromStorage,
                callUnifiedAIModel: mockCallUnifiedAIModel,
                getAiProviderAdapter: mockGetAiProviderAdapter,
                getAiProviderConfig: mockGetAiProviderConfig,
                ragService: mockRagService,
                indexingService: mockIndexingService,
                embeddingClient: mockEmbeddingClient,
                countTokens: mockCountTokens,
                tokenWalletService: mockTokenWalletService,
                notificationService: mockNotificationService,
                getSeedPromptForStage: mockGetSeedPromptForStage,
                promptAssembler: mockPromptAssembler,
                getExtensionFromMimeType: mockGetExtensionFromMimeType,
                randomUUID: mockRandomUUID,
                shouldEnqueueRenderJob: mockShouldEnqueueRenderJob,
                continueJob: mockContinueJob,
                retryJob: mockRetryJob,
            };

            assertEquals(isIExecuteJobContext(context), true);
        });

        it('returns false for partial execute context missing base context fields', () => {
            const mockGetSeedPromptForStage = () => Promise.resolve({ content: '', fullPath: '', bucket: '', path: '', fileName: '' });
            const mockPromptAssembler = { assemble: () => {} };
            const mockGetExtensionFromMimeType = () => '.txt';
            const mockRandomUUID = () => 'uuid';
            const mockShouldEnqueueRenderJob = () => Promise.resolve({ shouldRender: false, reason: 'is_json' as const });

            const context = {
                getSeedPromptForStage: mockGetSeedPromptForStage,
                promptAssembler: mockPromptAssembler,
                getExtensionFromMimeType: mockGetExtensionFromMimeType,
                randomUUID: mockRandomUUID,
                shouldEnqueueRenderJob: mockShouldEnqueueRenderJob,
            };

            assertEquals(isIExecuteJobContext(context), false);
        });

        it('returns false for partial execute context missing EXECUTE-specific fields', () => {
            const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
            const mockFileManager = { upload: () => {}, download: () => {} };
            const mockDownloadFromStorage = () => Promise.resolve({ data: null, error: null });
            const mockDeleteFromStorage = () => Promise.resolve({ error: null });
            const mockCallUnifiedAIModel = () => Promise.resolve({ content: '', error: null });
            const mockGetAiProviderAdapter = () => null;
            const mockGetAiProviderConfig = () => Promise.resolve({} as any);
            const mockRagService = { search: () => {} };
            const mockIndexingService = { index: () => {} };
            const mockEmbeddingClient = { embed: () => {} };
            const mockCountTokens = () => 0;
            const mockTokenWalletService = { debit: () => {}, credit: () => {} };
            const mockNotificationService = { send: () => {} };

            const context = {
                logger: mockLogger,
                fileManager: mockFileManager,
                downloadFromStorage: mockDownloadFromStorage,
                deleteFromStorage: mockDeleteFromStorage,
                callUnifiedAIModel: mockCallUnifiedAIModel,
                getAiProviderAdapter: mockGetAiProviderAdapter,
                getAiProviderConfig: mockGetAiProviderConfig,
                ragService: mockRagService,
                indexingService: mockIndexingService,
                embeddingClient: mockEmbeddingClient,
                countTokens: mockCountTokens,
                tokenWalletService: mockTokenWalletService,
                notificationService: mockNotificationService,
            };

            assertEquals(isIExecuteJobContext(context), false);
        });
    });

    describe('isIPlanJobContext', () => {
        it('returns true for valid plan context', () => {
            const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
            const mockGetGranularityPlanner = () => () => [];
            const mockPlanComplexStage = () => Promise.resolve([]);

            const context = {
                logger: mockLogger,
                getGranularityPlanner: mockGetGranularityPlanner,
                planComplexStage: mockPlanComplexStage,
            };

            assertEquals(isIPlanJobContext(context), true);
        });

        it('returns false for partial plan context', () => {
            const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

            const context = {
                logger: mockLogger,
            };

            assertEquals(isIPlanJobContext(context), false);
        });
    });

    describe('isIRenderJobContext', () => {
        it('returns true for valid render context', () => {
            const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
            const mockFileManager = { upload: () => {}, download: () => {} };
            const mockDownloadFromStorage = () => Promise.resolve({ data: null, error: null });
            const mockDeleteFromStorage = () => Promise.resolve({ error: null });
            const mockNotificationService = { send: () => {} };
            const mockDocumentRenderer = { render: () => {} };

            const context = {
                logger: mockLogger,
                fileManager: mockFileManager,
                downloadFromStorage: mockDownloadFromStorage,
                deleteFromStorage: mockDeleteFromStorage,
                notificationService: mockNotificationService,
                documentRenderer: mockDocumentRenderer,
            };

            assertEquals(isIRenderJobContext(context), true);
        });

        it('returns false for partial render context', () => {
            const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
            const mockFileManager = { upload: () => {}, download: () => {} };
            const mockDownloadFromStorage = () => Promise.resolve({ data: null, error: null });
            const mockDeleteFromStorage = () => Promise.resolve({ error: null });
            const mockNotificationService = { send: () => {} };

            const context = {
                logger: mockLogger,
                fileManager: mockFileManager,
                downloadFromStorage: mockDownloadFromStorage,
                deleteFromStorage: mockDeleteFromStorage,
                notificationService: mockNotificationService,
            };

            assertEquals(isIRenderJobContext(context), false);
        });
    });

    describe('isIJobContext', () => {
        it('returns true for valid root context with all fields from all composed contexts plus orchestration utilities', () => {
            const mockLogger = { info: () => {}, error: () => {}, warn: () => {} };
            const mockFileManager = { upload: () => {}, download: () => {} };
            const mockDownloadFromStorage = () => Promise.resolve({ data: null, error: null });
            const mockDeleteFromStorage = () => Promise.resolve({ error: null });
            const mockCallUnifiedAIModel = () => Promise.resolve({});
            const mockGetAiProviderAdapter = () => ({});
            const mockGetAiProviderConfig = () => Promise.resolve({});
            const mockRagService = { query: () => {} };
            const mockIndexingService = { index: () => {} };
            const mockEmbeddingClient = { embed: () => {} };
            const mockCountTokens = () => 0;
            const mockTokenWalletService = { debit: () => {}, credit: () => {} };
            const mockNotificationService = { send: () => {} };
            const mockGetSeedPromptForStage = () => Promise.resolve({ seedPromptText: '', resourceDescriptions: [] });
            const mockPromptAssembler = { assemble: () => {} };
            const mockGetExtensionFromMimeType = () => '.txt';
            const mockRandomUUID = () => 'uuid';
            const mockShouldEnqueueRenderJob = () => Promise.resolve({ shouldEnqueue: false });
            const mockGetGranularityPlanner = () => () => Promise.resolve({ chunks: [] });
            const mockPlanComplexStage = () => Promise.resolve([]);
            const mockDocumentRenderer = { render: () => {} };
            const mockContinueJob = () => Promise.resolve();
            const mockRetryJob = () => Promise.resolve();
            const mockExecuteModelCallAndSave = () => Promise.resolve();

            const context = {
                logger: mockLogger,
                fileManager: mockFileManager,
                downloadFromStorage: mockDownloadFromStorage,
                deleteFromStorage: mockDeleteFromStorage,
                callUnifiedAIModel: mockCallUnifiedAIModel,
                getAiProviderAdapter: mockGetAiProviderAdapter,
                getAiProviderConfig: mockGetAiProviderConfig,
                ragService: mockRagService,
                indexingService: mockIndexingService,
                embeddingClient: mockEmbeddingClient,
                countTokens: mockCountTokens,
                tokenWalletService: mockTokenWalletService,
                notificationService: mockNotificationService,
                getSeedPromptForStage: mockGetSeedPromptForStage,
                promptAssembler: mockPromptAssembler,
                getExtensionFromMimeType: mockGetExtensionFromMimeType,
                randomUUID: mockRandomUUID,
                shouldEnqueueRenderJob: mockShouldEnqueueRenderJob,
                getGranularityPlanner: mockGetGranularityPlanner,
                planComplexStage: mockPlanComplexStage,
                documentRenderer: mockDocumentRenderer,
                continueJob: mockContinueJob,
                retryJob: mockRetryJob,
                executeModelCallAndSave: mockExecuteModelCallAndSave,
            };

            assertEquals(isIJobContext(context), true);
        });

        it('returns false for root context missing base context fields', () => {
            const mockLogger = { info: () => {}, error: () => {}, warn: () => {} };
            const mockFileManager = { upload: () => {}, download: () => {} };
            const mockDownloadFromStorage = () => Promise.resolve({ data: null, error: null });
            const mockDeleteFromStorage = () => Promise.resolve({ error: null });
            const mockNotificationService = { send: () => {} };
            const mockGetSeedPromptForStage = () => Promise.resolve({ seedPromptText: '', resourceDescriptions: [] });
            const mockPromptAssembler = { assemble: () => {} };
            const mockGetExtensionFromMimeType = () => '.txt';
            const mockRandomUUID = () => 'uuid';
            const mockShouldEnqueueRenderJob = () => Promise.resolve({ shouldEnqueue: false });
            const mockGetGranularityPlanner = () => () => Promise.resolve({ chunks: [] });
            const mockPlanComplexStage = () => Promise.resolve([]);
            const mockDocumentRenderer = { render: () => {} };
            const mockContinueJob = () => Promise.resolve();
            const mockRetryJob = () => Promise.resolve();
            const mockExecuteModelCallAndSave = () => Promise.resolve();

            const contextMissingModelContext = {
                logger: mockLogger,
                fileManager: mockFileManager,
                downloadFromStorage: mockDownloadFromStorage,
                deleteFromStorage: mockDeleteFromStorage,
                notificationService: mockNotificationService,
                getSeedPromptForStage: mockGetSeedPromptForStage,
                promptAssembler: mockPromptAssembler,
                getExtensionFromMimeType: mockGetExtensionFromMimeType,
                randomUUID: mockRandomUUID,
                shouldEnqueueRenderJob: mockShouldEnqueueRenderJob,
                getGranularityPlanner: mockGetGranularityPlanner,
                planComplexStage: mockPlanComplexStage,
                documentRenderer: mockDocumentRenderer,
                continueJob: mockContinueJob,
                retryJob: mockRetryJob,
                executeModelCallAndSave: mockExecuteModelCallAndSave,
            };

            assertEquals(isIJobContext(contextMissingModelContext), false);
        });

        it('returns false for root context missing orchestration utilities', () => {
            const mockLogger = { info: () => {}, error: () => {}, warn: () => {} };
            const mockFileManager = { upload: () => {}, download: () => {} };
            const mockDownloadFromStorage = () => Promise.resolve({ data: null, error: null });
            const mockDeleteFromStorage = () => Promise.resolve({ error: null });
            const mockCallUnifiedAIModel = () => Promise.resolve({});
            const mockGetAiProviderAdapter = () => ({});
            const mockGetAiProviderConfig = () => Promise.resolve({});
            const mockRagService = { query: () => {} };
            const mockIndexingService = { index: () => {} };
            const mockEmbeddingClient = { embed: () => {} };
            const mockCountTokens = () => 0;
            const mockTokenWalletService = { debit: () => {}, credit: () => {} };
            const mockNotificationService = { send: () => {} };
            const mockGetSeedPromptForStage = () => Promise.resolve({ seedPromptText: '', resourceDescriptions: [] });
            const mockPromptAssembler = { assemble: () => {} };
            const mockGetExtensionFromMimeType = () => '.txt';
            const mockRandomUUID = () => 'uuid';
            const mockShouldEnqueueRenderJob = () => Promise.resolve({ shouldEnqueue: false });
            const mockGetGranularityPlanner = () => () => Promise.resolve({ chunks: [] });
            const mockPlanComplexStage = () => Promise.resolve([]);
            const mockDocumentRenderer = { render: () => {} };

            const contextMissingOrchestration = {
                logger: mockLogger,
                fileManager: mockFileManager,
                downloadFromStorage: mockDownloadFromStorage,
                deleteFromStorage: mockDeleteFromStorage,
                callUnifiedAIModel: mockCallUnifiedAIModel,
                getAiProviderAdapter: mockGetAiProviderAdapter,
                getAiProviderConfig: mockGetAiProviderConfig,
                ragService: mockRagService,
                indexingService: mockIndexingService,
                embeddingClient: mockEmbeddingClient,
                countTokens: mockCountTokens,
                tokenWalletService: mockTokenWalletService,
                notificationService: mockNotificationService,
                getSeedPromptForStage: mockGetSeedPromptForStage,
                promptAssembler: mockPromptAssembler,
                getExtensionFromMimeType: mockGetExtensionFromMimeType,
                randomUUID: mockRandomUUID,
                shouldEnqueueRenderJob: mockShouldEnqueueRenderJob,
                getGranularityPlanner: mockGetGranularityPlanner,
                planComplexStage: mockPlanComplexStage,
                documentRenderer: mockDocumentRenderer,
            };

            assertEquals(isIJobContext(contextMissingOrchestration), false);
        });
    });
});
