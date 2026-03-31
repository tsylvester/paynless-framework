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
    isIExecuteModelCallContext,
    isIPrepareModelJobContext,
    isIPlanJobContext,
    isIRenderJobContext,
    isIJobContext,
} from './JobContext.guard.ts';
import { createMockRootContext } from './JobContext.mock.ts';
import { createPlanJobContext, createRenderJobContext } from './createJobContext.ts';

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
        it('returns true for valid model context with getAiProviderAdapter and getAiProviderConfig', () => {
            const mockGetAiProviderAdapter = () => null;
            const mockGetAiProviderConfig = () => Promise.resolve({} as any);

            const context = {
                getAiProviderAdapter: mockGetAiProviderAdapter,
                getAiProviderConfig: mockGetAiProviderConfig,
            };

            assertEquals(isIModelContext(context), true);
        });

        it('returns true for object without callUnifiedAIModel — field no longer required', () => {
            const context = {
                getAiProviderAdapter: () => null,
                getAiProviderConfig: () => Promise.resolve({} as any),
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

    describe('isIExecuteModelCallContext', () => {
        it('returns true for valid object with all 12 IExecuteModelCallContext fields', () => {
            const rootContext = createMockRootContext();
            const context = {
                logger: rootContext.logger,
                fileManager: rootContext.fileManager,
                getAiProviderAdapter: rootContext.getAiProviderAdapter,
                tokenWalletService: rootContext.tokenWalletService,
                notificationService: rootContext.notificationService,
                continueJob: rootContext.continueJob,
                retryJob: rootContext.retryJob,
                resolveFinishReason: rootContext.resolveFinishReason,
                isIntermediateChunk: rootContext.isIntermediateChunk,
                determineContinuation: rootContext.determineContinuation,
                buildUploadContext: rootContext.buildUploadContext,
                debitTokens: rootContext.debitTokens,
            };

            assertEquals(isIExecuteModelCallContext(context), true);
        });

        it('returns false for object missing fileManager', () => {
            const rootContext = createMockRootContext();
            const context = {
                logger: rootContext.logger,
                getAiProviderAdapter: rootContext.getAiProviderAdapter,
                tokenWalletService: rootContext.tokenWalletService,
                notificationService: rootContext.notificationService,
                continueJob: rootContext.continueJob,
                retryJob: rootContext.retryJob,
                resolveFinishReason: rootContext.resolveFinishReason,
                isIntermediateChunk: rootContext.isIntermediateChunk,
                determineContinuation: rootContext.determineContinuation,
                buildUploadContext: rootContext.buildUploadContext,
                debitTokens: rootContext.debitTokens,
            };

            assertEquals(isIExecuteModelCallContext(context), false);
        });

        it('returns false for object missing debitTokens', () => {
            const rootContext = createMockRootContext();
            const context = {
                logger: rootContext.logger,
                fileManager: rootContext.fileManager,
                getAiProviderAdapter: rootContext.getAiProviderAdapter,
                tokenWalletService: rootContext.tokenWalletService,
                notificationService: rootContext.notificationService,
                continueJob: rootContext.continueJob,
                retryJob: rootContext.retryJob,
                resolveFinishReason: rootContext.resolveFinishReason,
                isIntermediateChunk: rootContext.isIntermediateChunk,
                determineContinuation: rootContext.determineContinuation,
                buildUploadContext: rootContext.buildUploadContext,
            };

            assertEquals(isIExecuteModelCallContext(context), false);
        });

        it('returns false for object missing getAiProviderAdapter', () => {
            const rootContext = createMockRootContext();
            const context = {
                logger: rootContext.logger,
                fileManager: rootContext.fileManager,
                tokenWalletService: rootContext.tokenWalletService,
                notificationService: rootContext.notificationService,
                continueJob: rootContext.continueJob,
                retryJob: rootContext.retryJob,
                resolveFinishReason: rootContext.resolveFinishReason,
                isIntermediateChunk: rootContext.isIntermediateChunk,
                determineContinuation: rootContext.determineContinuation,
                buildUploadContext: rootContext.buildUploadContext,
                debitTokens: rootContext.debitTokens,
            };

            assertEquals(isIExecuteModelCallContext(context), false);
        });

        it('returns false for object with Zone A-D fields but missing IExecuteModelCallContext fields', () => {
            const rootContext = createMockRootContext();
            // Zone A-D fields: ragService, pickLatest, downloadFromStorage, applyInputsRequiredScope,
            // countTokens, tokenWalletService, validateWalletBalance, validateModelCostRates, embeddingClient
            // Missing EMCAS fields: fileManager, getAiProviderAdapter, continueJob, retryJob,
            // resolveFinishReason, isIntermediateChunk, determineContinuation, buildUploadContext, debitTokens
            const context = {
                logger: rootContext.logger,
                ragService: rootContext.ragService,
                pickLatest: rootContext.pickLatest,
                downloadFromStorage: rootContext.downloadFromStorage,
                applyInputsRequiredScope: rootContext.applyInputsRequiredScope,
                countTokens: rootContext.countTokens,
                tokenWalletService: rootContext.tokenWalletService,
                validateWalletBalance: rootContext.validateWalletBalance,
                validateModelCostRates: rootContext.validateModelCostRates,
                embeddingClient: rootContext.embeddingClient,
                notificationService: rootContext.notificationService,
            };

            assertEquals(isIExecuteModelCallContext(context), false);
        });
    });

    describe('isIPrepareModelJobContext', () => {
        it('returns true for valid object with all 12 IPrepareModelJobContext fields', () => {
            const rootContext = createMockRootContext();
            const context = {
                logger: rootContext.logger,
                pickLatest: rootContext.pickLatest,
                downloadFromStorage: rootContext.downloadFromStorage,
                applyInputsRequiredScope: rootContext.applyInputsRequiredScope,
                countTokens: rootContext.countTokens,
                tokenWalletService: rootContext.tokenWalletService,
                validateWalletBalance: rootContext.validateWalletBalance,
                validateModelCostRates: rootContext.validateModelCostRates,
                ragService: rootContext.ragService,
                embeddingClient: rootContext.embeddingClient,
                executeModelCallAndSave: async () => ({}),
                enqueueRenderJob: async () => ({}),
            };

            assertEquals(isIPrepareModelJobContext(context), true);
        });

        it('returns false for object missing ragService', () => {
            const rootContext = createMockRootContext();
            const context = {
                logger: rootContext.logger,
                pickLatest: rootContext.pickLatest,
                downloadFromStorage: rootContext.downloadFromStorage,
                applyInputsRequiredScope: rootContext.applyInputsRequiredScope,
                countTokens: rootContext.countTokens,
                tokenWalletService: rootContext.tokenWalletService,
                validateWalletBalance: rootContext.validateWalletBalance,
                validateModelCostRates: rootContext.validateModelCostRates,
                embeddingClient: rootContext.embeddingClient,
                executeModelCallAndSave: async () => ({}),
                enqueueRenderJob: async () => ({}),
            };

            assertEquals(isIPrepareModelJobContext(context), false);
        });

        it('returns false for object missing executeModelCallAndSave (pre-bound)', () => {
            const rootContext = createMockRootContext();
            const context = {
                logger: rootContext.logger,
                pickLatest: rootContext.pickLatest,
                downloadFromStorage: rootContext.downloadFromStorage,
                applyInputsRequiredScope: rootContext.applyInputsRequiredScope,
                countTokens: rootContext.countTokens,
                tokenWalletService: rootContext.tokenWalletService,
                validateWalletBalance: rootContext.validateWalletBalance,
                validateModelCostRates: rootContext.validateModelCostRates,
                ragService: rootContext.ragService,
                embeddingClient: rootContext.embeddingClient,
                enqueueRenderJob: async () => ({}),
            };

            assertEquals(isIPrepareModelJobContext(context), false);
        });

        it('returns false for object missing enqueueRenderJob (pre-bound)', () => {
            const rootContext = createMockRootContext();
            const context = {
                logger: rootContext.logger,
                pickLatest: rootContext.pickLatest,
                downloadFromStorage: rootContext.downloadFromStorage,
                applyInputsRequiredScope: rootContext.applyInputsRequiredScope,
                countTokens: rootContext.countTokens,
                tokenWalletService: rootContext.tokenWalletService,
                validateWalletBalance: rootContext.validateWalletBalance,
                validateModelCostRates: rootContext.validateModelCostRates,
                ragService: rootContext.ragService,
                embeddingClient: rootContext.embeddingClient,
                executeModelCallAndSave: async () => ({}),
            };

            assertEquals(isIPrepareModelJobContext(context), false);
        });

        it('returns false for object with Zone E-G fields but missing IPrepareModelJobContext fields', () => {
            const rootContext = createMockRootContext();
            // Zone E-G fields: fileManager, getAiProviderAdapter, continueJob, retryJob,
            // resolveFinishReason, isIntermediateChunk, determineContinuation, buildUploadContext, debitTokens
            // Missing PMJ fields: pickLatest, downloadFromStorage, applyInputsRequiredScope,
            // countTokens, validateWalletBalance, validateModelCostRates, ragService, embeddingClient,
            // executeModelCallAndSave, enqueueRenderJob
            const context = {
                logger: rootContext.logger,
                fileManager: rootContext.fileManager,
                getAiProviderAdapter: rootContext.getAiProviderAdapter,
                tokenWalletService: rootContext.tokenWalletService,
                notificationService: rootContext.notificationService,
                continueJob: rootContext.continueJob,
                retryJob: rootContext.retryJob,
                resolveFinishReason: rootContext.resolveFinishReason,
                isIntermediateChunk: rootContext.isIntermediateChunk,
                determineContinuation: rootContext.determineContinuation,
                buildUploadContext: rootContext.buildUploadContext,
                debitTokens: rootContext.debitTokens,
            };

            assertEquals(isIPrepareModelJobContext(context), false);
        });
    });

    describe('isIPlanJobContext', () => {
        it('returns true for valid plan context', () => {
            const rootContext = createMockRootContext();
            const context = createPlanJobContext(rootContext);

            assertEquals(isIPlanJobContext(context), true);
        });

        it('returns false for partial plan context', () => {
            const rootContext = createMockRootContext();
            const context = {
                logger: rootContext.logger,
            };

            assertEquals(isIPlanJobContext(context), false);
        });
    });

    describe('isIRenderJobContext', () => {
        it('returns true for valid render context', () => {
            const rootContext = createMockRootContext();
            const context = createRenderJobContext(rootContext);

            assertEquals(isIRenderJobContext(context), true);
        });

        it('returns false for partial render context', () => {
            const rootContext = createMockRootContext();
            const context = {
                logger: rootContext.logger,
                fileManager: rootContext.fileManager,
                downloadFromStorage: rootContext.downloadFromStorage,
                deleteFromStorage: rootContext.deleteFromStorage,
                notificationService: rootContext.notificationService,
            };

            assertEquals(isIRenderJobContext(context), false);
        });
    });

    describe('isIJobContext', () => {
        it('returns true for valid root context with new context structure', () => {
            const context = createMockRootContext();

            assertEquals(isIJobContext(context), true);
        });

        it('returns false for root context missing model context fields', () => {
            const rootContext = createMockRootContext();
            // Remove model context fields — callUnifiedAIModel no longer exists on IJobContext
            const { getAiProviderAdapter, getAiProviderConfig, ...contextMissingModelContext } = rootContext;

            assertEquals(isIJobContext(contextMissingModelContext), false);
        });

        it('returns false when prepareModelJob is missing', () => {
            const rootContext = createMockRootContext();
            const { prepareModelJob, ...contextMissingPrepareModelJob } = rootContext;

            assertEquals(isIJobContext(contextMissingPrepareModelJob), false);
        });

        it('returns false when getSeedPromptForStage is missing', () => {
            const rootContext = createMockRootContext();
            const { getSeedPromptForStage, ...contextMissingSeed } = rootContext;

            assertEquals(isIJobContext(contextMissingSeed), false);
        });

        it('returns false for root context missing debitTokens', () => {
            const rootContext = createMockRootContext();
            const { debitTokens, ...contextMissingDebitTokens } = rootContext;

            assertEquals(isIJobContext(contextMissingDebitTokens), false);
        });
    });
});
