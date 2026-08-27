import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { logger } from "../../_shared/logger.ts";
import { pickLatest } from "../../_shared/utils/pickLatest.ts";
import {
  DialecticStageSlug,
  FileType,
} from "../../_shared/types/file_manager.types.ts";
import { constructStoragePath } from "../../_shared/utils/path_constructor.ts";
import type { DownloadFromStorageFn } from "../../_shared/supabase_storage_utils.ts";
import { gatherArtifacts } from "./gatherArtifacts.ts";
import { isGatherArtifactsSuccessReturn } from "./gatherArtifacts.guard.ts";
import {
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
import { applyCompressionOverlay } from "../applyCompressionOverlay/applyCompressionOverlay.ts";
import type { BoundApplyCompressionOverlayFn } from "../applyCompressionOverlay/applyCompressionOverlay.interface.ts";
import { resolveCompressionSource } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.ts";
import type { BoundResolveCompressionSourceFn } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.interface.ts";

function toArrayBuffer(content: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(content);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

/**
 * Binds the real resolveCompressionSource with a real logger, producing a
 * BoundResolveCompressionSourceFn that the real applyCompressionOverlay will call.
 */
function bindRealResolveCompressionSource(): BoundResolveCompressionSourceFn {
  return (params, payload) => resolveCompressionSource({ logger }, params, payload);
}

/**
 * Binds the real applyCompressionOverlay with real deps (real
 * resolveCompressionSource, real constructStoragePath via the import inside
 * applyCompressionOverlay.ts), sharing the outer-edge downloadFromStorage mock.
 * The chain under test is gatherArtifacts -> applyCompressionOverlay ->
 * resolveCompressionSource -> constructStoragePath.
 */
function bindRealApplyCompressionOverlay(
  downloadFromStorage: DownloadFromStorageFn,
): BoundApplyCompressionOverlayFn {
  const boundResolver = bindRealResolveCompressionSource();
  return (params, payload) =>
    applyCompressionOverlay(
      { logger, downloadFromStorage, resolveCompressionSource: boundResolver },
      params,
      payload,
    );
}

/**
 * Contract: given a document rule, the chain queries dialectic_project_resources,
 *   downloads the rendered document, runs the real overlay (which resolves the
 *   source class to 'resource' and builds the compressed path), and returns a
 *   document artifact whose content is the compressed content from storage.
 * Arrange: document rule (type 'document', slug thesis, document_key business_case);
 *   DB returns one rendered_document row whose path deconstructs to the rule's
 *   slug and document_key; downloadFromStorage returns 'original-content' for the
 *   document path and 'compressed-content' for the compressed path.
 * Act:     gatherArtifacts over the document-rule payload.
 * Assert:  success return; artifacts[0].type is 'document'; artifacts[0].id is
 *   the resource row id; artifacts[0].content is 'compressed-content' (the overlay
 *   hit), proving the chain resolved the source class and built the path from it.
 * Boundary: gatherArtifacts -> applyCompressionOverlay -> resolveCompressionSource
 *   -> constructStoragePath, crossing the Supabase client and storage edge.
 * Mocked: downloadFromStorage (returns differentiated content by path) and the
 *   Supabase client; therefore this test does not prove the real storage adapter
 *   or the real Supabase query layer.
 */
Deno.test("integration: document rule returns 'document' artifact with compressed content from the overlay chain", async () => {
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
  const compressedPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.CompressedContext,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    output_type: FileType.business_case,
    sourceType: "resource",
    documentKey: FileType.business_case,
  });
  const compressedFullPath = `${compressedPath.storagePath}/${compressedPath.fileName}`;
  const docFullPath = `${docPath.storagePath}/${docPath.fileName}`;
  const downloadFromStorage: DownloadFromStorageFn = async (_supabase, _bucket, path) => {
    if (path === compressedFullPath) {
      return { data: toArrayBuffer("compressed-content"), error: null };
    }
    return { data: toArrayBuffer("original-content"), error: null };
  };
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "int-doc-1",
            stage_slug: "thesis",
            storage_path: docPath.storagePath,
            file_name: docPath.fileName,
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = {
    logger,
    pickLatest,
    downloadFromStorage,
    applyCompressionOverlay: bindRealApplyCompressionOverlay(downloadFromStorage),
  };
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule()] });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 1);
    assertEquals(result.artifacts[0].id, "int-doc-1");
    assertEquals(result.artifacts[0].type, "document");
    assertEquals(result.artifacts[0].document_key, FileType.business_case);
    assertEquals(result.artifacts[0].stage_slug, "thesis");
    assertEquals(result.artifacts[0].content, "compressed-content");
  }
});

/**
 * Contract: given a feedback rule, the chain queries dialectic_feedback, downloads
 *   the feedback file, runs the real overlay (which resolves the source class to
 *   'feedback'), and returns a feedback artifact with the compressed content.
 * Arrange: feedback rule (type 'feedback'); DB returns one feedback row whose path
 *   deconstructs to the rule's slug and document_key; downloadFromStorage returns
 *   'original-feedback' for the feedback path and 'compressed-feedback' for the
 *   compressed path.
 * Act:     gatherArtifacts over the feedback-rule payload.
 * Assert:  success return; artifacts[0].type is 'feedback'; artifacts[0].content
 *   is 'compressed-feedback', proving the overlay chain resolved the feedback
 *   source class and built the path from it.
 * Boundary: gatherArtifacts -> applyCompressionOverlay -> resolveCompressionSource
 *   -> constructStoragePath, crossing the Supabase client and storage edge.
 * Mocked: downloadFromStorage (returns differentiated content by path) and the
 *   Supabase client; therefore this test does not prove the real storage adapter
 *   or the real Supabase query layer.
 */
Deno.test("integration: feedback rule returns 'feedback' artifact with compressed content from the overlay chain", async () => {
  // Arrange
  const feedbackRow = buildDialecticFeedbackRow({ id: "int-feedback-1" });
  const feedbackFullPath = `${feedbackRow.storage_path}/${feedbackRow.file_name}`;
  const compressedPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.CompressedContext,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    output_type: FileType.business_case,
    sourceType: "feedback",
    documentKey: FileType.business_case,
  });
  const compressedFullPath = `${compressedPath.storagePath}/${compressedPath.fileName}`;
  const downloadFromStorage: DownloadFromStorageFn = async (_supabase, _bucket, path) => {
    if (path === compressedFullPath) {
      return { data: toArrayBuffer("compressed-feedback"), error: null };
    }
    return { data: toArrayBuffer("original-feedback"), error: null };
  };
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_feedback: {
        select: buildSelectHandler([feedbackRow]),
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = {
    logger,
    pickLatest,
    downloadFromStorage,
    applyCompressionOverlay: bindRealApplyCompressionOverlay(downloadFromStorage),
  };
  const payload = buildGatherArtifactsPayload({ inputsRequired: [buildInputRule({ type: "feedback" })] });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 1);
    assertEquals(result.artifacts[0].id, "int-feedback-1");
    assertEquals(result.artifacts[0].type, "feedback");
    assertEquals(result.artifacts[0].content, "compressed-feedback");
  }
});

/**
 * Contract: given a seed_prompt rule, the chain queries dialectic_project_resources,
 *   downloads the seed_prompt content, runs the real overlay (which excludes
 *   seed_prompt as not compressible), and returns the artifact with its original
 *   content — no storage read is issued for a compressed path.
 * Arrange: seed_prompt rule (type 'seed_prompt'); DB returns one seed_prompt
 *   resource row; downloadFromStorage returns 'seed-content' for the seed path
 *   and tracks whether a compressed-path read was attempted.
 * Act:     gatherArtifacts over the seed_prompt-rule payload.
 * Assert:  success return; artifacts[0].type is 'seed_prompt'; artifacts[0].content
 *   is 'seed-content' (the original, unchanged); no compressed-path storage read
 *   was issued, proving the chain excluded seed_prompt from compression.
 * Boundary: gatherArtifacts -> applyCompressionOverlay -> resolveCompressionSource,
 *   crossing the Supabase client and storage edge.
 * Mocked: downloadFromStorage (returns content and tracks compressed-path reads)
 *   and the Supabase client; therefore this test does not prove the real storage
 *   adapter or the real Supabase query layer.
 */
Deno.test("integration: seed_prompt rule returns 'seed_prompt' artifact with original content and no compressed-path storage read", async () => {
  // Arrange
  const seedPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.SeedPrompt,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
  });
  const seedFullPath = `${seedPath.storagePath}/${seedPath.fileName}`;
  let compressedReadIssued = false;
  const downloadFromStorage: DownloadFromStorageFn = async (_supabase, _bucket, path) => {
    if (path !== seedFullPath) {
      compressedReadIssued = true;
      return { data: toArrayBuffer("should-not-be-used"), error: null };
    }
    return { data: toArrayBuffer("seed-content"), error: null };
  };
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "int-seed-1",
            resource_type: "seed_prompt",
            storage_path: seedPath.storagePath,
            file_name: seedPath.fileName,
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = {
    logger,
    pickLatest,
    downloadFromStorage,
    applyCompressionOverlay: bindRealApplyCompressionOverlay(downloadFromStorage),
  };
  const payload = buildGatherArtifactsPayload({
    inputsRequired: [buildInputRule({ type: "seed_prompt", document_key: FileType.SeedPrompt })],
  });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 1);
    assertEquals(result.artifacts[0].id, "int-seed-1");
    assertEquals(result.artifacts[0].type, "seed_prompt");
    assertEquals(result.artifacts[0].document_key, FileType.SeedPrompt);
    assertEquals(result.artifacts[0].stage_slug, "thesis");
    assertEquals(result.artifacts[0].content, "seed-content");
  }
  assert(
    !compressedReadIssued,
    "No storage read should be issued for a compressed path when the source is not compressible (seed_prompt is excluded)",
  );
});

/**
 * Contract: given a project_resource rule, the chain queries dialectic_project_resources
 *   for initial_user_prompt, downloads the content, runs the real overlay (which
 *   resolves the source class to 'resource'), and returns a project_resource artifact
 *   with the compressed content.
 * Arrange: project_resource rule (type 'project_resource', slug 'project',
 *   document_key InitialUserPrompt); DB returns one initial_user_prompt row;
 *   downloadFromStorage returns 'original-prompt' for the document path and
 *   'compressed-prompt' for the compressed path.
 * Act:     gatherArtifacts over the project_resource-rule payload.
 * Assert:  success return; artifacts[0].type is 'project_resource'; artifacts[0].content
 *   is 'compressed-prompt', proving the overlay chain resolved the resource source
 *   class and built the path from it.
 * Boundary: gatherArtifacts -> applyCompressionOverlay -> resolveCompressionSource
 *   -> constructStoragePath, crossing the Supabase client and storage edge.
 * Mocked: downloadFromStorage (returns differentiated content by path) and the
 *   Supabase client; therefore this test does not prove the real storage adapter
 *   or the real Supabase query layer.
 */
Deno.test("integration: project_resource rule returns 'project_resource' artifact with compressed content from the overlay chain", async () => {
  // Arrange
  const promptPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.InitialUserPrompt,
    originalFileName: "initial_prompt.md",
  });
  const promptFullPath = `${promptPath.storagePath}/${promptPath.fileName}`;
  const compressedPath = constructStoragePath({
    projectId: "project-abc",
    fileType: FileType.CompressedContext,
    sessionId: "session-456",
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    output_type: FileType.business_case,
    sourceType: "resource",
    documentKey: FileType.InitialUserPrompt,
  });
  const compressedFullPath = `${compressedPath.storagePath}/${compressedPath.fileName}`;
  const downloadFromStorage: DownloadFromStorageFn = async (_supabase, _bucket, path) => {
    if (path === compressedFullPath) {
      return { data: toArrayBuffer("compressed-prompt"), error: null };
    }
    return { data: toArrayBuffer("original-prompt"), error: null };
  };
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_project_resources: {
        select: buildSelectHandler([
          buildDialecticProjectResourceRow({
            id: "int-project-resource-1",
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
  const deps = {
    logger,
    pickLatest,
    downloadFromStorage,
    applyCompressionOverlay: bindRealApplyCompressionOverlay(downloadFromStorage),
  };
  const payload = buildGatherArtifactsPayload({
    inputsRequired: [buildInputRule({ type: "project_resource", slug: "project", document_key: FileType.InitialUserPrompt })],
  });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 1);
    assertEquals(result.artifacts[0].id, "int-project-resource-1");
    assertEquals(result.artifacts[0].type, "project_resource");
    assertEquals(result.artifacts[0].document_key, FileType.InitialUserPrompt);
    assertEquals(result.artifacts[0].stage_slug, "project");
    assertEquals(result.artifacts[0].content, "compressed-prompt");
  }
});

/**
 * Contract: given a header_context rule, the chain queries dialectic_contributions,
 *   downloads the contribution content, runs the real overlay (which excludes
 *   header_context as not compressible), and returns a header_context artifact with
 *   its original content.
 * Arrange: header_context rule (type 'header_context'); DB returns one contribution
 *   row whose path deconstructs to the rule's slug and document_key;
 *   downloadFromStorage returns 'header-content' for the contribution path and
 *   tracks whether a compressed-path read was attempted.
 * Act:     gatherArtifacts over the header_context-rule payload.
 * Assert:  success return; artifacts[0].type is 'header_context'; artifacts[0].content
 *   is 'header-content' (the original, unchanged); no compressed-path storage read
 *   was issued, proving the chain excluded header_context from compression.
 * Boundary: gatherArtifacts -> applyCompressionOverlay -> resolveCompressionSource,
 *   crossing the Supabase client and storage edge.
 * Mocked: downloadFromStorage (returns content and tracks compressed-path reads)
 *   and the Supabase client; therefore this test does not prove the real storage
 *   adapter or the real Supabase query layer.
 */
Deno.test("integration: header_context rule returns 'header_context' artifact with original content", async () => {
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
  const headerFullPath = `${headerContextPath.storagePath}/${headerContextPath.fileName}`;
  let compressedReadIssued = false;
  const downloadFromStorage: DownloadFromStorageFn = async (_supabase, _bucket, path) => {
    if (path !== headerFullPath) {
      compressedReadIssued = true;
      return { data: toArrayBuffer("should-not-be-used"), error: null };
    }
    return { data: toArrayBuffer("header-content"), error: null };
  };
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: buildSelectHandler([
          buildDialecticContributionRow({
            id: "int-header-1",
            storage_path: headerContextPath.storagePath,
            file_name: headerContextPath.fileName,
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = {
    logger,
    pickLatest,
    downloadFromStorage,
    applyCompressionOverlay: bindRealApplyCompressionOverlay(downloadFromStorage),
  };
  const payload = buildGatherArtifactsPayload({
    inputsRequired: [buildInputRule({ type: "header_context", document_key: FileType.HeaderContext })],
  });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 1);
    assertEquals(result.artifacts[0].id, "int-header-1");
    assertEquals(result.artifacts[0].type, "header_context");
    assertEquals(result.artifacts[0].document_key, FileType.HeaderContext);
    assertEquals(result.artifacts[0].stage_slug, "thesis");
    assertEquals(result.artifacts[0].content, "header-content");
  }
  assert(
    !compressedReadIssued,
    "No storage read should be issued for a compressed path when the source is not compressible (header_context is excluded)",
  );
});

/**
 * Contract: given a contribution rule (type 'contribution'), the chain queries
 *   dialectic_contributions, downloads the contribution content, runs the real
 *   overlay (which excludes 'contribution' as not compressible), and returns a
 *   contribution artifact with its original content.
 * Arrange: contribution rule (type 'contribution', document_key HeaderContext);
 *   DB returns one contribution row whose path deconstructs to the rule's slug
 *   and document_key; downloadFromStorage returns 'contribution-content' for the
 *   contribution path.
 * Act:     gatherArtifacts over the contribution-rule payload.
 * Assert:  success return; artifacts[0].type is 'contribution'; artifacts[0].content
 *   is 'contribution-content' (the original, unchanged).
 * Boundary: gatherArtifacts -> applyCompressionOverlay -> resolveCompressionSource,
 *   crossing the Supabase client and storage edge.
 * Mocked: downloadFromStorage (returns content) and the Supabase client; therefore
 *   this test does not prove the real storage adapter or the real Supabase query
 *   layer.
 */
Deno.test("integration: contribution rule returns 'contribution' artifact with original content", async () => {
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
  const contribFullPath = `${headerContextPath.storagePath}/${headerContextPath.fileName}`;
  const downloadFromStorage: DownloadFromStorageFn = async (_supabase, _bucket, path) => {
    return { data: toArrayBuffer("contribution-content"), error: null };
  };
  const { client: dbClient } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: buildSelectHandler([
          buildDialecticContributionRow({
            id: "int-contribution-1",
            storage_path: headerContextPath.storagePath,
            file_name: headerContextPath.fileName,
          }),
        ]),
      },
    },
  });
  const params = buildGatherArtifactsParams({ dbClient: dbClient as unknown as SupabaseClient<Database> });
  const deps = {
    logger,
    pickLatest,
    downloadFromStorage,
    applyCompressionOverlay: bindRealApplyCompressionOverlay(downloadFromStorage),
  };
  const payload = buildGatherArtifactsPayload({
    inputsRequired: [buildInputRule({ type: "contribution", document_key: FileType.HeaderContext })],
  });

  // Act
  const result = await gatherArtifacts(deps, params, payload);

  // Assert
  assertEquals(isGatherArtifactsSuccessReturn(result), true);
  if (isGatherArtifactsSuccessReturn(result)) {
    assertEquals(result.artifacts.length, 1);
    assertEquals(result.artifacts[0].id, "int-contribution-1");
    assertEquals(result.artifacts[0].type, "contribution");
    assertEquals(result.artifacts[0].document_key, FileType.HeaderContext);
    assertEquals(result.artifacts[0].stage_slug, "thesis");
    assertEquals(result.artifacts[0].content, "contribution-content");
  }
});
