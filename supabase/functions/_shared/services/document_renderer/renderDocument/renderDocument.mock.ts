import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { DialecticStageSlug, FileType, type PathContext } from "../../../types/file_manager.types.ts";
import { MockLogger } from "../../../logger.mock.ts";
import { createMockDownloadFromStorage } from "../../../supabase_storage_utils.mock.ts";
import { MockFileManagerService } from "../../file_manager.mock.ts";
import { mockNotificationService } from "../../../utils/notification.service.mock.ts";
import { mockAssembleContributionChain } from "../assembleContributionChain/assembleContributionChain.provides.ts";
import { mockLoadDocumentTemplate } from "../loadDocumentTemplate/loadDocumentTemplate.provides.ts";
import { mockMergeChunkContent } from "../mergeChunkContent/mergeChunkContent.provides.ts";
import type {
  ContributionRowMinimal,
  DocumentRendererDeps,
  IDocumentRenderer,
  RenderDocumentFn,
  RenderDocumentParams,
  RenderDocumentResult,
  RenderCompressedContextParams,
} from "./renderDocument.interface.ts";

export type ContributionRowMinimalOverrides = Partial<ContributionRowMinimal>;

export type ContributionRowMinimalCorruptions = {
  [K in keyof ContributionRowMinimal]?: unknown;
};

export function buildContributionRowMinimal(
  overrides?: ContributionRowMinimalOverrides,
): ContributionRowMinimal {
  const now = new Date().toISOString();
  const base: ContributionRowMinimal = {
    id: "root-1",
    session_id: "session-abc",
    stage: "THESIS",
    iteration_number: 1,
    storage_bucket: "content",
    storage_path: "proj_x/session_s/iteration_1/thesis/documents",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
    raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
    mime_type: "application/json",
    document_relationships: { thesis: "root-1" },
    created_at: now,
    target_contribution_id: null,
    edit_version: 1,
    is_latest_edit: true,
    original_model_contribution_id: null,
    user_id: "user_123",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateContributionRowMinimal(
  corruptions: ContributionRowMinimalCorruptions,
): unknown {
  return { ...buildContributionRowMinimal(), ...corruptions };
}

export type RenderDocumentParamsOverrides = Partial<RenderDocumentParams>;

export type RenderDocumentParamsCorruptions = {
  [K in keyof RenderDocumentParams]?: unknown;
};

export function buildRenderDocumentParams(
  overrides?: RenderDocumentParamsOverrides,
): RenderDocumentParams {
  const base: RenderDocumentParams = {
    projectId: "project_123",
    sessionId: "session-abc",
    iterationNumber: 1,
    stageSlug: DialecticStageSlug.Thesis,
    documentIdentity: "root-1",
    documentKey: FileType.business_case,
    sourceContributionId: "root-1",
    template_filename: "thesis_business_case.md",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateRenderDocumentParams(
  corruptions: RenderDocumentParamsCorruptions,
): unknown {
  return { ...buildRenderDocumentParams(), ...corruptions };
}

export type RenderCompressedContextParamsOverrides = Partial<RenderCompressedContextParams>;

export type RenderCompressedContextParamsCorruptions = {
  [K in keyof RenderCompressedContextParams]?: unknown;
};

export function buildRenderCompressedContextParams(
  overrides?: RenderCompressedContextParamsOverrides,
): RenderCompressedContextParams {
  const base: RenderCompressedContextParams = {
    projectId: "project_123",
    sessionId: "session-abc",
    iterationNumber: 1,
    stageSlug: DialecticStageSlug.Thesis,
    targetKey: FileType.business_case,
    sourceType: "contribution",
    documentKey: FileType.business_case,
    template_filename: "thesis_business_case.md",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateRenderCompressedContextParams(
  corruptions: RenderCompressedContextParamsCorruptions,
): unknown {
  return { ...buildRenderCompressedContextParams(), ...corruptions };
}

export type RenderDocumentResultOverrides = Partial<RenderDocumentResult>;

export type RenderDocumentResultCorruptions = {
  [K in keyof RenderDocumentResult]?: unknown;
};

export function buildRenderDocumentResult(
  overrides?: RenderDocumentResultOverrides,
): RenderDocumentResult {
  const pathContext: PathContext = {
    projectId: "project_123",
    fileType: FileType.RenderedDocument,
    sessionId: "session-abc",
    iteration: 1,
    stageSlug: "thesis",
    documentKey: FileType.business_case,
    modelSlug: "mock-model",
    sourceContributionId: "root-1",
  };
  const base: RenderDocumentResult = {
    pathContext,
    renderedBytes: new Uint8Array(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateRenderDocumentResult(
  corruptions: RenderDocumentResultCorruptions,
): unknown {
  return { ...buildRenderDocumentResult(), ...corruptions };
}

export type DocumentRendererDepsOverrides = Partial<DocumentRendererDeps>;

export type DocumentRendererDepsCorruptions = {
  [K in keyof DocumentRendererDeps]?: unknown;
};

export function buildDocumentRendererDeps(
  overrides?: DocumentRendererDepsOverrides,
): DocumentRendererDeps {
  const base: DocumentRendererDeps = {
    downloadFromStorage: createMockDownloadFromStorage({
      mode: "success",
      data: new ArrayBuffer(0),
    }),
    fileManager: new MockFileManagerService(),
    notificationService: mockNotificationService,
    notifyUserId: "user_123",
    logger: new MockLogger(),
    assembleContributionChain: mockAssembleContributionChain,
    loadDocumentTemplate: mockLoadDocumentTemplate,
    mergeChunkContent: mockMergeChunkContent,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateDocumentRendererDeps(
  corruptions: DocumentRendererDepsCorruptions,
): unknown {
  return { ...buildDocumentRendererDeps(), ...corruptions };
}

export type IDocumentRendererOverrides = Partial<IDocumentRenderer>;

export type IDocumentRendererCorruptions = {
  [K in keyof IDocumentRenderer]?: unknown;
};

export function buildIDocumentRenderer(
  overrides?: IDocumentRendererOverrides,
): IDocumentRenderer {
  const base: IDocumentRenderer = {
    renderDocument: mockRenderDocument,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateIDocumentRenderer(
  corruptions: IDocumentRendererCorruptions,
): unknown {
  return { ...buildIDocumentRenderer(), ...corruptions };
}

/**
 * Mock implementation of {@link RenderDocumentFn}.
 * Returns a default success result; tests that need variation compose their own
 * `RenderDocumentFn` from the builders above.
 */
export const mockRenderDocument: RenderDocumentFn = async (
  _dbClient: SupabaseClient,
  _deps: DocumentRendererDeps,
  _params: RenderDocumentParams | RenderCompressedContextParams,
): Promise<RenderDocumentResult> => {
  return buildRenderDocumentResult();
};


