import { assert, assertEquals, assertRejects } from "jsr:@std/assert@0.225.3";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../types_db.ts";
import { createMockSupabaseClient } from "../../../supabase.mock.ts";
import { FileType } from "../../../types/file_manager.types.ts";
import type { ServiceError } from "../../../types.ts";
import { constructStoragePath } from "../../../utils/path_constructor.ts";
import { isResourceContext } from "../../../utils/type-guards/type_guards.file_manager.ts";
import { createMockDownloadFromStorage } from "../../../supabase_storage_utils.mock.ts";
import type { DownloadFromStorageFn } from "../../../supabase_storage_utils.ts";

import { renderDocument } from "./renderDocument.ts";
import type {
  DocumentRendererDeps,
} from "./renderDocument.interface.ts";
import {
  buildDocumentRendererDeps,
  buildRenderDocumentParams,
  buildRenderCompressedContextParams,
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

// ---------------------------------------------------------------------------
// COMPRESS-branch unit tests
// ---------------------------------------------------------------------------

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

const compressResourceRow = buildFileRecord({
  storage_bucket: "content",
  storage_path: rawJsonArtifact.storagePath,
  file_name: rawJsonArtifact.fileName,
});

const compressTemplateSuccess = buildLoadDocumentTemplateSuccessReturn({
  templateText: "# Template\n\n{{executive_summary}}",
});

Deno.test("renderDocument - COMPRESS happy path", async (t) => {
  await t.step("does not call assembleContributionChain or mergeChunkContent", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [compressResourceRow], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const assembleFn: AssembleContributionChainFn = async () => mockChainSuccess;
    const mergeFn: MergeChunkContentFn = async () => mockMergeSuccess;
    const assembleSpy = spy(assembleFn);
    const mergeSpy = spy(mergeFn);

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const downloadData = await new Blob([JSON.stringify({
      content: { executive_summary: "Compressed summary" },
    })]).arrayBuffer();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "pathKeyed",
        pathToData: {
          [`${compressResourceRow.storage_path}/${compressResourceRow.file_name}`]: downloadData,
        },
      }),
      fileManager,
      loadDocumentTemplate: async () => compressTemplateSuccess,
      assembleContributionChain: assembleSpy,
      mergeChunkContent: mergeSpy,
    });

    await renderDocument(dbClient, deps, compressParams);

    assertEquals(assembleSpy.calls.length, 0, "assembleContributionChain should NOT be called");
    assertEquals(mergeSpy.calls.length, 0, "mergeChunkContent should NOT be called");
  });

  await t.step("calls downloadFromStorage with the row's bucket and path", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [compressResourceRow], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const downloadData = await new Blob([JSON.stringify({ executive_summary: "Compressed summary" })]).arrayBuffer();
    const downloadFn: DownloadFromStorageFn = createMockDownloadFromStorage({
      mode: "success",
      data: downloadData,
    });
    const downloadSpy = spy(downloadFn);

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: downloadSpy,
      fileManager,
      loadDocumentTemplate: async () => compressTemplateSuccess,
    });

    await renderDocument(dbClient, deps, compressParams);

    assertEquals(downloadSpy.calls.length, 1);
    const downloadArgs = downloadSpy.calls[0].args;
    assertEquals(downloadArgs[1], compressResourceRow.storage_bucket);
    assertEquals(downloadArgs[2], `${compressResourceRow.storage_path}/${compressResourceRow.file_name}`);
  });

  await t.step("calls loadDocumentTemplate with projectId and templateFilename", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [compressResourceRow], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const loadFn: LoadDocumentTemplateFn = async () => compressTemplateSuccess;
    const loadSpy = spy(loadFn);

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const downloadData = await new Blob([JSON.stringify({ executive_summary: "Compressed summary" })]).arrayBuffer();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "success",
        data: downloadData,
      }),
      fileManager,
      loadDocumentTemplate: loadSpy,
    });

    await renderDocument(dbClient, deps, compressParams);

    assertEquals(loadSpy.calls.length, 1);
    const loadArgs = loadSpy.calls[0].args;
    assertEquals(loadArgs[0].downloadFromStorage, deps.downloadFromStorage);
    assertEquals(loadArgs[1].dbClient, dbClient);
    assertEquals(loadArgs[2].projectId, compressParams.projectId);
    assertEquals(loadArgs[2].templateFilename, compressParams.template_filename);
  });

  await t.step("uploads with pathContext.fileType === CompressedContext and correct identity", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [compressResourceRow], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const downloadData = await new Blob([JSON.stringify({ executive_summary: "Compressed summary" })]).arrayBuffer();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "success",
        data: downloadData,
      }),
      fileManager,
      loadDocumentTemplate: async () => compressTemplateSuccess,
    });

    await renderDocument(dbClient, deps, compressParams);

    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 1);
    const uploadArg = fileManager.uploadAndRegisterFile.calls[0].args[0];
    assertEquals(uploadArg.pathContext.fileType, FileType.CompressedContext);
    assertEquals(uploadArg.pathContext.projectId, compressParams.projectId);
    assertEquals(uploadArg.pathContext.sessionId, compressParams.sessionId);
    assertEquals(uploadArg.pathContext.iteration, compressParams.iterationNumber);
    assertEquals(uploadArg.pathContext.stageSlug, compressParams.stageSlug);
    assertEquals(uploadArg.pathContext.output_type, compressParams.output_type);
    assertEquals(uploadArg.pathContext.sourceType, compressParams.sourceType);
    assertEquals(uploadArg.pathContext.documentKey, compressParams.documentKey);
    assertEquals(uploadArg.mimeType, "text/markdown");
    assertEquals(uploadArg.userId, deps.notifyUserId);
    assert(isResourceContext(uploadArg), "upload context should be a ResourceUploadContext");
    assertEquals(uploadArg.sourcePromptResourceId, undefined);
  });

  await t.step("never calls sendJobNotificationEvent", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [compressResourceRow], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const downloadData = await new Blob([JSON.stringify({ executive_summary: "Compressed summary" })]).arrayBuffer();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "success",
        data: downloadData,
      }),
      fileManager,
      loadDocumentTemplate: async () => compressTemplateSuccess,
    });

    await renderDocument(dbClient, deps, compressParams);

    assertEquals(mockNotificationService.sendJobNotificationEvent.calls.length, 0);
  });

  await t.step("returns pathContext and renderedBytes matching the upload", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [compressResourceRow], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const downloadData = await new Blob([JSON.stringify({ executive_summary: "Compressed summary" })]).arrayBuffer();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "success",
        data: downloadData,
      }),
      fileManager,
      loadDocumentTemplate: async () => compressTemplateSuccess,
    });

    const result = await renderDocument(dbClient, deps, compressParams);

    assertEquals(result.pathContext.fileType, FileType.CompressedContext);
    assertEquals(result.pathContext.projectId, compressParams.projectId);
    assert(result.renderedBytes instanceof Uint8Array);
    assert(result.renderedBytes.length > 0);
  });
});

Deno.test("renderDocument - COMPRESS normalization", async (t) => {
  await t.step("unwraps { content: {...} } body identically to bare record", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [compressResourceRow], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const downloadData = await new Blob([JSON.stringify({ content: { executive_summary: "Unwrapped summary" } })]).arrayBuffer();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "success",
        data: downloadData,
      }),
      fileManager,
      loadDocumentTemplate: async () => compressTemplateSuccess,
    });

    const result = await renderDocument(dbClient, deps, compressParams);

    const decoded = new TextDecoder().decode(result.renderedBytes);
    assert(decoded.includes("Unwrapped summary"), "rendered output should contain the unwrapped value");
  });

  await t.step("renders bare record (no content wrapper) identically", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [compressResourceRow], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const downloadData = await new Blob([JSON.stringify({ executive_summary: "Bare summary" })]).arrayBuffer();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "success",
        data: downloadData,
      }),
      fileManager,
      loadDocumentTemplate: async () => compressTemplateSuccess,
    });

    const result = await renderDocument(dbClient, deps, compressParams);

    const decoded = new TextDecoder().decode(result.renderedBytes);
    assert(decoded.includes("Bare summary"), "rendered output should contain the bare value");
  });

  await t.step("joins non-empty string arrays with double-newline before render", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [compressResourceRow], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const downloadData = await new Blob([JSON.stringify({
      content: {
        executive_summary: ["Part one", "Part two"],
      },
    })]).arrayBuffer();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "success",
        data: downloadData,
      }),
      fileManager,
      loadDocumentTemplate: async () => compressTemplateSuccess,
    });

    const result = await renderDocument(dbClient, deps, compressParams);

    const decoded = new TextDecoder().decode(result.renderedBytes);
    assert(decoded.includes("Part one"), "rendered output should contain first array element");
    assert(decoded.includes("Part two"), "rendered output should contain second array element");
  });

  await t.step("continuation_needed and stop_reason never reach the renderer", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [compressResourceRow], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const downloadData = await new Blob([JSON.stringify({
      content: {
        executive_summary: "Real content",
        continuation_needed: false,
        stop_reason: "stop",
      },
    })]).arrayBuffer();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "success",
        data: downloadData,
      }),
      fileManager,
      loadDocumentTemplate: async () => compressTemplateSuccess,
    });

    const result = await renderDocument(dbClient, deps, compressParams);

    const decoded = new TextDecoder().decode(result.renderedBytes);
    assert(!decoded.includes("continuation_needed"), "continuation_needed must not appear in rendered output");
    assert(!decoded.includes("stop_reason"), "stop_reason must not appear in rendered output");
  });
});

Deno.test("renderDocument - COMPRESS error cases", async (t) => {
  await t.step("resources query error rethrown identity-equal", async () => {
    const queryError = new Error("DB connection lost");
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: null, error: queryError, count: 0, status: 400, statusText: "Error" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({ mode: "empty" }),
      fileManager,
      loadDocumentTemplate: async () => compressTemplateSuccess,
    });

    let thrown: unknown;
    try {
      await renderDocument(dbClient, deps, compressParams);
    } catch (e) {
      thrown = e;
    }
    assert(thrown === queryError, "resources query error must be rethrown identity-equal");
  });

  await t.step("no matching row throws fresh Error naming the canonical path", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null, count: 0, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({ mode: "empty" }),
      fileManager,
      loadDocumentTemplate: async () => compressTemplateSuccess,
    });

    await assertRejects(
      () => renderDocument(dbClient, deps, compressParams),
      Error,
      rawJsonArtifact.storagePath,
    );
  });

  await t.step("download error rethrown identity-equal", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [compressResourceRow], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const downloadError = new Error("storage download failed");

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({ mode: "error", error: downloadError }),
      fileManager,
      loadDocumentTemplate: async () => compressTemplateSuccess,
    });

    let thrown: unknown;
    try {
      await renderDocument(dbClient, deps, compressParams);
    } catch (e) {
      thrown = e;
    }
    assert(thrown === downloadError, "download error must be rethrown identity-equal");
  });

  await t.step("loadDocumentTemplate error rethrown identity-equal", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [compressResourceRow], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const templateError = buildLoadDocumentTemplateErrorReturn({
      error: new Error("template not found"),
      retriable: false,
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const downloadData = await new Blob([JSON.stringify({ executive_summary: "Compressed summary" })]).arrayBuffer();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "success",
        data: downloadData,
      }),
      fileManager,
      loadDocumentTemplate: async () => templateError,
    });

    let thrown: unknown;
    try {
      await renderDocument(dbClient, deps, compressParams);
    } catch (e) {
      thrown = e;
    }
    assert(thrown === templateError.error, "loadDocumentTemplate error must be rethrown identity-equal");
  });

  await t.step("unparseable body throws fresh Error", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [compressResourceRow], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const downloadData = await new Blob(["not valid json {{{"]).arrayBuffer();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "success",
        data: downloadData,
      }),
      fileManager,
      loadDocumentTemplate: async () => compressTemplateSuccess,
    });

    await assertRejects(
      () => renderDocument(dbClient, deps, compressParams),
      Error,
    );
  });

  await t.step("non-record parsed body throws fresh Error", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [compressResourceRow], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const downloadData = await new Blob([JSON.stringify("just a string")]).arrayBuffer();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "success",
        data: downloadData,
      }),
      fileManager,
      loadDocumentTemplate: async () => compressTemplateSuccess,
    });

    await assertRejects(
      () => renderDocument(dbClient, deps, compressParams),
      Error,
    );
  });

  await t.step("upload error return throws Error via existing conversion", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [compressResourceRow], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const uploadError: ServiceError = { message: "Database registration failed after successful upload." };
    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(null, uploadError);
    resetMockNotificationService();

    const downloadData = await new Blob([JSON.stringify({ executive_summary: "Compressed summary" })]).arrayBuffer();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({
        mode: "success",
        data: downloadData,
      }),
      fileManager,
      loadDocumentTemplate: async () => compressTemplateSuccess,
    });

    await assertRejects(
      () => renderDocument(dbClient, deps, compressParams),
      Error,
      "Failed to save rendered document",
    );
  });

  await t.step("every pre-upload error short-circuits before uploadAndRegisterFile", async () => {
    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        dialectic_project_resources: {
          select: { data: [], error: null, count: 0, status: 200, statusText: "OK" },
        },
      },
    });
    const dbClient = client as unknown as SupabaseClient<Database>;

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compressed-1" }), null);
    resetMockNotificationService();

    const deps = buildDocumentRendererDeps({
      downloadFromStorage: createMockDownloadFromStorage({ mode: "empty" }),
      fileManager,
      loadDocumentTemplate: async () => compressTemplateSuccess,
    });

    try {
      await renderDocument(dbClient, deps, compressParams);
    } catch {
      // expected
    }

    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 0, "uploadAndRegisterFile should not be called on pre-upload error");
  });
});
