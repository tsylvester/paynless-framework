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
import { continueJob } from '../dialectic-worker/continueJob.ts';
import { retryJob } from '../dialectic-worker/retryJob.ts';
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
import { saveResponse } from '../dialectic-worker/saveResponse/saveResponse.ts';
import type { SaveResponseDeps } from '../dialectic-worker/saveResponse/saveResponse.interface.ts';
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

const boundEnqueueRenderJob: BoundEnqueueRenderJobFn = (params, payload) =>
    enqueueRenderJob({ dbClient: adminClient, logger, shouldEnqueueRenderJob }, params, payload);

const saveResponseDeps: SaveResponseDeps = {
    logger,
    fileManager,
    notificationService,
    continueJob,
    retryJob,
    resolveFinishReason,
    isIntermediateChunk,
    determineContinuation,
    buildUploadContext,
    sanitizeJsonContent,
    debitTokens: boundDebitTokens,
    enqueueRenderJob: boundEnqueueRenderJob,
};

const deps: NetlifyResponseDeps = {
    computeJobSig,
    adminClient,
    saveResponse,
    saveResponseDeps,
};

serve((req: Request) => netlifyResponseHandler(deps, req));
