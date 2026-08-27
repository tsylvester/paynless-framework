import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { ILogger } from "../../_shared/types.ts";
import { ResourceDocuments } from '../../_shared/utils/resolveCompressionSource/resolveCompressionSource.interface.ts'
import type { DownloadFromStorageFn } from "../../_shared/supabase_storage_utils.ts";
import type { PickLatestFn } from "../createJobContext/JobContext.interface.ts";
import type { InputRule } from "../../dialectic-service/dialectic.interface.ts";
import type { BoundApplyCompressionOverlayFn } from "../applyCompressionOverlay/applyCompressionOverlay.interface.ts";
import type { DialecticStageSlug, FileType } from "../../_shared/types/file_manager.types.ts";

export interface GatherArtifactsDeps {
  logger: ILogger;
  pickLatest: PickLatestFn;
  downloadFromStorage: DownloadFromStorageFn;
  applyCompressionOverlay: BoundApplyCompressionOverlayFn;
}

export interface GatherArtifactsParams {
  dbClient: SupabaseClient<Database>;
  projectId: string;
  sessionId: string;
  iterationNumber: number;
  stageSlug: DialecticStageSlug;
  output_type: FileType;
}

export interface GatherArtifactsPayload {
  inputsRequired: InputRule[];
}

export interface GatherArtifactsSuccessReturn {
  artifacts: Required<ResourceDocuments[number]>[];
}

export interface GatherArtifactsErrorReturn {
  error: Error;
  retriable: boolean;
}

export type GatherArtifactsReturn =
  | GatherArtifactsSuccessReturn
  | GatherArtifactsErrorReturn;

export type GatherArtifactsFn = (
  deps: GatherArtifactsDeps,
  params: GatherArtifactsParams,
  payload: GatherArtifactsPayload,
) => Promise<GatherArtifactsReturn>;

export type BoundGatherArtifactsFn = (
  params: GatherArtifactsParams,
  payload: GatherArtifactsPayload,
) => Promise<GatherArtifactsReturn>;
