import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
	isAssembleCompressionPromptDeps,
	isAssembleCompressionPromptErrorReturn,
	isAssembleCompressionPromptParams,
	isAssembleCompressionPromptPayload,
	isAssembleCompressionPromptSuccessReturn,
} from "./assembleCompressionPrompt.guards.ts";
import {
	buildAssembleCompressionPromptDeps,
	buildAssembleCompressionPromptParams,
	buildAssembleCompressionPromptPayload,
	buildAssembleCompressionPromptSuccessReturn,
	buildAssembleCompressionPromptErrorReturn,
	invalidateAssembleCompressionPromptParams,
	invalidateAssembleCompressionPromptPayload,
} from "./assembleCompressionPrompt.mock.ts";

// --- isAssembleCompressionPromptDeps ---

Deno.test("isAssembleCompressionPromptDeps accepts the builder's five-member default", () => {
	const deps = buildAssembleCompressionPromptDeps();
	assert(isAssembleCompressionPromptDeps(deps));
});

Deno.test("isAssembleCompressionPromptDeps rejects missing fileManager", () => {
	const { fileManager: _omit, ...missingFileManager } = buildAssembleCompressionPromptDeps();
	assert(!isAssembleCompressionPromptDeps(missingFileManager));
});

Deno.test("isAssembleCompressionPromptDeps rejects missing constructStoragePath", () => {
	const { constructStoragePath: _omit, ...missingConstructStoragePath } = buildAssembleCompressionPromptDeps();
	assert(!isAssembleCompressionPromptDeps(missingConstructStoragePath));
});

Deno.test("isAssembleCompressionPromptDeps rejects non-record roots", () => {
	assert(!isAssembleCompressionPromptDeps(null));
	assert(!isAssembleCompressionPromptDeps(undefined));
	assert(!isAssembleCompressionPromptDeps("x"));
	assert(!isAssembleCompressionPromptDeps(7));
	assert(!isAssembleCompressionPromptDeps([]));
});

// --- isAssembleCompressionPromptParams ---

Deno.test("isAssembleCompressionPromptParams accepts the default build", () => {
	const params = buildAssembleCompressionPromptParams();
	assert(isAssembleCompressionPromptParams(params));
});

Deno.test("isAssembleCompressionPromptParams accepts a 'history' build overriding sourceType, sourceId and role with documentKey absent", () => {
	const { documentKey: _omit, ...historyParams } = buildAssembleCompressionPromptParams({
		sourceType: "history",
		sourceId: "msg-123",
		role: "user",
	});
	assert(isAssembleCompressionPromptParams(historyParams));
});

Deno.test("isAssembleCompressionPromptParams rejects non-record roots", () => {
	assert(!isAssembleCompressionPromptParams(null));
	assert(!isAssembleCompressionPromptParams(undefined));
	assert(!isAssembleCompressionPromptParams("x"));
	assert(!isAssembleCompressionPromptParams([]));
});

Deno.test("isAssembleCompressionPromptParams rejects each new member corrupted", () => {
	assert(!isAssembleCompressionPromptParams(invalidateAssembleCompressionPromptParams({ projectId: null })));
	assert(!isAssembleCompressionPromptParams(invalidateAssembleCompressionPromptParams({ sessionId: null })));
	assert(!isAssembleCompressionPromptParams(invalidateAssembleCompressionPromptParams({ iterationNumber: null })));
	assert(!isAssembleCompressionPromptParams(invalidateAssembleCompressionPromptParams({ stageSlug: null })));
	assert(!isAssembleCompressionPromptParams(invalidateAssembleCompressionPromptParams({ targetKey: null })));
	assert(!isAssembleCompressionPromptParams(invalidateAssembleCompressionPromptParams({ sourceType: null })));
	assert(!isAssembleCompressionPromptParams(invalidateAssembleCompressionPromptParams({ modelSlug: null })));
	assert(!isAssembleCompressionPromptParams(invalidateAssembleCompressionPromptParams({ attemptCount: null })));
	assert(!isAssembleCompressionPromptParams(invalidateAssembleCompressionPromptParams({ userId: null })));
});

Deno.test("isAssembleCompressionPromptParams rejects each required member omitted", () => {
	const { projectId: _p, ...missingProjectId } = buildAssembleCompressionPromptParams();
	assert(!isAssembleCompressionPromptParams(missingProjectId));

	const { sessionId: _s, ...missingSessionId } = buildAssembleCompressionPromptParams();
	assert(!isAssembleCompressionPromptParams(missingSessionId));

	const { iterationNumber: _i, ...missingIteration } = buildAssembleCompressionPromptParams();
	assert(!isAssembleCompressionPromptParams(missingIteration));

	const { stageSlug: _st, ...missingStageSlug } = buildAssembleCompressionPromptParams();
	assert(!isAssembleCompressionPromptParams(missingStageSlug));

	const { targetKey: _t, ...missingTargetKey } = buildAssembleCompressionPromptParams();
	assert(!isAssembleCompressionPromptParams(missingTargetKey));

	const { sourceType: _sr, ...missingSourceType } = buildAssembleCompressionPromptParams();
	assert(!isAssembleCompressionPromptParams(missingSourceType));

	const { modelSlug: _m, ...missingModelSlug } = buildAssembleCompressionPromptParams();
	assert(!isAssembleCompressionPromptParams(missingModelSlug));

	const { attemptCount: _a, ...missingAttemptCount } = buildAssembleCompressionPromptParams();
	assert(!isAssembleCompressionPromptParams(missingAttemptCount));

	const { userId: _u, ...missingUserId } = buildAssembleCompressionPromptParams();
	assert(!isAssembleCompressionPromptParams(missingUserId));
});

Deno.test("isAssembleCompressionPromptParams per-sourceType branch: 'resource' without documentKey is rejected", () => {
	const { documentKey: _omit, ...missingDocumentKey } = buildAssembleCompressionPromptParams({
		sourceType: "resource",
	});
	assert(!isAssembleCompressionPromptParams(missingDocumentKey));
});

Deno.test("isAssembleCompressionPromptParams per-sourceType branch: 'feedback' without documentKey is rejected", () => {
	const { documentKey: _omit, ...missingDocumentKey } = buildAssembleCompressionPromptParams({
		sourceType: "feedback",
	});
	assert(!isAssembleCompressionPromptParams(missingDocumentKey));
});

Deno.test("isAssembleCompressionPromptParams per-sourceType branch: 'history' without sourceId is rejected", () => {
	const { documentKey: _omit, ...historyNoSourceId } = buildAssembleCompressionPromptParams({
		sourceType: "history",
		role: "user",
	});
	assert(!isAssembleCompressionPromptParams(historyNoSourceId));
});

Deno.test("isAssembleCompressionPromptParams per-sourceType branch: 'history' with sourceId but no valid role is rejected", () => {
	const { documentKey: _omit, ...historyNoRole } = buildAssembleCompressionPromptParams({
		sourceType: "history",
		sourceId: "msg-123",
	});
	assert(!isAssembleCompressionPromptParams(historyNoRole));
});

Deno.test("isAssembleCompressionPromptParams per-sourceType branch: 'history' carrying documentKey and no sourceId is rejected", () => {
	const params = buildAssembleCompressionPromptParams({
		sourceType: "history",
	});
	// documentKey is still set from the default 'resource' build; sourceId and role are absent
	assert(!isAssembleCompressionPromptParams(params));
});

// --- isAssembleCompressionPromptPayload (unchanged contract) ---

Deno.test("isAssembleCompressionPromptPayload accepts a valid text-mode payload", () => {
	const payload = buildAssembleCompressionPromptPayload({ mode: "text" });
	assert(isAssembleCompressionPromptPayload(payload));
});

Deno.test("isAssembleCompressionPromptPayload accepts a valid json-mode payload", () => {
	const payload = buildAssembleCompressionPromptPayload({
		mode: "json",
		content: '{"key":"value"}',
	});
	assert(isAssembleCompressionPromptPayload(payload));
});

Deno.test("isAssembleCompressionPromptPayload accepts a valid payload with chunk fields", () => {
	const payload = buildAssembleCompressionPromptPayload({
		mode: "text",
		content: "chunk content",
		chunk_index: 1,
		chunk_total: 2,
	});
	assert(isAssembleCompressionPromptPayload(payload));
});

Deno.test("isAssembleCompressionPromptPayload rejects an invalid mode", () => {
	assert(!isAssembleCompressionPromptPayload(invalidateAssembleCompressionPromptPayload({ mode: "invalid" })));
});

Deno.test("isAssembleCompressionPromptPayload rejects missing content", () => {
	const { content: _omit, ...missingContent } = buildAssembleCompressionPromptPayload();
	assert(!isAssembleCompressionPromptPayload(missingContent));
});

Deno.test("isAssembleCompressionPromptPayload rejects empty content", () => {
	assert(!isAssembleCompressionPromptPayload(invalidateAssembleCompressionPromptPayload({ content: "" })));
});

Deno.test("isAssembleCompressionPromptPayload rejects payload with only chunk_index", () => {
	const { chunk_total: _omit, ...onlyChunkIndex } = buildAssembleCompressionPromptPayload({
		chunk_index: 1,
		chunk_total: 2,
	});
	assert(!isAssembleCompressionPromptPayload(onlyChunkIndex));
});

Deno.test("isAssembleCompressionPromptPayload rejects payload with only chunk_total", () => {
	const { chunk_index: _omit, ...onlyChunkTotal } = buildAssembleCompressionPromptPayload({
		chunk_index: 1,
		chunk_total: 2,
	});
	assert(!isAssembleCompressionPromptPayload(onlyChunkTotal));
});

Deno.test("isAssembleCompressionPromptPayload rejects non-record roots", () => {
	assert(!isAssembleCompressionPromptPayload(null));
	assert(!isAssembleCompressionPromptPayload(undefined));
	assert(!isAssembleCompressionPromptPayload("x"));
	assert(!isAssembleCompressionPromptPayload([]));
});

// --- isAssembleCompressionPromptSuccessReturn ---

Deno.test("isAssembleCompressionPromptSuccessReturn accepts a valid success return", () => {
	const success = buildAssembleCompressionPromptSuccessReturn();
	assert(isAssembleCompressionPromptSuccessReturn(success));
});

Deno.test("isAssembleCompressionPromptSuccessReturn rejects a value carrying both promptContent and error", () => {
	const mixed = {
		...buildAssembleCompressionPromptSuccessReturn(),
		error: new Error("failed"),
	};
	assert(!isAssembleCompressionPromptSuccessReturn(mixed));
});

Deno.test("isAssembleCompressionPromptSuccessReturn rejects non-record roots", () => {
	assert(!isAssembleCompressionPromptSuccessReturn(null));
	assert(!isAssembleCompressionPromptSuccessReturn(undefined));
	assert(!isAssembleCompressionPromptSuccessReturn("x"));
	assert(!isAssembleCompressionPromptSuccessReturn([]));
});

// --- isAssembleCompressionPromptErrorReturn ---

Deno.test("isAssembleCompressionPromptErrorReturn accepts a valid error return", () => {
	const error = buildAssembleCompressionPromptErrorReturn();
	assert(isAssembleCompressionPromptErrorReturn(error));
});

Deno.test("isAssembleCompressionPromptErrorReturn accepts an error return whose error is a FileManagerError", () => {
	const error = {
		...buildAssembleCompressionPromptErrorReturn(),
		error: { message: "db down" },
		retriable: true,
	};
	assert(isAssembleCompressionPromptErrorReturn(error));
});

Deno.test("isAssembleCompressionPromptErrorReturn rejects a value carrying both promptContent and error", () => {
	const mixed = {
		...buildAssembleCompressionPromptErrorReturn(),
		promptContent: "compressed prompt",
	};
	assert(!isAssembleCompressionPromptErrorReturn(mixed));
});

Deno.test("isAssembleCompressionPromptErrorReturn rejects missing retriable", () => {
	const { retriable: _omit, ...missingRetriable } = buildAssembleCompressionPromptErrorReturn();
	assert(!isAssembleCompressionPromptErrorReturn(missingRetriable));
});

Deno.test("isAssembleCompressionPromptErrorReturn rejects non-boolean retriable", () => {
	const error = {
		...buildAssembleCompressionPromptErrorReturn(),
		retriable: "no",
	};
	assert(!isAssembleCompressionPromptErrorReturn(error));
});

Deno.test("isAssembleCompressionPromptErrorReturn rejects non-record roots", () => {
	assert(!isAssembleCompressionPromptErrorReturn(null));
	assert(!isAssembleCompressionPromptErrorReturn(undefined));
	assert(!isAssembleCompressionPromptErrorReturn("x"));
	assert(!isAssembleCompressionPromptErrorReturn([]));
});
