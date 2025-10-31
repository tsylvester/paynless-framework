import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { DownloadFromStorageFn } from "../supabase_storage_utils.ts";
import type { IFileManager, PathContext } from "../types/file_manager.types.ts";
import type { NotificationServiceType } from "../types/notification.service.types.ts";
import type { FileType } from "../types/file_manager.types.ts";
import type { ILogger } from "../types.ts";
export type ContributionRowMinimal = {
    id: string;
    session_id: string;
    stage: string;
    iteration_number: number;
    storage_bucket: string;
    storage_path: string;
    file_name: string;
    mime_type: string;
    document_relationships: Record<string, string>;
    created_at: string;
    target_contribution_id: string | null;
    edit_version: number;
    is_latest_edit: boolean;
    original_model_contribution_id?: string | null;
    user_id?: string | null;
  };
  
  export type RendererPathContext = {
    projectId?: string;
    sessionId?: string;
    iteration?: number;
    stageSlug?: string;
    documentKey?: string;
    modelSlug?: string;
  };
  
  export type FileManagerCall = { pathContext?: RendererPathContext; fileContent: Blob | string };
  

export type RenderDocumentParams = {
  projectId: string;
  sessionId: string;
  iterationNumber: number;
  stageSlug: string;
  documentIdentity: string; // true-root id for this document chain
  documentKey: FileType;
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
}

export type RenderDocumentFn = (
  dbClient: SupabaseClient<Database>,
  deps: DocumentRendererDeps,
  params: RenderDocumentParams,
) => Promise<RenderDocumentResult>;

export interface IDocumentRenderer {
  renderDocument: RenderDocumentFn;
}
