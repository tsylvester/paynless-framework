// supabase/functions/dialectic-worker/compressPrompt/compressPrompt.ts

import type { Messages } from "../../_shared/types.ts";
import type { CountableChatPayload, CountTokensDeps } from "../../_shared/types/tokenizer.types.ts";
import type { ResourceDocument } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.interface.ts";
import { ContextWindowError } from "../../_shared/utils/errors.ts";
import { isDialecticStageSlug, isModelContributionFileType } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type { CompressionSourceType, PathContext } from "../../_shared/types/file_manager.types.ts";
import { isGetSortedCompressionCandidatesErrorReturn } from "../../_shared/utils/vector_utils/vector_utils.guard.ts";
import {
  isCompressibleSourceReturn,
  isResolveCompressionSourceErrorReturn,
} from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.guard.ts";
import { isenqueueCompressJobsErrorReturn } from "../enqueueCompressJobs/enqueueCompressJobs.guard.ts";
import { isDialecticExecuteJobPayload } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import type { DialecticExecuteJobPayload } from "../../dialectic-service/dialectic.interface.ts";
import type {
  CompressPromptDeps,
  CompressPromptParams,
  CompressPromptPayload,
  CompressPromptReturn,
} from "./compressPrompt.interface.ts";
import type {
  enqueueCompressJobsParams,
  enqueueCompressJobsPayload,
  enqueueCompressJobsVictim,
} from "../enqueueCompressJobs/enqueueCompressJobs.interface.ts";
import type { CompressionCandidate } from "../../_shared/utils/vector_utils/vector_utils.interface.ts";

export async function compressPrompt(
  deps: CompressPromptDeps,
  params: CompressPromptParams,
  payload: CompressPromptPayload,
): Promise<CompressPromptReturn> {
  const tokenizerDeps: CountTokensDeps = {
    getEncoding: (_name: string) => ({
      encode: (input: string) => Array.from(input ?? "", (_ch, index: number) => index),
    }),
    countTokensAnthropic: (text: string) => (text ?? "").length,
    logger: deps.logger,
  };

  let parentJobPayload: DialecticExecuteJobPayload;
  try {
    if (!isDialecticExecuteJobPayload(payload.parentJob.payload)) {
      return {
        error: new ContextWindowError("parentJob.payload is not a valid DialecticExecuteJobPayload"),
        retriable: false,
      };
    }
    parentJobPayload = payload.parentJob.payload;
  } catch (err) {
    const message: string = err instanceof Error ? err.message : String(err);
    return {
      error: new ContextWindowError(`parentJob.payload is not a valid DialecticExecuteJobPayload: ${message}`),
      retriable: false,
    };
  }

  const stageSlugRaw: string | undefined = parentJobPayload.stageSlug;
  if (stageSlugRaw !== undefined && !isDialecticStageSlug(stageSlugRaw)) {
    return {
      error: new ContextWindowError("parentJob.payload.stageSlug is not a valid DialecticStageSlug"),
      retriable: false,
    };
  }

  const storageBucket: string | undefined = Deno.env.get("SB_CONTENT_STORAGE_BUCKET");
  if (storageBucket === undefined) {
    return {
      error: new ContextWindowError("SB_CONTENT_STORAGE_BUCKET env var is not set"),
      retriable: false,
    };
  }

  const sessionPathContext: Pick<PathContext, "projectId" | "fileType" | "sessionId" | "iteration" | "stageSlug" | "output_type"> = {
    projectId: parentJobPayload.projectId,
    fileType: FileType.CompressedContext,
    sessionId: parentJobPayload.sessionId,
    iteration: parentJobPayload.iterationNumber,
    stageSlug: stageSlugRaw,
    output_type: parentJobPayload.output_type,
  };

  const artifactIds: Set<string> = new Set();

  const overlaidDocs: ResourceDocument[] = await Promise.all(
    payload.resourceDocuments.map(async (doc): Promise<ResourceDocument> => {
      const sourceType: CompressionSourceType | undefined =
        doc.type === "document" || doc.type === "project_resource" ? "resource"
        : doc.type === "feedback" ? "feedback"
        : undefined;
      if (sourceType === undefined) {
        return doc;
      }
      const perArtifactContext: PathContext = {
        ...sessionPathContext,
        sourceType,
        documentKey: doc.document_key,
      };
      const constructedPath = deps.constructStoragePath(perArtifactContext);
      const fullPath: string = `${constructedPath.storagePath}/${constructedPath.fileName}`;
      const downloadResult = await deps.downloadFromStorage(params.dbClient, storageBucket, fullPath);
      if (downloadResult.error !== null || downloadResult.data === null) {
        return doc;
      }
      artifactIds.add(doc.id);
      return { ...doc, content: new TextDecoder().decode(downloadResult.data) };
    }),
  );

  const overlaidHistory: Messages[] = await Promise.all(
    payload.conversationHistory.map(async (msg): Promise<Messages> => {
      if (msg.id === undefined) {
        return msg;
      }
      const perArtifactContext: PathContext = {
        ...sessionPathContext,
        sourceType: "history",
        sourceId: msg.id,
        role: msg.role,
      };
      const constructedPath = deps.constructStoragePath(perArtifactContext);
      const fullPath: string = `${constructedPath.storagePath}/${constructedPath.fileName}`;
      const downloadResult = await deps.downloadFromStorage(params.dbClient, storageBucket, fullPath);
      if (downloadResult.error !== null || downloadResult.data === null) {
        return msg;
      }
      artifactIds.add(msg.id);
      return { ...msg, content: new TextDecoder().decode(downloadResult.data) };
    }),
  );

  const countablePayload: CountableChatPayload = {
    message: payload.currentUserPrompt,
    messages: overlaidHistory,
    resourceDocuments: overlaidDocs,
  };
  const resolvedInputTokenCount: number = deps.countTokens(
    tokenizerDeps,
    countablePayload,
    payload.extendedModelConfig,
  );

  if (resolvedInputTokenCount <= params.finalTargetThreshold) {
    return {
      fits: true,
      resourceDocuments: overlaidDocs,
      conversationHistory: overlaidHistory,
      resolvedInputTokenCount,
    };
  }

  const scorerReturn = await deps.getSortedCompressionCandidates(
    { inputsRelevance: payload.inputsRelevance, modelConfig: payload.extendedModelConfig },
    { documents: payload.resourceDocuments, history: payload.conversationHistory },
  );

  if (isGetSortedCompressionCandidatesErrorReturn(scorerReturn)) {
    return { error: scorerReturn.error, retriable: scorerReturn.retriable };
  }

  const eligibleCandidates: CompressionCandidate[] = scorerReturn.candidates.filter(
    (c: CompressionCandidate) => !artifactIds.has(c.id),
  );

  if (eligibleCandidates.length === 0) {
    return {
      error: new ContextWindowError("All candidates exhausted but prompt still exceeds threshold"),
      retriable: false,
    };
  }

  const candidate: CompressionCandidate = eligibleCandidates[0];

  let victim: enqueueCompressJobsVictim;

  if (candidate.sourceType === "history") {
    const message: Messages | undefined = payload.conversationHistory.find(
      (m: Messages) => m.id === candidate.id,
    );
    if (message === undefined) {
      return {
        error: new ContextWindowError("Selected history candidate has no corresponding message"),
        retriable: false,
      };
    }
    victim = {
      mode: "text",
      content: candidate.content,
      sourceType: "history",
      sourceId: message.id,
      role: message.role,
    };
  } else {
    const doc: ResourceDocument | undefined = payload.resourceDocuments.find(
      (d: ResourceDocument) => d.id === candidate.id,
    );
    if (doc === undefined) {
      return {
        error: new ContextWindowError("Selected document candidate has no corresponding resource document"),
        retriable: false,
      };
    }

    const resolveReturn = deps.resolveCompressionSource({}, { document: doc });

    if (isResolveCompressionSourceErrorReturn(resolveReturn)) {
      return { error: resolveReturn.error, retriable: resolveReturn.retriable };
    }

    if (!isCompressibleSourceReturn(resolveReturn)) {
      return {
        error: new ContextWindowError("Selected candidate is not an admissible compression source"),
        retriable: false,
      };
    }

    if (doc.type === "document") {
      if (!isModelContributionFileType(doc.document_key) || !isDialecticStageSlug(doc.stage_slug)) {
        return {
          error: new ContextWindowError("Document victim carries an identity that cannot address a json-mode compression"),
          retriable: false,
        };
      }
      victim = {
        mode: "json",
        content: candidate.content,
        sourceType: resolveReturn.sourceType,
        documentKey: resolveReturn.documentKey,
        docType: doc.document_key,
        sourceStageSlug: doc.stage_slug,
      };
    } else {
      victim = {
        mode: "text",
        content: candidate.content,
        sourceType: resolveReturn.sourceType,
        documentKey: resolveReturn.documentKey,
      };
    }
  }

  const enqueueParams: enqueueCompressJobsParams = { dbClient: params.dbClient };
  const enqueuePayload: enqueueCompressJobsPayload = {
    victim,
    parentJob: payload.parentJob,
    modelConfig: payload.extendedModelConfig,
  };

  const enqueueReturn = await deps.enqueueCompressJobs(enqueueParams, enqueuePayload);

  if (isenqueueCompressJobsErrorReturn(enqueueReturn)) {
    return { error: enqueueReturn.error, retriable: enqueueReturn.retriable };
  }

  await params.dbClient
    .from("dialectic_generation_jobs")
    .update({ status: "waiting_for_children" })
    .eq("id", payload.parentJob.id);

  return { fits: false };
}
