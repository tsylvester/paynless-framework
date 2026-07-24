import { assert, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FileType, DialecticStageSlug } from "../../types/file_manager.types.ts";
import {
  isBuildUploadContextParams,
  isBuildUploadContextResourceParams,
} from "./buildUploadContext.guards.ts";
import {
  buildBuildUploadContextParams,
  invalidateBuildUploadContextParams,
  buildBuildUploadContextResourceParams,
  invalidateBuildUploadContextResourceParams,
} from "./buildUploadContext.mock.ts";

Deno.test("isBuildUploadContextParams accepts the valid default", () => {
  assert(isBuildUploadContextParams(buildBuildUploadContextParams()));
});

Deno.test("isBuildUploadContextParams accepts valid overrides", () => {
  assert(
    isBuildUploadContextParams(
      buildBuildUploadContextParams({
        storageFileType: FileType.Synthesis,
        iterationNumber: 2,
        contributionType: "antithesis",
      }),
    ),
  );
});

Deno.test("isBuildUploadContextParams rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertFalse(isBuildUploadContextParams(x));
  }
});

Deno.test("isBuildUploadContextParams rejects each corrupted property", () => {
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ projectId: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ storageFileType: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ sessionId: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ iterationNumber: "not-a-number" }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ modelSlug: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ attemptCount: "not-a-number" }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ restOfCanonicalPathParams: "not-an-object" }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ documentKey: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ contributionType: "not-a-contribution-type" }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ isContinuationForStorage: "not-a-boolean" }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ continuationCount: "not-a-number" }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ sourceGroupFragment: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ contentForStorage: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ projectOwnerUserId: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ description: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ providerDetails: "not-an-object" }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ aiResponse: "not-an-object" }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ sourcePromptResourceId: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ targetContributionId: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ documentRelationships: () => {} }),
    ),
  );
  assertFalse(
    isBuildUploadContextParams(
      invalidateBuildUploadContextParams({ isIntermediate: "not-a-boolean" }),
    ),
  );
});

Deno.test("isBuildUploadContextParams rejects each omitted required property", () => {
  const { projectId: _p, ...missingProjectId } = buildBuildUploadContextParams();
  assertFalse(isBuildUploadContextParams(missingProjectId));

  const { storageFileType: _s, ...missingStorageFileType } = buildBuildUploadContextParams();
  assertFalse(isBuildUploadContextParams(missingStorageFileType));

  const { sessionId: _se, ...missingSessionId } = buildBuildUploadContextParams();
  assertFalse(isBuildUploadContextParams(missingSessionId));

  const { iterationNumber: _i, ...missingIterationNumber } = buildBuildUploadContextParams();
  assertFalse(isBuildUploadContextParams(missingIterationNumber));

  const { modelSlug: _m, ...missingModelSlug } = buildBuildUploadContextParams();
  assertFalse(isBuildUploadContextParams(missingModelSlug));

  const { attemptCount: _a, ...missingAttemptCount } = buildBuildUploadContextParams();
  assertFalse(isBuildUploadContextParams(missingAttemptCount));

  const { restOfCanonicalPathParams: _r, ...missingRestOfCanonicalPathParams } = buildBuildUploadContextParams();
  assertFalse(isBuildUploadContextParams(missingRestOfCanonicalPathParams));

  const { documentKey: _d, ...missingDocumentKey } = buildBuildUploadContextParams();
  assertFalse(isBuildUploadContextParams(missingDocumentKey));

  const { isContinuationForStorage: _ic, ...missingIsContinuationForStorage } = buildBuildUploadContextParams();
  assertFalse(isBuildUploadContextParams(missingIsContinuationForStorage));

  const { contentForStorage: _c, ...missingContentForStorage } = buildBuildUploadContextParams();
  assertFalse(isBuildUploadContextParams(missingContentForStorage));

  const { projectOwnerUserId: _pu, ...missingProjectOwnerUserId } = buildBuildUploadContextParams();
  assertFalse(isBuildUploadContextParams(missingProjectOwnerUserId));

  const { description: _de, ...missingDescription } = buildBuildUploadContextParams();
  assertFalse(isBuildUploadContextParams(missingDescription));

  const { providerDetails: _pd, ...missingProviderDetails } = buildBuildUploadContextParams();
  assertFalse(isBuildUploadContextParams(missingProviderDetails));

  const { aiResponse: _ai, ...missingAiResponse } = buildBuildUploadContextParams();
  assertFalse(isBuildUploadContextParams(missingAiResponse));

  const { documentRelationships: _dr, ...missingDocumentRelationships } = buildBuildUploadContextParams();
  assertFalse(isBuildUploadContextParams(missingDocumentRelationships));
});

Deno.test("isBuildUploadContextParams accepts undefined-valued optional properties", () => {
  assert(
    isBuildUploadContextParams(
      buildBuildUploadContextParams({ contributionType: undefined }),
    ),
  );
  assert(
    isBuildUploadContextParams(
      buildBuildUploadContextParams({ continuationCount: undefined }),
    ),
  );
  assert(
    isBuildUploadContextParams(
      buildBuildUploadContextParams({ sourceGroupFragment: undefined }),
    ),
  );
  assert(
    isBuildUploadContextParams(
      buildBuildUploadContextParams({ sourcePromptResourceId: undefined }),
    ),
  );
  assert(
    isBuildUploadContextParams(
      buildBuildUploadContextParams({ targetContributionId: undefined }),
    ),
  );
});

Deno.test("isBuildUploadContextParams rejects a resource literal", () => {
  assertFalse(isBuildUploadContextParams(buildBuildUploadContextResourceParams()));
});

Deno.test("isBuildUploadContextResourceParams accepts the valid default", () => {
  assert(isBuildUploadContextResourceParams(buildBuildUploadContextResourceParams()));
});

Deno.test("isBuildUploadContextResourceParams accepts each storageFileType and identity branch", () => {
  assert(
    isBuildUploadContextResourceParams(
      buildBuildUploadContextResourceParams({
        storageFileType: FileType.CompressedContextRawJson,
        sourceType: "contribution",
        documentKey: FileType.feature_spec,
        sourceId: undefined,
      }),
    ),
  );
  assert(
    isBuildUploadContextResourceParams(
      buildBuildUploadContextResourceParams({
        storageFileType: FileType.CompressedContextRawJson,
        sourceType: "resource",
        documentKey: FileType.business_case,
        sourceId: undefined,
      }),
    ),
  );
  assert(
    isBuildUploadContextResourceParams(
      buildBuildUploadContextResourceParams({
        storageFileType: FileType.CompressedContextRawJson,
        sourceType: "feedback",
        documentKey: undefined,
        sourceId: "src-1",
      }),
    ),
  );
  assert(
    isBuildUploadContextResourceParams(
      buildBuildUploadContextResourceParams({
        storageFileType: FileType.CompressedContextRawJson,
        sourceType: "history",
        documentKey: undefined,
        sourceId: "src-1",
      }),
    ),
  );
  assert(
    isBuildUploadContextResourceParams(
      buildBuildUploadContextResourceParams({
        storageFileType: FileType.CompressedContext,
        sourceType: "contribution",
        documentKey: FileType.feature_spec,
        sourceId: undefined,
      }),
    ),
  );
  assert(
    isBuildUploadContextResourceParams(
      buildBuildUploadContextResourceParams({
        storageFileType: FileType.CompressedContext,
        sourceType: "resource",
        documentKey: FileType.business_case,
        sourceId: undefined,
      }),
    ),
  );
  assert(
    isBuildUploadContextResourceParams(
      buildBuildUploadContextResourceParams({
        storageFileType: FileType.CompressedContext,
        sourceType: "feedback",
        documentKey: undefined,
        sourceId: "src-1",
      }),
    ),
  );
  assert(
    isBuildUploadContextResourceParams(
      buildBuildUploadContextResourceParams({
        storageFileType: FileType.CompressedContext,
        sourceType: "history",
        documentKey: undefined,
        sourceId: "src-1",
      }),
    ),
  );
});

Deno.test("isBuildUploadContextResourceParams accepts chunk pair present", () => {
  assert(
    isBuildUploadContextResourceParams(
      buildBuildUploadContextResourceParams({
        chunkIndex: 1,
        chunkTotal: 2,
      }),
    ),
  );
});

Deno.test("isBuildUploadContextResourceParams accepts chunk pair absent", () => {
  assert(
    isBuildUploadContextResourceParams(
      buildBuildUploadContextResourceParams({
        chunkIndex: undefined,
        chunkTotal: undefined,
      }),
    ),
  );
});

Deno.test("isBuildUploadContextResourceParams rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertFalse(isBuildUploadContextResourceParams(x));
  }
});

Deno.test("isBuildUploadContextResourceParams rejects a contribution literal", () => {
  assertFalse(isBuildUploadContextResourceParams(buildBuildUploadContextParams()));
});

Deno.test("isBuildUploadContextResourceParams rejects each corrupted property", () => {
  assertFalse(
    isBuildUploadContextResourceParams(
      invalidateBuildUploadContextResourceParams({ projectId: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextResourceParams(
      invalidateBuildUploadContextResourceParams({ storageFileType: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextResourceParams(
      invalidateBuildUploadContextResourceParams({ sessionId: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextResourceParams(
      invalidateBuildUploadContextResourceParams({ iterationNumber: "not-a-number" }),
    ),
  );
  assertFalse(
    isBuildUploadContextResourceParams(
      invalidateBuildUploadContextResourceParams({ stageSlug: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextResourceParams(
      invalidateBuildUploadContextResourceParams({ targetKey: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextResourceParams(
      invalidateBuildUploadContextResourceParams({ sourceType: "not-a-source-type" }),
    ),
  );
  assertFalse(
    isBuildUploadContextResourceParams(
      invalidateBuildUploadContextResourceParams({ documentKey: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextResourceParams(
      invalidateBuildUploadContextResourceParams({ sourceId: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextResourceParams(
      invalidateBuildUploadContextResourceParams({ chunkIndex: "not-a-number" }),
    ),
  );
  assertFalse(
    isBuildUploadContextResourceParams(
      invalidateBuildUploadContextResourceParams({ chunkTotal: "not-a-number" }),
    ),
  );
  assertFalse(
    isBuildUploadContextResourceParams(
      invalidateBuildUploadContextResourceParams({ contentForStorage: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextResourceParams(
      invalidateBuildUploadContextResourceParams({ projectOwnerUserId: 123 }),
    ),
  );
  assertFalse(
    isBuildUploadContextResourceParams(
      invalidateBuildUploadContextResourceParams({ description: 123 }),
    ),
  );
});

Deno.test("isBuildUploadContextResourceParams rejects each omitted required property", () => {
  const { projectId: _p, ...missingProjectId } = buildBuildUploadContextResourceParams();
  assertFalse(isBuildUploadContextResourceParams(missingProjectId));

  const { storageFileType: _s, ...missingStorageFileType } = buildBuildUploadContextResourceParams();
  assertFalse(isBuildUploadContextResourceParams(missingStorageFileType));

  const { sessionId: _se, ...missingSessionId } = buildBuildUploadContextResourceParams();
  assertFalse(isBuildUploadContextResourceParams(missingSessionId));

  const { iterationNumber: _i, ...missingIterationNumber } = buildBuildUploadContextResourceParams();
  assertFalse(isBuildUploadContextResourceParams(missingIterationNumber));

  const { stageSlug: _st, ...missingStageSlug } = buildBuildUploadContextResourceParams();
  assertFalse(isBuildUploadContextResourceParams(missingStageSlug));

  const { targetKey: _t, ...missingTargetKey } = buildBuildUploadContextResourceParams();
  assertFalse(isBuildUploadContextResourceParams(missingTargetKey));

  const { sourceType: _so, ...missingSourceType } = buildBuildUploadContextResourceParams();
  assertFalse(isBuildUploadContextResourceParams(missingSourceType));

  const { contentForStorage: _c, ...missingContentForStorage } = buildBuildUploadContextResourceParams();
  assertFalse(isBuildUploadContextResourceParams(missingContentForStorage));

  const { projectOwnerUserId: _pu, ...missingProjectOwnerUserId } = buildBuildUploadContextResourceParams();
  assertFalse(isBuildUploadContextResourceParams(missingProjectOwnerUserId));

  const { description: _de, ...missingDescription } = buildBuildUploadContextResourceParams();
  assertFalse(isBuildUploadContextResourceParams(missingDescription));
});

Deno.test("isBuildUploadContextResourceParams rejects sourceType 'contribution' without documentKey", () => {
  assertFalse(
    isBuildUploadContextResourceParams(
      buildBuildUploadContextResourceParams({
        sourceType: "contribution",
        documentKey: undefined,
        sourceId: "src-1",
      }),
    ),
  );
});

Deno.test("isBuildUploadContextResourceParams rejects sourceType 'resource' without documentKey", () => {
  assertFalse(
    isBuildUploadContextResourceParams(
      buildBuildUploadContextResourceParams({
        sourceType: "resource",
        documentKey: undefined,
        sourceId: "src-1",
      }),
    ),
  );
});

Deno.test("isBuildUploadContextResourceParams rejects sourceType 'feedback' without sourceId", () => {
  assertFalse(
    isBuildUploadContextResourceParams(
      buildBuildUploadContextResourceParams({
        sourceType: "feedback",
        documentKey: FileType.feature_spec,
        sourceId: undefined,
      }),
    ),
  );
});

Deno.test("isBuildUploadContextResourceParams rejects sourceType 'history' without sourceId", () => {
  assertFalse(
    isBuildUploadContextResourceParams(
      buildBuildUploadContextResourceParams({
        sourceType: "history",
        documentKey: FileType.feature_spec,
        sourceId: undefined,
      }),
    ),
  );
});

Deno.test("isBuildUploadContextResourceParams rejects chunkIndex present without chunkTotal", () => {
  assertFalse(
    isBuildUploadContextResourceParams(
      buildBuildUploadContextResourceParams({
        chunkIndex: 1,
        chunkTotal: undefined,
      }),
    ),
  );
});

Deno.test("isBuildUploadContextResourceParams rejects chunkTotal present without chunkIndex", () => {
  assertFalse(
    isBuildUploadContextResourceParams(
      buildBuildUploadContextResourceParams({
        chunkIndex: undefined,
        chunkTotal: 2,
      }),
    ),
  );
});
