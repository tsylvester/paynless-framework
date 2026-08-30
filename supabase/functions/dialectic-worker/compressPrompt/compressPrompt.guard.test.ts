// supabase/functions/dialectic-worker/compressPrompt/compressPrompt.guard.test.ts

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isBoundCompressPromptFn,
  isCompressPromptDeps,
  isCompressPromptErrorReturn,
  isCompressPromptFitsReturn,
  isCompressPromptParams,
  isCompressPromptPayload,
  isCompressPromptPendingReturn,
} from "./compressPrompt.guard.ts";
import {
  buildCompressPromptDeps,
  buildCompressPromptErrorReturn,
  buildCompressPromptFitsReturn,
  buildCompressPromptParams,
  buildCompressPromptPayload,
  buildCompressPromptPendingReturn,
  invalidateCompressPromptDeps,
  invalidateCompressPromptErrorReturn,
  invalidateCompressPromptFitsReturn,
  invalidateCompressPromptParams,
  invalidateCompressPromptPayload,
  invalidateCompressPromptPendingReturn,
  mockBoundCompressPrompt,
} from "./compressPrompt.mock.ts";

/** the builder's valid default is accepted. */
Deno.test("isCompressPromptDeps accepts the valid default", () => {
  assert(isCompressPromptDeps(buildCompressPromptDeps()));
});

/** a deps object carrying no ragService, embeddingClient or tokenWalletService is accepted. */
Deno.test("isCompressPromptDeps accepts deps with no retired members", () => {
  const deps = buildCompressPromptDeps();
  assert(!("ragService" in deps));
  assert(!("embeddingClient" in deps));
  assert(!("tokenWalletService" in deps));
  assert(isCompressPromptDeps(deps));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isCompressPromptDeps rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assert(!isCompressPromptDeps(x));
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isCompressPromptDeps rejects each corrupted property", () => {
  assert(!isCompressPromptDeps(invalidateCompressPromptDeps({ logger: null })));
  assert(!isCompressPromptDeps(invalidateCompressPromptDeps({ getSortedCompressionCandidates: "not-a-function" })));
  assert(!isCompressPromptDeps(invalidateCompressPromptDeps({ enqueueCompressJobs: "not-a-function" })));
  assert(!isCompressPromptDeps(invalidateCompressPromptDeps({ resolveCompressionSource: "not-a-function" })));
  assert(!isCompressPromptDeps(invalidateCompressPromptDeps({ constructStoragePath: "not-a-function" })));
  assert(!isCompressPromptDeps(invalidateCompressPromptDeps({ downloadFromStorage: "not-a-function" })));
  assert(!isCompressPromptDeps(invalidateCompressPromptDeps({ countTokens: "not-a-function" })));
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isCompressPromptDeps rejects each omitted required property", () => {
  const { logger: _logger, ...missingLogger } = buildCompressPromptDeps();
  assert(!isCompressPromptDeps(missingLogger));
  const { getSortedCompressionCandidates: _gsc, ...missingGsc } = buildCompressPromptDeps();
  assert(!isCompressPromptDeps(missingGsc));
  const { enqueueCompressJobs: _eq, ...missingEq } = buildCompressPromptDeps();
  assert(!isCompressPromptDeps(missingEq));
  const { resolveCompressionSource: _rcs, ...missingRcs } = buildCompressPromptDeps();
  assert(!isCompressPromptDeps(missingRcs));
  const { constructStoragePath: _csp, ...missingCsp } = buildCompressPromptDeps();
  assert(!isCompressPromptDeps(missingCsp));
  const { downloadFromStorage: _dfs, ...missingDfs } = buildCompressPromptDeps();
  assert(!isCompressPromptDeps(missingDfs));
  const { countTokens: _ct, ...missingCt } = buildCompressPromptDeps();
  assert(!isCompressPromptDeps(missingCt));
});

/** the builder's valid default is accepted. */
Deno.test("isCompressPromptParams accepts the valid default", () => {
  assert(isCompressPromptParams(buildCompressPromptParams()));
});

/** params carrying none of the removed members are accepted. */
Deno.test("isCompressPromptParams accepts params with no removed members", () => {
  const params = buildCompressPromptParams();
  const removed = ["jobId", "parentJob", "sessionId", "projectId", "stageSlug", "targetKey", "iterationNumber", "walletId", "extendedModelConfig", "inputsRelevance", "inputRate", "outputRate", "projectOwnerUserId"];
  for (const key of removed) {
    assert(!(key in params));
  }
  assert(isCompressPromptParams(params));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isCompressPromptParams rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assert(!isCompressPromptParams(x));
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isCompressPromptParams rejects each corrupted property", () => {
  assert(!isCompressPromptParams(invalidateCompressPromptParams({ dbClient: null })));
  assert(!isCompressPromptParams(invalidateCompressPromptParams({ isContinuationFlowInitial: "not-a-boolean" })));
  assert(!isCompressPromptParams(invalidateCompressPromptParams({ finalTargetThreshold: "not-a-number" })));
  assert(!isCompressPromptParams(invalidateCompressPromptParams({ balanceAfterCompression: "not-a-number" })));
  assert(!isCompressPromptParams(invalidateCompressPromptParams({ walletBalance: "not-a-number" })));
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isCompressPromptParams rejects each omitted required property", () => {
  const { dbClient: _dc, ...missingDc } = buildCompressPromptParams();
  assert(!isCompressPromptParams(missingDc));
  const { isContinuationFlowInitial: _ic, ...missingIc } = buildCompressPromptParams();
  assert(!isCompressPromptParams(missingIc));
  const { finalTargetThreshold: _ft, ...missingFt } = buildCompressPromptParams();
  assert(!isCompressPromptParams(missingFt));
  const { balanceAfterCompression: _ba, ...missingBa } = buildCompressPromptParams();
  assert(!isCompressPromptParams(missingBa));
  const { walletBalance: _wb, ...missingWb } = buildCompressPromptParams();
  assert(!isCompressPromptParams(missingWb));
});

/** the builder's valid default is accepted. */
Deno.test("isCompressPromptPayload accepts the valid default", () => {
  assert(isCompressPromptPayload(buildCompressPromptPayload()));
});

/** a payload carrying neither compressionStrategy, chatApiRequest nor tokenizerDeps is accepted. */
Deno.test("isCompressPromptPayload accepts payload with no retired members", () => {
  const payload = buildCompressPromptPayload();
  assert(!("compressionStrategy" in payload));
  assert(!("chatApiRequest" in payload));
  assert(!("tokenizerDeps" in payload));
  assert(isCompressPromptPayload(payload));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isCompressPromptPayload rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assert(!isCompressPromptPayload(x));
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isCompressPromptPayload rejects each corrupted property", () => {
  assert(!isCompressPromptPayload(invalidateCompressPromptPayload({ parentJob: null })));
  assert(!isCompressPromptPayload(invalidateCompressPromptPayload({ extendedModelConfig: null })));
  assert(!isCompressPromptPayload(invalidateCompressPromptPayload({ inputsRelevance: "not-an-array" })));
  assert(!isCompressPromptPayload(invalidateCompressPromptPayload({ resourceDocuments: "not-an-array" })));
  assert(!isCompressPromptPayload(invalidateCompressPromptPayload({ conversationHistory: "not-an-array" })));
  assert(!isCompressPromptPayload(invalidateCompressPromptPayload({ currentUserPrompt: 42 })));
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isCompressPromptPayload rejects each omitted required property", () => {
  const { parentJob: _pj, ...missingPj } = buildCompressPromptPayload();
  assert(!isCompressPromptPayload(missingPj));
  const { extendedModelConfig: _em, ...missingEm } = buildCompressPromptPayload();
  assert(!isCompressPromptPayload(missingEm));
  const { inputsRelevance: _ir, ...missingIr } = buildCompressPromptPayload();
  assert(!isCompressPromptPayload(missingIr));
  const { resourceDocuments: _rd, ...missingRd } = buildCompressPromptPayload();
  assert(!isCompressPromptPayload(missingRd));
  const { conversationHistory: _ch, ...missingCh } = buildCompressPromptPayload();
  assert(!isCompressPromptPayload(missingCh));
  const { currentUserPrompt: _cu, ...missingCu } = buildCompressPromptPayload();
  assert(!isCompressPromptPayload(missingCu));
});

/** the builder's valid default is accepted. */
Deno.test("isCompressPromptFitsReturn accepts the valid default", () => {
  assert(isCompressPromptFitsReturn(buildCompressPromptFitsReturn()));
});

/** valid overrides are accepted. */
Deno.test("isCompressPromptFitsReturn accepts valid overrides", () => {
  assert(isCompressPromptFitsReturn(buildCompressPromptFitsReturn({ resolvedInputTokenCount: 100 })));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isCompressPromptFitsReturn rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assert(!isCompressPromptFitsReturn(x));
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isCompressPromptFitsReturn rejects each corrupted property", () => {
  assert(!isCompressPromptFitsReturn(invalidateCompressPromptFitsReturn({ fits: false })));
  assert(!isCompressPromptFitsReturn(invalidateCompressPromptFitsReturn({ resourceDocuments: "not-an-array" })));
  assert(!isCompressPromptFitsReturn(invalidateCompressPromptFitsReturn({ conversationHistory: "not-an-array" })));
  assert(!isCompressPromptFitsReturn(invalidateCompressPromptFitsReturn({ resolvedInputTokenCount: "not-a-number" })));
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isCompressPromptFitsReturn rejects each omitted required property", () => {
  const { fits: _f, ...missingFits } = buildCompressPromptFitsReturn();
  assert(!isCompressPromptFitsReturn(missingFits));
  const { resourceDocuments: _rd, ...missingRd } = buildCompressPromptFitsReturn();
  assert(!isCompressPromptFitsReturn(missingRd));
  const { conversationHistory: _ch, ...missingCh } = buildCompressPromptFitsReturn();
  assert(!isCompressPromptFitsReturn(missingCh));
  const { resolvedInputTokenCount: _ri, ...missingRi } = buildCompressPromptFitsReturn();
  assert(!isCompressPromptFitsReturn(missingRi));
});

/** the pending flavor is rejected. */
Deno.test("isCompressPromptFitsReturn rejects the pending flavor", () => {
  assert(!isCompressPromptFitsReturn(buildCompressPromptPendingReturn()));
});

/** an error return is rejected. */
Deno.test("isCompressPromptFitsReturn rejects an error return", () => {
  assert(!isCompressPromptFitsReturn(buildCompressPromptErrorReturn()));
});

/** the builder's valid default is accepted. */
Deno.test("isCompressPromptPendingReturn accepts the valid default", () => {
  assert(isCompressPromptPendingReturn(buildCompressPromptPendingReturn()));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isCompressPromptPendingReturn rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assert(!isCompressPromptPendingReturn(x));
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isCompressPromptPendingReturn rejects each corrupted property", () => {
  assert(!isCompressPromptPendingReturn(invalidateCompressPromptPendingReturn({ fits: true })));
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isCompressPromptPendingReturn rejects each omitted required property", () => {
  const { fits: _f, ...missingFits } = buildCompressPromptPendingReturn();
  assert(!isCompressPromptPendingReturn(missingFits));
});

/** the fits flavor is rejected. */
Deno.test("isCompressPromptPendingReturn rejects the fits flavor", () => {
  assert(!isCompressPromptPendingReturn(buildCompressPromptFitsReturn()));
});

/** an error return is rejected. */
Deno.test("isCompressPromptPendingReturn rejects an error return", () => {
  assert(!isCompressPromptPendingReturn(buildCompressPromptErrorReturn()));
});

/** the builder's valid default is accepted. */
Deno.test("isCompressPromptErrorReturn accepts the valid default", () => {
  assert(isCompressPromptErrorReturn(buildCompressPromptErrorReturn()));
});

/** valid overrides are accepted. */
Deno.test("isCompressPromptErrorReturn accepts valid overrides", () => {
  assert(isCompressPromptErrorReturn(buildCompressPromptErrorReturn({ retriable: true })));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isCompressPromptErrorReturn rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assert(!isCompressPromptErrorReturn(x));
  }
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isCompressPromptErrorReturn rejects each corrupted property", () => {
  assert(!isCompressPromptErrorReturn(invalidateCompressPromptErrorReturn({ error: "not-an-error" })));
  assert(!isCompressPromptErrorReturn(invalidateCompressPromptErrorReturn({ retriable: "not-a-boolean" })));
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isCompressPromptErrorReturn rejects each omitted required property", () => {
  const { error: _e, ...missingError } = buildCompressPromptErrorReturn();
  assert(!isCompressPromptErrorReturn(missingError));
  const { retriable: _r, ...missingRetriable } = buildCompressPromptErrorReturn();
  assert(!isCompressPromptErrorReturn(missingRetriable));
});

/** an error return carrying fits, resourceDocuments, conversationHistory or resolvedInputTokenCount is rejected. */
Deno.test("isCompressPromptErrorReturn rejects success-flavor members", () => {
  assert(!isCompressPromptErrorReturn({ ...buildCompressPromptErrorReturn(), fits: true }));
  assert(!isCompressPromptErrorReturn({ ...buildCompressPromptErrorReturn(), resourceDocuments: [] }));
  assert(!isCompressPromptErrorReturn({ ...buildCompressPromptErrorReturn(), conversationHistory: [] }));
  assert(!isCompressPromptErrorReturn({ ...buildCompressPromptErrorReturn(), resolvedInputTokenCount: 0 }));
});

/** the fits flavor is rejected. */
Deno.test("isCompressPromptErrorReturn rejects the fits flavor", () => {
  assert(!isCompressPromptErrorReturn(buildCompressPromptFitsReturn()));
});

/** the pending flavor is rejected. */
Deno.test("isCompressPromptErrorReturn rejects the pending flavor", () => {
  assert(!isCompressPromptErrorReturn(buildCompressPromptPendingReturn()));
});

/** mockBoundCompressPrompt is accepted. */
Deno.test("isBoundCompressPromptFn accepts mockBoundCompressPrompt", () => {
  assert(isBoundCompressPromptFn(mockBoundCompressPrompt));
});

/** null, undefined, non-function primitives, and arrays are rejected. */
Deno.test("isBoundCompressPromptFn rejects non-functions", () => {
  for (const x of [null, undefined, {}, "not-a-function", 42, []]) {
    assert(!isBoundCompressPromptFn(x));
  }
});
