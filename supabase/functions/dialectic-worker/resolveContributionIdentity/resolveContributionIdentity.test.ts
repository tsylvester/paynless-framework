import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { FileType, DialecticStageSlug } from "../../_shared/types/file_manager.types.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";
import { buildUnifiedAIResponse } from "../../_shared/dialectic.mock.ts";
import { resolveContributionIdentity } from "./resolveContributionIdentity.ts";
import {
  isResolveContributionIdentitySuccessReturn,
  isResolveContributionIdentityErrorReturn,
  isResolveContributionIdentityDocumentKeyError,
  isResolveContributionIdentityProviderIdentifierError,
  isResolveContributionIdentityRelationshipsError,
  isResolveContributionIdentityContinuationCountError,
  isResolveContributionIdentityRawProviderResponseError,
  isResolveContributionIdentitySourceGroupError,
  isResolveContributionIdentityRecipeStepReadError,
} from "./resolveContributionIdentity.guard.ts";
import {
  createMockJobRow,
  saveResponseTestPayloadDocumentArtifact,
} from "../saveResponse/saveResponse.mock.ts";
import {
  buildResolveContributionIdentityDeps,
  buildResolveContributionIdentityParams,
  buildResolveContributionIdentityPayload,
  invalidateResolveContributionIdentityPayload,
} from "./resolveContributionIdentity.mock.ts";
import { DialecticExecuteJobPayload } from "../../dialectic-service/dialectic.interface.ts";

// --- Description composition ---

/**
 * Contract: given a payload whose output_type, stageSlug and provider name are three
 *   distinct values, the description contains all three in the source's order.
 * Arrange: payload with output_type feature_spec and stageSlug antithesis; params with
 *   providerRow name "Test Provider" — three values distinct from each other.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  the success arm's description equals the independent literal.
 */
Deno.test("description composes output_type, stageSlug and provider name in source order", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams({
    providerRow: buildMockProvider({ name: "Test Provider" }),
  });
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.feature_spec,
    stageSlug: "antithesis",
    document_relationships: { source_group: "a1b2c3d4-e5f6-7890-abcd-ef0123456789" },
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentitySuccessReturn(result));
  assertEquals(result.description, "feature_spec for stage 'antithesis' by model Test Provider");
});

// --- Canonical assembly ---

/**
 * Contract: given a payload carrying all five optional canonical members, restOfCanonicalPathParams
 *   yields all five, plus the two required members.
 * Arrange: payload with canonicalPathParams carrying contributionType synthesis (distinct from
 *   stageSlug thesis) and all five optionals populated.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  restOfCanonicalPathParams has exactly seven keys; contributionType equals the payload's.
 */
Deno.test("canonical assembly carries all five optional members when present", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams();
  const payload = buildResolveContributionIdentityPayload({
    canonicalPathParams: {
      contributionType: "synthesis",
      stageSlug: DialecticStageSlug.Thesis,
      sourceModelSlugs: ["model-a", "model-b"],
      sourceAnchorType: "thesis",
      sourceAnchorModelSlug: "claude-3-opus",
      sourceAttemptCount: 2,
      pairedModelSlug: "gemini-1.5-pro",
    },
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentitySuccessReturn(result));
  assertEquals(Object.keys(result.restOfCanonicalPathParams).length, 7);
  assertEquals(result.restOfCanonicalPathParams.contributionType, "synthesis");
  assertEquals(result.restOfCanonicalPathParams.sourceModelSlugs, ["model-a", "model-b"]);
  assertEquals(result.restOfCanonicalPathParams.sourceAnchorType, "thesis");
  assertEquals(result.restOfCanonicalPathParams.sourceAnchorModelSlug, "claude-3-opus");
  assertEquals(result.restOfCanonicalPathParams.sourceAttemptCount, 2);
  assertEquals(result.restOfCanonicalPathParams.pairedModelSlug, "gemini-1.5-pro");
});

/**
 * Contract: given a payload carrying no optional canonical members, restOfCanonicalPathParams
 *   has only contributionType and stageSlug.
 * Arrange: payload with canonicalPathParams carrying contributionType synthesis (distinct from
 *   stageSlug thesis) and no optionals.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  restOfCanonicalPathParams has exactly two keys; contributionType equals the payload's.
 */
Deno.test("canonical assembly carries only required members when no optionals present", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams();
  const payload = buildResolveContributionIdentityPayload({
    canonicalPathParams: {
      contributionType: "synthesis",
      stageSlug: DialecticStageSlug.Thesis,
    },
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentitySuccessReturn(result));
  assertEquals(Object.keys(result.restOfCanonicalPathParams).length, 2);
  assertEquals(result.restOfCanonicalPathParams.contributionType, "synthesis");
});

// --- Anchor log ---

/**
 * Contract: given a payload carrying sourceAnchorModelSlug, logger.info is called exactly once
 *   with that slug in its metadata.
 * Arrange: deps with a MockLogger spied on info; payload with sourceAnchorModelSlug set.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  info spy was called exactly once; the call's args include the slug.
 */
Deno.test("anchor log fires when sourceAnchorModelSlug is present", async () => {
  // Arrange
  const mockLogger = new MockLogger();
  const infoSpy = spy(mockLogger, "info");
  const deps = buildResolveContributionIdentityDeps({ logger: mockLogger });
  const params = buildResolveContributionIdentityParams();
  const payload = buildResolveContributionIdentityPayload({
    canonicalPathParams: {
      contributionType: "thesis",
      stageSlug: DialecticStageSlug.Thesis,
      sourceAnchorModelSlug: "claude-3-opus",
    },
  });

  // Act
  await resolveContributionIdentity(deps, params, payload);

  // Assert
  assertEquals(infoSpy.calls.length, 1);
  const metadata = infoSpy.calls[0].args[1];
  assert(
    typeof metadata === "object" && metadata !== null && "sourceAnchorModelSlug" in metadata,
  );
  assertEquals(metadata.sourceAnchorModelSlug, "claude-3-opus");
});

/**
 * Contract: given a payload carrying no sourceAnchorModelSlug, logger.info is never called.
 * Arrange: deps with a MockLogger spied on info; payload with no sourceAnchorModelSlug.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  info spy was called zero times.
 */
Deno.test("anchor log does not fire when sourceAnchorModelSlug is absent", async () => {
  // Arrange
  const mockLogger = new MockLogger();
  const infoSpy = spy(mockLogger, "info");
  const deps = buildResolveContributionIdentityDeps({ logger: mockLogger });
  const params = buildResolveContributionIdentityParams();
  const payload = buildResolveContributionIdentityPayload();

  // Act
  await resolveContributionIdentity(deps, params, payload);

  // Assert
  assertEquals(infoSpy.calls.length, 0);
});

// --- Target precedence ---

/**
 * Contract: given a payload whose target_contribution_id is a non-empty string, the success
 *   arm's targetContributionId equals the payload's value, not the row's.
 * Arrange: payload with target_contribution_id "from-payload"; params with job row
 *   target_contribution_id "from-row" — two distinct values.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  targetContributionId equals "from-payload"; isContinuationForStorage is true.
 */
Deno.test("target precedence: payload value wins over row value", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams({
    job: createMockJobRow(saveResponseTestPayloadDocumentArtifact, { target_contribution_id: "from-row" }),
  });
  const payload = buildResolveContributionIdentityPayload({
    target_contribution_id: "from-payload",
    document_relationships: { thesis: "contrib-1" },
    continuation_count: 1,
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentitySuccessReturn(result));
  assertEquals(result.targetContributionId, "from-payload");
  assertEquals(result.isContinuationForStorage, true);
});

/**
 * Contract: given a payload with no target_contribution_id and a job row whose
 *   target_contribution_id is a non-empty string, the success arm's targetContributionId
 *   equals the row's value.
 * Arrange: payload with no target_contribution_id; params with job row
 *   target_contribution_id "from-row".
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  targetContributionId equals "from-row"; isContinuationForStorage is true.
 */
Deno.test("target precedence: row value used when payload absent", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams({
    job: createMockJobRow(saveResponseTestPayloadDocumentArtifact, { target_contribution_id: "from-row" }),
  });
  const payload = buildResolveContributionIdentityPayload({
    document_relationships: { thesis: "contrib-1" },
    continuation_count: 1,
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentitySuccessReturn(result));
  assertEquals(result.targetContributionId, "from-row");
  assertEquals(result.isContinuationForStorage, true);
});

/**
 * Contract: given neither payload nor row carrying target_contribution_id, the success arm
 *   has no targetContributionId and isContinuationForStorage is false.
 * Arrange: payload with no target_contribution_id; params with job row
 *   target_contribution_id null.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  targetContributionId is absent; isContinuationForStorage is false.
 */
Deno.test("target precedence: both absent yields no target and no continuation", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams();
  const payload = buildResolveContributionIdentityPayload();

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentitySuccessReturn(result));
  assertEquals(result.targetContributionId, undefined);
  assertEquals(result.isContinuationForStorage, false);
});

// --- Continuation invariants ---

/**
 * Contract: given a continuation (targetContributionId set) whose document_relationships is
 *   absent, the error arm carries ResolveContributionIdentityRelationshipsError with retriable false.
 * Arrange: payload with target_contribution_id set and no document_relationships.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is RelationshipsError; retriable is false.
 */
Deno.test("continuation with no document_relationships returns RelationshipsError", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams();
  const payload = buildResolveContributionIdentityPayload({
    target_contribution_id: "contrib-target-1",
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentityRelationshipsError(result.error));
  assertEquals(result.retriable, false);
});

/**
 * Contract: given a continuation whose continuation_count is absent, the error arm carries
 *   ResolveContributionIdentityContinuationCountError with retriable false.
 * Arrange: payload with target_contribution_id set, valid document_relationships, no
 *   continuation_count.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is ContinuationCountError; retriable is false.
 */
Deno.test("continuation with absent continuation_count returns ContinuationCountError", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams();
  const payload = buildResolveContributionIdentityPayload({
    target_contribution_id: "contrib-target-1",
    document_relationships: { thesis: "contrib-1" },
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentityContinuationCountError(result.error));
  assertEquals(result.retriable, false);
});

/**
 * Contract: given a continuation whose continuation_count is zero, the error arm carries
 *   ResolveContributionIdentityContinuationCountError with retriable false.
 * Arrange: payload with target_contribution_id set, valid document_relationships,
 *   continuation_count 0.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is ContinuationCountError; retriable is false.
 */
Deno.test("continuation with zero continuation_count returns ContinuationCountError", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams();
  const payload = buildResolveContributionIdentityPayload({
    target_contribution_id: "contrib-target-1",
    document_relationships: { thesis: "contrib-1" },
    continuation_count: 0,
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentityContinuationCountError(result.error));
  assertEquals(result.retriable, false);
});

// --- Raw provider precondition ---

/**
 * Contract: given a params whose aiResponse.rawProviderResponse is absent, the error arm
 *   carries ResolveContributionIdentityRawProviderResponseError with retriable false.
 * Arrange: params with aiResponse carrying no rawProviderResponse.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is RawProviderResponseError; retriable is false.
 */
Deno.test("raw provider absent returns RawProviderResponseError", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams({
    aiResponse: buildUnifiedAIResponse(),
  });
  const payload = buildResolveContributionIdentityPayload();

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentityRawProviderResponseError(result.error));
  assertEquals(result.retriable, false);
});

/**
 * Contract: given a params whose aiResponse.rawProviderResponse fails isJson, the error arm
 *   carries ResolveContributionIdentityRawProviderResponseError with retriable false.
 * Arrange: params with aiResponse carrying a rawProviderResponse that is not JSON-compatible.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is RawProviderResponseError; retriable is false.
 */
Deno.test("raw provider failing isJson returns RawProviderResponseError", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams({
    aiResponse: buildUnifiedAIResponse({
      rawProviderResponse: { bad: () => 1 },
    }),
  });
  const payload = buildResolveContributionIdentityPayload();

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentityRawProviderResponseError(result.error));
  assertEquals(result.retriable, false);
});

/**
 * Contract: given a valid rawProviderResponse but an invalid document_key on a document-related
 *   output, the error arm carries the DocumentKeyError, proving the raw provider check passes
 *   before the document invariant runs.
 * Arrange: params with valid rawProviderResponse; payload with document-related output_type
 *   and document_key null.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is DocumentKeyError; retriable is false.
 */
Deno.test("raw provider passes and document_key null yields DocumentKeyError", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams();
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.business_case,
    document_key: null,
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentityDocumentKeyError(result.error));
  assertEquals(result.retriable, false);
});

/**
 * Contract: given an invalid rawProviderResponse but a valid document_key on a document-related
 *   output, the error arm carries the RawProviderResponseError, proving the raw provider check
 *   runs before the document invariant.
 * Arrange: params with no rawProviderResponse; payload with document-related output_type
 *   and valid document_key.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is RawProviderResponseError; retriable is false.
 */
Deno.test("raw provider absent with valid document_key still yields RawProviderResponseError", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams({
    aiResponse: buildUnifiedAIResponse(),
  });
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.business_case,
    document_key: FileType.business_case,
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentityRawProviderResponseError(result.error));
  assertEquals(result.retriable, false);
});

// --- Document invariants ---

/**
 * Contract: given a document-related output whose document_key is null, the error arm carries
 *   ResolveContributionIdentityDocumentKeyError with retriable false.
 * Arrange: payload with output_type business_case and document_key null.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is DocumentKeyError; retriable is false.
 */
Deno.test("document_key null on document output returns DocumentKeyError", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams();
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.business_case,
    document_key: null,
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentityDocumentKeyError(result.error));
  assertEquals(result.retriable, false);
});

/**
 * Contract: given a document-related output whose document_key is empty after trim, the error
 *   arm carries ResolveContributionIdentityDocumentKeyError with retriable false.
 * Arrange: payload with output_type business_case and document_key "   ".
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is DocumentKeyError; retriable is false.
 */
Deno.test("document_key empty after trim on document output returns DocumentKeyError", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams();
  const payload = invalidateResolveContributionIdentityPayload({
    output_type: FileType.business_case,
    document_key: "   " as FileType,
  }) as DialecticExecuteJobPayload;

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentityDocumentKeyError(result.error));
  assertEquals(result.retriable, false);
});

/**
 * Contract: given a document-related output whose providerRow.api_identifier is empty after
 *   trim, the error arm carries ResolveContributionIdentityProviderIdentifierError with
 *   retriable false.
 * Arrange: params with providerRow api_identifier "   "; payload with document-related
 *   output_type and valid document_key.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is ProviderIdentifierError; retriable is false.
 */
Deno.test("empty api_identifier on document output returns ProviderIdentifierError", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams({
    providerRow: buildMockProvider({ api_identifier: "   " }),
  });
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.business_case,
    document_key: FileType.business_case,
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentityProviderIdentifierError(result.error));
  assertEquals(result.retriable, false);
});

/**
 * Contract: given a non-document output carrying none of the document invariant values, the
 *   success arm is returned, proving the invariants are gated on the classification.
 * Arrange: payload with output_type HeaderContext (not document-related) and no document_key.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  success arm.
 */
Deno.test("non-document output skips document invariants and returns success", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams();
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.HeaderContext,
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentitySuccessReturn(result));
});

// --- Storage selection ---

/**
 * Contract: given an output_type passing isDocumentKey, storageFileType is
 *   FileType.ModelContributionRawJson.
 * Arrange: payload with output_type business_case (a DocumentKey), valid document_key, and
 *   document_relationships with a source_group so the source group check passes.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  success arm; storageFileType equals FileType.ModelContributionRawJson.
 */
Deno.test("storage selection: isDocumentKey output yields ModelContributionRawJson", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams();
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.business_case,
    document_key: FileType.business_case,
    document_relationships: { source_group: "a1b2c3d4-e5f6-7890-abcd-ef0123456789" },
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentitySuccessReturn(result));
  assertEquals(result.storageFileType, FileType.ModelContributionRawJson);
});

/**
 * Contract: given an output_type that does not pass isDocumentKey, storageFileType is the
 *   output_type unchanged.
 * Arrange: payload with output_type HeaderContext (not a DocumentKey, not document-related).
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  success arm; storageFileType equals FileType.HeaderContext.
 */
Deno.test("storage selection: non-DocumentKey output yields output_type unchanged", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams();
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.HeaderContext,
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentitySuccessReturn(result));
  assertEquals(result.storageFileType, FileType.HeaderContext);
});

// --- Source group present ---

/**
 * Contract: given a document output carrying a source_group string, the success arm carries
 *   sourceGroupFragment set to the first eight sanitized characters, and no read is performed.
 * Arrange: payload with output_type business_case, valid document_key, and
 *   document_relationships.source_group "a1b2c3d4-e5f6-7890-abcd-ef0123456789"; params with
 *   a mock client whose fromSpy tracks reads.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  success arm; sourceGroupFragment equals "a1b2c3d4"; fromSpy called zero times.
 */
Deno.test("source group present yields fragment and performs no read", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const mockSetup = createMockSupabaseClient("source-group-present");
  const params = buildResolveContributionIdentityParams({
    dbClient: mockSetup.client as unknown as SupabaseClient<Database>,
  });
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.business_case,
    document_key: FileType.business_case,
    document_relationships: { source_group: "a1b2c3d4-e5f6-7890-abcd-ef0123456789" },
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentitySuccessReturn(result));
  assertEquals(result.sourceGroupFragment, "a1b2c3d4");
  assertEquals(mockSetup.spies.fromSpy.calls.length, 0);
});

// --- Source group absent ---

/**
 * Contract: given a document output whose document_relationships is absent, the error arm
 *   carries ResolveContributionIdentitySourceGroupError with retriable false, and no read
 *   is performed.
 * Arrange: payload with output_type business_case, valid document_key, no
 *   document_relationships; params with a mock client whose fromSpy tracks reads.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is SourceGroupError; retriable is false; fromSpy called zero times.
 */
Deno.test("source group absent with no document_relationships returns SourceGroupError", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const mockSetup = createMockSupabaseClient("source-group-absent-no-rels");
  const params = buildResolveContributionIdentityParams({
    dbClient: mockSetup.client as unknown as SupabaseClient<Database>,
  });
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.business_case,
    document_key: FileType.business_case,
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentitySourceGroupError(result.error));
  assertEquals(result.retriable, false);
  assertEquals(mockSetup.spies.fromSpy.calls.length, 0);
});

/**
 * Contract: given a document output whose document_relationships.source_group is undefined
 *   (not null), the error arm carries ResolveContributionIdentitySourceGroupError with
 *   retriable false, and no read is performed.
 * Arrange: payload with output_type business_case, valid document_key,
 *   document_relationships with no source_group key; params with a mock client.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is SourceGroupError; retriable is false; fromSpy called zero times.
 */
Deno.test("source group undefined (not null) returns SourceGroupError", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const mockSetup = createMockSupabaseClient("source-group-undefined");
  const params = buildResolveContributionIdentityParams({
    dbClient: mockSetup.client as unknown as SupabaseClient<Database>,
  });
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.business_case,
    document_key: FileType.business_case,
    document_relationships: { thesis: "contrib-1" },
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentitySourceGroupError(result.error));
  assertEquals(result.retriable, false);
  assertEquals(mockSetup.spies.fromSpy.calls.length, 0);
});

/**
 * Contract: given a document output whose source_group is explicitly null and whose
 *   planner_metadata carries no string recipe_step_id, the error arm carries
 *   ResolveContributionIdentitySourceGroupError with retriable false, and no read is performed.
 * Arrange: payload with output_type business_case, valid document_key,
 *   document_relationships.source_group null, planner_metadata with no recipe_step_id;
 *   params with a mock client.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is SourceGroupError; retriable is false; fromSpy called zero times.
 */
Deno.test("source group null with no recipe_step_id returns SourceGroupError", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const mockSetup = createMockSupabaseClient("source-group-null-no-step");
  const params = buildResolveContributionIdentityParams({
    dbClient: mockSetup.client as unknown as SupabaseClient<Database>,
  });
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.business_case,
    document_key: FileType.business_case,
    document_relationships: { source_group: null },
    planner_metadata: {},
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentitySourceGroupError(result.error));
  assertEquals(result.retriable, false);
  assertEquals(mockSetup.spies.fromSpy.calls.length, 0);
});

// --- Exemption granted ---

/**
 * Contract: given a null source_group with a recipe_step_id whose dialectic_stage_recipe_steps
 *   row carries granularity_strategy 'per_model', the success arm is returned with no
 *   sourceGroupFragment, after exactly one read.
 * Arrange: payload with output_type business_case, valid document_key,
 *   document_relationships.source_group null, planner_metadata.recipe_step_id "step-1";
 *   params with a mock client returning a per_model row for dialectic_stage_recipe_steps.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  success arm; sourceGroupFragment absent; fromSpy called exactly once.
 */
Deno.test("exemption granted: per_model strategy yields success with no fragment after one read", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const mockSetup = createMockSupabaseClient("exemption-granted", {
    genericMockResults: {
      dialectic_stage_recipe_steps: {
        select: { data: [{ granularity_strategy: "per_model" }], error: null },
      },
    },
  });
  const params = buildResolveContributionIdentityParams({
    dbClient: mockSetup.client as unknown as SupabaseClient<Database>,
  });
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.business_case,
    document_key: FileType.business_case,
    document_relationships: { source_group: null },
    planner_metadata: { recipe_step_id: "step-1" },
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentitySuccessReturn(result));
  assertEquals(result.sourceGroupFragment, undefined);
  assertEquals(mockSetup.spies.fromSpy.calls.length, 1);
});

// --- Exemption refused ---

/**
 * Contract: given a null source_group with a recipe_step_id whose row carries a strategy other
 *   than 'per_model', the error arm carries ResolveContributionIdentitySourceGroupError with
 *   retriable false.
 * Arrange: payload with output_type business_case, valid document_key,
 *   document_relationships.source_group null, planner_metadata.recipe_step_id "step-1";
 *   params with a mock client returning a per_source strategy row.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is SourceGroupError; retriable is false.
 */
Deno.test("exemption refused: other strategy returns SourceGroupError", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const mockSetup = createMockSupabaseClient("exemption-refused-other-strategy", {
    genericMockResults: {
      dialectic_stage_recipe_steps: {
        select: { data: [{ granularity_strategy: "per_source" }], error: null },
      },
    },
  });
  const params = buildResolveContributionIdentityParams({
    dbClient: mockSetup.client as unknown as SupabaseClient<Database>,
  });
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.business_case,
    document_key: FileType.business_case,
    document_relationships: { source_group: null },
    planner_metadata: { recipe_step_id: "step-1" },
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentitySourceGroupError(result.error));
  assertEquals(result.retriable, false);
});

/**
 * Contract: given a null source_group with a recipe_step_id where neither table holds a row,
 *   the error arm carries ResolveContributionIdentitySourceGroupError with retriable false,
 *   after exactly two reads.
 * Arrange: payload with output_type business_case, valid document_key,
 *   document_relationships.source_group null, planner_metadata.recipe_step_id "step-1";
 *   params with a mock client returning no rows for both tables.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is SourceGroupError; retriable is false; fromSpy called exactly twice.
 */
Deno.test("exemption refused: neither table has row returns SourceGroupError after two reads", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const mockSetup = createMockSupabaseClient("exemption-refused-no-row", {
    genericMockResults: {
      dialectic_stage_recipe_steps: {
        select: { data: null, error: null },
      },
      dialectic_recipe_template_steps: {
        select: { data: null, error: null },
      },
    },
  });
  const params = buildResolveContributionIdentityParams({
    dbClient: mockSetup.client as unknown as SupabaseClient<Database>,
  });
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.business_case,
    document_key: FileType.business_case,
    document_relationships: { source_group: null },
    planner_metadata: { recipe_step_id: "step-1" },
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentitySourceGroupError(result.error));
  assertEquals(result.retriable, false);
  assertEquals(mockSetup.spies.fromSpy.calls.length, 2);
});

// --- Read failures surfaced ---

/**
 * Contract: given a driver error on dialectic_stage_recipe_steps, the error arm carries
 *   ResolveContributionIdentityRecipeStepReadError naming that table, carrying the driver's
 *   message, with retriable true, and the template table is never queried.
 * Arrange: payload with output_type business_case, valid document_key,
 *   document_relationships.source_group null, planner_metadata.recipe_step_id "step-1";
 *   params with a mock client returning a driver error for dialectic_stage_recipe_steps.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is RecipeStepReadError; error.table is dialectic_stage_recipe_steps;
 *   error.driverMessage is "connection refused"; retriable is true; fromSpy called exactly once.
 */
Deno.test("driver error on stage recipe steps returns RecipeStepReadError", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const mockSetup = createMockSupabaseClient("read-fail-stage", {
    genericMockResults: {
      dialectic_stage_recipe_steps: {
        select: { data: null, error: new Error("connection refused") },
      },
    },
  });
  const params = buildResolveContributionIdentityParams({
    dbClient: mockSetup.client as unknown as SupabaseClient<Database>,
  });
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.business_case,
    document_key: FileType.business_case,
    document_relationships: { source_group: null },
    planner_metadata: { recipe_step_id: "step-1" },
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentityRecipeStepReadError(result.error));
  assertEquals(result.error.table, "dialectic_stage_recipe_steps");
  assertEquals(result.error.driverMessage, "connection refused");
  assertEquals(result.retriable, true);
  assertEquals(mockSetup.spies.fromSpy.calls.length, 1);
});

/**
 * Contract: given a first read returning no row followed by a driver error on
 *   dialectic_recipe_template_steps, the error arm carries
 *   ResolveContributionIdentityRecipeStepReadError naming the second table, carrying that
 *   driver's message, with retriable true.
 * Arrange: payload with output_type business_case, valid document_key,
 *   document_relationships.source_group null, planner_metadata.recipe_step_id "step-1";
 *   params with a mock client returning no row for stage table and a driver error for template.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  error arm; error is RecipeStepReadError; error.table is dialectic_recipe_template_steps;
 *   error.driverMessage is "template table down"; retriable is true; fromSpy called exactly twice.
 */
Deno.test("driver error on template table after no row on stage returns RecipeStepReadError", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const mockSetup = createMockSupabaseClient("read-fail-template", {
    genericMockResults: {
      dialectic_stage_recipe_steps: {
        select: { data: null, error: null },
      },
      dialectic_recipe_template_steps: {
        select: { data: null, error: new Error("template table down") },
      },
    },
  });
  const params = buildResolveContributionIdentityParams({
    dbClient: mockSetup.client as unknown as SupabaseClient<Database>,
  });
  const payload = buildResolveContributionIdentityPayload({
    output_type: FileType.business_case,
    document_key: FileType.business_case,
    document_relationships: { source_group: null },
    planner_metadata: { recipe_step_id: "step-1" },
  });

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentityErrorReturn(result));
  assert(isResolveContributionIdentityRecipeStepReadError(result.error));
  assertEquals(result.error.table, "dialectic_recipe_template_steps");
  assertEquals(result.error.driverMessage, "template table down");
  assertEquals(result.retriable, true);
  assertEquals(mockSetup.spies.fromSpy.calls.length, 2);
});

// --- Purity ---

/**
 * Contract: given any path that returns the success arm, neither the params object nor the
 *   payload object is mutated, and the returned restOfCanonicalPathParams is not the payload's
 *   own canonicalPathParams object.
 * Arrange: deps, params and payload with canonicalPathParams carrying two optionals; deep
 *   clones of params and payload taken before the call.
 * Act:     resolveContributionIdentity over the composed deps, params and payload.
 * Assert:  success arm; params deep-equals its clone; payload deep-equals its clone;
 *   restOfCanonicalPathParams is not the same object reference as payload.canonicalPathParams.
 */
Deno.test("purity: no mutation of params or payload, restOfCanonicalPathParams is a copy", async () => {
  // Arrange
  const deps = buildResolveContributionIdentityDeps();
  const params = buildResolveContributionIdentityParams();
  const payload = buildResolveContributionIdentityPayload({
    canonicalPathParams: {
      contributionType: "thesis",
      stageSlug: DialecticStageSlug.Thesis,
      sourceModelSlugs: ["model-a"],
      sourceAnchorType: "thesis",
    },
  });
  const paramsJobSnapshot = params.job;
  const paramsProviderRowSnapshot = params.providerRow;
  const paramsAiResponseSnapshot = params.aiResponse;
  const payloadCanonicalPathParamsSnapshot = payload.canonicalPathParams;
  const payloadOutputTypeSnapshot = payload.output_type;
  const payloadDocumentKeySnapshot = payload.document_key;
  const payloadDocumentRelationshipsSnapshot = payload.document_relationships;

  // Act
  const result = await resolveContributionIdentity(deps, params, payload);

  // Assert
  assert(isResolveContributionIdentitySuccessReturn(result));
  assertEquals(params.job, paramsJobSnapshot);
  assertEquals(params.providerRow, paramsProviderRowSnapshot);
  assertEquals(params.aiResponse, paramsAiResponseSnapshot);
  assertEquals(payload.canonicalPathParams, payloadCanonicalPathParamsSnapshot);
  assertEquals(payload.output_type, payloadOutputTypeSnapshot);
  assertEquals(payload.document_key, payloadDocumentKeySnapshot);
  assertEquals(payload.document_relationships, payloadDocumentRelationshipsSnapshot);
  assert(result.restOfCanonicalPathParams !== payload.canonicalPathParams);
});
