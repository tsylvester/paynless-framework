import type { DownloadFromStorageFn } from "../../../supabase_storage_utils.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../types_db.ts";

export interface LoadDocumentTemplateDeps {
  downloadFromStorage: DownloadFromStorageFn;
}

export interface LoadDocumentTemplateParams {
  dbClient: SupabaseClient<Database>;
}

export interface LoadDocumentTemplatePayload {
  projectId: string;
  templateFilename: string;
}

export type LoadDocumentTemplateSuccessReturn = {
  templateText: string;
};

export type LoadDocumentTemplateErrorReturn = {
  error: Error;
  retriable: boolean;
};

export type LoadDocumentTemplateReturn =
  | LoadDocumentTemplateSuccessReturn
  | LoadDocumentTemplateErrorReturn;

export type LoadDocumentTemplateFn = (
  deps: LoadDocumentTemplateDeps,
  params: LoadDocumentTemplateParams,
  payload: LoadDocumentTemplatePayload,
) => Promise<LoadDocumentTemplateReturn>;

export type BoundLoadDocumentTemplateFn = (
  params: LoadDocumentTemplateParams,
  payload: LoadDocumentTemplatePayload,
) => Promise<LoadDocumentTemplateReturn>;
