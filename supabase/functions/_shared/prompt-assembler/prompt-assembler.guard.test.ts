import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isAssembleContinuationPromptErrorReturn } from "./prompt-assembler.guard.ts";
import {
	buildAssembledPrompt,
	buildAssembleContinuationPromptErrorReturn,
	invalidateAssembleContinuationPromptErrorReturn,
} from "./prompt-assembler.mock.ts";

// --- isAssembleContinuationPromptErrorReturn ---

/** Contract: the builder's valid default is accepted. */
Deno.test("isAssembleContinuationPromptErrorReturn accepts a built error return", () => {
	assert(isAssembleContinuationPromptErrorReturn(buildAssembleContinuationPromptErrorReturn()));
});

/** Contract: the success arm (buildAssembledPrompt) is rejected, the discrimination the guard exists to make. */
Deno.test("isAssembleContinuationPromptErrorReturn rejects the success arm (buildAssembledPrompt)", () => {
	assert(!isAssembleContinuationPromptErrorReturn(buildAssembledPrompt()));
});

/** Contract: `error` omitted is rejected. */
Deno.test("isAssembleContinuationPromptErrorReturn rejects missing error", () => {
	const { error: _omit, ...missingError } = buildAssembleContinuationPromptErrorReturn();
	assert(!isAssembleContinuationPromptErrorReturn(missingError));
});

/** Contract: `error` wrong-typed (not an Error) is rejected. */
Deno.test("isAssembleContinuationPromptErrorReturn rejects non-Error error", () => {
	assert(!isAssembleContinuationPromptErrorReturn(invalidateAssembleContinuationPromptErrorReturn({ error: "not-an-error" })));
});

/** Contract: `retriable` omitted is rejected. */
Deno.test("isAssembleContinuationPromptErrorReturn rejects missing retriable", () => {
	const { retriable: _omit, ...missingRetriable } = buildAssembleContinuationPromptErrorReturn();
	assert(!isAssembleContinuationPromptErrorReturn(missingRetriable));
});

/** Contract: `retriable` wrong-typed (not a boolean) is rejected. */
Deno.test("isAssembleContinuationPromptErrorReturn rejects non-boolean retriable", () => {
	assert(!isAssembleContinuationPromptErrorReturn(invalidateAssembleContinuationPromptErrorReturn({ retriable: "no" })));
});

/** Contract: null, undefined, primitives, and arrays are rejected. */
Deno.test("isAssembleContinuationPromptErrorReturn rejects non-record roots", () => {
	assert(!isAssembleContinuationPromptErrorReturn(null));
	assert(!isAssembleContinuationPromptErrorReturn(undefined));
	assert(!isAssembleContinuationPromptErrorReturn("x"));
	assert(!isAssembleContinuationPromptErrorReturn(7));
	assert(!isAssembleContinuationPromptErrorReturn([]));
});
