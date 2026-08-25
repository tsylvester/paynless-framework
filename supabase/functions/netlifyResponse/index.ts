import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import { createSupabaseAdminClient } from '../_shared/auth.ts';
import { logger } from '../_shared/logger.ts';
import { FileManagerService } from '../_shared/services/file_manager.ts';
import { NotificationService } from '../_shared/utils/notification.service.ts';
import { AdminTokenWalletService } from '../_shared/services/tokenwallet/admin/adminTokenWalletService.ts';
import { constructStoragePath } from '../_shared/utils/path_constructor.ts';
import { assembleChunks } from '../_shared/utils/assembleChunks/assembleChunks.ts';
import { continueJob } from '../dialectic-worker/continueJob/continueJob.ts';
import { retryJob, type BoundRetryJobFn } from '../dialectic-worker/retryJob/retryJob.provides.ts';
import { loadJobContext, type BoundLoadJobContextFn } from '../dialectic-worker/loadJobContext/loadJobContext.provides.ts';
import { assembleAiResponse, type BoundAssembleAiResponseFn } from '../dialectic-worker/assembleAiResponse/assembleAiResponse.provides.ts';
import { debitForResponse, type BoundDebitForResponseFn } from '../dialectic-worker/debitForResponse/debitForResponse.provides.ts';
import { prepareResponseContent, type BoundPrepareResponseContentFn } from '../dialectic-worker/prepareResponseContent/prepareResponseContent.provides.ts';
import { saveContributionResponse, type BoundSaveContributionResponseFn } from '../dialectic-worker/saveContributionResponse/saveContributionResponse.provides.ts';
import { saveCompressedResponse, type BoundSaveCompressedResponseFn } from '../dialectic-worker/saveCompressedResponse/saveCompressedResponse.provides.ts';
import { resolveContributionIdentity, type BoundResolveContributionIdentityFn } from '../dialectic-worker/resolveContributionIdentity/resolveContributionIdentity.provides.ts';
import { persistContributionRelationships, type BoundPersistContributionRelationshipsFn } from '../dialectic-worker/persistContributionRelationships/persistContributionRelationships.provides.ts';
import { finalizeContributionJob, type BoundFinalizeContributionJobFn } from '../dialectic-worker/finalizeContributionJob/finalizeContributionJob.provides.ts';
import { countTokens } from '../_shared/utils/tokenizer_utils.ts';
import type { BoundCountTokensFn, CountTokensDeps } from '../_shared/types/tokenizer.types.ts';
import type { BoundContinueJobFn } from '../dialectic-worker/continueJob/continueJob.interface.ts';
import { getEncoding as rawGetEncoding } from 'npm:js-tiktoken@1.0.7';
import { countTokens as countTokensAnthropic } from 'npm:@anthropic-ai/tokenizer@0.0.4';
import { isKnownTiktokenEncoding } from '../_shared/utils/type-guards/type_guards.chat.ts';
import { resolveFinishReason } from '../_shared/utils/resolveFinishReason.ts';
import { isIntermediateChunk } from '../_shared/utils/isIntermediateChunk.ts';
import { determineContinuation } from '../_shared/utils/determineContinuation/determineContinuation.ts';
import { buildUploadContext } from '../_shared/utils/buildUploadContext/buildUploadContext.ts';
import { sanitizeJsonContent } from '../_shared/utils/jsonSanitizer/jsonSanitizer.ts';
import { debitTokens } from '../_shared/utils/debitTokens.ts';
import type { BoundDebitTokens } from '../_shared/utils/debitTokens.interface.ts';
import { enqueueRenderJob } from '../dialectic-worker/enqueueRenderJob/enqueueRenderJob.ts';
import type { BoundEnqueueRenderJobFn } from '../dialectic-worker/enqueueRenderJob/enqueueRenderJob.interface.ts';
import { shouldEnqueueRenderJob } from '../_shared/utils/shouldEnqueueRenderJob.ts';
import { resolveTemplateFilename } from '../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts';
import type { BoundResolveTemplateFilenameFn } from '../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.interface.ts';
import { saveResponse, type SaveResponseDeps, type BoundSaveResponseFn } from '../dialectic-worker/saveResponse/saveResponse.provides.ts';
import { createComputeJobSig } from '../_shared/utils/computeJobSig/computeJobSig.ts';
import type { ComputeJobSig } from '../_shared/utils/computeJobSig/computeJobSig.interface.ts';
import type { NetlifyResponseDeps } from './netlifyResponse.interface.ts';
import { netlifyResponseHandler } from './netlifyResponseHandler.ts';

const hmacSecret: string | undefined = Deno.env.get('HMAC_SECRET');
if (!hmacSecret) {
    throw new Error('HMAC_SECRET is not set');
}

const computeJobSig: ComputeJobSig = await createComputeJobSig(hmacSecret);
const adminClient: SupabaseClient<Database> = createSupabaseAdminClient();

const adminTokenWalletService = new AdminTokenWalletService(adminClient);
const fileManager = new FileManagerService(adminClient, { constructStoragePath, logger, assembleChunks });
const notificationService = new NotificationService(adminClient);

const boundDebitTokens: BoundDebitTokens = (params, payload) =>
    debitTokens({ logger, tokenWalletService: adminTokenWalletService }, params, payload);

const boundResolveTemplateFilename: BoundResolveTemplateFilenameFn = (params, payload) =>
    resolveTemplateFilename({}, params, payload);

const boundEnqueueRenderJob: BoundEnqueueRenderJobFn = (params, payload) =>
    enqueueRenderJob({ dbClient: adminClient, logger, shouldEnqueueRenderJob, resolveTemplateFilename: boundResolveTemplateFilename }, params, payload);

const countTokensDeps: CountTokensDeps = {
    getEncoding: (encodingName: string) => {
        if (!isKnownTiktokenEncoding(encodingName)) {
            throw new Error(`Unsupported tiktoken encoding: ${encodingName}`);
        }
        return rawGetEncoding(encodingName);
    },
    countTokensAnthropic,
    logger,
};

const boundCountTokens: BoundCountTokensFn = (payload, modelConfig) =>
    countTokens(countTokensDeps, payload, modelConfig);

const boundRetryJob: BoundRetryJobFn = (params, payload) =>
    retryJob({ logger, notificationService }, params, payload);

const boundLoadJobContext: BoundLoadJobContextFn = (params, payload) =>
    loadJobContext({}, params, payload);

const boundContinueJob: BoundContinueJobFn = (params, payload) =>
    continueJob({ logger }, params, payload);

const boundAssembleAiResponse: BoundAssembleAiResponseFn = (params, payload) =>
    assembleAiResponse({ countTokens: boundCountTokens }, params, payload);

const boundDebitForResponse: BoundDebitForResponseFn = (params, payload) =>
    debitForResponse({ debitTokens: boundDebitTokens }, params, payload);

const boundPrepareResponseContent: BoundPrepareResponseContentFn = (params, payload) =>
    prepareResponseContent({ logger, resolveFinishReason, isIntermediateChunk, sanitizeJsonContent, determineContinuation }, params, payload);

const boundResolveContributionIdentity: BoundResolveContributionIdentityFn = (params, payload) =>
    resolveContributionIdentity({ logger }, params, payload);

const boundPersistContributionRelationships: BoundPersistContributionRelationshipsFn = (params, payload) =>
    persistContributionRelationships({}, params, payload);

const boundFinalizeContributionJob: BoundFinalizeContributionJobFn = (params, payload) =>
    finalizeContributionJob({ logger, notificationService, fileManager, continueJob: boundContinueJob, enqueueRenderJob: boundEnqueueRenderJob }, params, payload);

const boundSaveContributionResponse: BoundSaveContributionResponseFn = (params, payload) =>
    saveContributionResponse({ fileManager, buildUploadContext, resolveContributionIdentity: boundResolveContributionIdentity, persistContributionRelationships: boundPersistContributionRelationships, finalizeContributionJob: boundFinalizeContributionJob }, params, payload);

const boundSaveCompressedResponse: BoundSaveCompressedResponseFn = (params, payload) =>
    saveCompressedResponse({ fileManager, buildUploadContext, enqueueRenderJob: boundEnqueueRenderJob }, params, payload);

const saveResponseDeps: SaveResponseDeps = {
    logger,
    retryJob: boundRetryJob,
    loadJobContext: boundLoadJobContext,
    assembleAiResponse: boundAssembleAiResponse,
    debitForResponse: boundDebitForResponse,
    prepareResponseContent: boundPrepareResponseContent,
    saveContributionResponse: boundSaveContributionResponse,
    saveCompressedResponse: boundSaveCompressedResponse,
};

const boundSaveResponse: BoundSaveResponseFn = (params, payload) =>
    saveResponse(saveResponseDeps, params, payload);

const deps: NetlifyResponseDeps = {
    computeJobSig,
    adminClient,
    saveResponse: boundSaveResponse,
};

serve((req: Request) => netlifyResponseHandler(deps, req));
