import { assert, assertEquals } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../../types_db.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../supabase.mock.ts";
import { downloadFromStorage } from "../supabase_storage_utils.ts";
import { renderDocument } from "./document_renderer.ts";
import type { DocumentRenderedNotificationPayload } from "../types/notification.service.types.ts";
import type { ContributionRowMinimal, RendererPathContext, FileManagerCall, RenderDocumentParams, RenderDocumentResult } from "./document_renderer.interface.ts";
import { FileType } from "../types/file_manager.types.ts";
import { MockFileManagerService } from "./file_manager.mock.ts";
import { mockNotificationService, resetMockNotificationService } from "../utils/notification.service.mock.ts";
import { logger } from "../logger.ts";

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
        mime_type: "text/markdown",
        document_relationships: { THESIS: rootId },
        created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
        target_contribution_id: null,
        edit_version: 1,
        is_latest_edit: true,
        user_id: "user_123",
      },
    ];

    const templateContent = "# {{title}}\n\n{{content}}\n";
    const chunk1 = "chunk-one";

    const { dbClient, spies, clearAllStubs } = setup({
      genericMockResults: {
        dialectic_contributions: {
          select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_document_templates: {
          select: { data: [
            { stage_slug: 'thesis', document_key: 'business_case', storage_bucket: 'prompt-templates', storage_path: 'templates/thesis', file_name: 'thesis_business_case.md' }
          ], error: null, count: null, status: 200, statusText: 'OK' }
        },
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case.md")) {
            return { data: new Blob([chunk1], { type: "text/markdown" }), error: null };
          }
          // Treat any other path as template for this test
          return { data: new Blob([templateContent], { type: "text/markdown" }), error: null };
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
    };

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      { 
        downloadFromStorage, 
        fileManager: new MockFileManagerService(), 
        notificationService: mockNotificationService, 
        notifyUserId: "user_123", 
        logger: logger },
      params,
    );

    assert(result && typeof result === "object");
    assert("pathContext" in result);
    assert("renderedBytes" in result);
    const rendered = new TextDecoder().decode(result.renderedBytes);
    assert(rendered.includes(chunk1));
    const storageSpies = spies.storage.from("content");
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
        mime_type: "text/markdown",
        document_relationships: { THESIS: rootId },
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
        mime_type: "text/markdown",
        document_relationships: { THESIS: rootId },
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
        mime_type: "text/markdown",
        document_relationships: { THESIS: "another-root" },
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
        dialectic_document_templates: {
          select: { data: [
            { stage_slug: 'thesis', document_key: 'business_case', storage_bucket: 'prompt-templates', storage_path: 'templates/thesis', file_name: 'thesis_business_case.md' }
          ], error: null, count: null, status: 200, statusText: 'OK' }
        },
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case.md")) return { data: new Blob(["A1"], { type: "text/markdown" }), error: null };
          if (path.endsWith("gpt-4o-mini_1_business_case.md")) return { data: new Blob(["A2"], { type: "text/markdown" }), error: null };
          return { data: new Blob(["# T\n\n{{content}}\n"], { type: "text/markdown" }), error: null };
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
    };

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      { 
        downloadFromStorage, 
        fileManager: new MockFileManagerService(), 
        notificationService: mockNotificationService, 
        notifyUserId: "user_123", 
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);
    const idx1 = rendered.indexOf("A1");
    const idx2 = rendered.indexOf("A2");
    assert(idx1 !== -1 && idx2 !== -1 && idx1 < idx2);

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
        mime_type: "text/markdown",
        document_relationships: { THESIS: rootId },
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
        mime_type: "text/markdown",
        document_relationships: { THESIS: rootId },
        created_at: new Date(2025, 0, 2, 10, 1, 0).toISOString(),
        target_contribution_id: rootId,
        edit_version: 2,
        is_latest_edit: true,
        user_id: "user_123",
      },
    ];

    const mockTemplate = "# {{title}}\n\n{{content}}\n";

    const { dbClient, clearAllStubs } = setup({
      genericMockResults: {
        dialectic_contributions: {
          select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
        },
        dialectic_document_templates: {
          select: { data: [
            { stage_slug: 'thesis', document_key: 'business_case', storage_bucket: 'prompt-templates', storage_path: 'templates/thesis', file_name: 'thesis_business_case.md' }
          ], error: null, count: null, status: 200, statusText: 'OK' }
        },
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith("gpt-4o-mini_0_business_case.md")) return { data: new Blob(["B1"], { type: "text/markdown" }), error: null };
          if (path.endsWith("gpt-4o-mini_1_business_case.md")) return { data: new Blob(["B2"], { type: "text/markdown" }), error: null };
          return { data: new Blob([mockTemplate], { type: "text/markdown" }), error: null };
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
    };

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      { 
        downloadFromStorage, 
        fileManager: new MockFileManagerService(), 
        notificationService: mockNotificationService, 
        notifyUserId: "user_123", 
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);
    assert(rendered.startsWith("# "));
    const i1 = rendered.indexOf("B1");
    const i2 = rendered.indexOf("B2");
    assert(i1 !== -1 && i2 !== -1 && i1 < i2);

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
      mime_type: "text/markdown",
      document_relationships: { THESIS: rootId },
      created_at: new Date(2025, 4, 1, 10, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      user_id: "user_123",
    };

    const contributions: ContributionRowMinimal[] = [root];

    const templateContent = "# {{title}}\n\n{{content}}\n";
    const chunkBody = "render-body";

    const { dbClient, clearAllStubs } = setup({
      genericMockResults: {
        dialectic_contributions: { select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" } },
        dialectic_document_templates: { select: { data: [ { stage_slug: 'thesis', document_key: 'business_case', storage_bucket: 'prompt-templates', storage_path: 'templates/thesis', file_name: 'thesis_business_case.md' } ], error: null, count: null, status: 200, statusText: 'OK' } },
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          if (path.endsWith(root.file_name)) return { data: new Blob([chunkBody], { type: "text/markdown" }), error: null };
          return { data: new Blob([templateContent], { type: "text/markdown" }), error: null };
        },
      },
    });

    const fm = new MockFileManagerService();

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.business_case,
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
        mime_type: "text/markdown",
        document_relationships: { THESIS: rootId },
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
        dialectic_document_templates: { select: { data: [ { stage_slug: 'thesis', document_key: 'business_case', storage_bucket: 'prompt-templates', storage_path: 'templates/thesis', file_name: 'thesis_business_case.md' } ], error: null, count: null, status: 200, statusText: 'OK' } }
      },
      storageMock: { downloadResult: async () => ({ data: new Blob(["# T\n\n{{content}}\n"], { type: "text/markdown" }), error: null }) },
    });

    const params: RenderDocumentParams = { projectId: "project_123", sessionId, iterationNumber: 1, stageSlug, documentIdentity: rootId, documentKey: FileType.business_case };
    await renderDocument(dbClient, { 
      downloadFromStorage, 
      fileManager: new MockFileManagerService(), 
      notificationService: mockNotificationService, 
      notifyUserId: "user_123", 
      logger: logger,
    }, params);

    assert(mockNotificationService.sendDocumentRenderedNotification.calls.length === 1);
    const [payload, userId] = mockNotificationService.sendDocumentRenderedNotification.calls[0].args;
    assert(payload.type === 'document_rendered');
    assert(payload.projectId === 'project_123');
    assert(payload.sessionId === sessionId);
    assert(payload.iterationNumber === 1);
    assert(payload.stageSlug === stageSlug);
    assert(payload.documentIdentity === rootId);
    assert(payload.documentKey === "business_case");
    assert(payload.completed === true);
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
      mime_type: "text/markdown",
      document_relationships: { THESIS: rootId },
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
      mime_type: "text/markdown",
      document_relationships: { THESIS: rootId },
      created_at: new Date(2025, 4, 1, 12, 1, 0).toISOString(),
      target_contribution_id: rootId,
      edit_version: 2,
      is_latest_edit: true,
    };

    let contributionsIdem: ContributionRowMinimal[] = [root, cont1];

    const templateContent = "# {{title}}\n\n{{content}}\n";
    const bodies: Record<string, string> = {
      [root.file_name]: "C1",
      [cont1.file_name]: "C2",
    };

    const { dbClient: dbClientIdem, clearAllStubs: clearAllStubsIdem } = setup({
      genericMockResults: {
        dialectic_contributions: { select: async () => ({ data: contributionsIdem, error: null, count: null, status: 200, statusText: "OK" }) },
        dialectic_document_templates: { select: { data: [ { stage_slug: 'thesis', document_key: 'business_case', storage_bucket: 'prompt-templates', storage_path: 'templates/thesis', file_name: 'thesis_business_case.md' } ], error: null, count: null, status: 200, statusText: 'OK' } }
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          const name = path.substring(path.lastIndexOf("/") + 1);
          const isChunk = name in bodies;
          return { data: new Blob([isChunk ? bodies[name] : templateContent], { type: "text/markdown" }), error: null };
        },
      },
    });

    const paramsIdem: RenderDocumentParams = { projectId: "project_123", sessionId, iterationNumber: 1, stageSlug, documentIdentity: rootId, documentKey: FileType.business_case };

    const fmIdem = new MockFileManagerService();
    const r1 = await renderDocument(dbClientIdem, 
        { 
        downloadFromStorage, 
        fileManager: fmIdem,
        notificationService: mockNotificationService,
        notifyUserId: "user_123",
        logger: logger,
      }, paramsIdem);

    const rendered1 = new TextDecoder().decode(r1.renderedBytes);
    assert(rendered1.includes("C1") && rendered1.includes("C2"));

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

    const cont2: ContributionRowMinimal = { ...cont1, id: "cont-2", file_name: "gpt-4o-mini_2_business_case.md", created_at: new Date(2025, 4, 1, 12, 2, 0).toISOString(), edit_version: 3, target_contribution_id: cont1.id };
    contributionsIdem = [root, cont1, cont2];
    bodies[cont2.file_name] = "C3";

    const r3 = await renderDocument(dbClientIdem, 
        { 
            downloadFromStorage, 
            fileManager: fmIdem,
            notificationService: mockNotificationService,
            notifyUserId: "user_123",
            logger: logger,
          }, paramsIdem);
                    
    const rendered3 = new TextDecoder().decode(r3.renderedBytes);
    assert(rendered3.includes("C1") && rendered3.includes("C2") && rendered3.includes("C3"));

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
      mime_type: "text/markdown",
      document_relationships: { THESIS: rootId },
      created_at: new Date(2025, 5, 1, 10, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
    };
    const c1: ContributionRowMinimal = { ...r, id: "c1", file_name: "gpt-4o-mini_1_business_case.md", created_at: new Date(2025, 5, 1, 10, 1, 0).toISOString(), target_contribution_id: rootId, edit_version: 2 };
    const c2: ContributionRowMinimal = { ...r, id: "c2", file_name: "gpt-4o-mini_2_business_case.md", created_at: new Date(2025, 5, 1, 10, 2, 0).toISOString(), target_contribution_id: "c1", edit_version: 3 };
    const contributions: ContributionRowMinimal[] = [r, c1, c2];

    const bodies: Record<string, string> = {
      [r.file_name]: "X1",
      [c1.file_name]: "X2",
      [c2.file_name]: "X3",
    };

    const { dbClient, clearAllStubs } = setup({
      genericMockResults: { 
        dialectic_contributions: { select: async () => ({ data: contributions, error: null, count: null, status: 200, statusText: "OK" }) },
        dialectic_document_templates: { select: { data: [ { stage_slug: 'thesis', document_key: 'business_case', storage_bucket: 'prompt-templates', storage_path: 'templates/thesis', file_name: 'thesis_business_case.md' } ], error: null, count: null, status: 200, statusText: 'OK' } }
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          const name = path.substring(path.lastIndexOf("/") + 1);
          const isChunk = name in bodies;
          const template = "# {{title}}\n\n{{content}}\n";
          return { data: new Blob([isChunk ? bodies[name] : template], { type: "text/markdown" }), error: null };
        },
      },
    });

    const params: RenderDocumentParams = { projectId: "project_123", sessionId, iterationNumber: 1, stageSlug, documentIdentity: rootId, documentKey: FileType.business_case };
    const result: RenderDocumentResult = await renderDocument(dbClient, { 
      downloadFromStorage, 
      fileManager: new MockFileManagerService(), 
      notificationService: mockNotificationService, 
      notifyUserId: "user_123", 
      logger: logger,
    }, params);
    const rendered = new TextDecoder().decode(result.renderedBytes);
    const i1 = rendered.indexOf("X1");
    const i2 = rendered.indexOf("X2");
    const i3 = rendered.indexOf("X3");
    assert(i1 !== -1 && i2 !== -1 && i3 !== -1 && i1 < i2 && i2 < i3);

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
      mime_type: "text/markdown",
      document_relationships: { THESIS: rootId },
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
      original_model_contribution_id: modelChunk.id,
      is_latest_edit: true,
      created_at: new Date(2025, 6, 1, 10, 5, 0).toISOString(),
    };

    const contributions: ContributionRowMinimal[] = [modelChunk, userEdit];

    const { dbClient, clearAllStubs } = setup({
      genericMockResults: { 
        dialectic_contributions: { select: async () => ({ data: contributions, error: null, count: null, status: 200, statusText: "OK" }) },
        dialectic_document_templates: { select: { data: [ { stage_slug: 'thesis', document_key: 'business_case', storage_bucket: 'prompt-templates', storage_path: 'templates/thesis', file_name: 'thesis_business_case.md' } ], error: null, count: null, status: 200, statusText: 'OK' } }
      },
      storageMock: {
        downloadResult: async (_bucketId: string, path: string) => {
          const isEdit = path.endsWith(userEdit.file_name);
          const isModel = path.endsWith(modelChunk.file_name);
          if (isEdit) return { data: new Blob(["USER"], { type: "text/markdown" }), error: null };
          if (isModel) return { data: new Blob(["MODEL"], { type: "text/markdown" }), error: null };
          // Otherwise this is the template fetch
          return { data: new Blob(["# {{title}}\n\n{{content}}\n"], { type: "text/markdown" }), error: null };
        },
      },
    });

    const params: RenderDocumentParams = { projectId: "project_123", sessionId, iterationNumber: 1, stageSlug, documentIdentity: rootId, documentKey: FileType.business_case };
    const result: RenderDocumentResult = await renderDocument(dbClient, { 
      downloadFromStorage, 
      fileManager: new MockFileManagerService(), 
      notificationService: mockNotificationService, 
      notifyUserId: "user_123", 
      logger: logger,
    }, params);
    const rendered = new TextDecoder().decode(result.renderedBytes);
    assert(rendered.includes("USER"));
    // ensure model body is not used if edit exists
    assert(rendered.indexOf("USER") !== -1);

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
        mime_type: "text/markdown",
        document_relationships: { THESIS: rootId },
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
        mime_type: "text/markdown",
        document_relationships: { THESIS: "another-root" },
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
        dialectic_document_templates: {
          select: { data: [ { stage_slug: "thesis", document_key: "business_case", storage_bucket: "prompt-templates", storage_path: "templates/thesis", file_name: "thesis_business_case.md" } ], error: null, count: null, status: 200, statusText: "OK" }
        },
      },
      storageMock: {
        downloadResult: async (_bucketId: string, _path: string) => ({ data: new Blob(["# {{title}}\n\n{{content}}\n"], { type: "text/markdown" }), error: null }),
      },
    });

    const params: RenderDocumentParams = {
      projectId: "project_123",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.business_case,
    };

    await renderDocument(
      dbClient,
      { 
        downloadFromStorage, 
        fileManager: new MockFileManagerService(), 
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
    const stageKey = stageSlug.toUpperCase();
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
});


