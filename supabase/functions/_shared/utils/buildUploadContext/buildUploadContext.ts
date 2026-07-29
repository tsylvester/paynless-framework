import type { ModelContributionUploadContext, ResourceUploadContext } from "../../types/file_manager.types.ts";
import type { BuildUploadContextParams, BuildUploadContextResourceParams } from "./buildUploadContext.interface.ts";
import { isCompressedContextRawJsonFileType } from "../type-guards/type_guards.file_manager.ts";

export function buildUploadContext(
  params: BuildUploadContextParams | BuildUploadContextResourceParams,
): ModelContributionUploadContext | ResourceUploadContext {
  if ("restOfCanonicalPathParams" in params) {
    const pathContext: ModelContributionUploadContext["pathContext"] = {
      projectId: params.projectId,
      fileType: params.storageFileType,
      sessionId: params.sessionId,
      iteration: params.iterationNumber,
      modelSlug: params.modelSlug,
      attemptCount: params.attemptCount,
      ...params.restOfCanonicalPathParams,
      documentKey: params.documentKey,
      contributionType: params.contributionType,
      isContinuation: params.isContinuationForStorage,
      turnIndex: params.isContinuationForStorage
        ? params.continuationCount
        : undefined,
      ...(params.sourceGroupFragment
        ? { sourceGroupFragment: params.sourceGroupFragment }
        : {}),
    };

    return {
      pathContext,
      fileContent: params.contentForStorage,
      mimeType: "application/json",
      sizeBytes: params.contentForStorage.length,
      userId: params.projectOwnerUserId,
      description: params.description,
      contributionMetadata: {
        sessionId: params.sessionId,
        modelIdUsed: params.providerDetails.id,
        modelNameDisplay: params.providerDetails.name,
        stageSlug: params.restOfCanonicalPathParams.stageSlug,
        iterationNumber: params.iterationNumber,
        contributionType: params.contributionType,
        tokensUsedInput: params.aiResponse.inputTokens,
        tokensUsedOutput: params.aiResponse.outputTokens,
        processingTimeMs: params.aiResponse.processingTimeMs,
        source_prompt_resource_id: params.sourcePromptResourceId,
        target_contribution_id: params.targetContributionId,
        document_relationships: params.documentRelationships,
        isIntermediate: params.isIntermediate,
      },
    };
  }

  const pathContext: ResourceUploadContext["pathContext"] = {
    projectId: params.projectId,
    fileType: params.storageFileType,
    sessionId: params.sessionId,
    iteration: params.iterationNumber,
    stageSlug: params.stageSlug,
    targetKey: params.targetKey,
    sourceType: params.sourceType,
    documentKey: params.documentKey,
    sourceId: params.sourceId,
    role: params.role,
    chunkIndex: params.chunkIndex,
    chunkTotal: params.chunkTotal,
  };

  return {
    pathContext,
    fileContent: params.contentForStorage,
    mimeType: isCompressedContextRawJsonFileType(params.storageFileType)
      ? "application/json"
      : "text/markdown",
    sizeBytes: params.contentForStorage.length,
    userId: params.projectOwnerUserId,
    description: params.description,
  };
}
