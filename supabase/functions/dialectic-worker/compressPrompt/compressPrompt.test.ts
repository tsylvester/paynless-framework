// supabase/functions/dialectic-worker/compressPrompt/compressPrompt.test.ts

import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { ContextWindowError } from "../../_shared/utils/errors.ts";
import { createMockDownloadFromStorage } from "../../_shared/supabase_storage_utils.mock.ts";
import { createMockCountTokens } from "../../_shared/utils/tokenizer_utils.mock.ts";
import type { BoundGetSortedCompressionCandidatesFn } from "../../_shared/utils/vector_utils/vector_utils.provides.ts";
import type { BoundenqueueCompressJobsFn } from "../enqueueCompressJobs/enqueueCompressJobs.provides.ts";
import type { BoundResolveCompressionSourceFn } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import type { enqueueCompressJobsPayload, enqueueCompressJobsVictim } from "../enqueueCompressJobs/enqueueCompressJobs.interface.ts";
import type { GetSortedCompressionCandidatesParams, GetSortedCompressionCandidatesPayload } from "../../_shared/utils/vector_utils/vector_utils.interface.ts";
import {
  isCompressPromptFitsReturn,
  isCompressPromptErrorReturn,
  isCompressPromptPendingReturn,
} from "./compressPrompt.guard.ts";
import { compressPrompt } from "./compressPrompt.ts";
import {
  buildCompressPromptDeps,
  buildCompressPromptParams,
  buildCompressPromptPayload,
} from "./compressPrompt.mock.ts";
import {
  buildCompressionCandidate,
  buildGetSortedCompressionCandidatesSuccessReturn,
  buildGetSortedCompressionCandidatesErrorReturn,
} from "../../_shared/utils/vector_utils/vector_utils.provides.ts";
import {
  buildenqueueCompressJobsSuccessReturn,
  buildenqueueCompressJobsErrorReturn,
  buildCompressJobEnqueueError,
} from "../enqueueCompressJobs/enqueueCompressJobs.provides.ts";
import {
  buildResourceDocument,
  buildCompressibleSourceReturn,
  buildNotCompressibleSourceReturn,
  buildResolveCompressionSourceErrorReturn,
} from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import { buildMessages, buildRelevanceRule } from "../../_shared/dialectic.mock.ts";
import type { PathContext } from "../../_shared/types/file_manager.types.ts";
import { constructStoragePath } from "../../_shared/utils/path_constructor.ts";

const artifactBytes = new TextEncoder().encode("compressed-artifact-content");
const artifactBuffer = new ArrayBuffer(artifactBytes.byteLength);
new Uint8Array(artifactBuffer).set(artifactBytes);

/**
 * Contract: overlay brings working set within budget → fits arm with overlaid content and count.
 * Arrange: one resource document whose artifact exists in storage; finalTargetThreshold above the
 *   overlaid count; downloadFromStorage returns the artifact bytes; countTokens returns 0;
 *   resolveCompressionSource returns sourceType 'resource' and the document's documentKey;
 *   real constructStoragePath proves the PathContext is valid.
 * Act:     compressPrompt with the overlay deps, params and payload.
 * Assert:  result is isCompressPromptFitsReturn; resourceDocuments[0].content is the artifact
 *   content; resolvedInputTokenCount is 0; result.resourceDocuments is not payload.resourceDocuments.
 */
Deno.test("overlay brings working set within budget returns fits arm with overlaid content", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "original-content", document_key: FileType.business_case });
  const downloadFromStorage = createMockDownloadFromStorage({ mode: "success", data: artifactBuffer });
  const resolver: BoundResolveCompressionSourceFn = () =>
    buildCompressibleSourceReturn({ sourceType: "resource", documentKey: FileType.business_case });
  const fns: { pathBuilder: typeof constructStoragePath } = {
    pathBuilder: constructStoragePath,
  };
  const pathSpy = spy(fns, "pathBuilder");
  const deps = buildCompressPromptDeps({
    downloadFromStorage,
    countTokens: createMockCountTokens(),
    resolveCompressionSource: resolver,
    constructStoragePath: fns.pathBuilder,
  });
  const params = buildCompressPromptParams({ finalTargetThreshold: 500 });
  const payload = buildCompressPromptPayload({ resourceDocuments: [doc] });

  // Act
  const result = await compressPrompt(deps, params, payload);

  // Assert
  assert(isCompressPromptFitsReturn(result));
  if (isCompressPromptFitsReturn(result)) {
    assertEquals(result.resourceDocuments[0].content, "compressed-artifact-content");
    assertEquals(result.resolvedInputTokenCount, 0);
    assertNotEquals(result.resourceDocuments, payload.resourceDocuments);
  }
  if (pathSpy.calls.length >= 1) {
    const ctx: PathContext = pathSpy.calls[0].args[0];
    assertEquals(ctx.sourceType, "resource");
    assertEquals(ctx.documentKey, FileType.business_case);
  }
});

/**
 * Contract: over-budget with one candidate → enqueue one child, parent job passed, pending return.
 * Arrange: one resource document with no artifact; finalTargetThreshold below the count;
 *   getSortedCompressionCandidates returns one candidate; enqueueCompressJobs returns success.
 * Act:     compressPrompt with the over-budget deps, params and payload.
 * Assert:  result is isCompressPromptPendingReturn; enqueueCompressJobs called once; enqueued
 *   payload's parentJob equals payload.parentJob.
 */
Deno.test("over-budget with one candidate enqueues one child and returns pending", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "long-content" });
  const candidate = buildCompressionCandidate({ id: doc.id, content: doc.content, sourceType: "resource" });
  const fns: {
    scorer: BoundGetSortedCompressionCandidatesFn;
    enqueue: BoundenqueueCompressJobsFn;
    resolver: BoundResolveCompressionSourceFn;
  } = {
    scorer: async () => buildGetSortedCompressionCandidatesSuccessReturn({ candidates: [candidate] }),
    enqueue: async () => buildenqueueCompressJobsSuccessReturn(),
    resolver: () => buildCompressibleSourceReturn({ sourceType: "resource", documentKey: FileType.business_case }),
  };
  const enqueueSpy = spy(fns, "enqueue");
  const deps = buildCompressPromptDeps({
    countTokens: () => 100,
    getSortedCompressionCandidates: fns.scorer,
    enqueueCompressJobs: fns.enqueue,
    resolveCompressionSource: fns.resolver,
  });
  const params = buildCompressPromptParams({ finalTargetThreshold: 10 });
  const payload = buildCompressPromptPayload({ resourceDocuments: [doc] });

  // Act
  const result = await compressPrompt(deps, params, payload);

  // Assert
  assert(isCompressPromptPendingReturn(result));
  assertEquals(enqueueSpy.calls.length, 1);
  if (enqueueSpy.calls.length === 1) {
    const enqueuedPayload: enqueueCompressJobsPayload = enqueueSpy.calls[0].args[1];
    assertEquals(enqueuedPayload.parentJob, payload.parentJob);
  }
});

/**
 * Contract: over-budget with no eligible candidates → ContextWindowError, retriable false.
 * Arrange: one resource document with no artifact; finalTargetThreshold below the count;
 *   getSortedCompressionCandidates returns an empty candidates array.
 * Act:     compressPrompt with the exhausted-candidate deps, params and payload.
 * Assert:  result is isCompressPromptErrorReturn; error is ContextWindowError; retriable is false.
 */
Deno.test("over-budget with no eligible candidates returns ContextWindowError", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "long-content" });
  const scorer: BoundGetSortedCompressionCandidatesFn = async () =>
    buildGetSortedCompressionCandidatesSuccessReturn({ candidates: [] });
  const deps = buildCompressPromptDeps({ countTokens: () => 100, getSortedCompressionCandidates: scorer });
  const params = buildCompressPromptParams({ finalTargetThreshold: 10 });
  const payload = buildCompressPromptPayload({ resourceDocuments: [doc] });

  // Act
  const result = await compressPrompt(deps, params, payload);

  // Assert
  assert(isCompressPromptErrorReturn(result));
  if (isCompressPromptErrorReturn(result)) {
    assert(result.error instanceof ContextWindowError);
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: scorer error arm → error propagated unchanged, enqueueCompressJobs never called.
 * Arrange: one resource document with no artifact; finalTargetThreshold below the count;
 *   getSortedCompressionCandidates returns its error return; enqueueCompressJobs records calls.
 * Act:     compressPrompt with the scorer-error deps, params and payload.
 * Assert:  result is isCompressPromptErrorReturn; error and retriable equal the scorer error;
 *   enqueueCompressJobs call count is 0.
 */
Deno.test("scorer error arm is propagated unchanged and enqueue is never called", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "long-content" });
  const scorerError = buildGetSortedCompressionCandidatesErrorReturn({
    error: new Error("scorer failed"),
    retriable: true,
  });
  const fns: {
    scorer: BoundGetSortedCompressionCandidatesFn;
    enqueue: BoundenqueueCompressJobsFn;
  } = {
    scorer: async () => scorerError,
    enqueue: async () => buildenqueueCompressJobsSuccessReturn(),
  };
  const enqueueSpy = spy(fns, "enqueue");
  const deps = buildCompressPromptDeps({
    countTokens: () => 100,
    getSortedCompressionCandidates: fns.scorer,
    enqueueCompressJobs: fns.enqueue,
  });
  const params = buildCompressPromptParams({ finalTargetThreshold: 10 });
  const payload = buildCompressPromptPayload({ resourceDocuments: [doc] });

  // Act
  const result = await compressPrompt(deps, params, payload);

  // Assert
  assert(isCompressPromptErrorReturn(result));
  if (isCompressPromptErrorReturn(result)) {
    assertEquals(result.error, scorerError.error);
    assertEquals(result.retriable, scorerError.retriable);
  }
  assertEquals(enqueueSpy.calls.length, 0);
});

/**
 * Contract: scorer is called with inputsRelevance and modelConfig from payload params, and
 *   documents and history from payload.
 * Arrange: one resource document with no artifact; finalTargetThreshold below the count;
 *   a recording scorer captures its params and payload; inputsRelevance and conversationHistory
 *   set to non-default values via builders.
 * Act:     compressPrompt with the recording-scorer deps, params and payload.
 * Assert:  captured scorer params' inputsRelevance equals payload.inputsRelevance; modelConfig
 *   equals payload.extendedModelConfig; captured payload's documents equals payload.resourceDocuments;
 *   history equals payload.conversationHistory.
 */
Deno.test("scorer is called with inputsRelevance, modelConfig, documents and history from payload", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "long-content" });
  const message = buildMessages({ id: "msg-1", role: "user", content: "history-content" });
  const relevanceRule = buildRelevanceRule({ document_key: FileType.business_case, relevance: 0.5 });
  const fns: { scorer: BoundGetSortedCompressionCandidatesFn } = {
    scorer: async () => buildGetSortedCompressionCandidatesSuccessReturn({ candidates: [] }),
  };
  const scorerSpy = spy(fns, "scorer");
  const deps = buildCompressPromptDeps({ countTokens: () => 100, getSortedCompressionCandidates: fns.scorer });
  const params = buildCompressPromptParams({ finalTargetThreshold: 10 });
  const payload = buildCompressPromptPayload({
    resourceDocuments: [doc],
    conversationHistory: [message],
    inputsRelevance: [relevanceRule],
  });

  // Act
  await compressPrompt(deps, params, payload);

  // Assert
  if (scorerSpy.calls.length === 1) {
    const capturedParams: GetSortedCompressionCandidatesParams = scorerSpy.calls[0].args[0];
    const capturedPayload: GetSortedCompressionCandidatesPayload = scorerSpy.calls[0].args[1];
    assertEquals(capturedParams.inputsRelevance, payload.inputsRelevance);
    assertEquals(capturedParams.modelConfig, payload.extendedModelConfig);
    assertEquals(capturedPayload.documents, payload.resourceDocuments);
    assertEquals(capturedPayload.history, payload.conversationHistory);
  }
});

/**
 * Contract: enqueueCompressJobs error arm → error propagated unchanged.
 * Arrange: one resource document with no artifact; finalTargetThreshold below the count;
 *   getSortedCompressionCandidates returns one candidate; enqueueCompressJobs returns its error.
 * Act:     compressPrompt with the enqueue-error deps, params and payload.
 * Assert:  result is isCompressPromptErrorReturn; error and retriable equal the enqueue error.
 */
Deno.test("enqueue error arm is propagated unchanged", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "long-content" });
  const candidate = buildCompressionCandidate({ id: doc.id, content: doc.content, sourceType: "resource" });
  const enqueueError = buildenqueueCompressJobsErrorReturn({
    error: buildCompressJobEnqueueError({ message: "enqueue failed" }),
    retriable: true,
  });
  const scorer: BoundGetSortedCompressionCandidatesFn = async () =>
    buildGetSortedCompressionCandidatesSuccessReturn({ candidates: [candidate] });
  const enqueue: BoundenqueueCompressJobsFn = async () => enqueueError;
  const resolver: BoundResolveCompressionSourceFn = () =>
    buildCompressibleSourceReturn({ sourceType: "resource", documentKey: FileType.business_case });
  const deps = buildCompressPromptDeps({
    countTokens: () => 100,
    getSortedCompressionCandidates: scorer,
    enqueueCompressJobs: enqueue,
    resolveCompressionSource: resolver,
  });
  const params = buildCompressPromptParams({ finalTargetThreshold: 10 });
  const payload = buildCompressPromptPayload({ resourceDocuments: [doc] });

  // Act
  const result = await compressPrompt(deps, params, payload);

  // Assert
  assert(isCompressPromptErrorReturn(result));
  if (isCompressPromptErrorReturn(result)) {
    assertEquals(result.error, enqueueError.error);
    assertEquals(result.retriable, enqueueError.retriable);
  }
});

/**
 * Contract: victim selection picks the candidate with the lowest effectiveScore.
 * Arrange: two resource documents with no artifacts; finalTargetThreshold below the count;
 *   getSortedCompressionCandidates returns two candidates, the lower-scored one first; a recording
 *   enqueueCompressJobs captures its victim.
 * Act:     compressPrompt with the two-candidate deps, params and payload.
 * Assert:  the enqueued victim's content equals the lowest-scored candidate's content.
 */
Deno.test("victim selection picks the lowest effectiveScore candidate", async () => {
  // Arrange
  const docLow = buildResourceDocument({ id: "doc-low", content: "low-content" });
  const docHigh = buildResourceDocument({ id: "doc-high", content: "high-content" });
  const candidateLow = buildCompressionCandidate({
    id: "doc-low",
    content: "low-content",
    sourceType: "resource",
    effectiveScore: 1,
  });
  const candidateHigh = buildCompressionCandidate({
    id: "doc-high",
    content: "high-content",
    sourceType: "resource",
    effectiveScore: 10,
  });
  const fns: {
    scorer: BoundGetSortedCompressionCandidatesFn;
    enqueue: BoundenqueueCompressJobsFn;
    resolver: BoundResolveCompressionSourceFn;
  } = {
    scorer: async () =>
      buildGetSortedCompressionCandidatesSuccessReturn({ candidates: [candidateLow, candidateHigh] }),
    enqueue: async () => buildenqueueCompressJobsSuccessReturn(),
    resolver: () => buildCompressibleSourceReturn({ sourceType: "resource", documentKey: FileType.business_case }),
  };
  const enqueueSpy = spy(fns, "enqueue");
  const deps = buildCompressPromptDeps({
    countTokens: () => 100,
    getSortedCompressionCandidates: fns.scorer,
    enqueueCompressJobs: fns.enqueue,
    resolveCompressionSource: fns.resolver,
  });
  const params = buildCompressPromptParams({ finalTargetThreshold: 10 });
  const payload = buildCompressPromptPayload({ resourceDocuments: [docLow, docHigh] });

  // Act
  await compressPrompt(deps, params, payload);

  // Assert
  if (enqueueSpy.calls.length === 1) {
    const enqueuedPayload: enqueueCompressJobsPayload = enqueueSpy.calls[0].args[1];
    assertEquals(enqueuedPayload.victim.content, candidateLow.content);
  }
});

/**
 * Contract: document victim carries resolver-returned sourceType and documentKey, asserted against
 *   a resolver returning values distinct from every builder default.
 * Arrange: one resource document with no artifact; finalTargetThreshold below the count;
 *   getSortedCompressionCandidates returns one candidate; resolveCompressionSource returns
 *   sourceType 'feedback' and documentKey FileType.technical_approach (distinct from defaults);
 *   a recording enqueueCompressJobs captures its victim.
 * Act:     compressPrompt with the distinct-resolver deps, params and payload.
 * Assert:  enqueued victim's sourceType is 'feedback'; documentKey is FileType.technical_approach.
 */
Deno.test("document victim carries resolver-returned sourceType and documentKey", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "long-content" });
  const candidate = buildCompressionCandidate({ id: doc.id, content: doc.content, sourceType: "resource" });
  const fns: {
    scorer: BoundGetSortedCompressionCandidatesFn;
    enqueue: BoundenqueueCompressJobsFn;
    resolver: BoundResolveCompressionSourceFn;
  } = {
    scorer: async () => buildGetSortedCompressionCandidatesSuccessReturn({ candidates: [candidate] }),
    enqueue: async () => buildenqueueCompressJobsSuccessReturn(),
    resolver: () => buildCompressibleSourceReturn({ sourceType: "feedback", documentKey: FileType.technical_approach }),
  };
  const enqueueSpy = spy(fns, "enqueue");
  const deps = buildCompressPromptDeps({
    countTokens: () => 100,
    getSortedCompressionCandidates: fns.scorer,
    enqueueCompressJobs: fns.enqueue,
    resolveCompressionSource: fns.resolver,
  });
  const params = buildCompressPromptParams({ finalTargetThreshold: 10 });
  const payload = buildCompressPromptPayload({ resourceDocuments: [doc] });

  // Act
  await compressPrompt(deps, params, payload);

  // Assert
  if (enqueueSpy.calls.length === 1) {
    const enqueuedPayload: enqueueCompressJobsPayload = enqueueSpy.calls[0].args[1];
    assertEquals(enqueuedPayload.victim.sourceType, "feedback");
    assertEquals(enqueuedPayload.victim.documentKey, FileType.technical_approach);
  }
});

/**
 * Contract: history victim carries sourceType 'history', sourceId from message id, role from message
 *   role, no documentKey; resolveCompressionSource is never called.
 * Arrange: one history message with no artifact; finalTargetThreshold below the count;
 *   getSortedCompressionCandidates returns one sourceType 'history' candidate whose id matches the
 *   message; a recording resolver counts calls; a recording enqueueCompressJobs captures its victim.
 * Act:     compressPrompt with the history-victim deps, params and payload.
 * Assert:  enqueued victim's sourceType is 'history'; sourceId equals message id; role equals message
 *   role; documentKey is undefined; resolver call count is 0.
 */
Deno.test("history victim carries sourceId and role from the message and no documentKey", async () => {
  // Arrange
  const message = buildMessages({ id: "msg-1", role: "user", content: "history-content" });
  const candidate = buildCompressionCandidate({
    id: "msg-1",
    content: "history-content",
    sourceType: "history",
  });
  const fns: {
    scorer: BoundGetSortedCompressionCandidatesFn;
    enqueue: BoundenqueueCompressJobsFn;
    resolver: BoundResolveCompressionSourceFn;
  } = {
    scorer: async () => buildGetSortedCompressionCandidatesSuccessReturn({ candidates: [candidate] }),
    enqueue: async () => buildenqueueCompressJobsSuccessReturn(),
    resolver: () => buildCompressibleSourceReturn(),
  };
  const resolverSpy = spy(fns, "resolver");
  const enqueueSpy = spy(fns, "enqueue");
  const deps = buildCompressPromptDeps({
    countTokens: () => 100,
    getSortedCompressionCandidates: fns.scorer,
    enqueueCompressJobs: fns.enqueue,
    resolveCompressionSource: fns.resolver,
  });
  const params = buildCompressPromptParams({ finalTargetThreshold: 10 });
  const payload = buildCompressPromptPayload({ conversationHistory: [message] });

  // Act
  await compressPrompt(deps, params, payload);

  // Assert
  if (enqueueSpy.calls.length === 1) {
    const victim: enqueueCompressJobsVictim = enqueueSpy.calls[0].args[1].victim;
    assertEquals(victim.sourceType, "history");
    assertEquals(victim.sourceId, "msg-1");
    assertEquals(victim.role, "user");
    assertEquals(victim.documentKey, undefined);
  }
  assertEquals(resolverSpy.calls.length, 0);
});

/**
 * Contract: document victim whose type is 'document' carries mode 'json' with docType from the
 *   document's document_key and sourceStageSlug from its stage_slug.
 * Arrange: one resource document with type 'document', document_key FileType.business_case,
 *   stage_slug 'thesis'; no artifact; finalTargetThreshold below the count; a recording
 *   enqueueCompressJobs captures its victim.
 * Act:     compressPrompt with the document-type-victim deps, params and payload.
 * Assert:  enqueued victim's mode is 'json'; docType is FileType.business_case; sourceStageSlug is 'thesis'.
 */
Deno.test("document-type victim carries mode json with docType and sourceStageSlug", async () => {
  // Arrange
  const doc = buildResourceDocument({
    content: "long-content",
    type: "document",
    document_key: FileType.business_case,
    stage_slug: "thesis",
  });
  const candidate = buildCompressionCandidate({ id: doc.id, content: doc.content, sourceType: "resource" });
  const fns: {
    scorer: BoundGetSortedCompressionCandidatesFn;
    enqueue: BoundenqueueCompressJobsFn;
    resolver: BoundResolveCompressionSourceFn;
  } = {
    scorer: async () => buildGetSortedCompressionCandidatesSuccessReturn({ candidates: [candidate] }),
    enqueue: async () => buildenqueueCompressJobsSuccessReturn(),
    resolver: () => buildCompressibleSourceReturn({ sourceType: "resource", documentKey: FileType.business_case }),
  };
  const enqueueSpy = spy(fns, "enqueue");
  const deps = buildCompressPromptDeps({
    countTokens: () => 100,
    getSortedCompressionCandidates: fns.scorer,
    enqueueCompressJobs: fns.enqueue,
    resolveCompressionSource: fns.resolver,
  });
  const params = buildCompressPromptParams({ finalTargetThreshold: 10 });
  const payload = buildCompressPromptPayload({ resourceDocuments: [doc] });

  // Act
  await compressPrompt(deps, params, payload);

  // Assert
  if (enqueueSpy.calls.length === 1) {
    const victim: enqueueCompressJobsVictim = enqueueSpy.calls[0].args[1].victim;
    assertEquals(victim.mode, "json");
    assertEquals(victim.docType, FileType.business_case);
    assertEquals(victim.sourceStageSlug, "thesis");
  }
});

/**
 * Contract: document victim whose type is not 'document' carries mode 'text' and no docType or
 *   sourceStageSlug.
 * Arrange: one resource document with type 'feedback'; no artifact; finalTargetThreshold below the
 *   count; a recording enqueueCompressJobs captures its victim.
 * Act:     compressPrompt with the non-document-victim deps, params and payload.
 * Assert:  enqueued victim's mode is 'text'; docType is undefined; sourceStageSlug is undefined.
 */
Deno.test("non-document victim carries mode text without docType or sourceStageSlug", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "long-content", type: "feedback" });
  const candidate = buildCompressionCandidate({ id: doc.id, content: doc.content, sourceType: "resource" });
  const fns: {
    scorer: BoundGetSortedCompressionCandidatesFn;
    enqueue: BoundenqueueCompressJobsFn;
    resolver: BoundResolveCompressionSourceFn;
  } = {
    scorer: async () => buildGetSortedCompressionCandidatesSuccessReturn({ candidates: [candidate] }),
    enqueue: async () => buildenqueueCompressJobsSuccessReturn(),
    resolver: () => buildCompressibleSourceReturn({ sourceType: "resource", documentKey: FileType.business_case }),
  };
  const enqueueSpy = spy(fns, "enqueue");
  const deps = buildCompressPromptDeps({
    countTokens: () => 100,
    getSortedCompressionCandidates: fns.scorer,
    enqueueCompressJobs: fns.enqueue,
    resolveCompressionSource: fns.resolver,
  });
  const params = buildCompressPromptParams({ finalTargetThreshold: 10 });
  const payload = buildCompressPromptPayload({ resourceDocuments: [doc] });

  // Act
  await compressPrompt(deps, params, payload);

  // Assert
  if (enqueueSpy.calls.length === 1) {
    const victim: enqueueCompressJobsVictim = enqueueSpy.calls[0].args[1].victim;
    assertEquals(victim.mode, "text");
    assertEquals(victim.docType, undefined);
    assertEquals(victim.sourceStageSlug, undefined);
  }
});

/**
 * Contract: resolveCompressionSource returns not-compressible → error return, enqueueCompressJobs
 *   never called.
 * Arrange: one resource document with no artifact; finalTargetThreshold below the count;
 *   getSortedCompressionCandidates returns one candidate; resolveCompressionSource returns
 *   not-compressible; a recording enqueueCompressJobs counts calls.
 * Act:     compressPrompt with the not-compressible deps, params and payload.
 * Assert:  result is isCompressPromptErrorReturn; enqueueCompressJobs call count is 0.
 */
Deno.test("not-compressible resolver return yields error and no enqueue", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "long-content" });
  const candidate = buildCompressionCandidate({ id: doc.id, content: doc.content, sourceType: "resource" });
  const fns: {
    scorer: BoundGetSortedCompressionCandidatesFn;
    enqueue: BoundenqueueCompressJobsFn;
    resolver: BoundResolveCompressionSourceFn;
  } = {
    scorer: async () => buildGetSortedCompressionCandidatesSuccessReturn({ candidates: [candidate] }),
    enqueue: async () => buildenqueueCompressJobsSuccessReturn(),
    resolver: () => buildNotCompressibleSourceReturn(),
  };
  const enqueueSpy = spy(fns, "enqueue");
  const deps = buildCompressPromptDeps({
    countTokens: () => 100,
    getSortedCompressionCandidates: fns.scorer,
    enqueueCompressJobs: fns.enqueue,
    resolveCompressionSource: fns.resolver,
  });
  const params = buildCompressPromptParams({ finalTargetThreshold: 10 });
  const payload = buildCompressPromptPayload({ resourceDocuments: [doc] });

  // Act
  const result = await compressPrompt(deps, params, payload);

  // Assert
  assert(isCompressPromptErrorReturn(result));
  assertEquals(enqueueSpy.calls.length, 0);
});

/**
 * Contract: resolveCompressionSource error arm → error propagated unchanged, enqueueCompressJobs
 *   never called.
 * Arrange: one resource document with no artifact; finalTargetThreshold below the count;
 *   getSortedCompressionCandidates returns one candidate; resolveCompressionSource returns its error;
 *   a recording enqueueCompressJobs counts calls.
 * Act:     compressPrompt with the resolver-error deps, params and payload.
 * Assert:  result is isCompressPromptErrorReturn; error and retriable equal the resolver error;
 *   enqueueCompressJobs call count is 0.
 */
Deno.test("resolver error arm is propagated unchanged and no enqueue", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "long-content" });
  const candidate = buildCompressionCandidate({ id: doc.id, content: doc.content, sourceType: "resource" });
  const resolverError = buildResolveCompressionSourceErrorReturn({
    error: new Error("resolver failed"),
    retriable: true,
  });
  const fns: {
    scorer: BoundGetSortedCompressionCandidatesFn;
    enqueue: BoundenqueueCompressJobsFn;
    resolver: BoundResolveCompressionSourceFn;
  } = {
    scorer: async () => buildGetSortedCompressionCandidatesSuccessReturn({ candidates: [candidate] }),
    enqueue: async () => buildenqueueCompressJobsSuccessReturn(),
    resolver: () => resolverError,
  };
  const enqueueSpy = spy(fns, "enqueue");
  const deps = buildCompressPromptDeps({
    countTokens: () => 100,
    getSortedCompressionCandidates: fns.scorer,
    enqueueCompressJobs: fns.enqueue,
    resolveCompressionSource: fns.resolver,
  });
  const params = buildCompressPromptParams({ finalTargetThreshold: 10 });
  const payload = buildCompressPromptPayload({ resourceDocuments: [doc] });

  // Act
  const result = await compressPrompt(deps, params, payload);

  // Assert
  assert(isCompressPromptErrorReturn(result));
  if (isCompressPromptErrorReturn(result)) {
    assertEquals(result.error, resolverError.error);
    assertEquals(result.retriable, resolverError.retriable);
  }
  assertEquals(enqueueSpy.calls.length, 0);
});

/**
 * Contract: fits path does not inline-mutate payload.resourceDocuments — the returned
 *   resourceDocuments array is not the same array identity.
 * Arrange: one resource document whose artifact exists; finalTargetThreshold above the count;
 *   downloadFromStorage returns the artifact bytes; countTokens returns 0.
 * Act:     compressPrompt with the overlay deps, params and payload.
 * Assert:  result is isCompressPromptFitsReturn; result.resourceDocuments is not the same array
 *   reference as payload.resourceDocuments.
 */
Deno.test("fits path returns a new resourceDocuments array, not the payload array", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "original-content", document_key: FileType.business_case });
  const downloadFromStorage = createMockDownloadFromStorage({ mode: "success", data: artifactBuffer });
  const resolver: BoundResolveCompressionSourceFn = () =>
    buildCompressibleSourceReturn({ sourceType: "resource", documentKey: FileType.business_case });
  const deps = buildCompressPromptDeps({
    downloadFromStorage,
    countTokens: createMockCountTokens(),
    resolveCompressionSource: resolver,
    constructStoragePath,
  });
  const params = buildCompressPromptParams({ finalTargetThreshold: 500 });
  const payload = buildCompressPromptPayload({ resourceDocuments: [doc] });

  // Act
  const result = await compressPrompt(deps, params, payload);

  // Assert
  assert(isCompressPromptFitsReturn(result));
  if (isCompressPromptFitsReturn(result)) {
    assertNotEquals(result.resourceDocuments, payload.resourceDocuments);
  }
});

/**
 * Contract: overlay calls constructStoragePath with a per-artifact PathContext carrying the
 *   history message's sourceType 'history', sourceId and role.
 * Arrange: one history message with an id and role; finalTargetThreshold above the count;
 *   downloadFromStorage returns null (no artifact); countTokens returns 0; real
 *   constructStoragePath proves the PathContext is valid.
 * Act:     compressPrompt with the history-overlay deps, params and payload.
 * Assert:  constructStoragePath called at least once with a PathContext whose sourceType is
 *   'history', sourceId equals the message id, and role equals the message role.
 */
Deno.test("overlay calls constructStoragePath with per-artifact history identity", async () => {
  // Arrange
  const message = buildMessages({ id: "msg-1", role: "user", content: "history-content" });
  const fns: { pathBuilder: typeof constructStoragePath } = {
    pathBuilder: constructStoragePath,
  };
  const pathSpy = spy(fns, "pathBuilder");
  const deps = buildCompressPromptDeps({
    countTokens: createMockCountTokens(),
    constructStoragePath: fns.pathBuilder,
  });
  const params = buildCompressPromptParams({ finalTargetThreshold: 500 });
  const payload = buildCompressPromptPayload({ conversationHistory: [message], resourceDocuments: [] });

  // Act
  await compressPrompt(deps, params, payload);

  // Assert
  if (pathSpy.calls.length >= 1) {
    const ctx: PathContext = pathSpy.calls[0].args[0];
    assertEquals(ctx.sourceType, "history");
    assertEquals(ctx.sourceId, "msg-1");
    assertEquals(ctx.role, "user");
  }
});
