import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../types_db.ts";
import { netlifyResponseHandler } from "./netlifyResponseHandler.ts";
import { createComputeJobSig } from "../_shared/utils/computeJobSig/computeJobSig.ts";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import type {
    BoundSaveResponseFn,
    SaveResponseDeps,
    SaveResponseSuccessReturn,
} from "../dialectic-worker/saveResponse/saveResponse.interface.ts";
import type { NetlifyResponseDeps } from "./netlifyResponse.interface.ts";
import type { ComputeJobSig } from "../_shared/utils/computeJobSig/computeJobSig.interface.ts";
import { MockLogger } from "../_shared/logger.mock.ts";
import { FileManagerService } from "../_shared/services/file_manager.ts";
import { NotificationService } from "../_shared/utils/notification.service.ts";
import { AdminTokenWalletService } from "../_shared/services/tokenwallet/admin/adminTokenWalletService.ts";
import { constructStoragePath } from "../_shared/utils/path_constructor.ts";
import { assembleChunks } from "../_shared/utils/assembleChunks/assembleChunks.ts";
import { countTokens } from "../_shared/utils/tokenizer_utils.ts";
import type { BoundCountTokensFn, CountTokensDeps } from "../_shared/types/tokenizer.types.ts";
import { getEncoding as rawGetEncoding } from "npm:js-tiktoken@1.0.7";
import { countTokens as countTokensAnthropic } from "npm:@anthropic-ai/tokenizer@0.0.4";
import { isKnownTiktokenEncoding } from "../_shared/utils/type-guards/type_guards.chat.ts";
import { resolveFinishReason } from "../_shared/utils/resolveFinishReason.ts";
import { isIntermediateChunk } from "../_shared/utils/isIntermediateChunk.ts";
import { determineContinuation } from "../_shared/utils/determineContinuation/determineContinuation.ts";
import { buildUploadContext } from "../_shared/utils/buildUploadContext/buildUploadContext.ts";
import { sanitizeJsonContent } from "../_shared/utils/jsonSanitizer/jsonSanitizer.ts";
import { debitTokens } from "../_shared/utils/debitTokens.ts";
import type { BoundDebitTokens } from "../_shared/utils/debitTokens.interface.ts";
import { enqueueRenderJob } from "../dialectic-worker/enqueueRenderJob/enqueueRenderJob.ts";
import type { BoundEnqueueRenderJobFn } from "../dialectic-worker/enqueueRenderJob/enqueueRenderJob.interface.ts";
import { shouldEnqueueRenderJob } from "../_shared/utils/shouldEnqueueRenderJob.ts";
import { resolveTemplateFilename } from "../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts";
import type { BoundResolveTemplateFilenameFn } from "../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.interface.ts";
import { saveResponse } from "../dialectic-worker/saveResponse/saveResponse.provides.ts";
import { retryJob, type BoundRetryJobFn } from "../dialectic-worker/retryJob/retryJob.provides.ts";
import { loadJobContext, type BoundLoadJobContextFn } from "../dialectic-worker/loadJobContext/loadJobContext.provides.ts";
import { assembleAiResponse, type BoundAssembleAiResponseFn } from "../dialectic-worker/assembleAiResponse/assembleAiResponse.provides.ts";
import { debitForResponse, type BoundDebitForResponseFn } from "../dialectic-worker/debitForResponse/debitForResponse.provides.ts";
import { prepareResponseContent, type BoundPrepareResponseContentFn } from "../dialectic-worker/prepareResponseContent/prepareResponseContent.provides.ts";
import { saveContributionResponse, type BoundSaveContributionResponseFn } from "../dialectic-worker/saveContributionResponse/saveContributionResponse.provides.ts";
import { saveCompressedResponse, type BoundSaveCompressedResponseFn } from "../dialectic-worker/saveCompressedResponse/saveCompressedResponse.provides.ts";
import { resolveContributionIdentity, type BoundResolveContributionIdentityFn } from "../dialectic-worker/resolveContributionIdentity/resolveContributionIdentity.provides.ts";
import { persistContributionRelationships, type BoundPersistContributionRelationshipsFn } from "../dialectic-worker/persistContributionRelationships/persistContributionRelationships.provides.ts";
import { finalizeContributionJob, type BoundFinalizeContributionJobFn } from "../dialectic-worker/finalizeContributionJob/finalizeContributionJob.provides.ts";
import { continueJob } from "../dialectic-worker/continueJob/continueJob.ts";
import type { BoundContinueJobFn } from "../dialectic-worker/continueJob/continueJob.interface.ts";
import {
    buildDialecticJobRow,
    buildDialecticExecuteJobPayload,
    buildDialecticContributionRow,
    buildDialecticProjectResourceRow,
    buildTokenWalletRow,
    buildDialecticStage,
    buildDialecticRecipeTemplateStep,
    buildStageWithRecipeSteps,
    buildContentToInclude,
    buildDocumentRelationships,
} from "../_shared/dialectic.mock.ts";
import { buildDialecticCompressJobPayload } from "../dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.mock.ts";
import { buildMockProvider } from "../_shared/ai_service/ai_provider.mock.ts";
import { buildRecordTokenTransactionRpcRow } from "../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts";
import { isJson } from "../_shared/utils/type-guards/type_guards.common.ts";

const TEST_SECRET = "integration-test-hmac-secret";
const JOB_ID = "job-integ-1";
const USER_ID = "user-integ-1";
const RECENT_CREATED_AT = new Date().toISOString();
const EXPIRED_CREATED_AT = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

const defaultSaveResponse: BoundSaveResponseFn = async () => {
    const result: SaveResponseSuccessReturn = { status: "completed" };
    return result;
};

Deno.test("Integration: valid sig + unexpired job → 200; saveResponse called", async () => {
    const computeJobSig = await createComputeJobSig(TEST_SECRET);
    const jobRow = { id: JOB_ID, user_id: USER_ID, created_at: RECENT_CREATED_AT };
    const sig = await computeJobSig(JOB_ID, USER_ID, RECENT_CREATED_AT);

    let saveResponseCalled = false;
    const saveResponseFn: BoundSaveResponseFn = async () => {
        saveResponseCalled = true;
        const result: SaveResponseSuccessReturn = { status: "completed" };
        return result;
    };

    const { client } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [jobRow], error: null },
            },
        },
    });

    const deps: NetlifyResponseDeps = {
        computeJobSig,
        adminClient: client as unknown as SupabaseClient<Database>,
        saveResponse: saveResponseFn,
    };

    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: JOB_ID,
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
            sig,
            processingTimeMs: 100,
        }),
    });

    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 200);
    assertEquals(saveResponseCalled, true);
});

Deno.test("Integration: invalid sig → 401; saveResponse not called", async () => {
    const computeJobSig = await createComputeJobSig(TEST_SECRET);
    const jobRow = { id: JOB_ID, user_id: USER_ID, created_at: RECENT_CREATED_AT };

    let saveResponseCalled = false;
    const saveResponseFn: BoundSaveResponseFn = async () => {
        saveResponseCalled = true;
        return defaultSaveResponse({} as never, {} as never);
    };

    const { client } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [jobRow], error: null },
            },
        },
    });

    const deps: NetlifyResponseDeps = {
        computeJobSig,
        adminClient: client as unknown as SupabaseClient<Database>,
        saveResponse: saveResponseFn,
    };

    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: JOB_ID,
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
            sig: "definitely-wrong-sig",
            processingTimeMs: 100,
        }),
    });

    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 401);
    assertEquals(saveResponseCalled, false);
});

Deno.test("Integration: expired job → 401; saveResponse not called", async () => {
    const computeJobSig = await createComputeJobSig(TEST_SECRET);
    const jobRow = { id: JOB_ID, user_id: USER_ID, created_at: EXPIRED_CREATED_AT };
    const sig = await computeJobSig(JOB_ID, USER_ID, EXPIRED_CREATED_AT);

    let saveResponseCalled = false;
    const saveResponseFn: BoundSaveResponseFn = async () => {
        saveResponseCalled = true;
        const result: SaveResponseSuccessReturn = { status: "completed" };
        return result;
    };

    const { client } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [jobRow], error: null },
            },
        },
    });

    const deps: NetlifyResponseDeps = {
        computeJobSig,
        adminClient: client as unknown as SupabaseClient<Database>,
        saveResponse: saveResponseFn,
    };

    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: JOB_ID,
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
            sig,
            processingTimeMs: 100,
        }),
    });

    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 401);
    assertEquals(saveResponseCalled, false);
});

Deno.test("Integration: missing job_id → 400; no DB call made", async () => {
    const computeJobSig = await createComputeJobSig(TEST_SECRET);

    let saveResponseCalled = false;
    const saveResponseFn: BoundSaveResponseFn = async () => {
        saveResponseCalled = true;
        const result: SaveResponseSuccessReturn = { status: "completed" };
        return result;
    };

    const { client, spies } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [], error: null },
            },
        },
    });

    const deps: NetlifyResponseDeps = {
        computeJobSig,
        adminClient: client as unknown as SupabaseClient<Database>,
        saveResponse: saveResponseFn,
    };

    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
            sig: "any-sig",
            processingTimeMs: 100,
        }),
    });

    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 400);
    assertEquals(saveResponseCalled, false);
    assertEquals(spies.fromSpy.calls.length, 0);
});

// ---------------------------------------------------------------------------
//  Real-chain integration tests
//  Boundary: netlifyResponseHandler → real saveResponse → real arm module →
//  real collaborators. No function in that chain is mocked, stubbed or
//  replaced by a builder.
//  Mocked at the outer edge only: the Supabase client (DB + storage API) and
//  the incoming queue POST (the Request object). This test does not prove
//  what the real database, real storage, or the real Netlify queue do with
//  the data the chain produces.
// ---------------------------------------------------------------------------

Deno.env.set("SB_CONTENT_STORAGE_BUCKET", "test-content-bucket");

const REAL_CHAIN_SECRET = "real-chain-hmac-secret";
const realChainLogger = new MockLogger();

/**
 * Wires the real saveResponse chain exactly as index.ts does, closing over
 * the given mock Supabase client. No function in the chain is mocked — this
 * is production dependency wiring, not a builder wrapper.
 */
function composeRealChain(
    adminClient: SupabaseClient<Database>,
    computeJobSig: ComputeJobSig,
): NetlifyResponseDeps {
    const adminTokenWalletService = new AdminTokenWalletService(adminClient);
    const fileManager = new FileManagerService(adminClient, {
        constructStoragePath,
        logger: realChainLogger,
        assembleChunks,
    });
    const notificationService = new NotificationService(adminClient);

    const boundDebitTokens: BoundDebitTokens = (params, payload) =>
        debitTokens({ logger: realChainLogger, tokenWalletService: adminTokenWalletService }, params, payload);

    const boundResolveTemplateFilename: BoundResolveTemplateFilenameFn = (params, payload) =>
        resolveTemplateFilename({}, params, payload);

    const boundEnqueueRenderJob: BoundEnqueueRenderJobFn = (params, payload) =>
        enqueueRenderJob({ dbClient: adminClient, logger: realChainLogger, shouldEnqueueRenderJob, resolveTemplateFilename: boundResolveTemplateFilename }, params, payload);

    const countTokensDeps: CountTokensDeps = {
        getEncoding: (encodingName: string) => {
            if (!isKnownTiktokenEncoding(encodingName)) {
                throw new Error(`Unsupported tiktoken encoding: ${encodingName}`);
            }
            return rawGetEncoding(encodingName);
        },
        countTokensAnthropic,
        logger: realChainLogger,
    };

    const boundCountTokens: BoundCountTokensFn = (payload, modelConfig) =>
        countTokens(countTokensDeps, payload, modelConfig);

    const boundRetryJob: BoundRetryJobFn = (params, payload) =>
        retryJob({ logger: realChainLogger, notificationService }, params, payload);

    const boundLoadJobContext: BoundLoadJobContextFn = (params, payload) =>
        loadJobContext({}, params, payload);

    const boundContinueJob: BoundContinueJobFn = (params, payload) =>
        continueJob({ logger: realChainLogger }, params, payload);

    const boundAssembleAiResponse: BoundAssembleAiResponseFn = (params, payload) =>
        assembleAiResponse({ countTokens: boundCountTokens }, params, payload);

    const boundDebitForResponse: BoundDebitForResponseFn = (params, payload) =>
        debitForResponse({ debitTokens: boundDebitTokens }, params, payload);

    const boundPrepareResponseContent: BoundPrepareResponseContentFn = (params, payload) =>
        prepareResponseContent({ logger: realChainLogger, resolveFinishReason, isIntermediateChunk, sanitizeJsonContent, determineContinuation }, params, payload);

    const boundResolveContributionIdentity: BoundResolveContributionIdentityFn = (params, payload) =>
        resolveContributionIdentity({ logger: realChainLogger }, params, payload);

    const boundPersistContributionRelationships: BoundPersistContributionRelationshipsFn = (params, payload) =>
        persistContributionRelationships({}, params, payload);

    const boundFinalizeContributionJob: BoundFinalizeContributionJobFn = (params, payload) =>
        finalizeContributionJob({ logger: realChainLogger, notificationService, fileManager, continueJob: boundContinueJob, enqueueRenderJob: boundEnqueueRenderJob }, params, payload);

    const boundSaveContributionResponse: BoundSaveContributionResponseFn = (params, payload) =>
        saveContributionResponse({ fileManager, buildUploadContext, resolveContributionIdentity: boundResolveContributionIdentity, persistContributionRelationships: boundPersistContributionRelationships, finalizeContributionJob: boundFinalizeContributionJob }, params, payload);

    const boundSaveCompressedResponse: BoundSaveCompressedResponseFn = (params, payload) =>
        saveCompressedResponse({ fileManager, buildUploadContext, enqueueRenderJob: boundEnqueueRenderJob }, params, payload);

    const saveResponseDeps: SaveResponseDeps = {
        logger: realChainLogger,
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

    return {
        computeJobSig,
        adminClient,
        saveResponse: boundSaveResponse,
    };
}

/**
 * Contract: given a valid sig and an unexpired EXECUTE job, the real chain runs
 *   netlifyResponseHandler → saveResponse → saveContributionResponse and returns 200.
 * Arrange: a mock Supabase client configured with an EXECUTE job row, provider, wallet,
 *   contribution insert result, stage/instance/template-step rows, and RPC results — all
 *   from builders called directly here.
 * Act:     netlifyResponseHandler with the composed real chain.
 * Assert:  response status is 200; the response body carries status "completed".
 *
 * Boundary: netlifyResponseHandler → real saveResponse → real saveContributionResponse
 *   → real resolveContributionIdentity, persistContributionRelationships,
 *   finalizeContributionJob, enqueueRenderJob, and real FileManagerService.
 * Mocked: the Supabase client (DB + storage API) and the incoming queue POST. This test
 *   does not prove what the real database, real storage, or the real Netlify queue do.
 */
Deno.test("Integration: real chain EXECUTE → saveContributionResponse → 200", async () => {
    const computeJobSig = await createComputeJobSig(REAL_CHAIN_SECRET);
    const recipeInstance = buildStageWithRecipeSteps().dialectic_stage_recipe_instances;
    const executePayload = buildDialecticExecuteJobPayload({
        document_relationships: buildDocumentRelationships({ source_group: "sg-real-chain" }),
    });
    if (!isJson(executePayload)) {
        throw new Error("executePayload must be json compatible");
    }
    const executeJobRow = buildDialecticJobRow({
        created_at: new Date().toISOString(),
        payload: executePayload,
    });
    const { client } = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [executeJobRow], error: null },
                update: { data: [{}], error: null },
            },
            ai_providers: {
                select: { data: [buildMockProvider()], error: null },
            },
            token_wallets: {
                select: { data: [buildTokenWalletRow()], error: null },
            },
            dialectic_contributions: {
                insert: { data: [buildDialecticContributionRow()], error: null },
                update: { data: [{}], error: null },
            },
            dialectic_stages: {
                select: { data: [buildDialecticStage({ active_recipe_instance_id: recipeInstance.id })], error: null },
            },
            dialectic_stage_recipe_instances: {
                select: { data: [recipeInstance], error: null },
            },
            dialectic_recipe_template_steps: {
                select: { data: [buildDialecticRecipeTemplateStep()], error: null },
            },
        },
        rpcResults: {
            record_token_transaction: {
                data: [buildRecordTokenTransactionRpcRow({
                    walletId: buildTokenWalletRow().wallet_id,
                    recordedByUserId: "test-user-id",
                    targetUserId: buildTokenWalletRow().user_id!,
                    txnType: "DEBIT_USAGE",
                    idempotencyKey: "idem-1",
                    transactionId: "txn-1",
                    amount: 2,
                    balanceAfterTxn: 998,
                    timestamp: new Date().toISOString(),
                })],
                error: null,
            },
            create_notification_for_user: { data: null, error: null },
        },
        storageMock: {
            defaultBucket: "test-content-bucket",
            uploadResult: { data: { path: "test/upload/path" }, error: null },
        },
    });
    const deps = composeRealChain(client as unknown as SupabaseClient<Database>, computeJobSig);

    const sig = await computeJobSig(executeJobRow.id, executeJobRow.user_id, executeJobRow.created_at);
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: executeJobRow.id,
            assembled_content: '{"product": "widget"}',
            token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            finish_reason: "stop",
            sig,
            processingTimeMs: 100,
        }),
    });

    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.status, "completed");
});

/**
 * Contract: given a valid sig and an unexpired COMPRESS job in text mode, the real chain
 *   runs netlifyResponseHandler → saveResponse → saveCompressedResponse and returns 200.
 * Arrange: a mock Supabase client configured with a COMPRESS job row, provider, wallet,
 *   project resource upsert result, and RPC results — all from builders called directly here.
 * Act:     netlifyResponseHandler with the composed real chain.
 * Assert:  response status is 200; the response body carries status "completed".
 *
 * Boundary: netlifyResponseHandler → real saveResponse → real saveCompressedResponse
 *   → real FileManagerService (two uploadAndRegisterFile calls for CompressedContextRawJson
 *   and CompressedContext).
 * Mocked: the Supabase client (DB + storage API) and the incoming queue POST. This test
 *   does not prove what the real database, real storage, or the real Netlify queue do.
 */
Deno.test("Integration: real chain COMPRESS text mode → saveCompressedResponse → 200", async () => {
    const computeJobSig = await createComputeJobSig(REAL_CHAIN_SECRET);
    const compressPayload = buildDialecticCompressJobPayload({
        content: JSON.stringify(buildContentToInclude()),
    });
    if (!isJson(compressPayload)) {
        throw new Error("compressPayload must be json compatible");
    }
    const compressJobRow = buildDialecticJobRow({
        created_at: new Date().toISOString(),
        job_type: "COMPRESS",
        payload: compressPayload,
    });
    const { client } = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [compressJobRow], error: null },
            },
            ai_providers: {
                select: { data: [buildMockProvider()], error: null },
            },
            token_wallets: {
                select: { data: [buildTokenWalletRow()], error: null },
            },
            dialectic_project_resources: {
                upsert: { data: [buildDialecticProjectResourceRow()], error: null },
            },
        },
        rpcResults: {
            record_token_transaction: {
                data: [buildRecordTokenTransactionRpcRow({
                    walletId: buildTokenWalletRow().wallet_id,
                    recordedByUserId: "test-user-id",
                    targetUserId: buildTokenWalletRow().user_id!,
                    txnType: "DEBIT_USAGE",
                    idempotencyKey: "idem-1",
                    transactionId: "txn-1",
                    amount: 2,
                    balanceAfterTxn: 998,
                    timestamp: new Date().toISOString(),
                })],
                error: null,
            },
            create_notification_for_user: { data: null, error: null },
        },
        storageMock: {
            defaultBucket: "test-content-bucket",
            uploadResult: { data: { path: "test/upload/path" }, error: null },
        },
    });
    const deps = composeRealChain(client as unknown as SupabaseClient<Database>, computeJobSig);

    const sig = await computeJobSig(compressJobRow.id, compressJobRow.user_id, compressJobRow.created_at);
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: compressJobRow.id,
            assembled_content: "compressed text content",
            token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            finish_reason: "stop",
            sig,
            processingTimeMs: 100,
        }),
    });

    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.status, "completed");
});

/**
 * Contract: the graph is constructed once, so two requests reach the same closure
 *   identities — both succeed through the same bound saveResponse.
 * Arrange: one composed real chain (one deps object, one boundSaveResponse closure).
 * Act:     two requests through the same deps.
 * Assert:  both responses are 200 with status "completed"; deps.saveResponse is the same
 *   function reference for both calls.
 *
 * Boundary: netlifyResponseHandler → real saveResponse (same closure) → real arm module.
 * Mocked: the Supabase client (DB + storage API) and the incoming queue POST. This test
 *   does not prove what the real database, real storage, or the real Netlify queue do.
 */
Deno.test("Integration: graph bound once — two requests reach the same closure identities", async () => {
    const computeJobSig = await createComputeJobSig(REAL_CHAIN_SECRET);
    const recipeInstance = buildStageWithRecipeSteps().dialectic_stage_recipe_instances;
    const executePayload = buildDialecticExecuteJobPayload({
        document_relationships: buildDocumentRelationships({ source_group: "sg-real-chain" }),
    });
    if (!isJson(executePayload)) {
        throw new Error("executePayload must be json compatible");
    }
    const executeJobRow = buildDialecticJobRow({
        created_at: new Date().toISOString(),
        payload: executePayload,
    });
    const { client } = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [executeJobRow], error: null },
                update: { data: [{}], error: null },
            },
            ai_providers: {
                select: { data: [buildMockProvider()], error: null },
            },
            token_wallets: {
                select: { data: [buildTokenWalletRow()], error: null },
            },
            dialectic_contributions: {
                insert: { data: [buildDialecticContributionRow()], error: null },
                update: { data: [{}], error: null },
            },
            dialectic_stages: {
                select: { data: [buildDialecticStage({ active_recipe_instance_id: recipeInstance.id })], error: null },
            },
            dialectic_stage_recipe_instances: {
                select: { data: [recipeInstance], error: null },
            },
            dialectic_recipe_template_steps: {
                select: { data: [buildDialecticRecipeTemplateStep()], error: null },
            },
        },
        rpcResults: {
            record_token_transaction: {
                data: [buildRecordTokenTransactionRpcRow({
                    walletId: buildTokenWalletRow().wallet_id,
                    recordedByUserId: "test-user-id",
                    targetUserId: buildTokenWalletRow().user_id!,
                    txnType: "DEBIT_USAGE",
                    idempotencyKey: "idem-1",
                    transactionId: "txn-1",
                    amount: 2,
                    balanceAfterTxn: 998,
                    timestamp: new Date().toISOString(),
                })],
                error: null,
            },
            create_notification_for_user: { data: null, error: null },
        },
        storageMock: {
            defaultBucket: "test-content-bucket",
            uploadResult: { data: { path: "test/upload/path" }, error: null },
        },
    });
    const deps = composeRealChain(client as unknown as SupabaseClient<Database>, computeJobSig);
    const saveResponseRef = deps.saveResponse;

    const sig = await computeJobSig(executeJobRow.id, executeJobRow.user_id, executeJobRow.created_at);
    const req1 = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: executeJobRow.id,
            assembled_content: '{"product": "widget"}',
            token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            finish_reason: "stop",
            sig,
            processingTimeMs: 100,
        }),
    });
    const req2 = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: executeJobRow.id,
            assembled_content: '{"product": "gadget"}',
            token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            finish_reason: "stop",
            sig,
            processingTimeMs: 100,
        }),
    });

    const res1 = await netlifyResponseHandler(deps, req1);
    const res2 = await netlifyResponseHandler(deps, req2);
    assertEquals(res1.status, 200);
    assertEquals(res2.status, 200);
    assertEquals(deps.saveResponse, saveResponseRef);
});

/**
 * Contract: a retriable error from the chain (wallet read returns a driver Error) maps to
 *   a 503 response carrying the error's message.
 * Arrange: a mock Supabase client where token_wallets select returns a real Error instance
 *   (not a PostgresError), causing debitForResponse to return retriable: true.
 * Act:     netlifyResponseHandler with the composed real chain.
 * Assert:  response status is 503.
 *
 * Boundary: netlifyResponseHandler → real saveResponse → real debitForResponse (fails).
 * Mocked: the Supabase client. This test does not prove what the real database does.
 */
Deno.test("Integration: retriable error → 503", async () => {
    const computeJobSig = await createComputeJobSig(REAL_CHAIN_SECRET);
    const executePayload = buildDialecticExecuteJobPayload({
        document_relationships: buildDocumentRelationships({ source_group: "sg-real-chain" }),
    });
    if (!isJson(executePayload)) {
        throw new Error("executePayload must be json compatible");
    }
    const executeJobRow = buildDialecticJobRow({
        created_at: new Date().toISOString(),
        payload: executePayload,
    });
    const { client } = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [executeJobRow], error: null },
            },
            ai_providers: {
                select: { data: [buildMockProvider()], error: null },
            },
            token_wallets: {
                select: { data: null, error: new Error("wallet read failed") },
            },
        },
        rpcResults: {},
        storageMock: {},
    });
    const deps = composeRealChain(client as unknown as SupabaseClient<Database>, computeJobSig);

    const sig = await computeJobSig(executeJobRow.id, executeJobRow.user_id, executeJobRow.created_at);
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: executeJobRow.id,
            assembled_content: '{"product": "widget"}',
            token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            finish_reason: "stop",
            sig,
            processingTimeMs: 100,
        }),
    });

    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 503);
});

/**
 * Contract: a non-retriable error from the chain (wallet not found) maps to a 500 response
 *   carrying the error's message.
 * Arrange: a mock Supabase client where token_wallets select returns zero rows, causing
 *   debitForResponse to return retriable: false.
 * Act:     netlifyResponseHandler with the composed real chain.
 * Assert:  response status is 500.
 *
 * Boundary: netlifyResponseHandler → real saveResponse → real debitForResponse (fails).
 * Mocked: the Supabase client. This test does not prove what the real database does.
 */
Deno.test("Integration: non-retriable error → 500", async () => {
    const computeJobSig = await createComputeJobSig(REAL_CHAIN_SECRET);
    const executePayload = buildDialecticExecuteJobPayload({
        document_relationships: buildDocumentRelationships({ source_group: "sg-real-chain" }),
    });
    if (!isJson(executePayload)) {
        throw new Error("executePayload must be json compatible");
    }
    const executeJobRow = buildDialecticJobRow({
        created_at: new Date().toISOString(),
        payload: executePayload,
    });
    const { client } = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [executeJobRow], error: null },
            },
            ai_providers: {
                select: { data: [buildMockProvider()], error: null },
            },
            token_wallets: {
                select: { data: [], error: null },
            },
        },
        rpcResults: {},
        storageMock: {},
    });
    const deps = composeRealChain(client as unknown as SupabaseClient<Database>, computeJobSig);

    const sig = await computeJobSig(executeJobRow.id, executeJobRow.user_id, executeJobRow.created_at);
    const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_id: executeJobRow.id,
            assembled_content: '{"product": "widget"}',
            token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            finish_reason: "stop",
            sig,
            processingTimeMs: 100,
        }),
    });

    const res = await netlifyResponseHandler(deps, req);
    assertEquals(res.status, 500);
});
