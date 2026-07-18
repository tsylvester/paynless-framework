import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
	isAssembleCompressionPromptDeps,
	isAssembleCompressionPromptErrorReturn,
	isAssembleCompressionPromptParams,
	isAssembleCompressionPromptPayload,
	isAssembleCompressionPromptSuccessReturn,
} from "./assembleCompressionPrompt.guards.ts";

Deno.test("isAssembleCompressionPromptDeps accepts a full valid deps object", () => {
	const deps = {
		dbClient: {},
		renderPromptFn: () => "rendered",
		logger: {},
	};
	assertEquals(isAssembleCompressionPromptDeps(deps), true);
});

Deno.test("isAssembleCompressionPromptDeps rejects missing dbClient", () => {
	const deps = {
		renderPromptFn: () => "rendered",
		logger: {},
	};
	assertEquals(isAssembleCompressionPromptDeps(deps), false);
});

Deno.test("isAssembleCompressionPromptDeps rejects non-function renderPromptFn", () => {
	const deps = {
		dbClient: {},
		renderPromptFn: "not a function",
		logger: {},
	};
	assertEquals(isAssembleCompressionPromptDeps(deps), false);
});

Deno.test("isAssembleCompressionPromptDeps rejects missing renderPromptFn", () => {
	const deps = {
		dbClient: {},
		logger: {},
	};
	assertEquals(isAssembleCompressionPromptDeps(deps), false);
});

Deno.test("isAssembleCompressionPromptDeps rejects missing logger", () => {
	const deps = {
		dbClient: {},
		renderPromptFn: () => "rendered",
	};
	assertEquals(isAssembleCompressionPromptDeps(deps), false);
});

Deno.test("isAssembleCompressionPromptDeps rejects non-record roots", () => {
	assertEquals(isAssembleCompressionPromptDeps(null), false);
	assertEquals(isAssembleCompressionPromptDeps("x"), false);
});

Deno.test("isAssembleCompressionPromptParams accepts a valid consumingStep", () => {
	const params = {
		consumingStep: {
			outputs_required: { documents: [{ document_key: "business_case" }] },
			step_description: "compress the source for the next agent",
		},
	};
	assertEquals(isAssembleCompressionPromptParams(params), true);
});

Deno.test("isAssembleCompressionPromptParams rejects consumingStep missing outputs_required", () => {
	const params = {
		consumingStep: {
			step_description: "compress the source for the next agent",
		},
	};
	assertEquals(isAssembleCompressionPromptParams(params), false);
});

Deno.test("isAssembleCompressionPromptParams rejects consumingStep missing step_description", () => {
	const params = {
		consumingStep: {
			outputs_required: { documents: [{ document_key: "business_case" }] },
		},
	};
	assertEquals(isAssembleCompressionPromptParams(params), false);
});

Deno.test("isAssembleCompressionPromptParams rejects consumingStep with empty outputs_required", () => {
	const params = {
		consumingStep: {
			outputs_required: {},
			step_description: "compress the source for the next agent",
		},
	};
	assertEquals(isAssembleCompressionPromptParams(params), false);
});

Deno.test("isAssembleCompressionPromptParams rejects consumingStep with non-object outputs_required", () => {
	const params = {
		consumingStep: {
			outputs_required: "not an object",
			step_description: "compress the source for the next agent",
		},
	};
	assertEquals(isAssembleCompressionPromptParams(params), false);
});

Deno.test("isAssembleCompressionPromptParams rejects consumingStep with empty step_description", () => {
	const params = {
		consumingStep: {
			outputs_required: { documents: [{ document_key: "business_case" }] },
			step_description: "",
		},
	};
	assertEquals(isAssembleCompressionPromptParams(params), false);
});

Deno.test("isAssembleCompressionPromptParams rejects consumingStep with non-string step_description", () => {
	const params = {
		consumingStep: {
			outputs_required: { documents: [{ document_key: "business_case" }] },
			step_description: null,
		},
	};
	assertEquals(isAssembleCompressionPromptParams(params), false);
});

Deno.test("isAssembleCompressionPromptParams rejects non-record roots", () => {
	assertEquals(isAssembleCompressionPromptParams(null), false);
	assertEquals(isAssembleCompressionPromptParams("x"), false);
});

Deno.test("isAssembleCompressionPromptPayload accepts a valid text-mode payload", () => {
	const payload = {
		mode: "text",
		content: "source content",
	};
	assertEquals(isAssembleCompressionPromptPayload(payload), true);
});

Deno.test("isAssembleCompressionPromptPayload accepts a valid json-mode payload", () => {
	const payload = {
		mode: "json",
		content: '{"key":"value"}',
	};
	assertEquals(isAssembleCompressionPromptPayload(payload), true);
});

Deno.test("isAssembleCompressionPromptPayload accepts a valid payload with chunk fields", () => {
	const payload = {
		mode: "text",
		content: "chunk content",
		chunk_index: 1,
		chunk_total: 2,
	};
	assertEquals(isAssembleCompressionPromptPayload(payload), true);
});

Deno.test("isAssembleCompressionPromptPayload rejects an invalid mode", () => {
	const payload = {
		mode: "invalid",
		content: "source content",
	};
	assertEquals(isAssembleCompressionPromptPayload(payload), false);
});

Deno.test("isAssembleCompressionPromptPayload rejects missing content", () => {
	const payload = {
		mode: "text",
	};
	assertEquals(isAssembleCompressionPromptPayload(payload), false);
});

Deno.test("isAssembleCompressionPromptPayload rejects empty content", () => {
	const payload = {
		mode: "text",
		content: "",
	};
	assertEquals(isAssembleCompressionPromptPayload(payload), false);
});

Deno.test("isAssembleCompressionPromptPayload rejects payload with only chunk_index", () => {
	const payload = {
		mode: "text",
		content: "chunk content",
		chunk_index: 1,
	};
	assertEquals(isAssembleCompressionPromptPayload(payload), false);
});

Deno.test("isAssembleCompressionPromptPayload rejects payload with only chunk_total", () => {
	const payload = {
		mode: "text",
		content: "chunk content",
		chunk_total: 2,
	};
	assertEquals(isAssembleCompressionPromptPayload(payload), false);
});

Deno.test("isAssembleCompressionPromptPayload rejects non-record roots", () => {
	assertEquals(isAssembleCompressionPromptPayload(null), false);
	assertEquals(isAssembleCompressionPromptPayload("x"), false);
});

Deno.test("isAssembleCompressionPromptSuccessReturn accepts a valid success return", () => {
	const success = {
		prompt: "compressed prompt",
	};
	assertEquals(isAssembleCompressionPromptSuccessReturn(success), true);
});

Deno.test("isAssembleCompressionPromptSuccessReturn rejects a value carrying both prompt and error", () => {
	const mixed = {
		prompt: "compressed prompt",
		error: new Error("failed"),
	};
	assertEquals(isAssembleCompressionPromptSuccessReturn(mixed), false);
});

Deno.test("isAssembleCompressionPromptSuccessReturn rejects non-record roots", () => {
	assertEquals(isAssembleCompressionPromptSuccessReturn(null), false);
	assertEquals(isAssembleCompressionPromptSuccessReturn("x"), false);
});

Deno.test("isAssembleCompressionPromptErrorReturn accepts a valid error return", () => {
	const error = {
		error: new Error("failed"),
		retriable: false,
	};
	assertEquals(isAssembleCompressionPromptErrorReturn(error), true);
});

Deno.test("isAssembleCompressionPromptErrorReturn rejects a value carrying both prompt and error", () => {
	const mixed = {
		prompt: "compressed prompt",
		error: new Error("failed"),
		retriable: false,
	};
	assertEquals(isAssembleCompressionPromptErrorReturn(mixed), false);
});

Deno.test("isAssembleCompressionPromptErrorReturn rejects missing retriable", () => {
	const error = {
		error: new Error("failed"),
	};
	assertEquals(isAssembleCompressionPromptErrorReturn(error), false);
});

Deno.test("isAssembleCompressionPromptErrorReturn rejects non-boolean retriable", () => {
	const error = {
		error: new Error("failed"),
		retriable: "no",
	};
	assertEquals(isAssembleCompressionPromptErrorReturn(error), false);
});

Deno.test("isAssembleCompressionPromptErrorReturn rejects non-record roots", () => {
	assertEquals(isAssembleCompressionPromptErrorReturn(null), false);
	assertEquals(isAssembleCompressionPromptErrorReturn("x"), false);
});
