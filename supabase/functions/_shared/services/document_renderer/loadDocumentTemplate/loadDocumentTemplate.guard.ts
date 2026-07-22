import { isRecord } from "../../../utils/type-guards/type_guards.common.ts";
import type {
  LoadDocumentTemplateErrorReturn,
  LoadDocumentTemplateParams,
  LoadDocumentTemplatePayload,
  LoadDocumentTemplateSuccessReturn,
} from "./loadDocumentTemplate.interface.ts";

export function isLoadDocumentTemplateParams(
  value: unknown,
): value is LoadDocumentTemplateParams {
  if (!isRecord(value)) {
    return false;
  }
  if (!("dbClient" in value)) {
    return false;
  }
  return isRecord(value.dbClient);
}

export function isLoadDocumentTemplatePayload(
  value: unknown,
): value is LoadDocumentTemplatePayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!("projectId" in value) || !("templateFilename" in value)) {
    return false;
  }
  if (typeof value.projectId !== "string" || value.projectId === "") {
    return false;
  }
  if (typeof value.templateFilename !== "string" || value.templateFilename === "") {
    return false;
  }
  return true;
}

export function isLoadDocumentTemplateSuccessReturn(
  value: unknown,
): value is LoadDocumentTemplateSuccessReturn {
  if (!isRecord(value)) {
    return false;
  }
  if ("error" in value) {
    return false;
  }
  if (!("templateText" in value)) {
    return false;
  }
  return typeof value.templateText === "string";
}

export function isLoadDocumentTemplateErrorReturn(
  value: unknown,
): value is LoadDocumentTemplateErrorReturn {
  if (!isRecord(value)) {
    return false;
  }
  if ("templateText" in value) {
    return false;
  }
  if (!("error" in value) || !("retriable" in value)) {
    return false;
  }
  if (!(value.error instanceof Error)) {
    return false;
  }
  return typeof value.retriable === "boolean";
}
