import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { ILogger, Messages } from "../../_shared/types.ts";
import type { ResourceDocument, BoundResolveCompressionSourceFn } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.interface.ts";
import type { DownloadFromStorageFn } from "../../_shared/supabase_storage_utils.ts";
import type { FileType, DialecticStageSlug } from "../../_shared/types/file_manager.types.ts";

export interface ApplyCompressionOverlayDeps {
  logger: ILogger;
  downloadFromStorage: DownloadFromStorageFn;
  resolveCompressionSource: BoundResolveCompressionSourceFn;
}

export interface ApplyCompressionOverlayParams {
  dbClient: SupabaseClient<Database>;
  projectId: string;
  sessionId: string;
  iterationNumber: number;
  stageSlug: DialecticStageSlug;
  output_type: FileType;
}

export interface ApplyCompressionOverlayPayload {
  resourceDocuments: ResourceDocument[];
  conversationHistory: Messages[];
}

export interface ApplyCompressionOverlaySuccessReturn {
  resourceDocuments: ResourceDocument[];
  conversationHistory: Messages[];
  overlaidCount: number;
}

export interface ApplyCompressionOverlayErrorReturn {
  error: Error;
  retriable: boolean;
}

export type ApplyCompressionOverlayReturn =
  | ApplyCompressionOverlaySuccessReturn
  | ApplyCompressionOverlayErrorReturn;

export type ApplyCompressionOverlayFn = (
  deps: ApplyCompressionOverlayDeps,
  params: ApplyCompressionOverlayParams,
  payload: ApplyCompressionOverlayPayload,
) => Promise<ApplyCompressionOverlayReturn>;

export type BoundApplyCompressionOverlayFn = (
  params: ApplyCompressionOverlayParams,
  payload: ApplyCompressionOverlayPayload,
) => Promise<ApplyCompressionOverlayReturn>;
