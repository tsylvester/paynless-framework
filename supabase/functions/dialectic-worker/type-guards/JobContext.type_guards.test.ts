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
import { createMockRootContext } from '../JobContext.mock.ts';
import { createExecuteJobContext, createPlanJobContext, createRenderJobContext } from '../createJobContext.ts';

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
            const rootContext = createMockRootContext();
            const context = createExecuteJobContext(rootContext);

            assertEquals(isIExecuteJobContext(context), true);
        });

        it('returns false for partial execute context missing base context fields', () => {
            const context = {
                getSeedPromptForStage: async () => ({ content: '', fullPath: '', bucket: '', path: '', fileName: '' }),
                promptAssembler: { assemble: () => {} },
                getExtensionFromMimeType: () => '.txt',
                extractSourceGroupFragment: () => 'test',
                randomUUID: () => 'uuid',
                shouldEnqueueRenderJob: async () => ({ shouldRender: false, reason: 'is_json' as const }),
            };

            assertEquals(isIExecuteJobContext(context), false);
        });

        it('returns false for partial execute context missing EXECUTE-specific fields', () => {
            const rootContext = createMockRootContext();
            const baseContext = {
                logger: rootContext.logger,
                fileManager: rootContext.fileManager,
                downloadFromStorage: rootContext.downloadFromStorage,
                deleteFromStorage: rootContext.deleteFromStorage,
                callUnifiedAIModel: rootContext.callUnifiedAIModel,
                getAiProviderAdapter: rootContext.getAiProviderAdapter,
                getAiProviderConfig: rootContext.getAiProviderConfig,
                ragService: rootContext.ragService,
                indexingService: rootContext.indexingService,
                embeddingClient: rootContext.embeddingClient,
                countTokens: rootContext.countTokens,
                tokenWalletService: rootContext.tokenWalletService,
                notificationService: rootContext.notificationService,
            };

            assertEquals(isIExecuteJobContext(baseContext), false);
        });

        it('returns false when extractSourceGroupFragment is missing', () => {
            const rootContext = createMockRootContext();
            const contextWithoutFragment = createExecuteJobContext(rootContext);
            // Remove extractSourceGroupFragment to test missing field
            const { extractSourceGroupFragment, ...context } = contextWithoutFragment;

            assertEquals(isIExecuteJobContext(context), false);
        });

        it('returns true when extractSourceGroupFragment is present and is a function', () => {
            const rootContext = createMockRootContext();
            const context = createExecuteJobContext(rootContext);

            assertEquals(isIExecuteJobContext(context), true);
        });

        it('returns false when extractSourceGroupFragment is not a function', () => {
            const rootContext = createMockRootContext();
            const contextWithInvalidFragment = createExecuteJobContext(rootContext);
            const context = {
                ...contextWithInvalidFragment,
                extractSourceGroupFragment: 'not-a-function' as unknown as typeof contextWithInvalidFragment.extractSourceGroupFragment,
            };

            assertEquals(isIExecuteJobContext(context), false);
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
        it('returns true for valid root context with all fields from all composed contexts plus orchestration utilities', () => {
            const context = createMockRootContext();

            assertEquals(isIJobContext(context), true);
        });

        it('returns false for root context missing base context fields', () => {
            const rootContext = createMockRootContext();
            // Remove model context fields to test missing base context
            const { callUnifiedAIModel, getAiProviderAdapter, getAiProviderConfig, ...contextMissingModelContext } = rootContext;

            assertEquals(isIJobContext(contextMissingModelContext), false);
        });

        it('returns false for root context missing orchestration utilities', () => {
            const rootContext = createMockRootContext();
            // Remove orchestration utilities to test missing fields
            const { continueJob, retryJob, executeModelCallAndSave, ...contextMissingOrchestration } = rootContext;

            assertEquals(isIJobContext(contextMissingOrchestration), false);
        });
    });
});
