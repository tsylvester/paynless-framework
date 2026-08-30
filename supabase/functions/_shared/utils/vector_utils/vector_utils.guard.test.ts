import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isCompressionCandidate,
  isGetSortedCompressionCandidatesDeps,
  isGetSortedCompressionCandidatesParams,
  isGetSortedCompressionCandidatesPayload,
  isGetSortedCompressionCandidatesSuccessReturn,
  isGetSortedCompressionCandidatesErrorReturn,
} from "../vector_utils/vector_utils.guard.ts";
import {
  buildCompressionCandidate,
  invalidateCompressionCandidate,
  buildGetSortedCompressionCandidatesDeps,
  invalidateGetSortedCompressionCandidatesDeps,
  buildGetSortedCompressionCandidatesParams,
  invalidateGetSortedCompressionCandidatesParams,
  buildGetSortedCompressionCandidatesPayload,
  invalidateGetSortedCompressionCandidatesPayload,
  buildGetSortedCompressionCandidatesSuccessReturn,
  invalidateGetSortedCompressionCandidatesSuccessReturn,
  buildGetSortedCompressionCandidatesErrorReturn,
  invalidateGetSortedCompressionCandidatesErrorReturn,
} from "../vector_utils/vector_utils.mock.ts";

// --- isCompressionCandidate ---

/** the builder's valid default is accepted. */
Deno.test("isCompressionCandidate accepts the valid default", () => {
  assertEquals(isCompressionCandidate(buildCompressionCandidate()), true);
});

/** valid overrides are accepted. */
Deno.test("isCompressionCandidate accepts valid overrides", () => {
  const candidate = buildCompressionCandidate({ id: "candidate-2", tokenCount: 50 });
  assertEquals(isCompressionCandidate(candidate), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isCompressionCandidate rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isCompressionCandidate(x), false);
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isCompressionCandidate rejects each corrupted property", () => {
  assertEquals(isCompressionCandidate(invalidateCompressionCandidate({ id: null })), false);
  assertEquals(isCompressionCandidate(invalidateCompressionCandidate({ content: null })), false);
  assertEquals(isCompressionCandidate(invalidateCompressionCandidate({ sourceType: null })), false);
  assertEquals(isCompressionCandidate(invalidateCompressionCandidate({ originalIndex: null })), false);
  assertEquals(isCompressionCandidate(invalidateCompressionCandidate({ valueScore: null })), false);
  assertEquals(isCompressionCandidate(invalidateCompressionCandidate({ effectiveScore: null })), false);
  assertEquals(isCompressionCandidate(invalidateCompressionCandidate({ tokenCount: null })), false);
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isCompressionCandidate rejects each omitted required property", () => {
  const { id: _i, ...missingId } = buildCompressionCandidate();
  assertEquals(isCompressionCandidate(missingId), false);
  const { content: _c, ...missingContent } = buildCompressionCandidate();
  assertEquals(isCompressionCandidate(missingContent), false);
  const { sourceType: _s, ...missingSourceType } = buildCompressionCandidate();
  assertEquals(isCompressionCandidate(missingSourceType), false);
  const { originalIndex: _o, ...missingOriginalIndex } = buildCompressionCandidate();
  assertEquals(isCompressionCandidate(missingOriginalIndex), false);
  const { valueScore: _v, ...missingValueScore } = buildCompressionCandidate();
  assertEquals(isCompressionCandidate(missingValueScore), false);
  const { effectiveScore: _e, ...missingEffectiveScore } = buildCompressionCandidate();
  assertEquals(isCompressionCandidate(missingEffectiveScore), false);
  const { tokenCount: _t, ...missingTokenCount } = buildCompressionCandidate();
  assertEquals(isCompressionCandidate(missingTokenCount), false);
});

// --- isGetSortedCompressionCandidatesDeps ---

/** the builder's valid default is accepted. */
Deno.test("isGetSortedCompressionCandidatesDeps accepts the valid default", () => {
  assertEquals(isGetSortedCompressionCandidatesDeps(buildGetSortedCompressionCandidatesDeps()), true);
});

/** valid overrides are accepted. */
Deno.test("isGetSortedCompressionCandidatesDeps accepts valid overrides", () => {
  const deps = buildGetSortedCompressionCandidatesDeps({
    countTokens: (_payload, _modelConfig) => 0,
  });
  assertEquals(isGetSortedCompressionCandidatesDeps(deps), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isGetSortedCompressionCandidatesDeps rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isGetSortedCompressionCandidatesDeps(x), false);
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isGetSortedCompressionCandidatesDeps rejects each corrupted property", () => {
  assertEquals(
    isGetSortedCompressionCandidatesDeps(
      invalidateGetSortedCompressionCandidatesDeps({ logger: null }),
    ),
    false,
  );
  assertEquals(
    isGetSortedCompressionCandidatesDeps(
      invalidateGetSortedCompressionCandidatesDeps({ countTokens: null }),
    ),
    false,
  );
  assertEquals(
    isGetSortedCompressionCandidatesDeps(
      invalidateGetSortedCompressionCandidatesDeps({ resolveCompressionSource: null }),
    ),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isGetSortedCompressionCandidatesDeps rejects each omitted required property", () => {
  const { logger: _l, ...missingLogger } = buildGetSortedCompressionCandidatesDeps();
  assertEquals(isGetSortedCompressionCandidatesDeps(missingLogger), false);
  const { countTokens: _c, ...missingCountTokens } = buildGetSortedCompressionCandidatesDeps();
  assertEquals(isGetSortedCompressionCandidatesDeps(missingCountTokens), false);
  const { resolveCompressionSource: _r, ...missingResolve } = buildGetSortedCompressionCandidatesDeps();
  assertEquals(isGetSortedCompressionCandidatesDeps(missingResolve), false);
});

// --- isGetSortedCompressionCandidatesParams ---

/** the builder's valid default is accepted. */
Deno.test("isGetSortedCompressionCandidatesParams accepts the valid default", () => {
  assertEquals(
    isGetSortedCompressionCandidatesParams(buildGetSortedCompressionCandidatesParams()),
    true,
  );
});

/** valid overrides are accepted. */
Deno.test("isGetSortedCompressionCandidatesParams accepts valid overrides", () => {
  const params = buildGetSortedCompressionCandidatesParams({
    inputsRelevance: [],
  });
  assertEquals(isGetSortedCompressionCandidatesParams(params), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isGetSortedCompressionCandidatesParams rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isGetSortedCompressionCandidatesParams(x), false);
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isGetSortedCompressionCandidatesParams rejects each corrupted property", () => {
  assertEquals(
    isGetSortedCompressionCandidatesParams(
      invalidateGetSortedCompressionCandidatesParams({ inputsRelevance: null }),
    ),
    false,
  );
  assertEquals(
    isGetSortedCompressionCandidatesParams(
      invalidateGetSortedCompressionCandidatesParams({ modelConfig: null }),
    ),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isGetSortedCompressionCandidatesParams rejects each omitted required property", () => {
  const { modelConfig: _m, ...missingModelConfig } = buildGetSortedCompressionCandidatesParams();
  assertEquals(isGetSortedCompressionCandidatesParams(missingModelConfig), false);
});

/** the optional inputsRelevance is accepted when absent. */
Deno.test("isGetSortedCompressionCandidatesParams accepts inputsRelevance when absent", () => {
  const { inputsRelevance: _i, ...withoutInputsRelevance } = buildGetSortedCompressionCandidatesParams();
  assertEquals(isGetSortedCompressionCandidatesParams(withoutInputsRelevance), true);
});

/** the optional inputsRelevance is rejected when present and corrupted. */
Deno.test("isGetSortedCompressionCandidatesParams rejects inputsRelevance when present and corrupted", () => {
  assertEquals(
    isGetSortedCompressionCandidatesParams(
      invalidateGetSortedCompressionCandidatesParams({ inputsRelevance: "not-an-array" }),
    ),
    false,
  );
});

// --- isGetSortedCompressionCandidatesPayload ---

/** the builder's valid default is accepted. */
Deno.test("isGetSortedCompressionCandidatesPayload accepts the valid default", () => {
  assertEquals(
    isGetSortedCompressionCandidatesPayload(buildGetSortedCompressionCandidatesPayload()),
    true,
  );
});

/** valid overrides are accepted. */
Deno.test("isGetSortedCompressionCandidatesPayload accepts valid overrides", () => {
  const payload = buildGetSortedCompressionCandidatesPayload({
    documents: [],
    history: [],
  });
  assertEquals(isGetSortedCompressionCandidatesPayload(payload), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isGetSortedCompressionCandidatesPayload rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isGetSortedCompressionCandidatesPayload(x), false);
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isGetSortedCompressionCandidatesPayload rejects each corrupted property", () => {
  assertEquals(
    isGetSortedCompressionCandidatesPayload(
      invalidateGetSortedCompressionCandidatesPayload({ documents: null }),
    ),
    false,
  );
  assertEquals(
    isGetSortedCompressionCandidatesPayload(
      invalidateGetSortedCompressionCandidatesPayload({ history: null }),
    ),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isGetSortedCompressionCandidatesPayload rejects each omitted required property", () => {
  const { documents: _d, ...missingDocuments } = buildGetSortedCompressionCandidatesPayload();
  assertEquals(isGetSortedCompressionCandidatesPayload(missingDocuments), false);
  const { history: _h, ...missingHistory } = buildGetSortedCompressionCandidatesPayload();
  assertEquals(isGetSortedCompressionCandidatesPayload(missingHistory), false);
});

// --- isGetSortedCompressionCandidatesSuccessReturn ---

/** the builder's valid default is accepted. */
Deno.test("isGetSortedCompressionCandidatesSuccessReturn accepts the valid default", () => {
  assertEquals(
    isGetSortedCompressionCandidatesSuccessReturn(
      buildGetSortedCompressionCandidatesSuccessReturn(),
    ),
    true,
  );
});

/** valid overrides are accepted. */
Deno.test("isGetSortedCompressionCandidatesSuccessReturn accepts valid overrides", () => {
  const success = buildGetSortedCompressionCandidatesSuccessReturn({
    candidates: [buildCompressionCandidate()],
  });
  assertEquals(isGetSortedCompressionCandidatesSuccessReturn(success), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isGetSortedCompressionCandidatesSuccessReturn rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isGetSortedCompressionCandidatesSuccessReturn(x), false);
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isGetSortedCompressionCandidatesSuccessReturn rejects each corrupted property", () => {
  assertEquals(
    isGetSortedCompressionCandidatesSuccessReturn(
      invalidateGetSortedCompressionCandidatesSuccessReturn({ candidates: null }),
    ),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isGetSortedCompressionCandidatesSuccessReturn rejects each omitted required property", () => {
  const { candidates: _c, ...missingCandidates } = buildGetSortedCompressionCandidatesSuccessReturn();
  assertEquals(isGetSortedCompressionCandidatesSuccessReturn(missingCandidates), false);
});

/** the error return is rejected. */
Deno.test("isGetSortedCompressionCandidatesSuccessReturn rejects the error return", () => {
  assertEquals(
    isGetSortedCompressionCandidatesSuccessReturn(
      buildGetSortedCompressionCandidatesErrorReturn(),
    ),
    false,
  );
});

// --- isGetSortedCompressionCandidatesErrorReturn ---

/** the builder's valid default is accepted. */
Deno.test("isGetSortedCompressionCandidatesErrorReturn accepts the valid default", () => {
  assertEquals(
    isGetSortedCompressionCandidatesErrorReturn(
      buildGetSortedCompressionCandidatesErrorReturn(),
    ),
    true,
  );
});

/** valid overrides are accepted. */
Deno.test("isGetSortedCompressionCandidatesErrorReturn accepts valid overrides", () => {
  const errorReturn = buildGetSortedCompressionCandidatesErrorReturn({
    retriable: true,
  });
  assertEquals(isGetSortedCompressionCandidatesErrorReturn(errorReturn), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isGetSortedCompressionCandidatesErrorReturn rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isGetSortedCompressionCandidatesErrorReturn(x), false);
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isGetSortedCompressionCandidatesErrorReturn rejects each corrupted property", () => {
  assertEquals(
    isGetSortedCompressionCandidatesErrorReturn(
      invalidateGetSortedCompressionCandidatesErrorReturn({ error: null }),
    ),
    false,
  );
  assertEquals(
    isGetSortedCompressionCandidatesErrorReturn(
      invalidateGetSortedCompressionCandidatesErrorReturn({ retriable: null }),
    ),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isGetSortedCompressionCandidatesErrorReturn rejects each omitted required property", () => {
  const { error: _e, ...missingError } = buildGetSortedCompressionCandidatesErrorReturn();
  assertEquals(isGetSortedCompressionCandidatesErrorReturn(missingError), false);
  const { retriable: _r, ...missingRetriable } = buildGetSortedCompressionCandidatesErrorReturn();
  assertEquals(isGetSortedCompressionCandidatesErrorReturn(missingRetriable), false);
});

/** the success return is rejected. */
Deno.test("isGetSortedCompressionCandidatesErrorReturn rejects the success return", () => {
  assertEquals(
    isGetSortedCompressionCandidatesErrorReturn(
      buildGetSortedCompressionCandidatesSuccessReturn(),
    ),
    false,
  );
});
