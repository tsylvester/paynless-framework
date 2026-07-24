import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { CanonicalPathParams } from "../../types/file_manager.types.ts";
import { FileType, DialecticStageSlug } from "../../types/file_manager.types.ts";
import type { ModelContributionUploadContext, ResourceUploadContext } from "../../types/file_manager.types.ts";
import type { BuildUploadContextParams, BuildUploadContextResourceParams } from "./buildUploadContext.interface.ts";
import { buildUploadContext } from "./buildUploadContext.ts";
import { isModelContributionContext, isResourceContext } from "../type-guards/type_guards.file_manager.ts";

function expectContribution(result: ModelContributionUploadContext | ResourceUploadContext): ModelContributionUploadContext {
  if (!isModelContributionContext(result)) {
    throw new Error("expected ModelContributionUploadContext");
  }
  return result;
}

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
    const result: ModelContributionUploadContext = expectContribution(buildUploadContext(params));
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
    const result: ModelContributionUploadContext = expectContribution(buildUploadContext(params));
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
    const result: ModelContributionUploadContext = expectContribution(buildUploadContext(params));
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
    const outTrue: ModelContributionUploadContext = expectContribution(buildUploadContext(paramsTrue));
    assertEquals(outTrue.pathContext.isContinuation, true);

    const paramsFalse: BuildUploadContextParams = minimalParams({
      isContinuationForStorage: false,
    });
    const outFalse: ModelContributionUploadContext = expectContribution(buildUploadContext(paramsFalse));
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
    const result: ModelContributionUploadContext = expectContribution(buildUploadContext(params));
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
    const result: ModelContributionUploadContext = expectContribution(buildUploadContext(params));
    assertEquals(result.pathContext.turnIndex, undefined);
  },
);

Deno.test(
  "includes sourceGroupFragment in pathContext when provided",
  () => {
    const params: BuildUploadContextParams = minimalParams({
      sourceGroupFragment: "deadbeef",
    });
    const result: ModelContributionUploadContext = expectContribution(buildUploadContext(params));
    assertEquals(result.pathContext.sourceGroupFragment, "deadbeef");
  },
);

Deno.test(
  "omits sourceGroupFragment from pathContext when undefined",
  () => {
    const params: BuildUploadContextParams = minimalParams({
      sourceGroupFragment: undefined,
    });
    const result: ModelContributionUploadContext = expectContribution(buildUploadContext(params));
    assertEquals("sourceGroupFragment" in result.pathContext, false);
  },
);

Deno.test(
  "sets fileContent to contentForStorage",
  () => {
    const params: BuildUploadContextParams = minimalParams({
      contentForStorage: '{"k":"v"}',
    });
    const result: ModelContributionUploadContext = expectContribution(buildUploadContext(params));
    assertEquals(result.fileContent, '{"k":"v"}');
  },
);

Deno.test(
  'sets mimeType to "application/json"',
  () => {
    const params: BuildUploadContextParams = minimalParams({});
    const result: ModelContributionUploadContext = expectContribution(buildUploadContext(params));
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
    const result: ModelContributionUploadContext = expectContribution(buildUploadContext(params));
    assertEquals(result.sizeBytes, contentForStorage.length);
  },
);

Deno.test(
  "sets userId to projectOwnerUserId",
  () => {
    const params: BuildUploadContextParams = minimalParams({
      projectOwnerUserId: "user-xyz",
    });
    const result: ModelContributionUploadContext = expectContribution(buildUploadContext(params));
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
    const result: ModelContributionUploadContext = expectContribution(buildUploadContext(params));
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
    const outTrue: ModelContributionUploadContext = expectContribution(buildUploadContext(paramsTrue));
    assertEquals(outTrue.contributionMetadata.isIntermediate, true);

    const paramsFalse: BuildUploadContextParams = minimalParams({
      isIntermediate: false,
    });
    const outFalse: ModelContributionUploadContext = expectContribution(buildUploadContext(paramsFalse));
    assertEquals(outFalse.contributionMetadata.isIntermediate, false);
  },
);

function minimalResourceParams(
  overrides: Partial<BuildUploadContextResourceParams>,
): BuildUploadContextResourceParams {
  const defaults: BuildUploadContextResourceParams = {
    projectId: "proj-r",
    storageFileType: FileType.CompressedContextRawJson,
    sessionId: "sess-r",
    iterationNumber: 1,
    stageSlug: DialecticStageSlug.Thesis,
    targetKey: FileType.business_case,
    sourceType: "contribution",
    documentKey: FileType.feature_spec,
    sourceId: undefined,
    chunkIndex: undefined,
    chunkTotal: undefined,
    contentForStorage: '{"compressed":true}',
    projectOwnerUserId: "owner-r",
    description: "resource desc",
  };
  return { ...defaults, ...overrides };
}

Deno.test(
  "resource arm: pathContext maps projectId/fileType/sessionId/iteration/stageSlug/targetKey/sourceType/documentKey from params",
  () => {
    const params: BuildUploadContextResourceParams = minimalResourceParams({
      projectId: "proj-rc",
      storageFileType: FileType.CompressedContextRawJson,
      sessionId: "sess-rc",
      iterationNumber: 3,
      stageSlug: DialecticStageSlug.Synthesis,
      targetKey: FileType.technical_approach,
      sourceType: "contribution",
      documentKey: FileType.business_case,
    });
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isResourceContext(result)) {
      throw new Error("expected ResourceUploadContext");
    }
    assertEquals(result.pathContext.projectId, "proj-rc");
    assertEquals(result.pathContext.fileType, FileType.CompressedContextRawJson);
    assertEquals(result.pathContext.sessionId, "sess-rc");
    assertEquals(result.pathContext.iteration, 3);
    assertEquals(result.pathContext.stageSlug, DialecticStageSlug.Synthesis);
    assertEquals(result.pathContext.targetKey, FileType.technical_approach);
    assertEquals(result.pathContext.sourceType, "contribution");
    assertEquals(result.pathContext.documentKey, FileType.business_case);
  },
);

Deno.test(
  "resource arm: return passes isResourceContext and fails isModelContributionContext; no contributionMetadata key",
  () => {
    const params: BuildUploadContextResourceParams = minimalResourceParams({});
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    assertEquals(isResourceContext(result), true);
    assertEquals(isModelContributionContext(result), false);
    assertEquals("contributionMetadata" in result, false);
  },
);

Deno.test(
  "resource arm: mime selection — CompressedContextRawJson yields application/json, CompressedContext yields text/markdown",
  () => {
    const paramsJson: BuildUploadContextResourceParams = minimalResourceParams({
      storageFileType: FileType.CompressedContextRawJson,
    });
    const resultJson: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(paramsJson);
    if (!isResourceContext(resultJson)) {
      throw new Error("expected ResourceUploadContext");
    }
    assertEquals(resultJson.mimeType, "application/json");

    const paramsMd: BuildUploadContextResourceParams = minimalResourceParams({
      storageFileType: FileType.CompressedContext,
    });
    const resultMd: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(paramsMd);
    if (!isResourceContext(resultMd)) {
      throw new Error("expected ResourceUploadContext");
    }
    assertEquals(resultMd.mimeType, "text/markdown");
  },
);

Deno.test(
  "resource arm: fileContent/sizeBytes/userId/description passthrough; no resourceTypeForDb or resourceDescriptionForDb",
  () => {
    const params: BuildUploadContextResourceParams = minimalResourceParams({
      contentForStorage: '{"z":9}',
      projectOwnerUserId: "user-rp",
      description: "desc-rp",
    });
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isResourceContext(result)) {
      throw new Error("expected ResourceUploadContext");
    }
    assertEquals(result.fileContent, '{"z":9}');
    assertEquals(result.sizeBytes, '{"z":9}'.length);
    assertEquals(result.userId, "user-rp");
    assertEquals(result.description, "desc-rp");
    assertEquals("resourceTypeForDb" in result, false);
    assertEquals("resourceDescriptionForDb" in result, false);
  },
);

Deno.test(
  "resource arm: chunk lineage — chunkIndex/chunkTotal flow onto pathContext verbatim; both undefined stay undefined",
  () => {
    const paramsChunks: BuildUploadContextResourceParams = minimalResourceParams({
      chunkIndex: 2,
      chunkTotal: 3,
    });
    const resultChunks: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(paramsChunks);
    if (!isResourceContext(resultChunks)) {
      throw new Error("expected ResourceUploadContext");
    }
    assertEquals(resultChunks.pathContext.chunkIndex, 2);
    assertEquals(resultChunks.pathContext.chunkTotal, 3);

    const paramsNoChunks: BuildUploadContextResourceParams = minimalResourceParams({
      chunkIndex: undefined,
      chunkTotal: undefined,
    });
    const resultNoChunks: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(paramsNoChunks);
    if (!isResourceContext(resultNoChunks)) {
      throw new Error("expected ResourceUploadContext");
    }
    assertEquals(resultNoChunks.pathContext.chunkIndex, undefined);
    assertEquals(resultNoChunks.pathContext.chunkTotal, undefined);
  },
);

Deno.test(
  "resource arm: sourceType 'history' with sourceId and no documentKey — pathContext.sourceId set, documentKey undefined",
  () => {
    const params: BuildUploadContextResourceParams = minimalResourceParams({
      sourceType: "history",
      sourceId: "src-hist",
      documentKey: undefined,
    });
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isResourceContext(result)) {
      throw new Error("expected ResourceUploadContext");
    }
    assertEquals(result.pathContext.sourceType, "history");
    assertEquals(result.pathContext.sourceId, "src-hist");
    assertEquals(result.pathContext.documentKey, undefined);
  },
);
