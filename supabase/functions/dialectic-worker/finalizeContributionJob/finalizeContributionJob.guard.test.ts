import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
	isFinalizeContributionJobDeps,
	isFinalizeContributionJobParams,
	isFinalizeContributionJobPayload,
	isFinalizeContributionJobSuccessReturn,
	isFinalizeContributionJobErrorReturn,
	isFinalizeContributionJobDocumentRelatedError,
	isFinalizeContributionJobRenderDispatchError,
	isFinalizeContributionJobPromptLinkError,
	isFinalizeContributionJobDocumentKeyError,
	isFinalizeContributionJobContinuationError,
	isFinalizeContributionJobCompletionUpdateError,
} from "./finalizeContributionJob.guard.ts";
import {
	buildFinalizeContributionJobDeps,
	invalidateFinalizeContributionJobDeps,
	buildFinalizeContributionJobParams,
	invalidateFinalizeContributionJobParams,
	buildFinalizeContributionJobPayload,
	invalidateFinalizeContributionJobPayload,
	buildFinalizeContributionJobSuccessReturn,
	invalidateFinalizeContributionJobSuccessReturn,
	buildFinalizeContributionJobErrorReturn,
	invalidateFinalizeContributionJobErrorReturn,
	buildFinalizeContributionJobDocumentRelatedError,
	buildFinalizeContributionJobRenderDispatchError,
	buildFinalizeContributionJobPromptLinkError,
	buildFinalizeContributionJobDocumentKeyError,
	buildFinalizeContributionJobContinuationError,
	buildFinalizeContributionJobCompletionUpdateError,
} from "./finalizeContributionJob.mock.ts";
import {
	invalidateDialecticJobRow,
	invalidateDialecticContributionRow,
} from "../../_shared/dialectic.mock.ts";

// --- isFinalizeContributionJobDeps ---

Deno.test("Type Guard: isFinalizeContributionJobDeps", async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isFinalizeContributionJobDeps(buildFinalizeContributionJobDeps()));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isFinalizeContributionJobDeps(null));
		assert(!isFinalizeContributionJobDeps(undefined));
		assert(!isFinalizeContributionJobDeps("a string"));
		assert(!isFinalizeContributionJobDeps(42));
		assert(!isFinalizeContributionJobDeps([]));
	});

	/** Contract: case 4 — logger corrupted to a non-object is rejected. */
	await t.step("rejects logger non-object", () => {
		assert(!isFinalizeContributionJobDeps(invalidateFinalizeContributionJobDeps({ logger: "not-a-logger" })));
	});

	/** Contract: case 4 — notificationService corrupted to a non-object is rejected. */
	await t.step("rejects notificationService non-object", () => {
		assert(!isFinalizeContributionJobDeps(invalidateFinalizeContributionJobDeps({ notificationService: "not-a-service" })));
	});

	/** Contract: case 4 — fileManager corrupted to a non-object is rejected. */
	await t.step("rejects fileManager non-object", () => {
		assert(!isFinalizeContributionJobDeps(invalidateFinalizeContributionJobDeps({ fileManager: "not-a-file-manager" })));
	});

	/** Contract: case 4 — continueJob corrupted to a non-function is rejected. */
	await t.step("rejects continueJob non-function", () => {
		assert(!isFinalizeContributionJobDeps(invalidateFinalizeContributionJobDeps({ continueJob: "not-a-function" })));
	});

	/** Contract: case 4 — enqueueRenderJob corrupted to a non-function is rejected. */
	await t.step("rejects enqueueRenderJob non-function", () => {
		assert(!isFinalizeContributionJobDeps(invalidateFinalizeContributionJobDeps({ enqueueRenderJob: "not-a-function" })));
	});

	/** Contract: case 5 — logger omitted (rest-destructured away) is rejected. */
	await t.step("rejects logger omitted", () => {
		const { logger: _omit, ...rest } = buildFinalizeContributionJobDeps();
		assert(!isFinalizeContributionJobDeps(rest));
	});

	/** Contract: case 5 — notificationService omitted (rest-destructured away) is rejected. */
	await t.step("rejects notificationService omitted", () => {
		const { notificationService: _omit, ...rest } = buildFinalizeContributionJobDeps();
		assert(!isFinalizeContributionJobDeps(rest));
	});

	/** Contract: case 5 — fileManager omitted (rest-destructured away) is rejected. */
	await t.step("rejects fileManager omitted", () => {
		const { fileManager: _omit, ...rest } = buildFinalizeContributionJobDeps();
		assert(!isFinalizeContributionJobDeps(rest));
	});

	/** Contract: case 5 — continueJob omitted (rest-destructured away) is rejected. */
	await t.step("rejects continueJob omitted", () => {
		const { continueJob: _omit, ...rest } = buildFinalizeContributionJobDeps();
		assert(!isFinalizeContributionJobDeps(rest));
	});

	/** Contract: case 5 — enqueueRenderJob omitted (rest-destructured away) is rejected. */
	await t.step("rejects enqueueRenderJob omitted", () => {
		const { enqueueRenderJob: _omit, ...rest } = buildFinalizeContributionJobDeps();
		assert(!isFinalizeContributionJobDeps(rest));
	});
});

// --- isFinalizeContributionJobParams ---

Deno.test("Type Guard: isFinalizeContributionJobParams", async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isFinalizeContributionJobParams(buildFinalizeContributionJobParams()));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isFinalizeContributionJobParams(null));
		assert(!isFinalizeContributionJobParams(undefined));
		assert(!isFinalizeContributionJobParams("a string"));
		assert(!isFinalizeContributionJobParams([]));
	});

	/** Contract: case 4 — dbClient corrupted to a string is rejected. */
	await t.step("rejects dbClient a string", () => {
		assert(!isFinalizeContributionJobParams(invalidateFinalizeContributionJobParams({ dbClient: "not-a-client" })));
	});

	/** Contract: case 4 — job corrupted via invalidateDialecticJobRow is rejected. */
	await t.step("rejects job corrupted", () => {
		assert(!isFinalizeContributionJobParams(invalidateFinalizeContributionJobParams({ job: invalidateDialecticJobRow({ id: 42 }) })));
	});

	/** Contract: case 4 — contribution corrupted via invalidateDialecticContributionRow is rejected. */
	await t.step("rejects contribution corrupted", () => {
		assert(!isFinalizeContributionJobParams(invalidateFinalizeContributionJobParams({ contribution: invalidateDialecticContributionRow({ id: null }) })));
	});

	/** Contract: case 4 — assembledResponse corrupted to a non-record is rejected. */
	await t.step("rejects assembledResponse non-record", () => {
		assert(!isFinalizeContributionJobParams(invalidateFinalizeContributionJobParams({ assembledResponse: "not-a-record" })));
	});

	/** Contract: case 4 — preparedContentResult corrupted to a non-record is rejected. */
	await t.step("rejects preparedContentResult non-record", () => {
		assert(!isFinalizeContributionJobParams(invalidateFinalizeContributionJobParams({ preparedContentResult: "not-a-record" })));
	});

	/** Contract: case 4 — storageFileType corrupted to a non-string is rejected. */
	await t.step("rejects storageFileType non-string", () => {
		assert(!isFinalizeContributionJobParams(invalidateFinalizeContributionJobParams({ storageFileType: 42 })));
	});

	/** Contract: case 4 — isContinuationForStorage corrupted to a non-boolean is rejected. */
	await t.step("rejects isContinuationForStorage non-boolean", () => {
		assert(!isFinalizeContributionJobParams(invalidateFinalizeContributionJobParams({ isContinuationForStorage: "not-a-boolean" })));
	});

	/** Contract: case 5 — dbClient omitted (rest-destructured away) is rejected. */
	await t.step("rejects dbClient omitted", () => {
		const { dbClient: _omit, ...rest } = buildFinalizeContributionJobParams();
		assert(!isFinalizeContributionJobParams(rest));
	});

	/** Contract: case 5 — job omitted (rest-destructured away) is rejected. */
	await t.step("rejects job omitted", () => {
		const { job: _omit, ...rest } = buildFinalizeContributionJobParams();
		assert(!isFinalizeContributionJobParams(rest));
	});

	/** Contract: case 5 — contribution omitted (rest-destructured away) is rejected. */
	await t.step("rejects contribution omitted", () => {
		const { contribution: _omit, ...rest } = buildFinalizeContributionJobParams();
		assert(!isFinalizeContributionJobParams(rest));
	});

	/** Contract: case 5 — assembledResponse omitted (rest-destructured away) is rejected. */
	await t.step("rejects assembledResponse omitted", () => {
		const { assembledResponse: _omit, ...rest } = buildFinalizeContributionJobParams();
		assert(!isFinalizeContributionJobParams(rest));
	});

	/** Contract: case 5 — preparedContentResult omitted (rest-destructured away) is rejected. */
	await t.step("rejects preparedContentResult omitted", () => {
		const { preparedContentResult: _omit, ...rest } = buildFinalizeContributionJobParams();
		assert(!isFinalizeContributionJobParams(rest));
	});

	/** Contract: case 5 — storageFileType omitted (rest-destructured away) is rejected. */
	await t.step("rejects storageFileType omitted", () => {
		const { storageFileType: _omit, ...rest } = buildFinalizeContributionJobParams();
		assert(!isFinalizeContributionJobParams(rest));
	});

	/** Contract: case 5 — isContinuationForStorage omitted (rest-destructured away) is rejected. */
	await t.step("rejects isContinuationForStorage omitted", () => {
		const { isContinuationForStorage: _omit, ...rest } = buildFinalizeContributionJobParams();
		assert(!isFinalizeContributionJobParams(rest));
	});
});

// --- isFinalizeContributionJobPayload ---

Deno.test("Type Guard: isFinalizeContributionJobPayload", async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isFinalizeContributionJobPayload(buildFinalizeContributionJobPayload()));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isFinalizeContributionJobPayload(null));
		assert(!isFinalizeContributionJobPayload(undefined));
		assert(!isFinalizeContributionJobPayload("a string"));
		assert(!isFinalizeContributionJobPayload([]));
	});

	/** Contract: case 4 — prompt_template_id corrupted is rejected. */
	await t.step("rejects prompt_template_id corrupted", () => {
		assert(!isFinalizeContributionJobPayload(invalidateFinalizeContributionJobPayload({ prompt_template_id: 42 })));
	});

	/** Contract: case 4 — output_type corrupted is rejected. */
	await t.step("rejects output_type corrupted", () => {
		assert(!isFinalizeContributionJobPayload(invalidateFinalizeContributionJobPayload({ output_type: "not-a-filetype" })));
	});

	/** Contract: case 4 — canonicalPathParams corrupted is rejected. */
	await t.step("rejects canonicalPathParams corrupted", () => {
		assert(!isFinalizeContributionJobPayload(invalidateFinalizeContributionJobPayload({ canonicalPathParams: "not-an-object" })));
	});

	/** Contract: case 4 — inputs corrupted is rejected. */
	await t.step("rejects inputs corrupted", () => {
		assert(!isFinalizeContributionJobPayload(invalidateFinalizeContributionJobPayload({ inputs: "not-an-object" })));
	});
});

// --- isFinalizeContributionJobSuccessReturn ---

Deno.test("Type Guard: isFinalizeContributionJobSuccessReturn", async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isFinalizeContributionJobSuccessReturn(buildFinalizeContributionJobSuccessReturn()));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isFinalizeContributionJobSuccessReturn(null));
		assert(!isFinalizeContributionJobSuccessReturn(undefined));
		assert(!isFinalizeContributionJobSuccessReturn("a string"));
		assert(!isFinalizeContributionJobSuccessReturn([]));
	});

	/** Contract: case 4 — status corrupted to a number is rejected. */
	await t.step("rejects status numeric", () => {
		assert(!isFinalizeContributionJobSuccessReturn(invalidateFinalizeContributionJobSuccessReturn({ status: 42 })));
	});

	/** Contract: case 4 — status corrupted to a string not in the three-member union is rejected. */
	await t.step("rejects status not in union", () => {
		assert(!isFinalizeContributionJobSuccessReturn(invalidateFinalizeContributionJobSuccessReturn({ status: "not-a-valid-status" })));
	});

	/** Contract: case 5 — status omitted (rest-destructured away) is rejected. */
	await t.step("rejects status omitted", () => {
		const { status: _omit, ...rest } = buildFinalizeContributionJobSuccessReturn();
		assert(!isFinalizeContributionJobSuccessReturn(rest));
	});

	/** Contract: rejects the error return, proving the two arms are mutually exclusive. */
	await t.step("rejects the error return", () => {
		assert(!isFinalizeContributionJobSuccessReturn(buildFinalizeContributionJobErrorReturn()));
	});
});

// --- isFinalizeContributionJobErrorReturn ---

Deno.test("Type Guard: isFinalizeContributionJobErrorReturn", async (t) => {
	/** Contract: case 1 — the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isFinalizeContributionJobErrorReturn(buildFinalizeContributionJobErrorReturn()));
	});

	/** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isFinalizeContributionJobErrorReturn(null));
		assert(!isFinalizeContributionJobErrorReturn(undefined));
		assert(!isFinalizeContributionJobErrorReturn("a string"));
		assert(!isFinalizeContributionJobErrorReturn([]));
	});

	/** Contract: case 4 — error corrupted to a plain object is rejected. */
	await t.step("rejects error a plain object", () => {
		assert(!isFinalizeContributionJobErrorReturn(invalidateFinalizeContributionJobErrorReturn({ error: { message: "oops" } })));
	});

	/** Contract: case 4 — error corrupted to a string is rejected. */
	await t.step("rejects error a string", () => {
		assert(!isFinalizeContributionJobErrorReturn(invalidateFinalizeContributionJobErrorReturn({ error: "failure" })));
	});

	/** Contract: case 4 — retriable corrupted to a non-boolean is rejected. */
	await t.step("rejects retriable non-boolean", () => {
		assert(!isFinalizeContributionJobErrorReturn(invalidateFinalizeContributionJobErrorReturn({ retriable: "not-a-boolean" })));
	});

	/** Contract: case 5 — error omitted (rest-destructured away) is rejected. */
	await t.step("rejects error omitted", () => {
		const { error: _omit, ...rest } = buildFinalizeContributionJobErrorReturn();
		assert(!isFinalizeContributionJobErrorReturn(rest));
	});

	/** Contract: case 5 — retriable omitted (rest-destructured away) is rejected. */
	await t.step("rejects retriable omitted", () => {
		const { retriable: _omit, ...rest } = buildFinalizeContributionJobErrorReturn();
		assert(!isFinalizeContributionJobErrorReturn(rest));
	});

	/** Contract: rejects the success return, proving the two arms are mutually exclusive. */
	await t.step("rejects the success return", () => {
		assert(!isFinalizeContributionJobErrorReturn(buildFinalizeContributionJobSuccessReturn()));
	});
});

// --- Owned error instanceof guards ---

Deno.test("Type Guard: isFinalizeContributionJobDocumentRelatedError", async (t) => {
	/** Contract: accepts its own builder's instance. */
	await t.step("accepts its own builder instance", () => {
		assert(isFinalizeContributionJobDocumentRelatedError(buildFinalizeContributionJobDocumentRelatedError()));
	});

	/** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step("rejects non-instances", () => {
		assert(!isFinalizeContributionJobDocumentRelatedError(new Error("test")));
		assert(!isFinalizeContributionJobDocumentRelatedError({ jobId: "job-1", contributionId: "contrib-1", stageSlug: "thesis" }));
		assert(!isFinalizeContributionJobDocumentRelatedError(buildFinalizeContributionJobRenderDispatchError()));
		assert(!isFinalizeContributionJobDocumentRelatedError(null));
		assert(!isFinalizeContributionJobDocumentRelatedError("a string"));
	});
});

Deno.test("Type Guard: isFinalizeContributionJobRenderDispatchError", async (t) => {
	/** Contract: accepts its own builder's instance. */
	await t.step("accepts its own builder instance", () => {
		assert(isFinalizeContributionJobRenderDispatchError(buildFinalizeContributionJobRenderDispatchError()));
	});

	/** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step("rejects non-instances", () => {
		assert(!isFinalizeContributionJobRenderDispatchError(new Error("test")));
		assert(!isFinalizeContributionJobRenderDispatchError({ jobId: "job-1", contributionId: "contrib-1", driverMessage: "fail" }));
		assert(!isFinalizeContributionJobRenderDispatchError(buildFinalizeContributionJobPromptLinkError()));
		assert(!isFinalizeContributionJobRenderDispatchError(null));
		assert(!isFinalizeContributionJobRenderDispatchError("a string"));
	});
});

Deno.test("Type Guard: isFinalizeContributionJobPromptLinkError", async (t) => {
	/** Contract: accepts its own builder's instance. */
	await t.step("accepts its own builder instance", () => {
		assert(isFinalizeContributionJobPromptLinkError(buildFinalizeContributionJobPromptLinkError()));
	});

	/** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step("rejects non-instances", () => {
		assert(!isFinalizeContributionJobPromptLinkError(new Error("test")));
		assert(!isFinalizeContributionJobPromptLinkError({ jobId: "job-1", contributionId: "contrib-1", promptResourceId: "prompt-1", driverMessage: "fail" }));
		assert(!isFinalizeContributionJobPromptLinkError(buildFinalizeContributionJobDocumentKeyError()));
		assert(!isFinalizeContributionJobPromptLinkError(null));
		assert(!isFinalizeContributionJobPromptLinkError("a string"));
	});
});

Deno.test("Type Guard: isFinalizeContributionJobDocumentKeyError", async (t) => {
	/** Contract: accepts its own builder's instance. */
	await t.step("accepts its own builder instance", () => {
		assert(isFinalizeContributionJobDocumentKeyError(buildFinalizeContributionJobDocumentKeyError()));
	});

	/** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step("rejects non-instances", () => {
		assert(!isFinalizeContributionJobDocumentKeyError(new Error("test")));
		assert(!isFinalizeContributionJobDocumentKeyError({ jobId: "job-1", notificationType: "execute_chunk_completed" }));
		assert(!isFinalizeContributionJobDocumentKeyError(buildFinalizeContributionJobContinuationError()));
		assert(!isFinalizeContributionJobDocumentKeyError(null));
		assert(!isFinalizeContributionJobDocumentKeyError("a string"));
	});
});

Deno.test("Type Guard: isFinalizeContributionJobContinuationError", async (t) => {
	/** Contract: accepts its own builder's instance. */
	await t.step("accepts its own builder instance", () => {
		assert(isFinalizeContributionJobContinuationError(buildFinalizeContributionJobContinuationError()));
	});

	/** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step("rejects non-instances", () => {
		assert(!isFinalizeContributionJobContinuationError(new Error("test")));
		assert(!isFinalizeContributionJobContinuationError({ jobId: "job-1", driverMessage: "fail" }));
		assert(!isFinalizeContributionJobContinuationError(buildFinalizeContributionJobCompletionUpdateError()));
		assert(!isFinalizeContributionJobContinuationError(null));
		assert(!isFinalizeContributionJobContinuationError("a string"));
	});
});

Deno.test("Type Guard: isFinalizeContributionJobCompletionUpdateError", async (t) => {
	/** Contract: accepts its own builder's instance. */
	await t.step("accepts its own builder instance", () => {
		assert(isFinalizeContributionJobCompletionUpdateError(buildFinalizeContributionJobCompletionUpdateError()));
	});

	/** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step("rejects non-instances", () => {
		assert(!isFinalizeContributionJobCompletionUpdateError(new Error("test")));
		assert(!isFinalizeContributionJobCompletionUpdateError({ jobId: "job-1", driverMessage: "fail" }));
		assert(!isFinalizeContributionJobCompletionUpdateError(buildFinalizeContributionJobDocumentRelatedError()));
		assert(!isFinalizeContributionJobCompletionUpdateError(null));
		assert(!isFinalizeContributionJobCompletionUpdateError("a string"));
	});
});
