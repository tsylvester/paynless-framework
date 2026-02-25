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
import { isResourceContext } from "../utils/type-guards/type_guards.file_manager.ts";

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

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-123",
        model_name: "GPT-4o Mini",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case_raw.json",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
      },
    ];

    const structuredData = {
      executive_summary: "chunk-one executive summary content",
      market_opportunity: "chunk-one market opportunity content"
    };
    const agentResponse = { content: structuredData };

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
      template_filename: "thesis_business_case.md", 
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

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-456",
        model_name: "GPT-4o Mini",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case_raw.json",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: null,
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
      },
      {
        id: "cont-2",
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-456",
        model_name: "GPT-4o Mini",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_1_business_case_raw.json",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_1_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 1, 0).toISOString(),
        updated_at: new Date(2025, 0, 1, 12, 1, 0).toISOString(),
        target_contribution_id: rootId,
        edit_version: 2,
        is_latest_edit: true,
        user_id: "user_123",
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
      },
      // Unrelated doc in same session should be excluded
      {
        id: "unrelated",
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-other",
        model_name: "Model A",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "modelA_0_other_doc_raw.json",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/modelA_0_other_doc_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: "another-root" },
        created_at: new Date(2025, 0, 1, 11, 59, 0).toISOString(),
        updated_at: new Date(2025, 0, 1, 11, 59, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
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
            return { data: new Blob([JSON.stringify({ content: structuredData1 })], { type: "application/json" }), error: null };
          }
          if (path.endsWith("gpt-4o-mini_1_business_case_raw.json")) {
            const structuredData2 = { executive_summary: "A2 executive summary", market_opportunity: "A2 market opportunity" };
            return { data: new Blob([JSON.stringify({ content: structuredData2 })], { type: "application/json" }), error: null };
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
      template_filename: "thesis_business_case.md", 
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

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-789",
        model_name: "GPT-4o Mini",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case_raw.json",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 2, 10, 0, 0).toISOString(),
        updated_at: new Date(2025, 0, 2, 10, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
      },
      {
        id: "cont-b",
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-789",
        model_name: "GPT-4o Mini",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_1_business_case_raw.json",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_1_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 2, 10, 1, 0).toISOString(),
        updated_at: new Date(2025, 0, 2, 10, 1, 0).toISOString(),
        target_contribution_id: rootId,
        edit_version: 2,
        is_latest_edit: true,
        user_id: "user_123",
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
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
            return { data: new Blob([JSON.stringify({ content: structuredData1 })], { type: "application/json" }), error: null };
          }
          if (path.endsWith("gpt-4o-mini_1_business_case_raw.json")) {
            const structuredData2 = { executive_summary: "B2 executive summary", market_opportunity: "B2 market opportunity" };
            return { data: new Blob([JSON.stringify({ content: structuredData2 })], { type: "application/json" }), error: null };
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
      template_filename: "thesis_business_case.md", 
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

    const root: Database['public']['Tables']['dialectic_contributions']['Row'] = {
      id: rootId,
      session_id: sessionId,
      stage: "THESIS",
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_abcd/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case_raw.json",
      raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { thesis: rootId },
      created_at: new Date(2025, 4, 1, 10, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      user_id: "user_123",
      contribution_type: null,
      citations: null,
      error: null,
      is_header: false,
      original_model_contribution_id: null,
      processing_time_ms: null,
      prompt_template_id_used: null,
      seed_prompt_url: null,
      size_bytes: null,
      source_prompt_resource_id: null,
      tokens_used_input: null,
      tokens_used_output: null,
      model_id: "model-uuid-test",
      model_name: "Test Model",
      updated_at: new Date(2025, 4, 1, 10, 0, 0).toISOString(),
    };

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [root];

    const structuredData = { executive_summary: "render-body executive summary", market_opportunity: "render-body market opportunity" };
    const agentResponse = { content: structuredData };
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
      template_filename: "thesis_business_case.md", 
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
    // End-state: call deps.notificationService with signature { projectId, sessionId, iterationNumber, stageSlug, documentIdentity, latestRenderedResourceId }
    const rootId = "root-render-2";
    const sessionId = "session_r2";
    const stageSlug = "thesis";
    const expectedResourceId = "resource-id-render-2";
    const contributionsNotif: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-notif",
        model_name: "GPT-4o Mini",
        storage_bucket: "content",
        storage_path: "project_123/session_abcd/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case_raw.json",
        raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 4, 1, 11, 0, 0).toISOString(),
        updated_at: new Date(2025, 4, 1, 11, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
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
            return { data: new Blob([JSON.stringify({ content: structuredData })], { type: "application/json" }), error: null };
          }
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        }
      },
    });

    const mockFileRecord = createMockFileRecord({ id: expectedResourceId });
    const params: RenderDocumentParams = { projectId: "project_123", sessionId, iterationNumber: 1, stageSlug, documentIdentity: rootId, documentKey: FileType.business_case, sourceContributionId: rootId, template_filename: "thesis_business_case.md", };
    await renderDocument(dbClient, { 
      downloadFromStorage, 
      fileManager: (() => {
        const fm = new MockFileManagerService();
        fm.setUploadAndRegisterFileResponse(mockFileRecord, null);
        return fm;
      })(),
      notificationService: mockNotificationService,
      notifyUserId: "user_123", 
      logger: logger,
    }, params);

    assert(mockNotificationService.sendJobNotificationEvent.calls.length === 1);
    const [payload, userId] = mockNotificationService.sendJobNotificationEvent.calls[0].args;
    assert(payload.type === 'render_completed');
    assert(payload.sessionId === sessionId);
    assert(payload.stageSlug === stageSlug);
    assert(payload.job_id === 'render-root-render-2');
    assert(payload.document_key === "business_case");
    assert(payload.modelId === 'model-uuid-notif', "modelId should be the UUID from base.model_id, not the api_identifier");
    assert(payload.iterationNumber === 1);
    assert(typeof payload.latestRenderedResourceId === 'string', "payload should include latestRenderedResourceId as a string");
    assert(payload.latestRenderedResourceId === expectedResourceId, "latestRenderedResourceId should match the ID from the uploaded file record");
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

    const root: Database['public']['Tables']['dialectic_contributions']['Row'] = {
      id: rootId,
      session_id: sessionId,
      stage: "THESIS",
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_abcd/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case_raw.json",
      raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { thesis: rootId },
      created_at: new Date(2025, 4, 1, 12, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      contribution_type: null,
      citations: null,
      error: null,
      is_header: false,
      original_model_contribution_id: null,
      processing_time_ms: null,
      prompt_template_id_used: null,
      seed_prompt_url: null,
      size_bytes: null,
      source_prompt_resource_id: null,
      tokens_used_input: null,
      tokens_used_output: null,
      model_id: "model-uuid-test",
      model_name: "Test Model",
      updated_at: new Date(2025, 4, 1, 12, 0, 0).toISOString(),
      user_id: "user_123",
    };

    const cont1: Database['public']['Tables']['dialectic_contributions']['Row'] = {
      id: "cont-1",
      session_id: sessionId,
      stage: "THESIS",
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: root.storage_path,
      file_name: "gpt-4o-mini_1_business_case_raw.json",
      raw_response_storage_path: `${root.storage_path}/gpt-4o-mini_1_business_case_raw.json`,
      mime_type: "text/markdown",
      document_relationships: { thesis: rootId },
      created_at: new Date(2025, 4, 1, 12, 1, 0).toISOString(),
      target_contribution_id: rootId,
      edit_version: 2,
      is_latest_edit: true,
      contribution_type: null,
      citations: null,
      error: null,
      is_header: false,
      original_model_contribution_id: null,
      processing_time_ms: null,
      prompt_template_id_used: null,
      seed_prompt_url: null,
      size_bytes: null,
      source_prompt_resource_id: null,
      tokens_used_input: null,
      tokens_used_output: null,
      model_id: "model-uuid-test",
      model_name: "Test Model",
      updated_at: new Date(2025, 4, 1, 12, 1, 0).toISOString(),
      user_id: "user_123",
    };

    let contributionsIdem: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [root, cont1];

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
            const jsonContent = JSON.stringify({ content: bodies[name] });
            return { data: new Blob([jsonContent], { type: "application/json" }), error: null };
          }
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        },
      },
    });

    const paramsIdem: RenderDocumentParams = { projectId: "project_123", sessionId, iterationNumber: 1, stageSlug, documentIdentity: rootId, documentKey: FileType.business_case, sourceContributionId: rootId, template_filename: "thesis_business_case.md", };

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

    const cont2: Database['public']['Tables']['dialectic_contributions']['Row'] = { ...cont1, id: "cont-2", file_name: "gpt-4o-mini_2_business_case_raw.json", raw_response_storage_path: `${root.storage_path}/gpt-4o-mini_2_business_case_raw.json`, created_at: new Date(2025, 4, 1, 12, 2, 0).toISOString(), edit_version: 3, target_contribution_id: cont1.id };
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

    const r: Database['public']['Tables']['dialectic_contributions']['Row'] = {
      id: rootId,
      session_id: sessionId,
      stage: "THESIS",
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_abcd/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case_raw.json",
      raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { thesis: rootId },
      created_at: new Date(2025, 5, 1, 10, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      contribution_type: null,
      citations: null,
      error: null,
      is_header: false,
      original_model_contribution_id: null,
      processing_time_ms: null,
      prompt_template_id_used: null,
      seed_prompt_url: null,
      size_bytes: null,
      source_prompt_resource_id: null,
      tokens_used_input: null,
      tokens_used_output: null,
      model_id: "model-uuid-test",
      model_name: "Test Model",
      updated_at: new Date(2025, 5, 1, 10, 0, 0).toISOString(),
      user_id: "user_123",
    };
    const c1: Database['public']['Tables']['dialectic_contributions']['Row'] = { ...r, id: "c1", file_name: "gpt-4o-mini_1_business_case_raw.json", raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_1_business_case_raw.json", created_at: new Date(2025, 5, 1, 10, 1, 0).toISOString(), target_contribution_id: rootId, edit_version: 2 };
    const c2: Database['public']['Tables']['dialectic_contributions']['Row'] = { ...r, id: "c2", file_name: "gpt-4o-mini_2_business_case_raw.json", raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_2_business_case_raw.json", created_at: new Date(2025, 5, 1, 10, 2, 0).toISOString(), target_contribution_id: "c1", edit_version: 3 };
    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [r, c1, c2];

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
            const jsonContent = JSON.stringify({ content: bodies[name] });
            return { data: new Blob([jsonContent], { type: "application/json" }), error: null };
          }
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        },
      },
    });

    const params: RenderDocumentParams = { projectId: "project_123", sessionId, iterationNumber: 1, stageSlug, documentIdentity: rootId, documentKey: FileType.business_case, sourceContributionId: rootId, template_filename: "thesis_business_case.md", };
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

    const modelChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
      id: rootId,
      session_id: sessionId,
      stage: "THESIS",
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_abcd/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case_raw.json",
      raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { thesis: rootId },
      created_at: new Date(2025, 6, 1, 10, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      user_id: "user_123",
      contribution_type: null,
      citations: null,
      error: null,
      is_header: false,
      original_model_contribution_id: null,
      processing_time_ms: null,
      prompt_template_id_used: null,
      seed_prompt_url: null,
      size_bytes: null,
      source_prompt_resource_id: null,
      tokens_used_input: null,
      tokens_used_output: null,
      model_id: "model-uuid-test",
      model_name: "Test Model",
      updated_at: new Date(2025, 6, 1, 10, 0, 0).toISOString(),
    };

    const userEdit: Database['public']['Tables']['dialectic_contributions']['Row'] = {
      ...modelChunk,
      id: "edit-1",
      file_name: "gpt-4o-mini_0_business_case_raw.json", // edits may overwrite same name
      raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      original_model_contribution_id: modelChunk.id,
      is_latest_edit: true,
      created_at: new Date(2025, 6, 1, 10, 5, 0).toISOString(),
    };

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [modelChunk, userEdit];

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
            return { data: new Blob([JSON.stringify({ content: structuredData })], { type: "application/json" }), error: null };
          }
          // Otherwise this is the template fetch
          return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
        },
      },
    });

    const params: RenderDocumentParams = { projectId: "project_123", sessionId, iterationNumber: 1, stageSlug, documentIdentity: rootId, documentKey: FileType.business_case, sourceContributionId: rootId, template_filename: "thesis_business_case.md", };
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

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "project_123/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case_raw.json",
        raw_response_storage_path: "project_123/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 7, 1, 10, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
        user_id: "user_123",
      },
      // Unrelated row that should be excluded by DB filtering
      {
        id: "unrelated-x",
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "project_123/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_other_doc_raw.json",
        raw_response_storage_path: "project_123/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_other_doc_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: "another-root" },
        created_at: new Date(2025, 7, 1, 9, 59, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
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
            return { data: new Blob([JSON.stringify({ content: structuredData })], { type: "application/json" }), error: null };
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
      template_filename: "thesis_business_case.md", 
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

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "project_123/session_abcd/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case_raw.json",
        raw_response_storage_path: "project_123/session_abcd/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 4, 2, 10, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
        user_id: "user_123",
      },
    ];

    const structuredData = { executive_summary: "source-body executive summary", market_opportunity: "source-body market opportunity" };
    const agentResponse = { content: structuredData };
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
      template_filename: "thesis_business_case.md", 
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
    const jsonContent = JSON.stringify({ content: structuredData });
    const expectedExtractedContent = "This is the executive summary content.";

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case_raw.json",
        raw_response_storage_path: rawJsonPath,
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
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
      template_filename: "thesis_business_case.md", 
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

    const filePathCall = downloadCalls.find((call) => {
      const fileName = contributions[0].file_name;
      return fileName !== null && call.path.includes(fileName);
    });
    assert(filePathCall !== undefined, "downloadFromStorage should be called with file_name");

    assert(rendered.includes("# Executive Summary"), "rendered document should contain Executive Summary section");
    assert(rendered.includes(expectedExtractedContent), "rendered document should contain extracted executive summary content");
    assert(rendered.includes("# Market Opportunity"), "rendered document should contain Market Opportunity section");
    assert(rendered.includes("This is the market opportunity content."), "rendered document should contain market opportunity content");
    assert(!rendered.includes('{"content":'), "rendered document should NOT contain raw JSON string");

    clearAllStubs?.();
  });

  await t.step("renders successfully when JSON has no content wrapper and metadata fields are present", async () => {
    const rootId = "root-unwrapped-1";
    const sessionId = "session_unwrapped1";
    const stageSlug = "thesis";
    const structuredData = { executive_summary: "Unwrapped executive summary.", market_opportunity: "Unwrapped market opportunity." };
    const jsonContent = JSON.stringify({ continuation_needed: false, stop_reason: "complete", ...structuredData });

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case_raw.json",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
        user_id: "user_123",
      },
    ];

    const rawJsonPath = "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json";

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
      template_filename: "thesis_business_case.md",
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
    assert(rendered.includes("Unwrapped executive summary."), "rendered document should contain unwrapped executive summary content");
    assert(rendered.includes("# Market Opportunity"), "rendered document should contain Market Opportunity section");
    assert(rendered.includes("Unwrapped market opportunity."), "rendered document should contain unwrapped market opportunity content");
    assert(!rendered.includes("continuation_needed"), "rendered document should NOT contain continuation_needed metadata");
    assert(!rendered.includes("stop_reason"), "rendered document should NOT contain stop_reason metadata");

    clearAllStubs?.();
  });

  await t.step("converts escaped newlines, quotes, and backslashes correctly", async () => {
    const rootId = "root-json-2";
    const sessionId = "session_json2";
    const stageSlug = "thesis";
    const rawJsonPath = "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json";
    const structuredData = { executive_summary: 'Title\n\nQuote: "text"\nBackslash: \\path', market_opportunity: "Market opportunity content" };
    const jsonContent = JSON.stringify({ content: structuredData });
    const expectedExtractedContent = 'Title\n\nQuote: "text"\nBackslash: \\path';

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case_raw.json",
        raw_response_storage_path: rawJsonPath,
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
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
      template_filename: "thesis_business_case.md", 
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

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case_raw.json",
        raw_response_storage_path: rawMarkdownPath,
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
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
      template_filename: "thesis_business_case.md", 
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

    const filePathCall = downloadCalls.find((call) => {
      const fileName = contributions[0].file_name;
      return fileName !== null && call.path.includes(fileName);
    });
    assert(filePathCall !== undefined, "downloadFromStorage should be called with file_name");

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
    const jsonContent1 = JSON.stringify({ content: structuredData1 });
    const expectedExtracted1 = "First Chunk\n\nThis is from JSON.";
    const markdownPath2 = "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_1_business_case.md";
    const markdownContent2 = "# Second Chunk\n\nThis is markdown.";

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case_raw.json",
        raw_response_storage_path: rawJsonPath1,
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
        user_id: "user_123",
      },
      {
        id: "cont-json-4",
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
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
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
        user_id: "user_123",
        updated_at: new Date(2025, 0, 1, 12, 1, 0).toISOString(),
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
      template_filename: "thesis_business_case.md", 
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

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case_raw.json",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
        user_id: "user_123",
      },
    ];

    const structuredData = { executive_summary: "This is the business case executive summary content.", market_opportunity: "This is the business case market opportunity content." };
    const agentResponse = { content: structuredData };
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
      template_filename: "thesis_business_case.md", 
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

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case_raw.json",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
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
            // The agent returns JSON where content field is an object containing structured data
            const jsonContent = JSON.stringify({ content: structuredContent });
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
      template_filename: "thesis_business_case.md", 
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

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case_raw.json",
        raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
        user_id: "user_123",
      },
    ];

    const structuredData = { executive_summary: "This is the business case executive summary content.", market_opportunity: "This is the business case market opportunity content." };
    const agentResponse = { content: structuredData };
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
      template_filename: "thesis_business_case.md", 
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
    
    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [{
      id: rootId,
      session_id: sessionId,
      stage: "THESIS",
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "proj_x/session_s/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case_raw.json",
      raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { thesis: rootId },
      created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      user_id: "user_123",
      contribution_type: null,
      citations: null,
      error: null,
      is_header: false,
      original_model_contribution_id: null,
      processing_time_ms: null,
      prompt_template_id_used: null,
      seed_prompt_url: null,
      size_bytes: null,
      source_prompt_resource_id: null,
      tokens_used_input: null,
      tokens_used_output: null,
      model_id: "model-uuid-test",
      model_name: "Test Model",
      updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
    }];

    // Structured data matching template sections
    const structuredData = {
      executive_summary: "Test executive summary content",
      market_opportunity: "Test market opportunity content"
      // competitive_analysis is intentionally omitted to test section removal
    };
    
    // Agent returns JSON where content is a JSON STRING
    const agentResponse = {
      content: structuredData
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
      template_filename: "thesis_business_case.md", 
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
    const jsonContent = JSON.stringify({ content: structuredData });
    // Add trailing whitespace and newlines to simulate real-world file storage behavior
    const jsonContentWithTrailingWhitespace = jsonContent + "\n\n  \t  \n";

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case_raw.json",
        raw_response_storage_path: rawJsonPath,
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
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
      template_filename: "thesis_business_case.md", 
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

    const rootChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
      id: rootContributionId,
      session_id: sessionId,
      stage: stageKey,
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_5b_i/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case_raw.json",
      raw_response_storage_path: "project_123/session_5b_i/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { [stageSlug]: rootContributionId },
      created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      user_id: "user_123",
      contribution_type: null,
      citations: null,
      error: null,
      is_header: false,
      original_model_contribution_id: null,
      processing_time_ms: null,
      prompt_template_id_used: null,
      seed_prompt_url: null,
      size_bytes: null,
      source_prompt_resource_id: null,
      tokens_used_input: null,
      tokens_used_output: null,
      model_id: "model-uuid-test",
      model_name: "Test Model",
      updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
    };

    const structuredData = {
      executive_summary: "Root chunk executive summary content",
      market_opportunity: "Root chunk market opportunity content",
    };
    const agentResponse = { content: structuredData };

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
      template_filename: "thesis_business_case.md", 
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

    const rootChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
      id: rootContributionId,
      session_id: sessionId,
      stage: stageKey,
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_5b_ii/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case_raw.json",
      raw_response_storage_path: "project_123/session_5b_ii/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { [stageSlug]: rootContributionId },
      created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      user_id: "user_123",
      contribution_type: null,
      citations: null,
      error: null,
      is_header: false,
      original_model_contribution_id: null,
      processing_time_ms: null,
      prompt_template_id_used: null,
      seed_prompt_url: null,
      size_bytes: null,
      source_prompt_resource_id: null,
      tokens_used_input: null,
      tokens_used_output: null,
      model_id: "model-uuid-test",
      model_name: "Test Model",
      updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
    };

    const continuationChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
      id: continuationContributionId,
      session_id: sessionId,
      stage: stageKey,
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_5b_ii/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_1_business_case_raw.json",
      raw_response_storage_path: "project_123/session_5b_ii/iteration_1/thesis/documents/gpt-4o-mini_1_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { [stageSlug]: rootContributionId },
      created_at: new Date(2025, 0, 1, 12, 1, 0).toISOString(),
      target_contribution_id: rootContributionId,
      edit_version: 2,
      is_latest_edit: true,
      user_id: "user_123",
      contribution_type: null,
      citations: null,
      error: null,
      is_header: false,
      original_model_contribution_id: null,
      processing_time_ms: null,
      prompt_template_id_used: null,
      seed_prompt_url: null,
      size_bytes: null,
      source_prompt_resource_id: null,
      tokens_used_input: null,
      tokens_used_output: null,
      model_id: "model-uuid-test",
      model_name: "Test Model",
      updated_at: new Date(2025, 0, 1, 12, 1, 0).toISOString(),
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
            return { data: new Blob([JSON.stringify({ content: structuredData1 })], { type: "application/json" }), error: null };
          }
          if (path.endsWith("gpt-4o-mini_1_business_case_raw.json")) {
            const structuredData2 = { executive_summary: "Continuation chunk content", market_opportunity: "Continuation market opportunity" };
            return { data: new Blob([JSON.stringify({ content: structuredData2 })], { type: "application/json" }), error: null };
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
      template_filename: "thesis_business_case.md", 
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

    const rootChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
      id: rootId,
      session_id: sessionId,
      stage: stageKey,
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_5b_iii/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case_raw.json",
      raw_response_storage_path: "project_123/session_5b_iii/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { [stageSlug]: rootId },
      created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      user_id: "user_123",
      contribution_type: null,
      citations: null,
      error: null,
      is_header: false,
      original_model_contribution_id: null,
      processing_time_ms: null,
      prompt_template_id_used: null,
      seed_prompt_url: null,
      size_bytes: null,
      source_prompt_resource_id: null,
      tokens_used_input: null,
      tokens_used_output: null,
      model_id: "model-uuid-test",
      model_name: "Test Model",
      updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
    };

    const cont1Chunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
      id: cont1Id,
      session_id: sessionId,
      stage: stageKey,
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_5b_iii/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_1_business_case_raw.json",
      raw_response_storage_path: "project_123/session_5b_iii/iteration_1/thesis/documents/gpt-4o-mini_1_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { [stageSlug]: rootId },
      created_at: new Date(2025, 0, 1, 12, 1, 0).toISOString(),
      target_contribution_id: rootId,
      edit_version: 2,
      is_latest_edit: true,
      user_id: "user_123",
      contribution_type: null,
      citations: null,
      error: null,
      is_header: false,
      original_model_contribution_id: null,
      processing_time_ms: null,
      prompt_template_id_used: null,
      seed_prompt_url: null,
      size_bytes: null,
      source_prompt_resource_id: null,
      tokens_used_input: null,
      tokens_used_output: null,
      model_id: "model-uuid-test",
      model_name: "Test Model",
      updated_at: new Date(2025, 0, 1, 12, 1, 0).toISOString(),
    };

    const cont2Chunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
      id: cont2Id,
      session_id: sessionId,
      stage: stageKey,
      iteration_number: 1,
      storage_bucket: "content",
      storage_path: "project_123/session_5b_iii/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_2_business_case_raw.json",
      raw_response_storage_path: "project_123/session_5b_iii/iteration_1/thesis/documents/gpt-4o-mini_2_business_case_raw.json",
      mime_type: "text/markdown",
      document_relationships: { [stageSlug]: rootId },
      created_at: new Date(2025, 0, 1, 12, 2, 0).toISOString(),
      target_contribution_id: cont1Id,
      edit_version: 3,
      is_latest_edit: true,
      user_id: "user_123",
      contribution_type: null,
      citations: null,
      error: null,
      is_header: false,
      original_model_contribution_id: null,
      processing_time_ms: null,
      prompt_template_id_used: null,
      seed_prompt_url: null,
      size_bytes: null,
      source_prompt_resource_id: null,
      tokens_used_input: null,
      tokens_used_output: null,
      model_id: "model-uuid-test",
      model_name: "Test Model",
      updated_at: new Date(2025, 0, 1, 12, 2, 0).toISOString(),
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
            return { data: new Blob([JSON.stringify({ content: structuredData1 })], { type: "application/json" }), error: null };
          }
          if (path.endsWith("gpt-4o-mini_1_business_case_raw.json")) {
            const structuredData2 = { executive_summary: "Cont1 content", market_opportunity: "Cont1 market" };
            return { data: new Blob([JSON.stringify({ content: structuredData2 })], { type: "application/json" }), error: null };
          }
          if (path.endsWith("gpt-4o-mini_2_business_case_raw.json")) {
            const structuredData3 = { executive_summary: "Cont2 content", market_opportunity: "Cont2 market" };
            return { data: new Blob([JSON.stringify({ content: structuredData3 })], { type: "application/json" }), error: null };
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
      template_filename: "thesis_business_case.md", 
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

Deno.test("DocumentRenderer - correctly calls FileManagerService to save the rendered document", async (t) => {
    const setup = (config: MockSupabaseDataConfig = {}) => {
        const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, config);
        return { dbClient: client as unknown as SupabaseClient<Database>, spies, clearAllStubs };
    };
    
    await t.step("ensures uploadAndRegisterFile is called with correct data", async () => {
        const rootId = "root-save-correctly-1";
        const sessionId = "session_save_correctly";
        const stageSlug = "thesis";
        const documentKey = FileType.business_case;

        const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
            {
                id: rootId,
                session_id: sessionId,
                stage: "THESIS",
                iteration_number: 1,
                storage_bucket: "content",
                storage_path: "project_123/session_s/iteration_1/thesis/documents",
                file_name: "gpt-4o-mini_0_business_case_raw.json",
                raw_response_storage_path: "project_123/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
                mime_type: "text/markdown",
                document_relationships: { thesis: rootId },
                created_at: new Date(2025, 8, 1, 10, 0, 0).toISOString(),
                target_contribution_id: null,
                edit_version: 1,
                is_latest_edit: true,
                user_id: "user_123",
                contribution_type: null,
                citations: null,
                error: null,
                is_header: false,
                original_model_contribution_id: null,
                processing_time_ms: null,
                prompt_template_id_used: null,
                seed_prompt_url: null,
                size_bytes: null,
                source_prompt_resource_id: null,
                tokens_used_input: null,
                tokens_used_output: null,
                model_id: "model-uuid-test",
                model_name: "Test Model",
                updated_at: new Date(2025, 8, 1, 10, 0, 0).toISOString(),
            },
        ];

        const structuredData = { executive_summary: "Test save content" };
        const agentResponse = { content: structuredData };

        const { dbClient, clearAllStubs } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
                },
                dialectic_projects: {
                    select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
                },
                dialectic_document_templates: {
                    select: { data: [{ id: "template-1", created_at: "2025-01-01T00:00:00Z", description: null, domain_id: "domain-1", file_name: "thesis_business_case.md", is_active: true, name: "thesis_business_case", storage_bucket: "prompt-templates", storage_path: "templates/thesis", updated_at: "2025-01-01T00:00:00Z" }], error: null, count: null, status: 200, statusText: "OK" },
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

        const mockFileManager = new MockFileManagerService();
        mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

        const params: RenderDocumentParams = {
            projectId: "project_123",
            sessionId,
            iterationNumber: 1,
            stageSlug,
            documentIdentity: rootId,
            documentKey,
            sourceContributionId: rootId,
            template_filename: "thesis_business_case.md", 
        };

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

        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1, "uploadAndRegisterFile should be called exactly once");
        
        const uploadArgs = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
        // Assert that the context object passed to the file manager is a valid ResourceUploadContext
        assert(isResourceContext(uploadArgs), `uploadAndRegisterFile context is not a valid ResourceUploadContext. Got ${JSON.stringify(uploadArgs, null, 2)}`);
        
        // Now that the type is confirmed, we can safely access its properties
        assertEquals(uploadArgs.pathContext.sourceContributionId, rootId, "sourceContributionId should be the root contribution ID");
        assertEquals(uploadArgs.resourceTypeForDb, FileType.RenderedDocument, "resourceTypeForDb should be FileType.RenderedDocument");

        if (uploadArgs.fileContent instanceof Uint8Array) {
            const bodyText = new TextDecoder().decode(uploadArgs.fileContent);
            assert(bodyText.includes("Test save content"), "The rendered content was not present in the uploaded file");
        } else {
            const actualType = uploadArgs.fileContent?.constructor?.name || typeof uploadArgs.fileContent;
            assert(false, `fileContent was not a Uint8Array, but ${actualType}. Cannot verify content.`);
        }

        clearAllStubs?.();
    });
});

Deno.test("DocumentRenderer - PathContext includes sourceGroupFragment when base chunk has document_relationships.source_group", async (t) => {
    const setup = (config: MockSupabaseDataConfig = {}) => {
        const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, config);
        return { dbClient: client as unknown as SupabaseClient<Database>, spies, clearAllStubs };
    };
    
    await t.step("PathContext includes sourceGroupFragment extracted from base chunk document_relationships.source_group", async () => {
        const rootId = "root-fragment-test-1";
        const sessionId = "session_fragment_test";
        const stageSlug = "thesis";
        const documentKey = FileType.business_case;
        const sourceGroup = "550e8400-e29b-41d4-a716-446655440000";
        const expectedFragment = "550e8400";

        const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
            {
                id: rootId,
                session_id: sessionId,
                stage: "THESIS",
                iteration_number: 1,
                storage_bucket: "content",
                storage_path: "project_123/session_s/iteration_1/thesis/documents",
                file_name: "gpt-4o-mini_0_business_case_raw.json",
                raw_response_storage_path: "project_123/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
                mime_type: "text/markdown",
                document_relationships: { 
                    thesis: rootId,
                    source_group: sourceGroup
                },
                created_at: new Date(2025, 8, 1, 10, 0, 0).toISOString(),
                target_contribution_id: null,
                edit_version: 1,
                is_latest_edit: true,
                user_id: "user_123",
                contribution_type: null,
                citations: null,
                error: null,
                is_header: false,
                original_model_contribution_id: null,
                processing_time_ms: null,
                prompt_template_id_used: null,
                seed_prompt_url: null,
                size_bytes: null,
                source_prompt_resource_id: null,
                tokens_used_input: null,
                tokens_used_output: null,
                model_id: "model-uuid-test",
                model_name: "Test Model",
                updated_at: new Date(2025, 8, 1, 10, 0, 0).toISOString(),
            },
        ];

        const structuredData = { executive_summary: "Test content" };
        const agentResponse = { content: structuredData };

        const { dbClient, clearAllStubs } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
                },
                dialectic_projects: {
                    select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
                },
                dialectic_document_templates: {
                    select: { data: [{ id: "template-1", created_at: "2025-01-01T00:00:00Z", description: null, domain_id: "domain-1", file_name: "thesis_business_case.md", is_active: true, name: "thesis_business_case", storage_bucket: "prompt-templates", storage_path: "templates/thesis", updated_at: "2025-01-01T00:00:00Z" }], error: null, count: null, status: 200, statusText: "OK" },
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

        const mockFileManager = new MockFileManagerService();
        mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

        const params: RenderDocumentParams = {
            projectId: "project_123",
            sessionId,
            iterationNumber: 1,
            stageSlug,
            documentIdentity: rootId,
            documentKey,
            sourceContributionId: rootId,
            template_filename: "thesis_business_case.md", 
        };

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

        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1, "uploadAndRegisterFile should be called exactly once");
        
        const uploadArgs = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
        assert(isResourceContext(uploadArgs), `uploadAndRegisterFile context is not a valid ResourceUploadContext`);
        
        // This test must initially FAIL because renderDocument does not currently extract sourceGroupFragment
        assertEquals(uploadArgs.pathContext.sourceGroupFragment, expectedFragment, "PathContext should include sourceGroupFragment extracted from base chunk document_relationships.source_group");

        clearAllStubs?.();
    });
});

Deno.test("DocumentRenderer - fragment extraction handles UUID with hyphens correctly", async (t) => {
    const setup = (config: MockSupabaseDataConfig = {}) => {
        const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, config);
        return { dbClient: client as unknown as SupabaseClient<Database>, spies, clearAllStubs };
    };
    
    await t.step("fragment extraction correctly handles UUID with hyphens", async () => {
        const rootId = "root-fragment-hyphens-1";
        const sessionId = "session_fragment_hyphens";
        const stageSlug = "thesis";
        const documentKey = FileType.business_case;
        const sourceGroup = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
        const expectedFragment = "a1b2c3d4";

        const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
            {
                id: rootId,
                session_id: sessionId,
                stage: "THESIS",
                iteration_number: 1,
                storage_bucket: "content",
                storage_path: "project_123/session_s/iteration_1/thesis/documents",
                file_name: "gpt-4o-mini_0_business_case_raw.json",
                raw_response_storage_path: "project_123/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
                mime_type: "text/markdown",
                document_relationships: { 
                    thesis: rootId,
                    source_group: sourceGroup
                },
                created_at: new Date(2025, 8, 1, 10, 0, 0).toISOString(),
                target_contribution_id: null,
                edit_version: 1,
                is_latest_edit: true,
                user_id: "user_123",
                contribution_type: null,
                citations: null,
                error: null,
                is_header: false,
                original_model_contribution_id: null,
                processing_time_ms: null,
                prompt_template_id_used: null,
                seed_prompt_url: null,
                size_bytes: null,
                source_prompt_resource_id: null,
                tokens_used_input: null,
                tokens_used_output: null,
                model_id: "model-uuid-test",
                model_name: "Test Model",
                updated_at: new Date(2025, 8, 1, 10, 0, 0).toISOString(),
              },
        ];

        const structuredData = { executive_summary: "Test content" };
        const agentResponse = { content: structuredData };

        const { dbClient, clearAllStubs } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
                },
                dialectic_projects: {
                    select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
                },
                dialectic_document_templates: {
                    select: { data: [{ id: "template-1", created_at: "2025-01-01T00:00:00Z", description: null, domain_id: "domain-1", file_name: "thesis_business_case.md", is_active: true, name: "thesis_business_case", storage_bucket: "prompt-templates", storage_path: "templates/thesis", updated_at: "2025-01-01T00:00:00Z" }], error: null, count: null, status: 200, statusText: "OK" },
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

        const mockFileManager = new MockFileManagerService();
        mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

        const params: RenderDocumentParams = {
            projectId: "project_123",
            sessionId,
            iterationNumber: 1,
            stageSlug,
            documentIdentity: rootId,
            documentKey,
            sourceContributionId: rootId,
            template_filename: "thesis_business_case.md", 
        };

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

        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1, "uploadAndRegisterFile should be called exactly once");
        
        const uploadArgs = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
        assert(isResourceContext(uploadArgs), `uploadAndRegisterFile context is not a valid ResourceUploadContext`);
        
        // This test must initially FAIL because renderDocument does not currently extract sourceGroupFragment
        assertEquals(uploadArgs.pathContext.sourceGroupFragment, expectedFragment, "PathContext should include sourceGroupFragment with hyphens removed and converted to lowercase");

        clearAllStubs?.();
    });
});

Deno.test("DocumentRenderer - PathContext works without source_group", async (t) => {
    const setup = (config: MockSupabaseDataConfig = {}) => {
        const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, config);
        return { dbClient: client as unknown as SupabaseClient<Database>, spies, clearAllStubs };
    };
    
    await t.step("PathContext does not include sourceGroupFragment when contribution lacks document_relationships.source_group", async () => {
        const rootId = "root-no-fragment-1";
        const sessionId = "session_no_fragment";
        const stageSlug = "thesis";
        const documentKey = FileType.business_case;

        const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
            {
                id: rootId,
                session_id: sessionId,
                stage: "THESIS",
                iteration_number: 1,
                storage_bucket: "content",
                storage_path: "project_123/session_s/iteration_1/thesis/documents",
                file_name: "gpt-4o-mini_0_business_case_raw.json",
                raw_response_storage_path: "project_123/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
                mime_type: "text/markdown",
                document_relationships: { 
                    thesis: rootId
                    // No source_group field
                },
                created_at: new Date(2025, 8, 1, 10, 0, 0).toISOString(),
                target_contribution_id: null,
                edit_version: 1,
                is_latest_edit: true,
                user_id: "user_123",
                contribution_type: null,
                citations: null,
                error: null,
                is_header: false,
                original_model_contribution_id: null,
                processing_time_ms: null,
                prompt_template_id_used: null,
                seed_prompt_url: null,
                size_bytes: null,
                source_prompt_resource_id: null,
                tokens_used_input: null,
                tokens_used_output: null,
                model_id: "model-uuid-test",
                model_name: "Test Model",
                updated_at: new Date(2025, 8, 1, 10, 0, 0).toISOString(),
            },
        ];

        const structuredData = { executive_summary: "Test content" };
        const agentResponse = { content: structuredData };

        const { dbClient, clearAllStubs } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
                },
                dialectic_projects: {
                    select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
                },
                dialectic_document_templates: {
                    select: { data: [{ id: "template-1", created_at: "2025-01-01T00:00:00Z", description: null, domain_id: "domain-1", file_name: "thesis_business_case.md", is_active: true, name: "thesis_business_case", storage_bucket: "prompt-templates", storage_path: "templates/thesis", updated_at: "2025-01-01T00:00:00Z" }], error: null, count: null, status: 200, statusText: "OK" },
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

        const mockFileManager = new MockFileManagerService();
        mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

        const params: RenderDocumentParams = {
            projectId: "project_123",
            sessionId,
            iterationNumber: 1,
            stageSlug,
            documentIdentity: rootId,
            documentKey,
            sourceContributionId: rootId,
            template_filename: "thesis_business_case.md", 
        };

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

        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1, "uploadAndRegisterFile should be called exactly once");
        
        const uploadArgs = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
        assert(isResourceContext(uploadArgs), `uploadAndRegisterFile context is not a valid ResourceUploadContext`);
        
        // This test should verify that sourceGroupFragment is undefined when source_group is missing
        assertEquals(uploadArgs.pathContext.sourceGroupFragment, undefined, "PathContext should not include sourceGroupFragment when document_relationships.source_group is missing");

        clearAllStubs?.();
    });
});

Deno.test("DocumentRenderer - fragment extraction handles missing document_relationships gracefully", async (t) => {
    const setup = (config: MockSupabaseDataConfig = {}) => {
        const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, config);
        return { dbClient: client as unknown as SupabaseClient<Database>, spies, clearAllStubs };
    };
    
    await t.step("fragment extraction handles null or missing document_relationships without throwing errors", async () => {
        const rootId = "root-null-rels-1";
        const sessionId = "session_null_rels";
        const stageSlug = "thesis";
        const documentKey = FileType.business_case;

        const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
            {
                id: rootId,
                session_id: sessionId,
                stage: "THESIS",
                iteration_number: 1,
                storage_bucket: "content",
                storage_path: "project_123/session_s/iteration_1/thesis/documents",
                file_name: "gpt-4o-mini_0_business_case_raw.json",
                raw_response_storage_path: "project_123/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
                mime_type: "text/markdown",
                // document_relationships must contain thesis for the query to work, but we test that
                // accessing source_group when it's missing doesn't throw
                document_relationships: { 
                    thesis: rootId
                    // No source_group field - tests that accessing missing property is safe
                },
                created_at: new Date(2025, 8, 1, 10, 0, 0).toISOString(),
                target_contribution_id: null,
                edit_version: 1,
                is_latest_edit: true,
                user_id: "user_123",
                contribution_type: null,
                citations: null,
                error: null,
                is_header: false,
                original_model_contribution_id: null,
                processing_time_ms: null,
                prompt_template_id_used: null,
                seed_prompt_url: null,
                size_bytes: null,
                source_prompt_resource_id: null,
                tokens_used_input: null,
                tokens_used_output: null,
                model_id: "model-uuid-test",
                model_name: "Test Model",
                updated_at: new Date(2025, 8, 1, 10, 0, 0).toISOString(),
            },
        ];

        const structuredData = { executive_summary: "Test content" };
        const agentResponse = { content: structuredData };

        const { dbClient, clearAllStubs } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
                },
                dialectic_projects: {
                    select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
                },
                dialectic_document_templates: {
                    select: { data: [{ id: "template-1", created_at: "2025-01-01T00:00:00Z", description: null, domain_id: "domain-1", file_name: "thesis_business_case.md", is_active: true, name: "thesis_business_case", storage_bucket: "prompt-templates", storage_path: "templates/thesis", updated_at: "2025-01-01T00:00:00Z" }], error: null, count: null, status: 200, statusText: "OK" },
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

        const mockFileManager = new MockFileManagerService();
        mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

        const params: RenderDocumentParams = {
            projectId: "project_123",
            sessionId,
            iterationNumber: 1,
            stageSlug,
            documentIdentity: rootId,
            documentKey,
            sourceContributionId: rootId,
            template_filename: "thesis_business_case.md", 
        };

        // This test verifies that fragment extraction doesn't throw when accessing source_group
        // Note: document_relationships cannot be null because renderDocument queries require it to contain thesis.
        // This test ensures safe property access when source_group is missing from the object.
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

        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1, "uploadAndRegisterFile should be called exactly once");
        
        const uploadArgs = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
        assert(isResourceContext(uploadArgs), `uploadAndRegisterFile context is not a valid ResourceUploadContext`);
        
        // This test should pass: fragment should be undefined when source_group is missing from document_relationships
        assertEquals(uploadArgs.pathContext.sourceGroupFragment, undefined, "PathContext should have undefined sourceGroupFragment when document_relationships.source_group is missing");

        clearAllStubs?.();
    });
});

Deno.test("DocumentRenderer - uses template_filename from RenderDocumentParams to query database", async (t) => {
    const setup = (config: MockSupabaseDataConfig = {}) => {
        const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, config);
        return { dbClient: client as unknown as SupabaseClient<Database>, spies, clearAllStubs };
    };
    
    await t.step("renderDocument uses params.template_filename to query dialectic_document_templates", async () => {
        const rootId = "root-template-filename-test-1";
        const sessionId = "session_template_filename_test";
        const stageSlug = "antithesis";
        const documentKey = FileType.business_case;
        const templateFilename = "antithesis_business_case_critique.md";

        const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
            {
                id: rootId,
                session_id: sessionId,
                stage: "ANTITHESIS",
                iteration_number: 1,
                storage_bucket: "content",
                storage_path: "project_123/session_s/iteration_1/antithesis/documents",
                file_name: "claude_critiquing_gpt-4_98765432_1_business_case_critique_raw.json",
                raw_response_storage_path: "project_123/session_s/iteration_1/antithesis/documents/claude_critiquing_gpt-4_98765432_1_business_case_critique_raw.json",
                mime_type: "text/markdown",
                document_relationships: { antithesis: rootId },
                created_at: new Date(2025, 8, 1, 10, 0, 0).toISOString(),
                target_contribution_id: null,
                edit_version: 1,
                is_latest_edit: true,
                user_id: "user_123",
                contribution_type: null,
                citations: null,
                error: null,
                is_header: false,
                original_model_contribution_id: null,
                processing_time_ms: null,
                prompt_template_id_used: null,
                seed_prompt_url: null,
                size_bytes: null,
                source_prompt_resource_id: null,
                tokens_used_input: null,
                tokens_used_output: null,
                model_id: "model-uuid-test",
                model_name: "Test Model",
                updated_at: new Date(2025, 8, 1, 10, 0, 0).toISOString(),
            },
        ];

        const structuredData = { executive_summary: "Test template filename content" };
        const agentResponse = { content: structuredData };

        const { dbClient, spies, clearAllStubs } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
                },
                dialectic_projects: {
                    select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
                },
                dialectic_document_templates: {
                    select: { data: [{ id: "template-1", created_at: "2025-01-01T00:00:00Z", description: null, domain_id: "domain-1", file_name: templateFilename, is_active: true, name: templateFilename.replace('.md', ''), storage_bucket: "prompt-templates", storage_path: "templates/antithesis", updated_at: "2025-01-01T00:00:00Z" }], error: null, count: null, status: 200, statusText: "OK" },
                },
            },
            storageMock: {
                downloadResult: async (_bucketId: string, path: string) => {
                    if (path.endsWith("claude_critiquing_gpt-4_98765432_1_business_case_critique_raw.json")) {
                        return { data: new Blob([JSON.stringify(agentResponse)], { type: "application/json" }), error: null };
                    }
                    return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
                },
            },
        });

        const mockFileManager = new MockFileManagerService();
        mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

        const params: RenderDocumentParams = {
            projectId: "project_123",
            sessionId,
            iterationNumber: 1,
            stageSlug,
            documentIdentity: rootId,
            documentKey,
            sourceContributionId: rootId,
            template_filename: templateFilename,
        };

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

        // Assert that dialectic_document_templates was queried with eq('name', templateFilename)
        const eqCalls = spies.getHistoricQueryBuilderSpies("dialectic_document_templates", "eq");
        assert(eqCalls !== undefined, "dialectic_document_templates.eq() should have been called");
        assert(eqCalls.callCount > 0, "dialectic_document_templates.eq() should have been called at least once");
        
        // Find the call to eq('name', ...) and verify it uses params.template_filename
        const nameEqCalls = (eqCalls?.callsArgs || []).filter((args) => Array.isArray(args) && args[0] === "name");
        assert(nameEqCalls.length > 0, "expected eq('name', ...) to be called on dialectic_document_templates");
        
        // The function strips .md extension from template_filename before querying
        // The database name field stores the base name without .md extension
        const nameEqValue = nameEqCalls[0][1];
        const expectedName = templateFilename.replace('.md', '');
        assertEquals(nameEqValue, expectedName, `database query should strip .md extension from params.template_filename ('${templateFilename}') and use '${expectedName}' as the filter value. Got: ${nameEqValue}`);

        clearAllStubs?.();
    });
});

Deno.test("DocumentRenderer - successfully finds template when template_filename includes .md extension but database name field does not", async (t) => {
    const setup = (config: MockSupabaseDataConfig = {}) => {
        const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, config);
        return { dbClient: client as unknown as SupabaseClient<Database>, spies, clearAllStubs };
    };
    
    await t.step("renderDocument finds template when template_filename has .md but database name does not", async () => {
        const rootId = "root-md-extension-test";
        const sessionId = "session_md_extension";
        const stageSlug = "thesis";
        const documentKey = FileType.business_case;
        const templateFilenameWithExtension = "thesis_business_case.md";
        const templateNameInDatabase = "thesis_business_case";

        const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
            {
                id: rootId,
                session_id: sessionId,
                stage: "THESIS",
                iteration_number: 1,
                storage_bucket: "content",
                storage_path: "project_123/session_s/iteration_1/thesis/documents",
                file_name: "gpt-4o-mini_0_business_case_raw.json",
                raw_response_storage_path: "project_123/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
                mime_type: "text/markdown",
                document_relationships: { thesis: rootId },
                created_at: new Date(2025, 8, 1, 10, 0, 0).toISOString(),
                target_contribution_id: null,
                edit_version: 1,
                is_latest_edit: true,
                user_id: "user_123",
                contribution_type: null,
                citations: null,
                error: null,
                is_header: false,
                original_model_contribution_id: null,
                processing_time_ms: null,
                prompt_template_id_used: null,
                seed_prompt_url: null,
                size_bytes: null,
                source_prompt_resource_id: null,
                tokens_used_input: null,
                tokens_used_output: null,
                model_id: "model-uuid-test",
                model_name: "Test Model",
                updated_at: new Date(2025, 8, 1, 10, 0, 0).toISOString(),
            },
        ];

        const structuredData = { executive_summary: "Test content for md extension mismatch" };
        const agentResponse = { content: structuredData };

        const { dbClient, spies, clearAllStubs } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
                },
                dialectic_projects: {
                    select: { data: [{ id: "project_123", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
                },
                dialectic_document_templates: {
                    select: { data: [{ id: "template-1", created_at: "2025-01-01T00:00:00Z", description: "Markdown template for the Thesis business case document.", domain_id: "domain-1", file_name: templateFilenameWithExtension, is_active: true, name: templateNameInDatabase, storage_bucket: "prompt-templates", storage_path: "docs/templates/thesis", updated_at: "2025-01-01T00:00:00Z" }], error: null, count: null, status: 200, statusText: "OK" },
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

        const mockFileManager = new MockFileManagerService();
        mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

        const params: RenderDocumentParams = {
            projectId: "project_123",
            sessionId,
            iterationNumber: 1,
            stageSlug,
            documentIdentity: rootId,
            documentKey,
            sourceContributionId: rootId,
            template_filename: templateFilenameWithExtension,
        };

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

        const eqCalls = spies.getHistoricQueryBuilderSpies("dialectic_document_templates", "eq");
        assert(eqCalls !== undefined, "dialectic_document_templates.eq() should have been called");
        assert(eqCalls.callCount > 0, "dialectic_document_templates.eq() should have been called at least once");
        
        const nameEqCalls = (eqCalls?.callsArgs || []).filter((args) => Array.isArray(args) && args[0] === "name");
        assert(nameEqCalls.length > 0, "expected eq('name', ...) to be called on dialectic_document_templates");
        
        const actualNameQuery = nameEqCalls[0][1];
        assertEquals(actualNameQuery, templateNameInDatabase, `renderDocument should query by name='${templateNameInDatabase}' (without .md) to match the database, not '${templateFilenameWithExtension}' (with .md). Got: '${actualNameQuery}'`);

        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1, "renderDocument should successfully render and upload the document");

        clearAllStubs?.();
    });

    await t.step("accepts content as object (not stringified JSON) and populates template sections correctly", async () => {
        // This test proves the renderer accepts the exact structure from thesis_business_case_turn_v1.md:
        // { "content": { "market_opportunity": "...", "executive_summary": "...", ... } }
        // where content is an OBJECT, not a stringified JSON string.
        //
        // The prompt template instructs the agent to return this structure.
        // The document template (thesis_business_case.md) has section placeholders matching these keys.
        // The renderer must accept content as an object and populate all sections.

        const rootId = "root-object-content-test";
        const sessionId = "session_object_content";
        const stageSlug = "thesis";

        const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
            {
                id: rootId,
                session_id: sessionId,
                stage: "THESIS",
                iteration_number: 1,
                storage_bucket: "content",
                storage_path: "proj_x/session_s/iteration_1/thesis/documents",
                file_name: "gpt-4o-mini_0_business_case_raw.json",
                raw_response_storage_path: "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json",
                mime_type: "text/markdown",
                document_relationships: { thesis: rootId },
                created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
                target_contribution_id: null,
                edit_version: 1,
                is_latest_edit: true,
                user_id: "user_123",
                contribution_type: null,
                citations: null,
                error: null,
                is_header: false,
                original_model_contribution_id: null,
                processing_time_ms: null,
                prompt_template_id_used: null,
                seed_prompt_url: null,
                size_bytes: null,
                source_prompt_resource_id: null,
                tokens_used_input: null,
                tokens_used_output: null,
                model_id: "model-uuid-test",
                model_name: "Test Model",
                updated_at: new Date(2025, 8, 1, 10, 0, 0).toISOString(),
            },
        ];

        // This is the EXACT structure from thesis_business_case_turn_v1.md prompt template:
        // The agent returns { "content": { key: value, ... } } where content is an OBJECT
        const agentResponseWithObjectContent = {
            content: {
                market_opportunity: "The target market consists of enterprise customers seeking advanced analytics solutions with projected growth of 25% annually.",
                user_problem_validation: "User research confirms that 78% of enterprises struggle with data processing latency exceeding acceptable thresholds.",
                competitive_analysis: "Compared to legacy solutions, our approach offers 3x performance improvement while maintaining compatibility with existing infrastructure.",
                "differentiation_&_value_proposition": "Our unique value lies in the proprietary algorithm that reduces processing time by 60% without sacrificing accuracy.",
                "risks_&_mitigation": "Primary risks include market adoption timing and technical scalability, mitigated through phased rollout and cloud-native architecture.",
                strengths: "Strong technical team, proven prototype, and early customer validation with three pilot partners.",
                weaknesses: "Limited brand recognition and dependency on third-party cloud infrastructure.",
                opportunities: "Growing market demand and regulatory changes favoring data sovereignty solutions.",
                threats: "Well-funded competitors and potential economic downturn affecting enterprise IT budgets.",
                next_steps: "Complete Series A funding, expand pilot program, and finalize enterprise partnership agreements.",
                proposal_references: "Internal market research Q4 2024, Customer interviews Dec 2024, Competitive analysis report Jan 2025",
                executive_summary: "This proposal outlines a strategic initiative to capture the enterprise analytics market through innovative technology and strong execution.",
            },
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
                        { id: "template-1", created_at: "2025-01-01T00:00:00Z", description: null, domain_id: "domain-1", file_name: "thesis_business_case.md", is_active: true, name: "thesis_business_case", storage_bucket: "prompt-templates", storage_path: "templates/thesis", updated_at: "2025-01-01T00:00:00Z" }
                    ], error: null, count: null, status: 200, statusText: "OK" }
                },
            },
            storageMock: {
                downloadResult: async (_bucketId: string, path: string) => {
                    if (path.endsWith("gpt-4o-mini_0_business_case_raw.json")) {
                        // Return agent response where content is an OBJECT (not a string)
                        const jsonContent = JSON.stringify(agentResponseWithObjectContent);
                        return { data: new Blob([jsonContent], { type: "application/json" }), error: null };
                    }
                    // Return the real template
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
            template_filename: "thesis_business_case.md",
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

        const rendered = new TextDecoder().decode(result.renderedBytes);

        // Assert ALL sections are populated (not stripped)
        assert(rendered.includes("# Executive Summary"), "rendered document should contain Executive Summary header");
        assert(rendered.includes("This proposal outlines a strategic initiative"), "rendered document should contain executive_summary content");

        assert(rendered.includes("# Market Opportunity"), "rendered document should contain Market Opportunity header");
        assert(rendered.includes("enterprise customers seeking advanced analytics"), "rendered document should contain market_opportunity content");

        assert(rendered.includes("# User Problem Validation"), "rendered document should contain User Problem Validation header");
        assert(rendered.includes("78% of enterprises struggle"), "rendered document should contain user_problem_validation content");

        assert(rendered.includes("# Competitive Analysis"), "rendered document should contain Competitive Analysis header");
        assert(rendered.includes("3x performance improvement"), "rendered document should contain competitive_analysis content");

        assert(rendered.includes("# Differentiation & Value Proposition"), "rendered document should contain Differentiation header");
        assert(rendered.includes("proprietary algorithm that reduces processing time"), "rendered document should contain differentiation content");

        assert(rendered.includes("# Risks & Mitigation"), "rendered document should contain Risks header");
        assert(rendered.includes("market adoption timing"), "rendered document should contain risks content");

        assert(rendered.includes("## Strengths"), "rendered document should contain Strengths header");
        assert(rendered.includes("Strong technical team"), "rendered document should contain strengths content");

        assert(rendered.includes("## Weaknesses"), "rendered document should contain Weaknesses header");
        assert(rendered.includes("Limited brand recognition"), "rendered document should contain weaknesses content");

        assert(rendered.includes("## Opportunities"), "rendered document should contain Opportunities header");
        assert(rendered.includes("Growing market demand"), "rendered document should contain opportunities content");

        assert(rendered.includes("## Threats"), "rendered document should contain Threats header");
        assert(rendered.includes("Well-funded competitors"), "rendered document should contain threats content");

        assert(rendered.includes("# Next Steps"), "rendered document should contain Next Steps header");
        assert(rendered.includes("Complete Series A funding"), "rendered document should contain next_steps content");

        assert(rendered.includes("# References"), "rendered document should contain References header");
        assert(rendered.includes("Internal market research Q4 2024"), "rendered document should contain proposal_references content");

        // Assert _extra_content section is NOT populated (all content should be in proper sections)
        assert(!rendered.includes("# Additional Content"), "rendered document should NOT have Additional Content section when all keys match");

        clearAllStubs?.();
    });
});

// Template for feature_spec with flat field placeholders
const FEATURE_SPEC_TEMPLATE = `{{#section:feature_name}}
# Feature Name
{feature_name}
{{/section:feature_name}}

{{#section:feature_objective}}
## Feature Objective
{feature_objective}
{{/section:feature_objective}}

{{#section:user_stories}}
## User Stories
{user_stories}
{{/section:user_stories}}

{{#section:acceptance_criteria}}
## Acceptance Criteria
{acceptance_criteria}
{{/section:acceptance_criteria}}
`;

Deno.test("DocumentRenderer - array content handling", async (t) => {
  const setup = (config: MockSupabaseDataConfig = {}) => {
    const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, config);
    return { dbClient: client as unknown as SupabaseClient<Database>, spies, clearAllStubs };
  };

  await t.step("renders template once per array item when content has array structure", async () => {
    const rootId = "root-array-1";
    const sessionId = "session_array1";
    const stageSlug = "thesis";
    const rawJsonPath = "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_feature_spec_raw.json";
    
    // Array-structured content like AI returns for feature_spec
    const arrayContent = {
      features: [
        {
          feature_name: "User Authentication",
          feature_objective: "Enable secure user login and registration",
          user_stories: ["As a user, I want to log in securely"],
          acceptance_criteria: ["Users can register with email and password"],
        },
        {
          feature_name: "Dashboard Display",
          feature_objective: "Show user overview on login",
          user_stories: ["As a user, I want to see my dashboard"],
          acceptance_criteria: ["Dashboard loads within 2 seconds"],
        },
      ],
    };
    const jsonContent = JSON.stringify({ content: arrayContent });

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_feature_spec_raw.json",
        raw_response_storage_path: rawJsonPath,
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
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
      const blob = new Blob([FEATURE_SPEC_TEMPLATE], { type: "text/markdown" });
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
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.feature_spec,
      sourceContributionId: rootId,
      template_filename: "thesis_feature_spec.md",
    };

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage: mockDownloadFromStorage,
        fileManager: mockFileManager,
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);

    // Assert BOTH features are rendered
    assert(rendered.includes("User Authentication"), "rendered document should contain first feature name");
    assert(rendered.includes("Enable secure user login"), "rendered document should contain first feature objective");
    assert(rendered.includes("Dashboard Display"), "rendered document should contain second feature name");
    assert(rendered.includes("Show user overview on login"), "rendered document should contain second feature objective");

    clearAllStubs?.();
  });

  await t.step("concatenates array items with separator", async () => {
    const rootId = "root-array-2";
    const sessionId = "session_array2";
    const stageSlug = "thesis";
    const rawJsonPath = "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_feature_spec_raw.json";
    
    const arrayContent = {
      features: [
        { feature_name: "Feature One", feature_objective: "Objective One" },
        { feature_name: "Feature Two", feature_objective: "Objective Two" },
      ],
    };
    const jsonContent = JSON.stringify({ content: arrayContent });

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_feature_spec_raw.json",
        raw_response_storage_path: rawJsonPath,
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
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
      const blob = new Blob([FEATURE_SPEC_TEMPLATE], { type: "text/markdown" });
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
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.feature_spec,
      sourceContributionId: rootId,
      template_filename: "thesis_feature_spec.md",
    };

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage: mockDownloadFromStorage,
        fileManager: mockFileManager,
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);

    // Assert separator exists between features
    assert(rendered.includes("---"), "rendered document should contain separator between array items");

    clearAllStubs?.();
  });

  await t.step("flat content (non-array) still works as before", async () => {
    const rootId = "root-flat-1";
    const sessionId = "session_flat1";
    const stageSlug = "thesis";
    const rawJsonPath = "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_business_case_raw.json";
    
    // Flat content structure (existing behavior)
    const flatContent = {
      executive_summary: "This is the executive summary.",
      market_opportunity: "This is the market opportunity.",
    };
    const jsonContent = JSON.stringify({ content: flatContent });

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_business_case_raw.json",
        raw_response_storage_path: rawJsonPath,
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
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
      template_filename: "thesis_business_case.md",
    };

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage: mockDownloadFromStorage,
        fileManager: mockFileManager,
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);

    // Assert flat content is rendered correctly (existing behavior preserved)
    assert(rendered.includes("# Executive Summary"), "rendered document should contain Executive Summary header");
    assert(rendered.includes("This is the executive summary."), "rendered document should contain executive_summary content");
    assert(rendered.includes("# Market Opportunity"), "rendered document should contain Market Opportunity header");
    assert(rendered.includes("This is the market opportunity."), "rendered document should contain market_opportunity content");

    clearAllStubs?.();
  });

  await t.step("formats nested arrays as bullet lists", async () => {
    const rootId = "root-array-nested-1";
    const sessionId = "session_array_nested1";
    const stageSlug = "thesis";
    const rawJsonPath = "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_feature_spec_raw.json";
    
    // Content with nested arrays that should become bullet lists
    const arrayContent = {
      features: [
        {
          feature_name: "Test Feature",
          feature_objective: "Test objective",
          user_stories: ["Story one", "Story two", "Story three"],
          acceptance_criteria: ["Criteria A", "Criteria B"],
        },
      ],
    };
    const jsonContent = JSON.stringify({ content: arrayContent });

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_feature_spec_raw.json",
        raw_response_storage_path: rawJsonPath,
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
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
      const blob = new Blob([FEATURE_SPEC_TEMPLATE], { type: "text/markdown" });
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
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.feature_spec,
      sourceContributionId: rootId,
      template_filename: "thesis_feature_spec.md",
    };

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage: mockDownloadFromStorage,
        fileManager: mockFileManager,
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);

    // Assert nested arrays are formatted as bullet lists, not comma-separated
    assert(rendered.includes("- Story one"), "user_stories should be formatted as bullet list");
    assert(rendered.includes("- Story two"), "user_stories should include second item as bullet");
    assert(rendered.includes("- Story three"), "user_stories should include third item as bullet");
    assert(rendered.includes("- Criteria A"), "acceptance_criteria should be formatted as bullet list");
    assert(rendered.includes("- Criteria B"), "acceptance_criteria should include second item as bullet");
    assert(!rendered.includes("Story one, Story two"), "nested arrays should NOT be comma-separated");

    clearAllStubs?.();
  });

  await t.step("strips template comments from output", async () => {
    const rootId = "root-array-comment-1";
    const sessionId = "session_array_comment1";
    const stageSlug = "thesis";
    const rawJsonPath = "proj_x/session_s/iteration_1/thesis/documents/gpt-4o-mini_0_feature_spec_raw.json";
    
    const arrayContent = {
      features: [
        { feature_name: "Feature One", feature_objective: "Objective One" },
      ],
    };
    const jsonContent = JSON.stringify({ content: arrayContent });

    // Template WITH comment that should be stripped
    const templateWithComment = `<!-- Template: thesis_feature_spec.md -->
{{#section:feature_name}}
# {feature_name}
{{/section:feature_name}}

{{#section:feature_objective}}
## Feature Objective
{feature_objective}
{{/section:feature_objective}}
`;

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "THESIS",
        iteration_number: 1,
        model_id: "model-uuid-test",
        model_name: "Test Model",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/thesis/documents",
        file_name: "gpt-4o-mini_0_feature_spec_raw.json",
        raw_response_storage_path: rawJsonPath,
        mime_type: "text/markdown",
        document_relationships: { thesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
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
      const blob = new Blob([templateWithComment], { type: "text/markdown" });
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
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.feature_spec,
      sourceContributionId: rootId,
      template_filename: "thesis_feature_spec.md",
    };

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage: mockDownloadFromStorage,
        fileManager: mockFileManager,
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);

    // Assert template comment is stripped from output
    assert(!rendered.includes("<!-- Template:"), "template comment should be stripped from output");
    assert(!rendered.includes("thesis_feature_spec.md -->"), "template filename comment should be stripped");
    // But actual content should still be present
    assert(rendered.includes("Feature One"), "feature name should still be present");
    assert(rendered.includes("Objective One"), "feature objective should still be present");

    clearAllStubs?.();
  });

  await t.step("renders tech_stack JSON with nested objects and subordinate arrays", async () => {
    const rootId = "root-tech-stack-1";
    const sessionId = "session_tech_stack1";
    const stageSlug = "synthesis";

    // Representative tech_stack JSON matching real agent output structure:
    // Top-level has BOTH nested objects (frontend_stack, backend_stack) AND
    // arrays of objects (third_party_services, components).
    // The bug: the renderer's primary-array heuristic falsely picks third_party_services
    // as the "primary array", discards all object-valued keys, and produces repeated empty headers.
    const techStackData = {
      document_key: "tech_stack",
      continuation_needed: false,
      stop_reason: "complete",
      frontend_stack: {
        recommended_option: "React with TypeScript",
        rationale: "React offers a strong component-based architecture.",
        alternatives: [
          { name: "Vue.js", tradeoffs: "Smaller ecosystem than React." },
        ],
        risk_signals: ["Excessive bundle sizes impacting load times."],
        integration_requirements: ["GraphQL client for data fetching."],
        operational_owners: ["Frontend Development Team"],
        migration_plan: [],
      },
      backend_stack: {
        recommended_option: "Node.js and Java/Kotlin Spring Boot",
        rationale: "Polyglot approach leverages strengths of each language.",
        alternatives: [
          { name: "Go", tradeoffs: "Team familiarity is lower." },
        ],
        risk_signals: ["Memory leaks in Node.js under sustained load."],
        integration_requirements: ["GraphQL server implementation."],
        operational_owners: ["Backend Development Team"],
        migration_plan: [],
      },
      data_platform: {
        recommended_option: "Kafka + Flink + ClickHouse + PostgreSQL",
        rationale: "Robust real-time data pipeline.",
        alternatives: [],
        risk_signals: ["Data loss in Kafka topics."],
        integration_requirements: ["Kafka Connectors for data sources."],
        operational_owners: ["Data Engineering Team"],
        migration_plan: [],
      },
      shared_libraries: [
        "Internal common utility libraries for logging and error handling.",
        "Data validation libraries for enforcing data integrity.",
      ],
      third_party_services: [
        { service_name: "E-commerce Platform APIs", purpose: "Primary data source.", vendor: "Shopify" },
        { service_name: "Email Service", purpose: "Sending alerts.", vendor: "AWS SES" },
      ],
      components: [
        {
          component_name: "Frontend Framework",
          recommended_option: "React with TypeScript",
          rationale: "Excellent balance of productivity and performance.",
          alternatives: [{ name: "Vue.js", tradeoffs: "Smaller ecosystem." }],
          risk_signals: ["Performance issues on initial load."],
          integration_requirements: ["GraphQL client."],
          operational_owners: ["Frontend Development Team"],
          migration_plan: [],
        },
      ],
      open_questions: [
        "What are the final performance benchmarks for Flink and ClickHouse?",
        "What are the data retention policies?",
      ],
      next_steps: [
        "Conduct proof-of-concept for Flink-ClickHouse integration.",
        "Define deployment topologies for EKS clusters.",
      ],
    };
    const jsonContent = JSON.stringify(techStackData);

    const rawJsonPath = "proj_x/session_s/iteration_1/3_synthesis/raw_responses/google-gemini-2.5-flash_0_tech_stack_raw.json";

    // Template from docs/templates/synthesis/synthesis_tech_stack.md
    const TECH_STACK_TEMPLATE = `# Tech Stack Recommendations

{{#section:frontend_stack}}
## Frontend Stack
{frontend_stack}
{{/section:frontend_stack}}

{{#section:backend_stack}}
## Backend Stack
{backend_stack}
{{/section:backend_stack}}

{{#section:data_platform}}
## Data Platform
{data_platform}
{{/section:data_platform}}

{{#section:devops_tooling}}
## DevOps Tooling
{devops_tooling}
{{/section:devops_tooling}}

{{#section:security_tooling}}
## Security Tooling
{security_tooling}
{{/section:security_tooling}}

{{#section:shared_libraries}}
## Shared Libraries
{shared_libraries}
{{/section:shared_libraries}}

{{#section:third_party_services}}
## Third-Party Services
{third_party_services}
{{/section:third_party_services}}

{{#section:components}}
## Component Recommendations
{components}
{{/section:components}}

{{#section:open_questions}}
## Open Questions
{open_questions}
{{/section:open_questions}}

{{#section:next_steps}}
## Next Steps
{next_steps}
{{/section:next_steps}}

{{#section:_extra_content}}
## Additional Content
{_extra_content}
{{/section:_extra_content}}
`;

    const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
      {
        id: rootId,
        session_id: sessionId,
        stage: "SYNTHESIS",
        iteration_number: 1,
        model_id: "model-uuid-gemini",
        model_name: "Google Gemini 2.5 Flash",
        storage_bucket: "content",
        storage_path: "proj_x/session_s/iteration_1/3_synthesis/raw_responses",
        file_name: "google-gemini-2.5-flash_0_tech_stack_raw.json",
        raw_response_storage_path: rawJsonPath,
        mime_type: "application/json",
        document_relationships: { synthesis: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
        contribution_type: null,
        citations: null,
        error: null,
        is_header: false,
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        size_bytes: null,
        source_prompt_resource_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
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
      const blob = new Blob([TECH_STACK_TEMPLATE], { type: "text/markdown" });
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
                id: "template-tech-stack-1",
                created_at: "2025-01-01T00:00:00Z",
                description: null,
                domain_id: "domain-1",
                file_name: "synthesis_tech_stack.md",
                is_active: true,
                name: "synthesis_tech_stack",
                storage_bucket: "prompt-templates",
                storage_path: "templates/synthesis",
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
      documentKey: FileType.tech_stack,
      sourceContributionId: rootId,
      template_filename: "synthesis_tech_stack.md",
    };

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage: mockDownloadFromStorage,
        fileManager: mockFileManager,
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);

    // ── Structural: headers appear correctly ──

    const mainHeaderCount = (rendered.match(/# Tech Stack Recommendations/g) ?? []).length;
    assertEquals(mainHeaderCount, 1, `Main header should appear once, found ${mainHeaderCount} times`);

    assert(rendered.includes("## Frontend Stack"), "section header: Frontend Stack");
    assert(rendered.includes("## Backend Stack"), "section header: Backend Stack");
    assert(rendered.includes("## Data Platform"), "section header: Data Platform");
    assert(rendered.includes("## Shared Libraries"), "section header: Shared Libraries");
    assert(rendered.includes("## Third-Party Services"), "section header: Third-Party Services");
    assert(rendered.includes("## Component Recommendations"), "section header: Component Recommendations");
    assert(rendered.includes("## Open Questions"), "section header: Open Questions");
    assert(rendered.includes("## Next Steps"), "section header: Next Steps");

    // No item-separator artefact from the old array-path bug
    const separatorCount = (rendered.match(/\n---\n/g) ?? []).length;
    assertEquals(separatorCount, 0, `Should not contain item separators, found ${separatorCount}`);

    // ── No raw JSON: the formatter must convert objects to Markdown ──

    assert(!rendered.includes('"recommended_option"'), "raw JSON key recommended_option must not appear");
    assert(!rendered.includes('"rationale"'), "raw JSON key rationale must not appear");
    assert(!rendered.includes('"alternatives"'), "raw JSON key alternatives must not appear");
    assert(!rendered.includes('"risk_signals"'), "raw JSON key risk_signals must not appear");
    assert(!rendered.includes('"service_name"'), "raw JSON key service_name must not appear");
    assert(!rendered.includes('{"'), "opening JSON brace must not appear in rendered output");

    // ── formatObjectFieldsAsMarkdown: object string fields → **Label:** value ──

    assert(rendered.includes("**Recommended option:** React with TypeScript"), "frontend_stack.recommended_option formatted as labelled field");
    assert(rendered.includes("**Recommended option:** Node.js and Java/Kotlin Spring Boot"), "backend_stack.recommended_option formatted as labelled field");
    assert(rendered.includes("**Recommended option:** Kafka + Flink + ClickHouse + PostgreSQL"), "data_platform.recommended_option formatted as labelled field");
    assert(rendered.includes("**Rationale:** React offers a strong component-based architecture."), "frontend_stack.rationale formatted as labelled field");
    assert(rendered.includes("**Rationale:** Polyglot approach leverages strengths of each language."), "backend_stack.rationale formatted as labelled field");

    // ── formatObjectFieldsAsMarkdown: array-of-strings → bullet list ──

    assert(rendered.includes("**Risk signals:**"), "risk_signals array rendered with label");
    assert(rendered.includes("- Excessive bundle sizes impacting load times."), "risk_signals items rendered as bullets");
    assert(rendered.includes("- Memory leaks in Node.js under sustained load."), "backend risk_signals rendered as bullets");
    assert(rendered.includes("**Integration requirements:**"), "integration_requirements array rendered with label");
    assert(rendered.includes("- GraphQL client for data fetching."), "integration_requirements items rendered as bullets");

    // ── formatObjectFieldsAsMarkdown: array-of-objects → indented sub-items ──

    assert(rendered.includes("**Alternatives:**"), "alternatives array rendered with label");
    assert(rendered.includes("**Name:** Vue.js"), "alternatives sub-object name formatted");
    assert(rendered.includes("**Tradeoffs:** Smaller ecosystem than React."), "alternatives sub-object tradeoffs formatted");
    assert(rendered.includes("**Name:** Go"), "backend alternatives name formatted");
    assert(rendered.includes("**Tradeoffs:** Team familiarity is lower."), "backend alternatives tradeoffs formatted");

    // ── Top-level array-of-objects (third_party_services) → formatted items ──

    assert(rendered.includes("**Service name:** E-commerce Platform APIs"), "third_party_services item formatted");
    assert(rendered.includes("**Purpose:** Primary data source."), "third_party_services purpose formatted");
    assert(rendered.includes("**Vendor:** Shopify"), "third_party_services vendor formatted");
    assert(rendered.includes("**Service name:** Email Service"), "second third_party_services item formatted");

    // ── Top-level array-of-objects (components) → formatted items ──

    assert(rendered.includes("**Component name:** Frontend Framework"), "components item formatted");
    assert(rendered.includes("**Recommended option:** React with TypeScript"), "components recommended_option formatted");

    // ── Top-level string arrays (already joined by pipeline) ──

    assert(rendered.includes("common utility libraries"), "shared_libraries content present");
    assert(rendered.includes("performance benchmarks"), "open_questions content present");
    assert(rendered.includes("proof-of-concept"), "next_steps content present");

    // ── Empty arrays skipped ──

    assert(!rendered.includes("**Migration plan:**"), "empty migration_plan arrays should be skipped");

    clearAllStubs?.();
  });
});

