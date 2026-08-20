import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import {
	buildDialecticContributionRow,
	buildDialecticJobRow,
	buildDocumentRelationships,
	buildContextForDocument,
} from "../../_shared/dialectic.mock.ts";
import { buildPrepareResponseContentPreparedReturn } from "../prepareResponseContent/prepareResponseContent.mock.ts";
import { isModelProcessingResult } from "../../_shared/utils/type_guards.ts";
import { finalizeContributionJob } from "./finalizeContributionJob.ts";
import {
	isFinalizeContributionJobDocumentRelatedError,
	isFinalizeContributionJobRenderDispatchError,
	isFinalizeContributionJobPromptLinkError,
	isFinalizeContributionJobDocumentKeyError,
	isFinalizeContributionJobContinuationError,
	isFinalizeContributionJobCompletionUpdateError,
	isFinalizeContributionJobSuccessReturn,
} from "./finalizeContributionJob.guard.ts";
import {
	buildFinalizeContributionJobDeps,
	buildFinalizeContributionJobParams,
	buildFinalizeContributionJobPayload,
} from "./finalizeContributionJob.mock.ts";
import { buildEnqueueRenderJobSuccessReturn, buildEnqueueRenderJobErrorReturn } from "../enqueueRenderJob/enqueueRenderJob.mock.ts";
import { buildContinueJobEnqueuedReturn, buildContinueJobLimitReachedReturn, buildContinueJobErrorReturn } from "../continueJob/continueJob.mock.ts";
import { createMockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import { mockNotificationService, resetMockNotificationService } from "../../_shared/utils/notification.service.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import type { BoundEnqueueRenderJobFn } from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import type { BoundContinueJobFn } from "../continueJob/continueJob.interface.ts";

/**
 * Contract: a contribution whose document_relationships carry a non-empty string at the
 *   stage slug yields that value as stageRelationshipForStage, so the document-related check
 *   passes and the function does not return the DocumentRelatedError arm.
 * Arrange: the builder's default contribution already carries a non-empty thesis entry.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the result is not the error arm carrying a DocumentRelatedError.
 */
Deno.test("stageRelationshipForStage: a contribution whose document_relationships carry a non-empty string at the stage slug yields that value (function proceeds past the document-related check)", async () => {
	// Arrange — default contribution already has non-empty thesis entry
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildFinalizeContributionJobDeps();
	const params = buildFinalizeContributionJobParams({ dbClient });

	// Act
	const result = await finalizeContributionJob(deps, params, buildFinalizeContributionJobPayload());

	// Assert
	assertEquals(
		"error" in result && isFinalizeContributionJobDocumentRelatedError(result.error),
		false,
	);
});

/**
 * Contract: a contribution whose document_relationships are null yields stageRelationshipForStage
 *   undefined; with a document-related storageFileType, the document-related check consumes that
 *   undefined and returns the DocumentRelatedError arm, retriable false.
 * Arrange: a contribution with null document_relationships (default storageFileType is
 *   already document-related).
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error passes isFinalizeContributionJobDocumentRelatedError,
 *   with retriable false.
 */
Deno.test("stageRelationshipForStage: a contribution with null document_relationships yields undefined, and the document-related check returns the DocumentRelatedError arm", async () => {
	// Arrange — null relationships (default storageFileType is document-related)
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildFinalizeContributionJobDeps();
	const params = buildFinalizeContributionJobParams({
		dbClient,
		contribution: buildDialecticContributionRow({ document_relationships: null }),
	});

	// Act
	const result = await finalizeContributionJob(deps, params, buildFinalizeContributionJobPayload());

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assertEquals(isFinalizeContributionJobDocumentRelatedError(result.error), true);
		assertEquals(result.retriable, false);
	}
});

/**
 * Contract: a document-related storageFileType with no stageRelationshipForStage (empty string
 *   at the stage slug) returns the error arm carrying FinalizeContributionJobDocumentRelatedError,
 *   with retriable false.
 * Arrange: a contribution whose document_relationships carry thesis -> '' (empty string
 *   after trim); default storageFileType is already document-related.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error passes isFinalizeContributionJobDocumentRelatedError,
 *   with retriable false.
 */
Deno.test("Document-related check: a document-related storageFileType with no stageRelationshipForStage returns the DocumentRelatedError arm, retriable false", async () => {
	// Arrange — empty-string stage entry (default storageFileType is document-related)
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildFinalizeContributionJobDeps();
	const params = buildFinalizeContributionJobParams({
		dbClient,
		contribution: buildDialecticContributionRow({
			document_relationships: buildDocumentRelationships({ thesis: "" }),
		}),
	});

	// Act
	const result = await finalizeContributionJob(deps, params, buildFinalizeContributionJobPayload());

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assertEquals(isFinalizeContributionJobDocumentRelatedError(result.error), true);
		assertEquals(result.retriable, false);
	}
});

// --- RENDER dispatch — success ---

/**
 * Contract: a non-continuation with a valid user_jwt and a valid DialecticStageSlug calls
 *   deps.enqueueRenderJob with the assembled params and payload; when the render result's
 *   renderJobId is not null, shouldRender is set true (observed via the final-chunk assembly
 *   being skipped on shouldRender). Each render params field equals the arranged independent
 *   literal.
 * Arrange: needsContinuation false (default), a final-chunk path (default resolvedFinishReason
 *   'stop') with a rootIdFromSaved distinct from contribution.id so assembly would run unless
 *   shouldRender skips it; an enqueueRenderJob stub returning a non-null renderJobId; payload
 *   fields set to independent literals for assertion.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: enqueueRenderJob was called once; its params' jobId, sessionId, stageSlug,
 *   iterationNumber, outputType, projectId, projectOwnerUserId, userAuthToken, modelId, walletId,
 *   isTestJob each equal the arranged independent literal; assembleAndSaveFinalDocument was not
 *   called (shouldRender skipped it).
 */
Deno.test("RENDER dispatch — success: a non-continuation with valid user_jwt and stageSlug calls enqueueRenderJob with the assembled params; renderJobId not null sets shouldRender true", async () => {
	// Arrange — non-continuation (default), final-chunk path (default), render returns non-null id
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const fileManager = createMockFileManagerService();
	const enqueueRenderJobFn: BoundEnqueueRenderJobFn = async (_params, _payload) =>
		buildEnqueueRenderJobSuccessReturn({ renderJobId: "render-job-non-null" });
	const enqueueRenderJobSpy = spy(enqueueRenderJobFn);
	const deps = buildFinalizeContributionJobDeps({
		fileManager,
		enqueueRenderJob: enqueueRenderJobSpy,
	});
	const jobId = "job-render-success";
	const projectOwnerUserId = "owner-render-success";
	const contributionId = "contrib-render-success";
	const rootIdDistinct = "root-distinct-render-success";
	const params = buildFinalizeContributionJobParams({
		dbClient,
		job: buildDialecticJobRow({ id: jobId, user_id: projectOwnerUserId, attempt_count: 2, is_test_job: true }),
		contribution: buildDialecticContributionRow({
			id: contributionId,
			user_id: projectOwnerUserId,
			document_relationships: buildDocumentRelationships({ thesis: rootIdDistinct }),
		}),
	});
	const payload = buildFinalizeContributionJobPayload({
		sessionId: "session-render-success",
		projectId: "project-render-success",
		iterationNumber: 3,
		walletId: "wallet-render-success",
		user_jwt: "jwt-render-success",
		model_id: "model-render-success",
		output_type: FileType.business_case,
	});

	// Act
	const result = await finalizeContributionJob(deps, params, payload);

	// Assert
	assertEquals(enqueueRenderJobSpy.calls.length, 1);
	const renderParams = enqueueRenderJobSpy.calls[0].args[0];
	assertEquals(renderParams.jobId, jobId);
	assertEquals(renderParams.sessionId, "session-render-success");
	assertEquals(renderParams.stageSlug, "thesis");
	assertEquals(renderParams.iterationNumber, 3);
	assertEquals(renderParams.outputType, FileType.business_case);
	assertEquals(renderParams.projectId, "project-render-success");
	assertEquals(renderParams.projectOwnerUserId, projectOwnerUserId);
	assertEquals(renderParams.userAuthToken, "jwt-render-success");
	assertEquals(renderParams.modelId, "model-render-success");
	assertEquals(renderParams.walletId, "wallet-render-success");
	assertEquals(renderParams.isTestJob, true);
	assertEquals(fileManager.assembleAndSaveFinalDocument.calls.length, 0);
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
});

// --- RENDER dispatch — skip on missing user_jwt ---

/**
 * Contract: a non-continuation with an empty user_jwt logs a warning and does not call
 *   deps.enqueueRenderJob.
 * Arrange: an empty user_jwt (defaults already non-continuation); an enqueueRenderJob spy
 *   that should not be called.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: enqueueRenderJob was not called; a warning was logged; the function returned a
 *   success arm.
 */
Deno.test("RENDER dispatch — skip on missing user_jwt: an empty user_jwt logs a warning and does not call enqueueRenderJob", async () => {
	// Arrange — empty user_jwt (defaults already non-continuation)
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const enqueueRenderJobFn: BoundEnqueueRenderJobFn = async (_params, _payload) =>
		buildEnqueueRenderJobSuccessReturn();
	const enqueueRenderJobSpy = spy(enqueueRenderJobFn);
	const logger = new MockLogger();
	const warnSpy = spy(logger, "warn");
	const deps = buildFinalizeContributionJobDeps({
		logger,
		enqueueRenderJob: enqueueRenderJobSpy,
	});
	const params = buildFinalizeContributionJobParams({ dbClient });

	// Act
	const result = await finalizeContributionJob(deps, params, buildFinalizeContributionJobPayload({ user_jwt: "" }));

	// Assert
	assertEquals(enqueueRenderJobSpy.calls.length, 0);
	assertEquals(warnSpy.calls.length >= 1, true);
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
});

// --- RENDER dispatch — invalid stageSlug ---

/**
 * Contract: a stageSlug that fails isDialecticStageSlug returns the error arm carrying
 *   FinalizeContributionJobDocumentRelatedError, retriable false, and does not call
 *   deps.enqueueRenderJob.
 * Arrange: a stageSlug that is not a member of DialecticStageSlug (defaults already
 *   non-continuation with valid user_jwt); an enqueueRenderJob spy that should not be called.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error passes isFinalizeContributionJobDocumentRelatedError,
 *   with retriable false; enqueueRenderJob was not called.
 */
Deno.test("RENDER dispatch — invalid stageSlug: a stageSlug that fails isDialecticStageSlug returns the DocumentRelatedError arm, retriable false, and does not call enqueueRenderJob", async () => {
	// Arrange — invalid stageSlug (defaults already non-continuation with valid user_jwt)
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const enqueueRenderJobFn: BoundEnqueueRenderJobFn = async (_params, _payload) =>
		buildEnqueueRenderJobSuccessReturn();
	const enqueueRenderJobSpy = spy(enqueueRenderJobFn);
	const deps = buildFinalizeContributionJobDeps({
		enqueueRenderJob: enqueueRenderJobSpy,
	});
	const params = buildFinalizeContributionJobParams({ dbClient });

	// Act
	const result = await finalizeContributionJob(deps, params, buildFinalizeContributionJobPayload({ stageSlug: "not-a-real-stage" }));

	// Assert
	assertEquals(enqueueRenderJobSpy.calls.length, 0);
	assertEquals("error" in result, true);
	if ("error" in result) {
		assertEquals(isFinalizeContributionJobDocumentRelatedError(result.error), true);
		assertEquals(result.retriable, false);
	}
});

// --- RENDER dispatch — error ---

/**
 * Contract: deps.enqueueRenderJob returning its error arm returns this module's error arm
 *   whose error passes isFinalizeContributionJobRenderDispatchError, carries the render
 *   error's message, and is retriable false.
 * Arrange: an enqueueRenderJob stub returning its error arm with a distinct driver message
 *   (defaults already non-continuation with valid user_jwt and stageSlug).
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error passes isFinalizeContributionJobRenderDispatchError,
 *   carries the render error's message, and is retriable false.
 */
Deno.test("RENDER dispatch — error: enqueueRenderJob returning its error arm returns this module's RenderDispatchError arm, retriable false", async () => {
	// Arrange — render returns error arm (defaults already non-continuation, valid jwt/stage)
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const renderError = buildEnqueueRenderJobErrorReturn({ error: new Error("render-driver-failure-distinct") });
	const enqueueRenderJobFn: BoundEnqueueRenderJobFn = async (_params, _payload) => renderError;
	const enqueueRenderJobSpy = spy(enqueueRenderJobFn);
	const deps = buildFinalizeContributionJobDeps({ enqueueRenderJob: enqueueRenderJobSpy });
	const jobId = "job-render-err";
	const contributionId = "contrib-render-err";
	const params = buildFinalizeContributionJobParams({
		dbClient,
		job: buildDialecticJobRow({ id: jobId }),
		contribution: buildDialecticContributionRow({
			id: contributionId,
			document_relationships: buildDocumentRelationships({ thesis: "root-render-err" }),
		}),
	});

	// Act
	const result = await finalizeContributionJob(deps, params, buildFinalizeContributionJobPayload());

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assertEquals(isFinalizeContributionJobRenderDispatchError(result.error), true);
		if (isFinalizeContributionJobRenderDispatchError(result.error)) {
			assertEquals(result.error.jobId, jobId);
			assertEquals(result.error.contributionId, contributionId);
			assertEquals(result.error.driverMessage, "render-driver-failure-distinct");
		}
		assertEquals(result.retriable, false);
	}
});

// --- Prompt-resource back-link — success ---

/**
 * Contract: a non-empty source_prompt_resource_id updates dialectic_project_resources with
 *   source_contribution_id equal to params.contribution.id, filtered on the resource id.
 * Arrange: a non-empty source_prompt_resource_id distinct from builder default; a contribution
 *   with a distinct id (defaults already non-continuation).
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: dialectic_project_resources was updated once with source_contribution_id equal to
 *   params.contribution.id and the eq filter was called with the resource id.
 */
Deno.test("Prompt-resource back-link — success: a non-empty source_prompt_resource_id updates dialectic_project_resources with source_contribution_id equal to params.contribution.id, filtered on the resource id", async () => {
	// Arrange — non-empty source_prompt_resource_id, distinct contribution id
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildFinalizeContributionJobDeps();
	const contributionId = "contrib-prompt-link-success";
	const resourceId = "prompt-resource-id-distinct";
	const params = buildFinalizeContributionJobParams({
		dbClient,
		contribution: buildDialecticContributionRow({
			id: contributionId,
			document_relationships: buildDocumentRelationships({ thesis: "root-prompt-link-success" }),
		}),
	});

	// Act
	const result = await finalizeContributionJob(
		deps,
		params,
		buildFinalizeContributionJobPayload({ source_prompt_resource_id: resourceId }),
	);

	// Assert
	const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_project_resources", "update");
	assertExists(updateSpy);
	assertEquals(updateSpy.callCount, 1);
	const updateArgs = updateSpy.callsArgs[0][0];
	if (!isRecord(updateArgs)) throw new Error("update args not a record");
	assertEquals(updateArgs.source_contribution_id, contributionId);
	const eqSpy = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_project_resources", "eq");
	assertExists(eqSpy);
	assertEquals(eqSpy.callCount, 1);
	assertEquals(eqSpy.callsArgs[0][1], resourceId);
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
});

// --- Prompt-resource back-link — DB failure ---

/**
 * Contract: the dialectic_project_resources update returning a driver error returns this
 *   module's error arm whose error passes isFinalizeContributionJobPromptLinkError, carries
 *   the driver's message, and is retriable true.
 * Arrange: a mock client whose dialectic_project_resources update returns a driver error with
 *   a distinct message; a non-empty source_prompt_resource_id.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error passes isFinalizeContributionJobPromptLinkError,
 *   carries the driver's message, and is retriable true.
 */
Deno.test("Prompt-resource back-link — DB failure: the update returning a driver error returns this module's PromptLinkError arm, retriable true", async () => {
	// Arrange — update returns a driver error
	const driverError = new Error("prompt-link-driver-failure-distinct");
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: driverError } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildFinalizeContributionJobDeps();
	const jobId = "job-prompt-link-err";
	const contributionId = "contrib-prompt-link-err";
	const resourceId = "prompt-resource-id-err";
	const params = buildFinalizeContributionJobParams({
		dbClient,
		job: buildDialecticJobRow({ id: jobId }),
		contribution: buildDialecticContributionRow({
			id: contributionId,
			document_relationships: buildDocumentRelationships({ thesis: "root-prompt-link-err" }),
		}),
	});

	// Act
	const result = await finalizeContributionJob(
		deps,
		params,
		buildFinalizeContributionJobPayload({ source_prompt_resource_id: resourceId }),
	);

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assertEquals(isFinalizeContributionJobPromptLinkError(result.error), true);
		if (isFinalizeContributionJobPromptLinkError(result.error)) {
			assertEquals(result.error.jobId, jobId);
			assertEquals(result.error.contributionId, contributionId);
			assertEquals(result.error.promptResourceId, resourceId);
			assertEquals(result.error.driverMessage, "prompt-link-driver-failure-distinct");
		}
		assertEquals(result.retriable, true);
	}
});

// --- Prompt-resource back-link — skip ---

/**
 * Contract: an empty source_prompt_resource_id does not update dialectic_project_resources.
 * Arrange: source_prompt_resource_id set to empty string.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: dialectic_project_resources update spy exists and was not called.
 */
Deno.test("Prompt-resource back-link — skip: an empty source_prompt_resource_id does not update dialectic_project_resources", async () => {
	// Arrange — empty source_prompt_resource_id
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildFinalizeContributionJobDeps();
	const params = buildFinalizeContributionJobParams({ dbClient });

	// Act
	const result = await finalizeContributionJob(
		deps,
		params,
		buildFinalizeContributionJobPayload({ source_prompt_resource_id: "" }),
	);

	// Assert
	const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_project_resources", "update");
	assertExists(updateSpy);
	assertEquals(updateSpy.callCount, 0);
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
});

// --- Chunk-completed notification ---

/**
 * Contract: isContinuationForStorage true and isDocumentRelated(fileType) true and a valid
 *   document_key fires sendJobNotificationEvent with type 'execute_chunk_completed', step_key
 *   and document_key both equal to the arranged document_key.
 * Arrange: isContinuationForStorage true; resolvedFinishReason 'length' and isIntermediate true
 *   to suppress the final-chunk and completion-notification paths; document_key set to a distinct
 *   FileType member.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: sendJobNotificationEvent was called with type 'execute_chunk_completed', step_key
 *   and document_key equal to the arranged FileType member.
 */
Deno.test("Chunk-completed notification: isContinuationForStorage true and document-related and valid document_key fires sendJobNotificationEvent with type 'execute_chunk_completed', step_key and document_key equal to the arranged document_key", async () => {
	// Arrange — continuation-for-storage, distinct FileType document_key
	resetMockNotificationService();
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildFinalizeContributionJobDeps({ notificationService: mockNotificationService });
	const params = buildFinalizeContributionJobParams({
		dbClient,
		isContinuationForStorage: true,
		preparedContentResult: buildPrepareResponseContentPreparedReturn({
			needsContinuation: true,
			resolvedFinishReason: "length",
			isIntermediate: true,
		}),
	});
	const documentKey = FileType.feature_spec;

	// Act
	const result = await finalizeContributionJob(
		deps,
		params,
		buildFinalizeContributionJobPayload({ document_key: documentKey }),
	);

	// Assert
	assertEquals(mockNotificationService.sendJobNotificationEvent.calls.length, 1);
	const eventArg = mockNotificationService.sendJobNotificationEvent.calls[0].args[0];
	assertEquals(eventArg.type, "execute_chunk_completed");
	assertEquals(eventArg.step_key, documentKey);
	assertEquals(eventArg.document_key, documentKey);
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
});

// --- Chunk-completed — missing document_key ---

/**
 * Contract: isContinuationForStorage true and document-related and document_key null returns
 *   the error arm whose error passes isFinalizeContributionJobDocumentKeyError with
 *   notificationType 'execute_chunk_completed', retriable false.
 * Arrange: isContinuationForStorage true; document_key set to null.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error passes isFinalizeContributionJobDocumentKeyError
 *   with notificationType 'execute_chunk_completed', retriable false.
 */
Deno.test("Chunk-completed — missing document_key: isContinuationForStorage true and document-related and document_key null returns the DocumentKeyError arm with notificationType 'execute_chunk_completed'", async () => {
	// Arrange — continuation-for-storage, document_key null
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildFinalizeContributionJobDeps();
	const jobId = "job-chunk-no-key";
	const params = buildFinalizeContributionJobParams({
		dbClient,
		job: buildDialecticJobRow({ id: jobId }),
		isContinuationForStorage: true,
	});

	// Act
	const result = await finalizeContributionJob(
		deps,
		params,
		buildFinalizeContributionJobPayload({ document_key: null }),
	);

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assertEquals(isFinalizeContributionJobDocumentKeyError(result.error), true);
		if (isFinalizeContributionJobDocumentKeyError(result.error)) {
			assertEquals(result.error.jobId, jobId);
			assertEquals(result.error.notificationType, "execute_chunk_completed");
		}
		assertEquals(result.retriable, false);
	}
});

// --- ModelProcessingResult — needs_continuation ---

/**
 * Contract: the modelProcessingResult written to dialectic_generation_jobs.results has status
 *   'needs_continuation' when needsContinuation is true and continueJob returns enqueued;
 *   attempts is job.attempt_count + 1; contributionId is params.contribution.id.
 * Arrange: needsContinuation true; a job with attempt_count 4; a contribution with a distinct id;
 *   continueJob returns enqueued.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the dialectic_generation_jobs update's results JSON contains modelProcessingResult with
 *   status 'needs_continuation', attempts 5, contributionId equal to the arranged contribution id.
 */
Deno.test("ModelProcessingResult — needs_continuation: status is 'needs_continuation' when needsContinuation is true and continueJob returns enqueued; attempts is job.attempt_count + 1; contributionId is params.contribution.id", async () => {
	// Arrange — needsContinuation true, attempt_count 4, continueJob returns enqueued
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const continueJobFn: BoundContinueJobFn = async (_params, _payload) => buildContinueJobEnqueuedReturn();
	const continueJobSpy = spy(continueJobFn);
	const deps = buildFinalizeContributionJobDeps({ continueJob: continueJobSpy });
	const contributionId = "contrib-mpr-needs-cont";
	const params = buildFinalizeContributionJobParams({
		dbClient,
		job: buildDialecticJobRow({ attempt_count: 4 }),
		contribution: buildDialecticContributionRow({
			id: contributionId,
			document_relationships: buildDocumentRelationships({ thesis: "root-mpr-needs-cont" }),
		}),
		preparedContentResult: buildPrepareResponseContentPreparedReturn({
			needsContinuation: true,
			resolvedFinishReason: "length",
			isIntermediate: true,
		}),
	});

	// Act
	const result = await finalizeContributionJob(deps, params, buildFinalizeContributionJobPayload());

	// Assert
	const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
	assertExists(updateSpy);
	assertEquals(updateSpy.callCount, 1);
	const updateArgs = updateSpy.callsArgs[0][0];
	if (!isRecord(updateArgs)) throw new Error("update args not a record");
	const results: unknown = updateArgs.results;
	if (typeof results !== "string") throw new Error("results not a string");
	const parsed: unknown = JSON.parse(results);
	if (!isRecord(parsed)) throw new Error("parsed results not a record");
	const modelProcessingResult: unknown = parsed.modelProcessingResult;
	assert(isModelProcessingResult(modelProcessingResult));
	assertEquals(modelProcessingResult.status, "needs_continuation");
	assertEquals(modelProcessingResult.attempts, 5);
	assertEquals(modelProcessingResult.contributionId, contributionId);
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
});

// --- Continuation — continueJob error ---

/**
 * Contract: deps.continueJob returning its error arm returns this module's error arm whose
 *   error passes isFinalizeContributionJobContinuationError, carries the continuation error's
 *   message, and is retriable true.
 * Arrange: needsContinuation true; a continueJob stub returning its error arm with a distinct
 *   driver message.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error passes isFinalizeContributionJobContinuationError,
 *   carries the driver's message, and is retriable true.
 */
Deno.test("Continuation — continueJob error: deps.continueJob returning its error arm returns this module's ContinuationError arm, retriable true", async () => {
	// Arrange — needsContinuation true, continueJob returns error arm
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const continueJobError = buildContinueJobErrorReturn({ error: new Error("continue-job-driver-failure-distinct") });
	const continueJobFn: BoundContinueJobFn = async (_params, _payload) => continueJobError;
	const continueJobSpy = spy(continueJobFn);
	const deps = buildFinalizeContributionJobDeps({ continueJob: continueJobSpy });
	const jobId = "job-continue-err";
	const params = buildFinalizeContributionJobParams({
		dbClient,
		job: buildDialecticJobRow({ id: jobId }),
		preparedContentResult: buildPrepareResponseContentPreparedReturn({
			needsContinuation: true,
			resolvedFinishReason: "length",
			isIntermediate: true,
		}),
	});

	// Act
	const result = await finalizeContributionJob(deps, params, buildFinalizeContributionJobPayload());

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assertEquals(isFinalizeContributionJobContinuationError(result.error), true);
		if (isFinalizeContributionJobContinuationError(result.error)) {
			assertEquals(result.error.jobId, jobId);
			assertEquals(result.error.driverMessage, "continue-job-driver-failure-distinct");
		}
		assertEquals(result.retriable, true);
	}
});

// --- Continuation — limit reached with cap assembly ---

/**
 * Contract: deps.continueJob returning { enqueued: false, reason: 'continuation_limit_reached' }
 *   sets modelProcessingResult.status to 'continuation_limit_reached'; when rootIdForCapAssembly
 *   is present, differs from params.contribution.id, and shouldRender is false, calls
 *   deps.fileManager.assembleAndSaveFinalDocument with the rootId and the matched context.
 * Arrange: needsContinuation true; continueJob returns limit-reached; a contribution whose
 *   document_relationships carry thesis -> a distinct rootId; a payload whose context_for_documents
 *   contains an entry whose document_key matches the payload's document_key.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: assembleAndSaveFinalDocument was called once with the distinct rootId; the result's
 *   status is 'continuation_limit_reached'.
 */
Deno.test("Continuation — limit reached with cap assembly: continueJob returning limit-reached sets status to 'continuation_limit_reached' and calls assembleAndSaveFinalDocument with the rootId and matched context", async () => {
	// Arrange — needsContinuation true, continueJob returns limit-reached, distinct rootId
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const fileManager = createMockFileManagerService();
	const continueJobFn: BoundContinueJobFn = async (_params, _payload) => buildContinueJobLimitReachedReturn();
	const deps = buildFinalizeContributionJobDeps({ fileManager, continueJob: continueJobFn });
	const rootIdDistinct = "root-distinct-cap-assembly";
	const contributionId = "contrib-cap-assembly";
	const documentKey = FileType.feature_spec;
	const params = buildFinalizeContributionJobParams({
		dbClient,
		contribution: buildDialecticContributionRow({
			id: contributionId,
			document_relationships: buildDocumentRelationships({ thesis: rootIdDistinct }),
		}),
		preparedContentResult: buildPrepareResponseContentPreparedReturn({
			needsContinuation: true,
			resolvedFinishReason: "length",
			isIntermediate: true,
		}),
	});
	const payload = buildFinalizeContributionJobPayload({
		document_key: documentKey,
		context_for_documents: [buildContextForDocument({ document_key: documentKey })],
	});

	// Act
	const result = await finalizeContributionJob(deps, params, payload);

	// Assert
	assertEquals(fileManager.assembleAndSaveFinalDocument.calls.length, 1);
	assertEquals(fileManager.assembleAndSaveFinalDocument.calls[0].args[0], rootIdDistinct);
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
	if (isFinalizeContributionJobSuccessReturn(result)) {
		assertEquals(result.status, "continuation_limit_reached");
	}
});

// --- Continuation — notification ---

/**
 * Contract: sendContributionGenerationContinuedEvent called with continuationNumber equal to
 *   (payload.continuation_count ?? 0) + 1 and contribution equal to params.contribution. The
 *   continuation count and contribution id are arranged as values distinct from builder defaults.
 * Arrange: needsContinuation true; continueJob returns enqueued; a payload with continuation_count
 *   3; a contribution with a distinct id.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: sendContributionGenerationContinuedEvent was called with continuationNumber 4 and
 *   contribution equal to params.contribution.
 */
Deno.test("Continuation — notification: sendContributionGenerationContinuedEvent called with continuationNumber equal to (continuation_count ?? 0) + 1 and contribution equal to params.contribution", async () => {
	// Arrange — needsContinuation true, continuation_count 3, distinct contribution
	resetMockNotificationService();
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const continueJobFn: BoundContinueJobFn = async (_params, _payload) => buildContinueJobEnqueuedReturn();
	const deps = buildFinalizeContributionJobDeps({
		notificationService: mockNotificationService,
		continueJob: continueJobFn,
	});
	const contributionId = "contrib-continuation-notif";
	const params = buildFinalizeContributionJobParams({
		dbClient,
		contribution: buildDialecticContributionRow({
			id: contributionId,
			document_relationships: buildDocumentRelationships({ thesis: "root-continuation-notif" }),
		}),
		preparedContentResult: buildPrepareResponseContentPreparedReturn({
			needsContinuation: true,
			resolvedFinishReason: "length",
			isIntermediate: true,
		}),
	});

	// Act
	const result = await finalizeContributionJob(
		deps,
		params,
		buildFinalizeContributionJobPayload({ continuation_count: 3 }),
	);

	// Assert
	assertEquals(mockNotificationService.sendContributionGenerationContinuedEvent.calls.length, 1);
	const notifArg = mockNotificationService.sendContributionGenerationContinuedEvent.calls[0].args[0];
	assertEquals(notifArg.continuationNumber, 4);
	assertEquals(notifArg.contribution, params.contribution);
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
});

// --- Final-chunk — notification and assembly ---

/**
 * Contract: resolvedFinishReason === 'stop' with document-related and valid document_key fires
 *   execute_chunk_completed notification; with a valid rootIdFromSaved that differs from
 *   contribution.id and !shouldRender, calls assembleAndSaveFinalDocument with that rootId.
 * Arrange: needsContinuation false; resolvedFinishReason 'stop'; a contribution whose
 *   document_relationships carry thesis -> a distinct rootId; a distinct document_key.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: sendJobNotificationEvent was called with type 'execute_chunk_completed' and step_key
 *   equal to the arranged document_key; assembleAndSaveFinalDocument was called once with the
 *   distinct rootId.
 */
Deno.test("Final-chunk — notification and assembly: resolvedFinishReason 'stop' with document-related and valid document_key fires execute_chunk_completed and calls assembleAndSaveFinalDocument with the rootIdFromSaved", async () => {
	// Arrange — non-continuation, stop, distinct rootId, distinct document_key
	resetMockNotificationService();
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const fileManager = createMockFileManagerService();
	const enqueueRenderJobFn: BoundEnqueueRenderJobFn = async (_params, _payload) =>
		buildEnqueueRenderJobSuccessReturn({ renderJobId: null });
	const deps = buildFinalizeContributionJobDeps({
		notificationService: mockNotificationService,
		fileManager,
		enqueueRenderJob: enqueueRenderJobFn,
	});
	const rootIdDistinct = "root-distinct-final-chunk";
	const contributionId = "contrib-final-chunk";
	const documentKey = FileType.feature_spec;
	const params = buildFinalizeContributionJobParams({
		dbClient,
		contribution: buildDialecticContributionRow({
			id: contributionId,
			document_relationships: buildDocumentRelationships({ thesis: rootIdDistinct }),
		}),
		preparedContentResult: buildPrepareResponseContentPreparedReturn({
			needsContinuation: false,
			resolvedFinishReason: "stop",
			isIntermediate: false,
		}),
	});
	const payload = buildFinalizeContributionJobPayload({ document_key: documentKey });

	// Act
	const result = await finalizeContributionJob(deps, params, payload);

	// Assert
	const chunkCompletedCalls = mockNotificationService.sendJobNotificationEvent.calls.filter(
		(c) => c.args[0].type === "execute_chunk_completed",
	);
	assertEquals(chunkCompletedCalls.length, 1);
	const eventArg = chunkCompletedCalls[0].args[0];
	assertEquals(eventArg.type, "execute_chunk_completed");
	assertEquals(eventArg.step_key, documentKey);
	assertEquals(fileManager.assembleAndSaveFinalDocument.calls.length, 1);
	assertEquals(fileManager.assembleAndSaveFinalDocument.calls[0].args[0], rootIdDistinct);
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
});

// --- Job-completion update — success ---

/**
 * Contract: dialectic_generation_jobs updated with status 'completed', results containing the
 *   modelProcessingResult as JSON, completed_at a non-empty string, attempt_count equal to
 *   job.attempt_count + 1.
 * Arrange: needsContinuation false; a job with attempt_count 2.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the dialectic_generation_jobs update's args carry status 'completed', a non-empty
 *   completed_at string, attempt_count 3, and results containing modelProcessingResult with
 *   status 'completed'.
 */
Deno.test("Job-completion update — success: dialectic_generation_jobs updated with status 'completed', results containing modelProcessingResult, completed_at a non-empty string, attempt_count equal to job.attempt_count + 1", async () => {
	// Arrange — non-continuation, attempt_count 2
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildFinalizeContributionJobDeps();
	const params = buildFinalizeContributionJobParams({
		dbClient,
		job: buildDialecticJobRow({ attempt_count: 2 }),
	});

	// Act
	const result = await finalizeContributionJob(deps, params, buildFinalizeContributionJobPayload());

	// Assert
	const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
	assertExists(updateSpy);
	assertEquals(updateSpy.callCount, 1);
	const updateArgs = updateSpy.callsArgs[0][0];
	if (!isRecord(updateArgs)) throw new Error("update args not a record");
	assertEquals(updateArgs.status, "completed");
	assertEquals(updateArgs.attempt_count, 3);
	const completedAt: unknown = updateArgs.completed_at;
	assert(typeof completedAt === "string" && completedAt.length > 0);
	const results: unknown = updateArgs.results;
	assert(typeof results === "string");
	const parsed: unknown = JSON.parse(results);
	if (!isRecord(parsed)) throw new Error("parsed results not a record");
	const modelProcessingResult: unknown = parsed.modelProcessingResult;
	assert(isModelProcessingResult(modelProcessingResult));
	assertEquals(modelProcessingResult.status, "completed");
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
});

// --- Job-completion update — failure ---

/**
 * Contract: the dialectic_generation_jobs update returning a driver error returns this module's
 *   error arm whose error passes isFinalizeContributionJobCompletionUpdateError, carries the
 *   driver's message, and is retriable false.
 * Arrange: a mock client whose dialectic_generation_jobs update returns a driver error with a
 *   distinct message.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error passes isFinalizeContributionJobCompletionUpdateError,
 *   carries the driver's message, and is retriable false.
 */
Deno.test("Job-completion update — failure: the update returning a driver error returns this module's CompletionUpdateError arm, retriable false", async () => {
	// Arrange — dialectic_generation_jobs update returns a driver error
	const driverError = new Error("completion-update-driver-failure-distinct");
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: driverError } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildFinalizeContributionJobDeps();
	const jobId = "job-completion-err";
	const params = buildFinalizeContributionJobParams({
		dbClient,
		job: buildDialecticJobRow({ id: jobId }),
	});

	// Act
	const result = await finalizeContributionJob(deps, params, buildFinalizeContributionJobPayload());

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assertEquals(isFinalizeContributionJobCompletionUpdateError(result.error), true);
		if (isFinalizeContributionJobCompletionUpdateError(result.error)) {
			assertEquals(result.error.jobId, jobId);
			assertEquals(result.error.driverMessage, "completion-update-driver-failure-distinct");
		}
		assertEquals(result.retriable, false);
	}
});

// --- Completion notifications — non-continuation ---

/**
 * Contract: sendContributionReceivedEvent called with is_continuing false and contribution equal
 *   to params.contribution; sendContributionGenerationCompleteEvent called with projectId equal
 *   to payload.projectId.
 * Arrange: needsContinuation false; a contribution with a distinct id; a payload with a distinct
 *   projectId.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: sendContributionReceivedEvent was called with is_continuing false and contribution
 *   equal to params.contribution; sendContributionGenerationCompleteEvent was called with
 *   projectId equal to the arranged literal.
 */
Deno.test("Completion notifications — non-continuation: sendContributionReceivedEvent called with is_continuing false and contribution equal to params.contribution; sendContributionGenerationCompleteEvent called with projectId equal to payload.projectId", async () => {
	// Arrange — non-continuation, distinct contribution id, distinct projectId
	resetMockNotificationService();
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildFinalizeContributionJobDeps({ notificationService: mockNotificationService });
	const contributionId = "contrib-completion-notif";
	const projectId = "project-completion-notif";
	const params = buildFinalizeContributionJobParams({
		dbClient,
		contribution: buildDialecticContributionRow({
			id: contributionId,
			document_relationships: buildDocumentRelationships({ thesis: "root-completion-notif" }),
		}),
	});

	// Act
	const result = await finalizeContributionJob(
		deps,
		params,
		buildFinalizeContributionJobPayload({ projectId }),
	);

	// Assert
	assertEquals(mockNotificationService.sendContributionReceivedEvent.calls.length, 1);
	const receivedArg = mockNotificationService.sendContributionReceivedEvent.calls[0].args[0];
	assertEquals(receivedArg.is_continuing, false);
	assertEquals(receivedArg.contribution, params.contribution);
	assertEquals(mockNotificationService.sendContributionGenerationCompleteEvent.calls.length, 1);
	const completeArg = mockNotificationService.sendContributionGenerationCompleteEvent.calls[0].args[0];
	assertEquals(completeArg.projectId, projectId);
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
});

// --- execute_completed notification ---

/**
 * Contract: non-intermediate, document-related, valid document_key fires sendJobNotificationEvent
 *   with type 'execute_completed', step_key and document_key equal to the arranged document_key.
 * Arrange: needsContinuation false; isIntermediate false; a distinct document_key.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: sendJobNotificationEvent was called with type 'execute_completed', step_key and
 *   document_key equal to the arranged document_key.
 */
Deno.test("execute_completed notification: non-intermediate, document-related, valid document_key fires sendJobNotificationEvent with type 'execute_completed', step_key and document_key equal to the arranged document_key", async () => {
	// Arrange — non-continuation, non-intermediate, distinct document_key
	resetMockNotificationService();
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildFinalizeContributionJobDeps({ notificationService: mockNotificationService });
	const documentKey = FileType.feature_spec;
	const params = buildFinalizeContributionJobParams({
		dbClient,
		preparedContentResult: buildPrepareResponseContentPreparedReturn({
			needsContinuation: false,
			resolvedFinishReason: "stop",
			isIntermediate: false,
		}),
	});

	// Act
	const result = await finalizeContributionJob(
		deps,
		params,
		buildFinalizeContributionJobPayload({ document_key: documentKey }),
	);

	// Assert
	const executeCompletedCalls = mockNotificationService.sendJobNotificationEvent.calls.filter(
		(c) => c.args[0].type === "execute_completed",
	);
	assertEquals(executeCompletedCalls.length, 1);
	const eventArg = executeCompletedCalls[0].args[0];
	assertEquals(eventArg.type, "execute_completed");
	assertEquals(eventArg.step_key, documentKey);
	assertEquals(eventArg.document_key, documentKey);
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
});

// --- execute_completed — missing document_key ---

/**
 * Contract: non-intermediate, document-related, document_key null returns the error arm whose
 *   error passes isFinalizeContributionJobDocumentKeyError with notificationType 'execute_completed',
 *   retriable false.
 * Arrange: needsContinuation false; resolvedFinishReason 'length' (non-'stop') so the final-chunk
 *   path is skipped and the completion-notifications check is the one that fires; isIntermediate
 *   false; document_key null.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error passes isFinalizeContributionJobDocumentKeyError
 *   with notificationType 'execute_completed', retriable false.
 */
Deno.test("execute_completed — missing document_key: non-intermediate, document-related, document_key null returns the DocumentKeyError arm with notificationType 'execute_completed'", async () => {
	// Arrange — non-continuation, non-intermediate, document_key null
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildFinalizeContributionJobDeps();
	const jobId = "job-execute-completed-no-key";
	const params = buildFinalizeContributionJobParams({
		dbClient,
		job: buildDialecticJobRow({ id: jobId }),
		preparedContentResult: buildPrepareResponseContentPreparedReturn({
			needsContinuation: false,
			resolvedFinishReason: "length",
			isIntermediate: false,
		}),
	});

	// Act
	const result = await finalizeContributionJob(
		deps,
		params,
		buildFinalizeContributionJobPayload({ document_key: null }),
	);

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assertEquals(isFinalizeContributionJobDocumentKeyError(result.error), true);
		if (isFinalizeContributionJobDocumentKeyError(result.error)) {
			assertEquals(result.error.jobId, jobId);
			assertEquals(result.error.notificationType, "execute_completed");
		}
		assertEquals(result.retriable, false);
	}
});

// --- Success status derivation — completed ---

/**
 * Contract: !needsContinuation returns { status: 'completed' }.
 * Arrange: needsContinuation false (default).
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'completed'.
 */
Deno.test("Success status derivation — completed: !needsContinuation returns { status: 'completed' }", async () => {
	// Arrange — non-continuation (default)
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const deps = buildFinalizeContributionJobDeps();
	const params = buildFinalizeContributionJobParams({ dbClient });

	// Act
	const result = await finalizeContributionJob(deps, params, buildFinalizeContributionJobPayload());

	// Assert
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
	if (isFinalizeContributionJobSuccessReturn(result)) {
		assertEquals(result.status, "completed");
	}
});

// --- Success status derivation — needs_continuation ---

/**
 * Contract: needsContinuation true and continueJob returning { enqueued: true } returns
 *   { status: 'needs_continuation' }.
 * Arrange: needsContinuation true; continueJob returns enqueued.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'needs_continuation'.
 */
Deno.test("Success status derivation — needs_continuation: needsContinuation true and continueJob returning enqueued returns { status: 'needs_continuation' }", async () => {
	// Arrange — needsContinuation true, continueJob returns enqueued
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const continueJobFn: BoundContinueJobFn = async (_params, _payload) => buildContinueJobEnqueuedReturn();
	const deps = buildFinalizeContributionJobDeps({ continueJob: continueJobFn });
	const params = buildFinalizeContributionJobParams({
		dbClient,
		preparedContentResult: buildPrepareResponseContentPreparedReturn({
			needsContinuation: true,
			resolvedFinishReason: "length",
			isIntermediate: true,
		}),
	});

	// Act
	const result = await finalizeContributionJob(deps, params, buildFinalizeContributionJobPayload());

	// Assert
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
	if (isFinalizeContributionJobSuccessReturn(result)) {
		assertEquals(result.status, "needs_continuation");
	}
});

// --- Success status derivation — continuation_limit_reached ---

/**
 * Contract: needsContinuation true and continueJob returning limit-reached returns
 *   { status: 'continuation_limit_reached' }.
 * Arrange: needsContinuation true; continueJob returns limit-reached.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'continuation_limit_reached'.
 */
Deno.test("Success status derivation — continuation_limit_reached: needsContinuation true and continueJob returning limit-reached returns { status: 'continuation_limit_reached' }", async () => {
	// Arrange — needsContinuation true, continueJob returns limit-reached
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const continueJobFn: BoundContinueJobFn = async (_params, _payload) => buildContinueJobLimitReachedReturn();
	const deps = buildFinalizeContributionJobDeps({ continueJob: continueJobFn });
	const params = buildFinalizeContributionJobParams({
		dbClient,
		preparedContentResult: buildPrepareResponseContentPreparedReturn({
			needsContinuation: true,
			resolvedFinishReason: "length",
			isIntermediate: true,
		}),
	});

	// Act
	const result = await finalizeContributionJob(deps, params, buildFinalizeContributionJobPayload());

	// Assert
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
	if (isFinalizeContributionJobSuccessReturn(result)) {
		assertEquals(result.status, "continuation_limit_reached");
	}
});

// --- Continuation — limit reached, cap assembly skipped on rootId equals contribution.id ---

/**
 * Contract: when rootIdForCapAssembly === params.contribution.id, assembleAndSaveFinalDocument
 *   is not called.
 * Arrange: needsContinuation true; continueJob returns limit-reached; a contribution whose
 *   document_relationships carry thesis -> the contribution's own id.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: assembleAndSaveFinalDocument was not called; the result's status is
 *   'continuation_limit_reached'.
 */
Deno.test("Continuation — limit reached, cap assembly skipped on rootId equals contribution.id: when rootIdForCapAssembly === params.contribution.id, assembleAndSaveFinalDocument is not called", async () => {
	// Arrange — needsContinuation true, rootId equals contribution.id
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const fileManager = createMockFileManagerService();
	const continueJobFn: BoundContinueJobFn = async (_params, _payload) => buildContinueJobLimitReachedReturn();
	const deps = buildFinalizeContributionJobDeps({ fileManager, continueJob: continueJobFn });
	const contributionId = "contrib-cap-skip-root-equal";
	const params = buildFinalizeContributionJobParams({
		dbClient,
		contribution: buildDialecticContributionRow({
			id: contributionId,
			document_relationships: buildDocumentRelationships({ thesis: contributionId }),
		}),
		preparedContentResult: buildPrepareResponseContentPreparedReturn({
			needsContinuation: true,
			resolvedFinishReason: "length",
			isIntermediate: true,
		}),
	});

	// Act
	const result = await finalizeContributionJob(deps, params, buildFinalizeContributionJobPayload());

	// Assert
	assertEquals(fileManager.assembleAndSaveFinalDocument.calls.length, 0);
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
	if (isFinalizeContributionJobSuccessReturn(result)) {
		assertEquals(result.status, "continuation_limit_reached");
	}
});

// --- Final-chunk — assembly skipped on shouldRender ---

/**
 * Contract: when shouldRender is true, assembleAndSaveFinalDocument is not called.
 * Arrange: needsContinuation false; resolvedFinishReason 'stop'; a valid user_jwt and stageSlug;
 *   an enqueueRenderJob stub returning a non-null renderJobId (sets shouldRender true); a
 *   contribution whose document_relationships carry thesis -> a distinct rootId.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: assembleAndSaveFinalDocument was not called.
 */
Deno.test("Final-chunk — assembly skipped on shouldRender: when shouldRender is true, assembleAndSaveFinalDocument is not called", async () => {
	// Arrange — non-continuation, stop, render returns non-null id (shouldRender true), distinct rootId
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const fileManager = createMockFileManagerService();
	const enqueueRenderJobFn: BoundEnqueueRenderJobFn = async (_params, _payload) =>
		buildEnqueueRenderJobSuccessReturn({ renderJobId: "render-job-non-null" });
	const deps = buildFinalizeContributionJobDeps({
		fileManager,
		enqueueRenderJob: enqueueRenderJobFn,
	});
	const rootIdDistinct = "root-distinct-skip-render";
	const params = buildFinalizeContributionJobParams({
		dbClient,
		contribution: buildDialecticContributionRow({
			document_relationships: buildDocumentRelationships({ thesis: rootIdDistinct }),
		}),
		preparedContentResult: buildPrepareResponseContentPreparedReturn({
			needsContinuation: false,
			resolvedFinishReason: "stop",
			isIntermediate: false,
		}),
	});

	// Act
	const result = await finalizeContributionJob(deps, params, buildFinalizeContributionJobPayload());

	// Assert
	assertEquals(fileManager.assembleAndSaveFinalDocument.calls.length, 0);
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
});

// --- Purity ---

/**
 * Contract: neither the params object nor the payload object is mutated by any path.
 * Arrange: needsContinuation true (exercises the continuation path); a deep clone of the params
 *   and payload taken before the call.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the params and payload objects are deep-equal to their pre-call clones.
 */
Deno.test("Purity: neither the params object nor the payload object is mutated by any path", async () => {
	// Arrange — needsContinuation true (exercises continuation path)
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_project_resources: { update: { data: null, error: null } },
			dialectic_generation_jobs: { update: { data: null, error: null } },
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const continueJobFn: BoundContinueJobFn = async (_params, _payload) => buildContinueJobEnqueuedReturn();
	const deps = buildFinalizeContributionJobDeps({ continueJob: continueJobFn });
	const params = buildFinalizeContributionJobParams({
		dbClient,
		preparedContentResult: buildPrepareResponseContentPreparedReturn({
			needsContinuation: true,
			resolvedFinishReason: "length",
			isIntermediate: true,
		}),
	});
	const payload = buildFinalizeContributionJobPayload();
	const { dbClient: paramsDbClient, ...paramsRest } = params;
	const paramsSnapshot = { ...structuredClone(paramsRest), dbClient: paramsDbClient };
	const payloadSnapshot = structuredClone(payload);

	// Act
	await finalizeContributionJob(deps, params, payload);

	// Assert
	assertEquals(params, paramsSnapshot);
	assertEquals(payload, payloadSnapshot);
});
