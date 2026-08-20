import { assert } from "jsr:@std/assert";
import {
	isSaveCompressedResponseDeps,
	isSaveCompressedResponseParams,
	isSaveCompressedResponseSuccessReturn,
	isSaveCompressedResponseErrorReturn,
	isSaveCompressedResponseRawJsonUploadError,
	isSaveCompressedResponseJobUpdateError,
	isSaveCompressedResponseExtractedUploadError,
	isSaveCompressedResponseRawJsonUploadErrorConstructorParams,
	isSaveCompressedResponseJobUpdateErrorConstructorParams,
	isSaveCompressedResponseExtractedUploadErrorConstructorParams,
} from "./saveCompressedResponse.guard.ts";
import {
	buildSaveCompressedResponseDeps,
	invalidateSaveCompressedResponseDeps,
	buildSaveCompressedResponseParams,
	invalidateSaveCompressedResponseParams,
	buildSaveCompressedResponseSuccessReturn,
	invalidateSaveCompressedResponseSuccessReturn,
	buildSaveCompressedResponseErrorReturn,
	invalidateSaveCompressedResponseErrorReturn,
	buildSaveCompressedResponseRawJsonUploadError,
	buildSaveCompressedResponseJobUpdateError,
	buildSaveCompressedResponseExtractedUploadError,
	buildSaveCompressedResponseRawJsonUploadErrorConstructorParams,
	invalidateSaveCompressedResponseRawJsonUploadErrorConstructorParams,
	buildSaveCompressedResponseJobUpdateErrorConstructorParams,
	invalidateSaveCompressedResponseJobUpdateErrorConstructorParams,
	buildSaveCompressedResponseExtractedUploadErrorConstructorParams,
	invalidateSaveCompressedResponseExtractedUploadErrorConstructorParams,
} from "./saveCompressedResponse.mock.ts";

// --- isSaveCompressedResponseDeps ---

Deno.test("Type Guard: isSaveCompressedResponseDeps", async (t) => {
	/** the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isSaveCompressedResponseDeps(buildSaveCompressedResponseDeps()));
	});

	/** null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isSaveCompressedResponseDeps(null));
		assert(!isSaveCompressedResponseDeps(undefined));
		assert(!isSaveCompressedResponseDeps("a string"));
		assert(!isSaveCompressedResponseDeps([]));
	});

	/** fileManager corrupted to a non-object is rejected. */
	await t.step("rejects fileManager a non-object", () => {
		assert(!isSaveCompressedResponseDeps(invalidateSaveCompressedResponseDeps({ fileManager: "not-an-object" })));
	});

	/** fileManager corrupted to an object carrying no uploadAndRegisterFile method is rejected. */
	await t.step("rejects fileManager carrying no uploadAndRegisterFile", () => {
		assert(!isSaveCompressedResponseDeps(invalidateSaveCompressedResponseDeps({ fileManager: {} })));
	});

	/** buildUploadContext corrupted to a non-function is rejected. */
	await t.step("rejects buildUploadContext a non-function", () => {
		assert(!isSaveCompressedResponseDeps(invalidateSaveCompressedResponseDeps({ buildUploadContext: "not-a-function" })));
	});

	/** enqueueRenderJob corrupted to a non-function is rejected. */
	await t.step("rejects enqueueRenderJob a non-function", () => {
		assert(!isSaveCompressedResponseDeps(invalidateSaveCompressedResponseDeps({ enqueueRenderJob: "not-a-function" })));
	});

	/** fileManager omitted (rest-destructured away) is rejected. */
	await t.step("rejects fileManager omitted", () => {
		const { fileManager: _omit, ...missing } = buildSaveCompressedResponseDeps();
		assert(!isSaveCompressedResponseDeps(missing));
	});

	/** buildUploadContext omitted (rest-destructured away) is rejected. */
	await t.step("rejects buildUploadContext omitted", () => {
		const { buildUploadContext: _omit, ...missing } = buildSaveCompressedResponseDeps();
		assert(!isSaveCompressedResponseDeps(missing));
	});

	/** enqueueRenderJob omitted (rest-destructured away) is rejected. */
	await t.step("rejects enqueueRenderJob omitted", () => {
		const { enqueueRenderJob: _omit, ...missing } = buildSaveCompressedResponseDeps();
		assert(!isSaveCompressedResponseDeps(missing));
	});
});

// --- isSaveCompressedResponseParams ---

Deno.test("Type Guard: isSaveCompressedResponseParams", async (t) => {
	/** the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isSaveCompressedResponseParams(buildSaveCompressedResponseParams()));
	});

	/** null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isSaveCompressedResponseParams(null));
		assert(!isSaveCompressedResponseParams(undefined));
		assert(!isSaveCompressedResponseParams("a string"));
		assert(!isSaveCompressedResponseParams([]));
	});

	/** dbClient corrupted to a non-object is rejected. */
	await t.step("rejects dbClient a non-object", () => {
		assert(!isSaveCompressedResponseParams(invalidateSaveCompressedResponseParams({ dbClient: "not-a-client" })));
	});

	/** job corrupted to a value failing its owner's guard is rejected. */
	await t.step("rejects job failing its owner guard", () => {
		assert(!isSaveCompressedResponseParams(invalidateSaveCompressedResponseParams({ job: "not-a-job" })));
	});

	/** providerRow corrupted to a value failing its owner's guard is rejected. */
	await t.step("rejects providerRow failing its owner guard", () => {
		assert(!isSaveCompressedResponseParams(invalidateSaveCompressedResponseParams({ providerRow: "not-a-provider" })));
	});

	/** assembledResponse corrupted to a non-record is rejected. */
	await t.step("rejects assembledResponse a non-record", () => {
		assert(!isSaveCompressedResponseParams(invalidateSaveCompressedResponseParams({ assembledResponse: "not-a-response" })));
	});

	/** preparedContentResult corrupted to a non-record is rejected. */
	await t.step("rejects preparedContentResult a non-record", () => {
		assert(!isSaveCompressedResponseParams(invalidateSaveCompressedResponseParams({ preparedContentResult: "not-a-result" })));
	});

	/** dbClient omitted (rest-destructured away) is rejected. */
	await t.step("rejects dbClient omitted", () => {
		const { dbClient: _omit, ...missing } = buildSaveCompressedResponseParams();
		assert(!isSaveCompressedResponseParams(missing));
	});

	/** job omitted (rest-destructured away) is rejected. */
	await t.step("rejects job omitted", () => {
		const { job: _omit, ...missing } = buildSaveCompressedResponseParams();
		assert(!isSaveCompressedResponseParams(missing));
	});

	/** providerRow omitted (rest-destructured away) is rejected. */
	await t.step("rejects providerRow omitted", () => {
		const { providerRow: _omit, ...missing } = buildSaveCompressedResponseParams();
		assert(!isSaveCompressedResponseParams(missing));
	});

	/** assembledResponse omitted (rest-destructured away) is rejected. */
	await t.step("rejects assembledResponse omitted", () => {
		const { assembledResponse: _omit, ...missing } = buildSaveCompressedResponseParams();
		assert(!isSaveCompressedResponseParams(missing));
	});

	/** preparedContentResult omitted (rest-destructured away) is rejected. */
	await t.step("rejects preparedContentResult omitted", () => {
		const { preparedContentResult: _omit, ...missing } = buildSaveCompressedResponseParams();
		assert(!isSaveCompressedResponseParams(missing));
	});
});

// --- isSaveCompressedResponseSuccessReturn ---

Deno.test("Type Guard: isSaveCompressedResponseSuccessReturn", async (t) => {
	/** the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isSaveCompressedResponseSuccessReturn(buildSaveCompressedResponseSuccessReturn()));
	});

	/** status 'completed' is accepted. */
	await t.step("accepts status completed", () => {
		assert(isSaveCompressedResponseSuccessReturn(buildSaveCompressedResponseSuccessReturn({ status: "completed" })));
	});

	/** status 'needs_continuation' is accepted. */
	await t.step("accepts status needs_continuation", () => {
		assert(isSaveCompressedResponseSuccessReturn(buildSaveCompressedResponseSuccessReturn({ status: "needs_continuation" })));
	});

	/** status 'waiting_for_children' is accepted. */
	await t.step("accepts status waiting_for_children", () => {
		assert(isSaveCompressedResponseSuccessReturn(buildSaveCompressedResponseSuccessReturn({ status: "waiting_for_children" })));
	});

	/** null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isSaveCompressedResponseSuccessReturn(null));
		assert(!isSaveCompressedResponseSuccessReturn(undefined));
		assert(!isSaveCompressedResponseSuccessReturn("a string"));
		assert(!isSaveCompressedResponseSuccessReturn([]));
	});

	/** status corrupted to a non-string is rejected. */
	await t.step("rejects status a non-string", () => {
		assert(!isSaveCompressedResponseSuccessReturn(invalidateSaveCompressedResponseSuccessReturn({ status: 123 })));
	});

	/** status corrupted to a value outside the admitted literal set is rejected. */
	await t.step("rejects status outside the admitted set", () => {
		assert(!isSaveCompressedResponseSuccessReturn(invalidateSaveCompressedResponseSuccessReturn({ status: "unknown" })));
	});

	/** the error return is rejected, proving the two arms are mutually exclusive. */
	await t.step("rejects the error return", () => {
		assert(!isSaveCompressedResponseSuccessReturn(buildSaveCompressedResponseErrorReturn()));
	});

	/** status omitted (rest-destructured away) is rejected. */
	await t.step("rejects status omitted", () => {
		const { status: _omit, ...missing } = buildSaveCompressedResponseSuccessReturn();
		assert(!isSaveCompressedResponseSuccessReturn(missing));
	});
});

// --- isSaveCompressedResponseErrorReturn ---

Deno.test("Type Guard: isSaveCompressedResponseErrorReturn", async (t) => {
	/** the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isSaveCompressedResponseErrorReturn(buildSaveCompressedResponseErrorReturn()));
	});

	/** null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isSaveCompressedResponseErrorReturn(null));
		assert(!isSaveCompressedResponseErrorReturn(undefined));
		assert(!isSaveCompressedResponseErrorReturn("a string"));
		assert(!isSaveCompressedResponseErrorReturn([]));
	});

	/** error corrupted to a plain object is rejected. */
	await t.step("rejects error a plain object", () => {
		assert(!isSaveCompressedResponseErrorReturn(invalidateSaveCompressedResponseErrorReturn({ error: {} })));
	});

	/** error corrupted to a string is rejected. */
	await t.step("rejects error a string", () => {
		assert(!isSaveCompressedResponseErrorReturn(invalidateSaveCompressedResponseErrorReturn({ error: "not-an-error" })));
	});

	/** retriable corrupted to a non-boolean is rejected. */
	await t.step("rejects retriable a non-boolean", () => {
		assert(!isSaveCompressedResponseErrorReturn(invalidateSaveCompressedResponseErrorReturn({ retriable: "not-a-boolean" })));
	});

	/** the success return is rejected, proving the two arms are mutually exclusive. */
	await t.step("rejects the success return", () => {
		assert(!isSaveCompressedResponseErrorReturn(buildSaveCompressedResponseSuccessReturn()));
	});

	/** error omitted (rest-destructured away) is rejected. */
	await t.step("rejects error omitted", () => {
		const { error: _omit, ...missing } = buildSaveCompressedResponseErrorReturn();
		assert(!isSaveCompressedResponseErrorReturn(missing));
	});

	/** retriable omitted (rest-destructured away) is rejected. */
	await t.step("rejects retriable omitted", () => {
		const { retriable: _omit, ...missing } = buildSaveCompressedResponseErrorReturn();
		assert(!isSaveCompressedResponseErrorReturn(missing));
	});
});

// --- isSaveCompressedResponseRawJsonUploadError (instanceof) ---

Deno.test("Type Guard: isSaveCompressedResponseRawJsonUploadError", async (t) => {
	/** accepts its own builder's instance. */
	await t.step("accepts its own builder instance", () => {
		assert(isSaveCompressedResponseRawJsonUploadError(buildSaveCompressedResponseRawJsonUploadError()));
	});

	/** rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step("rejects non-instances", () => {
		assert(!isSaveCompressedResponseRawJsonUploadError(new Error("test")));
		assert(!isSaveCompressedResponseRawJsonUploadError({ jobId: "job-1", driverMessage: "raw json upload failed" }));
		assert(!isSaveCompressedResponseRawJsonUploadError(buildSaveCompressedResponseJobUpdateError()));
		assert(!isSaveCompressedResponseRawJsonUploadError(null));
		assert(!isSaveCompressedResponseRawJsonUploadError("a string"));
	});
});

// --- isSaveCompressedResponseJobUpdateError (instanceof) ---

Deno.test("Type Guard: isSaveCompressedResponseJobUpdateError", async (t) => {
	/** accepts its own builder's instance. */
	await t.step("accepts its own builder instance", () => {
		assert(isSaveCompressedResponseJobUpdateError(buildSaveCompressedResponseJobUpdateError()));
	});

	/** rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step("rejects non-instances", () => {
		assert(!isSaveCompressedResponseJobUpdateError(new Error("test")));
		assert(!isSaveCompressedResponseJobUpdateError({ jobId: "job-1", driverMessage: "waiting_for_children update failed" }));
		assert(!isSaveCompressedResponseJobUpdateError(buildSaveCompressedResponseExtractedUploadError()));
		assert(!isSaveCompressedResponseJobUpdateError(null));
		assert(!isSaveCompressedResponseJobUpdateError("a string"));
	});
});

// --- isSaveCompressedResponseExtractedUploadError (instanceof) ---

Deno.test("Type Guard: isSaveCompressedResponseExtractedUploadError", async (t) => {
	/** accepts its own builder's instance. */
	await t.step("accepts its own builder instance", () => {
		assert(isSaveCompressedResponseExtractedUploadError(buildSaveCompressedResponseExtractedUploadError()));
	});

	/** rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
	await t.step("rejects non-instances", () => {
		assert(!isSaveCompressedResponseExtractedUploadError(new Error("test")));
		assert(!isSaveCompressedResponseExtractedUploadError({ jobId: "job-1", driverMessage: "extracted context upload failed" }));
		assert(!isSaveCompressedResponseExtractedUploadError(buildSaveCompressedResponseRawJsonUploadError()));
		assert(!isSaveCompressedResponseExtractedUploadError(null));
		assert(!isSaveCompressedResponseExtractedUploadError("a string"));
	});
});

// --- isSaveCompressedResponseRawJsonUploadErrorConstructorParams ---

Deno.test("Type Guard: isSaveCompressedResponseRawJsonUploadErrorConstructorParams", async (t) => {
	/** the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isSaveCompressedResponseRawJsonUploadErrorConstructorParams(buildSaveCompressedResponseRawJsonUploadErrorConstructorParams()));
	});

	/** null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isSaveCompressedResponseRawJsonUploadErrorConstructorParams(null));
		assert(!isSaveCompressedResponseRawJsonUploadErrorConstructorParams(undefined));
		assert(!isSaveCompressedResponseRawJsonUploadErrorConstructorParams("a string"));
		assert(!isSaveCompressedResponseRawJsonUploadErrorConstructorParams([]));
	});

	/** jobId corrupted to a non-string is rejected. */
	await t.step("rejects jobId a non-string", () => {
		assert(!isSaveCompressedResponseRawJsonUploadErrorConstructorParams(invalidateSaveCompressedResponseRawJsonUploadErrorConstructorParams({ jobId: 123 })));
	});

	/** driverMessage corrupted to a non-string is rejected. */
	await t.step("rejects driverMessage a non-string", () => {
		assert(!isSaveCompressedResponseRawJsonUploadErrorConstructorParams(invalidateSaveCompressedResponseRawJsonUploadErrorConstructorParams({ driverMessage: 123 })));
	});

	/** jobId omitted (rest-destructured away) is rejected. */
	await t.step("rejects jobId omitted", () => {
		const { jobId: _omit, ...missing } = buildSaveCompressedResponseRawJsonUploadErrorConstructorParams();
		assert(!isSaveCompressedResponseRawJsonUploadErrorConstructorParams(missing));
	});

	/** driverMessage omitted (rest-destructured away) is rejected. */
	await t.step("rejects driverMessage omitted", () => {
		const { driverMessage: _omit, ...missing } = buildSaveCompressedResponseRawJsonUploadErrorConstructorParams();
		assert(!isSaveCompressedResponseRawJsonUploadErrorConstructorParams(missing));
	});
});

// --- isSaveCompressedResponseJobUpdateErrorConstructorParams ---

Deno.test("Type Guard: isSaveCompressedResponseJobUpdateErrorConstructorParams", async (t) => {
	/** the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isSaveCompressedResponseJobUpdateErrorConstructorParams(buildSaveCompressedResponseJobUpdateErrorConstructorParams()));
	});

	/** null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isSaveCompressedResponseJobUpdateErrorConstructorParams(null));
		assert(!isSaveCompressedResponseJobUpdateErrorConstructorParams(undefined));
		assert(!isSaveCompressedResponseJobUpdateErrorConstructorParams("a string"));
		assert(!isSaveCompressedResponseJobUpdateErrorConstructorParams([]));
	});

	/** jobId corrupted to a non-string is rejected. */
	await t.step("rejects jobId a non-string", () => {
		assert(!isSaveCompressedResponseJobUpdateErrorConstructorParams(invalidateSaveCompressedResponseJobUpdateErrorConstructorParams({ jobId: 123 })));
	});

	/** driverMessage corrupted to a non-string is rejected. */
	await t.step("rejects driverMessage a non-string", () => {
		assert(!isSaveCompressedResponseJobUpdateErrorConstructorParams(invalidateSaveCompressedResponseJobUpdateErrorConstructorParams({ driverMessage: 123 })));
	});

	/** jobId omitted (rest-destructured away) is rejected. */
	await t.step("rejects jobId omitted", () => {
		const { jobId: _omit, ...missing } = buildSaveCompressedResponseJobUpdateErrorConstructorParams();
		assert(!isSaveCompressedResponseJobUpdateErrorConstructorParams(missing));
	});

	/** driverMessage omitted (rest-destructured away) is rejected. */
	await t.step("rejects driverMessage omitted", () => {
		const { driverMessage: _omit, ...missing } = buildSaveCompressedResponseJobUpdateErrorConstructorParams();
		assert(!isSaveCompressedResponseJobUpdateErrorConstructorParams(missing));
	});
});

// --- isSaveCompressedResponseExtractedUploadErrorConstructorParams ---

Deno.test("Type Guard: isSaveCompressedResponseExtractedUploadErrorConstructorParams", async (t) => {
	/** the builder's valid default is accepted. */
	await t.step("accepts the builder default", () => {
		assert(isSaveCompressedResponseExtractedUploadErrorConstructorParams(buildSaveCompressedResponseExtractedUploadErrorConstructorParams()));
	});

	/** null, undefined, a primitive, and an array are rejected. */
	await t.step("rejects non-objects", () => {
		assert(!isSaveCompressedResponseExtractedUploadErrorConstructorParams(null));
		assert(!isSaveCompressedResponseExtractedUploadErrorConstructorParams(undefined));
		assert(!isSaveCompressedResponseExtractedUploadErrorConstructorParams("a string"));
		assert(!isSaveCompressedResponseExtractedUploadErrorConstructorParams([]));
	});

	/** jobId corrupted to a non-string is rejected. */
	await t.step("rejects jobId a non-string", () => {
		assert(!isSaveCompressedResponseExtractedUploadErrorConstructorParams(invalidateSaveCompressedResponseExtractedUploadErrorConstructorParams({ jobId: 123 })));
	});

	/** driverMessage corrupted to a non-string is rejected. */
	await t.step("rejects driverMessage a non-string", () => {
		assert(!isSaveCompressedResponseExtractedUploadErrorConstructorParams(invalidateSaveCompressedResponseExtractedUploadErrorConstructorParams({ driverMessage: 123 })));
	});

	/** jobId omitted (rest-destructured away) is rejected. */
	await t.step("rejects jobId omitted", () => {
		const { jobId: _omit, ...missing } = buildSaveCompressedResponseExtractedUploadErrorConstructorParams();
		assert(!isSaveCompressedResponseExtractedUploadErrorConstructorParams(missing));
	});

	/** driverMessage omitted (rest-destructured away) is rejected. */
	await t.step("rejects driverMessage omitted", () => {
		const { driverMessage: _omit, ...missing } = buildSaveCompressedResponseExtractedUploadErrorConstructorParams();
		assert(!isSaveCompressedResponseExtractedUploadErrorConstructorParams(missing));
	});
});
