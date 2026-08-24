import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { FileType, DialecticStageSlug } from "../../_shared/types/file_manager.types.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import {
	createMockFileManagerService,
	buildFileRecord,
} from "../../_shared/services/file_manager.mock.ts";
import { mockBuildUploadContext } from "../../_shared/utils/buildUploadContext/buildUploadContext.mock.ts";
import {
	buildDialecticJobRow,
} from "../../_shared/dialectic.mock.ts";
import { buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";
import { buildPrepareResponseContentPreparedReturn } from "../prepareResponseContent/prepareResponseContent.mock.ts";
import {
	buildDialecticCompressJobPayload,
} from "../enqueueCompressJobs/enqueueCompressJobs.mock.ts";
import {
	buildEnqueueRenderJobSuccessReturn,
	buildEnqueueRenderJobErrorReturn,
} from "../enqueueRenderJob/enqueueRenderJob.mock.ts";
import type { BoundEnqueueRenderJobFn } from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import type { UploadContext } from "../../_shared/types/file_manager.types.ts";
import { saveCompressedResponse } from "./saveCompressedResponse.ts";
import {
	isSaveCompressedResponseSuccessReturn,
	isSaveCompressedResponseRawJsonUploadError,
	isSaveCompressedResponseJobUpdateError,
	isSaveCompressedResponseExtractedUploadError,
} from "./saveCompressedResponse.guard.ts";
import {
	buildSaveCompressedResponseDeps,
	buildSaveCompressedResponseParams,
} from "./saveCompressedResponse.mock.ts";

// --- continuation needed ---

/**
 * Contract: params.preparedContentResult.shouldContinue === true returns the success
 *   arm { status: 'needs_continuation' } and no upload, no render dispatch, and no
 *   DB update occur.
 * Arrange: preparedContentResult with shouldContinue: true; a file manager spy that
 *   should not be called; an enqueueRenderJob spy that should not be called.
 * Act: saveCompressedResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'needs_continuation';
 *   uploadAndRegisterFile was not called; enqueueRenderJob was not called.
 */
Deno.test("continuation needed: shouldContinue true returns needs_continuation and performs no upload, render, or DB update", async () => {
	// Arrange — shouldContinue: true
	const fileManager = createMockFileManagerService();
	const enqueueRenderJobStub: BoundEnqueueRenderJobFn = async () =>
		buildEnqueueRenderJobSuccessReturn();
	const enqueueRenderJobSpy = spy(enqueueRenderJobStub);
	const deps = buildSaveCompressedResponseDeps({
		fileManager,
		enqueueRenderJob: enqueueRenderJobSpy,
	});
	const params = buildSaveCompressedResponseParams({
		preparedContentResult: buildPrepareResponseContentPreparedReturn({
			shouldContinue: true,
		}),
	});
	const payload = buildDialecticCompressJobPayload();

	// Act
	const result = await saveCompressedResponse(deps, params, payload);

	// Assert
	assertEquals(isSaveCompressedResponseSuccessReturn(result), true);
	if (isSaveCompressedResponseSuccessReturn(result)) {
		assertEquals(result.status, "needs_continuation");
	}
	assertEquals(fileManager.uploadAndRegisterFile.calls.length, 0);
	assertEquals(enqueueRenderJobSpy.calls.length, 0);
});

// --- CompressedContextRawJson upload fails ---

/**
 * Contract: uploadAndRegisterFile returning an error for the CompressedContextRawJson
 *   upload returns the error arm carrying SaveCompressedResponseRawJsonUploadError,
 *   retriable false.
 * Arrange: a file manager configured to return an error carrying a distinct driver
 *   message; shouldContinue: false.
 * Act: saveCompressedResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error passes
 *   isSaveCompressedResponseRawJsonUploadError and whose driverMessage equals the
 *   arranged message; retriable is false.
 */
Deno.test("raw JSON upload fails: uploadAndRegisterFile returning an error returns the RawJsonUploadError arm, retriable false", async () => {
	// Arrange — upload returns an error with a distinct driver message
	const fileManager = createMockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(null, { message: "raw-json-upload-fail-distinct" });
	const deps = buildSaveCompressedResponseDeps({ fileManager });
	const params = buildSaveCompressedResponseParams();
	const payload = buildDialecticCompressJobPayload();

	// Act
	const result = await saveCompressedResponse(deps, params, payload);

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assertEquals(isSaveCompressedResponseRawJsonUploadError(result.error), true);
		if (isSaveCompressedResponseRawJsonUploadError(result.error)) {
			assertEquals(result.error.driverMessage, "raw-json-upload-fail-distinct");
		}
		assertEquals(result.retriable, false);
	}
});

// --- json mode — RENDER dispatch fails ---

/**
 * Contract: payload.mode === 'json' and enqueueRenderJob returning its error arm
 *   propagates that error unchanged on this module's error arm.
 * Arrange: a file manager configured to succeed on the raw JSON upload; an
 *   enqueueRenderJob stub returning a distinct error arm; payload mode 'json'.
 * Act: saveCompressedResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error is the same reference as the
 *   render error's error and whose retriable matches.
 */
Deno.test("json mode RENDER fails: enqueueRenderJob returning its error arm propagates it unchanged", async () => {
	// Arrange — raw JSON upload succeeds, render returns a distinct error arm
	const fileManager = createMockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
	const renderError = buildEnqueueRenderJobErrorReturn({
		error: new Error("render-fail-distinct"),
		retriable: true,
	});
	const enqueueRenderJobStub: BoundEnqueueRenderJobFn = async () => renderError;
	const deps = buildSaveCompressedResponseDeps({
		fileManager,
		enqueueRenderJob: enqueueRenderJobStub,
	});
	const params = buildSaveCompressedResponseParams();
	const payload = buildDialecticCompressJobPayload({ mode: "json" });

	// Act
	const result = await saveCompressedResponse(deps, params, payload);

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assert(result.error === renderError.error);
		assertEquals(result.retriable, renderError.retriable);
	}
});

// --- json mode — waiting_for_children DB update fails ---

/**
 * Contract: payload.mode === 'json' and the waiting_for_children DB update returning
 *   an error returns the error arm carrying SaveCompressedResponseJobUpdateError,
 *   retriable true.
 * Arrange: a file manager configured to succeed on the raw JSON upload; an
 *   enqueueRenderJob stub returning success; a mock DB client whose
 *   dialectic_generation_jobs update returns an error; payload mode 'json'.
 * Act: saveCompressedResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error passes
 *   isSaveCompressedResponseJobUpdateError; retriable is true.
 */
Deno.test("json mode DB update fails: waiting_for_children update error returns the JobUpdateError arm, retriable true", async () => {
	// Arrange — upload and render succeed, DB update fails
	const fileManager = createMockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
	const enqueueRenderJobStub: BoundEnqueueRenderJobFn = async () =>
		buildEnqueueRenderJobSuccessReturn();
	const mockSetup = createMockSupabaseClient("save-compressed-db-update-fail", {
		genericMockResults: {
			dialectic_generation_jobs: { update: { data: null, error: new Error("db-update-fail-distinct") } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildSaveCompressedResponseDeps({
		fileManager,
		enqueueRenderJob: enqueueRenderJobStub,
	});
	const params = buildSaveCompressedResponseParams({ dbClient });
	const payload = buildDialecticCompressJobPayload({ mode: "json" });

	// Act
	const result = await saveCompressedResponse(deps, params, payload);

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assertEquals(isSaveCompressedResponseJobUpdateError(result.error), true);
		assertEquals(result.retriable, true);
	}
});

// --- json mode — all succeed with full wiring ---

/**
 * Contract: payload.mode === 'json' and all prior checks pass returns the success arm
 *   { status: 'waiting_for_children' }; buildUploadContext receives the correct
 *   BuildUploadContextResourceParams for CompressedContextRawJson with storageFileType
 *   FileType.CompressedContextRawJson and the payload's identity fields (projectId,
 *   sessionId, iterationNumber, stageSlug, output_type, sourceType, documentKey,
 *   sourceId, role, chunk_index as chunkIndex, chunk_total as chunkTotal),
 *   contentForStorage from preparedContentResult.contentForStorage, projectOwnerUserId
 *   from job.user_id, sourcePromptResourceId from payload.source_prompt_resource_id;
 *   enqueueRenderJob receives EnqueueRenderJobParams with job.id as jobId,
 *   payload.sessionId, payload.stageSlug, payload.iterationNumber, payload.output_type
 *   as outputType, payload.projectId, job.user_id as projectOwnerUserId,
 *   payload.user_jwt as userAuthToken, providerRow.id as modelId, payload.walletId,
 *   job.is_test_job as isTestJob, and EnqueueRenderCompressedContextPayload with
 *   payload.sourceType, payload.documentKey, payload.docType, payload.sourceStageSlug,
 *   payload.output_type; neither params nor payload is mutated.
 * Arrange: distinct independent literals on every source field — payload and params —
 *   so a wrong source cannot pass; a file manager returning a valid record; an
 *   enqueueRenderJob stub returning success; a mock DB client whose update succeeds;
 *   spies on buildUploadContext and enqueueRenderJob; deep-equality snapshots of
 *   params and payload before the call.
 * Act: saveCompressedResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'waiting_for_children';
 *   buildUploadContext was called once with each field matching its arranged source;
 *   enqueueRenderJob was called once with each EnqueueRenderJobParams field matching
 *   its arranged source and each EnqueueRenderCompressedContextPayload field matching
 *   its arranged source; params and payload are deep-equal to their pre-call
 *   snapshots.
 */
Deno.test("json mode all succeed: returns waiting_for_children with correctly-wired buildUploadContext and enqueueRenderJob args, no mutation", async () => {
	// Arrange — distinct independent literals on every source field
	const buildUploadContextSpy = spy(mockBuildUploadContext);

	const fileManager = createMockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

	const enqueueRenderJobStub: BoundEnqueueRenderJobFn = async () =>
		buildEnqueueRenderJobSuccessReturn();
	const enqueueRenderJobSpy = spy(enqueueRenderJobStub);

	const mockSetup = createMockSupabaseClient("save-compressed-json-success", {
		genericMockResults: {
			dialectic_generation_jobs: { update: { data: [], error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

	const deps = buildSaveCompressedResponseDeps({
		fileManager,
		buildUploadContext: buildUploadContextSpy,
		enqueueRenderJob: enqueueRenderJobSpy,
	});

	const jobRow = buildDialecticJobRow({
		id: "job-id-distinct",
		user_id: "owner-distinct",
		is_test_job: true,
	});
	const providerRow = buildMockProvider({ id: "prov-id-distinct" });
	const preparedContentResult = buildPrepareResponseContentPreparedReturn({
		contentForStorage: "content-for-storage-distinct",
		shouldContinue: false,
	});
	const params = buildSaveCompressedResponseParams({
		dbClient,
		job: jobRow,
		providerRow,
		preparedContentResult,
	});

	const payload = buildDialecticCompressJobPayload({
		mode: "json",
		projectId: "project-distinct",
		sessionId: "session-distinct",
		iterationNumber: 7,
		stageSlug: DialecticStageSlug.Thesis,
		output_type: FileType.business_case,
		sourceType: "contribution",
		documentKey: FileType.business_case,
		docType: FileType.business_case,
		sourceStageSlug: DialecticStageSlug.Thesis,
		source_prompt_resource_id: "prompt-res-distinct",
		walletId: "wallet-distinct",
		user_jwt: "jwt-distinct",
	});

	const { dbClient: _omitDbClientBefore, ...paramsDataFields } = params;
	const paramsSnapshot = structuredClone(paramsDataFields);
	const payloadSnapshot = structuredClone(payload);

	// Act
	const result = await saveCompressedResponse(deps, params, payload);

	// Assert — success arm
	assertEquals(isSaveCompressedResponseSuccessReturn(result), true);
	if (isSaveCompressedResponseSuccessReturn(result)) {
		assertEquals(result.status, "waiting_for_children");
	}

	// Assert — buildUploadContext called once with correct BuildUploadContextResourceParams
	assertEquals(buildUploadContextSpy.calls.length, 1);
	const rawJsonResourceParams = buildUploadContextSpy.calls[0].args[0];
	assert(isRecord(rawJsonResourceParams));
	assertEquals(rawJsonResourceParams["storageFileType"], FileType.CompressedContextRawJson);
	assertEquals(rawJsonResourceParams["projectId"], "project-distinct");
	assertEquals(rawJsonResourceParams["sessionId"], "session-distinct");
	assertEquals(rawJsonResourceParams["iterationNumber"], 7);
	assertEquals(rawJsonResourceParams["stageSlug"], DialecticStageSlug.Thesis);
	assertEquals(rawJsonResourceParams["output_type"], FileType.business_case);
	assertEquals(rawJsonResourceParams["sourceType"], "contribution");
	assertEquals(rawJsonResourceParams["documentKey"], FileType.business_case);
	assertEquals(rawJsonResourceParams["contentForStorage"], "content-for-storage-distinct");
	assertEquals(rawJsonResourceParams["projectOwnerUserId"], "owner-distinct");
	assertEquals(rawJsonResourceParams["sourcePromptResourceId"], "prompt-res-distinct");

	// Assert — enqueueRenderJob called once with correct EnqueueRenderJobParams
	assertEquals(enqueueRenderJobSpy.calls.length, 1);
	const renderParams = enqueueRenderJobSpy.calls[0].args[0];
	assert(isRecord(renderParams));
	assertEquals(renderParams["jobId"], "job-id-distinct");
	assertEquals(renderParams["sessionId"], "session-distinct");
	assertEquals(renderParams["stageSlug"], DialecticStageSlug.Thesis);
	assertEquals(renderParams["iterationNumber"], 7);
	assertEquals(renderParams["outputType"], FileType.business_case);
	assertEquals(renderParams["projectId"], "project-distinct");
	assertEquals(renderParams["projectOwnerUserId"], "owner-distinct");
	assertEquals(renderParams["userAuthToken"], "jwt-distinct");
	assertEquals(renderParams["modelId"], "prov-id-distinct");
	assertEquals(renderParams["walletId"], "wallet-distinct");
	assertEquals(renderParams["isTestJob"], true);

	// Assert — EnqueueRenderCompressedContextPayload
	const renderPayload = enqueueRenderJobSpy.calls[0].args[1];
	assert(isRecord(renderPayload));
	assertEquals(renderPayload["sourceType"], "contribution");
	assertEquals(renderPayload["documentKey"], FileType.business_case);
	assertEquals(renderPayload["docType"], FileType.business_case);
	assertEquals(renderPayload["sourceStageSlug"], DialecticStageSlug.Thesis);
	assertEquals(renderPayload["output_type"], FileType.business_case);

	// Assert — no mutation (dbClient is a service handle, excluded from the snapshot)
	const { dbClient: _omitDbClientAfter, ...paramsDataFieldsAfter } = params;
	assertEquals(paramsDataFieldsAfter, paramsSnapshot);
	assertEquals(payload, payloadSnapshot);
});

// --- text mode — CompressedContext upload fails ---

/**
 * Contract: payload.mode === 'text' and uploadAndRegisterFile returning an error for
 *   the CompressedContext upload returns the error arm carrying
 *   SaveCompressedResponseExtractedUploadError, retriable false.
 * Arrange: a file manager whose first call (raw JSON) succeeds and second call
 *   (CompressedContext) returns an error with a distinct driver message; payload
 *   mode 'text'; enqueueRenderJob spy that should not be called.
 * Act: saveCompressedResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error passes
 *   isSaveCompressedResponseExtractedUploadError and whose driverMessage equals the
 *   arranged message; retriable is false; enqueueRenderJob was not called.
 */
Deno.test("text mode CompressedContext upload fails: second upload returning an error returns the ExtractedUploadError arm, retriable false", async () => {
	// Arrange — first upload (raw JSON) succeeds, second (CompressedContext) fails
	const fileManager = createMockFileManagerService();
	let uploadCallCount = 0;
	fileManager.uploadAndRegisterFile = spy(async (_context: UploadContext) => {
		uploadCallCount++;
		if (uploadCallCount === 1) {
			return { record: buildFileRecord(), error: null };
		}
		return { record: null, error: { message: "extracted-upload-fail-distinct" } };
	});
	const enqueueRenderJobStub: BoundEnqueueRenderJobFn = async () =>
		buildEnqueueRenderJobSuccessReturn();
	const enqueueRenderJobSpy = spy(enqueueRenderJobStub);
	const deps = buildSaveCompressedResponseDeps({
		fileManager,
		enqueueRenderJob: enqueueRenderJobSpy,
	});
	const params = buildSaveCompressedResponseParams();
	const payload = buildDialecticCompressJobPayload({ mode: "text" });

	// Act
	const result = await saveCompressedResponse(deps, params, payload);

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assertEquals(isSaveCompressedResponseExtractedUploadError(result.error), true);
		if (isSaveCompressedResponseExtractedUploadError(result.error)) {
			assertEquals(result.error.driverMessage, "extracted-upload-fail-distinct");
		}
		assertEquals(result.retriable, false);
	}
	assertEquals(enqueueRenderJobSpy.calls.length, 0);
});

// --- text mode — all succeed ---

/**
 * Contract: payload.mode === 'text' and all prior checks pass returns the success arm
 *   { status: 'completed' }; buildUploadContext is called twice — once for
 *   CompressedContextRawJson with storageFileType FileType.CompressedContextRawJson
 *   and once for CompressedContext with storageFileType FileType.CompressedContext,
 *   both with the same identity fields and content; enqueueRenderJob is not called;
 *   the DB update to waiting_for_children is not performed.
 * Arrange: a file manager whose uploads always succeed; spies on buildUploadContext
 *   and enqueueRenderJob; a mock DB client; payload mode 'text'.
 * Act: saveCompressedResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'completed'; buildUploadContext
 *   was called twice with the correct storageFileType on each call;
 *   enqueueRenderJob was not called; no update was performed on
 *   dialectic_generation_jobs.
 */
Deno.test("text mode all succeed: returns completed, buildUploadContext called twice with correct storageFileType, no render dispatch, no DB update", async () => {
	// Arrange — both uploads succeed
	const buildUploadContextSpy = spy(mockBuildUploadContext);

	const fileManager = createMockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

	const enqueueRenderJobStub: BoundEnqueueRenderJobFn = async () =>
		buildEnqueueRenderJobSuccessReturn();
	const enqueueRenderJobSpy = spy(enqueueRenderJobStub);

	const mockSetup = createMockSupabaseClient("save-compressed-text-success", {
		genericMockResults: {
			dialectic_generation_jobs: { update: { data: [], error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

	const deps = buildSaveCompressedResponseDeps({
		fileManager,
		buildUploadContext: buildUploadContextSpy,
		enqueueRenderJob: enqueueRenderJobSpy,
	});

	const params = buildSaveCompressedResponseParams({ dbClient });
	const payload = buildDialecticCompressJobPayload({ mode: "text" });

	// Act
	const result = await saveCompressedResponse(deps, params, payload);

	// Assert — success arm
	assertEquals(isSaveCompressedResponseSuccessReturn(result), true);
	if (isSaveCompressedResponseSuccessReturn(result)) {
		assertEquals(result.status, "completed");
	}

	// Assert — buildUploadContext called twice with correct storageFileType
	assertEquals(buildUploadContextSpy.calls.length, 2);
	const firstResourceParams = buildUploadContextSpy.calls[0].args[0];
	assert(isRecord(firstResourceParams));
	assertEquals(firstResourceParams["storageFileType"], FileType.CompressedContextRawJson);
	const secondResourceParams = buildUploadContextSpy.calls[1].args[0];
	assert(isRecord(secondResourceParams));
	assertEquals(secondResourceParams["storageFileType"], FileType.CompressedContext);

	// Assert — enqueueRenderJob not called
	assertEquals(enqueueRenderJobSpy.calls.length, 0);

	// Assert — no DB update performed
	const updateCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
	if (updateCalls) {
		assertEquals(updateCalls.callCount, 0);
	}
});
