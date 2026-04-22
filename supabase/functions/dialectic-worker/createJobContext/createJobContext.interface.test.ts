// supabase/functions/dialectic-worker/createJobContext.interface.test.ts
//
// Contract-only: satisfies interfaces with plain objects and dependency mocks from their
// home modules. Does not import createJobContext.ts. Shared stream helper from JobContext.mock.ts.

import { describe, it } from 'https://deno.land/std@0.170.0/testing/bdd.ts';
import { assertEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { mockSendMessageStream } from '../../_shared/ai_service/ai_provider.mock.ts';
import { MockLogger } from '../../_shared/logger.mock.ts';
import { MockFileManagerService } from '../../_shared/services/file_manager.mock.ts';
import { MockRagService } from '../../_shared/services/rag_service.mock.ts';
import { MockIndexingService } from '../../_shared/services/indexing_service.mock.ts';
import { createMockAdminTokenWalletService } from '../../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts';
import { createMockUserTokenWalletService } from '../../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts';
import { createDocumentRendererMock } from '../../_shared/services/document_renderer.mock.ts';
import { MockPromptAssembler } from '../../_shared/prompt-assembler/prompt-assembler.mock.ts';
import { mockNotificationService } from '../../_shared/utils/notification.service.mock.ts';
import { createMockDownloadFromStorage } from '../../_shared/supabase_storage_utils.mock.ts';
import { extractSourceGroupFragment } from '../../_shared/utils/path_utils.ts';
import { pickLatest } from '../../_shared/utils/pickLatest.ts';
import { applyInputsRequiredScope } from '../../_shared/utils/applyInputsRequiredScope.ts';
import { validateWalletBalance } from '../../_shared/utils/validateWalletBalance.ts';
import { validateModelCostRates } from '../../_shared/utils/validateModelCostRates.ts';
import { resolveFinishReason } from '../../_shared/utils/resolveFinishReason.ts';
import { isIntermediateChunk } from '../../_shared/utils/isIntermediateChunk.ts';
import { determineContinuation } from '../../_shared/utils/determineContinuation/determineContinuation.ts';
import { buildUploadContext } from '../../_shared/utils/buildUploadContext/buildUploadContext.ts';
import type { BoundDebitTokens, DebitTokens } from '../../_shared/utils/debitTokens.interface.ts';
import { createMockFindSourceDocuments } from '../findSourceDocuments.mock.ts';
import { buildMockBoundCalculateAffordabilityFn } from '../calculateAffordability/calculateAffordability.mock.ts';
import {
    IFileContext,
    IJobContext,
    ILoggerContext,
    IModelContext,
    INotificationContext,
    IPlanJobContext,
    IPrepareModelJobContext,
    IRagContext,
    IRenderJobContext,
    ITokenContext,
    ISaveResponseContext,
    JobContextParams,
    BoundPrepareModelJobFn,
} from './JobContext.interface.ts';
import { BoundGatherArtifactsFn } from '../gatherArtifacts/gatherArtifacts.interface.ts';
import { BoundEnqueueModelCallFn } from '../enqueueModelCall/enqueueModelCall.interface.ts';
import { sanitizeJsonContent } from '../../_shared/utils/jsonSanitizer/jsonSanitizer.ts';

describe('JobContext.interface.ts contracts', () => {
    describe('ILoggerContext', () => {
        it('requires logger', () => {
            const ctx: ILoggerContext = { logger: new MockLogger() };
            assertEquals(typeof ctx.logger, 'object');
            assertEquals(ctx.logger === null, false);
        });
    });

    describe('IFileContext', () => {
        it('requires fileManager, downloadFromStorage, deleteFromStorage', () => {
            const ctx: IFileContext = {
                fileManager: new MockFileManagerService(),
                downloadFromStorage: createMockDownloadFromStorage({ mode: 'success', data: new ArrayBuffer(0) }),
                deleteFromStorage: async () => ({ error: null }),
            };
            assertEquals(typeof ctx.fileManager, 'object');
            assertEquals(ctx.fileManager === null, false);
            assertEquals(typeof ctx.downloadFromStorage, 'function');
            assertEquals(typeof ctx.deleteFromStorage, 'function');
        });
    });

    describe('IModelContext', () => {
        it('requires getAiProviderAdapter and getAiProviderConfig', () => {
            const ctx: IModelContext = {
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
            };
            assertEquals(typeof ctx.getAiProviderAdapter, 'function');
            assertEquals(typeof ctx.getAiProviderConfig, 'function');
        });
    });

    describe('IRagContext', () => {
        it('requires ragService, indexingService, embeddingClient, countTokens', () => {
            const ctx: IRagContext = {
                ragService: new MockRagService(),
                indexingService: new MockIndexingService(),
                embeddingClient: {
                    getEmbedding: async () => ({
                        embedding: [],
                        usage: { prompt_tokens: 0, total_tokens: 0 },
                    }),
                },
                countTokens: () => 0,
            };
            assertEquals(typeof ctx.ragService, 'object');
            assertEquals(ctx.ragService === null, false);
            assertEquals(typeof ctx.indexingService, 'object');
            assertEquals(ctx.indexingService === null, false);
            assertEquals(typeof ctx.embeddingClient, 'object');
            assertEquals(ctx.embeddingClient === null, false);
            assertEquals(typeof ctx.countTokens, 'function');
        });
    });

    describe('ITokenContext', () => {
        it('requires adminTokenWalletService and userTokenWalletService', () => {
            const ctx: ITokenContext = {
                adminTokenWalletService: createMockAdminTokenWalletService().instance,
                userTokenWalletService: createMockUserTokenWalletService().instance,
            };
            assertEquals(typeof ctx.adminTokenWalletService, 'object');
            assertEquals(ctx.adminTokenWalletService === null, false);
            assertEquals(typeof ctx.userTokenWalletService, 'object');
            assertEquals(ctx.userTokenWalletService === null, false);
        });
    });

    describe('INotificationContext', () => {
        it('requires notificationService', () => {
            const ctx: INotificationContext = { notificationService: mockNotificationService };
            assertEquals(typeof ctx.notificationService, 'object');
            assertEquals(ctx.notificationService === null, false);
        });
    });

    describe('IPrepareModelJobContext', () => {
        it('requires eleven members including enqueueModelCall, excluding enqueueRenderJob', () => {
            const logger = new MockLogger();
            const ragService = new MockRagService();
            const adminTokenWalletService = createMockAdminTokenWalletService().instance;
            const enqueueModelCall: BoundEnqueueModelCallFn = async () => ({
                error: new Error('interface test stub'),
                retriable: false,
            });
            const ctx: IPrepareModelJobContext = {
                logger: logger,
                applyInputsRequiredScope: applyInputsRequiredScope,
                countTokens: () => 0,
                adminTokenWalletService: adminTokenWalletService,
                validateWalletBalance: validateWalletBalance,
                validateModelCostRates: validateModelCostRates,
                ragService: ragService,
                embeddingClient: {
                    getEmbedding: async () => ({
                        embedding: [],
                        usage: { prompt_tokens: 0, total_tokens: 0 },
                    }),
                },
                enqueueModelCall: enqueueModelCall,
                calculateAffordability: buildMockBoundCalculateAffordabilityFn(),
            };
            assertEquals(typeof ctx.calculateAffordability, 'function');
            assertEquals(typeof ctx.enqueueModelCall, 'function');
        });
    });

    describe('IPlanJobContext', () => {
        it('extends logger and notification plus plan utilities', () => {
            const ctx: IPlanJobContext = {
                logger: new MockLogger(),
                notificationService: mockNotificationService,
                getGranularityPlanner: () => () => [],
                planComplexStage: async () => [],
                findSourceDocuments: createMockFindSourceDocuments({ mode: 'empty' }),
            };
            assertEquals(typeof ctx.getGranularityPlanner, 'function');
            assertEquals(typeof ctx.planComplexStage, 'function');
            assertEquals(typeof ctx.findSourceDocuments, 'function');
        });
    });

    describe('IRenderJobContext', () => {
        it('extends logger, file, notification, documentRenderer', () => {
            const documentRenderer = createDocumentRendererMock().renderer;
            const ctx: IRenderJobContext = {
                logger: new MockLogger(),
                fileManager: new MockFileManagerService(),
                downloadFromStorage: createMockDownloadFromStorage({ mode: 'success', data: new ArrayBuffer(0) }),
                deleteFromStorage: async () => ({ error: null }),
                notificationService: mockNotificationService,
                documentRenderer: documentRenderer,
            };
            assertEquals(typeof ctx.documentRenderer, 'object');
            assertEquals(ctx.documentRenderer === null, false);
        });
    });

    describe('JobContextParams and IJobContext', () => {
        it('JobContextParams lists every factory field; IJobContext maps those fields without createJobContext', () => {
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
                error: new Error('interface test stub'),
                retriable: false,
            });
            const debitTokens: DebitTokens = async () => ({
                error: new Error('interface test stub'),
                retriable: false,
            });
            const boundGatherArtifacts: BoundGatherArtifactsFn = async () => ({
                artifacts: [],
            });

            const params: JobContextParams = {
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
                sanitizeJsonContent: sanitizeJsonContent,
            };

            const job: IJobContext = {
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
                sanitizeJsonContent: params.sanitizeJsonContent,
            };

            assertEquals(typeof params.logger, 'object');
            assertEquals(typeof params.fileManager, 'object');
            assertEquals(typeof params.prepareModelJob, 'function');
            assertEquals(typeof job.prepareModelJob, 'function');
            assertEquals(job.logger, params.logger);
            assertEquals(job.ragService, params.ragService);
            assertEquals(typeof job.getGranularityPlanner, 'function');
        });
    });

    describe('ISaveResponseContext', () => {
        it('back-half context slice includes enqueueRenderJob and debitTokens', () => {
            const debitTokens: BoundDebitTokens = async () => ({
                error: new Error('interface test stub'),
                retriable: false,
            });
            const ctx: ISaveResponseContext = {
                enqueueRenderJob: async () => ({
                    error: new Error('interface test stub'),
                    retriable: false,
                }),
                debitTokens,
            };
            assertEquals(typeof ctx.enqueueRenderJob, 'function');
            assertEquals(typeof ctx.debitTokens, 'function');
        });
    });

    describe('sanitizeJsonContent', () => {
        it('JobContextParams requires sanitizeJsonContent typed as SanitizeJsonContentFn', () => {
            const fn: JobContextParams['sanitizeJsonContent'] = sanitizeJsonContent;
            assertEquals(typeof fn, 'function');
        });

        it('IJobContext requires sanitizeJsonContent typed as SanitizeJsonContentFn', () => {
            const fn: IJobContext['sanitizeJsonContent'] = sanitizeJsonContent;
            assertEquals(typeof fn, 'function');
        });
    });
});
