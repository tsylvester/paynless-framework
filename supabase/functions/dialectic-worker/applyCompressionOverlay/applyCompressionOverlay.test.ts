import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { DownloadFromStorageFn } from "../../_shared/supabase_storage_utils.ts";
import { createMockDownloadFromStorage } from "../../_shared/supabase_storage_utils.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { buildMessages } from "../../_shared/dialectic.mock.ts";
import {
  buildResourceDocument,
  buildCompressibleSourceReturn,
  buildNotCompressibleSourceReturn,
  buildResolveCompressionSourceErrorReturn,
} from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import type { BoundResolveCompressionSourceFn } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import { applyCompressionOverlay } from "./applyCompressionOverlay.ts";
import {
  isApplyCompressionOverlaySuccessReturn,
  isApplyCompressionOverlayErrorReturn,
} from "./applyCompressionOverlay.guard.ts";
import {
  buildApplyCompressionOverlayDeps,
  buildApplyCompressionOverlayParams,
  buildApplyCompressionOverlayPayload,
} from "./applyCompressionOverlay.mock.ts";

/**
 * Contract: given both resourceDocuments and conversationHistory are empty arrays,
 *   the function returns success with empty arrays and overlaidCount: 0.
 * Arrange: payload with empty resourceDocuments and empty conversationHistory.
 * Act:     applyCompressionOverlay over the empty payload.
 * Assert:  success return; resourceDocuments is empty; conversationHistory is empty; overlaidCount is 0.
 */
Deno.test("empty inputs returns empty arrays and overlaidCount 0", async () => {
  // Arrange
  const deps = buildApplyCompressionOverlayDeps();
  const params = buildApplyCompressionOverlayParams();
  const payload = buildApplyCompressionOverlayPayload();

  // Act
  const result = await applyCompressionOverlay(deps, params, payload);

  // Assert
  assert(isApplyCompressionOverlaySuccessReturn(result));
  if (isApplyCompressionOverlaySuccessReturn(result)) {
    assertEquals(result.resourceDocuments.length, 0);
    assertEquals(result.conversationHistory.length, 0);
    assertEquals(result.overlaidCount, 0);
  }
});

/**
 * Contract: given a compressible resource document whose canonical path has a compressed artifact
 *   (download returns data), the document's content is replaced and overlaidCount is 1.
 * Arrange: one resource document (builder default); deps with default success download.
 * Act:     applyCompressionOverlay over the single-document payload.
 * Assert:  success return; resourceDocuments[0].content is the decoded compressed content; overlaidCount is 1.
 */
Deno.test("compressible document with matching artifact gets content replaced and overlaidCount 1", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "original-content" });
  const deps = buildApplyCompressionOverlayDeps();
  const params = buildApplyCompressionOverlayParams();
  const payload = buildApplyCompressionOverlayPayload({ resourceDocuments: [doc] });

  // Act
  const result = await applyCompressionOverlay(deps, params, payload);

  // Assert
  assert(isApplyCompressionOverlaySuccessReturn(result));
  if (isApplyCompressionOverlaySuccessReturn(result)) {
    assertEquals(result.resourceDocuments[0].content, "compressed-content");
    assertNotEquals(result.resourceDocuments[0].content, "original-content");
    assertEquals(result.overlaidCount, 1);
  }
});

/**
 * Contract: given a compressible resource document whose canonical path has no compressed artifact
 *   (download returns null), the document passes through with original content and overlaidCount is 0.
 * Arrange: one resource document (builder default); deps with an empty (miss) download.
 * Act:     applyCompressionOverlay over the single-document payload.
 * Assert:  success return; resourceDocuments[0].content is the original content; overlaidCount is 0.
 */
Deno.test("compressible document with no artifact passes through with original content and overlaidCount 0", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "original-content" });
  const deps = buildApplyCompressionOverlayDeps({
    downloadFromStorage: createMockDownloadFromStorage({ mode: "empty" }),
  });
  const params = buildApplyCompressionOverlayParams();
  const payload = buildApplyCompressionOverlayPayload({ resourceDocuments: [doc] });

  // Act
  const result = await applyCompressionOverlay(deps, params, payload);

  // Assert
  assert(isApplyCompressionOverlaySuccessReturn(result));
  if (isApplyCompressionOverlaySuccessReturn(result)) {
    assertEquals(result.resourceDocuments[0].content, "original-content");
    assertEquals(result.overlaidCount, 0);
  }
});

/**
 * Contract: given a resolver returning sourceType 'feedback' and documentKey FileType.technical_approach
 *   while the document's own document_key is FileType.business_case, the path passed to
 *   deps.downloadFromStorage carries the returned documentKey and the _feedback basename suffix.
 * Arrange: one resource document with document_key FileType.business_case; a local resolver returning
 *   buildCompressibleSourceReturn({ sourceType: 'feedback', documentKey: FileType.technical_approach });
 *   a local download that captures the path and returns data.
 * Act:     applyCompressionOverlay over the single-document payload.
 * Assert:  success return; captured path includes 'technical_approach'; captured path includes '_feedback';
 *   captured path does not include 'business_case'.
 */
Deno.test("path is built from the resolver's returned sourceType and documentKey", async () => {
  // Arrange
  const doc = buildResourceDocument({ document_key: FileType.business_case, content: "original-content" });
  const resolver: BoundResolveCompressionSourceFn = () =>
    buildCompressibleSourceReturn({ sourceType: "feedback", documentKey: FileType.technical_approach });
  let capturedPath = "";
  const downloadFn: DownloadFromStorageFn = async (_supabase, _bucket, path) => {
    capturedPath = path;
    const contentBytes = new TextEncoder().encode("compressed-content");
    const contentBuffer = new ArrayBuffer(contentBytes.byteLength);
    new Uint8Array(contentBuffer).set(contentBytes);
    return { data: contentBuffer, error: null };
  };
  const deps = buildApplyCompressionOverlayDeps({
    resolveCompressionSource: resolver,
    downloadFromStorage: downloadFn,
  });
  const params = buildApplyCompressionOverlayParams({ output_type: FileType.success_metrics });
  const payload = buildApplyCompressionOverlayPayload({ resourceDocuments: [doc] });

  // Act
  const result = await applyCompressionOverlay(deps, params, payload);

  // Assert
  assert(isApplyCompressionOverlaySuccessReturn(result));
  assert(capturedPath.includes("technical_approach"));
  assert(capturedPath.includes("_feedback"));
  assert(!capturedPath.includes("business_case"));
});

/**
 * Contract: given a resource document the resolver reports not compressible, the document passes
 *   through unchanged, overlaidCount is 0, and deps.downloadFromStorage is not called.
 * Arrange: one resource document (builder default); a local resolver returning buildNotCompressibleSourceReturn();
 *   a local download that tracks whether it was called.
 * Act:     applyCompressionOverlay over the single-document payload.
 * Assert:  success return; resourceDocuments[0].content is the original content; overlaidCount is 0;
 *   downloadFromStorage was not called.
 */
Deno.test("not compressible document passes through unchanged with no storage read", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "original-content" });
  const resolver: BoundResolveCompressionSourceFn = () => buildNotCompressibleSourceReturn();
  let downloadCalled = false;
  const downloadFn: DownloadFromStorageFn = async () => {
    downloadCalled = true;
    return { data: null, error: null };
  };
  const deps = buildApplyCompressionOverlayDeps({
    resolveCompressionSource: resolver,
    downloadFromStorage: downloadFn,
  });
  const params = buildApplyCompressionOverlayParams();
  const payload = buildApplyCompressionOverlayPayload({ resourceDocuments: [doc] });

  // Act
  const result = await applyCompressionOverlay(deps, params, payload);

  // Assert
  assert(isApplyCompressionOverlaySuccessReturn(result));
  if (isApplyCompressionOverlaySuccessReturn(result)) {
    assertEquals(result.resourceDocuments[0].content, "original-content");
    assertEquals(result.overlaidCount, 0);
  }
  assertEquals(downloadCalled, false);
});

/**
 * Contract: given a resolver that returns its error arm, the function returns ApplyCompressionOverlayErrorReturn
 *   carrying that same Error instance and its retriable value, and deps.downloadFromStorage is not called.
 * Arrange: one resource document (builder default); a local resolver returning buildResolveCompressionSourceErrorReturn
 *   with a specific Error and retriable: true; a local download that tracks whether it was called.
 * Act:     applyCompressionOverlay over the single-document payload.
 * Assert:  error return; error is the same Error instance; retriable is true; downloadFromStorage was not called.
 */
Deno.test("resolver error arm returns error arm carrying the same error and retriable value", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "original-content" });
  const resolverError = new Error("resolver failed");
  const resolver: BoundResolveCompressionSourceFn = () =>
    buildResolveCompressionSourceErrorReturn({ error: resolverError, retriable: true });
  let downloadCalled = false;
  const downloadFn: DownloadFromStorageFn = async () => {
    downloadCalled = true;
    return { data: null, error: null };
  };
  const deps = buildApplyCompressionOverlayDeps({
    resolveCompressionSource: resolver,
    downloadFromStorage: downloadFn,
  });
  const params = buildApplyCompressionOverlayParams();
  const payload = buildApplyCompressionOverlayPayload({ resourceDocuments: [doc] });

  // Act
  const result = await applyCompressionOverlay(deps, params, payload);

  // Assert
  assert(isApplyCompressionOverlayErrorReturn(result));
  if (isApplyCompressionOverlayErrorReturn(result)) {
    assert(result.error === resolverError);
    assertEquals(result.retriable, true);
  }
  assertEquals(downloadCalled, false);
});

/**
 * Contract: given a history message with a defined id, role 'user' or 'assistant',
 *   and a download that returns data, the message's content is replaced and overlaidCount is 1.
 * Arrange: one user message with an id (role 'user' is builder default); deps with default success download.
 * Act:     applyCompressionOverlay over the single-message payload.
 * Assert:  success return; conversationHistory[0].content is the decoded compressed content; overlaidCount is 1.
 */
Deno.test("history message with matching artifact gets content replaced and overlaidCount 1", async () => {
  // Arrange
  const msg = buildMessages({ id: "msg-1", content: "original-message" });
  const deps = buildApplyCompressionOverlayDeps();
  const params = buildApplyCompressionOverlayParams();
  const payload = buildApplyCompressionOverlayPayload({ conversationHistory: [msg] });

  // Act
  const result = await applyCompressionOverlay(deps, params, payload);

  // Assert
  assert(isApplyCompressionOverlaySuccessReturn(result));
  if (isApplyCompressionOverlaySuccessReturn(result)) {
    assertEquals(result.conversationHistory[0].content, "compressed-content");
    assertNotEquals(result.conversationHistory[0].content, "original-message");
    assertEquals(result.overlaidCount, 1);
  }
});

/**
 * Contract: given a history message with a defined id, role 'user' or 'assistant',
 *   and a download that returns null, the message passes through with original content
 *   and overlaidCount is 0.
 * Arrange: one user message with an id (role 'user' is builder default); deps with an empty (miss) download.
 * Act:     applyCompressionOverlay over the single-message payload.
 * Assert:  success return; conversationHistory[0].content is the original content; overlaidCount is 0.
 */
Deno.test("history message with no artifact passes through unchanged and overlaidCount 0", async () => {
  // Arrange
  const msg = buildMessages({ id: "msg-1", content: "original-message" });
  const deps = buildApplyCompressionOverlayDeps({
    downloadFromStorage: createMockDownloadFromStorage({ mode: "empty" }),
  });
  const params = buildApplyCompressionOverlayParams();
  const payload = buildApplyCompressionOverlayPayload({ conversationHistory: [msg] });

  // Act
  const result = await applyCompressionOverlay(deps, params, payload);

  // Assert
  assert(isApplyCompressionOverlaySuccessReturn(result));
  if (isApplyCompressionOverlaySuccessReturn(result)) {
    assertEquals(result.conversationHistory[0].content, "original-message");
    assertEquals(result.overlaidCount, 0);
  }
});

/**
 * Contract: given a history message with no id, or with role 'system' or 'function',
 *   the message passes through unchanged and overlaidCount is 0.
 * Arrange: three messages — one with no id (role 'user' is builder default), one system, one function;
 *   deps with default success download.
 * Act:     applyCompressionOverlay over the three-message payload.
 * Assert:  success return; all three messages retain original content; overlaidCount is 0.
 */
Deno.test("ineligible history messages pass through unconditionally", async () => {
  // Arrange
  const noIdMsg = buildMessages({ content: "no-id-content" });
  const systemMsg = buildMessages({ id: "sys-1", role: "system", content: "system-content" });
  const functionMsg = buildMessages({ id: "fn-1", role: "function", content: "function-content" });
  const deps = buildApplyCompressionOverlayDeps();
  const params = buildApplyCompressionOverlayParams();
  const payload = buildApplyCompressionOverlayPayload({
    conversationHistory: [noIdMsg, systemMsg, functionMsg],
  });

  // Act
  const result = await applyCompressionOverlay(deps, params, payload);

  // Assert
  assert(isApplyCompressionOverlaySuccessReturn(result));
  if (isApplyCompressionOverlaySuccessReturn(result)) {
    assertEquals(result.conversationHistory[0].content, "no-id-content");
    assertEquals(result.conversationHistory[1].content, "system-content");
    assertEquals(result.conversationHistory[2].content, "function-content");
    assertEquals(result.overlaidCount, 0);
  }
});

/**
 * Contract: given a payload of history messages only, deps.resolveCompressionSource is not called
 *   for any history message.
 * Arrange: two user messages with ids; a local resolver that tracks whether it was called;
 *   deps with default success download.
 * Act:     applyCompressionOverlay over the history-only payload.
 * Assert:  success return; the resolver was not called.
 */
Deno.test("resolveCompressionSource is not called for any history message", async () => {
  // Arrange
  const msg1 = buildMessages({ id: "msg-1", content: "original-1" });
  const msg2 = buildMessages({ id: "msg-2", role: "assistant", content: "original-2" });
  let resolverCalled = false;
  const resolver: BoundResolveCompressionSourceFn = () => {
    resolverCalled = true;
    return buildCompressibleSourceReturn();
  };
  const deps = buildApplyCompressionOverlayDeps({ resolveCompressionSource: resolver });
  const params = buildApplyCompressionOverlayParams();
  const payload = buildApplyCompressionOverlayPayload({ conversationHistory: [msg1, msg2] });

  // Act
  const result = await applyCompressionOverlay(deps, params, payload);

  // Assert
  assert(isApplyCompressionOverlaySuccessReturn(result));
  assertEquals(resolverCalled, false);
});

/**
 * Contract: given a mixed payload with some candidates that have artifacts and some that do not,
 *   only the hit candidates have swapped content and overlaidCount reflects the number of hits.
 * Arrange: one compressible document (hit), one not-compressible document (skip),
 *   one assistant message with id (hit), one system message (skip); a local resolver that returns
 *   compressible for the hit document and not-compressible for the skip document; deps with default success download.
 * Act:     applyCompressionOverlay over the mixed payload.
 * Assert:  success return; hit document content is replaced; skip document content is unchanged;
 *   hit message content is replaced; skip message content is unchanged; overlaidCount is 2.
 */
Deno.test("mixed payload with hits and misses returns correct overlaidCount and swapped content", async () => {
  // Arrange
  const hitDoc = buildResourceDocument({ content: "original-hit-doc" });
  const skipDoc = buildResourceDocument({ content: "skip-doc-content" });
  const hitMsg = buildMessages({ id: "hit-msg", role: "assistant", content: "original-hit-msg" });
  const skipMsg = buildMessages({ id: "skip-msg", role: "system", content: "skip-msg-content" });
  const resolver: BoundResolveCompressionSourceFn = (_params, { document }) => {
    if (document.content === "skip-doc-content") {
      return buildNotCompressibleSourceReturn();
    }
    return buildCompressibleSourceReturn();
  };
  const deps = buildApplyCompressionOverlayDeps({ resolveCompressionSource: resolver });
  const params = buildApplyCompressionOverlayParams();
  const payload = buildApplyCompressionOverlayPayload({
    resourceDocuments: [hitDoc, skipDoc],
    conversationHistory: [hitMsg, skipMsg],
  });

  // Act
  const result = await applyCompressionOverlay(deps, params, payload);

  // Assert
  assert(isApplyCompressionOverlaySuccessReturn(result));
  if (isApplyCompressionOverlaySuccessReturn(result)) {
    assertEquals(result.resourceDocuments[0].content, "compressed-content");
    assertEquals(result.resourceDocuments[1].content, "skip-doc-content");
    assertEquals(result.conversationHistory[0].content, "compressed-content");
    assertEquals(result.conversationHistory[1].content, "skip-msg-content");
    assertEquals(result.overlaidCount, 2);
  }
});

/**
 * Contract: given any payload, no input object (document, message, or array) is mutated
 *   after the call — the returned arrays are new arrays of new objects.
 * Arrange: one document (builder default) and one user message with id; capture references to inputs.
 * Act:     applyCompressionOverlay over the payload with default success download.
 * Assert:  the input document's content is unchanged; the input message's content is unchanged;
 *   the input arrays' lengths are unchanged; the returned arrays are not the same reference as the inputs.
 */
Deno.test("no input object is mutated after the call", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "original-content" });
  const msg = buildMessages({ id: "msg-1", content: "original-message" });
  const inputDocs = [doc];
  const inputMsgs = [msg];
  const deps = buildApplyCompressionOverlayDeps();
  const params = buildApplyCompressionOverlayParams();
  const payload = buildApplyCompressionOverlayPayload({
    resourceDocuments: inputDocs,
    conversationHistory: inputMsgs,
  });

  // Act
  const result = await applyCompressionOverlay(deps, params, payload);

  // Assert
  assert(isApplyCompressionOverlaySuccessReturn(result));
  if (isApplyCompressionOverlaySuccessReturn(result)) {
    assertEquals(doc.content, "original-content");
    assertEquals(msg.content, "original-message");
    assertEquals(inputDocs.length, 1);
    assertEquals(inputMsgs.length, 1);
    assert(result.resourceDocuments !== inputDocs);
    assert(result.conversationHistory !== inputMsgs);
    assert(result.resourceDocuments[0] !== doc);
    assert(result.conversationHistory[0] !== msg);
  }
});

/**
 * Contract: given constructStoragePath throws an Error from missing required fields,
 *   the function returns the error arm with the thrown error and retriable: false.
 * Arrange: params with empty projectId to trigger constructStoragePath validation failure;
 *   one resource document (builder default).
 * Act:     applyCompressionOverlay over the payload.
 * Assert:  error return; error is an instance of Error; retriable is false.
 */
Deno.test("constructStoragePath throwing returns error arm with retriable false", async () => {
  // Arrange
  const doc = buildResourceDocument({ content: "original-content" });
  const deps = buildApplyCompressionOverlayDeps();
  const params = buildApplyCompressionOverlayParams({ projectId: "" });
  const payload = buildApplyCompressionOverlayPayload({ resourceDocuments: [doc] });

  // Act
  const result = await applyCompressionOverlay(deps, params, payload);

  // Assert
  assert(isApplyCompressionOverlayErrorReturn(result));
  if (isApplyCompressionOverlayErrorReturn(result)) {
    assert(result.error instanceof Error);
    assertEquals(result.retriable, false);
  }
});
