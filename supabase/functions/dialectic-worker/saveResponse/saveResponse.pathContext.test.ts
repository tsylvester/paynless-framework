/**
 * pathContext construction, validation, notifications with document_key,
 * HeaderContext / AssembledDocumentJson behavior — adapted from
 * `executeModelCallAndSave.pathContext.test.ts` to target
 * `saveResponse(deps, params, payload)`.
 *
 * saveResponse is the post-stream half of the old executeModelCallAndSave.
 * There is no adapter here — the assembled blob is passed in via
 * SaveResponsePayload. Tests that previously drove behavior via adapter
 * `finishReason` inject `resolveFinishReason` via SaveResponseDeps instead.
 *
 * All tests resolve with `finishReason = 'stop'`: pathContext construction
 * happens on the final chunk, before any rendering path.
 */
import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  DialecticContributionRow,
  DialecticExecuteJobPayload,
  DocumentRelationships,
  UnifiedAIResponse,
} from "../../dialectic-service/dialectic.interface.ts";
import type { FinishReason } from "../../_shared/types.ts";
import { MockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import {
  mockNotificationService,
  resetMockNotificationService,
} from "../../_shared/utils/notification.service.mock.ts";
import { isJson, isRecord } from "../../_shared/utils/type_guards.ts";
import { isModelContributionContext } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type {
  SaveResponseDeps,
  SaveResponseErrorReturn,
  SaveResponseReturn,
} from "./saveResponse.interface.ts";
import {
  isSaveResponseErrorReturn,
  isSaveResponseSuccessReturn,
} from "./saveResponse.guard.ts";
import {
  createMockContributionRow,
  createMockFileManager,
  createMockSaveResponseDeps,
  createMockSaveResponseParamsWithQueuedJob,
  createMockSaveResponsePayload,
  saveResponseTestPayload,
  saveResponseTestPayloadDocumentArtifact,
} from "./saveResponse.mock.ts";
import { saveResponse } from "./saveResponse.ts";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const stopDocumentJson: string = '{"content": "AI response content"}';
const headerContextAiJson: string =
  '{"header_context_artifact": {"type": "header_context", "document_key": "header_context", "artifact_class": "header_context", "file_type": "json"}, "context_for_documents": []}';

const pathContextMockContribution: DialecticContributionRow =
  createMockContributionRow({
    id: "contrib-123",
    session_id: "session-456",
    contribution_type: "model_contribution_main",
    file_name: "test.txt",
    mime_type: "text/plain",
    model_name: "Mock AI",
    tokens_used_input: 10,
    tokens_used_output: 20,
    processing_time_ms: 100,
    document_relationships: null,
  });

/**
 * Build a SaveResponseDeps that simulates a particular model finish reason.
 * Mirrors the EMCAS `adapterStopWithText(...)` helper but for saveResponse
 * the reason is produced by `resolveFinishReason`, not by reading a stream.
 */
function depsWithFinishReason(
  finishReason: FinishReason,
  overrides?: Partial<SaveResponseDeps>,
): SaveResponseDeps {
  return createMockSaveResponseDeps({
    resolveFinishReason: (_ai: UnifiedAIResponse) => finishReason,
    ...(overrides ?? {}),
  });
}

/* ------------------------------------------------------------------ */
/*  41.b.i — ALL required values present for document file type       */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — pathContext validation — 41.b.i: ALL required values present for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayloadDocumentArtifact,
    };
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success return for pathContext 41.b.i, got ${
        JSON.stringify(result)
      }`,
    );
    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      "Expected fileManager.uploadAndRegisterFile to be called",
    );
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall, "uploadAndRegisterFile should have been called");
    const uploadContext = uploadCall.args[0];
    assert(
      isModelContributionContext(uploadContext),
      "uploadContext should be ModelContributionUploadContext",
    );
    assertEquals(uploadContext.pathContext.documentKey, "business_case");
    assertEquals(
      uploadContext.pathContext.projectId,
      saveResponseTestPayloadDocumentArtifact.projectId,
    );
    assertEquals(
      uploadContext.pathContext.sessionId,
      saveResponseTestPayloadDocumentArtifact.sessionId,
    );
    assertEquals(uploadContext.pathContext.iteration, 1);
    assertEquals(uploadContext.pathContext.stageSlug, "thesis");
    assertEquals(uploadContext.pathContext.modelSlug, "mock-ai-v1");
    assertEquals(uploadContext.pathContext.attemptCount, 0);
  },
);

/* ------------------------------------------------------------------ */
/*  41.b.ii — notification document_key from payload                  */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — notification document_key — 41.b.ii: execute_chunk_completed notification uses document_key from payload",
  async () => {
    resetMockNotificationService();
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", {
      fileManager,
      notificationService: mockNotificationService,
    });
    assert(deps.notificationService === mockNotificationService);
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayloadDocumentArtifact,
      output_type: FileType.feature_spec,
      document_key: "feature_spec",
    };
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success, got ${JSON.stringify(result)}`,
    );
    // Find the execute_chunk_completed call specifically — execute_completed
    // may also be emitted on terminal success and would precede/follow it.
    const chunkCompletedCall = mockNotificationService.sendJobNotificationEvent
      .calls.find((call: { args: unknown[] }) => {
        const p: unknown = call.args[0];
        return isRecord(p) && p.type === "execute_chunk_completed";
      });
    assertExists(
      chunkCompletedCall,
      "execute_chunk_completed notification should have been sent",
    );
    const payloadArg: unknown = chunkCompletedCall.args[0];
    assert(isRecord(payloadArg));
    assertEquals(payloadArg.type, "execute_chunk_completed");
    assertEquals(
      payloadArg.document_key,
      "feature_spec",
      "notification.document_key should be from payload",
    );
  },
);

/* ------------------------------------------------------------------ */
/*  41.b.iii.a — error when document_key is undefined                 */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — validation — 41.b.iii.a: error when document_key is undefined for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayloadDocumentArtifact,
    };
    delete payload.document_key;
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseErrorReturn(result),
      `Expected error, got ${JSON.stringify(result)}`,
    );
    const errReturn: SaveResponseErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes("document_key"),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

/* ------------------------------------------------------------------ */
/*  41.b.iii.b — error when document_key is empty string              */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — validation — 41.b.iii.b: error when document_key is empty string for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayloadDocumentArtifact,
      document_key: "",
    };
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseErrorReturn(result),
      `Expected error, got ${JSON.stringify(result)}`,
    );
    const errReturn: SaveResponseErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes("document_key"),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

/* ------------------------------------------------------------------ */
/*  41.b.iii.c — error when projectId is undefined                    */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — validation — 41.b.iii.c: error when projectId is undefined for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayloadDocumentArtifact,
    };
    delete (payload as unknown as Record<string, unknown>).projectId;
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseErrorReturn(result),
      `Expected error, got ${JSON.stringify(result)}`,
    );
    const errReturn: SaveResponseErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes("projectId"),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

/* ------------------------------------------------------------------ */
/*  41.b.iii.d — error when sessionId is undefined                    */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — validation — 41.b.iii.d: error when sessionId is undefined for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayloadDocumentArtifact,
    };
    delete (payload as unknown as Record<string, unknown>).sessionId;
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseErrorReturn(result),
      `Expected error, got ${JSON.stringify(result)}`,
    );
    const errReturn: SaveResponseErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes("sessionId"),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

/* ------------------------------------------------------------------ */
/*  41.b.iii.e — error when iterationNumber is undefined              */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — validation — 41.b.iii.e: error when iterationNumber is undefined for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayloadDocumentArtifact,
    };
    delete payload.iterationNumber;
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseErrorReturn(result),
      `Expected error, got ${JSON.stringify(result)}`,
    );
    const errReturn: SaveResponseErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes("iterationNumber"),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

/* ------------------------------------------------------------------ */
/*  41.b.iii.f — error when canonicalPathParams is undefined          */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — validation — 41.b.iii.f: error when canonicalPathParams is undefined for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayloadDocumentArtifact,
    };
    delete (payload as unknown as Record<string, unknown>).canonicalPathParams;
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseErrorReturn(result),
      `Expected error, got ${JSON.stringify(result)}`,
    );
    const errReturn: SaveResponseErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes("canonicalPathParams"),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

/* ------------------------------------------------------------------ */
/*  41.b.iii.g — error when canonicalPathParams.stageSlug is undefined */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — validation — 41.b.iii.g: error when canonicalPathParams.stageSlug is undefined for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayloadDocumentArtifact,
      canonicalPathParams: {
        ...saveResponseTestPayloadDocumentArtifact.canonicalPathParams,
      },
    };
    if (payload.canonicalPathParams && isRecord(payload.canonicalPathParams)) {
      delete (payload.canonicalPathParams as Record<string, unknown>).stageSlug;
    }
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseErrorReturn(result),
      `Expected error, got ${JSON.stringify(result)}`,
    );
    const errReturn: SaveResponseErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes("stageSlug"),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

/* ------------------------------------------------------------------ */
/*  41.b.iii.h — error when attempt_count is undefined (job row)      */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — validation — 41.b.iii.h: error when attempt_count is undefined for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayloadDocumentArtifact,
    };
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    // attempt_count lives on the job row, not the payload. Cast via unknown
    // because DialecticJobRow declares attempt_count as number (no undefined).
    const { params } = createMockSaveResponseParamsWithQueuedJob(
      payload,
      { attempt_count: undefined as unknown as number },
    );
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseErrorReturn(result),
      `Expected error, got ${JSON.stringify(result)}`,
    );
    const errReturn: SaveResponseErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes("attempt_count"),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

/* ------------------------------------------------------------------ */
/*  41.b.iii.i — error when providerDetails.api_identifier is empty   */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — validation — 41.b.iii.i: error when providerDetails.api_identifier is empty for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayloadDocumentArtifact,
    };
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    // Use whitespace-only api_identifier so it passes the `isSelectedAiProvider`
    // length guard (which rejects strict empty string) but still fails the
    // document-type validation that checks `trim() === ''`. This targets the
    // same combined missingValues check the EMCAS test exercises.
    const { params } = createMockSaveResponseParamsWithQueuedJob(
      payload,
      undefined,
      { api_identifier: "   " },
    );
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseErrorReturn(result),
      `Expected error, got ${JSON.stringify(result)}`,
    );
    const errReturn: SaveResponseErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes("api_identifier"),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

/* ------------------------------------------------------------------ */
/*  41.b.iv — non-document HeaderContext succeeds with document_key   */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — non-document file types — 41.b.iv: succeeds for HeaderContext with document_key",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = { ...saveResponseTestPayload };
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: headerContextAiJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success, got ${JSON.stringify(result)}`,
    );
  },
);

/* ------------------------------------------------------------------ */
/*  sourceAnchorModelSlug propagates for antithesis HeaderContext      */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse propagates sourceAnchorModelSlug from canonicalPathParams to pathContext when creating HeaderContext for antithesis stage",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayload,
      output_type: FileType.HeaderContext,
      stageSlug: "antithesis",
      canonicalPathParams: {
        contributionType: "header_context",
        stageSlug: "antithesis",
        sourceAnchorModelSlug: "gpt-4",
        sourceAnchorType: "thesis",
      },
    };
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: headerContextAiJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertExists(
      uploadContext.pathContext.sourceAnchorModelSlug,
      "pathContext should include sourceAnchorModelSlug from canonicalPathParams",
    );
    assertEquals(uploadContext.pathContext.sourceAnchorModelSlug, "gpt-4");
    assertEquals(uploadContext.pathContext.stageSlug, "antithesis");
  },
);

/* ------------------------------------------------------------------ */
/*  101.c — extracts document_key for assembled_document_json          */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — pathContext validation — 101.c: extracts document_key for assembled_document_json output type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayloadDocumentArtifact,
      output_type: FileType.AssembledDocumentJson,
    };
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(uploadContext.pathContext.documentKey, "business_case");
  },
);

/* ------------------------------------------------------------------ */
/*  passes documentKey to pathContext unconditionally for HeaderContext */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse passes documentKey to pathContext unconditionally for HeaderContext",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayload,
      output_type: FileType.HeaderContext,
      canonicalPathParams: {
        contributionType: "header_context",
        stageSlug: "thesis",
      },
    };
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: headerContextAiJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(uploadContext.pathContext.documentKey, payload.document_key);
  },
);

/* ------------------------------------------------------------------ */
/*  71.c.i — sourceGroupFragment present when source_group is set     */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — sourceGroupFragment — 71.c.i: PathContext includes sourceGroupFragment when document_relationships.source_group is present",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const documentRelationships: DocumentRelationships = {
      source_group: "550e8400-e29b-41d4-a716-446655440000",
    };
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayloadDocumentArtifact,
      document_relationships: documentRelationships,
    };
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success for 71.c.i, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(
      uploadContext.pathContext.sourceGroupFragment,
      "550e8400",
      "pathContext.sourceGroupFragment should be first 8 chars after hyphen removal",
    );
  },
);

/* ------------------------------------------------------------------ */
/*  71.c.ii — fragment extraction handles UUID with hyphens correctly */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — sourceGroupFragment — 71.c.ii: fragment extraction handles UUID with hyphens correctly",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const documentRelationships: DocumentRelationships = {
      source_group: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    };
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayload,
      document_relationships: documentRelationships,
    };
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: headerContextAiJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success for 71.c.ii, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(
      uploadContext.pathContext.sourceGroupFragment,
      "a1b2c3d4",
      "pathContext.sourceGroupFragment should be hyphens removed, first 8 chars, lowercase",
    );
  },
);

/* ------------------------------------------------------------------ */
/*  71.c.iii — works without source_group (backward compatibility)    */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — sourceGroupFragment — 71.c.iii: PathContext works without source_group (backward compatibility)",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = { ...saveResponseTestPayload };
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: headerContextAiJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success for 71.c.iii, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(
      uploadContext.pathContext.sourceGroupFragment,
      undefined,
      "pathContext.sourceGroupFragment should be undefined when document_relationships.source_group is absent",
    );
  },
);

/* ------------------------------------------------------------------ */
/*  71.c.iv — fragment extraction handles undefined source_group      */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — sourceGroupFragment — 71.c.iv: fragment extraction handles undefined source_group gracefully",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const documentRelationships: DocumentRelationships = {};
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayload,
      document_relationships: documentRelationships,
    };
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: headerContextAiJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success for 71.c.iv, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(
      uploadContext.pathContext.sourceGroupFragment,
      undefined,
      "pathContext.sourceGroupFragment should be undefined when source_group is undefined",
    );
  },
);

/* ------------------------------------------------------------------ */
/*  71.c.v — sourceAnchorModelSlug propagates for antithesis          */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — sourceGroupFragment — 71.c.v: sourceAnchorModelSlug propagates for antithesis patterns",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayloadDocumentArtifact,
      stageSlug: "antithesis",
      document_relationships: {
        source_group: "550e8400-e29b-41d4-a716-446655440000",
      },
      canonicalPathParams: {
        contributionType: "antithesis",
        stageSlug: "antithesis",
        sourceAnchorModelSlug: "gpt-4",
      },
    };
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success for 71.c.v, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(uploadContext.pathContext.sourceAnchorModelSlug, "gpt-4");
    assertEquals(uploadContext.pathContext.stageSlug, "antithesis");
    assertEquals(uploadContext.pathContext.sourceGroupFragment, "550e8400");
  },
);

/* ------------------------------------------------------------------ */
/*  71.c.vi — canonicalPathParams sourceAnchorModelSlug for antithesis HeaderContext */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse — sourceGroupFragment — 71.c.vi: canonicalPathParams includes sourceAnchorModelSlug for antithesis HeaderContext jobs",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManager({
      outcome: "success",
      contribution: pathContextMockContribution,
    });
    const deps: SaveResponseDeps = depsWithFinishReason("stop", { fileManager });
    const payload: DialecticExecuteJobPayload = {
      ...saveResponseTestPayload,
      output_type: FileType.HeaderContext,
      stageSlug: "antithesis",
      canonicalPathParams: {
        contributionType: "antithesis",
        stageSlug: "antithesis",
        sourceAnchorModelSlug: "gpt-4",
      },
      document_relationships: {
        source_group: "550e8400-e29b-41d4-a716-446655440000",
      },
    };
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { params } = createMockSaveResponseParamsWithQueuedJob(payload);
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      createMockSaveResponsePayload({
        assembled_content: headerContextAiJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success for 71.c.vi, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(uploadContext.pathContext.sourceAnchorModelSlug, "gpt-4");
    assertEquals(uploadContext.pathContext.stageSlug, "antithesis");
  },
);
