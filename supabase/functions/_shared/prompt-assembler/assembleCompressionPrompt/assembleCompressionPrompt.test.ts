import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assembleCompressionPrompt } from "./assembleCompressionPrompt.ts";
import { buildDialecticStageRecipeStep } from "../../dialectic.mock.ts";
import {
	buildAssembleCompressionPromptDeps,
	buildAssembleCompressionPromptParams,
	buildAssembleCompressionPromptPayload,
} from "./assembleCompressionPrompt.mock.ts";

Deno.test("assembleCompressionPrompt renders json mode and strips text mode", async () => {
	const deps = buildAssembleCompressionPromptDeps();
	const params = buildAssembleCompressionPromptParams();
	assert(params !== null);
	const payload = buildAssembleCompressionPromptPayload({
		mode: "json",
		content: JSON.stringify({ key: "value" }),
	});
	assert(payload !== null);

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("prompt" in result) {
		assertStringIncludes(result.prompt, "The source is a completed JSON structure");
		assert(!result.prompt.includes("The source is a document"));
	} else {
		assert(false, "Expected a prompt");
	}
});

Deno.test("assembleCompressionPrompt renders text mode and strips json mode", async () => {
	const deps = buildAssembleCompressionPromptDeps();
	const params = buildAssembleCompressionPromptParams();
	assert(params !== null);
	const payload = buildAssembleCompressionPromptPayload({ mode: "text" });
	assert(payload !== null);

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("prompt" in result) {
		assertStringIncludes(result.prompt, "The source is a document");
		assert(!result.prompt.includes("The source is a completed JSON structure"));
	} else {
		assert(false, "Expected a prompt");
	}
});

Deno.test("assembleCompressionPrompt injects outputs_required and step_description", async () => {
	const deps = buildAssembleCompressionPromptDeps();
	const params = buildAssembleCompressionPromptParams();
	assert(params !== null);
	const payload = buildAssembleCompressionPromptPayload();
	assert(payload !== null);

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("prompt" in result) {
		assertStringIncludes(
			result.prompt,
			JSON.stringify(params.consumingStep.outputs_required),
		);
		assert(params.consumingStep.step_description !== null);
		assertStringIncludes(result.prompt, params.consumingStep.step_description);
	} else {
		assert(false, "Expected a prompt");
	}
});

Deno.test("assembleCompressionPrompt renders chunk context with both numbers", async () => {
	const deps = buildAssembleCompressionPromptDeps();
	const params = buildAssembleCompressionPromptParams();
	assert(params !== null);
	const payload = buildAssembleCompressionPromptPayload({
		chunk_index: 1,
		chunk_total: 2,
	});
	assert(payload !== null);

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("prompt" in result) {
		assertStringIncludes(result.prompt, "chunk 1 of 2");
		assert(!result.prompt.includes("{{chunk_index}}"));
		assert(!result.prompt.includes("{{chunk_total}}"));
	} else {
		assert(false, "Expected a prompt");
	}
});

Deno.test("assembleCompressionPrompt omits chunk context when no chunk fields are provided", async () => {
	const deps = buildAssembleCompressionPromptDeps();
	const params = buildAssembleCompressionPromptParams();
	assert(params !== null);
	const payload = buildAssembleCompressionPromptPayload();
	assert(payload !== null);

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("prompt" in result) {
		assert(!result.prompt.includes("{{chunk_index}}"));
		assert(!result.prompt.includes("{{chunk_total}}"));
		assert(!result.prompt.includes("chunk 1 of 2"));
	} else {
		assert(false, "Expected a prompt");
	}
});

Deno.test("assembleCompressionPrompt returns retriable=false for empty outputs_required", async () => {
	const deps = buildAssembleCompressionPromptDeps();
	const consumingStep = buildDialecticStageRecipeStep({ outputs_required: {} });
	assert(consumingStep !== null);
	const params = buildAssembleCompressionPromptParams({ consumingStep });
	assert(params !== null);
	const payload = buildAssembleCompressionPromptPayload();
	assert(payload !== null);

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("error" in result) {
		assertEquals(result.retriable, false);
	} else {
		assert(false, "Expected an error");
	}
});

Deno.test("assembleCompressionPrompt returns retriable=false for empty step_description", async () => {
	const deps = buildAssembleCompressionPromptDeps();
	const consumingStep = buildDialecticStageRecipeStep({ step_description: "" });
	assert(consumingStep !== null);
	const params = buildAssembleCompressionPromptParams({ consumingStep });
	assert(params !== null);
	const payload = buildAssembleCompressionPromptPayload();
	assert(payload !== null);

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
	assert(params !== null);
	const payload = buildAssembleCompressionPromptPayload({ content: "" });
	assert(payload !== null);

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
	assert(params !== null);
	const payload = buildAssembleCompressionPromptPayload({
		mode: "json",
		content: "not json",
	});
	assert(payload !== null);

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
	assert(params !== null);
	const payload = buildAssembleCompressionPromptPayload({ chunk_index: 1 });
	assert(payload !== null);

	const result = await assembleCompressionPrompt(deps, params, payload);

	if ("error" in result) {
		assertEquals(result.retriable, false);
	} else {
		assert(false, "Expected an error");
	}
});
