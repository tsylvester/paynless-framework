import { assert, assertEquals } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../../../../types_db.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../../../supabase.mock.ts";
import { downloadFromStorage } from "../../../supabase_storage_utils.ts";
import { renderDocument } from "./renderDocument.ts";
import type { ContributionRowMinimal, RenderDocumentParams, RenderDocumentResult } from "./renderDocument.interface.ts";
import { buildFileRecord, MockFileManagerService } from "../../file_manager.mock.ts";
import { DialecticStageSlug, FileType } from "../../../types/file_manager.types.ts";
import { mockNotificationService, resetMockNotificationService } from "../../../utils/notification.service.mock.ts";
import { logger } from "../../../logger.ts";
import { renderPrompt } from "../../../prompt-renderer.ts";
import { isResourceContext } from "../../../utils/type-guards/type_guards.file_manager.ts";
import { assembleContributionChain } from "../assembleContributionChain/assembleContributionChain.provides.ts";
import { loadDocumentTemplate } from "../loadDocumentTemplate/loadDocumentTemplate.provides.ts";
import { mergeChunkContent } from "../mergeChunkContent/mergeChunkContent.provides.ts";
import { constructStoragePath } from "../../../utils/path_constructor.ts";
import { buildRenderCompressedContextParams } from "./renderDocument.mock.ts";
const REAL_THESIS_BUSINESS_CASE_TEMPLATE = Deno.readTextFileSync(
  new URL("../../../../../../docs/templates/thesis/thesis_business_case.md", import.meta.url),
);


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
    const stageSlug: DialecticStageSlug= DialecticStageSlug.Thesis;

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
    mockFileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);
    
    // Access storage spies before calling renderDocument so they track calls as they happen
    const storageSpies = spies.storage.from("content");
    
    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      { 
        downloadFromStorage, 
        fileManager: mockFileManager, 
        notificationService: mockNotificationService, 
        notifyUserId: "user_123", 
        logger: logger,
        assembleContributionChain,
        loadDocumentTemplate,
        mergeChunkContent },
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


  await t.step("renders chunks into markdown using a stage/file-type template (@templates)", async () => {
    // Expectation: selects a template based on stageSlug: DialecticStageSlugor file type; fills with ordered content
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
      stageSlug: DialecticStageSlug.Thesis,
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
          fm.setUploadAndRegisterFileResponse(buildFileRecord(), null);
          return fm;
        })(), 
        notificationService: mockNotificationService, 
        notifyUserId: "user_123", 
        logger: logger,
        assembleContributionChain,
        loadDocumentTemplate,
        mergeChunkContent,
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
    const stageSlug: DialecticStageSlug = DialecticStageSlug.Thesis;

    const root: Database['public']['Tables']['dialectic_contributions']['Row'] = {
      id: rootId,
      session_id: sessionId,
      stage: stageSlug,
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
    fm.setUploadAndRegisterFileResponse(buildFileRecord(), null);

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
      assembleContributionChain,
      loadDocumentTemplate,
      mergeChunkContent,
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
    const stageSlug: DialecticStageSlug = DialecticStageSlug.Thesis;
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

    const mockFileRecord = buildFileRecord({ id: expectedResourceId });
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
      assembleContributionChain,
      loadDocumentTemplate,
      mergeChunkContent,
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
    const stageSlug: DialecticStageSlug= DialecticStageSlug.Thesis;

    const root: Database['public']['Tables']['dialectic_contributions']['Row'] = {
      id: rootId,
      session_id: sessionId,
      stage: stageSlug,
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
    fmIdem.setUploadAndRegisterFileResponse(buildFileRecord(), null);
    const r1 = await renderDocument(dbClientIdem, 
        { 
        downloadFromStorage, 
        fileManager: fmIdem,
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
        assembleContributionChain,
        loadDocumentTemplate,
        mergeChunkContent,
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
            assembleContributionChain,
            loadDocumentTemplate,
            mergeChunkContent,
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
            assembleContributionChain,
            loadDocumentTemplate,
            mergeChunkContent,
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


  

  await t.step("passes the originating contribution id to FileManager", async () => {
    const rootId = "root-contrib-123";
    const sessionId = "session_source_check";
    const stageSlug: DialecticStageSlug = DialecticStageSlug.Thesis;

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
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

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
        assembleContributionChain,
        loadDocumentTemplate,
        mergeChunkContent,
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








  await t.step("throws error when uploadAndRegisterFile returns an error", async () => {
    // This test asserts the desired behavior: renderDocument should throw an error
    // when uploadAndRegisterFile returns an error response (not just when it throws).
    // The test will fail because the current implementation doesn't check the return value
    // of uploadAndRegisterFile, silently ignoring errors.
    const rootId = "root-upload-error-test";
    const sessionId = "session_upload_error";
    const stageSlug: DialecticStageSlug = DialecticStageSlug.Thesis;
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
          assembleContributionChain,
          loadDocumentTemplate,
          mergeChunkContent,
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


});


Deno.test("DocumentRenderer - correctly calls FileManagerService to save the rendered document", async (t) => {
    const setup = (config: MockSupabaseDataConfig = {}) => {
        const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, config);
        return { dbClient: client as unknown as SupabaseClient<Database>, spies, clearAllStubs };
    };
    
    await t.step("ensures uploadAndRegisterFile is called with correct data", async () => {
        const rootId = "root-save-correctly-1";
        const sessionId = "session_save_correctly";
        const stageSlug: DialecticStageSlug = DialecticStageSlug.Thesis;
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
        mockFileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

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
                assembleContributionChain,
                loadDocumentTemplate,
                mergeChunkContent,
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
        const stageSlug: DialecticStageSlug = DialecticStageSlug.Thesis;
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
        mockFileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

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
                assembleContributionChain,
                loadDocumentTemplate,
                mergeChunkContent,
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

Deno.test("DocumentRenderer - PathContext works without source_group", async (t) => {
    const setup = (config: MockSupabaseDataConfig = {}) => {
        const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, config);
        return { dbClient: client as unknown as SupabaseClient<Database>, spies, clearAllStubs };
    };

    await t.step("PathContext does not include sourceGroupFragment when contribution lacks document_relationships.source_group", async () => {
        const rootId = "root-no-fragment-1";
        const sessionId = "session_no_fragment";
        const stageSlug: DialecticStageSlug = DialecticStageSlug.Thesis;
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
        mockFileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

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
                assembleContributionChain,
                loadDocumentTemplate,
                mergeChunkContent,
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






Deno.test("DocumentRenderer - COMPRESS end-to-end", async (t) => {
  const setup = (config: MockSupabaseDataConfig = {}) => {
    const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, config);
    return { dbClient: client as unknown as SupabaseClient<Database>, spies, clearAllStubs };
  };

  await t.step("renders compressed context through real loadDocumentTemplate and renderStructuredDocument", async () => {
    const compressParams = buildRenderCompressedContextParams();

    const rawJsonArtifact = constructStoragePath({
      projectId: compressParams.projectId,
      fileType: FileType.CompressedContextRawJson,
      sessionId: compressParams.sessionId,
      iteration: compressParams.iterationNumber,
      stageSlug: compressParams.stageSlug,
      output_type: compressParams.output_type,
      sourceType: compressParams.sourceType,
      documentKey: compressParams.documentKey,
    });

    const compressedArtifact = constructStoragePath({
      projectId: compressParams.projectId,
      fileType: FileType.CompressedContext,
      sessionId: compressParams.sessionId,
      iteration: compressParams.iterationNumber,
      stageSlug: compressParams.stageSlug,
      output_type: compressParams.output_type,
      sourceType: compressParams.sourceType,
      documentKey: compressParams.documentKey,
    });

    const resourceRow = buildFileRecord({
      storage_bucket: "content",
      storage_path: rawJsonArtifact.storagePath,
      file_name: rawJsonArtifact.fileName,
    });

    const templateRecord: Database['public']['Tables']['dialectic_document_templates']['Row'] = {
      id: "template-compress-1",
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

    const compressedBody = {
      content: {
        executive_summary: "Compressed executive summary for integration",
        market_opportunity: "Compressed market opportunity for integration",
      },
    };

    const { dbClient, clearAllStubs } = setup({
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [resourceRow], error: null, count: 1, status: 200, statusText: "OK" },
        },
        dialectic_projects: {
          select: { data: [{ id: compressParams.projectId, selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_document_templates: {
          select: { data: [templateRecord], error: null, count: null, status: 200, statusText: "OK" },
        },
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path === `${rawJsonArtifact.storagePath}/${rawJsonArtifact.fileName}`) {
            return { data: new Blob([JSON.stringify(compressedBody)], { type: "application/json" }), error: null };
          }
          if (path.endsWith("thesis_business_case.md")) {
            return { data: new Blob([REAL_THESIS_BUSINESS_CASE_TEMPLATE], { type: "text/markdown" }), error: null };
          }
          return { data: new Blob([""], { type: "text/plain" }), error: null };
        },
      },
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-int-1" }), null);
    resetMockNotificationService();

    const result = await renderDocument(
      dbClient,
      {
        downloadFromStorage,
        fileManager,
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
        assembleContributionChain,
        loadDocumentTemplate,
        mergeChunkContent,
      },
      compressParams,
    );

    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 1, "should upload exactly once");

    const uploadArg = fileManager.uploadAndRegisterFile.calls[0].args[0];
    assert(isResourceContext(uploadArg), "upload context should be a ResourceUploadContext");

    assertEquals(uploadArg.pathContext.fileType, FileType.CompressedContext);
    assertEquals(uploadArg.pathContext.projectId, compressParams.projectId);
    assertEquals(uploadArg.pathContext.sessionId, compressParams.sessionId);
    assertEquals(uploadArg.pathContext.iteration, compressParams.iterationNumber);
    assertEquals(uploadArg.pathContext.stageSlug, compressParams.stageSlug);
    assertEquals(uploadArg.pathContext.output_type, compressParams.output_type);
    assertEquals(uploadArg.pathContext.sourceType, compressParams.sourceType);
    assertEquals(uploadArg.pathContext.documentKey, compressParams.documentKey);

    assert(compressedArtifact.storagePath.endsWith("/_work"), "compressed artifact storagePath should end with /_work");
    assert(compressedArtifact.fileName.endsWith(`_compressed_for_${compressParams.output_type}.md`), "compressed artifact fileName should end with _compressed_for_<output_type>.md");

    const rendered = new TextDecoder().decode(result.renderedBytes);
    assert(rendered.includes("# Executive Summary"), "rendered output should contain Executive Summary section");
    assert(rendered.includes("Compressed executive summary for integration"), "rendered output should contain compressed executive summary value");
    assert(rendered.includes("# Market Opportunity"), "rendered output should contain Market Opportunity section");
    assert(rendered.includes("Compressed market opportunity for integration"), "rendered output should contain compressed market opportunity value");

    assertEquals(mockNotificationService.sendJobNotificationEvent.calls.length, 0, "sendJobNotificationEvent should never be called for COMPRESS");

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



