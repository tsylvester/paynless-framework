import { assert, assertEquals } from "jsr:@std/assert";
import { FileType, DialecticStageSlug } from "../../_shared/types/file_manager.types.ts";
import type { DialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.interface.ts";
import {
	SaveCompressedResponseRawJsonUploadError,
	SaveCompressedResponseJobUpdateError,
	SaveCompressedResponseExtractedUploadError,
} from "./saveCompressedResponse.interface.ts";
import type {
	SaveCompressedResponseDeps,
	SaveCompressedResponseParams,
	SaveCompressedResponsePayload,
	SaveCompressedResponseSuccessReturn,
	SaveCompressedResponseErrorReturn,
	SaveCompressedResponseReturn,
	SaveCompressedResponseFn,
	BoundSaveCompressedResponseFn,
	SaveCompressedResponseRawJsonUploadErrorConstructorParams,
	SaveCompressedResponseJobUpdateErrorConstructorParams,
	SaveCompressedResponseExtractedUploadErrorConstructorParams,
} from "./saveCompressedResponse.interface.ts";

/** Contract: SaveCompressedResponseDeps' required key surface is exactly fileManager, buildUploadContext and enqueueRenderJob — the three collaborators the branch contract invokes. */
Deno.test("SaveCompressedResponseDeps has the required surface", () => {
	const surface: Record<keyof SaveCompressedResponseDeps, true> = {
		fileManager: true,
		buildUploadContext: true,
		enqueueRenderJob: true,
	};
	assertEquals(Object.keys(surface).length, 3);
});

/** Contract: SaveCompressedResponseParams' required key surface is exactly dbClient, job, providerRow, assembledResponse and preparedContentResult — the five per-invocation values. */
Deno.test("SaveCompressedResponseParams has the required surface", () => {
	const surface: Record<keyof SaveCompressedResponseParams, true> = {
		dbClient: true,
		job: true,
		providerRow: true,
		assembledResponse: true,
		preparedContentResult: true,
	};
	assertEquals(Object.keys(surface).length, 5);
});

/** Contract: SaveCompressedResponseSuccessReturn is a member of SaveCompressedResponseReturn, proving the union has a success arm. */
Deno.test("SaveCompressedResponseSuccessReturn is a member of SaveCompressedResponseReturn", () => {
	const success: SaveCompressedResponseSuccessReturn = { status: "completed" };
	const result: SaveCompressedResponseReturn = success;
	assert(result === success);
});

/** Contract: SaveCompressedResponseErrorReturn is a member of SaveCompressedResponseReturn, proving the union has exactly the two arms. */
Deno.test("SaveCompressedResponseErrorReturn is a member of SaveCompressedResponseReturn", () => {
	const errorReturn: SaveCompressedResponseErrorReturn = {
		error: new SaveCompressedResponseRawJsonUploadError({ jobId: "job-1", driverMessage: "raw json upload failed" }),
		retriable: false,
	};
	const result: SaveCompressedResponseReturn = errorReturn;
	assert(result === errorReturn);
});

/** Contract: SaveCompressedResponseSuccessReturn.status discriminates 'completed', 'needs_continuation' and 'waiting_for_children' — each value assigns to the status field. */
Deno.test("SaveCompressedResponseSuccessReturn.status discriminates the three terminal states", () => {
	const completed: SaveCompressedResponseSuccessReturn = { status: "completed" };
	const needsContinuation: SaveCompressedResponseSuccessReturn = { status: "needs_continuation" };
	const waitingForChildren: SaveCompressedResponseSuccessReturn = { status: "waiting_for_children" };
	assertEquals(completed.status, "completed");
	assertEquals(needsContinuation.status, "needs_continuation");
	assertEquals(waitingForChildren.status, "waiting_for_children");
});

/** Contract: SaveCompressedResponsePayload and DialecticCompressJobPayload are assignable in both directions — an owned literal annotated as SaveCompressedResponsePayload round-trips through a DialecticCompressJobPayload binding and back, proving equivalence rather than a one-way widening. */
Deno.test("SaveCompressedResponsePayload is equivalent to DialecticCompressJobPayload in both directions", () => {
	const payload: SaveCompressedResponsePayload = {
		targetKey: FileType.HeaderContext,
		mode: "json",
		content: "compressed content",
		sourceType: "contribution",
		stageSlug: DialecticStageSlug.Thesis,
		iterationNumber: 1,
		model_slug: "model-slug",
		model_id: "model-id",
		sessionId: "session-1",
		projectId: "project-1",
		walletId: "wallet-1",
		user_jwt: "jwt-token",
		idempotencyKey: "idem-key",
	};
	const asImported: DialecticCompressJobPayload = payload;
	const asOwned: SaveCompressedResponsePayload = asImported;
	assertEquals(asOwned, payload);
});

/** Contract: SaveCompressedResponseFn's declared Promise return admits its success arm, proving the signature is asynchronous. */
Deno.test("SaveCompressedResponseFn resolves to its declared success type", () => {
	const success: SaveCompressedResponseSuccessReturn = { status: "completed" };
	const returned: ReturnType<SaveCompressedResponseFn> = Promise.resolve(success);
	const declared: Promise<SaveCompressedResponseReturn> = returned;
	assert(declared instanceof Promise);
});

/** Contract: SaveCompressedResponseFn's declared Promise return admits its error arm, proving the signature is asynchronous. */
Deno.test("SaveCompressedResponseFn resolves to its declared error type", () => {
	const errorReturn: SaveCompressedResponseErrorReturn = {
		error: new SaveCompressedResponseJobUpdateError({ jobId: "job-1", driverMessage: "waiting_for_children update failed" }),
		retriable: true,
	};
	const returned: ReturnType<SaveCompressedResponseFn> = Promise.resolve(errorReturn);
	const declared: Promise<SaveCompressedResponseReturn> = returned;
	assert(declared instanceof Promise);
});

/** Contract: BoundSaveCompressedResponseFn's declared Promise return admits its success arm, proving the bound signature is asynchronous. */
Deno.test("BoundSaveCompressedResponseFn resolves to its declared success type", () => {
	const success: SaveCompressedResponseSuccessReturn = { status: "completed" };
	const returned: ReturnType<BoundSaveCompressedResponseFn> = Promise.resolve(success);
	const declared: Promise<SaveCompressedResponseReturn> = returned;
	assert(declared instanceof Promise);
});

/** Contract: BoundSaveCompressedResponseFn's declared Promise return admits its error arm, proving the bound signature is asynchronous. */
Deno.test("BoundSaveCompressedResponseFn resolves to its declared error type", () => {
	const errorReturn: SaveCompressedResponseErrorReturn = {
		error: new SaveCompressedResponseExtractedUploadError({ jobId: "job-1", driverMessage: "extracted context upload failed" }),
		retriable: false,
	};
	const returned: ReturnType<BoundSaveCompressedResponseFn> = Promise.resolve(errorReturn);
	const declared: Promise<SaveCompressedResponseReturn> = returned;
	assert(declared instanceof Promise);
});

// --- Owned error constructor-params surfaces ---

/** Contract: SaveCompressedResponseRawJsonUploadErrorConstructorParams' required key surface is exactly jobId and driverMessage. */
Deno.test("SaveCompressedResponseRawJsonUploadErrorConstructorParams has the required surface", () => {
	const surface: Record<
		keyof SaveCompressedResponseRawJsonUploadErrorConstructorParams,
		true
	> = {
		jobId: true,
		driverMessage: true,
	};
	assertEquals(Object.keys(surface).length, 2);
});

/** Contract: SaveCompressedResponseJobUpdateErrorConstructorParams' required key surface is exactly jobId and driverMessage. */
Deno.test("SaveCompressedResponseJobUpdateErrorConstructorParams has the required surface", () => {
	const surface: Record<
		keyof SaveCompressedResponseJobUpdateErrorConstructorParams,
		true
	> = {
		jobId: true,
		driverMessage: true,
	};
	assertEquals(Object.keys(surface).length, 2);
});

/** Contract: SaveCompressedResponseExtractedUploadErrorConstructorParams' required key surface is exactly jobId and driverMessage. */
Deno.test("SaveCompressedResponseExtractedUploadErrorConstructorParams has the required surface", () => {
	const surface: Record<
		keyof SaveCompressedResponseExtractedUploadErrorConstructorParams,
		true
	> = {
		jobId: true,
		driverMessage: true,
	};
	assertEquals(Object.keys(surface).length, 2);
});
