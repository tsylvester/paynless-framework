// supabase/functions/dialectic-worker/type-guards/JobContexts.type_guards.test.ts

import { describe, it } from 'https://deno.land/std@0.170.0/testing/bdd.ts';
import { assertEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import type { BoundDebitTokens } from '../../_shared/utils/debitTokens.interface.ts';
import {
    isILoggerContext,
    isIFileContext,
    isIModelContext,
    isIRagContext,
    isITokenContext,
    isINotificationContext,
    isIPrepareModelJobContext,
    isIPlanJobContext,
    isIRenderJobContext,
    isIJobContext,
    isISaveResponseContext,
} from './JobContext.guard.ts';
import {
    buildIJobContext,
    buildIPlanJobContext,
    buildIRenderJobContext,
} from './JobContext.mock.ts';
import { buildMockBoundCalculateAffordabilityFn } from '../calculateAffordability/calculateAffordability.mock.ts';

const mockBoundDebitTokens: BoundDebitTokens = async () => ({
    error: new Error('guard test stub'),
    retriable: false,
});

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
            const mockAdminWallet = { debit: () => {}, credit: () => {} };
            const mockUserWallet = { getBalance: () => {}, getWallet: () => {} };
            const context = {
                adminTokenWalletService: mockAdminWallet,
                userTokenWalletService: mockUserWallet,
            };

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

    describe('isIPrepareModelJobContext', () => {
        it('returns true for valid object with all 12 IPrepareModelJobContext fields', () => {
            const rootContext = buildIJobContext();
            const context = {
                logger: rootContext.logger,
                pickLatest: rootContext.pickLatest,
                downloadFromStorage: rootContext.downloadFromStorage,
                applyInputsRequiredScope: rootContext.applyInputsRequiredScope,
                countTokens: rootContext.countTokens,
                adminTokenWalletService: rootContext.adminTokenWalletService,
                validateWalletBalance: rootContext.validateWalletBalance,
                validateModelCostRates: rootContext.validateModelCostRates,
                ragService: rootContext.ragService,
                embeddingClient: rootContext.embeddingClient,
                enqueueModelCall: async () => ({}),
                calculateAffordability: buildMockBoundCalculateAffordabilityFn(),
            };

            assertEquals(isIPrepareModelJobContext(context), true);
        });

        it('returns false for object missing ragService', () => {
            const rootContext = buildIJobContext();
            const context = {
                logger: rootContext.logger,
                pickLatest: rootContext.pickLatest,
                downloadFromStorage: rootContext.downloadFromStorage,
                applyInputsRequiredScope: rootContext.applyInputsRequiredScope,
                countTokens: rootContext.countTokens,
                adminTokenWalletService: rootContext.adminTokenWalletService,
                validateWalletBalance: rootContext.validateWalletBalance,
                validateModelCostRates: rootContext.validateModelCostRates,
                embeddingClient: rootContext.embeddingClient,
                enqueueModelCall: async () => ({}),
            };

            assertEquals(isIPrepareModelJobContext(context), false);
        });

        it('returns false for object missing enqueueModelCall (pre-bound)', () => {
            const rootContext = buildIJobContext();
            const context = {
                logger: rootContext.logger,
                pickLatest: rootContext.pickLatest,
                downloadFromStorage: rootContext.downloadFromStorage,
                applyInputsRequiredScope: rootContext.applyInputsRequiredScope,
                countTokens: rootContext.countTokens,
                adminTokenWalletService: rootContext.adminTokenWalletService,
                validateWalletBalance: rootContext.validateWalletBalance,
                validateModelCostRates: rootContext.validateModelCostRates,
                ragService: rootContext.ragService,
                embeddingClient: rootContext.embeddingClient,
            };

            assertEquals(isIPrepareModelJobContext(context), false);
        });

        it('returns false for object missing enqueueModelCall (pre-bound)', () => {
            const rootContext = buildIJobContext();
            const context = {
                logger: rootContext.logger,
                applyInputsRequiredScope: rootContext.applyInputsRequiredScope,
                countTokens: rootContext.countTokens,
                adminTokenWalletService: rootContext.adminTokenWalletService,
                validateWalletBalance: rootContext.validateWalletBalance,
                validateModelCostRates: rootContext.validateModelCostRates,
                ragService: rootContext.ragService,
                embeddingClient: rootContext.embeddingClient,
                calculateAffordability: buildMockBoundCalculateAffordabilityFn(),
                // enqueueModelCall intentionally absent
            };

            assertEquals(isIPrepareModelJobContext(context), false);
        });

        it('returns false for object with Zone E-G fields but missing IPrepareModelJobContext fields', () => {
            const rootContext = buildIJobContext();
            // Zone E-G fields: fileManager, getAiProviderAdapter, continueJob, retryJob,
            // resolveFinishReason, isIntermediateChunk, determineContinuation, buildUploadContext, debitTokens
            // Missing PMJ fields: applyInputsRequiredScope,
            // countTokens, validateWalletBalance, validateModelCostRates, ragService, embeddingClient,
            // enqueueModelCall
            const context = {
                logger: rootContext.logger,
                fileManager: rootContext.fileManager,
                getAiProviderAdapter: rootContext.getAiProviderAdapter,
                userTokenWalletService: rootContext.userTokenWalletService,
                notificationService: rootContext.notificationService,
                continueJob: rootContext.continueJob,
                retryJob: rootContext.retryJob,
                resolveFinishReason: rootContext.resolveFinishReason,
                isIntermediateChunk: rootContext.isIntermediateChunk,
                determineContinuation: rootContext.determineContinuation,
                buildUploadContext: rootContext.buildUploadContext,
                debitTokens: mockBoundDebitTokens,
            };

            assertEquals(isIPrepareModelJobContext(context), false);
        });

        it('returns false for object missing calculateAffordability', () => {
            const rootContext = buildIJobContext();
            const context = {
                logger: rootContext.logger,
                pickLatest: rootContext.pickLatest,
                downloadFromStorage: rootContext.downloadFromStorage,
                applyInputsRequiredScope: rootContext.applyInputsRequiredScope,
                countTokens: rootContext.countTokens,
                adminTokenWalletService: rootContext.adminTokenWalletService,
                validateWalletBalance: rootContext.validateWalletBalance,
                validateModelCostRates: rootContext.validateModelCostRates,
                ragService: rootContext.ragService,
                embeddingClient: rootContext.embeddingClient,
                enqueueModelCall: async () => ({}),
            };

            assertEquals(isIPrepareModelJobContext(context), false);
        });

        it('returns false when calculateAffordability is present but not a function', () => {
            const rootContext = buildIJobContext();
            const context = {
                logger: rootContext.logger,
                pickLatest: rootContext.pickLatest,
                downloadFromStorage: rootContext.downloadFromStorage,
                applyInputsRequiredScope: rootContext.applyInputsRequiredScope,
                countTokens: rootContext.countTokens,
                adminTokenWalletService: rootContext.adminTokenWalletService,
                validateWalletBalance: rootContext.validateWalletBalance,
                validateModelCostRates: rootContext.validateModelCostRates,
                ragService: rootContext.ragService,
                embeddingClient: rootContext.embeddingClient,
                enqueueModelCall: async () => ({}),
                calculateAffordability: 'not-a-function',
            };

            assertEquals(isIPrepareModelJobContext(context), false);
        });

        it('returns true for object with enqueueRenderJob absent — enqueueRenderJob not required in prepareModelJob slice', () => {
            const rootContext = buildIJobContext();
            const context = {
                logger: rootContext.logger,
                applyInputsRequiredScope: rootContext.applyInputsRequiredScope,
                countTokens: rootContext.countTokens,
                adminTokenWalletService: rootContext.adminTokenWalletService,
                validateWalletBalance: rootContext.validateWalletBalance,
                validateModelCostRates: rootContext.validateModelCostRates,
                ragService: rootContext.ragService,
                embeddingClient: rootContext.embeddingClient,
                enqueueModelCall: async () => ({}),
                calculateAffordability: buildMockBoundCalculateAffordabilityFn(),
                // enqueueRenderJob intentionally absent — lives in back-half context slice only
            };

            assertEquals(isIPrepareModelJobContext(context), true);
        });
    });

    describe('isIPlanJobContext', () => {
        it('returns true for valid plan context', () => {
            const rootContext = buildIJobContext();
            const context = buildIPlanJobContext(rootContext);

            assertEquals(isIPlanJobContext(context), true);
        });

        it('returns false for partial plan context', () => {
            const rootContext = buildIJobContext();
            const context = {
                logger: rootContext.logger,
            };

            assertEquals(isIPlanJobContext(context), false);
        });
    });

    describe('isIRenderJobContext', () => {
        it('returns true for valid render context', () => {
            const rootContext = buildIJobContext();
            const context = buildIRenderJobContext(rootContext);

            assertEquals(isIRenderJobContext(context), true);
        });

        it('returns false for partial render context', () => {
            const rootContext = buildIJobContext();
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
            const context = buildIJobContext();

            assertEquals(isIJobContext(context), true);
        });

        it('returns false for root context missing model context fields', () => {
            const rootContext = buildIJobContext();
            // Remove model context fields — callUnifiedAIModel no longer exists on IJobContext
            const { getAiProviderAdapter, getAiProviderConfig, ...contextMissingModelContext } = rootContext;

            assertEquals(isIJobContext(contextMissingModelContext), false);
        });

        it('returns false when prepareModelJob is missing', () => {
            const rootContext = buildIJobContext();
            const { prepareModelJob, ...contextMissingPrepareModelJob } = rootContext;

            assertEquals(isIJobContext(contextMissingPrepareModelJob), false);
        });

        it('returns false when getSeedPromptForStage is missing', () => {
            const rootContext = buildIJobContext();
            const { getSeedPromptForStage, ...contextMissingSeed } = rootContext;

            assertEquals(isIJobContext(contextMissingSeed), false);
        });

        it('returns false for root context missing debitTokens', () => {
            const rootContext = buildIJobContext();
            const { debitTokens, ...contextMissingDebitTokens } = rootContext;

            assertEquals(isIJobContext(contextMissingDebitTokens), false);
        });

        it('returns false when sanitizeJsonContent is missing', () => {
            const rootContext = buildIJobContext();
            const { sanitizeJsonContent, ...contextMissing } = rootContext;

            assertEquals(isIJobContext(contextMissing), false);
        });

        it('returns false when sanitizeJsonContent is present but not a function', () => {
            const rootContext = buildIJobContext();
            const context = { ...rootContext, sanitizeJsonContent: 'not-a-function' };

            assertEquals(isIJobContext(context), false);
        });
    });

    describe('isIJobContext computeJobSig', () => {
        it('returns false when computeJobSig is missing', () => {
            const rootContext = buildIJobContext();
            const { computeJobSig, ...contextMissing } = rootContext;
            assertEquals(isIJobContext(contextMissing), false);
        });

        it('returns false when computeJobSig is not a function', () => {
            const rootContext = buildIJobContext();
            const context = { ...rootContext, computeJobSig: 'not-a-function' };
            assertEquals(isIJobContext(context), false);
        });
    });

    describe('isISaveResponseContext', () => {
        it('returns true for valid ISaveResponseContext with enqueueRenderJob and debitTokens as functions', () => {
            const context = {
                enqueueRenderJob: async () => ({}),
                debitTokens: mockBoundDebitTokens,
            };

            assertEquals(isISaveResponseContext(context), true);
        });

        it('returns false when enqueueRenderJob is absent', () => {
            const context = {};

            assertEquals(isISaveResponseContext(context), false);
        });

        it('returns false when enqueueRenderJob is not a function', () => {
            const context = { enqueueRenderJob: 'not-a-function' };

            assertEquals(isISaveResponseContext(context), false);
        });

        it('returns false when debitTokens is absent', () => {
            const context = { enqueueRenderJob: async () => ({}) };

            assertEquals(isISaveResponseContext(context), false);
        });

        it('returns false when debitTokens is not a function', () => {
            const context = {
                enqueueRenderJob: async () => ({}),
                debitTokens: 'not-a-function',
            };

            assertEquals(isISaveResponseContext(context), false);
        });
    });
});
