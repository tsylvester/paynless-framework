// supabase/functions/_shared/utils/vector_utils.test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getSortedCompressionCandidates, scoreHistory } from "./vector_utils.ts";
import {
  buildGetSortedCompressionCandidatesDeps,
  buildGetSortedCompressionCandidatesParams,
  buildGetSortedCompressionCandidatesPayload,
} from "./vector_utils.mock.ts";
import {
  buildResourceDocument,
  buildCompressibleSourceReturn,
  buildNotCompressibleSourceReturn,
  buildResolveCompressionSourceErrorReturn,
} from "../resolveCompressionSource/resolveCompressionSource.provides.ts";
import type { BoundResolveCompressionSourceFn } from "../resolveCompressionSource/resolveCompressionSource.provides.ts";
import type { BoundCountTokensFn, CountableChatPayload } from "../../types/tokenizer.types.ts";
import type { Messages } from "../../types.ts";
import type { CompressionCandidate } from "./vector_utils.interface.ts";
import { FileType } from "../../types/file_manager.types.ts";

// ---------------------------------------------------------------------------
// getSortedCompressionCandidates
// ---------------------------------------------------------------------------

/**
 * Contract: given empty documents and empty history, returns the success arm
 *   with candidates: [] and calls neither countTokens nor resolveCompressionSource.
 * Arrange: payload with documents: [] and history: []; deps with call-tracking
 *   countTokens and resolveCompressionSource.
 * Act:     getSortedCompressionCandidates(deps, params, payload).
 * Assert:  result is the success arm with candidates: []; countTokensCalls === 0;
 *   resolverCalls === 0.
 */
Deno.test("empty documents and empty history returns { candidates: [] } and calls neither collaborator", async () => {
  // Arrange
  let countTokensCalls = 0;
  let resolverCalls = 0;
  const counter: BoundCountTokensFn = (..._args) => { countTokensCalls++; return 0; };
  const resolver: BoundResolveCompressionSourceFn = (..._args) => { resolverCalls++; return buildCompressibleSourceReturn(); };
  const deps = buildGetSortedCompressionCandidatesDeps({ countTokens: counter, resolveCompressionSource: resolver });
  const params = buildGetSortedCompressionCandidatesParams();
  const payload = buildGetSortedCompressionCandidatesPayload();

  // Act
  const result = await getSortedCompressionCandidates(deps, params, payload);

  // Assert
  assert(!('error' in result), 'expected success arm');
  if (!('error' in result)) {
    assertEquals(result.candidates.length, 0);
  }
  assertEquals(countTokensCalls, 0);
  assertEquals(resolverCalls, 0);
});

/**
 * Contract: given a document the resolver rejects, that document is absent from
 *   candidates while an admitted document is present, and countTokens is not
 *   called for the rejected document.
 * Arrange: two documents — 'rejected' (resolver returns not-compressible) and
 *   'admitted' (resolver returns compressible); call-tracking countTokens.
 * Act:     getSortedCompressionCandidates(deps, params, payload).
 * Assert:  'admitted' is in candidates, 'rejected' is not; no countTokens call
 *   had the rejected document's id.
 */
Deno.test("a document the resolver rejects is absent from candidates while an admitted document is present", async () => {
  // Arrange
  const countTokensPayloads: CountableChatPayload[] = [];
  const counter: BoundCountTokensFn = (p, _mc) => { countTokensPayloads.push(p); return 10; };
  const resolver: BoundResolveCompressionSourceFn = (_params, { document }) => {
    if (document.id === 'rejected') return buildNotCompressibleSourceReturn();
    return buildCompressibleSourceReturn();
  };
  const deps = buildGetSortedCompressionCandidatesDeps({ countTokens: counter, resolveCompressionSource: resolver });
  const params = buildGetSortedCompressionCandidatesParams();
  const payload = buildGetSortedCompressionCandidatesPayload({
    documents: [
      buildResourceDocument({ id: 'rejected', content: 'rejected content' }),
      buildResourceDocument({ id: 'admitted', content: 'admitted content' }),
    ],
  });

  // Act
  const result = await getSortedCompressionCandidates(deps, params, payload);

  // Assert
  assert(!('error' in result), 'expected success arm');
  if (!('error' in result)) {
    const ids = result.candidates.map(c => c.id);
    assert(ids.includes('admitted'), 'admitted document should be present');
    assert(!ids.includes('rejected'), 'rejected document should be absent');
  }
  const rejectedCalls = countTokensPayloads.filter(p =>
    p.resourceDocuments?.some(d => d.id === 'rejected')
  );
  assertEquals(rejectedCalls.length, 0, 'countTokens should not be called for rejected document');
});

/**
 * Contract: given the resolver returns its error arm for any document,
 *   getSortedCompressionCandidates returns its error arm carrying that same
 *   error reference and retriable value.
 * Arrange: one document; resolver returns error arm with a specific error and
 *   retriable: true.
 * Act:     getSortedCompressionCandidates(deps, params, payload).
 * Assert:  result is the error arm; result.error === specificError;
 *   result.retriable === true.
 */
Deno.test("the resolver's error arm returns the error return carrying the same error and retriable", async () => {
  // Arrange
  const specificError = new Error('resolver failed');
  const resolver: BoundResolveCompressionSourceFn = (_params, _payload) => {
    return buildResolveCompressionSourceErrorReturn({ error: specificError, retriable: true });
  };
  const deps = buildGetSortedCompressionCandidatesDeps({ resolveCompressionSource: resolver });
  const params = buildGetSortedCompressionCandidatesParams();
  const payload = buildGetSortedCompressionCandidatesPayload({
    documents: [buildResourceDocument({ id: 'doc-1', content: 'content' })],
  });

  // Act
  const result = await getSortedCompressionCandidates(deps, params, payload);

  // Assert
  assert('error' in result, 'expected error arm');
  if ('error' in result) {
    assertEquals(result.error, specificError);
    assertEquals(result.retriable, true);
  }
});

/**
 * Contract: given an admitted document, the candidate carries the sourceType the
 *   resolver returned, asserted against a resolver override returning 'feedback'
 *   where the builder default would give 'resource'.
 * Arrange: one document; resolver returns compressible with sourceType: 'feedback'.
 * Act:     getSortedCompressionCandidates(deps, params, payload).
 * Assert:  the candidate's sourceType === 'feedback'.
 */
Deno.test("an admitted document carries the sourceType the resolver returned", async () => {
  // Arrange
  const resolver: BoundResolveCompressionSourceFn = (_params, _payload) => {
    return buildCompressibleSourceReturn({ sourceType: 'feedback' });
  };
  const deps = buildGetSortedCompressionCandidatesDeps({ resolveCompressionSource: resolver });
  const params = buildGetSortedCompressionCandidatesParams();
  const payload = buildGetSortedCompressionCandidatesPayload({
    documents: [buildResourceDocument({ id: 'doc-1', content: 'content' })],
  });

  // Act
  const result = await getSortedCompressionCandidates(deps, params, payload);

  // Assert
  assert(!('error' in result), 'expected success arm');
  if (!('error' in result)) {
    assertEquals(result.candidates.length, 1);
    assertEquals(result.candidates[0].sourceType, 'feedback');
  }
});

/**
 * Contract: given an admitted document with a matching general relevance rule,
 *   effectiveScore equals candidateTokens * importance, where candidateTokens is
 *   content-sensitive and relevance is stated as an independent literal.
 * Arrange: one document with content '12345' (5 chars); countTokens returns
 *   content length; relevance rule with relevance: 0.5.
 * Act:     getSortedCompressionCandidates(deps, params, payload).
 * Assert:  candidate.tokenCount === 5; candidate.effectiveScore === 5 * 0.5 === 2.5.
 */
Deno.test("an admitted document's effectiveScore equals candidateTokens * importance for a matching general rule", async () => {
  // Arrange
  const contentCounter: BoundCountTokensFn = (p, _mc) => {
    if (p.resourceDocuments && p.resourceDocuments.length > 0) return p.resourceDocuments[0].content.length;
    if (p.messages && p.messages.length > 0) return p.messages[0].content?.length ?? 0;
    return 0;
  };
  const deps = buildGetSortedCompressionCandidatesDeps({ countTokens: contentCounter });
  const params = buildGetSortedCompressionCandidatesParams({
    inputsRelevance: [
      { document_key: FileType.business_case, type: 'document', relevance: 0.5 },
    ],
  });
  const payload = buildGetSortedCompressionCandidatesPayload({
    documents: [buildResourceDocument({ id: 'doc-1', content: '12345' })],
  });

  // Act
  const result = await getSortedCompressionCandidates(deps, params, payload);

  // Assert
  assert(!('error' in result), 'expected success arm');
  if (!('error' in result)) {
    assertEquals(result.candidates.length, 1);
    assertEquals(result.candidates[0].tokenCount, 5);
    assertEquals(result.candidates[0].effectiveScore, 2.5);
  }
});

/**
 * Contract: given a stage-specific rule and a general rule for the same
 *   document_key and type, the stage-specific rule wins, asserted by the two
 *   rules carrying different relevance values.
 * Arrange: one document with stage_slug 'thesis'; two rules — general
 *   relevance 0.3 and stage-specific relevance 0.8 with slug 'thesis';
 *   countTokens returns content length.
 * Act:     getSortedCompressionCandidates(deps, params, payload).
 * Assert:  effectiveScore === 5 * 0.8 === 4 (stage-specific wins).
 */
Deno.test("a stage-specific rule wins over a general rule for the same document_key and type", async () => {
  // Arrange
  const contentCounter: BoundCountTokensFn = (p, _mc) => {
    if (p.resourceDocuments && p.resourceDocuments.length > 0) return p.resourceDocuments[0].content.length;
    return 0;
  };
  const deps = buildGetSortedCompressionCandidatesDeps({ countTokens: contentCounter });
  const params = buildGetSortedCompressionCandidatesParams({
    inputsRelevance: [
      { document_key: FileType.business_case, type: 'document', relevance: 0.3 },
      { document_key: FileType.business_case, type: 'document', relevance: 0.8, slug: 'thesis' },
    ],
  });
  const payload = buildGetSortedCompressionCandidatesPayload({
    documents: [buildResourceDocument({ id: 'doc-1', content: '12345', stage_slug: 'thesis' })],
  });

  // Act
  const result = await getSortedCompressionCandidates(deps, params, payload);

  // Assert
  assert(!('error' in result), 'expected success arm');
  if (!('error' in result)) {
    assertEquals(result.candidates.length, 1);
    assertEquals(result.candidates[0].effectiveScore, 4);
  }
});

/**
 * Contract: given no document in the payload matches any relevance rule,
 *   importance is 1 as a uniform scalar across all documents, so
 *   effectiveScore === candidateTokens and ranking is by token cost alone.
 * Arrange: one document with content '12345' (5 chars); countTokens returns
 *   content length; no inputsRelevance rules.
 * Act:     getSortedCompressionCandidates(deps, params, payload).
 * Assert:  effectiveScore === 5 (candidateTokens * 1).
 */
Deno.test("a document with no matching rule for any document scores effectiveScore === candidateTokens", async () => {
  // Arrange
  const contentCounter: BoundCountTokensFn = (p, _mc) => {
    if (p.resourceDocuments && p.resourceDocuments.length > 0) return p.resourceDocuments[0].content.length;
    return 0;
  };
  const deps = buildGetSortedCompressionCandidatesDeps({ countTokens: contentCounter });
  const params = buildGetSortedCompressionCandidatesParams();
  const payload = buildGetSortedCompressionCandidatesPayload({
    documents: [buildResourceDocument({ id: 'doc-1', content: '12345' })],
  });

  // Act
  const result = await getSortedCompressionCandidates(deps, params, payload);

  // Assert
  assert(!('error' in result), 'expected success arm');
  if (!('error' in result)) {
    assertEquals(result.candidates.length, 1);
    assertEquals(result.candidates[0].effectiveScore, 5);
  }
});

/**
 * Contract: given a document whose key does not match any rule when at least one
 *   other document in the payload did match, importance is avg(matched relevances) / 2,
 *   so the unrated document compresses before the average rated document but not
 *   as aggressively as the lowest-rated document.
 * Arrange: two documents — doc-A (business_case, matches rule with relevance 0.8)
 *   and doc-B (feature_spec, no matching rule); countTokens returns 10 for all.
 * Act:     getSortedCompressionCandidates(deps, params, payload).
 * Assert:  doc-A.effectiveScore === 10 * 0.8 === 8; doc-B.effectiveScore === 10 * (0.8 / 2) === 4.
 */
Deno.test("an unrated document scores effectiveScore = candidateTokens * (avg(matched relevances) / 2) when at least one other document matched", async () => {
  // Arrange
  const counter: BoundCountTokensFn = () => 10;
  const deps = buildGetSortedCompressionCandidatesDeps({ countTokens: counter });
  const params = buildGetSortedCompressionCandidatesParams({
    inputsRelevance: [
      { document_key: FileType.business_case, type: 'document', relevance: 0.8 },
    ],
  });
  const payload = buildGetSortedCompressionCandidatesPayload({
    documents: [
      buildResourceDocument({ id: 'doc-A', content: 'A', document_key: FileType.business_case }),
      buildResourceDocument({ id: 'doc-B', content: 'B', document_key: FileType.feature_spec }),
    ],
  });

  // Act
  const result = await getSortedCompressionCandidates(deps, params, payload);

  // Assert
  assert(!('error' in result), 'expected success arm');
  if (!('error' in result)) {
    const docA = result.candidates.find(c => c.id === 'doc-A');
    const docB = result.candidates.find(c => c.id === 'doc-B');
    assert(docA, 'doc-A should be present');
    assert(docB, 'doc-B should be present');
    if (docA && docB) {
      assertEquals(docA.effectiveScore, 8);
      assertEquals(docB.effectiveScore, 4);
      assert(docB.effectiveScore < docA.effectiveScore, 'unrated document should compress before rated document');
    }
  }
});

/**
 * Contract: given a relevance above 1, it is clamped to 1, so effectiveScore
 *   equals candidateTokens * 1.
 * Arrange: one document with content '12345' (5 chars); countTokens returns
 *   content length; relevance rule with relevance: 2.
 * Act:     getSortedCompressionCandidates(deps, params, payload).
 * Assert:  effectiveScore === 5 (candidateTokens * 1).
 */
Deno.test("a relevance above 1 is clamped to 1", async () => {
  // Arrange
  const contentCounter: BoundCountTokensFn = (p, _mc) => {
    if (p.resourceDocuments && p.resourceDocuments.length > 0) return p.resourceDocuments[0].content.length;
    return 0;
  };
  const deps = buildGetSortedCompressionCandidatesDeps({ countTokens: contentCounter });
  const params = buildGetSortedCompressionCandidatesParams({
    inputsRelevance: [
      { document_key: FileType.business_case, type: 'document', relevance: 2 },
    ],
  });
  const payload = buildGetSortedCompressionCandidatesPayload({
    documents: [buildResourceDocument({ id: 'doc-1', content: '12345' })],
  });

  // Act
  const result = await getSortedCompressionCandidates(deps, params, payload);

  // Assert
  assert(!('error' in result), 'expected success arm');
  if (!('error' in result)) {
    assertEquals(result.candidates.length, 1);
    assertEquals(result.candidates[0].effectiveScore, 5);
  }
});

/**
 * Contract: given a relevance below 0, it is clamped to 0, so effectiveScore
 *   equals candidateTokens * 0 === 0.
 * Arrange: one document with content '12345' (5 chars); countTokens returns
 *   content length; relevance rule with relevance: -1.
 * Act:     getSortedCompressionCandidates(deps, params, payload).
 * Assert:  effectiveScore === 0 (candidateTokens * 0).
 */
Deno.test("a relevance below 0 is clamped to 0", async () => {
  // Arrange
  const contentCounter: BoundCountTokensFn = (p, _mc) => {
    if (p.resourceDocuments && p.resourceDocuments.length > 0) return p.resourceDocuments[0].content.length;
    return 0;
  };
  const deps = buildGetSortedCompressionCandidatesDeps({ countTokens: contentCounter });
  const params = buildGetSortedCompressionCandidatesParams({
    inputsRelevance: [
      { document_key: FileType.business_case, type: 'document', relevance: -1 },
    ],
  });
  const payload = buildGetSortedCompressionCandidatesPayload({
    documents: [buildResourceDocument({ id: 'doc-1', content: '12345' })],
  });

  // Act
  const result = await getSortedCompressionCandidates(deps, params, payload);

  // Assert
  assert(!('error' in result), 'expected success arm');
  if (!('error' in result)) {
    assertEquals(result.candidates.length, 1);
    assertEquals(result.candidates[0].effectiveScore, 0);
  }
});

/**
 * Contract: given two rules on the same key, the higher relevance wins.
 * Arrange: one document with content '12345' (5 chars); countTokens returns
 *   content length; two general rules with relevance 0.3 and 0.7 on the same key.
 * Act:     getSortedCompressionCandidates(deps, params, payload).
 * Assert:  effectiveScore === 5 * 0.7 === 3.5 (higher relevance wins).
 */
Deno.test("two rules on the same key resolve to the higher relevance", async () => {
  // Arrange
  const contentCounter: BoundCountTokensFn = (p, _mc) => {
    if (p.resourceDocuments && p.resourceDocuments.length > 0) return p.resourceDocuments[0].content.length;
    return 0;
  };
  const deps = buildGetSortedCompressionCandidatesDeps({ countTokens: contentCounter });
  const params = buildGetSortedCompressionCandidatesParams({
    inputsRelevance: [
      { document_key: FileType.business_case, type: 'document', relevance: 0.3 },
      { document_key: FileType.business_case, type: 'document', relevance: 0.7 },
    ],
  });
  const payload = buildGetSortedCompressionCandidatesPayload({
    documents: [buildResourceDocument({ id: 'doc-1', content: '12345' })],
  });

  // Act
  const result = await getSortedCompressionCandidates(deps, params, payload);

  // Assert
  assert(!('error' in result), 'expected success arm');
  if (!('error' in result)) {
    assertEquals(result.candidates.length, 1);
    assertEquals(result.candidates[0].effectiveScore, 3.5);
  }
});

/**
 * Contract: given a rejected document ahead of an admitted document in the
 *   array, the admitted document's originalIndex is its index in
 *   payload.documents, not its position among admitted candidates.
 * Arrange: two documents — 'rejected' at index 0 and 'admitted' at index 1;
 *   resolver rejects 'rejected' and admits 'admitted'.
 * Act:     getSortedCompressionCandidates(deps, params, payload).
 * Assert:  the admitted candidate's originalIndex === 1.
 */
Deno.test("originalIndex on an admitted document is its index in payload.documents", async () => {
  // Arrange
  const resolver: BoundResolveCompressionSourceFn = (_params, { document }) => {
    if (document.id === 'rejected') return buildNotCompressibleSourceReturn();
    return buildCompressibleSourceReturn();
  };
  const deps = buildGetSortedCompressionCandidatesDeps({ resolveCompressionSource: resolver });
  const params = buildGetSortedCompressionCandidatesParams();
  const payload = buildGetSortedCompressionCandidatesPayload({
    documents: [
      buildResourceDocument({ id: 'rejected', content: 'rejected' }),
      buildResourceDocument({ id: 'admitted', content: 'admitted' }),
    ],
  });

  // Act
  const result = await getSortedCompressionCandidates(deps, params, payload);

  // Assert
  assert(!('error' in result), 'expected success arm');
  if (!('error' in result)) {
    assertEquals(result.candidates.length, 1);
    assertEquals(result.candidates[0].originalIndex, 1);
  }
});

/**
 * Contract: given a mixed payload of documents and history, candidates are
 *   returned in ascending effectiveScore order, arranged so document and
 *   history candidates interleave.
 * Arrange: two admitted documents (effectiveScore 2.5 and 5 — doc-B unmatched
 *   gets avg([0.5]) / 2 = 0.25, doc-A matched gets 0.5) and two history
 *   candidates (effectiveScore 0 and 20); countTokens returns 10 for documents
 *   and 20 for messages.
 * Act:     getSortedCompressionCandidates(deps, params, payload).
 * Assert:  candidates are in ascending effectiveScore order; document and
 *   history candidates interleave (not all documents then all history).
 */
Deno.test("a mixed payload of documents and history returns candidates in ascending effectiveScore order", async () => {
  // Arrange
  const counter: BoundCountTokensFn = (p, _mc) => {
    if (p.messages && p.messages.length > 0) return 20;
    if (p.resourceDocuments && p.resourceDocuments.length > 0) return 10;
    return 0;
  };
  const deps = buildGetSortedCompressionCandidatesDeps({ countTokens: counter });
  const params = buildGetSortedCompressionCandidatesParams({
    inputsRelevance: [
      { document_key: FileType.business_case, type: 'document', relevance: 0.5 },
    ],
  });
  const history: Messages[] = [
    { id: 'msg-0', role: 'system', content: 'system prompt' },
    { id: 'msg-1', role: 'user', content: 'first user' },
    { id: 'msg-2', role: 'assistant', content: 'first assistant' },
    { id: 'msg-3', role: 'user', content: 'compressible 1' },
    { id: 'msg-4', role: 'assistant', content: 'compressible 2' },
    { id: 'msg-5', role: 'user', content: 'tail user 1' },
    { id: 'msg-6', role: 'assistant', content: 'tail assistant 1' },
    { id: 'msg-7', role: 'user', content: 'tail user 2' },
    { id: 'msg-8', role: 'assistant', content: 'tail assistant 2' },
  ];
  const payload = buildGetSortedCompressionCandidatesPayload({
    documents: [
      buildResourceDocument({ id: 'doc-A', content: 'A', document_key: FileType.business_case }),
      buildResourceDocument({ id: 'doc-B', content: 'B', document_key: FileType.feature_spec }),
    ],
    history,
  });

  // Act
  const result = await getSortedCompressionCandidates(deps, params, payload);

  // Assert
  assert(!('error' in result), 'expected success arm');
  if (!('error' in result)) {
    const scores = result.candidates.map(c => c.effectiveScore);
    for (let i = 0; i < scores.length - 1; i++) {
      assert(scores[i] <= scores[i + 1], `expected ascending order at index ${i}: ${scores[i]} <= ${scores[i + 1]}`);
    }
    const sourceTypes = result.candidates.map(c => c.sourceType);
    const hasDoc = sourceTypes.some(t => t !== 'history');
    const hasHistory = sourceTypes.some(t => t === 'history');
    assert(hasDoc && hasHistory, 'expected both document and history candidates');
    const firstHistoryIdx = sourceTypes.indexOf('history');
    const lastDocIdx = sourceTypes.map((t, i) => t !== 'history' ? i : -1).filter(i => i >= 0).pop() ?? -1;
    assert(firstHistoryIdx < lastDocIdx, 'expected interleaving (a history candidate before a document candidate)');
  }
});

/**
 * Contract: given a payload with documents and history, neither payload.documents
 *   nor payload.history is mutated after the call.
 * Arrange: one document and a history array; snapshots of both taken before the
 *   call.
 * Act:     getSortedCompressionCandidates(deps, params, payload).
 * Assert:  payload.documents deeply equals its snapshot; payload.history deeply
 *   equals its snapshot.
 */
Deno.test("neither payload.documents nor payload.history is mutated", async () => {
  // Arrange
  const deps = buildGetSortedCompressionCandidatesDeps();
  const params = buildGetSortedCompressionCandidatesParams();
  const history: Messages[] = [
    { id: 'msg-0', role: 'system', content: 'system prompt' },
    { id: 'msg-1', role: 'user', content: 'first user' },
    { id: 'msg-2', role: 'assistant', content: 'first assistant' },
    { id: 'msg-3', role: 'user', content: 'compressible' },
    { id: 'msg-4', role: 'assistant', content: 'tail 1' },
    { id: 'msg-5', role: 'user', content: 'tail 2' },
    { id: 'msg-6', role: 'assistant', content: 'tail 3' },
    { id: 'msg-7', role: 'user', content: 'tail 4' },
  ];
  const payload = buildGetSortedCompressionCandidatesPayload({
    documents: [buildResourceDocument({ id: 'doc-1', content: 'content' })],
    history,
  });
  const documentsSnapshot = payload.documents.map(d => ({ ...d }));
  const historySnapshot = payload.history.map(m => ({ ...m }));

  // Act
  await getSortedCompressionCandidates(deps, params, payload);

  // Assert
  assertEquals(payload.documents, documentsSnapshot);
  assertEquals(payload.history, historySnapshot);
});

// ---------------------------------------------------------------------------
// scoreHistory
// ---------------------------------------------------------------------------

/**
 * Contract: given a history with system at index 0, the immutable head (3) and
 *   tail (4) anchors are excluded from candidates, the compressible middle is
 *   included, and each candidate's effectiveScore equals candidateTokens *
 *   valueScore.
 * Arrange: 10-message history with system at [0]; countTokens returns 100 for
 *   every message.
 * Act:     scoreHistory(deps, params, history).
 * Assert:  candidates are msg-3, msg-4, msg-5 (indices 3-5); anchors are absent;
 *   each candidate's effectiveScore === 100 * valueScore.
 */
Deno.test("scoreHistory preserves correct anchors and assigns effectiveScore = candidateTokens * valueScore", () => {
  // Arrange
  const counter: BoundCountTokensFn = () => 100;
  const deps = buildGetSortedCompressionCandidatesDeps({ countTokens: counter });
  const params = buildGetSortedCompressionCandidatesParams();
  const history: Messages[] = [
    { id: 'msg-0', role: 'system', content: 'You are an architect.' },
    { id: 'msg-1', role: 'user', content: 'First user message.' },
    { id: 'msg-2', role: 'assistant', content: 'First assistant reply.' },
    { id: 'msg-3', role: 'user', content: 'Compressible message 1' },
    { id: 'msg-4', role: 'assistant', content: 'Compressible message 2' },
    { id: 'msg-5', role: 'user', content: 'Compressible message 3' },
    { id: 'msg-6', role: 'assistant', content: 'Second to last assistant reply.' },
    { id: 'msg-7', role: 'user', content: 'Second to last user reply.' },
    { id: 'msg-8', role: 'assistant', content: 'Last assistant reply.' },
    { id: 'msg-9', role: 'user', content: 'Last user reply.' },
  ];

  // Act
  const candidates = scoreHistory(deps, params, history);

  // Assert
  const candidateIds = new Set(candidates.map(c => c.id));
  assert(!candidateIds.has('msg-0'), 'System prompt should be immutable');
  assert(!candidateIds.has('msg-1'), 'First user should be immutable');
  assert(!candidateIds.has('msg-2'), 'First assistant should be immutable');
  assert(!candidateIds.has('msg-6'), 'Tail assistant should be immutable');
  assert(!candidateIds.has('msg-7'), 'Tail user should be immutable');
  assert(!candidateIds.has('msg-8'), 'Tail assistant should be immutable');
  assert(!candidateIds.has('msg-9'), 'Tail user should be immutable');
  assert(candidateIds.has('msg-3'), 'Middle message should be compressible');
  assert(candidateIds.has('msg-4'), 'Middle message should be compressible');
  assert(candidateIds.has('msg-5'), 'Middle message should be compressible');
  for (const candidate of candidates) {
    assertEquals(candidate.tokenCount, 100);
    assertEquals(candidate.effectiveScore, 100 * candidate.valueScore);
  }
});

/**
 * Contract: given a history with a non-alternating tail (two consecutive
 *   assistant messages), the user message at the start of the non-alternating
 *   tail is immutable, and the tail assistant messages remain immutable.
 * Arrange: 9-message history with system at [0], a compressible middle, and a
 *   non-alternating tail (user, assistant, assistant, user); countTokens returns
 *   100 for every message.
 * Act:     scoreHistory(deps, params, history).
 * Assert:  msg-6 (user at start of non-alternating tail) is immutable; msg-7,
 *   msg-8, msg-9 are immutable; msg-5 is compressible.
 */
Deno.test("scoreHistory preserves anchors with non-alternating tail roles", () => {
  // Arrange
  const counter: BoundCountTokensFn = () => 100;
  const deps = buildGetSortedCompressionCandidatesDeps({ countTokens: counter });
  const params = buildGetSortedCompressionCandidatesParams();
  const history: Messages[] = [
    { id: 'msg-0', role: 'system', content: 'You are an architect.' },
    { id: 'msg-1', role: 'user', content: 'First user message.' },
    { id: 'msg-2', role: 'assistant', content: 'First assistant reply.' },
    { id: 'msg-3', role: 'user', content: 'Compressible message 1' },
    { id: 'msg-4', role: 'assistant', content: 'Compressible message 2' },
    { id: 'msg-5', role: 'user', content: 'Compressible message 3' },
    { id: 'msg-6', role: 'user', content: 'This user message should be immutable.' },
    { id: 'msg-7', role: 'assistant', content: 'First assistant reply in tail.' },
    { id: 'msg-8', role: 'assistant', content: 'Second consecutive assistant reply in tail.' },
    { id: 'msg-9', role: 'user', content: 'Final user reply.' },
  ];

  // Act
  const candidates = scoreHistory(deps, params, history);
  const candidateIds = new Set(candidates.map(c => c.id));

  // Assert
  assert(!candidateIds.has('msg-6'), 'The user message at the start of a non-alternating tail (msg-6) must be immutable.');
  assert(!candidateIds.has('msg-7'), 'Tail assistant message (msg-7) should be immutable.');
  assert(!candidateIds.has('msg-8'), 'Tail assistant message (msg-8) should be immutable.');
  assert(!candidateIds.has('msg-9'), 'Tail user message (msg-9) should be immutable.');
  assert(candidateIds.has('msg-5'), 'Middle message (msg-5) should be compressible.');
});

/**
 * Contract: given a history too short to yield candidates (length <=
 *   immutableHeadCount + 4), no history candidate is produced.
 * Arrange: 6-message history with system at [0] (immutableHeadCount = 3,
 *   3 + 4 = 7 > 6); countTokens returns 100.
 * Act:     scoreHistory(deps, params, history).
 * Assert:  candidates.length === 0.
 */
Deno.test("scoreHistory returns empty when history is too short to yield candidates", () => {
  // Arrange
  const counter: BoundCountTokensFn = () => 100;
  const deps = buildGetSortedCompressionCandidatesDeps({ countTokens: counter });
  const params = buildGetSortedCompressionCandidatesParams();
  const history: Messages[] = [
    { id: 'msg-0', role: 'system', content: 'system' },
    { id: 'msg-1', role: 'user', content: 'user 1' },
    { id: 'msg-2', role: 'assistant', content: 'assistant 1' },
    { id: 'msg-3', role: 'user', content: 'user 2' },
    { id: 'msg-4', role: 'assistant', content: 'assistant 2' },
    { id: 'msg-5', role: 'user', content: 'user 3' },
  ];

  // Act
  const candidates = scoreHistory(deps, params, history);

  // Assert
  assertEquals(candidates.length, 0);
});
