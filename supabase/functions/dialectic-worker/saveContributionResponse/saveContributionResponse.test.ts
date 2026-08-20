import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { FileType, DialecticStageSlug } from "../../_shared/types/file_manager.types.ts";
import type { BuildUploadContextFn } from "../createJobContext/JobContext.interface.ts";
import { mockBuildUploadContext } from "../../_shared/utils/buildUploadContext/buildUploadContext.mock.ts";
import {
	buildDialecticContributionRow,
	buildDialecticJobRow,
	buildDialecticExecuteJobPayload,
	buildDocumentRelationships,
	buildUnifiedAIResponse,
} from "../../_shared/dialectic.mock.ts";
import { buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";
import {
	createMockFileManagerService,
	buildCanonicalPathParams,
	buildResourceUploadContext,
	buildResourcePathContext,
	buildFileRecord,
} from "../../_shared/services/file_manager.mock.ts";
import { buildPrepareResponseContentPreparedReturn } from "../prepareResponseContent/prepareResponseContent.mock.ts";
import {
	buildResolveContributionIdentitySuccessReturn,
	buildResolveContributionIdentityErrorReturn,
} from "../resolveContributionIdentity/resolveContributionIdentity.mock.ts";
import {
	buildPersistContributionRelationshipsPersistedReturn,
	buildPersistContributionRelationshipsErrorReturn,
} from "../persistContributionRelationships/persistContributionRelationships.mock.ts";
import {
	buildFinalizeContributionJobSuccessReturn,
	buildFinalizeContributionJobErrorReturn,
} from "../finalizeContributionJob/finalizeContributionJob.mock.ts";
import { saveContributionResponse } from "./saveContributionResponse.ts";
import {
	isSaveContributionResponseSuccessReturn,
	isSaveContributionResponseBuildContextError,
	isSaveContributionResponseUploadError,
	isSaveContributionResponseContributionRecordError,
} from "./saveContributionResponse.guard.ts";
import {
	buildSaveContributionResponseDeps,
	buildSaveContributionResponseParams,
} from "./saveContributionResponse.mock.ts";
import type { BoundResolveContributionIdentityFn } from "../resolveContributionIdentity/resolveContributionIdentity.interface.ts";
import type { BoundPersistContributionRelationshipsFn } from "../persistContributionRelationships/persistContributionRelationships.interface.ts";
import type { BoundFinalizeContributionJobFn } from "../finalizeContributionJob/finalizeContributionJob.interface.ts";

// --- identity resolution fails ---

/**
 * Contract: resolveContributionIdentity returning its error arm propagates that error
 *   unchanged on this module's error arm, and uploadAndRegisterFile is not called.
 * Arrange: a resolveContributionIdentity stub returning a distinct error arm; a file
 *   manager whose uploadAndRegisterFile spy should not be called.
 * Act: saveContributionResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error is the same reference as the identity
 *   error's error and whose retriable matches; uploadAndRegisterFile was not called.
 * Boundary: resolveContributionIdentity — the bound identity-resolution collaborator.
 * Mocked: buildResolveContributionIdentityErrorReturn, createMockFileManagerService,
 *   buildSaveContributionResponseDeps, buildSaveContributionResponseParams,
 *   buildDialecticExecuteJobPayload.
 */
Deno.test("identity resolution fails: resolveContributionIdentity returning its error arm propagates it unchanged and uploadAndRegisterFile is not called", async () => {
	// Arrange — identity returns a distinct error arm
	const identityError = buildResolveContributionIdentityErrorReturn({
		error: new Error("identity-fail-distinct"),
		retriable: true,
	});
	const resolveIdentityStub: BoundResolveContributionIdentityFn = async () => identityError;
	const fileManager = createMockFileManagerService();
	const deps = buildSaveContributionResponseDeps({
		resolveContributionIdentity: resolveIdentityStub,
		fileManager,
	});
	const params = buildSaveContributionResponseParams();
	const payload = buildDialecticExecuteJobPayload();

	// Act
	const result = await saveContributionResponse(deps, params, payload);

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assert(result.error === identityError.error);
		assertEquals(result.retriable, identityError.retriable);
	}
	assertEquals(fileManager.uploadAndRegisterFile.calls.length, 0);
});

// --- build-context returns non-contribution context ---

/**
 * Contract: buildUploadContext returning a context that fails isModelContributionContext
 *   returns the error arm carrying SaveContributionResponseBuildContextError, retriable
 *   false, and uploadAndRegisterFile is not called.
 * Arrange: a buildUploadContext stub returning a ResourceUploadContext (no
 *   contributionMetadata); a file manager whose uploadAndRegisterFile spy should not
 *   be called.
 * Act: saveContributionResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error passes
 *   isSaveContributionResponseBuildContextError; retriable is false;
 *   uploadAndRegisterFile was not called.
 * Boundary: buildUploadContext — the upload-context factory dep.
 * Mocked: buildResourceUploadContext, buildResourcePathContext,
 *   createMockFileManagerService, buildSaveContributionResponseDeps,
 *   buildSaveContributionResponseParams, buildDialecticExecuteJobPayload.
 */
Deno.test("build-context non-contribution: buildUploadContext returning a non-contribution context returns the BuildContextError arm, retriable false", async () => {
	// Arrange — buildUploadContext returns a ResourceUploadContext (no contributionMetadata)
	const buildUploadContextStub: BuildUploadContextFn = () =>
		buildResourceUploadContext(buildResourcePathContext());
	const fileManager = createMockFileManagerService();
	const deps = buildSaveContributionResponseDeps({
		buildUploadContext: buildUploadContextStub,
		fileManager,
	});
	const params = buildSaveContributionResponseParams();
	const payload = buildDialecticExecuteJobPayload();

	// Act
	const result = await saveContributionResponse(deps, params, payload);

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assertEquals(isSaveContributionResponseBuildContextError(result.error), true);
		assertEquals(result.retriable, false);
	}
	assertEquals(fileManager.uploadAndRegisterFile.calls.length, 0);
});

// --- upload fails with error ---

/**
 * Contract: uploadAndRegisterFile returning { record: null, error } returns the error arm
 *   carrying SaveContributionResponseUploadError with the driver's message, retriable false.
 * Arrange: a file manager configured to return an error carrying a distinct driver message.
 * Act: saveContributionResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error passes
 *   isSaveContributionResponseUploadError and whose driverMessage equals the arranged
 *   message; retriable is false.
 * Boundary: fileManager.uploadAndRegisterFile — the file upload dep.
 * Mocked: createMockFileManagerService, buildSaveContributionResponseDeps,
 *   buildSaveContributionResponseParams, buildDialecticExecuteJobPayload.
 */
Deno.test("upload fails with error: uploadAndRegisterFile returning an error returns the UploadError arm carrying the driver message, retriable false", async () => {
	// Arrange — upload returns an error with a distinct driver message
	const fileManager = createMockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(null, { message: "upload-driver-fail-distinct" });
	const deps = buildSaveContributionResponseDeps({ fileManager });
	const params = buildSaveContributionResponseParams();
	const payload = buildDialecticExecuteJobPayload();

	// Act
	const result = await saveContributionResponse(deps, params, payload);

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assertEquals(isSaveContributionResponseUploadError(result.error), true);
		if (isSaveContributionResponseUploadError(result.error)) {
			assertEquals(result.error.driverMessage, "upload-driver-fail-distinct");
		}
		assertEquals(result.retriable, false);
	}
});

// --- upload returns non-contribution record ---

/**
 * Contract: uploadAndRegisterFile returning a record that fails isDialecticContribution
 *   returns the error arm carrying SaveContributionResponseContributionRecordError,
 *   retriable false.
 * Arrange: a file manager configured to return a DialecticProjectResourceRow (a FileRecord
 *   that is not a DialecticContributionRow).
 * Act: saveContributionResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error passes
 *   isSaveContributionResponseContributionRecordError; retriable is false.
 * Boundary: fileManager.uploadAndRegisterFile — the file upload dep, narrowed by
 *   isDialecticContribution.
 * Mocked: createMockFileManagerService, buildFileRecord,
 *   buildSaveContributionResponseDeps, buildSaveContributionResponseParams,
 *   buildDialecticExecuteJobPayload.
 */
Deno.test("upload returns non-contribution record: uploadAndRegisterFile returning a non-contribution record returns the ContributionRecordError arm, retriable false", async () => {
	// Arrange — upload returns a project resource row (not a contribution row)
	const fileManager = createMockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
	const deps = buildSaveContributionResponseDeps({ fileManager });
	const params = buildSaveContributionResponseParams();
	const payload = buildDialecticExecuteJobPayload();

	// Act
	const result = await saveContributionResponse(deps, params, payload);

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assertEquals(isSaveContributionResponseContributionRecordError(result.error), true);
		assertEquals(result.retriable, false);
	}
});

// --- relationship persistence fails ---

/**
 * Contract: persistContributionRelationships returning its error arm propagates that
 *   error unchanged on this module's error arm, and finalizeContributionJob is not called.
 * Arrange: a file manager configured to return a valid contribution; a
 *   persistContributionRelationships stub returning a distinct error arm; a
 *   finalizeContributionJob spy that should not be called.
 * Act: saveContributionResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error is the same reference as the persist
 *   error's error and whose retriable matches; finalizeContributionJob was not called.
 * Boundary: persistContributionRelationships — the bound relationship-persistence
 *   collaborator.
 * Mocked: createMockFileManagerService, buildDialecticContributionRow,
 *   buildPersistContributionRelationshipsErrorReturn, buildSaveContributionResponseDeps,
 *   buildSaveContributionResponseParams, buildDialecticExecuteJobPayload.
 */
Deno.test("persist fails: persistContributionRelationships returning its error arm propagates it unchanged and finalizeContributionJob is not called", async () => {
	// Arrange — upload succeeds, persist returns a distinct error arm
	const fileManager = createMockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
	const persistError = buildPersistContributionRelationshipsErrorReturn({
		error: new Error("persist-fail-distinct"),
		retriable: true,
	});
	const persistStub: BoundPersistContributionRelationshipsFn = async () => persistError;
	const finalizeSpy = spy(async () => buildFinalizeContributionJobSuccessReturn());
	const deps = buildSaveContributionResponseDeps({
		fileManager,
		persistContributionRelationships: persistStub,
		finalizeContributionJob: finalizeSpy,
	});
	const params = buildSaveContributionResponseParams();
	const payload = buildDialecticExecuteJobPayload();

	// Act
	const result = await saveContributionResponse(deps, params, payload);

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assert(result.error === persistError.error);
		assertEquals(result.retriable, persistError.retriable);
	}
	assertEquals(finalizeSpy.calls.length, 0);
});

// --- finalization fails ---

/**
 * Contract: finalizeContributionJob returning its error arm propagates that error
 *   unchanged on this module's error arm.
 * Arrange: a file manager configured to return a valid contribution; default persist
 *   (success); a finalizeContributionJob stub returning a distinct error arm.
 * Act: saveContributionResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error is the same reference as the finalize
 *   error's error and whose retriable matches.
 * Boundary: finalizeContributionJob — the bound finalization collaborator.
 * Mocked: createMockFileManagerService, buildDialecticContributionRow,
 *   buildFinalizeContributionJobErrorReturn, buildSaveContributionResponseDeps,
 *   buildSaveContributionResponseParams, buildDialecticExecuteJobPayload.
 */
Deno.test("finalize fails: finalizeContributionJob returning its error arm propagates it unchanged", async () => {
	// Arrange — upload and persist succeed, finalize returns a distinct error arm
	const fileManager = createMockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
	const finalizeError = buildFinalizeContributionJobErrorReturn({
		error: new Error("finalize-fail-distinct"),
		retriable: true,
	});
	const finalizeStub: BoundFinalizeContributionJobFn = async () => finalizeError;
	const deps = buildSaveContributionResponseDeps({
		fileManager,
		finalizeContributionJob: finalizeStub,
	});
	const params = buildSaveContributionResponseParams();
	const payload = buildDialecticExecuteJobPayload();

	// Act
	const result = await saveContributionResponse(deps, params, payload);

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assert(result.error === finalizeError.error);
		assertEquals(result.retriable, finalizeError.retriable);
	}
});

// --- happy path 'completed' with full wiring ---

/**
 * Contract: all collaborators succeeding returns the success arm whose status equals
 *   finalizeContributionJob's success status ('completed'); buildUploadContext receives
 *   the identity result's restOfCanonicalPathParams, storageFileType, sourceGroupFragment,
 *   isContinuationForStorage, targetContributionId, description alongside the payload's
 *   projectId, sessionId, iterationNumber, document_key, continuation_count,
 *   source_prompt_resource_id, document_relationships, isIntermediate and the params'
 *   providerRow.api_identifier, job.attempt_count, job.user_id, assembledResponse.inputTokens,
 *   assembledResponse.outputTokens, assembledResponse.processingTimeMs,
 *   preparedContentResult.contentForStorage; persistContributionRelationships receives
 *   the upload's savedResult.record as contribution and the identity result's
 *   isContinuationForStorage; finalizeContributionJob receives the persist result's
 *   contribution (not the upload's raw record) and the identity result's storageFileType
 *   and isContinuationForStorage.
 * Arrange: distinct independent literals on every source field — identity result, payload,
 *   and params — so a wrong source cannot pass; a file manager returning a distinct
 *   contribution; a persist stub returning a distinct contribution; a finalize stub
 *   returning status 'completed'; spies on buildUploadContext, persist, and finalize.
 * Act: saveContributionResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'completed'; buildUploadContext was
 *   called once with each field matching its arranged source; persist was called once
 *   with contribution equal to the upload's record and isContinuationForStorage equal to
 *   the identity result's; finalize was called once with contribution equal to the persist
 *   result's contribution (not the upload's record), storageFileType equal to the identity
 *   result's, and isContinuationForStorage equal to the identity result's.
 * Boundary: all five deps — fileManager, buildUploadContext, resolveContributionIdentity,
 *   persistContributionRelationships, finalizeContributionJob.
 * Mocked: buildResolveContributionIdentitySuccessReturn, buildCanonicalPathParams,
 *   createMockFileManagerService, buildDialecticContributionRow, buildMockProvider,
 *   buildDialecticJobRow, buildUnifiedAIResponse, buildPrepareResponseContentPreparedReturn,
 *   buildDialecticExecuteJobPayload, buildDocumentRelationships, mockBuildUploadContext,
 *   buildPersistContributionRelationshipsPersistedReturn,
 *   buildFinalizeContributionJobSuccessReturn, buildSaveContributionResponseDeps,
 *   buildSaveContributionResponseParams.
 */
Deno.test("happy path 'completed': all collaborators succeed, status is 'completed', and each collaborator receives the correctly-wired args", async () => {
	// Arrange — distinct independent literals on every source field
	const identityResult = buildResolveContributionIdentitySuccessReturn({
		restOfCanonicalPathParams: buildCanonicalPathParams({ stageSlug: DialecticStageSlug.Antithesis }),
		storageFileType: FileType.Synthesis,
		sourceGroupFragment: "sg-frag-distinct",
		isContinuationForStorage: true,
		targetContributionId: "target-id-distinct",
		description: "desc-distinct",
	});
	const resolveIdentityStub: BoundResolveContributionIdentityFn = async () => identityResult;
	const resolveIdentitySpy = spy(resolveIdentityStub);

	const buildUploadContextSpy = spy(mockBuildUploadContext);

	const fileManager = createMockFileManagerService();
	const uploadedRecord = buildDialecticContributionRow({ id: "uploaded-record-distinct" });
	fileManager.setUploadAndRegisterFileResponse(uploadedRecord, null);

	const persistResult = buildPersistContributionRelationshipsPersistedReturn({
		contribution: buildDialecticContributionRow({ id: "persisted-record-distinct" }),
	});
	const persistStub: BoundPersistContributionRelationshipsFn = async () => persistResult;
	const persistSpy = spy(persistStub);

	const finalizeStub: BoundFinalizeContributionJobFn = async () =>
		buildFinalizeContributionJobSuccessReturn({ status: "completed" });
	const finalizeSpy = spy(finalizeStub);

	const deps = buildSaveContributionResponseDeps({
		resolveContributionIdentity: resolveIdentitySpy,
		buildUploadContext: buildUploadContextSpy,
		fileManager,
		persistContributionRelationships: persistSpy,
		finalizeContributionJob: finalizeSpy,
	});

	const payloadRelationships = buildDocumentRelationships({ thesis: "thesis-rel-distinct" });
	const payload = buildDialecticExecuteJobPayload({
		projectId: "project-distinct",
		sessionId: "session-distinct",
		iterationNumber: 7,
		document_key: FileType.feature_spec,
		continuation_count: 3,
		source_prompt_resource_id: "prompt-res-distinct",
		document_relationships: payloadRelationships,
		isIntermediate: true,
	});

	const params = buildSaveContributionResponseParams({
		providerRow: buildMockProvider({
			api_identifier: "model-slug-distinct",
			id: "prov-id-distinct",
			name: "Prov Name Distinct",
		}),
		job: buildDialecticJobRow({ attempt_count: 4, user_id: "owner-distinct" }),
		assembledResponse: buildUnifiedAIResponse({
			inputTokens: 111,
			outputTokens: 222,
			processingTimeMs: 333,
		}),
		preparedContentResult: buildPrepareResponseContentPreparedReturn({
			contentForStorage: "content-distinct",
		}),
	});

	// Act
	const result = await saveContributionResponse(deps, params, payload);

	// Assert — success arm with status 'completed'
	assertEquals(isSaveContributionResponseSuccessReturn(result), true);
	if (isSaveContributionResponseSuccessReturn(result)) {
		assertEquals(result.status, "completed");
	}

	// Assert — buildUploadContext received the correctly-wired params
	assertEquals(buildUploadContextSpy.calls.length, 1);
	const uploadCtxArgs = buildUploadContextSpy.calls[0].args[0];
	// Branch the union on its discriminant; hold the BuildUploadContextParams arm for the rest
	if (!("restOfCanonicalPathParams" in uploadCtxArgs)) {
		throw new Error("expected BuildUploadContextParams, got BuildUploadContextResourceParams");
	}
	const uploadCtxParams = uploadCtxArgs;
	assertEquals(uploadCtxParams.projectId, "project-distinct");
	assertEquals(uploadCtxParams.storageFileType, FileType.Synthesis);
	assertEquals(uploadCtxParams.sessionId, "session-distinct");
	assertEquals(uploadCtxParams.iterationNumber, 7);
	assertEquals(uploadCtxParams.modelSlug, "model-slug-distinct");
	assertEquals(uploadCtxParams.attemptCount, 4);
	assertEquals(uploadCtxParams.restOfCanonicalPathParams, identityResult.restOfCanonicalPathParams);
	assertEquals(uploadCtxParams.documentKey, FileType.feature_spec);
	assertEquals(uploadCtxParams.contributionType, "thesis");
	assertEquals(uploadCtxParams.isContinuationForStorage, true);
	assertEquals(uploadCtxParams.continuationCount, 3);
	assertEquals(uploadCtxParams.sourceGroupFragment, "sg-frag-distinct");
	assertEquals(uploadCtxParams.contentForStorage, "content-distinct");
	assertEquals(uploadCtxParams.projectOwnerUserId, "owner-distinct");
	assertEquals(uploadCtxParams.description, "desc-distinct");
	assertEquals(uploadCtxParams.providerDetails, { id: "prov-id-distinct", name: "Prov Name Distinct" });
	assertEquals(uploadCtxParams.aiResponse, { inputTokens: 111, outputTokens: 222, processingTimeMs: 333 });
	assertEquals(uploadCtxParams.sourcePromptResourceId, "prompt-res-distinct");
	assertEquals(uploadCtxParams.targetContributionId, "target-id-distinct");
	assertEquals(uploadCtxParams.documentRelationships, payloadRelationships);
	assertEquals(uploadCtxParams.isIntermediate, true);

	// Assert — persist received the upload's record as contribution and identity's isContinuationForStorage
	assertEquals(persistSpy.calls.length, 1);
	const persistParams = persistSpy.calls[0].args[0];
	assertEquals(persistParams.contribution, uploadedRecord);
	assertEquals(persistParams.isContinuationForStorage, identityResult.isContinuationForStorage);

	// Assert — finalize received the persist result's contribution (not the upload's record), identity's storageFileType and isContinuationForStorage
	assertEquals(finalizeSpy.calls.length, 1);
	const finalizeParams = finalizeSpy.calls[0].args[0];
	assertEquals(finalizeParams.contribution, persistResult.contribution);
	assert(finalizeParams.contribution !== uploadedRecord);
	assertEquals(finalizeParams.storageFileType, identityResult.storageFileType);
	assertEquals(finalizeParams.isContinuationForStorage, identityResult.isContinuationForStorage);
});

// --- happy path 'needs_continuation' ---

/**
 * Contract: all collaborators succeeding with finalizeContributionJob returning status
 *   'needs_continuation' returns the success arm with status 'needs_continuation'.
 * Arrange: a file manager returning a valid contribution; a finalize stub returning
 *   status 'needs_continuation'.
 * Act: saveContributionResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'needs_continuation'.
 * Boundary: finalizeContributionJob — the bound finalization collaborator whose status
 *   is forwarded.
 * Mocked: createMockFileManagerService, buildDialecticContributionRow,
 *   buildFinalizeContributionJobSuccessReturn, buildSaveContributionResponseDeps,
 *   buildSaveContributionResponseParams, buildDialecticExecuteJobPayload.
 */
Deno.test("happy path 'needs_continuation': all collaborators succeed and status is 'needs_continuation'", async () => {
	// Arrange — upload succeeds, finalize returns 'needs_continuation'
	const fileManager = createMockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
	const finalizeStub: BoundFinalizeContributionJobFn = async () =>
		buildFinalizeContributionJobSuccessReturn({ status: "needs_continuation" });
	const deps = buildSaveContributionResponseDeps({ fileManager, finalizeContributionJob: finalizeStub });
	const params = buildSaveContributionResponseParams();
	const payload = buildDialecticExecuteJobPayload();

	// Act
	const result = await saveContributionResponse(deps, params, payload);

	// Assert
	assertEquals(isSaveContributionResponseSuccessReturn(result), true);
	if (isSaveContributionResponseSuccessReturn(result)) {
		assertEquals(result.status, "needs_continuation");
	}
});

// --- happy path 'continuation_limit_reached' ---

/**
 * Contract: all collaborators succeeding with finalizeContributionJob returning status
 *   'continuation_limit_reached' returns the success arm with status
 *   'continuation_limit_reached'.
 * Arrange: a file manager returning a valid contribution; a finalize stub returning
 *   status 'continuation_limit_reached'.
 * Act: saveContributionResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'continuation_limit_reached'.
 * Boundary: finalizeContributionJob — the bound finalization collaborator whose status
 *   is forwarded.
 * Mocked: createMockFileManagerService, buildDialecticContributionRow,
 *   buildFinalizeContributionJobSuccessReturn, buildSaveContributionResponseDeps,
 *   buildSaveContributionResponseParams, buildDialecticExecuteJobPayload.
 */
Deno.test("happy path 'continuation_limit_reached': all collaborators succeed and status is 'continuation_limit_reached'", async () => {
	// Arrange — upload succeeds, finalize returns 'continuation_limit_reached'
	const fileManager = createMockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
	const finalizeStub: BoundFinalizeContributionJobFn = async () =>
		buildFinalizeContributionJobSuccessReturn({ status: "continuation_limit_reached" });
	const deps = buildSaveContributionResponseDeps({ fileManager, finalizeContributionJob: finalizeStub });
	const params = buildSaveContributionResponseParams();
	const payload = buildDialecticExecuteJobPayload();

	// Act
	const result = await saveContributionResponse(deps, params, payload);

	// Assert
	assertEquals(isSaveContributionResponseSuccessReturn(result), true);
	if (isSaveContributionResponseSuccessReturn(result)) {
		assertEquals(result.status, "continuation_limit_reached");
	}
});

// --- neither params nor payload is mutated ---

/**
 * Contract: a successful invocation leaves params and payload deep-equal to their
 *   pre-call snapshots — no field is mutated on any path.
 * Arrange: a full happy-path arrangement with distinct values; deep snapshots of each
 *   params sub-object (job, providerRow, modelConfig, assembledResponse,
 *   preparedContentResult) and the payload taken before the call.
 * Act: saveContributionResponse over the arranged deps, params, payload.
 * Assert: each params sub-object and the payload are deep-equal to their pre-call
 *   snapshots.
 * Boundary: the function's own params and payload slots — proven not mutated.
 * Mocked: createMockFileManagerService, buildDialecticContributionRow,
 *   buildSaveContributionResponseDeps, buildSaveContributionResponseParams,
 *   buildDialecticExecuteJobPayload.
 */
Deno.test("no mutation: a successful invocation leaves params and payload deep-equal to their pre-call snapshots", async () => {
	// Arrange — full happy path
	const fileManager = createMockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
	const deps = buildSaveContributionResponseDeps({ fileManager });
	const params = buildSaveContributionResponseParams();
	const payload = buildDialecticExecuteJobPayload();

	// Snapshot — deep-clone each params sub-object (dbClient holds functions, excluded)
	// and the payload (plain object, fully cloneable)
	const jobSnapshot = structuredClone(params.job);
	const providerRowSnapshot = structuredClone(params.providerRow);
	const modelConfigSnapshot = structuredClone(params.modelConfig);
	const assembledResponseSnapshot = structuredClone(params.assembledResponse);
	const preparedContentResultSnapshot = structuredClone(params.preparedContentResult);
	const payloadSnapshot = structuredClone(payload);

	// Act
	await saveContributionResponse(deps, params, payload);

	// Assert — no mutation
	assertEquals(params.job, jobSnapshot);
	assertEquals(params.providerRow, providerRowSnapshot);
	assertEquals(params.modelConfig, modelConfigSnapshot);
	assertEquals(params.assembledResponse, assembledResponseSnapshot);
	assertEquals(params.preparedContentResult, preparedContentResultSnapshot);
	assertEquals(payload, payloadSnapshot);
});
