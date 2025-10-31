import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { FileType, type PathContext } from "../types/file_manager.types.ts";
import { deconstructStoragePath } from "../utils/path_deconstructor.ts";
import type {
  RenderDocumentParams,
  RenderDocumentResult,
  DocumentRendererDeps,
} from "./document_renderer.interface.ts";
import type { DownloadFromStorageFn } from "../supabase_storage_utils.ts";
import type { DialecticContributionRow } from "../../dialectic-service/dialectic.interface.ts";
import { isRecord } from "../utils/type_guards.ts";

function toStageKey(stageSlug: string): string {
  return stageSlug.toUpperCase();
}

function titleFromDocumentKey(documentKey: string): string {
  const withSpaces = documentKey.replace(/_/g, " ");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

async function downloadText(
  supabase: SupabaseClient<Database>,
  downloadFromStorage: DownloadFromStorageFn,
  bucket: string,
  path: string,
): Promise<string> {
  const { data, error } = await downloadFromStorage(supabase as unknown as SupabaseClient, bucket, path);
  if (error) throw error;
  if (!data) return "";
  return new TextDecoder().decode(data);
}

export async function renderDocument(
  dbClient: SupabaseClient<Database>,
  deps: DocumentRendererDeps,
  params: RenderDocumentParams,
): Promise<RenderDocumentResult> {
  const { sessionId, iterationNumber, stageSlug, documentIdentity, documentKey, projectId } = params;

  // 1) Load contribution rows and filter to this document chain
  const { data: allRows, error: selectError } = await dbClient
    .from("dialectic_contributions")
    .select("*")
    .returns<DialecticContributionRow[]>();

  if (selectError) {
    throw new Error("Failed to query contributions for rendering");
  }
  const rows = (allRows ?? []).filter((r) => {
    const stageKey = toStageKey(stageSlug);
    if (!isRecord(r.document_relationships)) {
      return false;
    }
    const rel = r.document_relationships && r.document_relationships[stageKey];
    return (
      r.session_id === sessionId &&
      r.iteration_number === iterationNumber &&
      typeof rel === "string" && rel === documentIdentity
    );
  });

  if (rows.length === 0) {
    throw new Error("No contribution chunks found for requested document");
  }

  // 2) Prefer latest user edits over model chunks when duplicates exist
  const dedupedByFile: Record<string, DialecticContributionRow> = {};
  for (const row of rows) {
    if (typeof row.file_name !== "string") {
      throw new Error("Invalid file name type");
    }
    const existing = dedupedByFile[row.file_name];
    if (!existing) {
      dedupedByFile[row.file_name] = row;
    } else {
      const preferCurrent = Boolean(row.original_model_contribution_id) || (!existing.original_model_contribution_id && row.is_latest_edit);
      if (preferCurrent) dedupedByFile[row.file_name] = row;
    }
  }
  const uniqueChunks = Object.values(dedupedByFile)
    .sort((a, b) => {
      if (a.edit_version !== b.edit_version) return a.edit_version - b.edit_version;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  // 3) Parse model slug and attempt from the first/base chunk
  const base = uniqueChunks[0];
  if (typeof base.file_name !== "string") {
    throw new Error("Invalid file name type");
  }
  const info = deconstructStoragePath({ storageDir: base.storage_path, fileName: base.file_name });
  if (!info.modelSlug || typeof info.attemptCount !== "number") {
    throw new Error("Unable to parse model slug and attempt count from path");
  }
  const modelSlug = info.modelSlug;
  const attemptCount = info.attemptCount;

  // 4) Load template by querying dialectic_document_templates (authoritative map)
  type DocumentTemplateRow = Database['public']['Tables']['dialectic_document_templates']['Row'];
  const stage = String(stageSlug).toLowerCase();
  const docKey = String(documentKey);
  const { data: templateRow, error: templateErr } = await dbClient
    .from('dialectic_document_templates')
    .select('*')
    .eq('stage_slug', stage)
    .eq('document_key', docKey)
    .maybeSingle<DocumentTemplateRow>();

  if (templateErr || !templateRow) {
    throw new Error(`No template mapping found for stage='${stage}' document='${docKey}': ${templateErr ? (templateErr).message ?? 'unknown error' : 'not found'}`);
  }

  const templateBucket = templateRow.storage_bucket;
  const templateStoragePath = templateRow.storage_path;
  const templateFileName = templateRow.file_name;
  const fullTemplatePath = `${templateStoragePath?.replace(/\/$/, '')}/${templateFileName}`;

  if (!templateBucket || !templateStoragePath || !templateFileName) {
    throw new Error(`Invalid template row: ${JSON.stringify(templateRow)}`);
  }
  const { data: templateData, error: templateDownloadErr } = await deps.downloadFromStorage(
    dbClient as unknown as SupabaseClient,
    templateBucket,
    fullTemplatePath,
  );
  if (templateDownloadErr || !templateData) {
    throw new Error(`Failed to download template '${fullTemplatePath}' from bucket '${templateBucket}': ${templateDownloadErr ? (templateDownloadErr).message ?? 'unknown error' : 'no data'}`);
  }
  const template = new TextDecoder().decode(templateData);

  const bodyParts: string[] = [];
  const contentBucket = base.storage_bucket;
  for (const chunk of uniqueChunks) {
    const path = `${chunk.storage_path}/${chunk.file_name}`;
    const text = await downloadText(dbClient, deps.downloadFromStorage, contentBucket, path);
    bodyParts.push(text);
  }

  const mergedBody = bodyParts.join("");
  const rendered = template
    .replace(/\{\{\s*title\s*\}\}/g, titleFromDocumentKey(String(documentKey)))
    .replace(/\{\{\s*content\s*\}\}/g, mergedBody);
  const renderedBytes = new TextEncoder().encode(rendered);

  // 5) Compute final path context and write if a fileManager is available
  const pathContext: PathContext = {
    projectId,
    fileType: FileType.RenderedDocument,
    sessionId,
    iteration: iterationNumber,
    stageSlug,
    documentKey: String(documentKey),
    modelSlug,
    attemptCount,
  };

  if (deps.fileManager && typeof deps.fileManager.uploadAndRegisterFile === "function") {
    try {
      await deps.fileManager.uploadAndRegisterFile({
        pathContext: {
          projectId: pathContext.projectId,
          fileType: FileType.RenderedDocument,
          sessionId: pathContext.sessionId,
          iteration: pathContext.iteration,
          stageSlug: pathContext.stageSlug,
          documentKey: pathContext.documentKey,
          modelSlug: pathContext.modelSlug,
          attemptCount: pathContext.attemptCount,
        },
        fileContent: rendered,
        mimeType: "text/markdown",
        sizeBytes: renderedBytes.length,
        userId: base.user_id,
        description: `Rendered document for ${stageSlug}:${String(documentKey)}`,
      });
    } catch (e) {
      deps.logger?.error?.("Failed to upload rendered document", { error: e });
    }
  }

  // 6) Notification (optional)
  const targetUser = base.user_id || "";
  if (deps.notificationService && typeof deps.notificationService.sendDocumentRenderedNotification === "function" && targetUser) {
    try {
      await deps.notificationService.sendDocumentRenderedNotification({
        type: 'document_rendered',
        projectId,
        sessionId,
        iterationNumber,
        stageSlug,
        documentIdentity,
        documentKey: documentKey,
        completed: true,
      }, targetUser);
    } catch (e) {
      deps.logger?.warn?.("Failed to send document rendered notification", { error: e });
    }
  }

  return { pathContext, renderedBytes };
}

export default { renderDocument };


