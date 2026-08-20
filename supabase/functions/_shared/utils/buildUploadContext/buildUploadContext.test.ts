import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FileType, DialecticStageSlug } from "../../types/file_manager.types.ts";
import type { ModelContributionUploadContext, ResourceUploadContext } from "../../types/file_manager.types.ts";
import type { BuildUploadContextParams, BuildUploadContextResourceParams } from "./buildUploadContext.interface.ts";
import { buildUploadContext } from "./buildUploadContext.ts";
import {
  buildBuildUploadContextParams,
  buildBuildUploadContextResourceParams,
  buildBuildUploadContextProviderDetails,
  buildBuildUploadContextAiResponseSlice,
} from "./buildUploadContext.mock.ts";
import { isModelContributionContext, isResourceContext } from "../type-guards/type_guards.file_manager.ts";
 
/**
 * Contract: given a contribution params object, the path context assembles projectId, sessionId,
 *   iteration, modelSlug, attemptCount and documentKey from the corresponding params fields.
 * Arrange: buildBuildUploadContextParams overriding projectId, sessionId, iterationNumber,
 *   modelSlug, attemptCount and documentKey to non-default values.
 * Act:     buildUploadContext over the contribution params.
 * Assert:  pathContext.projectId, sessionId, iteration, modelSlug, attemptCount and documentKey
 *   equal the overridden values.
 */
Deno.test(
  "returns ModelContributionUploadContext with pathContext fields assembled from params",
  () => {
    // Arrange
    const params: BuildUploadContextParams = buildBuildUploadContextParams({
      projectId: "proj-x",
      sessionId: "sess-x",
      iterationNumber: 7,
      modelSlug: "slug-x",
      attemptCount: 3,
      documentKey: FileType.feature_spec,
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isModelContributionContext(result)) {
      throw new Error("expected ModelContributionUploadContext");
    }
 
    // Assert
    assertEquals(result.pathContext.projectId, "proj-x");
    assertEquals(result.pathContext.sessionId, "sess-x");
    assertEquals(result.pathContext.iteration, 7);
    assertEquals(result.pathContext.modelSlug, "slug-x");
    assertEquals(result.pathContext.attemptCount, 3);
    assertEquals(result.pathContext.documentKey, "feature_spec");
  },
);
 
/**
 * Contract: given a contribution params object, pathContext.fileType is set from storageFileType.
 * Arrange: buildBuildUploadContextParams overriding storageFileType to HeaderContext.
 * Act:     buildUploadContext over the contribution params.
 * Assert:  pathContext.fileType equals the overridden storageFileType.
 */
Deno.test(
  "sets pathContext.fileType to storageFileType",
  () => {
    // Arrange
    const params: BuildUploadContextParams = buildBuildUploadContextParams({
      storageFileType: FileType.HeaderContext,
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isModelContributionContext(result)) {
      throw new Error("expected ModelContributionUploadContext");
    }
 
    // Assert
    assertEquals(result.pathContext.fileType, FileType.HeaderContext);
  },
);
 
/**
 * Contract: given a contribution params object, restOfCanonicalPathParams is spread into pathContext.
 * Arrange: buildBuildUploadContextParams overriding restOfCanonicalPathParams with stageSlug,
 *   sourceAnchorModelSlug and pairedModelSlug set to non-default values.
 * Act:     buildUploadContext over the contribution params.
 * Assert:  pathContext.stageSlug, sourceAnchorModelSlug and pairedModelSlug equal the overridden values.
 */
Deno.test(
  "spreads restOfCanonicalPathParams into pathContext",
  () => {
    // Arrange
    const params: BuildUploadContextParams = buildBuildUploadContextParams({
      restOfCanonicalPathParams: {
        stageSlug: DialecticStageSlug.Antithesis,
        sourceAnchorModelSlug: "anchor-model",
        pairedModelSlug: "paired-model",
      },
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isModelContributionContext(result)) {
      throw new Error("expected ModelContributionUploadContext");
    }
 
    // Assert
    assertEquals(result.pathContext.stageSlug, "antithesis");
    assertEquals(result.pathContext.sourceAnchorModelSlug, "anchor-model");
    assertEquals(result.pathContext.pairedModelSlug, "paired-model");
  },
);
 
/**
 * Contract: given a contribution params object, pathContext.isContinuation is set from
 *   isContinuationForStorage — true when the flag is true, false when the flag is false.
 * Arrange: two buildBuildUploadContextParams calls, one with isContinuationForStorage true,
 *   one with isContinuationForStorage false.
 * Act:     buildUploadContext over each.
 * Assert:  pathContext.isContinuation is true for the first, false for the second.
 */
Deno.test(
  "sets pathContext.isContinuation from isContinuationForStorage",
  () => {
    // Arrange
    const paramsTrue: BuildUploadContextParams = buildBuildUploadContextParams({
      isContinuationForStorage: true,
    });
    const paramsFalse: BuildUploadContextParams = buildBuildUploadContextParams({
      isContinuationForStorage: false,
    });
 
    // Act
    const outTrue: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(paramsTrue);
    if (!isModelContributionContext(outTrue)) {
      throw new Error("expected ModelContributionUploadContext");
    }
    const outFalse: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(paramsFalse);
    if (!isModelContributionContext(outFalse)) {
      throw new Error("expected ModelContributionUploadContext");
    }
 
    // Assert
    assertEquals(outTrue.pathContext.isContinuation, true);
    assertEquals(outFalse.pathContext.isContinuation, false);
  },
);
 
/**
 * Contract: given a contribution params object with isContinuationForStorage true,
 *   pathContext.turnIndex is set from continuationCount.
 * Arrange: buildBuildUploadContextParams overriding isContinuationForStorage to true and
 *   continuationCount to 4.
 * Act:     buildUploadContext over the contribution params.
 * Assert:  pathContext.turnIndex equals the overridden continuationCount.
 */
Deno.test(
  "sets pathContext.turnIndex from continuationCount when isContinuationForStorage is true",
  () => {
    // Arrange
    const params: BuildUploadContextParams = buildBuildUploadContextParams({
      isContinuationForStorage: true,
      continuationCount: 4,
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isModelContributionContext(result)) {
      throw new Error("expected ModelContributionUploadContext");
    }
 
    // Assert
    assertEquals(result.pathContext.turnIndex, 4);
  },
);
 
/**
 * Contract: given a contribution params object with isContinuationForStorage false,
 *   pathContext.turnIndex is undefined regardless of continuationCount.
 * Arrange: buildBuildUploadContextParams overriding isContinuationForStorage to false and
 *   continuationCount to 99 (a non-default value the function must ignore).
 * Act:     buildUploadContext over the contribution params.
 * Assert:  pathContext.turnIndex is undefined.
 */
Deno.test(
  "sets pathContext.turnIndex to undefined when isContinuationForStorage is false",
  () => {
    // Arrange
    const params: BuildUploadContextParams = buildBuildUploadContextParams({
      isContinuationForStorage: false,
      continuationCount: 99,
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isModelContributionContext(result)) {
      throw new Error("expected ModelContributionUploadContext");
    }
 
    // Assert
    assertEquals(result.pathContext.turnIndex, undefined);
  },
);
 
/**
 * Contract: given a contribution params object with sourceGroupFragment provided,
 *   pathContext carries sourceGroupFragment.
 * Arrange: buildBuildUploadContextParams overriding sourceGroupFragment to a non-default string.
 * Act:     buildUploadContext over the contribution params.
 * Assert:  pathContext.sourceGroupFragment equals the overridden value.
 */
Deno.test(
  "includes sourceGroupFragment in pathContext when provided",
  () => {
    // Arrange
    const params: BuildUploadContextParams = buildBuildUploadContextParams({
      sourceGroupFragment: "deadbeef",
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isModelContributionContext(result)) {
      throw new Error("expected ModelContributionUploadContext");
    }
 
    // Assert
    assertEquals(result.pathContext.sourceGroupFragment, "deadbeef");
  },
);
 
/**
 * Contract: given a contribution params object with sourceGroupFragment undefined,
 *   pathContext omits the sourceGroupFragment key.
 * Arrange: buildBuildUploadContextParams overriding sourceGroupFragment to undefined.
 * Act:     buildUploadContext over the contribution params.
 * Assert:  sourceGroupFragment is not a key on pathContext.
 */
Deno.test(
  "omits sourceGroupFragment from pathContext when undefined",
  () => {
    // Arrange
    const params: BuildUploadContextParams = buildBuildUploadContextParams({
      sourceGroupFragment: undefined,
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isModelContributionContext(result)) {
      throw new Error("expected ModelContributionUploadContext");
    }
 
    // Assert
    assertEquals("sourceGroupFragment" in result.pathContext, false);
  },
);
 
/**
 * Contract: given a contribution params object, fileContent is set from contentForStorage.
 * Arrange: buildBuildUploadContextParams overriding contentForStorage to a non-default string.
 * Act:     buildUploadContext over the contribution params.
 * Assert:  fileContent equals the overridden contentForStorage.
 */
Deno.test(
  "sets fileContent to contentForStorage",
  () => {
    // Arrange
    const params: BuildUploadContextParams = buildBuildUploadContextParams({
      contentForStorage: '{"k":"v"}',
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isModelContributionContext(result)) {
      throw new Error("expected ModelContributionUploadContext");
    }
 
    // Assert
    assertEquals(result.fileContent, '{"k":"v"}');
  },
);
 
/**
 * Contract: given a contribution params object with the default storageFileType, mimeType is
 *   "application/json".
 * Arrange: buildBuildUploadContextParams with no overrides.
 * Act:     buildUploadContext over the contribution params.
 * Assert:  mimeType equals "application/json".
 */
Deno.test(
  'sets mimeType to "application/json"',
  () => {
    // Arrange
    const params: BuildUploadContextParams = buildBuildUploadContextParams();
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isModelContributionContext(result)) {
      throw new Error("expected ModelContributionUploadContext");
    }
 
    // Assert
    assertEquals(result.mimeType, "application/json");
  },
);
 
/**
 * Contract: given a contribution params object, sizeBytes is set from contentForStorage.length.
 * Arrange: buildBuildUploadContextParams overriding contentForStorage to a known string.
 * Act:     buildUploadContext over the contribution params.
 * Assert:  sizeBytes equals the length of the overridden contentForStorage.
 */
Deno.test(
  "sets sizeBytes to contentForStorage.length",
  () => {
    // Arrange
    const contentForStorage = '{"x":true}';
    const params: BuildUploadContextParams = buildBuildUploadContextParams({
      contentForStorage,
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isModelContributionContext(result)) {
      throw new Error("expected ModelContributionUploadContext");
    }
 
    // Assert
    assertEquals(result.sizeBytes, contentForStorage.length);
  },
);
 
/**
 * Contract: given a contribution params object, userId is set from projectOwnerUserId.
 * Arrange: buildBuildUploadContextParams overriding projectOwnerUserId to a non-default value.
 * Act:     buildUploadContext over the contribution params.
 * Assert:  userId equals the overridden projectOwnerUserId.
 */
Deno.test(
  "sets userId to projectOwnerUserId",
  () => {
    // Arrange
    const params: BuildUploadContextParams = buildBuildUploadContextParams({
      projectOwnerUserId: "user-xyz",
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isModelContributionContext(result)) {
      throw new Error("expected ModelContributionUploadContext");
    }
 
    // Assert
    assertEquals(result.userId, "user-xyz");
  },
);
 
/**
 * Contract: given a contribution params object, contributionMetadata assembles sessionId,
 *   modelIdUsed, modelNameDisplay, stageSlug, iterationNumber, contributionType, tokensUsedInput,
 *   tokensUsedOutput, processingTimeMs, source_prompt_resource_id, target_contribution_id and
 *   document_relationships from the corresponding params fields.
 * Arrange: buildBuildUploadContextParams overriding sessionId, iterationNumber, contributionType,
 *   providerDetails (from its builder), aiResponse (from its builder), sourcePromptResourceId,
 *   targetContributionId, documentRelationships and restOfCanonicalPathParams to non-default values.
 * Act:     buildUploadContext over the contribution params.
 * Assert:  each contributionMetadata field equals the value supplied through the corresponding
 *   params field.
 */
Deno.test(
  "assembles contributionMetadata with fields from params",
  () => {
    // Arrange
    const params: BuildUploadContextParams = buildBuildUploadContextParams({
      sessionId: "s-meta",
      iterationNumber: 5,
      contributionType: "synthesis",
      providerDetails: buildBuildUploadContextProviderDetails({ id: "p-id", name: "p-name" }),
      aiResponse: buildBuildUploadContextAiResponseSlice({
        inputTokens: 1,
        outputTokens: 2,
        processingTimeMs: 3,
      }),
      sourcePromptResourceId: "spr-meta",
      targetContributionId: "tgt-meta",
      documentRelationships: { r: 1 },
      restOfCanonicalPathParams: {
        stageSlug: DialecticStageSlug.Synthesis,
      },
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isModelContributionContext(result)) {
      throw new Error("expected ModelContributionUploadContext");
    }
 
    // Assert
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
 
/**
 * Contract: given a contribution params object, contributionMetadata.isIntermediate is set from
 *   params.isIntermediate — true when the flag is true, false when the flag is false.
 * Arrange: two buildBuildUploadContextParams calls, one with isIntermediate true, one with false.
 * Act:     buildUploadContext over each.
 * Assert:  contributionMetadata.isIntermediate is true for the first, false for the second.
 */
Deno.test(
  "sets contributionMetadata.isIntermediate from params",
  () => {
    // Arrange
    const paramsTrue: BuildUploadContextParams = buildBuildUploadContextParams({
      isIntermediate: true,
    });
    const paramsFalse: BuildUploadContextParams = buildBuildUploadContextParams({
      isIntermediate: false,
    });
 
    // Act
    const outTrue: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(paramsTrue);
    if (!isModelContributionContext(outTrue)) {
      throw new Error("expected ModelContributionUploadContext");
    }
    const outFalse: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(paramsFalse);
    if (!isModelContributionContext(outFalse)) {
      throw new Error("expected ModelContributionUploadContext");
    }
 
    // Assert
    assertEquals(outTrue.contributionMetadata.isIntermediate, true);
    assertEquals(outFalse.contributionMetadata.isIntermediate, false);
  },
);
 
/**
 * Contract: given a resource params object, the path context assembles projectId, fileType,
 *   sessionId, iteration, stageSlug, output_type, sourceType and documentKey from the corresponding
 *   params fields.
 * Arrange: buildBuildUploadContextResourceParams overriding projectId, storageFileType, sessionId,
 *   iterationNumber, stageSlug, output_type, sourceType and documentKey to non-default values.
 * Act:     buildUploadContext over the resource params.
 * Assert:  each pathContext field equals the overridden value.
 */
Deno.test(
  "resource arm: pathContext maps projectId/fileType/sessionId/iteration/stageSlug/output_type/sourceType/documentKey from params",
  () => {
    // Arrange
    const params: BuildUploadContextResourceParams = buildBuildUploadContextResourceParams({
      projectId: "proj-rc",
      storageFileType: FileType.CompressedContextRawJson,
      sessionId: "sess-rc",
      iterationNumber: 3,
      stageSlug: DialecticStageSlug.Synthesis,
      output_type: FileType.technical_approach,
      sourceType: "contribution",
      documentKey: FileType.business_case,
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isResourceContext(result)) {
      throw new Error("expected ResourceUploadContext");
    }
 
    // Assert
    assertEquals(result.pathContext.projectId, "proj-rc");
    assertEquals(result.pathContext.fileType, FileType.CompressedContextRawJson);
    assertEquals(result.pathContext.sessionId, "sess-rc");
    assertEquals(result.pathContext.iteration, 3);
    assertEquals(result.pathContext.stageSlug, DialecticStageSlug.Synthesis);
    assertEquals(result.pathContext.output_type, FileType.technical_approach);
    assertEquals(result.pathContext.sourceType, "contribution");
    assertEquals(result.pathContext.documentKey, FileType.business_case);
  },
);
 
/**
 * Contract: given a resource params object, the return passes isResourceContext, fails
 *   isModelContributionContext, and carries no contributionMetadata key.
 * Arrange: buildBuildUploadContextResourceParams with no overrides.
 * Act:     buildUploadContext over the resource params.
 * Assert:  isResourceContext is true, isModelContributionContext is false, contributionMetadata
 *   is not a key on the result.
 */
Deno.test(
  "resource arm: return passes isResourceContext and fails isModelContributionContext; no contributionMetadata key",
  () => {
    // Arrange
    const params: BuildUploadContextResourceParams = buildBuildUploadContextResourceParams();
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
 
    // Assert
    assertEquals(isResourceContext(result), true);
    assertEquals(isModelContributionContext(result), false);
    assertEquals("contributionMetadata" in result, false);
  },
);
 
/**
 * Contract: given a resource params object, mimeType is "application/json" when storageFileType is
 *   CompressedContextRawJson and "text/markdown" when storageFileType is CompressedContext.
 * Arrange: two buildBuildUploadContextResourceParams calls, one overriding storageFileType to
 *   CompressedContextRawJson, one to CompressedContext.
 * Act:     buildUploadContext over each.
 * Assert:  mimeType is "application/json" for the first, "text/markdown" for the second.
 */
Deno.test(
  "resource arm: mime selection — CompressedContextRawJson yields application/json, CompressedContext yields text/markdown",
  () => {
    // Arrange
    const paramsJson: BuildUploadContextResourceParams = buildBuildUploadContextResourceParams({
      storageFileType: FileType.CompressedContextRawJson,
    });
    const paramsMd: BuildUploadContextResourceParams = buildBuildUploadContextResourceParams({
      storageFileType: FileType.CompressedContext,
    });
 
    // Act
    const resultJson: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(paramsJson);
    if (!isResourceContext(resultJson)) {
      throw new Error("expected ResourceUploadContext");
    }
    const resultMd: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(paramsMd);
    if (!isResourceContext(resultMd)) {
      throw new Error("expected ResourceUploadContext");
    }
 
    // Assert
    assertEquals(resultJson.mimeType, "application/json");
    assertEquals(resultMd.mimeType, "text/markdown");
  },
);
 
/**
 * Contract: given a resource params object, fileContent, sizeBytes, userId and description are
 *   passed through from the corresponding params fields, and the result carries no
 *   resourceTypeForDb or resourceDescriptionForDb key.
 * Arrange: buildBuildUploadContextResourceParams overriding contentForStorage, projectOwnerUserId
 *   and description to non-default values.
 * Act:     buildUploadContext over the resource params.
 * Assert:  fileContent, sizeBytes, userId and description equal the overridden values;
 *   resourceTypeForDb and resourceDescriptionForDb are not keys on the result.
 */
Deno.test(
  "resource arm: fileContent/sizeBytes/userId/description passthrough; no resourceTypeForDb or resourceDescriptionForDb",
  () => {
    // Arrange
    const params: BuildUploadContextResourceParams = buildBuildUploadContextResourceParams({
      contentForStorage: '{"z":9}',
      projectOwnerUserId: "user-rp",
      description: "desc-rp",
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isResourceContext(result)) {
      throw new Error("expected ResourceUploadContext");
    }
 
    // Assert
    assertEquals(result.fileContent, '{"z":9}');
    assertEquals(result.sizeBytes, '{"z":9}'.length);
    assertEquals(result.userId, "user-rp");
    assertEquals(result.description, "desc-rp");
    assertEquals("resourceTypeForDb" in result, false);
    assertEquals("resourceDescriptionForDb" in result, false);
  },
);
 
/**
 * Contract: given a resource params object, chunkIndex and chunkTotal flow onto pathContext
 *   verbatim when provided, and stay undefined when not provided.
 * Arrange: two buildBuildUploadContextResourceParams calls, one overriding chunkIndex and
 *   chunkTotal to non-default values, one overriding both to undefined.
 * Act:     buildUploadContext over each.
 * Assert:  pathContext.chunkIndex and chunkTotal equal the overridden values for the first;
 *   both are undefined for the second.
 */
Deno.test(
  "resource arm: chunk lineage — chunkIndex/chunkTotal flow onto pathContext verbatim; both undefined stay undefined",
  () => {
    // Arrange
    const paramsChunks: BuildUploadContextResourceParams = buildBuildUploadContextResourceParams({
      chunkIndex: 2,
      chunkTotal: 3,
    });
    const paramsNoChunks: BuildUploadContextResourceParams = buildBuildUploadContextResourceParams({
      chunkIndex: undefined,
      chunkTotal: undefined,
    });
 
    // Act
    const resultChunks: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(paramsChunks);
    if (!isResourceContext(resultChunks)) {
      throw new Error("expected ResourceUploadContext");
    }
    const resultNoChunks: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(paramsNoChunks);
    if (!isResourceContext(resultNoChunks)) {
      throw new Error("expected ResourceUploadContext");
    }
 
    // Assert
    assertEquals(resultChunks.pathContext.chunkIndex, 2);
    assertEquals(resultChunks.pathContext.chunkTotal, 3);
    assertEquals(resultNoChunks.pathContext.chunkIndex, undefined);
    assertEquals(resultNoChunks.pathContext.chunkTotal, undefined);
  },
);
 
/**
 * Contract: given a resource params object with sourceType 'history', pathContext.sourceId is set
 *   from sourceId and documentKey is undefined.
 * Arrange: buildBuildUploadContextResourceParams overriding sourceType to "history", sourceId to
 *   a non-default string, and documentKey to undefined.
 * Act:     buildUploadContext over the resource params.
 * Assert:  pathContext.sourceType is "history", sourceId equals the overridden value, documentKey
 *   is undefined.
 */
Deno.test(
  "resource arm: sourceType 'history' with sourceId and no documentKey — pathContext.sourceId set, documentKey undefined",
  () => {
    // Arrange
    const params: BuildUploadContextResourceParams = buildBuildUploadContextResourceParams({
      sourceType: "history",
      sourceId: "src-hist",
      documentKey: undefined,
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isResourceContext(result)) {
      throw new Error("expected ResourceUploadContext");
    }
 
    // Assert
    assertEquals(result.pathContext.sourceType, "history");
    assertEquals(result.pathContext.sourceId, "src-hist");
    assertEquals(result.pathContext.documentKey, undefined);
  },
);
 
/**
 * Contract: given a resource params object with sourceType 'feedback', pathContext carries
 *   documentKey from the params field and undefined sourceId and role.
 * Arrange: buildBuildUploadContextResourceParams overriding sourceType to "feedback", documentKey
 *   to business_case_critique, and sourceId to undefined.
 * Act:     buildUploadContext over the resource params.
 * Assert:  pathContext.sourceType is "feedback", documentKey equals the overridden value, sourceId
 *   is undefined, role is undefined.
 */
Deno.test(
  "resource arm: feedback sourceType produces pathContext with documentKey and undefined sourceId and role",
  () => {
    // Arrange
    const params: BuildUploadContextResourceParams = buildBuildUploadContextResourceParams({
      sourceType: "feedback",
      documentKey: FileType.business_case_critique,
      sourceId: undefined,
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isResourceContext(result)) {
      throw new Error("expected ResourceUploadContext");
    }
 
    // Assert
    assertEquals(result.pathContext.sourceType, "feedback");
    assertEquals(result.pathContext.documentKey, FileType.business_case_critique);
    assertEquals(result.pathContext.sourceId, undefined);
    assertEquals(result.pathContext.role, undefined);
  },
);
 
/**
 * Contract: given a resource params object with sourceType 'history' and a role, pathContext
 *   carries sourceId and role alongside undefined documentKey.
 * Arrange: buildBuildUploadContextResourceParams overriding sourceType to "history", sourceId to
 *   a non-default string, role to "assistant", and documentKey to undefined.
 * Act:     buildUploadContext over the resource params.
 * Assert:  pathContext.sourceType is "history", sourceId equals the overridden value, role is
 *   "assistant", documentKey is undefined.
 */
Deno.test(
  "resource arm: history sourceType with role produces pathContext carrying sourceId and role",
  () => {
    // Arrange
    const params: BuildUploadContextResourceParams = buildBuildUploadContextResourceParams({
      sourceType: "history",
      sourceId: "src-hist",
      role: "assistant",
      documentKey: undefined,
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isResourceContext(result)) {
      throw new Error("expected ResourceUploadContext");
    }
 
    // Assert
    assertEquals(result.pathContext.sourceType, "history");
    assertEquals(result.pathContext.sourceId, "src-hist");
    assertEquals(result.pathContext.role, "assistant");
    assertEquals(result.pathContext.documentKey, undefined);
  },
);
 
/**
 * Contract: given a resource params object with sourceType 'history', a role and chunk fields,
 *   pathContext carries sourceId, role, chunkIndex and chunkTotal alongside undefined documentKey.
 * Arrange: buildBuildUploadContextResourceParams overriding sourceType to "history", sourceId to
 *   a non-default string, role to "user", documentKey to undefined, chunkIndex to 1 and chunkTotal
 *   to 3.
 * Act:     buildUploadContext over the resource params.
 * Assert:  pathContext.sourceType is "history", sourceId equals the overridden value, role is
 *   "user", chunkIndex is 1, chunkTotal is 3.
 */
Deno.test(
  "resource arm: chunked history params carry role alongside chunkIndex/chunkTotal on pathContext",
  () => {
    // Arrange
    const params: BuildUploadContextResourceParams = buildBuildUploadContextResourceParams({
      sourceType: "history",
      sourceId: "src-hist",
      role: "user",
      documentKey: undefined,
      chunkIndex: 1,
      chunkTotal: 3,
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isResourceContext(result)) {
      throw new Error("expected ResourceUploadContext");
    }
 
    // Assert
    assertEquals(result.pathContext.sourceType, "history");
    assertEquals(result.pathContext.sourceId, "src-hist");
    assertEquals(result.pathContext.role, "user");
    assertEquals(result.pathContext.chunkIndex, 1);
    assertEquals(result.pathContext.chunkTotal, 3);
  },
);
 
/**
 * Contract: given a resource params object with sourceType 'contribution', pathContext carries no
 *   role key.
 * Arrange: buildBuildUploadContextResourceParams overriding sourceType to "contribution",
 *   documentKey to feature_spec, and sourceId to undefined.
 * Act:     buildUploadContext over the resource params.
 * Assert:  pathContext.sourceType is "contribution", role is undefined.
 */
Deno.test(
  "resource arm: contribution-sourced build produces pathContext with no role key",
  () => {
    // Arrange
    const params: BuildUploadContextResourceParams = buildBuildUploadContextResourceParams({
      sourceType: "contribution",
      documentKey: FileType.feature_spec,
      sourceId: undefined,
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isResourceContext(result)) {
      throw new Error("expected ResourceUploadContext");
    }
 
    // Assert
    assertEquals(result.pathContext.sourceType, "contribution");
    assertEquals(result.pathContext.role, undefined);
  },
);
 
/**
 * Contract: given a resource params object carrying a string sourcePromptResourceId, the resource
 *   arm returns a context whose sourcePromptResourceId is that string.
 * Arrange: buildBuildUploadContextResourceParams overriding sourcePromptResourceId to a non-default
 *   string.
 * Act:     buildUploadContext over the resource params.
 * Assert:  result.sourcePromptResourceId equals the overridden string.
 */
Deno.test(
  "resource arm: sourcePromptResourceId set from params when a string is provided",
  () => {
    // Arrange
    const params: BuildUploadContextResourceParams = buildBuildUploadContextResourceParams({
      sourcePromptResourceId: "spr-resource-1",
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isResourceContext(result)) {
      throw new Error("expected ResourceUploadContext");
    }
 
    // Assert
    assertEquals(result.sourcePromptResourceId, "spr-resource-1");
  },
);
 
/**
 * Contract: given a resource params object carrying undefined sourcePromptResourceId, the resource
 *   arm returns a context whose sourcePromptResourceId is undefined.
 * Arrange: buildBuildUploadContextResourceParams overriding sourcePromptResourceId to undefined.
 * Act:     buildUploadContext over the resource params.
 * Assert:  result.sourcePromptResourceId is undefined.
 */
Deno.test(
  "resource arm: sourcePromptResourceId is undefined when params carry undefined",
  () => {
    // Arrange
    const params: BuildUploadContextResourceParams = buildBuildUploadContextResourceParams({
      sourcePromptResourceId: undefined,
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isResourceContext(result)) {
      throw new Error("expected ResourceUploadContext");
    }
 
    // Assert
    assertEquals(result.sourcePromptResourceId, undefined);
  },
);
 
/**
 * Contract: given a resource params object, pathContext does not carry sourcePromptResourceId,
 *   pinning that the value rides the upload context rather than the path.
 * Arrange: buildBuildUploadContextResourceParams overriding sourcePromptResourceId to a non-default
 *   string.
 * Act:     buildUploadContext over the resource params.
 * Assert:  sourcePromptResourceId is not a key on pathContext.
 */
Deno.test(
  "resource arm: pathContext carries no sourcePromptResourceId",
  () => {
    // Arrange
    const params: BuildUploadContextResourceParams = buildBuildUploadContextResourceParams({
      sourcePromptResourceId: "spr-path-none",
    });
 
    // Act
    const result: ModelContributionUploadContext | ResourceUploadContext = buildUploadContext(params);
    if (!isResourceContext(result)) {
      throw new Error("expected ResourceUploadContext");
    }
 
    // Assert
    assertEquals("sourcePromptResourceId" in result.pathContext, false);
  },
);
