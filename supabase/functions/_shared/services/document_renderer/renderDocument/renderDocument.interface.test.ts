import { assertEquals } from "jsr:@std/assert";
import {
  ContributionRowMinimal,
  RenderDocumentParams,
  RenderDocumentResult,
  DocumentRendererDeps,
  RenderDocumentFn,
  IDocumentRenderer,
} from "./renderDocument.interface.ts";
import { FileType, type PathContext } from "../../../types/file_manager.types.ts";

Deno.test("RenderDocumentParams has the required surface", () => {
  const paramsSurface: Record<keyof RenderDocumentParams, true> = {
    projectId: true,
    sessionId: true,
    iterationNumber: true,
    stageSlug: true,
    documentIdentity: true,
    documentKey: true,
    sourceContributionId: true,
    template_filename: true,
  };
  assertEquals(Object.keys(paramsSurface).length, 8);
});

Deno.test("RenderDocumentParams accepts a FileType documentKey", () => {
  const params: RenderDocumentParams = {
    projectId: "project-1",
    sessionId: "session-1",
    iterationNumber: 1,
    stageSlug: "thesis",
    documentIdentity: "doc-id-1",
    documentKey: FileType.business_case,
    sourceContributionId: "contrib-1",
    template_filename: "business_case.md",
  };
  assertEquals(params.documentKey, FileType.business_case);
});

Deno.test("RenderDocumentResult has the required surface", () => {
  const resultSurface: Record<keyof RenderDocumentResult, true> = {
    pathContext: true,
    renderedBytes: true,
  };
  assertEquals(Object.keys(resultSurface).length, 2);
});

Deno.test("RenderDocumentResult accepts the expected value shapes", () => {
  const pathContext: PathContext = {
    projectId: "project-1",
    fileType: FileType.RenderedDocument,
  };
  const result: RenderDocumentResult = {
    pathContext,
    renderedBytes: new Uint8Array([1, 2, 3]),
  };
  assertEquals(result.pathContext.fileType, FileType.RenderedDocument);
  assertEquals(result.renderedBytes.length, 3);
});

Deno.test("DocumentRendererDeps has the required surface", () => {
  const depsSurface: Record<keyof DocumentRendererDeps, true> = {
    downloadFromStorage: true,
    fileManager: true,
    notificationService: true,
    notifyUserId: true,
    logger: true,
  };
  assertEquals(Object.keys(depsSurface).length, 5);
});

Deno.test("RenderDocumentFn is assignable from a matching implementation", () => {
  const pathContext: PathContext = {
    projectId: "project-1",
    fileType: FileType.RenderedDocument,
  };
  const result: RenderDocumentResult = {
    pathContext,
    renderedBytes: new Uint8Array(),
  };
  const renderDocumentFn: RenderDocumentFn = async (_dbClient, _deps, _params) => {
    return result;
  };
  assertEquals(typeof renderDocumentFn, "function");
});

Deno.test("IDocumentRenderer accepts a renderDocument implementation", () => {
  const pathContext: PathContext = {
    projectId: "project-1",
    fileType: FileType.RenderedDocument,
  };
  const result: RenderDocumentResult = {
    pathContext,
    renderedBytes: new Uint8Array(),
  };
  const renderer: IDocumentRenderer = {
    renderDocument: async (_dbClient, _deps, _params) => {
      return result;
    },
  };
  assertEquals(typeof renderer.renderDocument, "function");
});

Deno.test("ContributionRowMinimal has the required surface", () => {
  const rowSurface: Record<keyof ContributionRowMinimal, true> = {
    id: true,
    session_id: true,
    stage: true,
    iteration_number: true,
    storage_bucket: true,
    storage_path: true,
    file_name: true,
    raw_response_storage_path: true,
    mime_type: true,
    document_relationships: true,
    created_at: true,
    target_contribution_id: true,
    edit_version: true,
    is_latest_edit: true,
    original_model_contribution_id: true,
    user_id: true,
  };
  assertEquals(Object.keys(rowSurface).length, 16);
});
