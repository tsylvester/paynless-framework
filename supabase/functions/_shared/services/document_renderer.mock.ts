import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type {
  DocumentRendererDeps,
  RenderDocumentFn,
  RenderDocumentParams,
  RenderDocumentResult,
  IDocumentRenderer,
} from "./document_renderer.interface.ts";
import type { PathContext } from "../types/file_manager.types.ts";
import { FileType } from "../types/file_manager.types.ts";

export type RenderCall = {
  dbClient: SupabaseClient<Database>;
  deps: DocumentRendererDeps;
  params: RenderDocumentParams;
};

export function createDocumentRendererMock(options?: {
  handler?: RenderDocumentFn;
  defaultResult?: RenderDocumentResult;
}) {
  const calls: RenderCall[] = [];

  const defaultResult: RenderDocumentResult = options?.defaultResult ?? {
    pathContext: {
      projectId: "mock-project",
      fileType: FileType.RenderedDocument,
      sessionId: "mock-session",
      iteration: 1,
      stageSlug: "thesis",
      documentKey: FileType.business_case,
      modelSlug: "mock-model",
    },
    renderedBytes: new Uint8Array(),
  };

  const renderer: IDocumentRenderer = {
    async renderDocument(dbClient, deps, params) {
      calls.push({ dbClient, deps, params });
      if (typeof options?.handler === "function") {
        return await options.handler(dbClient, deps, params);
      }
      // Provide a stable default result that reflects input params in the pathContext
      const pc: PathContext = {
        projectId: params.projectId,
        fileType: FileType.RenderedDocument,
        sessionId: params.sessionId,
        iteration: params.iterationNumber,
        stageSlug: params.stageSlug,
        documentKey: params.documentKey,
        modelSlug: "mock-model",
      };
      return {
        pathContext: pc,
        renderedBytes: defaultResult.renderedBytes,
      };
    },
  };

  return { renderer, calls };
}


