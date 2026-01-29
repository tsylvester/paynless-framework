// This tool is not used in production. 
// It is used to verify the renderer works correctly by providing it a specific input and checking the output.
// Edit the jsonPath and templatePath to point to the actual files you want to use. 

// Verification script - calls the ACTUAL renderDocument function
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { renderDocument } from "./document_renderer.ts";
import type { DocumentRendererDeps, RenderDocumentParams, ContributionRowMinimal } from "./document_renderer.interface.ts";
import type { IFileManager, FileManagerResponse } from "../types/file_manager.types.ts";
import { FileType } from "../types/file_manager.types.ts";
import type { NotificationServiceType } from "../types/notification.service.types.ts";
import type { ILogger } from "../types.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../supabase.mock.ts";

// Actual file paths
const jsonPath = "I:/Downloads/google-gemini-2.5-flash_0_feature_spec_a0fc0d7d_raw.json";
const templatePath = "C:/Users/Tim/paynless-framework/docs/templates/thesis/thesis_feature_spec.md";

// Read the actual files
const jsonText = await Deno.readTextFile(jsonPath);
const template = await Deno.readTextFile(templatePath);

const rootId = "contrib-1";
const sessionId = "session-1";
const rawJsonPath = "proj_x/session_s/iteration_1/thesis/documents/google-gemini-2.5-flash_0_feature_spec_raw.json";

const contributions: ContributionRowMinimal[] = [
  {
    id: rootId,
    session_id: sessionId,
    stage: "THESIS",
    iteration_number: 1,
    storage_bucket: "content",
    storage_path: "proj_x/session_s/iteration_1/thesis/documents",
    file_name: "google-gemini-2.5-flash_0_feature_spec.md",
    raw_response_storage_path: rawJsonPath,
    mime_type: "text/markdown",
    document_relationships: { thesis: rootId },
    created_at: new Date().toISOString(),
    target_contribution_id: null,
    edit_version: 1,
    is_latest_edit: true,
    user_id: "user_123",
  },
];

const config: MockSupabaseDataConfig = {
  genericMockResults: {
    dialectic_contributions: {
      select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
    },
    dialectic_projects: {
      select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
    },
    dialectic_document_templates: {
      select: {
        data: [
          {
            id: "template-1",
            created_at: "2025-01-01T00:00:00Z",
            description: null,
            domain_id: "domain-1",
            file_name: "thesis_feature_spec.md",
            is_active: true,
            name: "thesis_feature_spec",
            storage_bucket: "prompt-templates",
            storage_path: "templates/thesis",
            updated_at: "2025-01-01T00:00:00Z",
          },
        ],
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      },
    },
  },
};

const { client, clearAllStubs } = createMockSupabaseClient(undefined, config);
const dbClient = client as unknown as SupabaseClient<Database>;

// Returns actual file contents
const downloadFromStorage = async (
  _supabase: SupabaseClient,
  _bucket: string,
  path: string
): Promise<{ data: ArrayBuffer | null; error: Error | null }> => {
  const text = path.includes("raw") ? jsonText : template;
  const encoded = new TextEncoder().encode(text);
  const buffer = new ArrayBuffer(encoded.length);
  new Uint8Array(buffer).set(encoded);
  return { data: buffer, error: null };
};

// Properly typed FileManager
const fileManager: IFileManager = {
  uploadAndRegisterFile: (): Promise<FileManagerResponse> => {
    const record: Database['public']['Tables']['dialectic_project_resources']['Row'] = {
      id: "resource-1",
      project_id: "p1",
      session_id: sessionId,
      user_id: "user_123",
      stage_slug: "thesis",
      iteration_number: 1,
      resource_type: FileType.RenderedDocument,
      file_name: "rendered.md",
      mime_type: "text/markdown",
      size_bytes: 100,
      storage_bucket: "content",
      storage_path: "path",
      resource_description: null,
      source_contribution_id: rootId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return Promise.resolve({ record, error: null });
  },
  assembleAndSaveFinalDocument: (): Promise<{ finalPath: string | null; error: Error | null }> => {
    return Promise.resolve({ finalPath: null, error: null });
  },
};

// Properly typed NotificationService
const notificationService: NotificationServiceType = {
  sendContributionStartedEvent: () => Promise.resolve(),
  sendDialecticContributionStartedEvent: () => Promise.resolve(),
  sendContributionReceivedEvent: () => Promise.resolve(),
  sendContributionRetryingEvent: () => Promise.resolve(),
  sendContributionFailedNotification: () => Promise.resolve(),
  sendContributionGenerationCompleteEvent: () => Promise.resolve(),
  sendContributionGenerationContinuedEvent: () => Promise.resolve(),
  sendDialecticProgressUpdateEvent: () => Promise.resolve(),
  sendContributionGenerationFailedEvent: () => Promise.resolve(),
  sendDocumentCentricNotification: () => Promise.resolve(),
};

// Properly typed Logger
const logger: ILogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const deps: DocumentRendererDeps = {
  downloadFromStorage,
  fileManager,
  notificationService,
  notifyUserId: "user_123",
  logger,
};

const params: RenderDocumentParams = {
  projectId: "project_123",
  sessionId,
  iterationNumber: 1,
  stageSlug: "thesis",
  documentIdentity: rootId,
  documentKey: FileType.feature_spec,
  sourceContributionId: rootId,
  template_filename: "thesis_feature_spec.md",
};

const result = await renderDocument(dbClient, deps, params);
console.log(new TextDecoder().decode(result.renderedBytes));

clearAllStubs?.();
