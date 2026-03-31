import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { ILogger, ResourceDocuments } from "../../_shared/types.ts";
import type { DownloadFromStorageFn } from "../../_shared/supabase_storage_utils.ts";
import type { PickLatestFn } from "../createJobContext/JobContext.interface.ts";
import type { InputRule } from "../../dialectic-service/dialectic.interface.ts";

export interface GatherArtifactsDeps {
  logger: ILogger;
  pickLatest: PickLatestFn;
  downloadFromStorage: DownloadFromStorageFn;
}

export interface GatherArtifactsParams {
  dbClient: SupabaseClient<Database>;
  projectId: string;
  sessionId: string;
  iterationNumber: number;
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
