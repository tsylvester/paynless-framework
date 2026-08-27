import { constructStoragePath } from "../../_shared/utils/path_constructor.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type { Messages } from "../../_shared/types.ts";
import type { ResourceDocument } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import {
  isCompressibleSourceReturn,
  isResolveCompressionSourceErrorReturn,
} from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import type {
  ApplyCompressionOverlayDeps,
  ApplyCompressionOverlayParams,
  ApplyCompressionOverlayPayload,
  ApplyCompressionOverlaySuccessReturn,
  ApplyCompressionOverlayErrorReturn,
  ApplyCompressionOverlayReturn,
} from "./applyCompressionOverlay.interface.ts";

const COMPRESSION_BUCKET = "dialectic-contributions";

export async function applyCompressionOverlay(
  deps: ApplyCompressionOverlayDeps,
  params: ApplyCompressionOverlayParams,
  payload: ApplyCompressionOverlayPayload,
): Promise<ApplyCompressionOverlayReturn> {
  let overlaidCount = 0;
  const overlaidDocuments: ResourceDocument[] = [];
  const overlaidHistory: Messages[] = [];

  try {
    for (const doc of payload.resourceDocuments) {
      const resolved = deps.resolveCompressionSource({}, { document: doc });

      if (isResolveCompressionSourceErrorReturn(resolved)) {
        const errorReturn: ApplyCompressionOverlayErrorReturn = {
          error: resolved.error,
          retriable: resolved.retriable,
        };
        return errorReturn;
      }

      if (!isCompressibleSourceReturn(resolved)) {
        overlaidDocuments.push({ ...doc });
        continue;
      }

      const path = constructStoragePath({
        projectId: params.projectId,
        fileType: FileType.CompressedContext,
        sessionId: params.sessionId,
        iteration: params.iterationNumber,
        stageSlug: params.stageSlug,
        output_type: params.output_type,
        sourceType: resolved.sourceType,
        documentKey: resolved.documentKey,
      });

      const fullPath = `${path.storagePath}/${path.fileName}`;
      const result = await deps.downloadFromStorage(
        params.dbClient,
        COMPRESSION_BUCKET,
        fullPath,
      );

      if (result.data !== null && result.error === null) {
        const compressedContent = new TextDecoder().decode(result.data);
        deps.logger.info("applyCompressionOverlay: document overlay hit", {
          documentId: doc.id,
          path: fullPath,
        });
        overlaidDocuments.push({ ...doc, content: compressedContent });
        overlaidCount += 1;
      } else {
        deps.logger.debug("applyCompressionOverlay: document overlay miss", {
          documentId: doc.id,
          path: fullPath,
        });
        overlaidDocuments.push({ ...doc });
      }
    }

    for (const message of payload.conversationHistory) {
      if (
        message.id === undefined ||
        message.role === "system" ||
        message.role === "function"
      ) {
        overlaidHistory.push({ ...message });
        continue;
      }

      const path = constructStoragePath({
        projectId: params.projectId,
        fileType: FileType.CompressedContext,
        sessionId: params.sessionId,
        iteration: params.iterationNumber,
        stageSlug: params.stageSlug,
        output_type: params.output_type,
        sourceType: "history",
        sourceId: message.id,
        role: message.role,
      });

      const fullPath = `${path.storagePath}/${path.fileName}`;
      const result = await deps.downloadFromStorage(
        params.dbClient,
        COMPRESSION_BUCKET,
        fullPath,
      );

      if (result.data !== null && result.error === null) {
        const compressedContent = new TextDecoder().decode(result.data);
        deps.logger.info("applyCompressionOverlay: message overlay hit", {
          messageId: message.id,
          path: fullPath,
        });
        overlaidHistory.push({ ...message, content: compressedContent });
        overlaidCount += 1;
      } else {
        deps.logger.debug("applyCompressionOverlay: message overlay miss", {
          messageId: message.id,
          path: fullPath,
        });
        overlaidHistory.push({ ...message });
      }
    }
  } catch (err: unknown) {
    let error: Error;
    if (err instanceof Error) {
      error = err;
    } else {
      error = new Error(String(err));
    }
    const errorReturn: ApplyCompressionOverlayErrorReturn = {
      error,
      retriable: false,
    };
    return errorReturn;
  }

  const successReturn: ApplyCompressionOverlaySuccessReturn = {
    resourceDocuments: overlaidDocuments,
    conversationHistory: overlaidHistory,
    overlaidCount,
  };
  return successReturn;
}
