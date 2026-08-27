import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { createMockDownloadFromStorage } from "../../_shared/supabase_storage_utils.mock.ts";
import { DialecticStageSlug, FileType } from "../../_shared/types/file_manager.types.ts";
import { constructStoragePath } from "../../_shared/utils/path_constructor.ts";
import type {
  GatherArtifactsDeps,
  GatherArtifactsReturn,
} from "./gatherArtifacts.interface.ts";
import {
  isGatherArtifactsErrorReturn,
  isGatherArtifactsSuccessReturn,
} from "./gatherArtifacts.guard.ts";
import { gatherArtifacts } from "./gatherArtifacts.ts";
import {
  buildGatherArtifactsDeps,
  buildGatherArtifactsParams,
  buildGatherArtifactsPayload,
  buildSelectHandler,
} from "./gatherArtifacts.mock.ts";
import {
  buildDialecticContributionRow,
  buildDialecticFeedbackRow,
  buildDialecticProjectResourceRow,
  buildInputRule,
} from "../../_shared/dialectic.mock.ts";
import { buildResourceDocument } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import {
  buildApplyCompressionOverlaySuccessReturn,
  buildApplyCompressionOverlayErrorReturn,
} from "../applyCompressionOverlay/applyCompressionOverlay.mock.ts";
import type {
  BoundApplyCompressionOverlayFn,
} from "../applyCompressionOverlay/applyCompressionOverlay.interface.ts";

/**
 * Contract: given a document rule, the function queries dialectic_project_resources
 *   and returns a document artifact with type 'document'.
 * Arrange: document rule (type 'document'); DB returns one project resource row.
 * Act:     gatherArtifacts over the document-rule payload.
 * Assert:  success return; artifacts[0].type is 'document'; resources select called.
 */
Deno.test("document rule queries project resources rendered_document and returns document artifact", async () => {
  // Arrange
  const docPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.RenderedDocument,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: "test-model",
    attemptCount: 0,
    documentKey: FileType.business_case,
  });
  const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "res-doc-1",
            stage_slug: "thesis",
            storage_path: docPath.storagePath,
            file_name: docPath.fileName,
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = buildGatherArtifactsDeps();
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule()] });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 1);
    assertEquals(result.artifacts[0].type, "document");
  }
  const resourceSpies = spies.getLatestQueryBuilderSpies("dialectic_project_resources");
  assertExists(resourceSpies?.eq);
});

/**
 * Contract: given a feedback rule, the function queries dialectic_feedback
 *   and returns a feedback artifact with type 'feedback'.
 * Arrange: feedback rule (type 'feedback'); DB returns one feedback row.
 * Act:     gatherArtifacts over the feedback-rule payload.
 * Assert:  success return; artifacts[0].type is 'feedback'.
 */
Deno.test("feedback rule queries dialectic_feedback and returns feedback artifact", async () => {
  // Arrange
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_feedback: {
        select: buildSelectHandler([
          buildDialecticFeedbackRow({
            id: "fb-1",
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule({ type: "feedback" })] });

  // Act
  const result = await gatherArtifacts(buildGatherArtifactsDeps(), params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts[0].type, "feedback");
  }
});

/**
 * Contract: given a seed_prompt rule, the function queries dialectic_project_resources
 *   for seed_prompt and returns success.
 * Arrange: seed_prompt rule (type 'seed_prompt'); DB returns one seed_prompt resource row.
 * Act:     gatherArtifacts over the seed_prompt-rule payload.
 * Assert:  success return.
 */
Deno.test("seed_prompt rule queries project resources seed_prompt", async () => {
  // Arrange
  const seedPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.SeedPrompt,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
  });
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "seed-1",
            resource_type: "seed_prompt",
            storage_path: seedPath.storagePath,
            file_name: seedPath.fileName,
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule({ type: "seed_prompt", document_key: FileType.SeedPrompt })] });

  // Act
  const result = await gatherArtifacts(buildGatherArtifactsDeps(), params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
});

/**
 * Contract: given a project_resource rule, the function queries dialectic_project_resources
 *   for initial_user_prompt and returns success.
 * Arrange: project_resource rule (type 'project_resource'); DB returns one initial_user_prompt row.
 * Act:     gatherArtifacts over the project_resource-rule payload.
 * Assert:  success return.
 */
Deno.test("project_resource rule queries project_resource or initial_user_prompt", async () => {
  // Arrange
  const promptPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.InitialUserPrompt,
    originalFileName: "initial_prompt.md",
  });
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "project-res-1",
            session_id: null,
            iteration_number: null,
            stage_slug: null,
            resource_type: "initial_user_prompt",
            storage_path: promptPath.storagePath,
            file_name: promptPath.fileName,
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule({ type: "project_resource", slug: "project", document_key: FileType.InitialUserPrompt })] });

  // Act
  const result = await gatherArtifacts(buildGatherArtifactsDeps(), params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
});

/**
 * Contract: given a header_context rule, the function queries dialectic_contributions
 *   and returns a contribution artifact.
 * Arrange: header_context rule (type 'header_context'); DB returns one contribution row.
 * Act:     gatherArtifacts over the header_context-rule payload.
 * Assert:  success return.
 */
Deno.test("header_context rule queries dialectic_contributions and returns contribution artifact", async () => {
  // Arrange
  const headerContextPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.HeaderContext,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: "test-model",
    attemptCount: 0,
    documentKey: FileType.HeaderContext,
  });
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: buildSelectHandler([
          buildDialecticContributionRow({
            id: "contrib-1",
            storage_path: headerContextPath.storagePath,
            file_name: headerContextPath.fileName,
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule({ type: "header_context", document_key: FileType.HeaderContext })] });

  // Act
  const result = await gatherArtifacts(buildGatherArtifactsDeps(), params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
});

/**
 * Contract: given an optional document rule with no DB match, the function returns
 *   success with zero artifacts.
 * Arrange: optional document rule (required false); DB returns empty array.
 * Act:     gatherArtifacts over the optional-rule payload.
 * Assert:  success return; artifacts.length is 0.
 */
Deno.test("optional rule DB miss returns success and omits artifact", async () => {
  // Arrange
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([]),
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule({ required: false })] });

  // Act
  const result = await gatherArtifacts(buildGatherArtifactsDeps(), params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 0);
  }
});

/**
 * Contract: given a required document rule with no DB match, the function returns
 *   error with retriable false and a non-empty error message.
 * Arrange: required document rule; DB returns empty array.
 * Act:     gatherArtifacts over the required-rule payload.
 * Assert:  error return; retriable is false; error message is non-empty.
 */
Deno.test("required rule DB miss returns GatherArtifactsErrorReturn with retriable false", async () => {
  // Arrange
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([]),
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule()] });

  // Act
  const result = await gatherArtifacts(buildGatherArtifactsDeps(), params, payload);

  // Assert
  assertEquals(isGatherArtifactsErrorReturn(result), true);
  if (isGatherArtifactsErrorReturn(result)) {
    assertEquals(result.retriable, false);
    assertEquals(result.error.message.length > 0, true);
  }
});

/**
 * Contract: given a required document rule with a storage download failure, the function
 *   returns error with retriable false.
 * Arrange: required document rule; DB returns one row; downloadFromStorage returns error.
 * Act:     gatherArtifacts over the required-rule payload with error deps.
 * Assert:  error return; retriable is false.
 */
Deno.test("required rule storage download failure returns GatherArtifactsErrorReturn retriable false", async () => {
  // Arrange
  const docPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.RenderedDocument,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: "test-model",
    attemptCount: 0,
    documentKey: FileType.business_case,
  });
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "res-doc-fail",
            stage_slug: "thesis",
            storage_path: docPath.storagePath,
            file_name: docPath.fileName,
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = buildGatherArtifactsDeps({
    downloadFromStorage: createMockDownloadFromStorage({
      mode: "error",
      error: new Error("download failed"),
    }),
  });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule()] });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsErrorReturn(result), true);
  if (isGatherArtifactsErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: given two header_context rules resolving the same contribution id, the function
 *   deduplicates artifacts to one.
 * Arrange: two header_context rules (one with type 'contribution'); DB returns one contribution row.
 * Act:     gatherArtifacts over the two-rule payload.
 * Assert:  success return; artifacts.length is 1; artifacts[0].id is 'dup-id-1'.
 */
Deno.test("multiple rules resolving same id deduplicates artifacts to one", async () => {
  // Arrange
  const createdAt = new Date().toISOString();
  const headerContextPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.HeaderContext,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: "test-model",
    attemptCount: 0,
    documentKey: FileType.HeaderContext,
  });
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: buildSelectHandler([
          buildDialecticContributionRow({
            id: "dup-id-1",
            created_at: createdAt,
            updated_at: createdAt,
            storage_path: headerContextPath.storagePath,
            file_name: headerContextPath.fileName,
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const payload = buildGatherArtifactsPayload({
    inputsRequired: [
      buildInputRule({ type: "header_context", document_key: FileType.HeaderContext }),
      buildInputRule({ type: "contribution", document_key: FileType.HeaderContext }),
    ],
  });

  // Act
  const result = await gatherArtifacts(buildGatherArtifactsDeps(), params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 1);
    assertEquals(result.artifacts[0].id, "dup-id-1");
  }
});

/**
 * Contract: given a required feedback rule with no DB match, the function returns error
 *   whose message identifies the missing document_key and stage.
 * Arrange: required feedback rule; DB returns empty array.
 * Act:     gatherArtifacts over the feedback-rule payload.
 * Assert:  error return; message includes 'thesis'.
 */
Deno.test("returns error when required feedback input is missing", async () => {
  // Arrange
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_feedback: {
        select: buildSelectHandler([]),
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule({ type: "feedback" })] });

  // Act
  const result: GatherArtifactsReturn = await gatherArtifacts(buildGatherArtifactsDeps(), params, payload);

  // Assert
  assertEquals(isGatherArtifactsErrorReturn(result), true);
  if (!isGatherArtifactsErrorReturn(result)) {
    throw new Error("expected GatherArtifactsErrorReturn");
  }
  const msg: string = result.error.message;
  assert(
    msg.includes("Required input document missing") ||
      msg.includes("document_key") ||
      msg.includes("thesis"),
    `Error message should identify missing document_key and stage; got: ${msg}`,
  );
  assertEquals(
    msg.includes("thesis"),
    true,
    "Error message should include stage slug (thesis)",
  );
});

/**
 * Contract: given a required feedback rule with a specific document_key and slug, the error
 *   message includes both the missing key and the stage.
 * Arrange: required feedback rule with specific document_key and slug; DB returns empty array.
 * Act:     gatherArtifacts over the feedback-rule payload.
 * Assert:  error return; message includes the document_key and the stage.
 */
Deno.test("error message identifies missing document_key and stage", async () => {
  // Arrange
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_feedback: {
        select: buildSelectHandler([]),
      },
    },
  });
  const missingKey: FileType = FileType.UserFeedback;
  const missingStage: string = "thesis";
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const payload = buildGatherArtifactsPayload({
    inputsRequired: [
      buildInputRule({ type: "feedback", slug: missingStage, document_key: missingKey }),
    ],
  });

  // Act
  const result: GatherArtifactsReturn = await gatherArtifacts(buildGatherArtifactsDeps(), params, payload);

  // Assert
  assertEquals(isGatherArtifactsErrorReturn(result), true);
  if (!isGatherArtifactsErrorReturn(result)) {
    throw new Error("expected GatherArtifactsErrorReturn");
  }
  const msg: string = result.error.message;
  assert(
    msg.includes(missingKey),
    `Error message should include missing document_key '${missingKey}'; got: ${msg}`,
  );
  assert(
    msg.includes(missingStage),
    `Error message should include missing stage '${missingStage}'; got: ${msg}`,
  );
});

/**
 * Contract: given a document rule with a matching resource, the function queries resources
 *   first and does not query contributions.
 * Arrange: document rule; DB returns one resource row; contributions select throws if called.
 * Act:     gatherArtifacts over the document-rule payload.
 * Assert:  success return; resources select called; contributions select not called.
 */
Deno.test("queries resources first and finds rendered document, does not query contributions", async () => {
  // Arrange
  const docPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.RenderedDocument,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: "test-model",
    attemptCount: 0,
    documentKey: FileType.business_case,
  });
  const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "resource-123",
            stage_slug: "thesis",
            storage_path: docPath.storagePath,
            file_name: docPath.fileName,
          }),
        ]),
      },
      dialectic_contributions: {
        select: () => {
          throw new Error(
            "Contributions should not be queried when resources are found",
          );
        },
      },
    },
  });
  const encodedContent = new TextEncoder().encode("Rendered document content");
  const documentContentBuffer = new ArrayBuffer(encodedContent.byteLength);
  new Uint8Array(documentContentBuffer).set(encodedContent);
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = buildGatherArtifactsDeps({
    downloadFromStorage: createMockDownloadFromStorage({
      mode: "success",
      data: documentContentBuffer,
    }),
  });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule()] });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  const resourcesSpies = spies.getLatestQueryBuilderSpies("dialectic_project_resources");
  assertExists(resourcesSpies?.select, "Resources select should be called");
  assert(resourcesSpies.select.calls.length > 0, "Resources should be queried");
  const contributionsSpies = spies.getLatestQueryBuilderSpies("dialectic_contributions");
  if (contributionsSpies?.select) {
    assertEquals(
      contributionsSpies.select.calls.length,
      0,
      "Contributions should NOT be queried when resources are found",
    );
  }
});

/**
 * Contract: given a document rule with both resource and contribution matches, the function
 *   queries resources first and does not query contributions.
 * Arrange: document rule; DB returns one resource row; contributions select tracks if called.
 * Act:     gatherArtifacts over the document-rule payload.
 * Assert:  resources select called; contributions not queried.
 */
Deno.test("prefers resources over contributions when both exist, returns only resource", async () => {
  // Arrange
  let contributionsQueried = false;
  const docPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.RenderedDocument,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: "test-model",
    attemptCount: 0,
    documentKey: FileType.business_case,
  });
  const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "resource-123",
            stage_slug: "thesis",
            storage_path: docPath.storagePath,
            file_name: docPath.fileName,
          }),
        ]),
      },
      dialectic_contributions: {
        select: () => {
          contributionsQueried = true;
          return buildSelectHandler([
            buildDialecticContributionRow({
              id: "contrib-123",
            }),
          ])();
        },
      },
    },
  });
  const encodedContent2 = new TextEncoder().encode("Rendered document content from resources");
  const contentBuffer2 = new ArrayBuffer(encodedContent2.byteLength);
  new Uint8Array(contentBuffer2).set(encodedContent2);
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = buildGatherArtifactsDeps({
    downloadFromStorage: createMockDownloadFromStorage({
      mode: "success",
      data: contentBuffer2,
    }),
  });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule()] });

  // Act
  await gatherArtifacts(deps, params, payload);

  // Assert
  const resourcesSpies = spies.getLatestQueryBuilderSpies("dialectic_project_resources");
  assertExists(resourcesSpies?.select, "Resources select should be called");
  assert(resourcesSpies.select.calls.length > 0, "Resources should be queried first");
  assert(
    !contributionsQueried,
    "Contributions should NOT be queried when resources are found (resources take precedence)",
  );
});

/**
 * Contract: given a required document rule with no resource match, the function returns error
 *   and does not query contributions.
 * Arrange: required document rule; DB returns empty resources; contributions select tracks if called.
 * Act:     gatherArtifacts over the document-rule payload.
 * Assert:  error return; message includes 'Required rendered document'; contributions not queried.
 */
Deno.test("throws error when required rendered document not found in resources, does not query contributions", async () => {
  // Arrange
  let contributionsQueried = false;
  const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([]),
      },
      dialectic_contributions: {
        select: () => {
          contributionsQueried = true;
          return buildSelectHandler([])();
        },
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule()] });

  // Act
  const result = await gatherArtifacts(buildGatherArtifactsDeps(), params, payload);

  // Assert
  assertEquals(isGatherArtifactsErrorReturn(result), true);
  if (isGatherArtifactsErrorReturn(result)) {
    assert(
      result.error.message.includes("Required rendered document"),
      `expected Required rendered document in message, got: ${result.error.message}`,
    );
  }
  assert(
    !contributionsQueried,
    "Contributions should NOT be queried when resources are found (finished documents must be in resources, not contributions)",
  );
  const allResourcesSpies = spies.getAllQueryBuilderSpies('dialectic_project_resources');
  assertExists(allResourcesSpies, 'Resources query builders should exist');
  assert(allResourcesSpies.length > 0, 'At least one resources query builder should exist');
  const resourcesSpies = allResourcesSpies[allResourcesSpies.length - 1];
  assertExists(resourcesSpies?.select, 'Resources select should be called');
  assert(resourcesSpies.select.calls.length > 0, 'Resources should be queried first');
});

/**
 * Contract: given a required seed_prompt rule, the function queries dialectic_project_resources
 *   and downloads the content from storage.
 * Arrange: seed_prompt rule; DB returns one seed_prompt resource; download tracks if called.
 * Act:     gatherArtifacts over the seed_prompt-rule payload.
 * Assert:  success return; resources queried; download called.
 */
Deno.test("finds required seed_prompt in dialectic_project_resources when app stores it there (target behavior)", async () => {
  // Arrange
  let projectResourcesQueried = false;
  const encodedSeed = new TextEncoder().encode('Seed prompt content');
  const seedBuffer = new ArrayBuffer(encodedSeed.byteLength);
  new Uint8Array(seedBuffer).set(encodedSeed);
  const baseDownload = createMockDownloadFromStorage({ mode: 'success', data: seedBuffer });
  let seedDownloadCalled = false;
  const downloadWithProbe: GatherArtifactsDeps['downloadFromStorage'] = async (supabase, bucket, path) => {
    seedDownloadCalled = true;
    return baseDownload(supabase, bucket, path);
  };
  const seedPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.SeedPrompt,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
  });
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: () => {
          projectResourcesQueried = true;
          return buildSelectHandler([
            buildDialecticProjectResourceRow({
              id: 'resource-seed-prompt-123',
              resource_type: 'seed_prompt',
              storage_path: seedPath.storagePath,
              file_name: seedPath.fileName,
            }),
          ])();
        },
      },
      dialectic_contributions: { select: buildSelectHandler([]) },
      dialectic_feedback: { select: buildSelectHandler([]) },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = buildGatherArtifactsDeps({ downloadFromStorage: downloadWithProbe });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule({ type: "seed_prompt", document_key: FileType.SeedPrompt })] });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  assert(
    projectResourcesQueried,
    'Executor should query dialectic_project_resources for required seed_prompt (app stores it there)',
  );
  assert(
    seedDownloadCalled,
    'downloadFromStorage must be called to get seed_prompt content from storage — there is no content column on dialectic_project_resources',
  );
});

/**
 * Contract: given a header_context rule, the function queries dialectic_contributions
 *   (not resources) and downloads the content from storage.
 * Arrange: header_context rule; DB returns empty resources, one contribution; download tracks if called.
 * Act:     gatherArtifacts over the header_context-rule payload.
 * Assert:  success return; contributions queried; resources not queried; download called.
 */
Deno.test("continues to query contributions for intermediate artifacts (non-document inputs)", async () => {
  // Arrange
  let contributionsQueried = false;
  const encodedHeader = new TextEncoder().encode('Header context content');
  const headerBuffer = new ArrayBuffer(encodedHeader.byteLength);
  new Uint8Array(headerBuffer).set(encodedHeader);
  const baseDownload = createMockDownloadFromStorage({ mode: 'success', data: headerBuffer });
  let headerDownloadCalled = false;
  const downloadWithProbe: GatherArtifactsDeps['downloadFromStorage'] = async (supabase, bucket, path) => {
    headerDownloadCalled = true;
    return baseDownload(supabase, bucket, path);
  };
  const headerContextPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.HeaderContext,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: "test-model",
    attemptCount: 0,
    documentKey: FileType.HeaderContext,
  });
  const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: { select: buildSelectHandler([]) },
      dialectic_contributions: {
        select: () => {
          contributionsQueried = true;
          return buildSelectHandler([
            buildDialecticContributionRow({
              id: 'header-contrib-123',
              storage_path: headerContextPath.storagePath,
              file_name: headerContextPath.fileName,
            }),
          ])();
        },
      },
      dialectic_feedback: { select: buildSelectHandler([]) },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = buildGatherArtifactsDeps({ downloadFromStorage: downloadWithProbe });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule({ type: "header_context", document_key: FileType.HeaderContext })] });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  assert(
    contributionsQueried,
    'Contributions should be queried for intermediate artifacts like header_context',
  );
  const resourcesSpies = spies.getLatestQueryBuilderSpies('dialectic_project_resources');
  if (resourcesSpies?.select) {
    assertEquals(
      resourcesSpies.select.calls.length,
      0,
      'Resources should NOT be queried for intermediate artifacts (header_context is stored in contributions)',
    );
  }
  assert(
    headerDownloadCalled,
    'downloadFromStorage must be called to get header_context content from storage — there is no content column on dialectic_contributions',
  );
});

/**
 * Contract: given a header_context rule, the function queries dialectic_contributions
 *   by session_id only, never by project_id.
 * Arrange: header_context rule; DB returns one contribution; download tracks if called.
 * Act:     gatherArtifacts over the header_context-rule payload.
 * Assert:  no .eq("project_id", ...) calls on contributions; download called.
 */
Deno.test("queries dialectic_contributions by session_id only, never by project_id", async () => {
  // Arrange
  const encodedHeaderCtx = new TextEncoder().encode('Header context content');
  const headerCtxBuffer = new ArrayBuffer(encodedHeaderCtx.byteLength);
  new Uint8Array(headerCtxBuffer).set(encodedHeaderCtx);
  const baseDownload = createMockDownloadFromStorage({ mode: 'success', data: headerCtxBuffer });
  let headerCtxDownloadCalled = false;
  const downloadWithProbe: GatherArtifactsDeps['downloadFromStorage'] = async (supabase, bucket, path) => {
    headerCtxDownloadCalled = true;
    return baseDownload(supabase, bucket, path);
  };
  const headerContextPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.HeaderContext,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: "test-model",
    attemptCount: 0,
    documentKey: FileType.HeaderContext,
  });
  const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: { select: buildSelectHandler([]) },
      dialectic_contributions: {
        select: buildSelectHandler([
          buildDialecticContributionRow({
            id: 'header-contrib-123',
            storage_path: headerContextPath.storagePath,
            file_name: headerContextPath.fileName,
          }),
        ]),
      },
      dialectic_feedback: { select: buildSelectHandler([]) },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = buildGatherArtifactsDeps({ downloadFromStorage: downloadWithProbe });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule({ type: "header_context", document_key: FileType.HeaderContext })] });

  // Act
  await gatherArtifacts(deps, params, payload);

  // Assert
  const allContributionsSpies = spies.getAllQueryBuilderSpies('dialectic_contributions');
  assertExists(allContributionsSpies, 'At least one dialectic_contributions query should occur');
  for (const builder of allContributionsSpies) {
    if (builder.eq?.calls) {
      for (const call of builder.eq.calls) {
        const column: unknown = call.args?.[0];
        assert(
          column !== 'project_id',
          'dialectic_contributions has no project_id column; query by session_id only. Found .eq("project_id", ...) in gatherArtifacts contributions query.',
        );
      }
    }
  }
  assert(
    headerCtxDownloadCalled,
    'downloadFromStorage must be called to get header_context content from storage — there is no content column on dialectic_contributions',
  );
});

/**
 * Contract: given a required project_resource rule, the function queries dialectic_project_resources
 *   for initial_user_prompt and downloads the content from storage.
 * Arrange: project_resource rule; DB returns one initial_user_prompt resource; download tracks if called.
 * Act:     gatherArtifacts over the project_resource-rule payload.
 * Assert:  success return; resources queried; download called.
 */
Deno.test("finds required project_resource initial_user_prompt in dialectic_project_resources (target behavior)", async () => {
  // Arrange
  let projectResourcesQueriedForInitialPrompt = false;
  const encodedPrompt = new TextEncoder().encode('Test prompt for full DAG traversal integration test');
  const promptBuffer = new ArrayBuffer(encodedPrompt.byteLength);
  new Uint8Array(promptBuffer).set(encodedPrompt);
  const baseDownload = createMockDownloadFromStorage({ mode: 'success', data: promptBuffer });
  let promptDownloadCalled = false;
  const downloadWithProbe: GatherArtifactsDeps['downloadFromStorage'] = async (supabase, bucket, path) => {
    promptDownloadCalled = true;
    return baseDownload(supabase, bucket, path);
  };
  const promptPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.InitialUserPrompt,
    originalFileName: "initial_prompt_1769983040943.md",
  });
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: () => {
          projectResourcesQueriedForInitialPrompt = true;
          return buildSelectHandler([
            buildDialecticProjectResourceRow({
              id: 'resource-initial-prompt-123',
              stage_slug: null,
              session_id: null,
              iteration_number: null,
              resource_type: 'initial_user_prompt',
              storage_path: promptPath.storagePath,
              file_name: promptPath.fileName,
            }),
          ])();
        },
      },
      dialectic_contributions: { select: buildSelectHandler([]) },
      dialectic_feedback: { select: buildSelectHandler([]) },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = buildGatherArtifactsDeps({ downloadFromStorage: downloadWithProbe });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule({ type: "project_resource", slug: "project", document_key: FileType.InitialUserPrompt })] });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  assert(
    projectResourcesQueriedForInitialPrompt,
    'Executor should query dialectic_project_resources for required project_resource/initial_user_prompt (app stores it there, same as findSourceDocuments)',
  );
  assert(
    promptDownloadCalled,
    'downloadFromStorage must be called to get project_resource content from storage — there is no content column on dialectic_project_resources',
  );
});

/**
 * Contract: given an optional document rule with no resource match, the function returns success
 *   and still queries resources.
 * Arrange: optional document rule (required false, slug 'parenthesis', document_key master_plan); DB returns empty.
 * Act:     gatherArtifacts over the optional-rule payload.
 * Assert:  success return; resources select called.
 */
Deno.test("skips optional document input when not found in resources", async () => {
  // Arrange
  const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: { select: buildSelectHandler([]) },
      dialectic_contributions: { select: buildSelectHandler([]) },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const payload = buildGatherArtifactsPayload({
    inputsRequired: [
      buildInputRule({ required: false }),
    ],
  });

  // Act
  const result = await gatherArtifacts(buildGatherArtifactsDeps(), params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  const resourcesSpies = spies.getLatestQueryBuilderSpies('dialectic_project_resources');
  assertExists(resourcesSpies?.select, 'Resources select should be called');
  assert(
    resourcesSpies.select.calls.length > 0,
    'Resources should be queried for optional document input',
  );
});

/**
 * Contract: given a required document rule with a failed storage download, the function returns
 *   error whose message identifies the storage failure.
 * Arrange: required document rule; DB returns one row; downloadFromStorage returns error.
 * Act:     gatherArtifacts over the required-rule payload with error deps.
 * Assert:  error return; message includes 'Failed to download content from storage'.
 */
Deno.test("required input with failed storage download throws, does not fall back to empty string", async () => {
  // Arrange
  const docPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.RenderedDocument,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: "test-model",
    attemptCount: 0,
    documentKey: FileType.business_case,
  });
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: 'resource-fail-download-123',
            stage_slug: "thesis",
            storage_path: docPath.storagePath,
            file_name: docPath.fileName,
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = buildGatherArtifactsDeps({
    downloadFromStorage: createMockDownloadFromStorage({
      mode: 'error',
      error: new Error('Storage download failed: file not found'),
    }),
  });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule()] });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsErrorReturn(result), true);
  if (isGatherArtifactsErrorReturn(result)) {
    assert(
      result.error.message.includes('Storage download failed: file not found'),
      `expected storage failure message, got: ${result.error.message}`,
    );
  }
});

/**
 * Contract: given an optional document rule with a failed storage download, the function returns
 *   success with zero artifacts (skips, does not throw).
 * Arrange: optional document rule (required false); DB returns one row; downloadFromStorage returns error.
 * Act:     gatherArtifacts over the optional-rule payload with error deps.
 * Assert:  success return; artifacts.length is 0.
 */
Deno.test("optional input with failed storage download skips, does not throw", async () => {
  // Arrange
  const docPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.RenderedDocument,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: "test-model",
    attemptCount: 0,
    documentKey: FileType.business_case,
  });
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: 'resource-optional-fail-123',
            stage_slug: "thesis",
            storage_path: docPath.storagePath,
            file_name: docPath.fileName,
          }),
        ]),
      },
      dialectic_contributions: { select: buildSelectHandler([]) },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = buildGatherArtifactsDeps({
    downloadFromStorage: createMockDownloadFromStorage({
      mode: 'error',
      error: new Error('Storage download failed: file not found'),
    }),
  });
  const payload = buildGatherArtifactsPayload({
    inputsRequired: [
      buildInputRule({ required: false }),
    ],
  });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 0);
  }
});

/**
 * Contract: given the overlay's success arm supplies specific resourceDocuments, the function
 *   returns those as artifacts instead of the gathered ones.
 * Arrange: document rule with a gathered artifact; overlay returning success with a different resourceDocument.
 * Act:     gatherArtifacts with the spy overlay.
 * Assert:  success return; artifacts are the overlay's array, not the gathered one; artifacts[0].id is 'overlaid-1'.
 */
Deno.test("overlay success arm supplies the result artifacts", async () => {
  // Arrange
  const docPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.RenderedDocument,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: "test-model",
    attemptCount: 0,
    documentKey: FileType.business_case,
  });
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "res-doc-1",
            stage_slug: "thesis",
            storage_path: docPath.storagePath,
            file_name: docPath.fileName,
          }),
        ]),
      },
    },
  });
  const overlaidDocs = [buildResourceDocument({ id: 'overlaid-1', content: 'compressed' })];
  const spyOverlay: BoundApplyCompressionOverlayFn = async () => {
    return buildApplyCompressionOverlaySuccessReturn({ resourceDocuments: overlaidDocs });
  };
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = buildGatherArtifactsDeps({ applyCompressionOverlay: spyOverlay });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule()] });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 1);
    assertEquals(result.artifacts[0].id, 'overlaid-1');
    assertEquals(result.artifacts, overlaidDocs);
  }
});

/**
 * Contract: given the overlay returns an error arm, the function propagates that same Error
 *   instance and its retriable value.
 * Arrange: document rule with a gathered artifact; overlay returning a specific error arm.
 * Act:     gatherArtifacts with the spy overlay.
 * Assert:  error return; error is the same Error instance; retriable matches the overlay's.
 */
Deno.test("overlay error arm propagates", async () => {
  // Arrange
  const docPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.RenderedDocument,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: "test-model",
    attemptCount: 0,
    documentKey: FileType.business_case,
  });
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "res-doc-1",
            stage_slug: "thesis",
            storage_path: docPath.storagePath,
            file_name: docPath.fileName,
          }),
        ]),
      },
    },
  });
  const overlayError = buildApplyCompressionOverlayErrorReturn();
  const spyOverlay: BoundApplyCompressionOverlayFn = async () => overlayError;
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = buildGatherArtifactsDeps({ applyCompressionOverlay: spyOverlay });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule()] });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsErrorReturn(result), true);
  if (isGatherArtifactsErrorReturn(result)) {
    assertEquals(result.error, overlayError.error);
    assertEquals(result.retriable, overlayError.retriable);
  }
});

/**
 * Contract: given multiple rules that deduplicate to one artifact, the overlay receives the
 *   deduped resourceDocuments array and the params carrying all six fields from params.
 * Arrange: two header_context rules resolving the same contribution id; spy overlay capturing args.
 * Act:     gatherArtifacts with the spy overlay.
 * Assert:  overlay called; captured params carry dbClient, projectId, sessionId, iterationNumber,
 *   stageSlug and output_type from params; captured payload resourceDocuments is the post-dedup array (length 1).
 */
Deno.test("overlay receives the deduped array and the params it needs", async () => {
  // Arrange
  const createdAt = new Date().toISOString();
  const headerContextPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.HeaderContext,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: "test-model",
    attemptCount: 0,
    documentKey: FileType.HeaderContext,
  });
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: buildSelectHandler([
          buildDialecticContributionRow({
            id: "dup-id-overlay",
            created_at: createdAt,
            updated_at: createdAt,
            storage_path: headerContextPath.storagePath,
            file_name: headerContextPath.fileName,
          }),
        ]),
      },
    },
  });
  const overlayFn: BoundApplyCompressionOverlayFn = async (_ovParams, ovPayload) => {
    return buildApplyCompressionOverlaySuccessReturn({ resourceDocuments: ovPayload.resourceDocuments });
  };
  const overlaySpy = spy(overlayFn);
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = buildGatherArtifactsDeps({ applyCompressionOverlay: overlaySpy });
  const payload = buildGatherArtifactsPayload({
    inputsRequired: [
      buildInputRule({ type: "header_context", document_key: FileType.HeaderContext }),
      buildInputRule({ type: "contribution", document_key: FileType.HeaderContext }),
    ],
  });

  // Act
  await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(overlaySpy.calls.length, 1);
  const capturedParams = overlaySpy.calls[0].args[0];
  const capturedPayload = overlaySpy.calls[0].args[1];
  assertEquals(capturedParams.dbClient, params.dbClient);
  assertEquals(capturedParams.projectId, params.projectId);
  assertEquals(capturedParams.sessionId, params.sessionId);
  assertEquals(capturedParams.iterationNumber, params.iterationNumber);
  assertEquals(capturedParams.stageSlug, params.stageSlug);
  assertEquals(capturedParams.output_type, params.output_type);
  assertEquals(capturedPayload.resourceDocuments.length, 1);
});

/**
 * Contract: given an empty inputsRequired, the function returns artifacts: [] and does not
 *   call the overlay.
 * Arrange: empty inputsRequired; spy overlay tracking if called.
 * Act:     gatherArtifacts over the empty payload.
 * Assert:  success return; artifacts.length is 0; overlay not called.
 */
Deno.test("empty inputsRequired returns empty artifacts and overlay is not called", async () => {
  // Arrange
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {},
  });
  const overlayFn: BoundApplyCompressionOverlayFn = async () => {
    return buildApplyCompressionOverlaySuccessReturn();
  };
  const overlaySpy = spy(overlayFn);
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = buildGatherArtifactsDeps({ applyCompressionOverlay: overlaySpy });
  const payload = buildGatherArtifactsPayload({ inputsRequired: [] });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 0);
  }
  assertEquals(overlaySpy.calls.length, 0);
});
