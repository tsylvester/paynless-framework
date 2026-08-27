import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveCompressionSource } from './resolveCompressionSource.ts';
import { FileType } from '../../types/file_manager.types.ts';
import {
  isCompressibleSourceReturn,
  isNotCompressibleSourceReturn,
} from './resolveCompressionSource.guard.ts';
import {
  buildResolveCompressionSourceDeps,
  buildResolveCompressionSourceParams,
  buildResolveCompressionSourcePayload,
  buildResourceDocument,
} from './resolveCompressionSource.mock.ts';

/**
 * Contract: a 'document'-typed document is admitted and returns compressible: true
 *   with sourceType: 'resource' and the document's document_key.
 * Arrange: a payload whose document overrides type to 'document'.
 * Act:     resolveCompressionSource over deps, params, and the payload.
 * Assert:  the result is a CompressibleSourceReturn; compressible is true; sourceType is 'resource';
 *   documentKey is the document's document_key.
 */
Deno.test("'document'-typed document returns compressible true with sourceType 'resource'", () => {
  // Arrange
  const deps = buildResolveCompressionSourceDeps();
  const params = buildResolveCompressionSourceParams();
  const payload = buildResolveCompressionSourcePayload({
    document: buildResourceDocument({ type: 'document' }),
  });

  // Act
  const result = resolveCompressionSource(deps, params, payload);

  // Assert
  assertEquals(isCompressibleSourceReturn(result), true);
  if (isCompressibleSourceReturn(result)) {
    assertEquals(result.compressible, true);
    assertEquals(result.sourceType, 'resource');
    assertEquals(result.documentKey, payload.document.document_key);
  }
});

/**
 * Contract: a 'project_resource'-typed document is admitted and returns compressible: true
 *   with sourceType: 'resource' and the document's document_key.
 * Arrange: a payload whose document overrides type to 'project_resource'.
 * Act:     resolveCompressionSource over deps, params, and the payload.
 * Assert:  the result is a CompressibleSourceReturn; compressible is true; sourceType is 'resource';
 *   documentKey is the document's document_key.
 */
Deno.test("'project_resource'-typed document returns compressible true with sourceType 'resource'", () => {
  // Arrange
  const deps = buildResolveCompressionSourceDeps();
  const params = buildResolveCompressionSourceParams();
  const payload = buildResolveCompressionSourcePayload({
    document: buildResourceDocument({ type: 'project_resource' }),
  });

  // Act
  const result = resolveCompressionSource(deps, params, payload);

  // Assert
  assertEquals(isCompressibleSourceReturn(result), true);
  if (isCompressibleSourceReturn(result)) {
    assertEquals(result.compressible, true);
    assertEquals(result.sourceType, 'resource');
    assertEquals(result.documentKey, payload.document.document_key);
  }
});

/**
 * Contract: a 'feedback'-typed document is admitted and returns compressible: true
 *   with sourceType: 'feedback' and the document's document_key.
 * Arrange: a payload whose document overrides type to 'feedback'.
 * Act:     resolveCompressionSource over deps, params, and the payload.
 * Assert:  the result is a CompressibleSourceReturn; compressible is true; sourceType is 'feedback';
 *   documentKey is the document's document_key.
 */
Deno.test("'feedback'-typed document returns compressible true with sourceType 'feedback'", () => {
  // Arrange
  const deps = buildResolveCompressionSourceDeps();
  const params = buildResolveCompressionSourceParams();
  const payload = buildResolveCompressionSourcePayload({
    document: buildResourceDocument({ type: 'feedback' }),
  });

  // Act
  const result = resolveCompressionSource(deps, params, payload);

  // Assert
  assertEquals(isCompressibleSourceReturn(result), true);
  if (isCompressibleSourceReturn(result)) {
    assertEquals(result.compressible, true);
    assertEquals(result.sourceType, 'feedback');
    assertEquals(result.documentKey, payload.document.document_key);
  }
});

/**
 * Contract: a 'seed_prompt'-typed document is excluded and returns compressible: false.
 * Arrange: a payload whose document overrides type to 'seed_prompt'.
 * Act:     resolveCompressionSource over deps, params, and the payload.
 * Assert:  the result is a NotCompressibleSourceReturn; compressible is false.
 */
Deno.test("'seed_prompt'-typed document returns compressible false", () => {
  // Arrange
  const deps = buildResolveCompressionSourceDeps();
  const params = buildResolveCompressionSourceParams();
  const payload = buildResolveCompressionSourcePayload({
    document: buildResourceDocument({ type: 'seed_prompt' }),
  });

  // Act
  const result = resolveCompressionSource(deps, params, payload);

  // Assert
  assertEquals(isNotCompressibleSourceReturn(result), true);
  if (isNotCompressibleSourceReturn(result)) {
    assertEquals(result.compressible, false);
  }
});

/**
 * Contract: a 'header_context'-typed document is excluded and returns compressible: false.
 * Arrange: a payload whose document overrides type to 'header_context'.
 * Act:     resolveCompressionSource over deps, params, and the payload.
 * Assert:  the result is a NotCompressibleSourceReturn; compressible is false.
 */
Deno.test("'header_context'-typed document returns compressible false", () => {
  // Arrange
  const deps = buildResolveCompressionSourceDeps();
  const params = buildResolveCompressionSourceParams();
  const payload = buildResolveCompressionSourcePayload({
    document: buildResourceDocument({ type: 'header_context' }),
  });

  // Act
  const result = resolveCompressionSource(deps, params, payload);

  // Assert
  assertEquals(isNotCompressibleSourceReturn(result), true);
  if (isNotCompressibleSourceReturn(result)) {
    assertEquals(result.compressible, false);
  }
});

/**
 * Contract: a 'contribution'-typed document is excluded and returns compressible: false.
 * Arrange: a payload whose document overrides type to 'contribution'.
 * Act:     resolveCompressionSource over deps, params, and the payload.
 * Assert:  the result is a NotCompressibleSourceReturn; compressible is false.
 */
Deno.test("'contribution'-typed document returns compressible false", () => {
  // Arrange
  const deps = buildResolveCompressionSourceDeps();
  const params = buildResolveCompressionSourceParams();
  const payload = buildResolveCompressionSourcePayload({
    document: buildResourceDocument({ type: 'contribution' }),
  });

  // Act
  const result = resolveCompressionSource(deps, params, payload);

  // Assert
  assertEquals(isNotCompressibleSourceReturn(result), true);
  if (isNotCompressibleSourceReturn(result)) {
    assertEquals(result.compressible, false);
  }
});

/**
 * Contract: documentKey is the document's own document_key, not the builder's default.
 * Arrange: a payload whose document overrides document_key to FileType.technical_approach
 *   while the builder's default is FileType.business_case.
 * Act:     resolveCompressionSource over deps, params, and the payload.
 * Assert:  the result is a CompressibleSourceReturn; documentKey is the overridden
 *   FileType.technical_approach.
 */
Deno.test("documentKey is the document's own document_key, not the builder default", () => {
  // Arrange
  const deps = buildResolveCompressionSourceDeps();
  const params = buildResolveCompressionSourceParams();
  const payload = buildResolveCompressionSourcePayload({
    document: buildResourceDocument({ document_key: FileType.technical_approach }),
  });

  // Act
  const result = resolveCompressionSource(deps, params, payload);

  // Assert
  assertEquals(isCompressibleSourceReturn(result), true);
  if (isCompressibleSourceReturn(result)) {
    assertEquals(result.documentKey, FileType.technical_approach);
  }
});

/**
 * Contract: payload.document is read and never written — unchanged after the call.
 * Arrange: a payload built from a document with a known type, plus a separately built
 *   copy of that document for deep comparison.
 * Act:     resolveCompressionSource over deps, params, and the payload.
 * Assert:  payload.document is deep-equal to the separately built copy.
 */
Deno.test("payload.document is unchanged after the call", () => {
  // Arrange
  const deps = buildResolveCompressionSourceDeps();
  const params = buildResolveCompressionSourceParams();
  const document = buildResourceDocument({ type: 'document' });
  const payload = buildResolveCompressionSourcePayload({ document });
  const snapshot = buildResourceDocument({ type: 'document' });

  // Act
  resolveCompressionSource(deps, params, payload);

  // Assert
  assertEquals(payload.document, snapshot);
});
