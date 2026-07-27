import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../types_db.ts";
import type { DownloadFromStorageFn } from "../../../supabase_storage_utils.ts";
import type { CompressionSourceType, DialecticStageSlug, FileType, IFileManager, ModelContributionFileTypes, PathContext } from "../../../types/file_manager.types.ts";
import type { NotificationServiceType } from "../../../types/notification.service.types.ts";
import type { ILogger } from "../../../types.ts";
import type { AssembleContributionChainFn } from "../assembleContributionChain/assembleContributionChain.provides.ts";
import type { LoadDocumentTemplateFn } from "../loadDocumentTemplate/loadDocumentTemplate.provides.ts";
import type { MergeChunkContentFn } from "../mergeChunkContent/mergeChunkContent.provides.ts";
export type ContributionRowMinimal = {
    id: string;
    session_id: string;
    stage: string;
    iteration_number: number;
    storage_bucket: string;
    storage_path: string;
    file_name: string;
    raw_response_storage_path: string | null;
    mime_type: string;
    document_relationships: Record<string, string>;
    created_at: string;
    target_contribution_id: string | null;
    edit_version: number;
    is_latest_edit: boolean;
    original_model_contribution_id?: string | null;
    user_id?: string | null;
  };

export type RenderDocumentParams = {
  projectId: string;
  sessionId: string;
  iterationNumber: number;
  stageSlug: DialecticStageSlug;
  documentIdentity: string; // true-root id for this document chain
  documentKey: FileType;
  sourceContributionId: string;
  template_filename: string; // canonical template filename from recipe step's outputs_required.files_to_generate[] array, matching file_name in dialectic_document_templates table
};

export type RenderCompressedContextParams = {
  projectId: string;
  sessionId: string;
  iterationNumber: number;
  stageSlug: DialecticStageSlug;
  targetKey: ModelContributionFileTypes;
  sourceType: CompressionSourceType;
  documentKey: FileType;
  template_filename: string;
};

export type RenderDocumentResult = {
  pathContext: PathContext;
  renderedBytes: Uint8Array;
};

export interface DocumentRendererDeps {
  downloadFromStorage: DownloadFromStorageFn;
  fileManager: IFileManager;
  notificationService: NotificationServiceType;
  notifyUserId: string;
  logger: ILogger;
  assembleContributionChain: AssembleContributionChainFn;
  loadDocumentTemplate: LoadDocumentTemplateFn;
  mergeChunkContent: MergeChunkContentFn;
}

export type RenderDocumentFn = (
  dbClient: SupabaseClient<Database>,
  deps: DocumentRendererDeps,
  params: RenderDocumentParams | RenderCompressedContextParams,
) => Promise<RenderDocumentResult>;

export interface IDocumentRenderer {
  renderDocument: RenderDocumentFn;
}
