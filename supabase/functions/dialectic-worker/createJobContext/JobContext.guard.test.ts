// supabase/functions/dialectic-worker/type-guards/JobContexts.type_guards.test.ts

import { describe, it } from 'https://deno.land/std@0.170.0/testing/bdd.ts';
import { assertEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import {
    isILoggerContext,
    isIFileContext,
    isIModelContext,
    isITokenContext,
    isINotificationContext,
    isIPlanJobContext,
    isIRenderJobContext,
    isIJobContext,
} from './JobContext.guard.ts';
import {
    buildIJobContext,
    buildIPlanJobContext,
    buildIRenderJobContext,
    invalidateIJobContext,
} from './JobContext.mock.ts';

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

        it('returns false when assembleContributionChain is missing', () => {
            const rootContext = buildIJobContext();
            const { assembleContributionChain: _omit, ...context } = buildIRenderJobContext(rootContext);

            assertEquals(isIRenderJobContext(context), false);
        });

        it('returns false when loadDocumentTemplate is missing', () => {
            const rootContext = buildIJobContext();
            const { loadDocumentTemplate: _omit, ...context } = buildIRenderJobContext(rootContext);

            assertEquals(isIRenderJobContext(context), false);
        });

        it('returns false when mergeChunkContent is missing', () => {
            const rootContext = buildIJobContext();
            const { mergeChunkContent: _omit, ...context } = buildIRenderJobContext(rootContext);

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

        it('returns false when enqueueModelCall is missing', () => {
            const rootContext = buildIJobContext();
            const { enqueueModelCall, ...contextMissing } = rootContext;

            assertEquals(isIJobContext(contextMissing), false);
        });

        it('returns false when getSeedPromptForStage is missing', () => {
            const rootContext = buildIJobContext();
            const { getSeedPromptForStage, ...contextMissingSeed } = rootContext;

            assertEquals(isIJobContext(contextMissingSeed), false);
        });

        it('returns false when retryJob is missing', () => {
            const rootContext = buildIJobContext();
            const { retryJob, ...contextMissing } = rootContext;

            assertEquals(isIJobContext(contextMissing), false);
        });

        it('returns false when retryJob is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ retryJob: 'not-a-function' })), false);
        });

        it('returns false when getMaxOutputTokens is missing', () => {
            const rootContext = buildIJobContext();
            const { getMaxOutputTokens, ...contextMissingGetMaxOutputTokens } = rootContext;

            assertEquals(isIJobContext(contextMissingGetMaxOutputTokens), false);
        });

        it('returns false when getMaxOutputTokens is not a function', () => {
            const rootContext = buildIJobContext();
            const context = { ...rootContext, getMaxOutputTokens: 'not-a-function' };

            assertEquals(isIJobContext(context), false);
        });

        it('returns false when enqueueModelCall is not a function', () => {
            const rootContext = buildIJobContext();
            const context = { ...rootContext, enqueueModelCall: 'not-a-function' };

            assertEquals(isIJobContext(context), false);
        });

        // ── Non-objects rejected ──

        it('returns false for null, undefined, primitives, and arrays', () => {
            assertEquals(isIJobContext(null), false);
            assertEquals(isIJobContext(undefined), false);
            assertEquals(isIJobContext(42), false);
            assertEquals(isIJobContext('string'), false);
            assertEquals(isIJobContext([]), false);
        });

        // ── Each property corrupted in turn rejected ──

        it('returns false when logger is corrupted', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ logger: 'not-an-object' })), false);
        });

        it('returns false when notificationService is corrupted', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ notificationService: 'not-an-object' })), false);
        });

        it('returns false when getGranularityPlanner is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ getGranularityPlanner: 'not-a-function' })), false);
        });

        it('returns false when planComplexStage is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ planComplexStage: 'not-a-function' })), false);
        });

        it('returns false when findSourceDocuments is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ findSourceDocuments: 'not-a-function' })), false);
        });

        it('returns false when fileManager is corrupted', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ fileManager: 'not-an-object' })), false);
        });

        it('returns false when downloadFromStorage is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ downloadFromStorage: 'not-a-function' })), false);
        });

        it('returns false when deleteFromStorage is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ deleteFromStorage: 'not-a-function' })), false);
        });

        it('returns false when documentRenderer is corrupted', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ documentRenderer: 'not-an-object' })), false);
        });

        it('returns false when assembleContributionChain is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ assembleContributionChain: 'not-a-function' })), false);
        });

        it('returns false when loadDocumentTemplate is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ loadDocumentTemplate: 'not-a-function' })), false);
        });

        it('returns false when mergeChunkContent is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ mergeChunkContent: 'not-a-function' })), false);
        });

        it('returns false when getAiProviderAdapter is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ getAiProviderAdapter: 'not-a-function' })), false);
        });

        it('returns false when getAiProviderConfig is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ getAiProviderConfig: 'not-a-function' })), false);
        });

        it('returns false when countTokens is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ countTokens: 'not-a-function' })), false);
        });

        it('returns false when adminTokenWalletService is corrupted', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ adminTokenWalletService: 'not-an-object' })), false);
        });

        it('returns false when userTokenWalletService is corrupted', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ userTokenWalletService: 'not-an-object' })), false);
        });

        it('returns false when pickLatest is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ pickLatest: 'not-a-function' })), false);
        });

        it('returns false when applyInputsRequiredScope is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ applyInputsRequiredScope: 'not-a-function' })), false);
        });

        it('returns false when validateWalletBalance is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ validateWalletBalance: 'not-a-function' })), false);
        });

        it('returns false when validateModelCostRates is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ validateModelCostRates: 'not-a-function' })), false);
        });

        it('returns false when promptAssembler is corrupted', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ promptAssembler: 'not-an-object' })), false);
        });

        it('returns false when getSeedPromptForStage is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ getSeedPromptForStage: 'not-a-function' })), false);
        });

        it('returns false when gatherArtifacts is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ gatherArtifacts: 'not-a-function' })), false);
        });

        it('returns false when prepareModelJob is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ prepareModelJob: 'not-a-function' })), false);
        });

        it('returns false when calculateAffordability is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ calculateAffordability: 'not-a-function' })), false);
        });

        it('returns false when compressPrompt is not a function', () => {
            assertEquals(isIJobContext(invalidateIJobContext({ compressPrompt: 'not-a-function' })), false);
        });

        // ── Each required property omitted by rest-destructure rejected ──

        it('returns false when logger is missing', () => {
            const { logger: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when notificationService is missing', () => {
            const { notificationService: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when getGranularityPlanner is missing', () => {
            const { getGranularityPlanner: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when planComplexStage is missing', () => {
            const { planComplexStage: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when findSourceDocuments is missing', () => {
            const { findSourceDocuments: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when fileManager is missing', () => {
            const { fileManager: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when downloadFromStorage is missing', () => {
            const { downloadFromStorage: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when deleteFromStorage is missing', () => {
            const { deleteFromStorage: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when documentRenderer is missing', () => {
            const { documentRenderer: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when assembleContributionChain is missing', () => {
            const { assembleContributionChain: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when loadDocumentTemplate is missing', () => {
            const { loadDocumentTemplate: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when mergeChunkContent is missing', () => {
            const { mergeChunkContent: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when countTokens is missing', () => {
            const { countTokens: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when adminTokenWalletService is missing', () => {
            const { adminTokenWalletService: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when userTokenWalletService is missing', () => {
            const { userTokenWalletService: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when pickLatest is missing', () => {
            const { pickLatest: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when applyInputsRequiredScope is missing', () => {
            const { applyInputsRequiredScope: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when validateWalletBalance is missing', () => {
            const { validateWalletBalance: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when validateModelCostRates is missing', () => {
            const { validateModelCostRates: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when promptAssembler is missing', () => {
            const { promptAssembler: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when gatherArtifacts is missing', () => {
            const { gatherArtifacts: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when calculateAffordability is missing', () => {
            const { calculateAffordability: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
        });

        it('returns false when compressPrompt is missing', () => {
            const { compressPrompt: _omit, ...rest } = buildIJobContext();
            assertEquals(isIJobContext(rest), false);
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
});
