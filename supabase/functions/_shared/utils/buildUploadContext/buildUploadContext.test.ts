import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { CanonicalPathParams } from "../../types/file_manager.types.ts";
import { FileType } from "../../types/file_manager.types.ts";
import type { ModelContributionUploadContext } from "../../types/file_manager.types.ts";
import type { BuildUploadContextParams } from "./buildUploadContext.interface.ts";
import { buildUploadContext } from "./buildUploadContext.ts";

function minimalRest(): Omit<CanonicalPathParams, "contributionType"> {
  return {
    stageSlug: "thesis",
  };
}

function minimalParams(
  overrides: Partial<BuildUploadContextParams>,
): BuildUploadContextParams {
  const defaults: BuildUploadContextParams = {
    projectId: "proj-1",
    storageFileType: FileType.ModelContributionRawJson,
    sessionId: "sess-1",
    iterationNumber: 2,
    modelSlug: "model-api-id",
    attemptCount: 1,
    restOfCanonicalPathParams: minimalRest(),
    documentKey: "business_case",
    contributionType: "thesis",
    isContinuationForStorage: false,
    continuationCount: undefined,
    sourceGroupFragment: undefined,
    contentForStorage: '{"a":1}',
    projectOwnerUserId: "owner-1",
    description: "desc",
    providerDetails: { id: "mid", name: "Model Name" },
    aiResponse: {
      inputTokens: 10,
      outputTokens: 20,
      processingTimeMs: 30,
    },
    sourcePromptResourceId: "spr-1",
    targetContributionId: undefined,
    documentRelationships: null,
    isIntermediate: false,
  };

  return {
    ...defaults,
    ...overrides,
    restOfCanonicalPathParams:
      overrides.restOfCanonicalPathParams !== undefined
        ? overrides.restOfCanonicalPathParams
        : defaults.restOfCanonicalPathParams,
  };
}

Deno.test(
  "returns ModelContributionUploadContext with pathContext fields assembled from params",
  () => {
    const params: BuildUploadContextParams = minimalParams({
      projectId: "proj-x",
      sessionId: "sess-x",
      iterationNumber: 7,
      modelSlug: "slug-x",
      attemptCount: 3,
      documentKey: "feature_spec",
      contentForStorage: "{}",
    });
    const result: ModelContributionUploadContext = buildUploadContext(params);
    assertEquals(result.pathContext.projectId, "proj-x");
    assertEquals(result.pathContext.sessionId, "sess-x");
    assertEquals(result.pathContext.iteration, 7);
    assertEquals(result.pathContext.modelSlug, "slug-x");
    assertEquals(result.pathContext.attemptCount, 3);
    assertEquals(result.pathContext.documentKey, "feature_spec");
  },
);

Deno.test(
  "sets pathContext.fileType to storageFileType",
  () => {
    const params: BuildUploadContextParams = minimalParams({
      storageFileType: FileType.HeaderContext,
    });
    const result: ModelContributionUploadContext = buildUploadContext(params);
    assertEquals(result.pathContext.fileType, FileType.HeaderContext);
  },
);

Deno.test(
  "spreads restOfCanonicalPathParams into pathContext",
  () => {
    const restOfCanonicalPathParams: Omit<CanonicalPathParams, "contributionType"> = {
      stageSlug: "antithesis",
      sourceAnchorModelSlug: "anchor-model",
      pairedModelSlug: "paired-model",
    };
    const params: BuildUploadContextParams = minimalParams({
      restOfCanonicalPathParams,
    });
    const result: ModelContributionUploadContext = buildUploadContext(params);
    assertEquals(result.pathContext.stageSlug, "antithesis");
    assertEquals(result.pathContext.sourceAnchorModelSlug, "anchor-model");
    assertEquals(result.pathContext.pairedModelSlug, "paired-model");
  },
);

Deno.test(
  "sets pathContext.isContinuation from isContinuationForStorage",
  () => {
    const paramsTrue: BuildUploadContextParams = minimalParams({
      isContinuationForStorage: true,
      continuationCount: 2,
      targetContributionId: "tc-1",
    });
    const outTrue: ModelContributionUploadContext = buildUploadContext(paramsTrue);
    assertEquals(outTrue.pathContext.isContinuation, true);

    const paramsFalse: BuildUploadContextParams = minimalParams({
      isContinuationForStorage: false,
    });
    const outFalse: ModelContributionUploadContext = buildUploadContext(paramsFalse);
    assertEquals(outFalse.pathContext.isContinuation, false);
  },
);

Deno.test(
  "sets pathContext.turnIndex from continuationCount when isContinuationForStorage is true",
  () => {
    const params: BuildUploadContextParams = minimalParams({
      isContinuationForStorage: true,
      continuationCount: 4,
      targetContributionId: "tc-1",
    });
    const result: ModelContributionUploadContext = buildUploadContext(params);
    assertEquals(result.pathContext.turnIndex, 4);
  },
);

Deno.test(
  "sets pathContext.turnIndex to undefined when isContinuationForStorage is false",
  () => {
    const params: BuildUploadContextParams = minimalParams({
      isContinuationForStorage: false,
      continuationCount: 99,
    });
    const result: ModelContributionUploadContext = buildUploadContext(params);
    assertEquals(result.pathContext.turnIndex, undefined);
  },
);

Deno.test(
  "includes sourceGroupFragment in pathContext when provided",
  () => {
    const params: BuildUploadContextParams = minimalParams({
      sourceGroupFragment: "deadbeef",
    });
    const result: ModelContributionUploadContext = buildUploadContext(params);
    assertEquals(result.pathContext.sourceGroupFragment, "deadbeef");
  },
);

Deno.test(
  "omits sourceGroupFragment from pathContext when undefined",
  () => {
    const params: BuildUploadContextParams = minimalParams({
      sourceGroupFragment: undefined,
    });
    const result: ModelContributionUploadContext = buildUploadContext(params);
    assertEquals("sourceGroupFragment" in result.pathContext, false);
  },
);

Deno.test(
  "sets fileContent to contentForStorage",
  () => {
    const params: BuildUploadContextParams = minimalParams({
      contentForStorage: '{"k":"v"}',
    });
    const result: ModelContributionUploadContext = buildUploadContext(params);
    assertEquals(result.fileContent, '{"k":"v"}');
  },
);

Deno.test(
  'sets mimeType to "application/json"',
  () => {
    const params: BuildUploadContextParams = minimalParams({});
    const result: ModelContributionUploadContext = buildUploadContext(params);
    assertEquals(result.mimeType, "application/json");
  },
);

Deno.test(
  "sets sizeBytes to contentForStorage.length",
  () => {
    const contentForStorage: string = '{"x":true}';
    const params: BuildUploadContextParams = minimalParams({
      contentForStorage,
    });
    const result: ModelContributionUploadContext = buildUploadContext(params);
    assertEquals(result.sizeBytes, contentForStorage.length);
  },
);

Deno.test(
  "sets userId to projectOwnerUserId",
  () => {
    const params: BuildUploadContextParams = minimalParams({
      projectOwnerUserId: "user-xyz",
    });
    const result: ModelContributionUploadContext = buildUploadContext(params);
    assertEquals(result.userId, "user-xyz");
  },
);

Deno.test(
  "assembles contributionMetadata with fields from params",
  () => {
    const params: BuildUploadContextParams = minimalParams({
      sessionId: "s-meta",
      iterationNumber: 5,
      contributionType: "synthesis",
      providerDetails: { id: "p-id", name: "p-name" },
      aiResponse: {
        inputTokens: 1,
        outputTokens: 2,
        processingTimeMs: 3,
      },
      sourcePromptResourceId: "spr-meta",
      targetContributionId: "tgt-meta",
      documentRelationships: { r: 1 },
      restOfCanonicalPathParams: {
        stageSlug: "synthesis",
      },
    });
    const result: ModelContributionUploadContext = buildUploadContext(params);
    const meta = result.contributionMetadata;
    assertEquals(meta.sessionId, "s-meta");
    assertEquals(meta.modelIdUsed, "p-id");
    assertEquals(meta.modelNameDisplay, "p-name");
    assertEquals(meta.stageSlug, "synthesis");
    assertEquals(meta.iterationNumber, 5);
    assertEquals(meta.contributionType, "synthesis");
    assertEquals(meta.tokensUsedInput, 1);
    assertEquals(meta.tokensUsedOutput, 2);
    assertEquals(meta.processingTimeMs, 3);
    assertEquals(meta.source_prompt_resource_id, "spr-meta");
    assertEquals(meta.target_contribution_id, "tgt-meta");
    assertEquals(meta.document_relationships, { r: 1 });
  },
);

Deno.test(
  "sets contributionMetadata.isIntermediate from params",
  () => {
    const paramsTrue: BuildUploadContextParams = minimalParams({
      isIntermediate: true,
    });
    const outTrue: ModelContributionUploadContext = buildUploadContext(paramsTrue);
    assertEquals(outTrue.contributionMetadata.isIntermediate, true);

    const paramsFalse: BuildUploadContextParams = minimalParams({
      isIntermediate: false,
    });
    const outFalse: ModelContributionUploadContext = buildUploadContext(paramsFalse);
    assertEquals(outFalse.contributionMetadata.isIntermediate, false);
  },
);
