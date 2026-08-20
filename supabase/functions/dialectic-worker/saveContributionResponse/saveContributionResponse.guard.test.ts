import { assert } from "jsr:@std/assert";
import {
	isSaveContributionResponseDeps,
	isSaveContributionResponseParams,
	isSaveContributionResponseSuccessReturn,
	isSaveContributionResponseErrorReturn,
	isSaveContributionResponseBuildContextError,
	isSaveContributionResponseUploadError,
	isSaveContributionResponseContributionRecordError,
	isSaveContributionResponseBuildContextErrorConstructorParams,
	isSaveContributionResponseUploadErrorConstructorParams,
	isSaveContributionResponseContributionRecordErrorConstructorParams,
} from "./saveContributionResponse.guard.ts";
import {
	buildSaveContributionResponseDeps,
	invalidateSaveContributionResponseDeps,
	buildSaveContributionResponseParams,
	invalidateSaveContributionResponseParams,
	buildSaveContributionResponseSuccessReturn,
	invalidateSaveContributionResponseSuccessReturn,
	buildSaveContributionResponseErrorReturn,
	invalidateSaveContributionResponseErrorReturn,
	buildSaveContributionResponseBuildContextError,
	buildSaveContributionResponseUploadError,
	buildSaveContributionResponseContributionRecordError,
	buildSaveContributionResponseBuildContextErrorConstructorParams,
	invalidateSaveContributionResponseBuildContextErrorConstructorParams,
	buildSaveContributionResponseUploadErrorConstructorParams,
	invalidateSaveContributionResponseUploadErrorConstructorParams,
	buildSaveContributionResponseContributionRecordErrorConstructorParams,
	invalidateSaveContributionResponseContributionRecordErrorConstructorParams,
} from "./saveContributionResponse.mock.ts";

// --- isSaveContributionResponseDeps ---

Deno.test("Type Guard: isSaveContributionResponseDeps", async (t) => {
	/** the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isSaveContributionResponseDeps(buildSaveContributionResponseDeps()));
	});

	/** null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isSaveContributionResponseDeps(null));
		assert(!isSaveContributionResponseDeps(undefined));
		assert(!isSaveContributionResponseDeps("a string"));
		assert(!isSaveContributionResponseDeps([]));
	});

	/** fileManager corrupted to a non-object is rejected. */
	await t.step("rejects fileManager a non-object", () => {
		assert(!isSaveContributionResponseDeps(invalidateSaveContributionResponseDeps({ fileManager: "not-an-object" })));
	});

	/** fileManager corrupted to an object carrying no uploadAndRegisterFile method is rejected. */
	await t.step("rejects fileManager carrying no uploadAndRegisterFile", () => {
		assert(!isSaveContributionResponseDeps(invalidateSaveContributionResponseDeps({ fileManager: {} })));
	});

	/** buildUploadContext corrupted to a non-function is rejected. */
	await t.step("rejects buildUploadContext a non-function", () => {
		assert(!isSaveContributionResponseDeps(invalidateSaveContributionResponseDeps({ buildUploadContext: "not-a-function" })));
	});

	/** resolveContributionIdentity corrupted to a non-function is rejected. */
	await t.step("rejects resolveContributionIdentity a non-function", () => {
		assert(!isSaveContributionResponseDeps(invalidateSaveContributionResponseDeps({ resolveContributionIdentity: "not-a-function" })));
	});

	/** persistContributionRelationships corrupted to a non-function is rejected. */
	await t.step("rejects persistContributionRelationships a non-function", () => {
		assert(!isSaveContributionResponseDeps(invalidateSaveContributionResponseDeps({ persistContributionRelationships: "not-a-function" })));
	});

	/** finalizeContributionJob corrupted to a non-function is rejected. */
	await t.step("rejects finalizeContributionJob a non-function", () => {
		assert(!isSaveContributionResponseDeps(invalidateSaveContributionResponseDeps({ finalizeContributionJob: "not-a-function" })));
	});

	/** fileManager omitted (rest-destructured away) is rejected. */
	await t.step("rejects fileManager omitted", () => {
		const { fileManager: _omit, ...missing } = buildSaveContributionResponseDeps();
		assert(!isSaveContributionResponseDeps(missing));
	});

	/** buildUploadContext omitted (rest-destructured away) is rejected. */
	await t.step("rejects buildUploadContext omitted", () => {
		const { buildUploadContext: _omit, ...missing } = buildSaveContributionResponseDeps();
		assert(!isSaveContributionResponseDeps(missing));
	});

	/** resolveContributionIdentity omitted (rest-destructured away) is rejected. */
	await t.step("rejects resolveContributionIdentity omitted", () => {
		const { resolveContributionIdentity: _omit, ...missing } = buildSaveContributionResponseDeps();
		assert(!isSaveContributionResponseDeps(missing));
	});

	/** persistContributionRelationships omitted (rest-destructured away) is rejected. */
	await t.step("rejects persistContributionRelationships omitted", () => {
		const { persistContributionRelationships: _omit, ...missing } = buildSaveContributionResponseDeps();
		assert(!isSaveContributionResponseDeps(missing));
	});

	/** finalizeContributionJob omitted (rest-destructured away) is rejected. */
	await t.step("rejects finalizeContributionJob omitted", () => {
		const { finalizeContributionJob: _omit, ...missing } = buildSaveContributionResponseDeps();
		assert(!isSaveContributionResponseDeps(missing));
	});
});

// --- isSaveContributionResponseParams ---

Deno.test("Type Guard: isSaveContributionResponseParams", async (t) => {
	/** the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isSaveContributionResponseParams(buildSaveContributionResponseParams()));
	});

	/** null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isSaveContributionResponseParams(null));
		assert(!isSaveContributionResponseParams(undefined));
		assert(!isSaveContributionResponseParams("a string"));
		assert(!isSaveContributionResponseParams([]));
	});

	/** dbClient corrupted to a non-object is rejected. */
	await t.step("rejects dbClient a non-object", () => {
		assert(!isSaveContributionResponseParams(invalidateSaveContributionResponseParams({ dbClient: "not-a-client" })));
	});

	/** job corrupted to a value failing its owner's guard is rejected. */
	await t.step("rejects job failing its owner guard", () => {
		assert(!isSaveContributionResponseParams(invalidateSaveContributionResponseParams({ job: "not-a-job" })));
	});

	/** providerRow corrupted to a value failing its owner's guard is rejected. */
	await t.step("rejects providerRow failing its owner guard", () => {
		assert(!isSaveContributionResponseParams(invalidateSaveContributionResponseParams({ providerRow: "not-a-provider" })));
	});

	/** modelConfig corrupted to a non-record is rejected. */
	await t.step("rejects modelConfig a non-record", () => {
		assert(!isSaveContributionResponseParams(invalidateSaveContributionResponseParams({ modelConfig: "not-a-config" })));
	});

	/** assembledResponse corrupted to a non-record is rejected. */
	await t.step("rejects assembledResponse a non-record", () => {
		assert(!isSaveContributionResponseParams(invalidateSaveContributionResponseParams({ assembledResponse: "not-a-response" })));
	});

	/** preparedContentResult corrupted to a non-record is rejected. */
	await t.step("rejects preparedContentResult a non-record", () => {
		assert(!isSaveContributionResponseParams(invalidateSaveContributionResponseParams({ preparedContentResult: "not-a-result" })));
	});

	/** dbClient omitted (rest-destructured away) is rejected. */
	await t.step("rejects dbClient omitted", () => {
		const { dbClient: _omit, ...missing } = buildSaveContributionResponseParams();
		assert(!isSaveContributionResponseParams(missing));
	});

	/** job omitted (rest-destructured away) is rejected. */
	await t.step("rejects job omitted", () => {
		const { job: _omit, ...missing } = buildSaveContributionResponseParams();
		assert(!isSaveContributionResponseParams(missing));
	});

	/** providerRow omitted (rest-destructured away) is rejected. */
	await t.step("rejects providerRow omitted", () => {
		const { providerRow: _omit, ...missing } = buildSaveContributionResponseParams();
		assert(!isSaveContributionResponseParams(missing));
	});

	/** modelConfig omitted (rest-destructured away) is rejected. */
	await t.step("rejects modelConfig omitted", () => {
		const { modelConfig: _omit, ...missing } = buildSaveContributionResponseParams();
		assert(!isSaveContributionResponseParams(missing));
	});

	/** assembledResponse omitted (rest-destructured away) is rejected. */
	await t.step("rejects assembledResponse omitted", () => {
		const { assembledResponse: _omit, ...missing } = buildSaveContributionResponseParams();
		assert(!isSaveContributionResponseParams(missing));
	});

	/** preparedContentResult omitted (rest-destructured away) is rejected. */
	await t.step("rejects preparedContentResult omitted", () => {
		const { preparedContentResult: _omit, ...missing } = buildSaveContributionResponseParams();
		assert(!isSaveContributionResponseParams(missing));
	});
});

// --- isSaveContributionResponseSuccessReturn ---

Deno.test("Type Guard: isSaveContributionResponseSuccessReturn", async (t) => {
	/** the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isSaveContributionResponseSuccessReturn(buildSaveContributionResponseSuccessReturn()));
	});

	/** status 'completed' is accepted. */
	await t.step("accepts status completed", () => {
		assert(isSaveContributionResponseSuccessReturn(buildSaveContributionResponseSuccessReturn({ status: "completed" })));
	});

	/** status 'needs_continuation' is accepted. */
	await t.step("accepts status needs_continuation", () => {
		assert(isSaveContributionResponseSuccessReturn(buildSaveContributionResponseSuccessReturn({ status: "needs_continuation" })));
	});

	/** status 'continuation_limit_reached' is accepted. */
	await t.step("accepts status continuation_limit_reached", () => {
		assert(isSaveContributionResponseSuccessReturn(buildSaveContributionResponseSuccessReturn({ status: "continuation_limit_reached" })));
	});

	/** null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isSaveContributionResponseSuccessReturn(null));
		assert(!isSaveContributionResponseSuccessReturn(undefined));
		assert(!isSaveContributionResponseSuccessReturn("a string"));
		assert(!isSaveContributionResponseSuccessReturn([]));
	});

	/** status corrupted to a non-string is rejected. */
	await t.step("rejects status a non-string", () => {
		assert(!isSaveContributionResponseSuccessReturn(invalidateSaveContributionResponseSuccessReturn({ status: 123 })));
	});

	/** status corrupted to a value outside the admitted literal set is rejected. */
	await t.step("rejects status outside the admitted set", () => {
		assert(!isSaveContributionResponseSuccessReturn(invalidateSaveContributionResponseSuccessReturn({ status: "unknown" })));
	});

	/** the error return is rejected, proving the two arms are mutually exclusive. */
	await t.step("rejects the error return", () => {
		assert(!isSaveContributionResponseSuccessReturn(buildSaveContributionResponseErrorReturn()));
	});

	/** status omitted (rest-destructured away) is rejected. */
	await t.step("rejects status omitted", () => {
		const { status: _omit, ...missing } = buildSaveContributionResponseSuccessReturn();
		assert(!isSaveContributionResponseSuccessReturn(missing));
	});
});

// --- isSaveContributionResponseErrorReturn ---

Deno.test("Type Guard: isSaveContributionResponseErrorReturn", async (t) => {
	/** the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isSaveContributionResponseErrorReturn(buildSaveContributionResponseErrorReturn()));
	});

	/** null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isSaveContributionResponseErrorReturn(null));
		assert(!isSaveContributionResponseErrorReturn(undefined));
		assert(!isSaveContributionResponseErrorReturn("a string"));
		assert(!isSaveContributionResponseErrorReturn([]));
	});

	/** error corrupted to a plain object is rejected. */
	await t.step("rejects error a plain object", () => {
		assert(!isSaveContributionResponseErrorReturn(invalidateSaveContributionResponseErrorReturn({ error: {} })));
	});

	/** error corrupted to a string is rejected. */
	await t.step("rejects error a string", () => {
		assert(!isSaveContributionResponseErrorReturn(invalidateSaveContributionResponseErrorReturn({ error: "not-an-error" })));
	});

	/** retriable corrupted to a non-boolean is rejected. */
	await t.step("rejects retriable a non-boolean", () => {
		assert(!isSaveContributionResponseErrorReturn(invalidateSaveContributionResponseErrorReturn({ retriable: "not-a-boolean" })));
	});

	/** the success return is rejected, proving the two arms are mutually exclusive. */
	await t.step("rejects the success return", () => {
		assert(!isSaveContributionResponseErrorReturn(buildSaveContributionResponseSuccessReturn()));
	});

	/** error omitted (rest-destructured away) is rejected. */
	await t.step("rejects error omitted", () => {
		const { error: _omit, ...missing } = buildSaveContributionResponseErrorReturn();
		assert(!isSaveContributionResponseErrorReturn(missing));
	});

	/** retriable omitted (rest-destructured away) is rejected. */
	await t.step("rejects retriable omitted", () => {
		const { retriable: _omit, ...missing } = buildSaveContributionResponseErrorReturn();
		assert(!isSaveContributionResponseErrorReturn(missing));
	});
});

// --- isSaveContributionResponseBuildContextError (instanceof) ---

Deno.test("Type Guard: isSaveContributionResponseBuildContextError", async (t) => {
	/** accepts its own builder's instance. */
	await t.step("accepts its own builder instance", () => {
		assert(isSaveContributionResponseBuildContextError(buildSaveContributionResponseBuildContextError()));
	});

	/** rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step("rejects non-instances", () => {
		assert(!isSaveContributionResponseBuildContextError(new Error("test")));
		assert(!isSaveContributionResponseBuildContextError({ jobId: "job-1" }));
		assert(!isSaveContributionResponseBuildContextError(buildSaveContributionResponseUploadError()));
		assert(!isSaveContributionResponseBuildContextError(null));
		assert(!isSaveContributionResponseBuildContextError("a string"));
	});
});

// --- isSaveContributionResponseUploadError (instanceof) ---

Deno.test("Type Guard: isSaveContributionResponseUploadError", async (t) => {
	/** accepts its own builder's instance. */
	await t.step("accepts its own builder instance", () => {
		assert(isSaveContributionResponseUploadError(buildSaveContributionResponseUploadError()));
	});

	/** rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step("rejects non-instances", () => {
		assert(!isSaveContributionResponseUploadError(new Error("test")));
		assert(!isSaveContributionResponseUploadError({ jobId: "job-1", driverMessage: "upload failed" }));
		assert(!isSaveContributionResponseUploadError(buildSaveContributionResponseContributionRecordError()));
		assert(!isSaveContributionResponseUploadError(null));
		assert(!isSaveContributionResponseUploadError("a string"));
	});
});

// --- isSaveContributionResponseContributionRecordError (instanceof) ---

Deno.test("Type Guard: isSaveContributionResponseContributionRecordError", async (t) => {
	/** accepts its own builder's instance. */
	await t.step("accepts its own builder instance", () => {
		assert(isSaveContributionResponseContributionRecordError(buildSaveContributionResponseContributionRecordError()));
	});

	/** rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step("rejects non-instances", () => {
		assert(!isSaveContributionResponseContributionRecordError(new Error("test")));
		assert(!isSaveContributionResponseContributionRecordError({ jobId: "job-1" }));
		assert(!isSaveContributionResponseContributionRecordError(buildSaveContributionResponseBuildContextError()));
		assert(!isSaveContributionResponseContributionRecordError(null));
		assert(!isSaveContributionResponseContributionRecordError("a string"));
	});
});

// --- isSaveContributionResponseBuildContextErrorConstructorParams ---

Deno.test("Type Guard: isSaveContributionResponseBuildContextErrorConstructorParams", async (t) => {
	/** the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isSaveContributionResponseBuildContextErrorConstructorParams(buildSaveContributionResponseBuildContextErrorConstructorParams()));
	});

	/** null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isSaveContributionResponseBuildContextErrorConstructorParams(null));
		assert(!isSaveContributionResponseBuildContextErrorConstructorParams(undefined));
		assert(!isSaveContributionResponseBuildContextErrorConstructorParams("a string"));
		assert(!isSaveContributionResponseBuildContextErrorConstructorParams([]));
	});

	/** jobId corrupted to a non-string is rejected. */
	await t.step("rejects jobId a non-string", () => {
		assert(!isSaveContributionResponseBuildContextErrorConstructorParams(invalidateSaveContributionResponseBuildContextErrorConstructorParams({ jobId: 123 })));
	});

	/** jobId omitted (rest-destructured away) is rejected. */
	await t.step("rejects jobId omitted", () => {
		const { jobId: _omit, ...missing } = buildSaveContributionResponseBuildContextErrorConstructorParams();
		assert(!isSaveContributionResponseBuildContextErrorConstructorParams(missing));
	});
});

// --- isSaveContributionResponseUploadErrorConstructorParams ---

Deno.test("Type Guard: isSaveContributionResponseUploadErrorConstructorParams", async (t) => {
	/** the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isSaveContributionResponseUploadErrorConstructorParams(buildSaveContributionResponseUploadErrorConstructorParams()));
	});

	/** null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isSaveContributionResponseUploadErrorConstructorParams(null));
		assert(!isSaveContributionResponseUploadErrorConstructorParams(undefined));
		assert(!isSaveContributionResponseUploadErrorConstructorParams("a string"));
		assert(!isSaveContributionResponseUploadErrorConstructorParams([]));
	});

	/** jobId corrupted to a non-string is rejected. */
	await t.step("rejects jobId a non-string", () => {
		assert(!isSaveContributionResponseUploadErrorConstructorParams(invalidateSaveContributionResponseUploadErrorConstructorParams({ jobId: 123 })));
	});

	/** driverMessage corrupted to a non-string is rejected. */
	await t.step("rejects driverMessage a non-string", () => {
		assert(!isSaveContributionResponseUploadErrorConstructorParams(invalidateSaveContributionResponseUploadErrorConstructorParams({ driverMessage: 123 })));
	});

	/** jobId omitted (rest-destructured away) is rejected. */
	await t.step("rejects jobId omitted", () => {
		const { jobId: _omit, ...missing } = buildSaveContributionResponseUploadErrorConstructorParams();
		assert(!isSaveContributionResponseUploadErrorConstructorParams(missing));
	});

	/** driverMessage omitted (rest-destructured away) is rejected. */
	await t.step("rejects driverMessage omitted", () => {
		const { driverMessage: _omit, ...missing } = buildSaveContributionResponseUploadErrorConstructorParams();
		assert(!isSaveContributionResponseUploadErrorConstructorParams(missing));
	});
});

// --- isSaveContributionResponseContributionRecordErrorConstructorParams ---

Deno.test("Type Guard: isSaveContributionResponseContributionRecordErrorConstructorParams", async (t) => {
	/** the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isSaveContributionResponseContributionRecordErrorConstructorParams(buildSaveContributionResponseContributionRecordErrorConstructorParams()));
	});

	/** null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isSaveContributionResponseContributionRecordErrorConstructorParams(null));
		assert(!isSaveContributionResponseContributionRecordErrorConstructorParams(undefined));
		assert(!isSaveContributionResponseContributionRecordErrorConstructorParams("a string"));
		assert(!isSaveContributionResponseContributionRecordErrorConstructorParams([]));
	});

	/** jobId corrupted to a non-string is rejected. */
	await t.step("rejects jobId a non-string", () => {
		assert(!isSaveContributionResponseContributionRecordErrorConstructorParams(invalidateSaveContributionResponseContributionRecordErrorConstructorParams({ jobId: 123 })));
	});

	/** jobId omitted (rest-destructured away) is rejected. */
	await t.step("rejects jobId omitted", () => {
		const { jobId: _omit, ...missing } = buildSaveContributionResponseContributionRecordErrorConstructorParams();
		assert(!isSaveContributionResponseContributionRecordErrorConstructorParams(missing));
	});
});
