import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../types_db.ts";
import type { DialecticStageSlug, FileType, ModelContributionFileTypes } from "../../types/file_manager.types.ts";

export interface ResolveTemplateFilenameDeps {}

export interface ResolveTemplateFilenameParams {
  dbClient: SupabaseClient<Database>;
}

export interface ResolveTemplateFilenamePayload {
  stageSlug: DialecticStageSlug;
  outputType: ModelContributionFileTypes;
  documentKey: FileType;
}

export type ResolveTemplateFilenameSuccessReturn = {
  templateFilename: string;
};

export type ResolveTemplateFilenameErrorReturn = {
  error: Error;
  retriable: boolean;
};

export type ResolveTemplateFilenameReturn =
  | ResolveTemplateFilenameSuccessReturn
  | ResolveTemplateFilenameErrorReturn;

export type ResolveTemplateFilenameFn = (
  deps: ResolveTemplateFilenameDeps,
  params: ResolveTemplateFilenameParams,
  payload: ResolveTemplateFilenamePayload,
) => Promise<ResolveTemplateFilenameReturn>;

export type BoundResolveTemplateFilenameFn = (
  params: ResolveTemplateFilenameParams,
  payload: ResolveTemplateFilenamePayload,
) => Promise<ResolveTemplateFilenameReturn>;
