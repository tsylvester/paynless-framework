import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertSpyCalls, spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { assembleCompressionPrompt } from "./assembleCompressionPrompt.ts";
import { FileType } from "../../types/file_manager.types.ts";
import { MockFileManagerService, buildFileRecord } from "../../services/file_manager.mock.ts";
import { createMockSupabaseClient } from "../../supabase.mock.ts";
import type { MockSupabaseDataConfig } from "../../supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../types_db.ts";
import {
	buildAssembleCompressionPromptDeps,
	buildAssembleCompressionPromptParams,
	buildAssembleCompressionPromptPayload,
	buildCompressionTargetStep,
	invalidateAssembleCompressionPromptParams,
} from "./assembleCompressionPrompt.mock.ts";
import type {
	AssembleCompressionPromptDeps,
	AssembleCompressionPromptParams,
} from "./assembleCompressionPrompt.interface.ts";

// --- Existing rendering and validation cases (assert promptContent, not prompt) ---

Deno.test("assembleCompressionPrompt renders json mode and strips text mode", async () => {
	const fileManager = new MockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
	const deps = buildAssembleCompressionPromptDeps({ fileManager });
	const params = buildAssembleCompressionPromptParams();
	const payload = buildAssembleCompressionPromptPayload({
		mode: "json",
		content: JSON.stringify({ key: "value" }),
	});

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("promptContent" in result) {
		assertStringIncludes(result.promptContent, "The source is a completed JSON structure");
		assert(!result.promptContent.includes("The source is a document"));
	} else {
		assert(false, "Expected a prompt");
	}
});

Deno.test("assembleCompressionPrompt renders text mode and strips json mode", async () => {
	const fileManager = new MockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
	const deps = buildAssembleCompressionPromptDeps({ fileManager });
	const params = buildAssembleCompressionPromptParams();
	const payload = buildAssembleCompressionPromptPayload({ mode: "text" });

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("promptContent" in result) {
		assertStringIncludes(result.promptContent, "The source is a document");
		assert(!result.promptContent.includes("The source is a completed JSON structure"));
	} else {
		assert(false, "Expected a prompt");
	}
});

Deno.test("assembleCompressionPrompt injects outputs_required and step_description", async () => {
	const fileManager = new MockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
	const deps = buildAssembleCompressionPromptDeps({ fileManager });
	const params = buildAssembleCompressionPromptParams();
	const payload = buildAssembleCompressionPromptPayload();

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("promptContent" in result) {
		assertStringIncludes(
			result.promptContent,
			JSON.stringify(params.consumingStep.outputs_required),
		);
		assert(params.consumingStep.step_description !== null);
		assertStringIncludes(result.promptContent, params.consumingStep.step_description);
	} else {
		assert(false, "Expected a prompt");
	}
});

Deno.test("assembleCompressionPrompt renders chunk context with both numbers", async () => {
	const fileManager = new MockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
	const deps = buildAssembleCompressionPromptDeps({ fileManager });
	const params = buildAssembleCompressionPromptParams();
	const payload = buildAssembleCompressionPromptPayload({
		chunk_index: 1,
		chunk_total: 2,
	});

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("promptContent" in result) {
		assertStringIncludes(result.promptContent, "chunk 1 of 2");
		assert(!result.promptContent.includes("{{chunk_index}}"));
		assert(!result.promptContent.includes("{{chunk_total}}"));
	} else {
		assert(false, "Expected a prompt");
	}
});

Deno.test("assembleCompressionPrompt omits chunk context when no chunk fields are provided", async () => {
	const fileManager = new MockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
	const deps = buildAssembleCompressionPromptDeps({ fileManager });
	const params = buildAssembleCompressionPromptParams();
	const payload = buildAssembleCompressionPromptPayload();

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("promptContent" in result) {
		assert(!result.promptContent.includes("{{chunk_index}}"));
		assert(!result.promptContent.includes("{{chunk_total}}"));
		assert(!result.promptContent.includes("chunk 1 of 2"));
	} else {
		assert(false, "Expected a prompt");
	}
});

Deno.test("assembleCompressionPrompt returns retriable=false for empty outputs_required", async () => {
	const deps = buildAssembleCompressionPromptDeps();
	const consumingStep = buildCompressionTargetStep({ outputs_required: {} });
	const params = buildAssembleCompressionPromptParams({ consumingStep });
	const payload = buildAssembleCompressionPromptPayload();

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("error" in result) {
		assertEquals(result.retriable, false);
	} else {
		assert(false, "Expected an error");
	}
});

Deno.test("assembleCompressionPrompt returns retriable=false for empty step_description", async () => {
	const deps = buildAssembleCompressionPromptDeps();
	const consumingStep = buildCompressionTargetStep({ step_description: "" });
	const params = buildAssembleCompressionPromptParams({ consumingStep });
	const payload = buildAssembleCompressionPromptPayload();

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("error" in result) {
		assertEquals(result.retriable, false);
	} else {
		assert(false, "Expected an error");
	}
});

Deno.test("assembleCompressionPrompt returns retriable=false for empty content", async () => {
	const deps = buildAssembleCompressionPromptDeps();
	const params = buildAssembleCompressionPromptParams();
	const payload = buildAssembleCompressionPromptPayload({ content: "" });

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("error" in result) {
		assertEquals(result.retriable, false);
	} else {
		assert(false, "Expected an error");
	}
});

Deno.test("assembleCompressionPrompt returns retriable=false for invalid json content", async () => {
	const deps = buildAssembleCompressionPromptDeps();
	const params = buildAssembleCompressionPromptParams();
	const payload = buildAssembleCompressionPromptPayload({
		mode: "json",
		content: "not json",
	});

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("error" in result) {
		assertEquals(result.retriable, false);
	} else {
		assert(false, "Expected an error");
	}
});

Deno.test("assembleCompressionPrompt returns retriable=false for mismatched chunk fields", async () => {
	const deps = buildAssembleCompressionPromptDeps();
	const params = buildAssembleCompressionPromptParams();
	const payload = buildAssembleCompressionPromptPayload({ chunk_index: 1 });

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("error" in result) {
		assertEquals(result.retriable, false);
	} else {
		assert(false, "Expected an error");
	}
});

// --- New: persistence behavior ---

Deno.test("assembleCompressionPrompt writes exactly once with FileType.CompressionPrompt and the rendered prompt", async () => {
	const fileManager = new MockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
	const constructStoragePathSpy = spy((_ctx: unknown) => ({ storagePath: "compress/prompt", fileName: "prompt.json" }));
	const deps: AssembleCompressionPromptDeps = {
		...buildAssembleCompressionPromptDeps(),
		fileManager,
		constructStoragePath: constructStoragePathSpy as never,
	};
	const params = buildAssembleCompressionPromptParams();
	const payload = buildAssembleCompressionPromptPayload();

	const result = await assembleCompressionPrompt(deps, params, payload);

	if (!("promptContent" in result)) {
		assert(false, "Expected a success return");
		return;
	}

	assertSpyCalls(fileManager.uploadAndRegisterFile, 1);
	const call = fileManager.uploadAndRegisterFile.calls[0];
	const ctx = call.args[0];
	assertEquals(ctx.pathContext.fileType, FileType.CompressionPrompt);
	assertEquals(ctx.fileContent, result.promptContent);
	assertEquals(ctx.mimeType, "text/markdown");
	assertEquals(ctx.userId, params.userId);
});

Deno.test("assembleCompressionPrompt addresses the write through constructStoragePath with the victim identity", async () => {
	const fileManager = new MockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
	const constructStoragePathSpy = spy((_ctx: unknown) => ({ storagePath: "compress/prompt", fileName: "prompt.json" }));
	const deps: AssembleCompressionPromptDeps = {
		...buildAssembleCompressionPromptDeps(),
		fileManager,
		constructStoragePath: constructStoragePathSpy as never,
	};
	const params = buildAssembleCompressionPromptParams();
	const payload = buildAssembleCompressionPromptPayload();

	await assembleCompressionPrompt(deps, params, payload);

	assertSpyCalls(constructStoragePathSpy, 1);
	const ctx = constructStoragePathSpy.calls[0].args[0] as Record<string, unknown>;
	assertEquals(ctx.output_type, params.output_type);
	assertEquals(ctx.sourceType, params.sourceType);
	assertEquals(ctx.documentKey, params.documentKey);
	assertEquals(ctx.modelSlug, params.modelSlug);
	assertEquals(ctx.attemptCount, params.attemptCount);
	assertEquals("isContinuation" in ctx && ctx.isContinuation !== undefined, false);
});

Deno.test("assembleCompressionPrompt 'history' victim context carries sourceId and role and no documentKey", async () => {
	const fileManager = new MockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
	const constructStoragePathSpy = spy((_ctx: unknown) => ({ storagePath: "compress/prompt", fileName: "prompt.json" }));
	const deps: AssembleCompressionPromptDeps = {
		...buildAssembleCompressionPromptDeps(),
		fileManager,
		constructStoragePath: constructStoragePathSpy as never,
	};
	const { documentKey: _omit, ...historyParams } = buildAssembleCompressionPromptParams({
		sourceType: "history",
		sourceId: "msg-123",
		role: "user",
	});
	const payload = buildAssembleCompressionPromptPayload();

	await assembleCompressionPrompt(deps, historyParams, payload);

	const ctx = constructStoragePathSpy.calls[0].args[0] as Record<string, unknown>;
	assertEquals(ctx.sourceId, "msg-123");
	assertEquals(ctx.role, "user");
	assertEquals("documentKey" in ctx, false);
});

Deno.test("assembleCompressionPrompt chunk payload context carries chunkIndex and chunkTotal from the payload", async () => {
	const fileManager = new MockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
	const constructStoragePathSpy = spy((_ctx: unknown) => ({ storagePath: "compress/prompt", fileName: "prompt.json" }));
	const deps: AssembleCompressionPromptDeps = {
		...buildAssembleCompressionPromptDeps(),
		fileManager,
		constructStoragePath: constructStoragePathSpy as never,
	};
	const params = buildAssembleCompressionPromptParams();
	const payload = buildAssembleCompressionPromptPayload({
		chunk_index: 3,
		chunk_total: 5,
	});

	await assembleCompressionPrompt(deps, params, payload);

	const ctx = constructStoragePathSpy.calls[0].args[0] as Record<string, unknown>;
	assertEquals(ctx.chunkIndex, 3);
	assertEquals(ctx.chunkTotal, 5);
});

Deno.test("assembleCompressionPrompt success return is { promptContent, source_prompt_resource_id } with the record id and no messages", async () => {
	const fileManager = new MockFileManagerService();
	const record = buildFileRecord({ id: "rec-abc" });
	fileManager.setUploadAndRegisterFileResponse(record, null);
	const constructStoragePathSpy = spy((_ctx: unknown) => ({ storagePath: "compress/prompt", fileName: "prompt.json" }));
	const deps: AssembleCompressionPromptDeps = {
		...buildAssembleCompressionPromptDeps(),
		fileManager,
		constructStoragePath: constructStoragePathSpy as never,
	};
	const params = buildAssembleCompressionPromptParams();
	const payload = buildAssembleCompressionPromptPayload();

	const result = await assembleCompressionPrompt(deps, params, payload);

	if (!("promptContent" in result)) {
		assert(false, "Expected a success return");
		return;
	}
	assertEquals(result.source_prompt_resource_id, "rec-abc");
	assertEquals("messages" in result, false);
});

Deno.test("assembleCompressionPrompt propagates a file manager error unchanged with retriable=true", async () => {
	const fileManager = new MockFileManagerService();
	const fmError = { message: "storage down" };
	fileManager.setUploadAndRegisterFileResponse(null, fmError);
	const constructStoragePathSpy = spy((_ctx: unknown) => ({ storagePath: "compress/prompt", fileName: "prompt.json" }));
	const deps: AssembleCompressionPromptDeps = {
		...buildAssembleCompressionPromptDeps(),
		fileManager,
		constructStoragePath: constructStoragePathSpy as never,
	};
	const params = buildAssembleCompressionPromptParams();
	const payload = buildAssembleCompressionPromptPayload();

	const result = await assembleCompressionPrompt(deps, params, payload);

	if (!("error" in result)) {
		assert(false, "Expected an error return");
		return;
	}
	assertEquals(result.retriable, true);
	assertEquals(result.error, fmError);
});

Deno.test("assembleCompressionPrompt returns retriable=false and writes nothing when constructStoragePath throws", async () => {
	const fileManager = new MockFileManagerService();
	const throwingConstruct = spy(() => { throw new Error("bad identity"); });
	const deps: AssembleCompressionPromptDeps = {
		...buildAssembleCompressionPromptDeps(),
		fileManager,
		constructStoragePath: throwingConstruct as never,
	};
	const params = buildAssembleCompressionPromptParams();
	const payload = buildAssembleCompressionPromptPayload();

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("error" in result) {
		assertEquals(result.retriable, false);
	} else {
		assert(false, "Expected an error");
	}
	assertSpyCalls(fileManager.uploadAndRegisterFile, 0);
});

Deno.test("assembleCompressionPrompt writes nothing for the template-error, invalid-params, invalid-payload and unparseable-json cases", async () => {
	const fileManager = new MockFileManagerService();
	const constructStoragePathSpy = spy((_ctx: unknown) => ({ storagePath: "compress/prompt", fileName: "prompt.json" }));
	const baseDeps: AssembleCompressionPromptDeps = {
		...buildAssembleCompressionPromptDeps(),
		fileManager,
		constructStoragePath: constructStoragePathSpy as never,
	};
	const params = buildAssembleCompressionPromptParams();

	// Template error
	const errorConfig: MockSupabaseDataConfig = {
		genericMockResults: {
			system_prompts: {
				select: { data: null, error: new Error("DB error") },
			},
		},
	};
	const errorClient = createMockSupabaseClient(undefined, errorConfig).client as unknown as SupabaseClient<Database>;
	const templateErrorDeps: AssembleCompressionPromptDeps = {
		...buildAssembleCompressionPromptDeps(),
		dbClient: errorClient,
		fileManager,
		constructStoragePath: constructStoragePathSpy as never,
	};
	const r0 = await assembleCompressionPrompt(templateErrorDeps, params, buildAssembleCompressionPromptPayload());
	assert("error" in r0);
	assertSpyCalls(fileManager.uploadAndRegisterFile, 0);

	// Invalid params
	const invalidParams = invalidateAssembleCompressionPromptParams({ projectId: "" }) as AssembleCompressionPromptParams;
	const r1 = await assembleCompressionPrompt(baseDeps, invalidParams, buildAssembleCompressionPromptPayload());
	assert("error" in r1);
	assertSpyCalls(fileManager.uploadAndRegisterFile, 0);

	// Invalid payload
	const r2 = await assembleCompressionPrompt(baseDeps, params, buildAssembleCompressionPromptPayload({ content: "" }));
	assert("error" in r2);
	assertSpyCalls(fileManager.uploadAndRegisterFile, 0);

	// Unparseable json
	const r3 = await assembleCompressionPrompt(baseDeps, params, buildAssembleCompressionPromptPayload({ mode: "json", content: "not json" }));
	assert("error" in r3);
	assertSpyCalls(fileManager.uploadAndRegisterFile, 0);
});
