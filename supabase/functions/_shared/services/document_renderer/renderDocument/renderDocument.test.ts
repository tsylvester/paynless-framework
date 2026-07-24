import { assert, assertEquals, assertRejects } from "jsr:@std/assert@0.225.3";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../types_db.ts";
import { createMockSupabaseClient } from "../../../supabase.mock.ts";
import { FileType } from "../../../types/file_manager.types.ts";
import type { ServiceError } from "../../../types.ts";

import { renderDocument } from "./renderDocument.ts";
import type {
  DocumentRendererDeps,
} from "./renderDocument.interface.ts";
import {
  buildDocumentRendererDeps,
  buildRenderDocumentParams,
} from "./renderDocument.mock.ts";
import { buildFileRecord, MockFileManagerService } from "../../file_manager.mock.ts";
import {
  mockNotificationService,
  resetMockNotificationService,
} from "../../../utils/notification.service.mock.ts";

import type {
  AssembleContributionChainFn,
} from "../assembleContributionChain/assembleContributionChain.provides.ts";
import type {
  LoadDocumentTemplateFn,
} from "../loadDocumentTemplate/loadDocumentTemplate.provides.ts";
import type {
  MergeChunkContentFn,
} from "../mergeChunkContent/mergeChunkContent.provides.ts";
import {
  buildAssembleContributionChainSuccessReturn,
  buildAssembleContributionChainErrorReturn,
  buildContributionRow,
} from "../assembleContributionChain/assembleContributionChain.provides.ts";
import {
  buildLoadDocumentTemplateSuccessReturn,
  buildLoadDocumentTemplateErrorReturn,
} from "../loadDocumentTemplate/loadDocumentTemplate.provides.ts";
import {
  buildMergeChunkContentSuccessReturn,
  buildMergeChunkContentErrorReturn,
} from "../mergeChunkContent/mergeChunkContent.provides.ts";

function createMockDbClient(): SupabaseClient<Database> {
  const { client } = createMockSupabaseClient(undefined, {});
  return client as unknown as SupabaseClient<Database>;
}

const mockRow = buildContributionRow({
  id: "root-1",
  model_id: "model-uuid-123",
  user_id: "user-123",
  storage_bucket: "content",
  storage_path: "proj_x/session_s/iteration_1/thesis/documents",
  file_name: "gpt-4o-mini_0_business_case_raw.json",
  document_relationships: { thesis: "root-1" },
});

const mockChainSuccess = buildAssembleContributionChainSuccessReturn({
  orderedChunks: [mockRow],
  modelSlug: "gpt-4o-mini",
  attemptCount: 0,
  sourceGroupFragment: undefined,
  sourceAnchorModelSlug: undefined,
});

const mockTemplateSuccess = buildLoadDocumentTemplateSuccessReturn({
  templateText: "# Template\n\n{{executive_summary}}",
});

const mockMergeSuccess = buildMergeChunkContentSuccessReturn({
  mergedStructuredData: { executive_summary: "Test summary" },
});

function buildSuccessDeps(
  fileManager: MockFileManagerService,
  assembleFn: AssembleContributionChainFn,
  loadFn: LoadDocumentTemplateFn,
  mergeFn: MergeChunkContentFn,
): DocumentRendererDeps {
  return buildDocumentRendererDeps({
    assembleContributionChain: assembleFn,
    loadDocumentTemplate: loadFn,
    mergeChunkContent: mergeFn,
    fileManager,
    notificationService: mockNotificationService,
  });
}

Deno.test("renderDocument - orchestration wiring", async (t) => {
  await t.step("calls assembleContributionChain with payload from params", async () => {
    const dbClient = createMockDbClient();
    const assembleFn: AssembleContributionChainFn = async () => mockChainSuccess;
    const loadFn: LoadDocumentTemplateFn = async () => mockTemplateSuccess;
    const mergeFn: MergeChunkContentFn = async () => mockMergeSuccess;
    const assembleSpy = spy(assembleFn);

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "resource-1" }), null);
    resetMockNotificationService();

    const deps = buildSuccessDeps(fileManager, assembleSpy, loadFn, mergeFn);
    const params = buildRenderDocumentParams();

    await renderDocument(dbClient, deps, params);

    assertEquals(assembleSpy.calls.length, 1);
    const assembleArgs = assembleSpy.calls[0].args;
    assertEquals(Object.keys(assembleArgs[0]).length, 0);
    assertEquals(assembleArgs[1].dbClient, dbClient);
    assertEquals(assembleArgs[2].sessionId, params.sessionId);
    assertEquals(assembleArgs[2].iterationNumber, params.iterationNumber);
    assertEquals(assembleArgs[2].stageSlug, params.stageSlug);
    assertEquals(assembleArgs[2].documentIdentity, params.documentIdentity);
  });

  await t.step("calls loadDocumentTemplate with projectId and templateFilename from params", async () => {
    const dbClient = createMockDbClient();
    const assembleFn: AssembleContributionChainFn = async () => mockChainSuccess;
    const loadFn: LoadDocumentTemplateFn = async () => mockTemplateSuccess;
    const mergeFn: MergeChunkContentFn = async () => mockMergeSuccess;
    const loadSpy = spy(loadFn);

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "resource-1" }), null);
    resetMockNotificationService();

    const deps = buildSuccessDeps(fileManager, assembleFn, loadSpy, mergeFn);
    const params = buildRenderDocumentParams();

    await renderDocument(dbClient, deps, params);

    assertEquals(loadSpy.calls.length, 1);
    const loadArgs = loadSpy.calls[0].args;
    assertEquals(loadArgs[0].downloadFromStorage, deps.downloadFromStorage);
    assertEquals(loadArgs[1].dbClient, dbClient);
    assertEquals(loadArgs[2].projectId, params.projectId);
    assertEquals(loadArgs[2].templateFilename, params.template_filename);
  });

  await t.step("calls mergeChunkContent with orderedChunks from assemble and sub-deps from deps", async () => {
    const dbClient = createMockDbClient();
    const assembleFn: AssembleContributionChainFn = async () => mockChainSuccess;
    const loadFn: LoadDocumentTemplateFn = async () => mockTemplateSuccess;
    const mergeFn: MergeChunkContentFn = async () => mockMergeSuccess;
    const mergeSpy = spy(mergeFn);

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "resource-1" }), null);
    resetMockNotificationService();

    const deps = buildSuccessDeps(fileManager, assembleFn, loadFn, mergeSpy);
    const params = buildRenderDocumentParams();

    await renderDocument(dbClient, deps, params);

    assertEquals(mergeSpy.calls.length, 1);
    const mergeArgs = mergeSpy.calls[0].args;
    assertEquals(mergeArgs[0].downloadFromStorage, deps.downloadFromStorage);
    assertEquals(mergeArgs[0].logger, deps.logger);
    assertEquals(mergeArgs[1].dbClient, dbClient);
    assertEquals(mergeArgs[2].orderedChunks, mockChainSuccess.orderedChunks);
  });

  await t.step("calls siblings in order: assemble then load then merge", async () => {
    const dbClient = createMockDbClient();
    const callOrder: string[] = [];

    const assembleFn: AssembleContributionChainFn = async () => {
      callOrder.push("assemble");
      return mockChainSuccess;
    };
    const loadFn: LoadDocumentTemplateFn = async () => {
      callOrder.push("load");
      return mockTemplateSuccess;
    };
    const mergeFn: MergeChunkContentFn = async () => {
      callOrder.push("merge");
      return mockMergeSuccess;
    };

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "resource-1" }), null);
    resetMockNotificationService();

    const deps = buildSuccessDeps(fileManager, assembleFn, loadFn, mergeFn);
    const params = buildRenderDocumentParams();

    await renderDocument(dbClient, deps, params);

    assertEquals(callOrder, ["assemble", "load", "merge"]);
  });

  await t.step("returns pathContext with delegated modelSlug/attemptCount/sourceContributionId", async () => {
    const dbClient = createMockDbClient();
    const assembleFn: AssembleContributionChainFn = async () => mockChainSuccess;
    const loadFn: LoadDocumentTemplateFn = async () => mockTemplateSuccess;
    const mergeFn: MergeChunkContentFn = async () => mockMergeSuccess;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "resource-1" }), null);
    resetMockNotificationService();

    const deps = buildSuccessDeps(fileManager, assembleFn, loadFn, mergeFn);
    const params = buildRenderDocumentParams();

    const result = await renderDocument(dbClient, deps, params);

    assertEquals(result.pathContext.projectId, params.projectId);
    assertEquals(result.pathContext.fileType, FileType.RenderedDocument);
    assertEquals(result.pathContext.sessionId, params.sessionId);
    assertEquals(result.pathContext.iteration, params.iterationNumber);
    assertEquals(result.pathContext.stageSlug, params.stageSlug);
    assertEquals(result.pathContext.modelSlug, mockChainSuccess.modelSlug);
    assertEquals(result.pathContext.attemptCount, mockChainSuccess.attemptCount);
    assertEquals(result.pathContext.sourceContributionId, params.sourceContributionId);
    assert(result.renderedBytes instanceof Uint8Array);
    assert(result.renderedBytes.length > 0);
  });
});

Deno.test("renderDocument - error passthrough", async (t) => {
  await t.step("throws exact error from assembleContributionChain and short-circuits", async () => {
    const dbClient = createMockDbClient();
    const chainError = buildAssembleContributionChainErrorReturn({
      error: new Error("chain assembly failed"),
      retriable: true,
    });
    const assembleFn: AssembleContributionChainFn = async () => chainError;
    const loadFn: LoadDocumentTemplateFn = async () => mockTemplateSuccess;
    const mergeFn: MergeChunkContentFn = async () => mockMergeSuccess;
    const loadSpy = spy(loadFn);
    const mergeSpy = spy(mergeFn);

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "resource-1" }), null);
    resetMockNotificationService();

    const deps = buildSuccessDeps(fileManager, assembleFn, loadSpy, mergeSpy);
    const params = buildRenderDocumentParams();

    await assertRejects(
      () => renderDocument(dbClient, deps, params),
      Error,
      "chain assembly failed",
    );

    assertEquals(loadSpy.calls.length, 0, "loadDocumentTemplate should not be called");
    assertEquals(mergeSpy.calls.length, 0, "mergeChunkContent should not be called");
    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 0, "uploadAndRegisterFile should not be called");
  });

  await t.step("throws exact error from loadDocumentTemplate and short-circuits", async () => {
    const dbClient = createMockDbClient();
    const templateError = buildLoadDocumentTemplateErrorReturn({
      error: new Error("template load failed"),
      retriable: false,
    });
    const assembleFn: AssembleContributionChainFn = async () => mockChainSuccess;
    const loadFn: LoadDocumentTemplateFn = async () => templateError;
    const mergeFn: MergeChunkContentFn = async () => mockMergeSuccess;
    const mergeSpy = spy(mergeFn);

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "resource-1" }), null);
    resetMockNotificationService();

    const deps = buildSuccessDeps(fileManager, assembleFn, loadFn, mergeSpy);
    const params = buildRenderDocumentParams();

    await assertRejects(
      () => renderDocument(dbClient, deps, params),
      Error,
      "template load failed",
    );

    assertEquals(mergeSpy.calls.length, 0, "mergeChunkContent should not be called");
    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 0, "uploadAndRegisterFile should not be called");
  });

  await t.step("throws exact error from mergeChunkContent and short-circuits", async () => {
    const dbClient = createMockDbClient();
    const mergeError = buildMergeChunkContentErrorReturn({
      error: new Error("chunk merge failed"),
      retriable: false,
    });
    const assembleFn: AssembleContributionChainFn = async () => mockChainSuccess;
    const loadFn: LoadDocumentTemplateFn = async () => mockTemplateSuccess;
    const mergeFn: MergeChunkContentFn = async () => mergeError;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "resource-1" }), null);
    resetMockNotificationService();

    const deps = buildSuccessDeps(fileManager, assembleFn, loadFn, mergeFn);
    const params = buildRenderDocumentParams();

    await assertRejects(
      () => renderDocument(dbClient, deps, params),
      Error,
      "chunk merge failed",
    );

    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 0, "uploadAndRegisterFile should not be called");
  });

  await t.step("throws exact error object (identity-equal) from assembleContributionChain", async () => {
    const dbClient = createMockDbClient();
    const exactError = new Error("identity test error");
    const chainError = buildAssembleContributionChainErrorReturn({
      error: exactError,
      retriable: false,
    });
    const assembleFn: AssembleContributionChainFn = async () => chainError;

    const deps = buildDocumentRendererDeps({
      assembleContributionChain: assembleFn,
    });
    const params = buildRenderDocumentParams();

    let thrown: unknown;
    try {
      await renderDocument(dbClient, deps, params);
    } catch (e) {
      thrown = e;
    }
    assert(thrown === exactError, "thrown error must be identity-equal to the sibling's returned error");
  });

  await t.step("throws exact error object (identity-equal) from loadDocumentTemplate", async () => {
    const dbClient = createMockDbClient();
    const exactError = new Error("identity test error load");
    const templateError = buildLoadDocumentTemplateErrorReturn({
      error: exactError,
      retriable: false,
    });
    const assembleFn: AssembleContributionChainFn = async () => mockChainSuccess;
    const loadFn: LoadDocumentTemplateFn = async () => templateError;

    const deps = buildDocumentRendererDeps({
      assembleContributionChain: assembleFn,
      loadDocumentTemplate: loadFn,
    });
    const params = buildRenderDocumentParams();

    let thrown: unknown;
    try {
      await renderDocument(dbClient, deps, params);
    } catch (e) {
      thrown = e;
    }
    assert(thrown === exactError, "thrown error must be identity-equal to the sibling's returned error");
  });

  await t.step("throws exact error object (identity-equal) from mergeChunkContent", async () => {
    const dbClient = createMockDbClient();
    const exactError = new Error("identity test error merge");
    const mergeError = buildMergeChunkContentErrorReturn({
      error: exactError,
      retriable: false,
    });
    const assembleFn: AssembleContributionChainFn = async () => mockChainSuccess;
    const loadFn: LoadDocumentTemplateFn = async () => mockTemplateSuccess;
    const mergeFn: MergeChunkContentFn = async () => mergeError;

    const deps = buildDocumentRendererDeps({
      assembleContributionChain: assembleFn,
      loadDocumentTemplate: loadFn,
      mergeChunkContent: mergeFn,
    });
    const params = buildRenderDocumentParams();

    let thrown: unknown;
    try {
      await renderDocument(dbClient, deps, params);
    } catch (e) {
      thrown = e;
    }
    assert(thrown === exactError, "thrown error must be identity-equal to the sibling's returned error");
  });
});

Deno.test("renderDocument - tail: persistence and notification", async (t) => {
  await t.step("calls uploadAndRegisterFile once with correct ResourceUploadContext", async () => {
    const dbClient = createMockDbClient();
    const assembleFn: AssembleContributionChainFn = async () => mockChainSuccess;
    const loadFn: LoadDocumentTemplateFn = async () => mockTemplateSuccess;
    const mergeFn: MergeChunkContentFn = async () => mockMergeSuccess;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "resource-1" }), null);
    resetMockNotificationService();

    const deps = buildSuccessDeps(fileManager, assembleFn, loadFn, mergeFn);
    const params = buildRenderDocumentParams();

    await renderDocument(dbClient, deps, params);

    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 1);
    const uploadArg = fileManager.uploadAndRegisterFile.calls[0].args[0];
    assertEquals(uploadArg.pathContext.projectId, params.projectId);
    assertEquals(uploadArg.pathContext.fileType, FileType.RenderedDocument);
    assertEquals(uploadArg.pathContext.sessionId, params.sessionId);
    assertEquals(uploadArg.pathContext.iteration, params.iterationNumber);
    assertEquals(uploadArg.pathContext.stageSlug, params.stageSlug);
    assertEquals(uploadArg.pathContext.modelSlug, mockChainSuccess.modelSlug);
    assertEquals(uploadArg.pathContext.attemptCount, mockChainSuccess.attemptCount);
    assertEquals(uploadArg.pathContext.sourceContributionId, params.sourceContributionId);
    assertEquals(uploadArg.mimeType, "text/markdown");
    assertEquals(uploadArg.userId, mockRow.user_id);
    if ("resourceTypeForDb" in uploadArg) {
      assertEquals(uploadArg.resourceTypeForDb, FileType.RenderedDocument);
    }
  });

  await t.step("throws when uploadAndRegisterFile returns an error", async () => {
    const dbClient = createMockDbClient();
    const assembleFn: AssembleContributionChainFn = async () => mockChainSuccess;
    const loadFn: LoadDocumentTemplateFn = async () => mockTemplateSuccess;
    const mergeFn: MergeChunkContentFn = async () => mockMergeSuccess;

    const uploadError: ServiceError = { message: "Database registration failed after successful upload." };
    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(null, uploadError);
    resetMockNotificationService();

    const deps = buildSuccessDeps(fileManager, assembleFn, loadFn, mergeFn);
    const params = buildRenderDocumentParams();

    await assertRejects(
      () => renderDocument(dbClient, deps, params),
      Error,
      "Failed to save rendered document",
    );
  });

  await t.step("fires sendJobNotificationEvent once with render_completed shape", async () => {
    const dbClient = createMockDbClient();
    const assembleFn: AssembleContributionChainFn = async () => mockChainSuccess;
    const loadFn: LoadDocumentTemplateFn = async () => mockTemplateSuccess;
    const mergeFn: MergeChunkContentFn = async () => mockMergeSuccess;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "resource-1" }), null);
    resetMockNotificationService();

    const deps = buildSuccessDeps(fileManager, assembleFn, loadFn, mergeFn);
    const params = buildRenderDocumentParams();

    await renderDocument(dbClient, deps, params);

    assertEquals(mockNotificationService.sendJobNotificationEvent.calls.length, 1);
    const notifArg = mockNotificationService.sendJobNotificationEvent.calls[0].args[0];
    const targetUser = mockNotificationService.sendJobNotificationEvent.calls[0].args[1];

    assertEquals(notifArg.type, "render_completed");
    assertEquals(notifArg.sessionId, params.sessionId);
    assertEquals(notifArg.stageSlug, params.stageSlug);
    assertEquals(notifArg.iterationNumber, params.iterationNumber);
    assertEquals(notifArg.job_id, `render-${params.documentIdentity}`);
    assertEquals(notifArg.step_key, "document_step");
    assertEquals(targetUser, mockRow.user_id);

    if (notifArg.type === "render_completed") {
      assertEquals(notifArg.modelId, mockRow.model_id);
      assertEquals(notifArg.document_key, params.documentKey);
      assertEquals(notifArg.latestRenderedResourceId, "resource-1");
    }
  });

  await t.step("surfaces notification send failure as a thrown error", async () => {
    const dbClient = createMockDbClient();
    const assembleFn: AssembleContributionChainFn = async () => mockChainSuccess;
    const loadFn: LoadDocumentTemplateFn = async () => mockTemplateSuccess;
    const mergeFn: MergeChunkContentFn = async () => mockMergeSuccess;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "resource-1" }), null);
    resetMockNotificationService();

    const throwingNotificationService = {
      ...mockNotificationService,
      sendJobNotificationEvent: spy(async () => { throw new Error("notification send failed"); }),
    };

    const deps = buildDocumentRendererDeps({
      assembleContributionChain: assembleFn,
      loadDocumentTemplate: loadFn,
      mergeChunkContent: mergeFn,
      fileManager,
      notificationService: throwingNotificationService,
    });
    const params = buildRenderDocumentParams();

    await assertRejects(
      () => renderDocument(dbClient, deps, params),
      Error,
      "notification send failed",
    );
  });

  await t.step("surfaces missing model_id as a thrown error", async () => {
    const dbClient = createMockDbClient();
    const rowNoModelId = buildContributionRow({
      id: "root-1",
      model_id: null,
      user_id: "user-123",
      storage_bucket: "content",
      storage_path: "proj_x/session_s/iteration_1/thesis/documents",
      file_name: "gpt-4o-mini_0_business_case_raw.json",
      document_relationships: { thesis: "root-1" },
    });
    const chainNoModelId = buildAssembleContributionChainSuccessReturn({
      orderedChunks: [rowNoModelId],
      modelSlug: "gpt-4o-mini",
      attemptCount: 0,
      sourceGroupFragment: undefined,
      sourceAnchorModelSlug: undefined,
    });
    const assembleFn: AssembleContributionChainFn = async () => chainNoModelId;
    const loadFn: LoadDocumentTemplateFn = async () => mockTemplateSuccess;
    const mergeFn: MergeChunkContentFn = async () => mockMergeSuccess;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "resource-1" }), null);
    resetMockNotificationService();

    const deps = buildSuccessDeps(fileManager, assembleFn, loadFn, mergeFn);
    const params = buildRenderDocumentParams();

    await assertRejects(
      () => renderDocument(dbClient, deps, params),
      Error,
      "model_id",
    );
  });

  await t.step("passes sourceGroupFragment through to pathContext", async () => {
    const dbClient = createMockDbClient();
    const chainWithFragment = buildAssembleContributionChainSuccessReturn({
      orderedChunks: [mockRow],
      modelSlug: "gpt-4o-mini",
      attemptCount: 0,
      sourceGroupFragment: "abc12345",
      sourceAnchorModelSlug: undefined,
    });
    const assembleFn: AssembleContributionChainFn = async () => chainWithFragment;
    const loadFn: LoadDocumentTemplateFn = async () => mockTemplateSuccess;
    const mergeFn: MergeChunkContentFn = async () => mockMergeSuccess;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "resource-1" }), null);
    resetMockNotificationService();

    const deps = buildSuccessDeps(fileManager, assembleFn, loadFn, mergeFn);
    const params = buildRenderDocumentParams();

    const result = await renderDocument(dbClient, deps, params);

    assertEquals(result.pathContext.sourceGroupFragment, "abc12345");
  });

  await t.step("passes sourceAnchorModelSlug through to pathContext when present", async () => {
    const dbClient = createMockDbClient();
    const chainWithAnchor = buildAssembleContributionChainSuccessReturn({
      orderedChunks: [mockRow],
      modelSlug: "gpt-4o-mini",
      attemptCount: 0,
      sourceGroupFragment: undefined,
      sourceAnchorModelSlug: "claude-3-opus",
    });
    const assembleFn: AssembleContributionChainFn = async () => chainWithAnchor;
    const loadFn: LoadDocumentTemplateFn = async () => mockTemplateSuccess;
    const mergeFn: MergeChunkContentFn = async () => mockMergeSuccess;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "resource-1" }), null);
    resetMockNotificationService();

    const deps = buildSuccessDeps(fileManager, assembleFn, loadFn, mergeFn);
    const params = buildRenderDocumentParams();

    const result = await renderDocument(dbClient, deps, params);

    assertEquals(result.pathContext.sourceAnchorModelSlug, "claude-3-opus");
  });
});
