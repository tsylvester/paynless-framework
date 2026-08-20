import { assert, assertEquals } from "jsr:@std/assert";
import { FileType, DialecticStageSlug } from "../../_shared/types/file_manager.types.ts";
import type { DialecticExecuteJobPayload } from "../../dialectic-service/dialectic.interface.ts";
import {
	SaveContributionResponseBuildContextError,
	SaveContributionResponseUploadError,
	SaveContributionResponseContributionRecordError,
} from "./saveContributionResponse.interface.ts";
import type {
	SaveContributionResponseDeps,
	SaveContributionResponseParams,
	SaveContributionResponsePayload,
	SaveContributionResponseSuccessReturn,
	SaveContributionResponseErrorReturn,
	SaveContributionResponseReturn,
	SaveContributionResponseFn,
	BoundSaveContributionResponseFn,
	SaveContributionResponseBuildContextErrorConstructorParams,
	SaveContributionResponseUploadErrorConstructorParams,
	SaveContributionResponseContributionRecordErrorConstructorParams,
} from "./saveContributionResponse.interface.ts";

/** Contract: SaveContributionResponseDeps' required key surface is exactly fileManager, buildUploadContext, resolveContributionIdentity, persistContributionRelationships and finalizeContributionJob — the five collaborators the branch contract invokes. */
Deno.test("SaveContributionResponseDeps has the required surface", () => {
	const surface: Record<keyof SaveContributionResponseDeps, true> = {
		fileManager: true,
		buildUploadContext: true,
		resolveContributionIdentity: true,
		persistContributionRelationships: true,
		finalizeContributionJob: true,
	};
	assertEquals(Object.keys(surface).length, 5);
});

/** Contract: SaveContributionResponseParams' required key surface is exactly dbClient, job, providerRow, modelConfig, assembledResponse and preparedContentResult — the six per-invocation values. */
Deno.test("SaveContributionResponseParams has the required surface", () => {
	const surface: Record<keyof SaveContributionResponseParams, true> = {
		dbClient: true,
		job: true,
		providerRow: true,
		modelConfig: true,
		assembledResponse: true,
		preparedContentResult: true,
	};
	assertEquals(Object.keys(surface).length, 6);
});

/** Contract: SaveContributionResponseSuccessReturn is a member of SaveContributionResponseReturn, proving the union has a success arm. */
Deno.test("SaveContributionResponseSuccessReturn is a member of SaveContributionResponseReturn", () => {
	const success: SaveContributionResponseSuccessReturn = { status: "completed" };
	const result: SaveContributionResponseReturn = success;
	assert(result === success);
});

/** Contract: SaveContributionResponseErrorReturn is a member of SaveContributionResponseReturn, proving the union has exactly the two arms. */
Deno.test("SaveContributionResponseErrorReturn is a member of SaveContributionResponseReturn", () => {
	const errorReturn: SaveContributionResponseErrorReturn = {
		error: new SaveContributionResponseBuildContextError({ jobId: "job-1" }),
		retriable: false,
	};
	const result: SaveContributionResponseReturn = errorReturn;
	assert(result === errorReturn);
});

/** Contract: SaveContributionResponseSuccessReturn.status discriminates 'completed', 'needs_continuation' and 'continuation_limit_reached' — each value assigns to the status field. */
Deno.test("SaveContributionResponseSuccessReturn.status discriminates the three terminal states", () => {
	const completed: SaveContributionResponseSuccessReturn = { status: "completed" };
	const needsContinuation: SaveContributionResponseSuccessReturn = { status: "needs_continuation" };
	const limitReached: SaveContributionResponseSuccessReturn = { status: "continuation_limit_reached" };
	assertEquals(completed.status, "completed");
	assertEquals(needsContinuation.status, "needs_continuation");
	assertEquals(limitReached.status, "continuation_limit_reached");
});

/** Contract: SaveContributionResponsePayload and DialecticExecuteJobPayload are assignable in both directions — an owned literal annotated as SaveContributionResponsePayload round-trips through a DialecticExecuteJobPayload binding and back, proving equivalence rather than a one-way widening. */
Deno.test("SaveContributionResponsePayload is equivalent to DialecticExecuteJobPayload in both directions", () => {
	const payload: SaveContributionResponsePayload = {
		prompt_template_id: "test-prompt",
		inputs: {},
		output_type: FileType.HeaderContext,
		projectId: "project-abc",
		sessionId: "session-456",
		model_id: "model-def",
		walletId: "wallet-ghi",
		user_jwt: "jwt.token.here",
		canonicalPathParams: {
			contributionType: "thesis",
			stageSlug: DialecticStageSlug.Thesis,
		},
		idempotencyKey: "job-id-123_render",
	};
	const asImported: DialecticExecuteJobPayload = payload;
	const asOwned: SaveContributionResponsePayload = asImported;
	assertEquals(asOwned, payload);
});

/** Contract: SaveContributionResponseFn's declared Promise return admits its success arm, proving the signature is asynchronous. */
Deno.test("SaveContributionResponseFn resolves to its declared success type", () => {
	const success: SaveContributionResponseSuccessReturn = { status: "completed" };
	const returned: ReturnType<SaveContributionResponseFn> = Promise.resolve(success);
	const declared: Promise<SaveContributionResponseReturn> = returned;
	assert(declared instanceof Promise);
});

/** Contract: SaveContributionResponseFn's declared Promise return admits its error arm, proving the signature is asynchronous. */
Deno.test("SaveContributionResponseFn resolves to its declared error type", () => {
	const errorReturn: SaveContributionResponseErrorReturn = {
		error: new SaveContributionResponseUploadError({ jobId: "job-1", driverMessage: "upload failed" }),
		retriable: false,
	};
	const returned: ReturnType<SaveContributionResponseFn> = Promise.resolve(errorReturn);
	const declared: Promise<SaveContributionResponseReturn> = returned;
	assert(declared instanceof Promise);
});

/** Contract: BoundSaveContributionResponseFn's declared Promise return admits its success arm, proving the bound signature is asynchronous. */
Deno.test("BoundSaveContributionResponseFn resolves to its declared success type", () => {
	const success: SaveContributionResponseSuccessReturn = { status: "completed" };
	const returned: ReturnType<BoundSaveContributionResponseFn> = Promise.resolve(success);
	const declared: Promise<SaveContributionResponseReturn> = returned;
	assert(declared instanceof Promise);
});

/** Contract: BoundSaveContributionResponseFn's declared Promise return admits its error arm, proving the bound signature is asynchronous. */
Deno.test("BoundSaveContributionResponseFn resolves to its declared error type", () => {
	const errorReturn: SaveContributionResponseErrorReturn = {
		error: new SaveContributionResponseContributionRecordError({ jobId: "job-1" }),
		retriable: false,
	};
	const returned: ReturnType<BoundSaveContributionResponseFn> = Promise.resolve(errorReturn);
	const declared: Promise<SaveContributionResponseReturn> = returned;
	assert(declared instanceof Promise);
});

// --- Owned error constructor-params surfaces ---

/** Contract: SaveContributionResponseBuildContextErrorConstructorParams' required key surface is exactly jobId. */
Deno.test("SaveContributionResponseBuildContextErrorConstructorParams has the required surface", () => {
	const surface: Record<
		keyof SaveContributionResponseBuildContextErrorConstructorParams,
		true
	> = {
		jobId: true,
	};
	assertEquals(Object.keys(surface).length, 1);
});

/** Contract: SaveContributionResponseUploadErrorConstructorParams' required key surface is exactly jobId and driverMessage. */
Deno.test("SaveContributionResponseUploadErrorConstructorParams has the required surface", () => {
	const surface: Record<
		keyof SaveContributionResponseUploadErrorConstructorParams,
		true
	> = {
		jobId: true,
		driverMessage: true,
	};
	assertEquals(Object.keys(surface).length, 2);
});

/** Contract: SaveContributionResponseContributionRecordErrorConstructorParams' required key surface is exactly jobId. */
Deno.test("SaveContributionResponseContributionRecordErrorConstructorParams has the required surface", () => {
	const surface: Record<
		keyof SaveContributionResponseContributionRecordErrorConstructorParams,
		true
	> = {
		jobId: true,
	};
	assertEquals(Object.keys(surface).length, 1);
});
