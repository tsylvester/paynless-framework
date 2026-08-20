import { assertEquals } from "jsr:@std/assert";
import {
  ContributionRowMinimal,
  RenderDocumentParams,
  RenderDocumentResult,
  DocumentRendererDeps,
  RenderDocumentFn,
  IDocumentRenderer,
  RenderCompressedContextParams,
} from "./renderDocument.interface.ts";
import {
  DialecticStageSlug,
  FileType,
  type PathContext,
  type ModelContributionFileTypes,
  type CompressionSourceType,
} from "../../../types/file_manager.types.ts";
import type { AssembleContributionChainFn } from "../assembleContributionChain/assembleContributionChain.provides.ts";
import type { LoadDocumentTemplateFn } from "../loadDocumentTemplate/loadDocumentTemplate.provides.ts";
import type { MergeChunkContentFn } from "../mergeChunkContent/mergeChunkContent.provides.ts";

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
    stageSlug: DialecticStageSlug.Thesis,
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
    assembleContributionChain: true,
    loadDocumentTemplate: true,
    mergeChunkContent: true,
  };
  assertEquals(Object.keys(depsSurface).length, 8);
});

Deno.test("DocumentRendererDeps.assembleContributionChain is AssembleContributionChainFn", () => {
  const fn: AssembleContributionChainFn = async () => ({
    orderedChunks: [],
    modelSlug: "",
    attemptCount: 0,
    sourceGroupFragment: undefined,
    sourceAnchorModelSlug: undefined,
  });
  const field: DocumentRendererDeps["assembleContributionChain"] = fn;
  assertEquals(field, fn);
});

Deno.test("DocumentRendererDeps.loadDocumentTemplate is LoadDocumentTemplateFn", () => {
  const fn: LoadDocumentTemplateFn = async () => ({ templateText: "" });
  const field: DocumentRendererDeps["loadDocumentTemplate"] = fn;
  assertEquals(field, fn);
});

Deno.test("DocumentRendererDeps.mergeChunkContent is MergeChunkContentFn", () => {
  const fn: MergeChunkContentFn = async () => ({ mergedStructuredData: {} });
  const field: DocumentRendererDeps["mergeChunkContent"] = fn;
  assertEquals(field, fn);
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

Deno.test("RenderCompressedContextParams has the required surface", () => {
  const paramsSurface: Record<keyof RenderCompressedContextParams, true> = {
    projectId: true,
    sessionId: true,
    iterationNumber: true,
    stageSlug: true,
    output_type: true,
    sourceType: true,
    documentKey: true,
    template_filename: true,
  };
  assertEquals(Object.keys(paramsSurface).length, 8);
});

Deno.test("RenderCompressedContextParams accepts a full literal and round-trips values", () => {
  const params: RenderCompressedContextParams = {
    projectId: "project-1",
    sessionId: "session-1",
    iterationNumber: 1,
    stageSlug: DialecticStageSlug.Thesis,
    output_type: FileType.business_case,
    sourceType: "contribution",
    documentKey: FileType.business_case,
    template_filename: "thesis_business_case.md",
  };
  assertEquals(params.projectId, "project-1");
  assertEquals(params.sessionId, "session-1");
  assertEquals(params.iterationNumber, 1);
  assertEquals(params.stageSlug, DialecticStageSlug.Thesis);
  assertEquals(params.output_type, FileType.business_case);
  assertEquals(params.sourceType, "contribution");
  assertEquals(params.documentKey, FileType.business_case);
  assertEquals(params.template_filename, "thesis_business_case.md");
});

Deno.test("RenderCompressedContextParams is assignable to Parameters<RenderDocumentFn>[2]", () => {
  const compressedParams: RenderCompressedContextParams = {
    projectId: "project-1",
    sessionId: "session-1",
    iterationNumber: 1,
    stageSlug: DialecticStageSlug.Thesis,
    output_type: FileType.business_case,
    sourceType: "contribution",
    documentKey: FileType.business_case,
    template_filename: "thesis_business_case.md",
  };
  const params: Parameters<RenderDocumentFn>[2] = compressedParams;
  assertEquals(params, compressedParams);
});
