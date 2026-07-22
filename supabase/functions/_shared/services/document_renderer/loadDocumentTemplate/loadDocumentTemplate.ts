import type { Database } from "../../../../types_db.ts";
import type {
  LoadDocumentTemplateDeps,
  LoadDocumentTemplateFn,
  LoadDocumentTemplateParams,
  LoadDocumentTemplatePayload,
  LoadDocumentTemplateReturn,
} from "./loadDocumentTemplate.interface.ts";
import {
  isLoadDocumentTemplateParams,
  isLoadDocumentTemplatePayload,
} from "./loadDocumentTemplate.guard.ts";

export class TemplateLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateLoadError";
  }
}

export const loadDocumentTemplate: LoadDocumentTemplateFn = async (
  deps: LoadDocumentTemplateDeps,
  params: LoadDocumentTemplateParams,
  payload: LoadDocumentTemplatePayload,
): Promise<LoadDocumentTemplateReturn> => {
  if (!isLoadDocumentTemplateParams(params) || !isLoadDocumentTemplatePayload(payload)) {
    return {
      error: new TemplateLoadError("Invalid loadDocumentTemplate input"),
      retriable: false,
    };
  }

  type DocumentTemplateRow = Database["public"]["Tables"]["dialectic_document_templates"]["Row"];

  const { data: projectData, error: projectError } = await params.dbClient
    .from("dialectic_projects")
    .select("selected_domain_id")
    .eq("id", payload.projectId)
    .maybeSingle();

  if (projectError) {
    return { error: projectError, retriable: false };
  }

  if (!projectData?.selected_domain_id) {
    return {
      error: new TemplateLoadError(
        `Project '${payload.projectId}' does not have a selected_domain_id. Template lookup requires domain_id.`,
      ),
      retriable: false,
    };
  }

  const templateNameForQuery = payload.templateFilename.endsWith(".md")
    ? payload.templateFilename.slice(0, -3)
    : payload.templateFilename;

  const { data: templateRow, error: templateErr } = await params.dbClient
    .from("dialectic_document_templates")
    .select("*")
    .eq("name", templateNameForQuery)
    .eq("domain_id", projectData.selected_domain_id)
    .eq("is_active", true)
    .maybeSingle<DocumentTemplateRow>();

  if (templateErr) {
    return { error: templateErr, retriable: false };
  }

  if (!templateRow) {
    return {
      error: new TemplateLoadError(
        `No template mapping found for name='${templateNameForQuery}' (from template_filename='${payload.templateFilename}') domain_id='${projectData.selected_domain_id}'`,
      ),
      retriable: false,
    };
  }

  const templateBucket = templateRow.storage_bucket;
  const templateStoragePath = templateRow.storage_path;
  const templateFileName = templateRow.file_name;
  const fullTemplatePath = `${templateStoragePath?.replace(/\/$/, "")}/${templateFileName}`;

  if (!templateBucket || !templateStoragePath || !templateFileName) {
    return {
      error: new TemplateLoadError(`Invalid template row: ${JSON.stringify(templateRow)}`),
      retriable: false,
    };
  }

  const { data: templateData, error: templateDownloadErr } = await deps.downloadFromStorage(
    params.dbClient,
    templateBucket,
    fullTemplatePath,
  );

  if (templateDownloadErr) {
    return { error: templateDownloadErr, retriable: false };
  }

  if (!templateData) {
    return {
      error: new TemplateLoadError(
        `No data returned downloading template '${fullTemplatePath}' from bucket '${templateBucket}'`,
      ),
      retriable: false,
    };
  }

  const template = new TextDecoder().decode(templateData);

  return { templateText: template };
};
