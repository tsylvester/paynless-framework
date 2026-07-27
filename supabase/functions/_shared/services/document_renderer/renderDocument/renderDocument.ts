import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Buffer } from "https://deno.land/std@0.177.0/node/buffer.ts";
import type { Database } from "../../../../types_db.ts";
import { FileType, type PathContext } from "../../../types/file_manager.types.ts";
import type { ResourceUploadContext } from "../../../types/file_manager.types.ts";
import type {
  RenderDocumentParams,
  RenderCompressedContextParams,
  RenderDocumentResult,
  DocumentRendererDeps,
} from "./renderDocument.interface.ts";
import { renderStructuredDocument } from "../renderStructuredDocument/renderStructuredDocument.ts";
import { sanitizeJsonContent } from "../../../utils/jsonSanitizer/jsonSanitizer.ts";
import { constructStoragePath } from "../../../utils/path_constructor.ts";
import { buildUploadContext } from "../../../utils/buildUploadContext/buildUploadContext.ts";
import { isRecord } from "../../../utils/type_guards.ts";
import { isResourceContext } from "../../../utils/type-guards/type_guards.file_manager.ts";
import { isRenderCompressedContextParams } from "./renderDocument.guard.ts";

export async function renderDocument(
  dbClient: SupabaseClient<Database>,
  deps: DocumentRendererDeps,
  params: RenderDocumentParams | RenderCompressedContextParams,
): Promise<RenderDocumentResult> {
  if (isRenderCompressedContextParams(params)) {
    const {
      projectId,
      sessionId,
      iterationNumber,
      stageSlug,
      targetKey,
      sourceType,
      documentKey,
      template_filename,
    } = params;

    // Step 1: Construct storage path for the raw JSON artifact
    const artifact = constructStoragePath({
      projectId,
      fileType: FileType.CompressedContextRawJson,
      sessionId,
      iteration: iterationNumber,
      stageSlug,
      targetKey,
      sourceType,
      documentKey,
    });

    // Step 2: Query dialectic_project_resources for the raw JSON row
    const { data: row, error: queryError } = await dbClient
      .from("dialectic_project_resources")
      .select("id, storage_bucket, storage_path, file_name")
      .eq("storage_path", artifact.storagePath)
      .eq("file_name", artifact.fileName)
      .maybeSingle();

    if (queryError) {
      throw queryError;
    }

    if (!row) {
      throw new Error(
        `No compressed context raw JSON found at path: ${artifact.storagePath}/${artifact.fileName}`,
      );
    }

    // Step 3: Download the raw JSON from storage
    const downloadResult = await deps.downloadFromStorage(
      dbClient,
      row.storage_bucket,
      `${row.storage_path}/${row.file_name}`,
    );

    if (downloadResult.error) {
      throw downloadResult.error;
    }

    if (!downloadResult.data) {
      throw new Error(
        `No data returned from storage download for path: ${row.storage_path}/${row.file_name}`,
      );
    }

    const decodedText = new TextDecoder().decode(downloadResult.data);

    // Step 4: Sanitize, parse, unwrap, and normalize
    const sanitizationResult = sanitizeJsonContent(decodedText);
    if (!sanitizationResult || typeof sanitizationResult.sanitized !== "string") {
      throw new Error("Failed to sanitize compressed context JSON content");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(sanitizationResult.sanitized);
    } catch (e) {
      throw new Error(
        `Failed to parse compressed context JSON: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    if (!isRecord(parsed)) {
      throw new Error("Compressed context JSON parsed to a non-record value");
    }

    const record: Record<string, unknown> = isRecord(parsed.content) ? parsed.content : parsed;
    delete record.continuation_needed;
    delete record.stop_reason;

    for (const key in record) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        const value = record[key];
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
          record[key] = value.join("\n\n");
        }
      }
    }

    // Step 5: Load document template (delegated)
    const templateResult = await deps.loadDocumentTemplate(
      { downloadFromStorage: deps.downloadFromStorage },
      { dbClient },
      { projectId, templateFilename: template_filename },
    );
    if ("error" in templateResult) {
      throw templateResult.error;
    }
    const { templateText } = templateResult;

    // Step 6: Render structured document and encode
    const rendered = renderStructuredDocument(templateText, record, documentKey);
    const renderedBytes = new TextEncoder().encode(rendered);

    // Step 7: Build upload context, narrow, and persist
    const context = buildUploadContext({
      projectId,
      storageFileType: FileType.CompressedContext,
      sessionId,
      iterationNumber,
      stageSlug,
      targetKey,
      sourceType,
      documentKey,
      sourceId: undefined,
      chunkIndex: undefined,
      chunkTotal: undefined,
      contentForStorage: rendered,
      projectOwnerUserId: deps.notifyUserId,
      description: `Compressed context for ${stageSlug}:${String(targetKey)}`,
    });

    if (!isResourceContext(context)) {
      throw new Error("Failed to build a valid ResourceUploadContext for compressed context");
    }

    const uploadResult = await deps.fileManager.uploadAndRegisterFile(context);

    if (uploadResult.error) {
      const error = uploadResult.error;
      let errorMessage = `Failed to save rendered document: ${error.message}`;

      if ("details" in error && typeof error.details === "string") {
        errorMessage += ` (${error.details})`;
      }

      if ("code" in error && typeof error.code === "string") {
        errorMessage += `; code: ${error.code}`;
      }

      throw new Error(errorMessage);
    }

    // Step 8: No notification. Return result.
    const pathContext: PathContext = context.pathContext;
    return { pathContext, renderedBytes };
  }

  const {
    sessionId,
    iterationNumber,
    stageSlug,
    documentIdentity,
    documentKey,
    projectId,
    sourceContributionId,
  } = params;

  // Step 2: Assemble contribution chain (delegated)
  const chainResult = await deps.assembleContributionChain(
    {},
    { dbClient },
    { sessionId, iterationNumber, stageSlug, documentIdentity },
  );
  if ("error" in chainResult) {
    throw chainResult.error;
  }
  const { orderedChunks, modelSlug, attemptCount, sourceGroupFragment, sourceAnchorModelSlug } = chainResult;

  // Step 3: Load document template (delegated)
  const templateResult = await deps.loadDocumentTemplate(
    { downloadFromStorage: deps.downloadFromStorage },
    { dbClient },
    { projectId, templateFilename: params.template_filename },
  );
  if ("error" in templateResult) {
    throw templateResult.error;
  }
  const { templateText } = templateResult;

  // Step 4: Merge chunk content (delegated)
  const mergeResult = await deps.mergeChunkContent(
    { downloadFromStorage: deps.downloadFromStorage, logger: deps.logger, sanitizeJsonContent },
    { dbClient },
    { orderedChunks },
  );
  if ("error" in mergeResult) {
    throw mergeResult.error;
  }
  const { mergedStructuredData } = mergeResult;

  // Step 5: Render structured document (pure, direct import)
  const rendered = renderStructuredDocument(templateText, mergedStructuredData, documentKey);

  // Step 6: Encode rendered output
  const renderedBytes = new TextEncoder().encode(rendered);

  // Step 7: Build path context and upload
  const base = orderedChunks[0];
  const pathContext: PathContext = {
    projectId,
    fileType: FileType.RenderedDocument,
    sessionId,
    iteration: iterationNumber,
    stageSlug,
    documentKey: String(documentKey),
    modelSlug,
    attemptCount,
    sourceContributionId: sourceContributionId,
    sourceGroupFragment,
    ...(sourceAnchorModelSlug ? { sourceAnchorModelSlug } : {}),
  };

  let latestRenderedResourceId: string | undefined = undefined;
  if (deps.fileManager && typeof deps.fileManager.uploadAndRegisterFile === "function") {
    try {
      const uploadContext: ResourceUploadContext = {
        pathContext: {
          projectId: pathContext.projectId,
          fileType: FileType.RenderedDocument,
          sessionId: pathContext.sessionId,
          iteration: pathContext.iteration,
          stageSlug: pathContext.stageSlug,
          documentKey: pathContext.documentKey,
          modelSlug: pathContext.modelSlug,
          attemptCount: pathContext.attemptCount,
          sourceContributionId: pathContext.sourceContributionId ?? null,
          sourceGroupFragment: pathContext.sourceGroupFragment,
          ...(pathContext.sourceAnchorModelSlug ? { sourceAnchorModelSlug: pathContext.sourceAnchorModelSlug } : {}),
        },
        fileContent: Buffer.from(renderedBytes),
        mimeType: "text/markdown",
        sizeBytes: renderedBytes.length,
        userId: base.user_id,
        description: `Rendered document for ${stageSlug}:${String(documentKey)}`,
        resourceTypeForDb: FileType.RenderedDocument,
      };

      const uploadResult = await deps.fileManager.uploadAndRegisterFile(uploadContext);

      // Check for error response (uploadAndRegisterFile returns { record, error } or { record: null, error })
      if (uploadResult.error) {
        // When upload succeeds but DB fails, file_manager.ts always returns ServiceError with:
        // { message: "Database registration failed after successful upload.", code?: string, details?: string }
        // ServiceError.details is already a plain string (not JSON) when present
        const error = uploadResult.error;
        let errorMessage = `Failed to save rendered document: ${error.message}`;

        if ('details' in error && typeof error.details === 'string') {
          errorMessage += ` (${error.details})`;
        }

        if ('code' in error && typeof error.code === 'string') {
          errorMessage += `; code: ${error.code}`;
        }

        throw new Error(errorMessage);
      }

      // Capture the resource ID from successful upload
      if (uploadResult.record && typeof uploadResult.record === 'object' && 'id' in uploadResult.record && typeof uploadResult.record.id === 'string') {
        latestRenderedResourceId = uploadResult.record.id;
      }
    } catch (e) {
      deps.logger?.error?.("Failed to upload rendered document", { error: e });
      throw e;
    }
  }

  // Step 8: Send render_completed notification (errors surface, never swallowed)
  const targetUser = base.user_id;
  if (deps.notificationService && typeof deps.notificationService.sendJobNotificationEvent === "function" && targetUser && latestRenderedResourceId) {
    const renderJobId = `render-${documentIdentity}`;
    const stepKey = 'document_step';
    if (!base.model_id) {
      throw new Error("Base model_id is required for render_completed notification");
    }
    await deps.notificationService.sendJobNotificationEvent({
      type: "render_completed",
      sessionId,
      stageSlug,
      iterationNumber,
      job_id: renderJobId,
      document_key: documentKey,
      modelId: base.model_id,
      latestRenderedResourceId,
      step_key: stepKey,
    }, targetUser);
  }

  // Step 9: Return result
  return { pathContext, renderedBytes };
}

export default { renderDocument };


