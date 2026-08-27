import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  isResourceDocument,
  isCompressibleInputRuleType,
  isResolveCompressionSourceDeps,
  isResolveCompressionSourceParams,
  isResolveCompressionSourcePayload,
  isCompressibleSourceReturn,
  isNotCompressibleSourceReturn,
  isResolveCompressionSourceSuccessReturn,
  isResolveCompressionSourceErrorReturn,
} from './resolveCompressionSource.guard.ts';
import {
  buildResourceDocument,
  invalidateResourceDocument,
  buildResolveCompressionSourceDeps,
  invalidateResolveCompressionSourceDeps,
  buildResolveCompressionSourceParams,
  invalidateResolveCompressionSourceParams,
  buildResolveCompressionSourcePayload,
  invalidateResolveCompressionSourcePayload,
  buildCompressibleSourceReturn,
  invalidateCompressibleSourceReturn,
  buildNotCompressibleSourceReturn,
  invalidateNotCompressibleSourceReturn,
  buildResolveCompressionSourceErrorReturn,
  invalidateResolveCompressionSourceErrorReturn,
} from './resolveCompressionSource.mock.ts';

/** the builder's valid default is accepted. */
Deno.test('isResourceDocument accepts the valid default', () => {
  assert(isResourceDocument(buildResourceDocument()));
});

/** valid overrides for each InputRule['type'] member are accepted. */
Deno.test('isResourceDocument accepts valid overrides for each InputRule type member', () => {
  assert(isResourceDocument(buildResourceDocument({ type: 'document' })));
  assert(isResourceDocument(buildResourceDocument({ type: 'feedback' })));
  assert(isResourceDocument(buildResourceDocument({ type: 'header_context' })));
  assert(isResourceDocument(buildResourceDocument({ type: 'seed_prompt' })));
  assert(isResourceDocument(buildResourceDocument({ type: 'project_resource' })));
  assert(isResourceDocument(buildResourceDocument({ type: 'contribution' })));
});

/** a plain OutboundDocument missing identity fields is rejected. */
Deno.test('isResourceDocument rejects a plain OutboundDocument', () => {
  assert(!isResourceDocument({ id: 'doc-1', content: 'Hello' }));
});

/** each required property, omitted in turn, is rejected. */
Deno.test('isResourceDocument rejects each omitted required property', () => {
  const { id: _id, ...missingId } = buildResourceDocument();
  assert(!isResourceDocument(missingId));
  const { content: _content, ...missingContent } = buildResourceDocument();
  assert(!isResourceDocument(missingContent));
  const { document_key: _dk, ...missingDocumentKey } = buildResourceDocument();
  assert(!isResourceDocument(missingDocumentKey));
  const { stage_slug: _ss, ...missingStageSlug } = buildResourceDocument();
  assert(!isResourceDocument(missingStageSlug));
  const { type: _t, ...missingType } = buildResourceDocument();
  assert(!isResourceDocument(missingType));
});

/** each identity property, corrupted in turn, is rejected. */
Deno.test('isResourceDocument rejects each corrupted identity property', () => {
  assert(!isResourceDocument(invalidateResourceDocument({ document_key: 'not-a-file-type' })));
  assert(!isResourceDocument(invalidateResourceDocument({ stage_slug: 123 })));
  assert(!isResourceDocument(invalidateResourceDocument({ type: 'not-a-rule-type' })));
});

/** a type outside the union is rejected. */
Deno.test('isResourceDocument rejects a type outside the union', () => {
  assert(!isResourceDocument(invalidateResourceDocument({ type: 'rendered_document' })));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test('isResourceDocument rejects non-objects', () => {
  for (const x of [null, undefined, 7, 'x', []]) assert(!isResourceDocument(x));
});

/** each admitted member is accepted. */
Deno.test('isCompressibleInputRuleType accepts admitted members', () => {
  assert(isCompressibleInputRuleType('document'));
  assert(isCompressibleInputRuleType('feedback'));
  assert(isCompressibleInputRuleType('project_resource'));
});

/** each excluded member is rejected. */
Deno.test('isCompressibleInputRuleType rejects excluded members', () => {
  assert(!isCompressibleInputRuleType('seed_prompt'));
  assert(!isCompressibleInputRuleType('header_context'));
  assert(!isCompressibleInputRuleType('contribution'));
});

/** null, undefined, a number, an empty string, and an array are rejected. */
Deno.test('isCompressibleInputRuleType rejects non-admitted values', () => {
  for (const x of [null, undefined, 7, '', []]) assert(!isCompressibleInputRuleType(x));
});

/** the builder's valid default is accepted. */
Deno.test('isResolveCompressionSourceDeps accepts the valid default', () => {
  assert(isResolveCompressionSourceDeps(buildResolveCompressionSourceDeps()));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test('isResolveCompressionSourceDeps rejects non-objects', () => {
  for (const x of [null, undefined, 7, 'x', []]) assert(!isResolveCompressionSourceDeps(x));
});

/** a missing logger is rejected. */
Deno.test('isResolveCompressionSourceDeps rejects a missing logger', () => {
  const { logger: _l, ...missingLogger } = buildResolveCompressionSourceDeps();
  assert(!isResolveCompressionSourceDeps(missingLogger));
});

/** a corrupted logger is rejected. */
Deno.test('isResolveCompressionSourceDeps rejects a corrupted logger', () => {
  assert(!isResolveCompressionSourceDeps(invalidateResolveCompressionSourceDeps({ logger: 'not-a-logger' })));
});

/** the builder's empty default is accepted. */
Deno.test('isResolveCompressionSourceParams accepts the valid default', () => {
  assert(isResolveCompressionSourceParams(buildResolveCompressionSourceParams()));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test('isResolveCompressionSourceParams rejects non-objects', () => {
  for (const x of [null, undefined, 7, 'x', []]) assert(!isResolveCompressionSourceParams(x));
});

/** an unexpected key is rejected. */
Deno.test('isResolveCompressionSourceParams rejects an unexpected key', () => {
  assert(!isResolveCompressionSourceParams(invalidateResolveCompressionSourceParams({ unexpected: 1 })));
});

/** the builder's valid default is accepted. */
Deno.test('isResolveCompressionSourcePayload accepts the valid default', () => {
  assert(isResolveCompressionSourcePayload(buildResolveCompressionSourcePayload()));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test('isResolveCompressionSourcePayload rejects non-objects', () => {
  for (const x of [null, undefined, 7, 'x', []]) assert(!isResolveCompressionSourcePayload(x));
});

/** a missing document is rejected. */
Deno.test('isResolveCompressionSourcePayload rejects a missing document', () => {
  const { document: _d, ...missingDocument } = buildResolveCompressionSourcePayload();
  assert(!isResolveCompressionSourcePayload(missingDocument));
});

/** a corrupted document is rejected. */
Deno.test('isResolveCompressionSourcePayload rejects a corrupted document', () => {
  assert(!isResolveCompressionSourcePayload(invalidateResolveCompressionSourcePayload({ document: null })));
});

/** the builder's valid default is accepted. */
Deno.test('isCompressibleSourceReturn accepts the valid default', () => {
  assert(isCompressibleSourceReturn(buildCompressibleSourceReturn()));
});

/** each property, corrupted in turn, is rejected. */
Deno.test('isCompressibleSourceReturn rejects each corrupted property', () => {
  assert(!isCompressibleSourceReturn(invalidateCompressibleSourceReturn({ compressible: false })));
  assert(!isCompressibleSourceReturn(invalidateCompressibleSourceReturn({ sourceType: 'nope' })));
  assert(!isCompressibleSourceReturn(invalidateCompressibleSourceReturn({ documentKey: 'not-a-file-type' })));
});

/** each required property, omitted in turn, is rejected. */
Deno.test('isCompressibleSourceReturn rejects each omitted required property', () => {
  const { compressible: _c, ...missingCompressible } = buildCompressibleSourceReturn();
  assert(!isCompressibleSourceReturn(missingCompressible));
  const { sourceType: _s, ...missingSourceType } = buildCompressibleSourceReturn();
  assert(!isCompressibleSourceReturn(missingSourceType));
  const { documentKey: _d, ...missingDocumentKey } = buildCompressibleSourceReturn();
  assert(!isCompressibleSourceReturn(missingDocumentKey));
});

/** the builder's valid default is accepted. */
Deno.test('isNotCompressibleSourceReturn accepts the valid default', () => {
  assert(isNotCompressibleSourceReturn(buildNotCompressibleSourceReturn()));
});

/** compressible: true is rejected. */
Deno.test('isNotCompressibleSourceReturn rejects compressible true', () => {
  assert(!isNotCompressibleSourceReturn(invalidateNotCompressibleSourceReturn({ compressible: true })));
});

/** the omitted property is rejected. */
Deno.test('isNotCompressibleSourceReturn rejects the omitted property', () => {
  const { compressible: _c, ...missingCompressible } = buildNotCompressibleSourceReturn();
  assert(!isNotCompressibleSourceReturn(missingCompressible));
});

/** both flavor builders are accepted. */
Deno.test('isResolveCompressionSourceSuccessReturn accepts both flavor builders', () => {
  assert(isResolveCompressionSourceSuccessReturn(buildCompressibleSourceReturn()));
  assert(isResolveCompressionSourceSuccessReturn(buildNotCompressibleSourceReturn()));
});

/** the error-return builder is rejected. */
Deno.test('isResolveCompressionSourceSuccessReturn rejects the error-return builder', () => {
  assert(!isResolveCompressionSourceSuccessReturn(buildResolveCompressionSourceErrorReturn()));
});

/** the builder's valid default is accepted. */
Deno.test('isResolveCompressionSourceErrorReturn accepts the valid default', () => {
  assert(isResolveCompressionSourceErrorReturn(buildResolveCompressionSourceErrorReturn()));
});

/** a string error is rejected. */
Deno.test('isResolveCompressionSourceErrorReturn rejects a string error', () => {
  assert(!isResolveCompressionSourceErrorReturn(invalidateResolveCompressionSourceErrorReturn({ error: 'a string' })));
});

/** a string retriable is rejected. */
Deno.test('isResolveCompressionSourceErrorReturn rejects a string retriable', () => {
  assert(!isResolveCompressionSourceErrorReturn(invalidateResolveCompressionSourceErrorReturn({ retriable: 'no' })));
});

/** each required property, omitted in turn, is rejected. */
Deno.test('isResolveCompressionSourceErrorReturn rejects each omitted required property', () => {
  const { error: _e, ...missingError } = buildResolveCompressionSourceErrorReturn();
  assert(!isResolveCompressionSourceErrorReturn(missingError));
  const { retriable: _r, ...missingRetriable } = buildResolveCompressionSourceErrorReturn();
  assert(!isResolveCompressionSourceErrorReturn(missingRetriable));
});
