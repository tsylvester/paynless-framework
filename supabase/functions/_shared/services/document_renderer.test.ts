import { assert, assertEquals } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../../types_db.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../supabase.mock.ts";
import { downloadFromStorage } from "../supabase_storage_utils.ts";
import { renderDocument } from "./document_renderer.ts";
import type { ContributionRowMinimal, RenderDocumentParams, RenderDocumentResult } from "./document_renderer.interface.ts";
import { FileType, type FileRecord } from "../types/file_manager.types.ts";
import { MockFileManagerService } from "./file_manager.mock.ts";
import { mockNotificationService, resetMockNotificationService } from "../utils/notification.service.mock.ts";
import { logger } from "../logger.ts";
import { renderPrompt } from "../prompt-renderer.ts";

// Real template structure from docs/templates/thesis/thesis_business_case.md
const REAL_THESIS_BUSINESS_CASE_TEMPLATE = `{{#section:executive_summary}}
# Executive Summary
{executive_summary}
{{/section:executive_summary}}

{{#section:market_opportunity}}
# Market Opportunity
{market_opportunity}
{{/section:market_opportunity}}

{{#section:user_problem_validation}}
# User Problem Validation
{user_problem_validation}
{{/section:user_problem_validation}}

{{#section:competitive_analysis}}
# Competitive Analysis
{competitive_analysis}
{{/section:competitive_analysis}}

{{#section:differentiation_&_value_proposition}}
# Differentiation & Value Proposition
{differentiation_&_value_proposition}
{{/section:differentiation_&_value_proposition}}

{{#section:risks_&_mitigation}}
# Risks & Mitigation
{risks_&_mitigation}
{{/section:risks_&_mitigation}}

# SWOT
{{#section:strengths}}
## Strengths
{strengths}
{{/section:strengths}}
{{#section:weaknesses}}
## Weaknesses
{weaknesses}
{{/section:weaknesses}}
{{#section:opportunities}}
## Opportunities
{opportunities}
{{/section:opportunities}}
{{#section:threats}}
## Threats
{threats}
{{/section:threats}}

{{#section:next_steps}}
# Next Steps
{next_steps}
{{/section:next_steps}}

{{#section:proposal_references}}
# References
{proposal_references}
{{/section:proposal_references}}

{{#section:_extra_content}}
# Additional Content
{_extra_content}
{{/section:_extra_content}}

`;

// Helper function to create a mock FileRecord for dialectic_project_resources
function createMockFileRecord(overrides?: Partial<Database['public']['Tables']['dialectic_project_resources']['Row']>): FileRecord {
  const defaultRecord: Database['public']['Tables']['dialectic_project_resources']['Row'] = {
    id: "resource-id-1",
    project_id: "project_123",
    session_id: "session_abc",
    user_id: "user_123",
    stage_slug: "thesis",
    iteration_number: 1,
    resource_type: FileType.RenderedDocument,
    file_name: "rendered_document.md",
    mime_type: "text/markdown",
    size_bytes: 100,
    storage_bucket: "content",
    storage_path: "project_123/session_abc/iteration_1/thesis/documents",
    resource_description: { type: FileType.RenderedDocument },
    source_contribution_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return { ...defaultRecord, ...overrides } as FileRecord;
}

Deno.test("DocumentRenderer - end-to-end contract (skeleton)", async (t) => {
  // Shared setup helpers
  const setup = (config: MockSupabaseDataConfig = {}) => {
    const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, config);
    return { dbClient: client as unknown as SupabaseClient<Database>, spies, clearAllStubs };
  };

  await t.step("can be invoked following an EXECUTE job completion with job signature", async () => {
    // End-state: renderer accepts explicit job signature and returns { pathContext, renderedBytes }
    const rootId = "root-1";
    const sessionId = "session_abc";
    const stageSlug = "thesis";

    const contributions: ContributionRowMinimal[] = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case.md",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
      },
    ];

    const structuredData = {
      executive_summary: "chunk-one executive summary content",
      market_opportunity: "chunk-one market opportunity content"
    };
    const agentResponse = { content: JSON.stringify(structuredData) };

    const { dbClient, spies, clearAllStubs } = setup({
      genericMockResults: {
        dialectic_contributions: {
          select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_projects: {
          select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_document_templates: {
          select: { data: [
            { id: 'template-1', created_at: '2025-01-01T00:00:00Z', description: null, domain_id: 'domain-1', file_name: 'thesis_business_case.md', is_active: true, name: 'thesis_business_case', storage_bucket: 'prompt-templates', storage_path: 'templates/thesis', updated_at: '2025-01-01T00:00:00Z' }
          ], error: null, count: null, status: 200, statusText: 'OK' }
        },
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case_raw.json")) {
            const jsonContent = JSON.stringify(agentResponse);
            return { data: new Blob([jsonContent], { type: "application/json" }), error: null };
          }
          // Treat any other path as template for this test
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        },
      },
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.business_case,
      sourceContributionId: rootId,
    };

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);
    
    // Access storage spies before calling renderDocument so they track calls as they happen
    const storageSpies = spies.storage.from("content");
    
    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      { 
        downloadFromStorage, 
        fileManager: mockFileManager, 
        notificationService: mockNotificationService, 
        notifyUserId: "user_123", 
        logger: logger },
      params,
    );

    assert(result && typeof result === "object");
    assert("pathContext" in result);
    assert("renderedBytes" in result);
    const rendered = new TextDecoder().decode(result.renderedBytes);
    assert(rendered.includes("# Executive Summary"), "rendered document should contain Executive Summary section");
    assert(rendered.includes("chunk-one executive summary content"), "rendered document should contain executive summary content");
    assert(rendered.includes("# Market Opportunity"), "rendered document should contain Market Opportunity section");
    assert(rendered.includes("chunk-one market opportunity content"), "rendered document should contain market opportunity content");
    assert(storageSpies.downloadSpy.calls.length >= 1);

    clearAllStubs?.();
  });

  await t.step("locates all relevant contribution chunks for the document", async () => {
    // Expectation: queries dialectic_contributions for the document's true-root identity
    // - Includes all latest edits for the target document across continuation chunks
    // - Excludes unrelated documents
    // - Strict ordering: edit_version ascending, then created_at
    const rootId = "root-contribution-id-1";
    const sessionId = "session_abc";

    const contributions: ContributionRowMinimal[] = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case.md",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
      },
      {
        id: "cont-2",
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_1_business_case.md",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_1_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 1, 0).toISOString(),
        target_contribution_id: rootId,
        edit_version: 2,
        is_latest_edit: true,
        user_id: "user_123",
      },
      // Unrelated doc in same session should be excluded
      {
        id: "unrelated",
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "modelA_0_other_doc.md",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/modelA_0_other_doc_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: "another-root" },
        created_at: new Date(2025, 0, 1, 11, 59, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
      },
    ];

    const { dbClient, spies, clearAllStubs } = setup({
      genericMockResults: {
        dialectic_contributions: {
          select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_projects: {
          select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_document_templates: {
          select: { data: [
            { id: 'template-1', created_at: '2025-01-01T00:00:00Z', description: null, domain_id: 'domain-1', file_name: 'thesis_business_case.md', is_active: true, name: 'thesis_business_case', storage_bucket: 'prompt-templates', storage_path: 'templates/thesis', updated_at: '2025-01-01T00:00:00Z' }
          ], error: null, count: null, status: 200, statusText: 'OK' }
        },
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case_raw.json")) {
            const structuredData1 = { executive_summary: "A1 executive summary", market_opportunity: "A1 market opportunity" };
            return { data: new Blob([JSON.stringify({ content: JSON.stringify(structuredData1) })], { type: "application/json" }), error: null };
          }
          if (path.endsWith("gpt-4o-mini_1_business_case_raw.json")) {
            const structuredData2 = { executive_summary: "A2 executive summary", market_opportunity: "A2 market opportunity" };
            return { data: new Blob([JSON.stringify({ content: JSON.stringify(structuredData2) })], { type: "application/json" }), error: null };
          }
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        },
      },
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug: "thesis",
      documentIdentity: rootId,
      documentKey: FileType.business_case,
      sourceContributionId: rootId,
    };

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      { 
        downloadFromStorage, 
        fileManager: (() => {
          const fm = new MockFileManagerService();
          fm.setUploadAndRegisterFileResponse(createMockFileRecord(), null);
          return fm;
        })(), 
        notificationService: mockNotificationService, 
        notifyUserId: "user_123", 
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);
    const idx1 = rendered.indexOf("A1 executive summary");
    const idx2 = rendered.indexOf("A2 executive summary");
    assert(idx1 !== -1 && idx2 !== -1 && idx1 < idx2, "content should be in correct order");

    // Contract: renderer should query contributions table
    assertEquals(typeof spies.fromSpy, "function");

    clearAllStubs?.();
  });

  await t.step("renders chunks into markdown using a stage/file-type template (@templates)", async () => {
    // Expectation: selects a template based on stageSlug or file type; fills with ordered content
    // - Do not rely on file system templates directly in unit test; mock the template loader
    // - Resulting markdown is deterministic given the same chunk set
    const rootId = "root-contribution-id-2";
    const sessionId = "session_xyz";

    const contributions: ContributionRowMinimal[] = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case.md",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 2, 10, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
      },
      {
        id: "cont-b",
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_1_business_case.md",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_1_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 2, 10, 1, 0).toISOString(),
        target_contribution_id: rootId,
        edit_version: 2,
        is_latest_edit: true,
        user_id: "user_123",
      },
    ];

    const { dbClient, clearAllStubs } = setup({
      genericMockResults: {
        dialectic_contributions: {
          select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_projects: {
          select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_document_templates: {
          select: { data: [
            { id: 'template-1', created_at: '2025-01-01T00:00:00Z', description: null, domain_id: 'domain-1', file_name: 'thesis_business_case.md', is_active: true, name: 'thesis_business_case', storage_bucket: 'prompt-templates', storage_path: 'templates/thesis', updated_at: '2025-01-01T00:00:00Z' }
          ], error: null, count: null, status: 200, statusText: 'OK' }
        },
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case_raw.json")) {
            const structuredData1 = { executive_summary: "B1 executive summary", market_opportunity: "B1 market opportunity" };
            return { data: new Blob([JSON.stringify({ content: JSON.stringify(structuredData1) })], { type: "application/json" }), error: null };
          }
          if (path.endsWith("gpt-4o-mini_1_business_case_raw.json")) {
            const structuredData2 = { executive_summary: "B2 executive summary", market_opportunity: "B2 market opportunity" };
            return { data: new Blob([JSON.stringify({ content: JSON.stringify(structuredData2) })], { type: "application/json" }), error: null };
          }
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        },
      },
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug: "thesis",
      documentIdentity: rootId,
      documentKey: FileType.business_case,
      sourceContributionId: rootId,
    };

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      { 
        downloadFromStorage, 
        fileManager: (() => {
          const fm = new MockFileManagerService();
          fm.setUploadAndRegisterFileResponse(createMockFileRecord(), null);
          return fm;
        })(), 
        notificationService: mockNotificationService, 
        notifyUserId: "user_123", 
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);
    assert(rendered.includes("# Executive Summary"), "rendered document should start with Executive Summary section");
    const i1 = rendered.indexOf("B1 executive summary");
    const i2 = rendered.indexOf("B2 executive summary");
    assert(i1 !== -1 && i2 !== -1 && i1 < i2, "content should be in correct order");

    clearAllStubs?.();
  });

  await t.step("writes the rendered markdown to storage with deterministic final-artifact path", async () => {
    // End-state: renderer calls fileManager.uploadAndRegisterFile once with a pathContext aligned to root identity
    const rootId = "root-render-1";
    const sessionId = "session_r1";
    const stageSlug = "thesis";

    const root: ContributionRowMinimal = {
      id: rootId,
      session_id: sessionId,
      stage: "THESIS",
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_abcd/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case.md",
      raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { thesis: rootId },
      created_at: new Date(2025, 4, 1, 10, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      user_id: "user_123",
    };

    const contributions: ContributionRowMinimal[] = [root];

    const structuredData = { executive_summary: "render-body executive summary", market_opportunity: "render-body market opportunity" };
    const agentResponse = { content: JSON.stringify(structuredData) };
    const chunkBody = "render-body executive summary";

    const { dbClient, clearAllStubs } = setup({
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
                file_name: "thesis_business_case.md",
                is_active: true,
                name: "thesis_business_case",
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
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case_raw.json")) {
            return { data: new Blob([JSON.stringify(agentResponse)], { type: "application/json" }), error: null };
          }
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        },
      },
    });

    const fm = new MockFileManagerService();
    fm.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.business_case,
      sourceContributionId: rootId,
    };

    await renderDocument(dbClient, { 
      downloadFromStorage, 
      fileManager: fm, 
      notificationService: mockNotificationService, 
      notifyUserId: "user_123", 
      logger: logger,
    }, params);

    assert(fm.uploadAndRegisterFile.calls.length === 1);
    const callArg = fm.uploadAndRegisterFile.calls[0].args[0];
    const pc = callArg.pathContext || {};
    assert(pc["projectId"] === "project_123");
    assert(pc["sessionId"] === sessionId);
    assert(pc["iteration"] === 1);
    assert(pc["stageSlug"] === stageSlug);
    assert(pc["documentKey"] === "business_case");
    assert(pc["modelSlug"] === "gpt-4o-mini");
    let bodyText: string;
    if (typeof callArg.fileContent === "string") {
      bodyText = callArg.fileContent;
    } else if (callArg.fileContent instanceof Blob) {
      bodyText = await callArg.fileContent.text();
    } else if (callArg.fileContent instanceof ArrayBuffer) {
      bodyText = new TextDecoder().decode(callArg.fileContent);
    } else {
      // Fallback for Buffer-like types in Deno std
      const maybeBuffer = callArg.fileContent;
      bodyText = typeof maybeBuffer.toString === 'function' ? maybeBuffer.toString('utf-8') : String(maybeBuffer);
    }
    assert(typeof bodyText === "string" && bodyText.includes(chunkBody));

    clearAllStubs?.();
  });

  await t.step("issues a notification that the document has been rendered with its signature", async () => {
    // End-state: call deps.notificationService with signature { projectId, sessionId, iterationNumber, stageSlug, documentIdentity }
    const rootId = "root-render-2";
    const sessionId = "session_r2";
    const stageSlug = "thesis";
    const contributionsNotif: ContributionRowMinimal[] = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "project_123/session_abcd/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case.md",
        raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 4, 1, 11, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
      },
    ];

    const notifications: Array<{ 
        payload: { 
            type: string; 
            projectId: string; 
            sessionId: string; 
            iterationNumber: number;
             stageSlug: string; 
             documentIdentity: string; 
             documentKey: string; 
             completed: boolean 
            }, 
            userId: string 
        }> = [];
    resetMockNotificationService();

    const { dbClient, clearAllStubs } = setup({
      genericMockResults: {
        dialectic_contributions: { select: { data: contributionsNotif, error: null, count: null, status: 200, statusText: "OK" } },
        dialectic_projects: {
          select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_document_templates: { select: { data: [ { id: 'template-1', created_at: '2025-01-01T00:00:00Z', description: null, domain_id: 'domain-1', file_name: 'thesis_business_case.md', is_active: true, name: 'thesis_business_case', storage_bucket: 'prompt-templates', storage_path: 'templates/thesis', updated_at: '2025-01-01T00:00:00Z' } ], error: null, count: null, status: 200, statusText: 'OK' } }
      },
      storageMock: { 
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case_raw.json")) {
            const structuredData = { executive_summary: "test content executive summary", market_opportunity: "test content market opportunity" };
            return { data: new Blob([JSON.stringify({ content: JSON.stringify(structuredData) })], { type: "application/json" }), error: null };
          }
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        }
      },
    });

    const params: RenderDocumentParams = { projectId: "project_123", sessionId, iterationNumber: 1, stageSlug, documentIdentity: rootId, documentKey: FileType.business_case, sourceContributionId: rootId };
    await renderDocument(dbClient, { 
      downloadFromStorage, 
      fileManager: (() => {
        const fm = new MockFileManagerService();
        fm.setUploadAndRegisterFileResponse(createMockFileRecord(), null);
        return fm;
      })(),
      notificationService: mockNotificationService,
      notifyUserId: "user_123", 
      logger: logger,
    }, params);

    assert(mockNotificationService.sendDocumentCentricNotification.calls.length === 1);
    const [payload, userId] = mockNotificationService.sendDocumentCentricNotification.calls[0].args;
    assert(payload.type === 'render_completed');
    assert(payload.sessionId === sessionId);
    assert(payload.stageSlug === stageSlug);
    assert(payload.job_id === 'render-root-render-2');
    assert(payload.document_key === "business_case");
    assert(payload.modelId === 'gpt-4o-mini');
    assert(payload.iterationNumber === 1);
    assert(userId === contributionsNotif[0].user_id);

    clearAllStubs?.();
  });

  await t.step("idempotent and cumulative behavior", async () => {
    // End-state:
    // - Same inputs → identical output; same final path
    // - Adding a new continuation chunk → output includes the new body appended; path unchanged
    const rootId = "root-render-3";
    const sessionId = "session_r3";
    const stageSlug = "thesis";

    const root: ContributionRowMinimal = {
      id: rootId,
      session_id: sessionId,
      stage: "THESIS",
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_abcd/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case.md",
      raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { thesis: rootId },
      created_at: new Date(2025, 4, 1, 12, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
    };

    const cont1: ContributionRowMinimal = {
      id: "cont-1",
      session_id: sessionId,
      stage: "THESIS",
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: root.storage_path,
      file_name: "gpt-4o-mini_1_business_case.md",
      raw_response_storage_path: `${root.storage_path}/gpt-4o-mini_1_business_case_raw.json`,
      mime_type: "text/markdown",
      document_relationships: { thesis: rootId },
      created_at: new Date(2025, 4, 1, 12, 1, 0).toISOString(),
      target_contribution_id: rootId,
      edit_version: 2,
      is_latest_edit: true,
    };

    let contributionsIdem: ContributionRowMinimal[] = [root, cont1];

    const bodies: Record<string, Record<string, string>> = {
      "gpt-4o-mini_0_business_case_raw.json": { executive_summary: "C1 executive summary", market_opportunity: "C1 market opportunity" },
      "gpt-4o-mini_1_business_case_raw.json": { executive_summary: "C2 executive summary", market_opportunity: "C2 market opportunity" },
    };

    const { dbClient: dbClientIdem, clearAllStubs: clearAllStubsIdem } = setup({
      genericMockResults: {
        dialectic_contributions: { select: async () => ({ data: contributionsIdem, error: null, count: null, status: 200, statusText: "OK" }) },
        dialectic_projects: {
          select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_document_templates: { select: { data: [ { id: 'template-1', created_at: '2025-01-01T00:00:00Z', description: null, domain_id: 'domain-1', file_name: 'thesis_business_case.md', is_active: true, name: 'thesis_business_case', storage_bucket: 'prompt-templates', storage_path: 'templates/thesis', updated_at: '2025-01-01T00:00:00Z' } ], error: null, count: null, status: 200, statusText: 'OK' } }
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          const name = path.substring(path.lastIndexOf("/") + 1);
          const isChunk = name in bodies;
          if (isChunk) {
            const jsonContent = JSON.stringify({ content: JSON.stringify(bodies[name]) });
            return { data: new Blob([jsonContent], { type: "application/json" }), error: null };
          }
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        },
      },
    });

    const paramsIdem: RenderDocumentParams = { projectId: "project_123", sessionId, iterationNumber: 1, stageSlug, documentIdentity: rootId, documentKey: FileType.business_case, sourceContributionId: rootId };

    const fmIdem = new MockFileManagerService();
    fmIdem.setUploadAndRegisterFileResponse(createMockFileRecord(), null);
    const r1 = await renderDocument(dbClientIdem, 
        { 
        downloadFromStorage, 
        fileManager: fmIdem,
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      }, paramsIdem);

    const rendered1 = new TextDecoder().decode(r1.renderedBytes);
    assert(rendered1.includes("C1 executive summary") && rendered1.includes("C2 executive summary"), "rendered document should contain both chunks");

    const r2 = await renderDocument(dbClientIdem, 
        { 
            downloadFromStorage, 
            fileManager: fmIdem,
            notificationService: mockNotificationService,
            notifyUserId: "user_123",
            logger: logger,
          }, paramsIdem);

    const rendered2 = new TextDecoder().decode(r2.renderedBytes);
    assert(rendered2 === rendered1);

    const cont2: ContributionRowMinimal = { ...cont1, id: "cont-2", file_name: "gpt-4o-mini_2_business_case.md", raw_response_storage_path: `${root.storage_path}/gpt-4o-mini_2_business_case_raw.json`, created_at: new Date(2025, 4, 1, 12, 2, 0).toISOString(), edit_version: 3, target_contribution_id: cont1.id };
    contributionsIdem = [root, cont1, cont2];
    bodies["gpt-4o-mini_2_business_case_raw.json"] = { executive_summary: "C3 executive summary", market_opportunity: "C3 market opportunity" };

    const r3 = await renderDocument(dbClientIdem, 
        { 
            downloadFromStorage, 
            fileManager: fmIdem,
            notificationService: mockNotificationService,
            notifyUserId: "user_123",
            logger: logger,
          }, paramsIdem);
                    
    const rendered3 = new TextDecoder().decode(r3.renderedBytes);
    assert(rendered3.includes("C1 executive summary") && rendered3.includes("C2 executive summary") && rendered3.includes("C3 executive summary"), "rendered document should contain all three chunks");

    assert(fmIdem.uploadAndRegisterFile.calls.length === 3);
    const pc1 = fmIdem.uploadAndRegisterFile.calls[0].args[0].pathContext;
    const pc2 = fmIdem.uploadAndRegisterFile.calls[1].args[0].pathContext;
    const pc3 = fmIdem.uploadAndRegisterFile.calls[2].args[0].pathContext;
    assert(pc1 && pc2 && pc3);
    assert(pc1.projectId === pc2.projectId && pc2.projectId === pc3.projectId);
    assert(pc1.sessionId === pc2.sessionId && pc2.sessionId === pc3.sessionId);
    assert(pc1.stageSlug === pc2.stageSlug && pc2.stageSlug === pc3.stageSlug);

    clearAllStubsIdem?.();
  });

  await t.step("produces identical ordering via chain-walk and created_at parity", async () => {
    // Expectation: walking target_contribution_id from root yields X1 -> X2 -> X3 order
    const rootId = "root-order-1";
    const sessionId = "session_o1";
    const stageSlug = "thesis";

    const r: ContributionRowMinimal = {
      id: rootId,
      session_id: sessionId,
      stage: "THESIS",
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_abcd/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case.md",
      raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { thesis: rootId },
      created_at: new Date(2025, 5, 1, 10, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
    };
    const c1: ContributionRowMinimal = { ...r, id: "c1", file_name: "gpt-4o-mini_1_business_case.md", raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_1_business_case_raw.json", created_at: new Date(2025, 5, 1, 10, 1, 0).toISOString(), target_contribution_id: rootId, edit_version: 2 };
    const c2: ContributionRowMinimal = { ...r, id: "c2", file_name: "gpt-4o-mini_2_business_case.md", raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_2_business_case_raw.json", created_at: new Date(2025, 5, 1, 10, 2, 0).toISOString(), target_contribution_id: "c1", edit_version: 3 };
    const contributions: ContributionRowMinimal[] = [r, c1, c2];

    const bodies: Record<string, Record<string, string>> = {
      "gpt-4o-mini_0_business_case_raw.json": { executive_summary: "X1 executive summary", market_opportunity: "X1 market opportunity" },
      "gpt-4o-mini_1_business_case_raw.json": { executive_summary: "X2 executive summary", market_opportunity: "X2 market opportunity" },
      "gpt-4o-mini_2_business_case_raw.json": { executive_summary: "X3 executive summary", market_opportunity: "X3 market opportunity" },
    };

    const { dbClient, clearAllStubs } = setup({
      genericMockResults: { 
        dialectic_contributions: { select: async () => ({ data: contributions, error: null, count: null, status: 200, statusText: "OK" }) },
        dialectic_projects: {
          select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_document_templates: { select: { data: [ { id: 'template-1', created_at: '2025-01-01T00:00:00Z', description: null, domain_id: 'domain-1', file_name: 'thesis_business_case.md', is_active: true, name: 'thesis_business_case', storage_bucket: 'prompt-templates', storage_path: 'templates/thesis', updated_at: '2025-01-01T00:00:00Z' } ], error: null, count: null, status: 200, statusText: 'OK' } }
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          const name = path.substring(path.lastIndexOf("/") + 1);
          const isChunk = name in bodies;
          if (isChunk) {
            const jsonContent = JSON.stringify({ content: JSON.stringify(bodies[name]) });
            return { data: new Blob([jsonContent], { type: "application/json" }), error: null };
          }
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        },
      },
    });

    const params: RenderDocumentParams = { projectId: "project_123", sessionId, iterationNumber: 1, stageSlug, documentIdentity: rootId, documentKey: FileType.business_case, sourceContributionId: rootId };
    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);
    const result: RenderDocumentResult = await renderDocument(dbClient, { 
      downloadFromStorage, 
      fileManager: mockFileManager, 
      notificationService: mockNotificationService, 
      notifyUserId: "user_123", 
      logger: logger,
    }, params);
    const rendered = new TextDecoder().decode(result.renderedBytes);
    const i1 = rendered.indexOf("X1 executive summary");
    const i2 = rendered.indexOf("X2 executive summary");
    const i3 = rendered.indexOf("X3 executive summary");
    assert(i1 !== -1 && i2 !== -1 && i3 !== -1 && i1 < i2 && i2 < i3, "content should be in correct order");

    clearAllStubs?.();
  });

  await t.step("prefers latest user-edited version over prior model chunks", async () => {
    // Expectation: if an edit exists (original_model_contribution_id -> model chunk, is_latest_edit), use edit content
    const rootId = "root-edit-1";
    const sessionId = "session_e1";
    const stageSlug = "thesis";

    const modelChunk: ContributionRowMinimal = {
      id: rootId,
      session_id: sessionId,
      stage: "THESIS",
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_abcd/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case.md",
      raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { thesis: rootId },
      created_at: new Date(2025, 6, 1, 10, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      user_id: "user_123",
    };

    const userEdit: ContributionRowMinimal = {
      ...modelChunk,
      id: "edit-1",
      file_name: "gpt-4o-mini_0_business_case.md", // edits may overwrite same name
      raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      original_model_contribution_id: modelChunk.id,
      is_latest_edit: true,
      created_at: new Date(2025, 6, 1, 10, 5, 0).toISOString(),
    };

    const contributions: ContributionRowMinimal[] = [modelChunk, userEdit];

    const { dbClient, clearAllStubs } = setup({
      genericMockResults: { 
        dialectic_contributions: { select: async () => ({ data: contributions, error: null, count: null, status: 200, statusText: "OK" }) },
        dialectic_projects: {
          select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_document_templates: { select: { data: [ { id: 'template-1', created_at: '2025-01-01T00:00:00Z', description: null, domain_id: 'domain-1', file_name: 'thesis_business_case.md', is_active: true, name: 'thesis_business_case', storage_bucket: 'prompt-templates', storage_path: 'templates/thesis', updated_at: '2025-01-01T00:00:00Z' } ], error: null, count: null, status: 200, statusText: 'OK' } }
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case_raw.json")) {
            // Since userEdit is latest, return USER content
            const structuredData = { executive_summary: "USER executive summary", market_opportunity: "USER market opportunity" };
            return { data: new Blob([JSON.stringify({ content: JSON.stringify(structuredData) })], { type: "application/json" }), error: null };
          }
          // Otherwise this is the template fetch
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        },
      },
    });

    const params: RenderDocumentParams = { projectId: "project_123", sessionId, iterationNumber: 1, stageSlug, documentIdentity: rootId, documentKey: FileType.business_case, sourceContributionId: rootId };
    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);
    const result: RenderDocumentResult = await renderDocument(dbClient, { 
      downloadFromStorage, 
      fileManager: mockFileManager, 
      notificationService: mockNotificationService, 
      notifyUserId: "user_123", 
      logger: logger,
    }, params);
    const rendered = new TextDecoder().decode(result.renderedBytes);
    assert(rendered.includes("USER executive summary"), "rendered document should contain user edit content");
    assert(rendered.includes("# Executive Summary"), "rendered document should contain Executive Summary section");

    clearAllStubs?.();
  });
  
  await t.step("applies DB-side filtering predicates to contributions query", async () => {
    const rootId = "root-filter-1";
    const sessionId = "session_f1";
    const stageSlug = "thesis";

    const contributions: ContributionRowMinimal[] = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "project_123/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case.md",
        raw_response_storage_path: "project_123/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 7, 1, 10, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
      },
      // Unrelated row that should be excluded by DB filtering
      {
        id: "unrelated-x",
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "project_123/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_other_doc.md",
        raw_response_storage_path: "project_123/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_other_doc_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: "another-root" },
        created_at: new Date(2025, 7, 1, 9, 59, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
      },
    ];

    const { dbClient, spies, clearAllStubs } = setup({
      genericMockResults: {
        dialectic_contributions: {
          select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_projects: {
          select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_document_templates: {
          select: { data: [ { id: "template-1", created_at: "2025-01-01T00:00:00Z", description: null, domain_id: "domain-1", file_name: "thesis_business_case.md", is_active: true, name: "thesis_business_case", storage_bucket: "prompt-templates", storage_path: "templates/thesis", updated_at: "2025-01-01T00:00:00Z" } ], error: null, count: null, status: 200, statusText: "OK" }
        },
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case_raw.json")) {
            const structuredData = { executive_summary: "filtered content executive summary", market_opportunity: "filtered content market opportunity" };
            return { data: new Blob([JSON.stringify({ content: JSON.stringify(structuredData) })], { type: "application/json" }), error: null };
          }
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        },
      },
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.business_case,
      sourceContributionId: rootId,
    };

    await renderDocument(
      dbClient,
      { 
        downloadFromStorage, 
        fileManager: (() => {
          const fm = new MockFileManagerService();
          fm.setUploadAndRegisterFileResponse(createMockFileRecord(), null);
          return fm;
        })(), 
        notificationService: mockNotificationService, 
        notifyUserId: "user_123", 
        logger: logger,
      },
      params,
    );

    // Assert predicate usage on dialectic_contributions query
    const eqCalls = spies.getHistoricQueryBuilderSpies("dialectic_contributions", "eq");
    const containsCalls = spies.getHistoricQueryBuilderSpies("dialectic_contributions", "contains");
    const orderCalls = spies.getHistoricQueryBuilderSpies("dialectic_contributions", "order");

    // Expect at least session_id and iteration_number equality filters
    assert(eqCalls && eqCalls.callCount >= 2, "expected eq() filters to be applied");
    const hasSessionEq = (eqCalls?.callsArgs || []).some((args) => args[0] === "session_id" && args[1] === sessionId);
    const hasIterationEq = (eqCalls?.callsArgs || []).some((args) => args[0] === "iteration_number" && args[1] === 1);
    assert(hasSessionEq, "expected eq('session_id', sessionId)");
    assert(hasIterationEq, "expected eq('iteration_number', 1)");

    // Expect JSON containment on document_relationships for stage key
    assert(containsCalls && containsCalls.callCount >= 1, "expected contains() on document_relationships");
    const stageKey = stageSlug;
    const hasContains = (containsCalls?.callsArgs || []).some((args) => {
      if (!Array.isArray(args)) return false;
      const [col, val] = args;
      if (col !== "document_relationships") return false;
      if (typeof val !== "object" || val === null) return false;
      try {
        const s = JSON.stringify(val);
        return s.includes(`"${stageKey}":"${rootId}"`);
      } catch {
        return false;
      }
    });
    assert(hasContains, "expected contains('document_relationships', { [STAGE]: documentIdentity })");

    // Expect ordering by edit_version then created_at
    assert(orderCalls && orderCalls.callCount >= 2, "expected order() by edit_version and created_at");
    const hasOrderEdit = (orderCalls?.callsArgs || []).some((args) => Array.isArray(args) && args[0] === "edit_version");
    const hasOrderCreated = (orderCalls?.callsArgs || []).some((args) => Array.isArray(args) && args[0] === "created_at");
    assert(hasOrderEdit, "expected order('edit_version', { ascending: true })");
    assert(hasOrderCreated, "expected order('created_at', { ascending: true })");

    clearAllStubs?.();
  });

  await t.step("passes the originating contribution id to FileManager", async () => {
    const rootId = "root-contrib-123";
    const sessionId = "session_source_check";
    const stageSlug = "thesis";

    const contributions: ContributionRowMinimal[] = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "project_123/session_abcd/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case.md",
        raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 4, 2, 10, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
      },
    ];

    const structuredData = { executive_summary: "source-body executive summary", market_opportunity: "source-body market opportunity" };
    const agentResponse = { content: JSON.stringify(structuredData) };
    const chunkBody = "source-body executive summary";

    const { dbClient, clearAllStubs } = setup({
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
                file_name: "thesis_business_case.md",
                is_active: true,
                name: "thesis_business_case",
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
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case_raw.json")) {
            return { data: new Blob([JSON.stringify(agentResponse)], { type: "application/json" }), error: null };
          }
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        },
      },
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.business_case,
      sourceContributionId: rootId,
    };

    await renderDocument(
      dbClient,
      {
        downloadFromStorage,
        fileManager,
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 1);
    const uploadArgs = fileManager.uploadAndRegisterFile.calls[0].args[0];
    assert(uploadArgs.pathContext, "expected upload path context to be defined");
    assertEquals(uploadArgs.pathContext.sourceContributionId, rootId);

    clearAllStubs?.();
  });
});

Deno.test("DocumentRenderer - JSON parsing and content extraction", async (t) => {
  const setup = (config: MockSupabaseDataConfig = {}) => {
    const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, config);
    return { dbClient: client as unknown as SupabaseClient<Database>, spies, clearAllStubs };
  };

  await t.step("parses JSON content from raw_response_storage_path and extracts content field", async () => {
    const rootId = "root-json-1";
    const sessionId = "session_json1";
    const stageSlug = "thesis";
    const rawJsonPath = "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json";
    const structuredData = { executive_summary: "This is the executive summary content.", market_opportunity: "This is the market opportunity content." };
    const jsonContent = JSON.stringify({ content: JSON.stringify(structuredData) });
    const expectedExtractedContent = "This is the executive summary content.";

    const contributions: ContributionRowMinimal[] = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case.md",
        raw_response_storage_path: rawJsonPath,
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
      },
    ];

    const downloadCalls: Array<{ bucket: string; path: string }> = [];

    const mockDownloadFromStorage = async (
      supabase: SupabaseClient,
      bucket: string,
      path: string,
    ) => {
      downloadCalls.push({ bucket, path });
      if (path === rawJsonPath) {
        const blob = new Blob([jsonContent], { type: "application/json" });
        return { data: await blob.arrayBuffer(), error: null };
      }
      const blob = new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" });
      return { data: await blob.arrayBuffer(), error: null };
    };

    const { dbClient, clearAllStubs } = setup({
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
                file_name: "thesis_business_case.md",
                is_active: true,
                name: "thesis_business_case",
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
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.business_case,
      sourceContributionId: rootId,
    };

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage: mockDownloadFromStorage,
        fileManager: (() => {
          const fm = new MockFileManagerService();
          fm.setUploadAndRegisterFileResponse(createMockFileRecord(), null);
          return fm;
        })(),
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);

    const rawJsonCall = downloadCalls.find((call) => call.path === rawJsonPath);
    assert(rawJsonCall !== undefined, "downloadFromStorage should be called with raw_response_storage_path");
    assertEquals(rawJsonCall.bucket, "content");

    const filePathCall = downloadCalls.find((call) => call.path.includes(contributions[0].file_name));
    assert(filePathCall === undefined, "downloadFromStorage should NOT be called with file_name");

    assert(rendered.includes("# Executive Summary"), "rendered document should contain Executive Summary section");
    assert(rendered.includes(expectedExtractedContent), "rendered document should contain extracted executive summary content");
    assert(rendered.includes("# Market Opportunity"), "rendered document should contain Market Opportunity section");
    assert(rendered.includes("This is the market opportunity content."), "rendered document should contain market opportunity content");
    assert(!rendered.includes('{"content":'), "rendered document should NOT contain raw JSON string");

    clearAllStubs?.();
  });

  await t.step("converts escaped newlines, quotes, and backslashes correctly", async () => {
    const rootId = "root-json-2";
    const sessionId = "session_json2";
    const stageSlug = "thesis";
    const rawJsonPath = "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json";
    const structuredData = { executive_summary: 'Title\n\nQuote: "text"\nBackslash: \\path', market_opportunity: "Market opportunity content" };
    const jsonContent = JSON.stringify({ content: JSON.stringify(structuredData) });
    const expectedExtractedContent = 'Title\n\nQuote: "text"\nBackslash: \\path';

    const contributions: ContributionRowMinimal[] = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case.md",
        raw_response_storage_path: rawJsonPath,
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
      },
    ];

    const mockDownloadFromStorage = async (
      _supabase: SupabaseClient,
      _bucket: string,
      path: string,
    ) => {
      if (path === rawJsonPath) {
        const blob = new Blob([jsonContent], { type: "application/json" });
        return { data: await blob.arrayBuffer(), error: null };
      }
      const blob = new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" });
      return { data: await blob.arrayBuffer(), error: null };
    };

    const { dbClient, clearAllStubs } = setup({
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
                file_name: "thesis_business_case.md",
                is_active: true,
                name: "thesis_business_case",
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
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.business_case,
      sourceContributionId: rootId,
    };

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage: mockDownloadFromStorage,
        fileManager: (() => {
          const fm = new MockFileManagerService();
          fm.setUploadAndRegisterFileResponse(createMockFileRecord(), null);
          return fm;
        })(),
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);

    assert(rendered.includes("# Executive Summary"), "rendered document should contain Executive Summary section");
    assert(rendered.includes('Quote: "text"'), "rendered document should have escaped quotes converted");
    assert(rendered.includes("Backslash: \\path"), "rendered document should preserve backslashes correctly");
    assert(!rendered.includes('\\n'), "rendered document should NOT contain literal \\n escape sequences");
    assert(rendered.includes("\n\n"), "rendered document should contain actual newline characters");

    clearAllStubs?.();
  });

  await t.step("uses markdown content directly when content is not JSON", async () => {
    const rootId = "root-json-3";
    const sessionId = "session_json3";
    const stageSlug = "thesis";
    const rawMarkdownPath = "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json";
    const markdownContent = "# Business Case\n\n## Market Opportunity\nThis is markdown content.";

    const contributions: ContributionRowMinimal[] = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case.md",
        raw_response_storage_path: rawMarkdownPath,
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
      },
    ];

    const downloadCalls: Array<{ bucket: string; path: string }> = [];

    const mockDownloadFromStorage = async (
      _supabase: SupabaseClient,
      bucket: string,
      path: string,
    ) => {
      downloadCalls.push({ bucket, path });
      if (path === rawMarkdownPath) {
        const blob = new Blob([markdownContent], { type: "text/markdown" });
        return { data: await blob.arrayBuffer(), error: null };
      }
      const blob = new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" });
      return { data: await blob.arrayBuffer(), error: null };
    };

    const { dbClient, clearAllStubs } = setup({
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
                file_name: "thesis_business_case.md",
                is_active: true,
                name: "thesis_business_case",
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
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.business_case,
      sourceContributionId: rootId,
    };

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage: mockDownloadFromStorage,
        fileManager: (() => {
          const fm = new MockFileManagerService();
          fm.setUploadAndRegisterFileResponse(createMockFileRecord(), null);
          return fm;
        })(),
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);

    const rawMarkdownCall = downloadCalls.find((call) => call.path === rawMarkdownPath);
    assert(rawMarkdownCall !== undefined, "downloadFromStorage should be called with raw_response_storage_path");
    assertEquals(rawMarkdownCall.bucket, "content");

    const filePathCall = downloadCalls.find((call) => call.path.includes(contributions[0].file_name));
    assert(filePathCall === undefined, "downloadFromStorage should NOT be called with file_name");

    assert(rendered.includes(markdownContent), "rendered document should contain markdown content directly");
    assert(rendered.includes("# Business Case"), "rendered document should contain markdown title");
    assert(rendered.includes("## Market Opportunity"), "rendered document should contain markdown section");
    assert(!rendered.includes('{"content":'), "rendered document should NOT attempt to parse markdown as JSON");

    clearAllStubs?.();
  });

  await t.step("handles mixed JSON and markdown chunks correctly", async () => {
    const rootId = "root-json-4";
    const sessionId = "session_json4";
    const stageSlug = "thesis";
    const rawJsonPath1 = "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json";
    const structuredData1 = { executive_summary: "First Chunk\n\nThis is from JSON.", market_opportunity: "First chunk market opportunity" };
    const jsonContent1 = JSON.stringify({ content: JSON.stringify(structuredData1) });
    const expectedExtracted1 = "First Chunk\n\nThis is from JSON.";
    const markdownPath2 = "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_1_business_case.md";
    const markdownContent2 = "# Second Chunk\n\nThis is markdown.";

    const contributions: ContributionRowMinimal[] = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case.md",
        raw_response_storage_path: rawJsonPath1,
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
      },
      {
        id: "cont-json-4",
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_1_business_case.md",
        raw_response_storage_path: markdownPath2,
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 1, 0).toISOString(),
        target_contribution_id: rootId,
        edit_version: 2,
        is_latest_edit: true,
        user_id: "user_123",
      },
    ];

    const mockDownloadFromStorage = async (
      _supabase: SupabaseClient,
      _bucket: string,
      path: string,
    ) => {
      if (path === rawJsonPath1) {
        const blob = new Blob([jsonContent1], { type: "application/json" });
        return { data: await blob.arrayBuffer(), error: null };
      }
      if (path.includes("gpt-4o-mini_1_business_case.md")) {
        const blob = new Blob([markdownContent2], { type: "text/markdown" });
        return { data: await blob.arrayBuffer(), error: null };
      }
      const blob = new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" });
      return { data: await blob.arrayBuffer(), error: null };
    };

    const { dbClient, clearAllStubs } = setup({
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
                file_name: "thesis_business_case.md",
                is_active: true,
                name: "thesis_business_case",
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
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.business_case,
      sourceContributionId: rootId,
    };

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage: mockDownloadFromStorage,
        fileManager: (() => {
          const fm = new MockFileManagerService();
          fm.setUploadAndRegisterFileResponse(createMockFileRecord(), null);
          return fm;
        })(),
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);

    assert(rendered.includes(expectedExtracted1), "rendered document should contain extracted JSON content");
    assert(rendered.includes(markdownContent2), "rendered document should contain markdown content");
    const idx1 = rendered.indexOf(expectedExtracted1);
    const idx2 = rendered.indexOf(markdownContent2);
    assert(idx1 !== -1 && idx2 !== -1 && idx1 < idx2, "content should be in correct order");

    clearAllStubs?.();
  });

  await t.step("successfully retrieves document template from dialectic_document_templates using correct schema columns", async () => {
    // This test asserts the desired behavior: renderDocument should successfully query
    // dialectic_document_templates and retrieve a template using the correct schema columns.
    const rootId = "root-template-query-test";
    const sessionId = "session_template_test";
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;

    const contributions: ContributionRowMinimal[] = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case.md",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
      },
    ];

    const structuredData = { executive_summary: "This is the business case executive summary content.", market_opportunity: "This is the business case market opportunity content." };
    const agentResponse = { content: JSON.stringify(structuredData) };
    const chunkContent = "This is the business case executive summary content.";

    // Create a template record that matches the actual database schema
    // The schema has: id, created_at, description, domain_id, file_name, is_active, name, storage_bucket, storage_path, updated_at
    // It does NOT have: stage_slug, document_key
    const templateRecord: Database['public']['Tables']['dialectic_document_templates']['Row'] = {
      id: "template-id-1",
      created_at: new Date().toISOString(),
      description: null,
      domain_id: "domain-1",
      file_name: "thesis_business_case.md",
      is_active: true,
      name: "thesis_business_case",
      storage_bucket: "prompt-templates",
      storage_path: "templates/thesis",
      updated_at: new Date().toISOString(),
    };

    const { dbClient, spies, clearAllStubs } = setup({
      genericMockResults: {
        dialectic_contributions: {
          select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_projects: {
          select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_document_templates: {
          select: { data: [templateRecord], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case_raw.json")) {
            return { data: new Blob([JSON.stringify(agentResponse)], { type: "application/json" }), error: null };
          }
          if (path.includes("thesis_business_case.md")) {
            return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
          }
          return { data: null, error: new Error(`Unexpected download path: ${path}`) };
        },
      },
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: documentKey,
      sourceContributionId: rootId,
    };

    // Assert the desired behavior: renderDocument successfully retrieves template and renders document
    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage,
        fileManager: (() => {
          const fm = new MockFileManagerService();
          fm.setUploadAndRegisterFileResponse(createMockFileRecord(), null);
          return fm;
        })(),
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    // Assert successful rendering
    assert(result !== null && typeof result === "object", "renderDocument should return a result object");
    assert("pathContext" in result, "result should have pathContext");
    assert("renderedBytes" in result, "result should have renderedBytes");
    
    const rendered = new TextDecoder().decode(result.renderedBytes);
    assert(rendered.includes("# Executive Summary"), "rendered document should contain Executive Summary section");
    assert(rendered.includes(chunkContent), "rendered document should contain the contribution content");
    assert(rendered.includes("# Market Opportunity"), "rendered document should contain Market Opportunity section");
    
    // Assert that dialectic_document_templates was queried
    const templateTableSpies = spies.getHistoricQueryBuilderSpies("dialectic_document_templates", "select");
    assert(
      templateTableSpies !== undefined && templateTableSpies.callCount > 0,
      "dialectic_document_templates should have been queried"
    );

    clearAllStubs?.();
  });

  await t.step("successfully retrieves correct template when multiple templates match pattern-based query", async () => {
    // This test asserts the desired behavior: renderDocument should successfully retrieve
    // the correct template using the unique name field when multiple templates match
    // the pattern-based query (e.g., templates in both docs/templates/thesis/ and docs/prompts/thesis/).
    // The test will fail because the current implementation uses .ilike() pattern matching
    // which matches multiple rows, causing "multiple rows returned" errors.
    const rootId = "root-multiple-templates-test";
    const sessionId = "session_multiple_templates";
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const domainId = "domain-1";

    const contributions: ContributionRowMinimal[] = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case.md",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
      },
    ];

    // Provide structured JSON content that matches the template sections
    const structuredContent = {
      executive_summary: "This is the executive summary content.",
      market_opportunity: "This is the market opportunity content.",
    };

    // Create multiple templates in the database:
    // 1. Document template with name "thesis_business_case" (correct one - matches query)
    // 2. Prompt template with name "thesis_business_case_turn_v1" (different name - won't match)
    // The query uses the unique name field, so only the document template will match
    const documentTemplate: Database['public']['Tables']['dialectic_document_templates']['Row'] = {
      id: "template-doc-1",
      created_at: new Date().toISOString(),
      description: "Document template for thesis business case",
      domain_id: domainId,
      file_name: "thesis_business_case.md",
      is_active: true,
      name: "thesis_business_case",
      storage_bucket: "prompt-templates",
      storage_path: "docs/templates/thesis/",
      updated_at: new Date().toISOString(),
    };

    const promptTemplate: Database['public']['Tables']['dialectic_document_templates']['Row'] = {
      id: "template-prompt-1",
      created_at: new Date().toISOString(),
      description: "Prompt template for thesis business case",
      domain_id: domainId,
      file_name: "thesis_business_case_turn_v1.md",
      is_active: true,
      name: "thesis_business_case_turn_v1",
      storage_bucket: "prompt-templates",
      storage_path: "docs/prompts/thesis/",
      updated_at: new Date().toISOString(),
    };

    const { dbClient, spies, clearAllStubs } = setup({
      genericMockResults: {
        dialectic_contributions: {
          select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_projects: {
          select: { data: [{ id: "project_123", selected_domain_id: domainId }], error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_document_templates: {
          select: { data: [documentTemplate], error: null, count: null, status: 200, statusText: "OK" },
        },
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case_raw.json")) {
            // The agent returns JSON where content field is a JSON string containing structured data
            const jsonContent = JSON.stringify({ content: JSON.stringify(structuredContent) });
            return { data: new Blob([jsonContent], { type: "application/json" }), error: null };
          }
          if (path === "docs/templates/thesis/thesis_business_case.md") {
            return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
          }
          return { data: new Blob([""], { type: "text/plain" }), error: null };
        },
      },
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey,
      sourceContributionId: rootId,
    };

    // Assert the desired behavior: renderDocument successfully retrieves the correct template
    // using the unique name field (thesis_business_case). The query by unique name ensures
    // only the correct template is returned, even when other templates exist in the database.
    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage,
        fileManager: (() => {
          const fm = new MockFileManagerService();
          fm.setUploadAndRegisterFileResponse(createMockFileRecord(), null);
          return fm;
        })(),
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);
    assert(rendered.includes("# Executive Summary"), "rendered document should contain Executive Summary section");
    assert(rendered.includes(structuredContent.executive_summary), "rendered document should contain executive summary content");
    assert(rendered.includes("# Market Opportunity"), "rendered document should contain Market Opportunity section");
    assert(rendered.includes(structuredContent.market_opportunity), "rendered document should contain market opportunity content");

    clearAllStubs?.();
  });

  await t.step("throws error when uploadAndRegisterFile returns an error", async () => {
    // This test asserts the desired behavior: renderDocument should throw an error
    // when uploadAndRegisterFile returns an error response (not just when it throws).
    // The test will fail because the current implementation doesn't check the return value
    // of uploadAndRegisterFile, silently ignoring errors.
    const rootId = "root-upload-error-test";
    const sessionId = "session_upload_error";
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;

    const contributions: ContributionRowMinimal[] = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case.md",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
      },
    ];

    const structuredData = { executive_summary: "This is the business case executive summary content.", market_opportunity: "This is the business case market opportunity content." };
    const agentResponse = { content: JSON.stringify(structuredData) };
    const chunkContent = "This is the business case executive summary content.";

    const templateRecord: Database['public']['Tables']['dialectic_document_templates']['Row'] = {
      id: "template-id-1",
      created_at: new Date().toISOString(),
      description: null,
      domain_id: "domain-1",
      file_name: "thesis_business_case.md",
      is_active: true,
      name: "thesis_business_case",
      storage_bucket: "prompt-templates",
      storage_path: "docs/templates/thesis/",
      updated_at: new Date().toISOString(),
    };

    const { dbClient, clearAllStubs } = setup({
      genericMockResults: {
        dialectic_contributions: {
          select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_projects: {
          select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_document_templates: {
          select: { data: [templateRecord], error: null, count: null, status: 200, statusText: "OK" },
        },
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case_raw.json")) {
            return { data: new Blob([JSON.stringify(agentResponse)], { type: "application/json" }), error: null };
          }
          if (path === "docs/templates/thesis/thesis_business_case.md") {
            return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
          }
          return { data: new Blob([""], { type: "text/plain" }), error: null };
        },
      },
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey,
      sourceContributionId: rootId,
    };

    // Configure MockFileManagerService to return an error (not throw)
    // file_manager.ts constructs error.details as JSON.stringify({ code, details, message }) for PostgrestError
    const mockFileManager = new MockFileManagerService();
    const errorDetails = JSON.stringify({
      code: "23503",
      details: "Key (source_contribution_id)=(test-id) is not present in table \"dialectic_contributions\".",
      message: "insert or update on table \"dialectic_project_resources\" violates foreign key constraint \"fk_source_contribution_id\""
    });
    mockFileManager.setUploadAndRegisterFileResponse(
      null,
      { message: "Database registration failed after successful upload.", details: errorDetails }
    );

    // Assert the desired behavior: renderDocument should throw an error when uploadAndRegisterFile returns an error
    let errorThrown = false;
    try {
      await renderDocument(
        dbClient,
        {
          downloadFromStorage,
          fileManager: mockFileManager,
          notificationService: mockNotificationService,
          notifyUserId: "user_123",
          logger: logger,
        },
        params,
      );
    } catch (error) {
      errorThrown = true;
      assert(error instanceof Error, "renderDocument should throw an Error when uploadAndRegisterFile returns an error");
      assert(
        error.message.includes("Failed to save rendered document") || error.message.includes("uploadAndRegisterFile"),
        "Error message should indicate that the upload failed"
      );
    }

    assert(errorThrown, "renderDocument should throw an error when uploadAndRegisterFile returns an error");

    clearAllStubs?.();
  });

  await t.step("renders section-based template using renderPrompt with structured JSON content", async () => {
    // This test asserts the CORRECT TARGET BEHAVIOR:
    // 1. Agent returns JSON where content field is a JSON string containing structured data matching template sections
    // 2. renderDocument parses that JSON string and uses renderPrompt to merge into template
    // 3. Template uses section-based placeholders, not {{content}}
    
    const rootId = "root-section-render-test";
    const sessionId = "session_section_test";
    const stageSlug = "thesis";
    
    const contributions: ContributionRowMinimal[] = [{
      id: rootId,
      session_id: sessionId,
      stage: "THESIS",
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "proj_x/session_s/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case.md",
      raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { thesis: rootId },
      created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      user_id: "user_123",
    }];

    // Structured data matching template sections
    const structuredData = {
      executive_summary: "Test executive summary content",
      market_opportunity: "Test market opportunity content"
      // competitive_analysis is intentionally omitted to test section removal
    };
    
    // Agent returns JSON where content is a JSON STRING
    const agentResponse = {
      content: JSON.stringify(structuredData)
    };

    const { dbClient, clearAllStubs } = setup({
      genericMockResults: {
        dialectic_contributions: {
          select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_projects: {
          select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_document_templates: {
          select: { data: [
            { id: 'template-1', created_at: '2025-01-01T00:00:00Z', description: null, domain_id: 'domain-1', file_name: 'thesis_business_case.md', is_active: true, name: 'thesis_business_case', storage_bucket: 'prompt-templates', storage_path: 'templates/thesis', updated_at: '2025-01-01T00:00:00Z' }
          ], error: null, count: null, status: 200, statusText: 'OK' }
        },
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case_raw.json")) {
            return { data: new Blob([JSON.stringify(agentResponse)], { type: "application/json" }), error: null };
          }
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        },
      },
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.business_case,
      sourceContributionId: rootId,
    };

    // Assert the CORRECT TARGET BEHAVIOR: renderDocument should parse JSON content string and use renderPrompt
    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage,
        fileManager: (() => {
          const fm = new MockFileManagerService();
          fm.setUploadAndRegisterFileResponse(createMockFileRecord(), null);
          return fm;
        })(),
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);
    
    // Assert sections with data are rendered
    assert(rendered.includes("# Executive Summary"), "rendered document should contain Executive Summary section header");
    assert(rendered.includes("Test executive summary content"), "rendered document should contain executive summary content");
    assert(rendered.includes("# Market Opportunity"), "rendered document should contain Market Opportunity section header");
    assert(rendered.includes("Test market opportunity content"), "rendered document should contain market opportunity content");
    
    // Assert sections without data are removed (no section tags remain)
    assert(!rendered.includes("{{#section:competitive_analysis}}"), "sections without data should be removed");
    assert(!rendered.includes("{{#section:user_problem_validation}}"), "sections without data should be removed");
    
    // Assert the rendered output matches what renderPrompt would produce
    const expectedRendered = renderPrompt(REAL_THESIS_BUSINESS_CASE_TEMPLATE, structuredData);
    assertEquals(rendered, expectedRendered, "rendered document should match renderPrompt output");

    clearAllStubs?.();
  });

  await t.step("successfully parses JSON content when file has trailing whitespace or newlines", async () => {
    // This test proves the flaw: renderDocument should parse trimmedText, not text
    // When a file has trailing whitespace, JSON.parse(text) fails but JSON.parse(trimmedText) succeeds
    const rootId = "root-json-trailing-whitespace";
    const sessionId = "session_json_trailing";
    const stageSlug = "thesis";
    const rawJsonPath = "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json";
    const structuredData = { executive_summary: "Content with trailing whitespace test", market_opportunity: "Market opportunity content" };
    const jsonContent = JSON.stringify({ content: JSON.stringify(structuredData) });
    // Add trailing whitespace and newlines to simulate real-world file storage behavior
    const jsonContentWithTrailingWhitespace = jsonContent + "\n\n  \t  \n";

    const contributions: ContributionRowMinimal[] = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case.md",
        raw_response_storage_path: rawJsonPath,
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
      },
    ];

    const mockDownloadFromStorage = async (
      _supabase: SupabaseClient,
      _bucket: string,
      path: string,
    ) => {
      if (path === rawJsonPath) {
        // Return the JSON content with trailing whitespace
        const blob = new Blob([jsonContentWithTrailingWhitespace], { type: "application/json" });
        return { data: await blob.arrayBuffer(), error: null };
      }
      const blob = new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" });
      return { data: await blob.arrayBuffer(), error: null };
    };

    const { dbClient, clearAllStubs } = setup({
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
                file_name: "thesis_business_case.md",
                is_active: true,
                name: "thesis_business_case",
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
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.business_case,
      sourceContributionId: rootId,
    };

    // Assert the desired behavior: renderDocument should successfully parse JSON with trailing whitespace
    // This test will FAIL with the current bug (JSON.parse(text) fails on trailing whitespace)
    // This test will PASS after the fix (JSON.parse(trimmedText) succeeds)
    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage: mockDownloadFromStorage,
        fileManager: (() => {
          const fm = new MockFileManagerService();
          fm.setUploadAndRegisterFileResponse(createMockFileRecord(), null);
          return fm;
        })(),
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);

    // Verify the document was successfully rendered despite trailing whitespace in the source file
    assert(rendered.includes("# Executive Summary"), "rendered document should contain Executive Summary section");
    assert(rendered.includes("Content with trailing whitespace test"), "rendered document should contain extracted executive summary content");
    assert(rendered.includes("# Market Opportunity"), "rendered document should contain Market Opportunity section");
    assert(rendered.includes("Market opportunity content"), "rendered document should contain market opportunity content");
    assert(!rendered.includes('{"content":'), "rendered document should NOT contain raw JSON string");

    clearAllStubs?.();
  });
});

Deno.test("DocumentRenderer - root and continuation chunk handling", async (t) => {
  const setup = (config: MockSupabaseDataConfig = {}) => {
    const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, config);
    return { dbClient: client as unknown as SupabaseClient<Database>, spies, clearAllStubs };
  };

  await t.step("renders document correctly when called with root chunk parameters", async () => {
    // Test 5.b.i: Verify root chunks where sourceContributionId === documentIdentity
    const rootContributionId = "root-chunk-5b-i";
    const sessionId = "session_5b_i";
    const stageSlug = "thesis";
    const stageKey = stageSlug;

    const rootChunk: ContributionRowMinimal = {
      id: rootContributionId,
      session_id: sessionId,
      stage: stageKey,
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_5b_i/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case.md",
      raw_response_storage_path: "project_123/session_5b_i/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { [stageSlug]: rootContributionId },
      created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      user_id: "user_123",
    };

    const structuredData = {
      executive_summary: "Root chunk executive summary content",
      market_opportunity: "Root chunk market opportunity content",
    };
    const agentResponse = { content: JSON.stringify(structuredData) };

    const { dbClient, spies, clearAllStubs } = setup({
      genericMockResults: {
        dialectic_contributions: {
          select: { data: [rootChunk], error: null, count: null, status: 200, statusText: "OK" },
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
                file_name: "thesis_business_case.md",
                is_active: true,
                name: "thesis_business_case",
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
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case_raw.json")) {
            return { data: new Blob([JSON.stringify(agentResponse)], { type: "application/json" }), error: null };
          }
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        },
      },
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootContributionId,
      documentKey: FileType.business_case,
      sourceContributionId: rootContributionId,
    };

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage,
        fileManager: mockFileManager,
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    // Verify the function successfully queries contributions using documentIdentity
    const containsCalls = spies.getHistoricQueryBuilderSpies("dialectic_contributions", "contains");
    assert(containsCalls && containsCalls.callCount >= 1, "expected contains() on document_relationships");
    const hasContains = (containsCalls?.callsArgs || []).some((args) => {
      if (!Array.isArray(args)) return false;
      const [col, val] = args;
      if (col !== "document_relationships") return false;
      if (typeof val !== "object" || val === null) return false;
      try {
        const s = JSON.stringify(val);
        return s.includes(`"${stageSlug}":"${rootContributionId}"`);
      } catch {
        return false;
      }
    });
    assert(hasContains, "expected contains('document_relationships', { [stageSlug]: documentIdentity })");

    // Verify the function finds the root chunk correctly
    const rendered = new TextDecoder().decode(result.renderedBytes);
    assert(rendered.includes("Root chunk executive summary content"), "rendered document should contain root chunk content");

    // Verify the function renders the document and returns pathContext with sourceContributionId set to the root's contribution.id
    assert(result.pathContext, "result should have pathContext");
    assertEquals(result.pathContext.sourceContributionId, rootContributionId, "pathContext.sourceContributionId should equal root's contribution.id");

    // Assert that sourceContributionId === documentIdentity for root chunks
    assertEquals(params.sourceContributionId, params.documentIdentity, "sourceContributionId should equal documentIdentity for root chunks");
    assertEquals(result.pathContext.sourceContributionId, params.documentIdentity, "pathContext.sourceContributionId should equal documentIdentity for root chunks");

    clearAllStubs?.();
  });

  await t.step("renders document correctly when called with continuation chunk parameters where sourceContributionId differs from documentIdentity", async () => {
    // Test 5.b.ii: Verify continuation chunks where sourceContributionId !== documentIdentity
    const rootContributionId = "root-chunk-5b-ii";
    const continuationContributionId = "continuation-chunk-5b-ii";
    const sessionId = "session_5b_ii";
    const stageSlug = "thesis";
    const stageKey = stageSlug;

    const rootChunk: ContributionRowMinimal = {
      id: rootContributionId,
      session_id: sessionId,
      stage: stageKey,
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_5b_ii/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case.md",
      raw_response_storage_path: "project_123/session_5b_ii/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { [stageSlug]: rootContributionId },
      created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      user_id: "user_123",
    };

    const continuationChunk: ContributionRowMinimal = {
      id: continuationContributionId,
      session_id: sessionId,
      stage: stageKey,
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_5b_ii/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_1_business_case.md",
      raw_response_storage_path: "project_123/session_5b_ii/iteration_1/thesis/documents/gpt-4o-mini_1_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { [stageSlug]: rootContributionId },
      created_at: new Date(2025, 0, 1, 12, 1, 0).toISOString(),
      target_contribution_id: rootContributionId,
      edit_version: 2,
      is_latest_edit: true,
      user_id: "user_123",
    };

    const { dbClient, spies, clearAllStubs } = setup({
      genericMockResults: {
        dialectic_contributions: {
          select: { data: [rootChunk, continuationChunk], error: null, count: null, status: 200, statusText: "OK" },
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
                file_name: "thesis_business_case.md",
                is_active: true,
                name: "thesis_business_case",
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
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case_raw.json")) {
            const structuredData1 = { executive_summary: "Root chunk content", market_opportunity: "Root market opportunity" };
            return { data: new Blob([JSON.stringify({ content: JSON.stringify(structuredData1) })], { type: "application/json" }), error: null };
          }
          if (path.endsWith("gpt-4o-mini_1_business_case_raw.json")) {
            const structuredData2 = { executive_summary: "Continuation chunk content", market_opportunity: "Continuation market opportunity" };
            return { data: new Blob([JSON.stringify({ content: JSON.stringify(structuredData2) })], { type: "application/json" }), error: null };
          }
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        },
      },
    });

    // Call renderDocument with documentIdentity: rootContributionId and sourceContributionId: continuationContributionId (different values)
    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootContributionId,
      documentKey: FileType.business_case,
      sourceContributionId: continuationContributionId,
    };

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage,
        fileManager: mockFileManager,
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    // Verify the function successfully queries contributions using documentIdentity (finds both root and continuation chunks)
    const containsCalls = spies.getHistoricQueryBuilderSpies("dialectic_contributions", "contains");
    assert(containsCalls && containsCalls.callCount >= 1, "expected contains() on document_relationships");
    const hasContains = (containsCalls?.callsArgs || []).some((args) => {
      if (!Array.isArray(args)) return false;
      const [col, val] = args;
      if (col !== "document_relationships") return false;
      if (typeof val !== "object" || val === null) return false;
      try {
        const s = JSON.stringify(val);
        return s.includes(`"${stageSlug}":"${rootContributionId}"`);
      } catch {
        return false;
      }
    });
    assert(hasContains, "expected contains('document_relationships', { [stageSlug]: documentIdentity })");

    // Verify the function finds the root chunk correctly (where target_contribution_id is null)
    const rendered = new TextDecoder().decode(result.renderedBytes);
    assert(rendered.includes("Root chunk content"), "rendered document should contain root chunk content");

    // Verify the function builds the ordered chain correctly (root first, then continuation)
    const rootIdx = rendered.indexOf("Root chunk content");
    const contIdx = rendered.indexOf("Continuation chunk content");
    assert(rootIdx !== -1 && contIdx !== -1 && rootIdx < contIdx, "content should be in correct order (root first, then continuation)");

    // Verify the function renders the combined document content from both chunks
    assert(rendered.includes("Continuation chunk content"), "rendered document should contain continuation chunk content");

    // Verify the function returns pathContext with sourceContributionId set to continuationContributionId (the actual contribution.id passed in, not the documentIdentity)
    assert(result.pathContext, "result should have pathContext");
    assertEquals(result.pathContext.sourceContributionId, continuationContributionId, "pathContext.sourceContributionId should equal continuation chunk's contribution.id, not documentIdentity");
    assert(result.pathContext.sourceContributionId !== params.documentIdentity, "pathContext.sourceContributionId should not equal documentIdentity for continuation chunks");

    // Explicitly assert that sourceContributionId !== documentIdentity for continuation chunks
    assert(params.sourceContributionId !== params.documentIdentity, "sourceContributionId should not equal documentIdentity for continuation chunks");
    assertEquals(result.pathContext.sourceContributionId, params.sourceContributionId, "pathContext.sourceContributionId should equal the sourceContributionId param for continuation chunks");

    clearAllStubs?.();
  });

  await t.step("uses documentIdentity to query all related chunks regardless of which chunk triggered the render", async () => {
    // Test 5.b.iii: Verify that documentIdentity is used for querying even when a continuation chunk triggers the render
    const rootId = "root-chunk-5b-iii";
    const cont1Id = "continuation-1-5b-iii";
    const cont2Id = "continuation-2-5b-iii";
    const sessionId = "session_5b_iii";
    const stageSlug = "thesis";
    const stageKey = stageSlug;

    const rootChunk: ContributionRowMinimal = {
      id: rootId,
      session_id: sessionId,
      stage: stageKey,
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_5b_iii/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case.md",
      raw_response_storage_path: "project_123/session_5b_iii/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { [stageSlug]: rootId },
      created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      user_id: "user_123",
    };

    const cont1Chunk: ContributionRowMinimal = {
      id: cont1Id,
      session_id: sessionId,
      stage: stageKey,
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_5b_iii/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_1_business_case.md",
      raw_response_storage_path: "project_123/session_5b_iii/iteration_1/thesis/documents/gpt-4o-mini_1_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { [stageSlug]: rootId },
      created_at: new Date(2025, 0, 1, 12, 1, 0).toISOString(),
      target_contribution_id: rootId,
      edit_version: 2,
      is_latest_edit: true,
      user_id: "user_123",
    };

    const cont2Chunk: ContributionRowMinimal = {
      id: cont2Id,
      session_id: sessionId,
      stage: stageKey,
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_5b_iii/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_2_business_case.md",
      raw_response_storage_path: "project_123/session_5b_iii/iteration_1/thesis/documents/gpt-4o-mini_2_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { [stageSlug]: rootId },
      created_at: new Date(2025, 0, 1, 12, 2, 0).toISOString(),
      target_contribution_id: cont1Id,
      edit_version: 3,
      is_latest_edit: true,
      user_id: "user_123",
    };

    const { dbClient, spies, clearAllStubs } = setup({
      genericMockResults: {
        dialectic_contributions: {
          select: { data: [rootChunk, cont1Chunk, cont2Chunk], error: null, count: null, status: 200, statusText: "OK" },
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
                file_name: "thesis_business_case.md",
                is_active: true,
                name: "thesis_business_case",
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
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case_raw.json")) {
            const structuredData1 = { executive_summary: "Root content", market_opportunity: "Root market" };
            return { data: new Blob([JSON.stringify({ content: JSON.stringify(structuredData1) })], { type: "application/json" }), error: null };
          }
          if (path.endsWith("gpt-4o-mini_1_business_case_raw.json")) {
            const structuredData2 = { executive_summary: "Cont1 content", market_opportunity: "Cont1 market" };
            return { data: new Blob([JSON.stringify({ content: JSON.stringify(structuredData2) })], { type: "application/json" }), error: null };
          }
          if (path.endsWith("gpt-4o-mini_2_business_case_raw.json")) {
            const structuredData3 = { executive_summary: "Cont2 content", market_opportunity: "Cont2 market" };
            return { data: new Blob([JSON.stringify({ content: JSON.stringify(structuredData3) })], { type: "application/json" }), error: null };
          }
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        },
      },
    });

    // Call renderDocument with documentIdentity: rootId and sourceContributionId: cont2Id (simulating a render job triggered by the second continuation chunk)
    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.business_case,
      sourceContributionId: cont2Id,
    };

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage,
        fileManager: mockFileManager,
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    // Verify the function queries contributions using documentIdentity: rootId and finds all three chunks (root, cont1, cont2)
    const containsCalls = spies.getHistoricQueryBuilderSpies("dialectic_contributions", "contains");
    assert(containsCalls && containsCalls.callCount >= 1, "expected contains() on document_relationships");
    const hasContains = (containsCalls?.callsArgs || []).some((args) => {
      if (!Array.isArray(args)) return false;
      const [col, val] = args;
      if (col !== "document_relationships") return false;
      if (typeof val !== "object" || val === null) return false;
      try {
        const s = JSON.stringify(val);
        return s.includes(`"${stageSlug}":"${rootId}"`);
      } catch {
        return false;
      }
    });
    assert(hasContains, "expected contains('document_relationships', { [stageSlug]: documentIdentity })");

    // Verify the function assembles all three chunks in correct order (root → cont1 → cont2)
    const rendered = new TextDecoder().decode(result.renderedBytes);
    const rootIdx = rendered.indexOf("Root content");
    const cont1Idx = rendered.indexOf("Cont1 content");
    const cont2Idx = rendered.indexOf("Cont2 content");
    assert(rootIdx !== -1 && cont1Idx !== -1 && cont2Idx !== -1, "rendered document should contain content from all three chunks");
    assert(rootIdx < cont1Idx && cont1Idx < cont2Idx, "content should be in correct order (root → cont1 → cont2)");

    // Verify the rendered document contains content from all three chunks
    assert(rendered.includes("Root content"), "rendered document should contain root chunk content");
    assert(rendered.includes("Cont1 content"), "rendered document should contain first continuation chunk content");
    assert(rendered.includes("Cont2 content"), "rendered document should contain second continuation chunk content");

    // Verify pathContext.sourceContributionId is set to cont2Id (the chunk that triggered the render)
    assert(result.pathContext, "result should have pathContext");
    assertEquals(result.pathContext.sourceContributionId, cont2Id, "pathContext.sourceContributionId should equal cont2Id (the chunk that triggered the render)");
    assertEquals(result.pathContext.sourceContributionId, params.sourceContributionId, "pathContext.sourceContributionId should equal the sourceContributionId param");
    assert(result.pathContext.sourceContributionId !== params.documentIdentity, "pathContext.sourceContributionId should not equal documentIdentity when continuation chunk triggers render");

    clearAllStubs?.();
  });
});


