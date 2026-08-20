// supabase/functions/dialectic-worker/processRenderJob.integration.test.ts
// Integration tests for processRenderJob routing across the enqueueRenderJob → DB → processRenderJob → renderDocument chain.
// Real: enqueueRenderJob, shouldEnqueueRenderJob, resolveTemplateFilename, processRenderJob, renderDocument,
//   assembleContributionChain, loadDocumentTemplate, mergeChunkContent, FileManagerService, NotificationService,
//   both payload guards, isCompressedRenderPayloadShape, isEnqueueRenderCompressedContextPayload.
// Mocked: nothing — the only external boundary this repo mocks is the AI provider adapter, and no function in this
//   chain calls a model. The suite runs against the local Supabase stack.

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../types_db.ts";
import { DialecticStageSlug, FileType, ModelContributionFileTypes } from "../_shared/types/file_manager.types.ts";
import { logger } from "../_shared/logger.ts";
import { downloadFromStorage, deleteFromStorage, uploadToStorage } from "../_shared/supabase_storage_utils.ts";
import { constructStoragePath } from "../_shared/utils/path_constructor.ts";
import { assembleChunks } from "../_shared/utils/assembleChunks/assembleChunks.provides.ts";
import { FileManagerService } from "../_shared/services/file_manager.ts";
import { NotificationService } from "../_shared/utils/notification.service.ts";
import { renderDocument } from "../_shared/services/document_renderer/renderDocument/renderDocument.ts";
import { assembleContributionChain } from "../_shared/services/document_renderer/assembleContributionChain/assembleContributionChain.provides.ts";
import { loadDocumentTemplate } from "../_shared/services/document_renderer/loadDocumentTemplate/loadDocumentTemplate.provides.ts";
import { mergeChunkContent } from "../_shared/services/document_renderer/mergeChunkContent/mergeChunkContent.provides.ts";
import { shouldEnqueueRenderJob } from "../_shared/utils/shouldEnqueueRenderJob.ts";
import { resolveTemplateFilename, type BoundResolveTemplateFilenameFn } from "../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.provides.ts";
import { processRenderJob } from "./processRenderJob.ts";
import { enqueueRenderJob } from "./enqueueRenderJob/enqueueRenderJob.ts";
import type { EnqueueRenderJobDeps, EnqueueRenderJobParams } from "./enqueueRenderJob/enqueueRenderJob.interface.ts";
import { isJson } from "../_shared/utils/type-guards/type_guards.common.ts";
import type { IRenderJobContext } from "./createJobContext/JobContext.interface.ts";
import {
  buildEnqueueRenderCompressedContextPayload,
  buildEnqueueRenderJobPayload,
  invalidateDialecticRenderCompressedContextJobPayload,
} from "./enqueueRenderJob/enqueueRenderJob.mock.ts";
import {
  initializeTestDeps,
  initializeSupabaseAdminClient,
  coreInitializeTestStep,
  coreCleanupTestResources,
  coreUpsertTestProviders,
  registerUndoAction,
} from "../_shared/_integration.test.utils.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toArrayBuffer(content: string): ArrayBuffer {
  const encoded: Uint8Array = new TextEncoder().encode(content);
  const buffer: ArrayBuffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

/**
 * Inserts a parent job row into dialectic_generation_jobs so that enqueueRenderJob's
 * `parent_job_id` foreign key constraint is satisfied. In production, the parent
 * (EXECUTE or COMPRESS) job already exists before enqueueRenderJob is called.
 */
async function insertParentJob(
  admin: SupabaseClient<Database>,
  jobId: string,
  env: { testSessionId: string; stageSlug: DialecticStageSlug; testIterationNumber: number; primaryUserId: string },
): Promise<void> {
  const { error: parentErr } = await admin
    .from("dialectic_generation_jobs")
    .insert({
      id: jobId,
      job_type: "EXECUTE",
      session_id: env.testSessionId,
      stage_slug: env.stageSlug,
      iteration_number: env.testIterationNumber,
      status: "completed",
      user_id: env.primaryUserId,
      is_test_job: true,
      payload: {},
      idempotency_key: `parent-${jobId}`,
    });
  if (parentErr) throw new Error(`Failed to insert parent job: ${parentErr.message}`);
  registerUndoAction({
    type: "DELETE_CREATED_ROW",
    tableName: "dialectic_generation_jobs",
    criteria: { id: jobId },
    scope: "local",
  });
}

/**
 * Bootstraps a full render-test environment against the real DB:
 * user, wallet, AI provider, project, session, and a real IRenderJobContext.
 * Uses the existing seed data's recipe chain (Thesis stage → recipe instance →
 * recipe steps → document templates) as-is — does not create or modify recipe data.
 *
 * Returns every ID and object the test cases need.
 */
interface RenderTestEnv {
  admin: SupabaseClient<Database>;
  primaryUserId: string;
  primaryUserJwt: string;
  testProjectId: string;
  testSessionId: string;
  testIterationNumber: number;
  testWalletId: string;
  providerRowId: string;
  storageBucket: string;
  renderCtx: IRenderJobContext;
  enqueueDeps: EnqueueRenderJobDeps;
  stageSlug: DialecticStageSlug;
  documentKey: FileType;
  outputType: ModelContributionFileTypes;
  output_type: ModelContributionFileTypes;
}

async function setupRenderTestEnv(): Promise<RenderTestEnv> {
  initializeTestDeps();
  const adminClient: SupabaseClient<Database> = initializeSupabaseAdminClient();

  const { primaryUserId, primaryUserJwt, adminClient: admin } =
    await coreInitializeTestStep({ initialWalletBalance: 100_000 }, "local");

  await coreUpsertTestProviders(admin, "local");

  // Wallet
  const { data: walletRow, error: walletQueryErr } = await admin
    .from("token_wallets")
    .select("wallet_id")
    .eq("user_id", primaryUserId)
    .is("organization_id", null)
    .single();
  if (walletQueryErr || !walletRow) {
    throw new Error(`Could not find token wallet for test user ${primaryUserId}`);
  }
  const testWalletId: string = walletRow.wallet_id;

  // AI provider
  const { data: providerRow, error: providerErr } = await admin
    .from("ai_providers")
    .select("id")
    .eq("api_identifier", "openai-gpt-4o")
    .single();
  if (providerErr || !providerRow) {
    throw new Error("No active AI provider 'openai-gpt-4o' — run coreUpsertTestProviders first.");
  }
  const providerRowId: string = providerRow.id;

  // Thesis stage — use the existing seed data's recipe instance and steps.
  // The migration 20251006194531_thesis_stage.sql seeds:
  //   - dialectic_stages row for 'thesis' with active_recipe_instance_id
  //   - dialectic_stage_recipe_instances row (is_cloned: true)
  //   - dialectic_stage_recipe_steps rows including 'business_case' step with
  //     outputs_required.files_to_generate: [{ template_filename: "thesis_business_case.md", from_document_key: "business_case" }]
  //   - dialectic_document_templates row 'thesis_business_case' in the 'Software Development' domain
  // The test reads and uses this canonical chain as-is — it does not create or modify recipe data.
  const { data: stage, error: stageErr } = await admin
    .from("dialectic_stages")
    .select("*")
    .eq("slug", DialecticStageSlug.Thesis)
    .single();
  if (stageErr || !stage) {
    throw new Error("Thesis stage not found in the database.");
  }
  if (!stage.active_recipe_instance_id) {
    throw new Error("Thesis stage has no active_recipe_instance_id — seed the DB first.");
  }

  // Domain — use 'Software Development', the domain the Thesis recipe chain is seeded against.
  // loadDocumentTemplate queries by (name, domain_id, is_active), so the project's selected_domain_id
  // must match the domain of the seeded 'thesis_business_case' document template.
  const { data: domainRow, error: domainErr } = await admin
    .from("dialectic_domains")
    .select("id")
    .eq("name", "Software Development")
    .single();
  if (domainErr || !domainRow) {
    throw new Error("'Software Development' domain not found — seed the DB first.");
  }
  const domainId: string = domainRow.id;

  // Process template — look up via domain_process_associations for this domain
  const { data: domainAssoc, error: assocErr } = await admin
    .from("domain_process_associations")
    .select("process_template_id")
    .eq("domain_id", domainId)
    .limit(1)
    .single();
  if (assocErr || !domainAssoc) {
    throw new Error(`No domain_process_associations found for 'Software Development' — seed the DB first.`);
  }
  const processTemplateId: string = domainAssoc.process_template_id;

  // Project + session
  const testProjectId = crypto.randomUUID();
  const testSessionId = crypto.randomUUID();
  const testIterationNumber = 1;

  const { error: projectErr } = await admin
    .from("dialectic_projects")
    .insert({
      id: testProjectId,
      user_id: primaryUserId,
      project_name: "Render Integration Test Project",
      initial_user_prompt: "Initial prompt for render integration testing.",
      selected_domain_id: domainId,
      status: "active",
      process_template_id: processTemplateId,
    });
  if (projectErr) throw new Error(`Failed to create test project: ${projectErr.message}`);
  registerUndoAction({
    type: "DELETE_CREATED_ROW",
    tableName: "dialectic_projects",
    criteria: { id: testProjectId },
    scope: "local",
  });

  const { error: sessionErr } = await admin
    .from("dialectic_sessions")
    .insert({
      id: testSessionId,
      project_id: testProjectId,
      session_description: "Render integration test session",
      iteration_count: testIterationNumber,
      selected_model_ids: [providerRowId],
      status: "in-progress",
      current_stage_id: stage.id,
    });
  if (sessionErr) throw new Error(`Failed to create test session: ${sessionErr.message}`);
  registerUndoAction({
    type: "DELETE_CREATED_ROW",
    tableName: "dialectic_sessions",
    criteria: { id: testSessionId },
    scope: "local",
  });

  // Build real IRenderJobContext
  const storageBucket: string =
    Deno.env.get("SB_CONTENT_STORAGE_BUCKET") ?? "dialectic-contributions";

  const fileManager = new FileManagerService(admin, { constructStoragePath, logger, assembleChunks });
  const notificationService = new NotificationService(admin);
  const documentRenderer = { renderDocument };

  const renderCtx: IRenderJobContext = {
    logger,
    fileManager,
    downloadFromStorage,
    deleteFromStorage,
    notificationService,
    documentRenderer,
    assembleContributionChain,
    loadDocumentTemplate,
    mergeChunkContent,
  };

  // Build real enqueueRenderJob deps
  const boundResolveTemplateFilename: BoundResolveTemplateFilenameFn = (params, payload) =>
    resolveTemplateFilename({}, params, payload);
  const enqueueDeps: EnqueueRenderJobDeps = {
    dbClient: admin,
    logger,
    shouldEnqueueRenderJob,
    resolveTemplateFilename: boundResolveTemplateFilename,
  };

  return {
    admin,
    primaryUserId,
    primaryUserJwt,
    testProjectId,
    testSessionId,
    testIterationNumber,
    testWalletId,
    providerRowId,
    storageBucket,
    renderCtx,
    enqueueDeps,
    stageSlug: DialecticStageSlug.Thesis,
    documentKey: FileType.business_case,
    outputType: FileType.business_case,
    output_type: FileType.technical_approach,
  };
}

/**
 * Uploads a raw JSON contribution and inserts a dialectic_contributions row for it.
 * Returns the contribution ID and document identity.
 */
async function arrangeContribution(
  env: RenderTestEnv,
  documentIdentity: string,
): Promise<{ contributionId: string; rawJsonContent: string }> {
  const modelSlug = "test-model";
  const attemptCount = 0;

  const contribPath = constructStoragePath({
    projectId: env.testProjectId,
    fileType: FileType.ModelContributionRawJson,
    sessionId: env.testSessionId,
    iteration: env.testIterationNumber,
    stageSlug: env.stageSlug,
    modelSlug,
    attemptCount,
    documentKey: env.documentKey,
  });

  const fullContribPath = `${contribPath.storagePath}/${contribPath.fileName}`;
  const rawJsonContent = JSON.stringify({
    executive_summary: "Test executive summary for contribution arm.",
    market_opportunity: "Test market opportunity for contribution arm.",
  });
  const contribBuffer = toArrayBuffer(rawJsonContent);

  const contribUpload = await uploadToStorage(
    env.admin,
    env.storageBucket,
    fullContribPath,
    contribBuffer,
    { contentType: "application/json", upsert: true },
  );
  if (contribUpload.error) {
    throw new Error(`Contribution upload failed: ${contribUpload.error.message}`);
  }
  registerUndoAction({
    type: "DELETE_STORAGE_OBJECT",
    bucketName: env.storageBucket,
    path: fullContribPath,
    scope: "local",
  });

  const contributionId = crypto.randomUUID();
  const { error: contribErr } = await env.admin
    .from("dialectic_contributions")
    .insert({
      id: contributionId,
      session_id: env.testSessionId,
      iteration_number: env.testIterationNumber,
      stage: "THESIS",
      model_id: env.providerRowId,
      model_name: "Test Model",
      storage_bucket: env.storageBucket,
      storage_path: contribPath.storagePath,
      file_name: contribPath.fileName,
      raw_response_storage_path: fullContribPath,
      mime_type: "application/json",
      document_relationships: { [env.stageSlug]: documentIdentity },
      edit_version: 1,
      is_latest_edit: true,
      is_header: false,
      target_contribution_id: null,
      user_id: env.primaryUserId,
    });
  if (contribErr) throw new Error(`Failed to insert contribution: ${contribErr.message}`);
  registerUndoAction({
    type: "DELETE_CREATED_ROW",
    tableName: "dialectic_contributions",
    criteria: { id: contributionId },
    scope: "local",
  });

  return { contributionId, rawJsonContent };
}

/**
 * Uploads a compressed-context raw JSON and inserts a dialectic_project_resources row for it.
 */
async function arrangeCompressedContext(env: RenderTestEnv): Promise<void> {
  const compressedPath = constructStoragePath({
    projectId: env.testProjectId,
    fileType: FileType.CompressedContextRawJson,
    sessionId: env.testSessionId,
    iteration: env.testIterationNumber,
    stageSlug: env.stageSlug,
    output_type: env.output_type,
    sourceType: "contribution",
    documentKey: env.documentKey,
  });

  const fullCompressedPath = `${compressedPath.storagePath}/${compressedPath.fileName}`;
  const compressedJsonContent = JSON.stringify({
    executive_summary: "Compressed executive summary.",
    market_opportunity: "Compressed market opportunity.",
  });
  const compressedBuffer = toArrayBuffer(compressedJsonContent);

  const compressedUpload = await uploadToStorage(
    env.admin,
    env.storageBucket,
    fullCompressedPath,
    compressedBuffer,
    { contentType: "application/json", upsert: true },
  );
  if (compressedUpload.error) {
    throw new Error(`Compressed context upload failed: ${compressedUpload.error.message}`);
  }
  registerUndoAction({
    type: "DELETE_STORAGE_OBJECT",
    bucketName: env.storageBucket,
    path: fullCompressedPath,
    scope: "local",
  });

  const resourceId = crypto.randomUUID();
  const { error: resErr } = await env.admin
    .from("dialectic_project_resources")
    .insert({
      id: resourceId,
      project_id: env.testProjectId,
      session_id: env.testSessionId,
      iteration_number: env.testIterationNumber,
      stage_slug: env.stageSlug,
      resource_type: "compressed_context_raw_json",
      storage_bucket: env.storageBucket,
      storage_path: compressedPath.storagePath,
      file_name: compressedPath.fileName,
      mime_type: "application/json",
      size_bytes: compressedBuffer.byteLength,
      user_id: env.primaryUserId,
    });
  if (resErr) throw new Error(`Failed to insert compressed context resource: ${resErr.message}`);
  registerUndoAction({
    type: "DELETE_CREATED_ROW",
    tableName: "dialectic_project_resources",
    criteria: { id: resourceId },
    scope: "local",
  });
}

// ---------------------------------------------------------------------------
// TEST 1 — Compressed + Contribution Dispatch
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration (real DB): compressed and contribution RENDER rows route to their own arms, complete, and observe their notification policies",
  ignore: !Deno.env.get("SUPABASE_URL"),
  fn: async () => {
    /**
     * Contract: given a compressed source and a contribution source dispatched through
     *   enqueueRenderJob, each inserted row routes to its own arm through processRenderJob —
     *   the compressed row completes through processCompressedRenderJob with no notification,
     *   and the contribution row completes with render_started and render_chunk_completed
     *   notification rows present. Both arms are arranged in the same test so neither
     *   assertion can hold if the selection were deleted — the compressed guard would
     *   route both rows to the compressed arm.
     * Arrange: a real recipe chain with a cloned step whose outputs_required.files_to_generate
     *   targets thesis_business_case.md; a document template row + file in storage; a
     *   contribution row with raw JSON in storage for the contribution arm; a compressed
     *   context raw JSON + project_resource row for the compressed arm; a real
     *   IRenderJobContext with FileManagerService, NotificationService, and the real
     *   document renderer.
     * Act:     enqueueRenderJob for both a compressed payload and a contribution payload;
     *   read each inserted row back from dialectic_generation_jobs; call processRenderJob
     *   on each row.
     * Assert:  the compressed row reaches status 'completed' and has no notification rows;
     *   the contribution row reaches status 'completed' and has render_started and
     *   render_chunk_completed notification rows in the notifications table.
     * Boundary: enqueueRenderJob → dialectic_generation_jobs row → row read back →
     *   processRenderJob → renderDocument → rendered artifact + notification rows.
     *   Every function in that chain runs real: both payload guards,
     *   isCompressedRenderPayloadShape, isEnqueueRenderCompressedContextPayload,
     *   shouldEnqueueRenderJob, resolveTemplateFilename, the document renderer, and
     *   sendJobNotificationEvent.
     * Mocked: nothing. The suite runs against the local Supabase stack through
     *   _shared/_integration.test.utils.ts.
     */

    // Arrange
    let env: RenderTestEnv;
    try {
      env = await setupRenderTestEnv();
      // Compressed context: raw JSON + project_resource row
      await arrangeCompressedContext(env);

      // Contribution: raw JSON + dialectic_contributions row
      const documentIdentity = crypto.randomUUID();
      const { contributionId } = await arrangeContribution(env, documentIdentity);

      // --- Compressed dispatch ---
      const compressedParams: EnqueueRenderJobParams = {
        jobId: crypto.randomUUID(),
        sessionId: env.testSessionId,
        stageSlug: env.stageSlug,
        iterationNumber: env.testIterationNumber,
        outputType: env.outputType,
        projectId: env.testProjectId,
        projectOwnerUserId: env.primaryUserId,
        userAuthToken: env.primaryUserJwt,
        modelId: env.providerRowId,
        walletId: env.testWalletId,
        isTestJob: true,
      };
      const compressedPayload = buildEnqueueRenderCompressedContextPayload({
        sourceType: "contribution",
        documentKey: env.documentKey,
        docType: env.outputType,
        sourceStageSlug: env.stageSlug,
        output_type: env.output_type,
      });

      // --- Contribution dispatch ---
      const contributionParams: EnqueueRenderJobParams = {
        jobId: crypto.randomUUID(),
        sessionId: env.testSessionId,
        stageSlug: env.stageSlug,
        iterationNumber: env.testIterationNumber,
        outputType: env.outputType,
        projectId: env.testProjectId,
        projectOwnerUserId: env.primaryUserId,
        userAuthToken: env.primaryUserJwt,
        modelId: env.providerRowId,
        walletId: env.testWalletId,
        isTestJob: true,
      };
      const contributionPayload = buildEnqueueRenderJobPayload({
        contributionId,
        needsContinuation: false,
        documentKey: env.documentKey,
        stageRelationshipForStage: documentIdentity,
        fileType: env.outputType,
        storageFileType: FileType.ModelContributionRawJson,
      });

      // Act — insert parent jobs to satisfy the parent_job_id foreign key constraint
      await insertParentJob(env.admin, compressedParams.jobId, env);
      await insertParentJob(env.admin, contributionParams.jobId, env);

      const compressedResult = await enqueueRenderJob(env.enqueueDeps, compressedParams, compressedPayload);
      if ("error" in compressedResult) {
        throw new Error(`Compressed enqueueRenderJob failed: ${compressedResult.error.message}`);
      }
      assertExists(compressedResult.renderJobId, "Compressed enqueueRenderJob should return a renderJobId");
      const compressedRenderJobId: string = compressedResult.renderJobId!;

      const contributionResult = await enqueueRenderJob(env.enqueueDeps, contributionParams, contributionPayload);
      if ("error" in contributionResult) {
        throw new Error(`Contribution enqueueRenderJob failed: ${contributionResult.error.message}`);
      }
      assertExists(contributionResult.renderJobId, "Contribution enqueueRenderJob should return a renderJobId");
      const contributionRenderJobId: string = contributionResult.renderJobId!;

      // Read both rows back from the database
      const { data: compressedJobRow, error: compressedReadErr } = await env.admin
        .from("dialectic_generation_jobs")
        .select("*")
        .eq("id", compressedRenderJobId)
        .single();
      if (compressedReadErr || !compressedJobRow) {
        throw new Error(`Failed to read compressed job row: ${compressedReadErr?.message}`);
      }

      const { data: contributionJobRow, error: contributionReadErr } = await env.admin
        .from("dialectic_generation_jobs")
        .select("*")
        .eq("id", contributionRenderJobId)
        .single();
      if (contributionReadErr || !contributionJobRow) {
        throw new Error(`Failed to read contribution job row: ${contributionReadErr?.message}`);
      }

      // Drive processRenderJob over each row
      await processRenderJob(
        env.admin,
        compressedJobRow,
        env.primaryUserId,
        env.renderCtx,
        env.primaryUserJwt,
      );

      await processRenderJob(
        env.admin,
        contributionJobRow,
        env.primaryUserId,
        env.renderCtx,
        env.primaryUserJwt,
      );

      // Assert — compressed row
      const { data: compressedFinal } = await env.admin
        .from("dialectic_generation_jobs")
        .select("status, results")
        .eq("id", compressedRenderJobId)
        .single();
      assertEquals(compressedFinal?.status, "completed", "Compressed row should reach 'completed'");

      const { data: compressedNotifications } = await env.admin
        .from("notifications")
        .select("id")
        .eq("user_id", env.primaryUserId)
        .contains("data", { job_id: compressedRenderJobId });
      assertEquals(
        (compressedNotifications ?? []).length,
        0,
        "Compressed row should have no notification rows",
      );

      // Assert — contribution row
      const { data: contributionFinal } = await env.admin
        .from("dialectic_generation_jobs")
        .select("status, results")
        .eq("id", contributionRenderJobId)
        .single();
      assertEquals(contributionFinal?.status, "completed", "Contribution row should reach 'completed'");

      const { data: renderStartedNotifications } = await env.admin
        .from("notifications")
        .select("id, type, data")
        .eq("user_id", env.primaryUserId)
        .eq("type", "render_started")
        .contains("data", { job_id: contributionRenderJobId });
      assert(
        (renderStartedNotifications ?? []).length >= 1,
        "Contribution row should have at least one render_started notification",
      );

      const { data: renderChunkNotifications } = await env.admin
        .from("notifications")
        .select("id, type, data")
        .eq("user_id", env.primaryUserId)
        .eq("type", "render_chunk_completed")
        .contains("data", { job_id: contributionRenderJobId });
      assert(
        (renderChunkNotifications ?? []).length >= 1,
        "Contribution row should have at least one render_chunk_completed notification",
      );

      console.log(
        `[integration] PASS: compressed row ${compressedRenderJobId} completed with no notifications; ` +
        `contribution row ${contributionRenderJobId} completed with render_started + render_chunk_completed`,
      );
    } finally {
      await coreCleanupTestResources();
    }
  },
});

// ---------------------------------------------------------------------------
// TEST 2 — Corrupted Compressed Payload
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration (real DB): a compressed RENDER row with a corrupted payload is marked failed with the guard's diagnostic, sends no notification, and raises nothing",
  ignore: !Deno.env.get("SUPABASE_URL"),
  fn: async () => {
    /**
     * Contract: given a compressed RENDER row whose stored payload jsonb carries one
     *   member corrupted through invalidateDialecticRenderCompressedContextJobPayload,
     *   processRenderJob marks the row 'failed' with that member's own diagnostic in
     *   error_details, sends no notification, and raises nothing out of the function.
     *   The corruption is real untrusted data read back from a real jsonb column.
     * Arrange: a real recipe chain and IRenderJobContext; a dialectic_generation_jobs
     *   row inserted directly with a payload from
     *   invalidateDialecticRenderCompressedContextJobPayload({ template_filename: 123 }),
     *   which carries output_type and sourceType (so isCompressedRenderPayloadShape selects
     *   the compressed arm) but corrupts template_filename to a number (so
     *   isDialecticRenderCompressedContextJobPayload throws "Missing or invalid
     *   template_filename.").
     * Act:     call processRenderJob on the row.
     * Assert:  the row status is 'failed'; error_details contains "template_filename";
     *   no notification row exists for that job_id; the function did not throw.
     * Boundary: a stored dialectic_generation_jobs row → processRenderJob → the
     *   compressed arm's narrowing guard → the catch's failed-status write. The row is
     *   the row a corrupted producer would have written, read back out of the database.
     * Mocked: nothing. The suite runs against the local Supabase stack.
     */

    // Arrange
    let env: RenderTestEnv;
    try {
      env = await setupRenderTestEnv();
      const corruptedPayload = invalidateDialecticRenderCompressedContextJobPayload({
        template_filename: 123,
      });

      const jobId = crypto.randomUUID();
      if (!isJson(corruptedPayload)) {
        throw new Error("Test setup failed: corrupted payload is not valid JSON");
      }
      const { error: insertErr } = await env.admin
        .from("dialectic_generation_jobs")
        .insert({
          id: jobId,
          job_type: "RENDER",
          session_id: env.testSessionId,
          stage_slug: env.stageSlug,
          iteration_number: env.testIterationNumber,
          payload: corruptedPayload,
          is_test_job: true,
          status: "processing",
          user_id: env.primaryUserId,
          idempotency_key: `corrupted-${jobId}`,
        });
      if (insertErr) throw new Error(`Failed to insert corrupted job row: ${insertErr.message}`);
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: jobId },
        scope: "local",
      });

      const { data: jobRow, error: readErr } = await env.admin
        .from("dialectic_generation_jobs")
        .select("*")
        .eq("id", jobId)
        .single();
      if (readErr || !jobRow) {
        throw new Error(`Failed to read corrupted job row: ${readErr?.message}`);
      }

      // Act
      await processRenderJob(
        env.admin,
        jobRow,
        env.primaryUserId,
        env.renderCtx,
        env.primaryUserJwt,
      );

      // Assert
      const { data: finalRow } = await env.admin
        .from("dialectic_generation_jobs")
        .select("status, error_details")
        .eq("id", jobId)
        .single();
      assertEquals(finalRow?.status, "failed", "Corrupted compressed row should be 'failed'");

      const errorDetailsStr = typeof finalRow?.error_details === "string"
        ? finalRow.error_details
        : JSON.stringify(finalRow?.error_details ?? "");
      assert(
        errorDetailsStr.includes("template_filename"),
        `error_details should contain "template_filename", got: ${errorDetailsStr}`,
      );

      const { data: notifications } = await env.admin
        .from("notifications")
        .select("id")
        .eq("user_id", env.primaryUserId)
        .contains("data", { job_id: jobId });
      assertEquals(
        (notifications ?? []).length,
        0,
        "Corrupted compressed row should have no notification rows",
      );

      console.log(`[integration] PASS: corrupted compressed row ${jobId} marked failed with diagnostic, no notification, no throw`);
    } finally {
      await coreCleanupTestResources();
    }
  },
});

// ---------------------------------------------------------------------------
// TEST 3 — is_json Skip
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration (real DB): an is_json docType skips RENDER job insertion entirely and returns renderJobId null",
  ignore: !Deno.env.get("SUPABASE_URL"),
  fn: async () => {
    /**
     * Contract: given a compressed source whose docType makes the real shouldEnqueueRenderJob
     *   answer 'is_json', enqueueRenderJob inserts no row and returns renderJobId: null.
     *   The decision is made by the real function over real data, never handed to it.
     * Arrange: a real recipe chain whose cloned step has outputs_required.files_to_generate
     *   targeting business_case (a markdown document key). A compressed payload with
     *   docType = FileType.ModelContributionRawJson, which is not in the recipe's markdown
     *   document keys set, so shouldEnqueueRenderJob returns { shouldRender: false, reason:
     *   'is_json' }.
     * Act:     call enqueueRenderJob with the is_json compressed payload.
     * Assert:  the return is { renderJobId: null }; no row exists in
     *   dialectic_generation_jobs with the idempotency_key that would have been constructed.
     * Boundary: enqueueRenderJob → shouldEnqueueRenderJob (real) → the is_json skip return.
     *   The decision is made by the real function querying real recipe data.
     * Mocked: nothing. The suite runs against the local Supabase stack.
     */

    // Arrange
    let env: RenderTestEnv;
    try {
      env = await setupRenderTestEnv();
      const compressedParams: EnqueueRenderJobParams = {
        jobId: crypto.randomUUID(),
        sessionId: env.testSessionId,
        stageSlug: env.stageSlug,
        iterationNumber: env.testIterationNumber,
        outputType: FileType.ModelContributionRawJson,
        projectId: env.testProjectId,
        projectOwnerUserId: env.primaryUserId,
        userAuthToken: env.primaryUserJwt,
        modelId: env.providerRowId,
        walletId: env.testWalletId,
        isTestJob: true,
      };
      const compressedPayload = buildEnqueueRenderCompressedContextPayload({
        sourceType: "contribution",
        documentKey: env.documentKey,
        docType: FileType.ModelContributionRawJson,
        sourceStageSlug: env.stageSlug,
        output_type: env.output_type,
      });

      // Act
      const result = await enqueueRenderJob(env.enqueueDeps, compressedParams, compressedPayload);

      // Assert
      assert(!("error" in result), "is_json skip should not return an error");
      assertEquals(result.renderJobId, null, "is_json docType should return renderJobId: null");

      // Verify no row was inserted for this session/stage/iteration with a RENDER job_type
      const { data: renderJobs } = await env.admin
        .from("dialectic_generation_jobs")
        .select("id")
        .eq("session_id", env.testSessionId)
        .eq("stage_slug", env.stageSlug)
        .eq("iteration_number", env.testIterationNumber)
        .eq("job_type", "RENDER");
      assertEquals(
        (renderJobs ?? []).length,
        0,
        "No RENDER row should be inserted for an is_json docType",
      );

      console.log(`[integration] PASS: is_json docType returned renderJobId: null with no row inserted`);
    } finally {
      await coreCleanupTestResources();
    }
  },
});

// ---------------------------------------------------------------------------
// TEST 4 — 23505 Idempotency Conflict
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration (real DB): a 23505 idempotency conflict returns the existing renderJobId and the recovered row still routes to its arm through processRenderJob",
  ignore: !Deno.env.get("SUPABASE_URL"),
  fn: async () => {
    /**
     * Contract: given two dispatches with the same identity, the second insert raises a
     *   genuine 23505 on the idempotency_key unique constraint, the recovery returns the
     *   existing renderJobId, and the recovered row still routes to its own arm through
     *   processRenderJob.
     * Arrange: a real recipe chain and IRenderJobContext; a compressed context raw JSON +
     *   project_resource row. Both dispatches use identical compressed params and payload,
     *   so the idempotency_key constructed by enqueueRenderJob is the same for both.
     * Act:     call enqueueRenderJob twice with the same compressed params and payload.
     *   Then read the recovered row back and call processRenderJob on it.
     * Assert:  the first call returns a non-null renderJobId; the second call returns the
     *   same renderJobId (not an error); the recovered row routes to the compressed arm
     *   through processRenderJob and reaches 'completed'.
     * Boundary: enqueueRenderJob → dialectic_generation_jobs insert → 23505 on
     *   idempotency_key → recovery select → processRenderJob → renderDocument compressed
     *   arm. The 23505 is a genuine database constraint violation, and the recovery is the
     *   real code path.
     * Mocked: nothing. The suite runs against the local Supabase stack.
     */

    // Arrange
    let env: RenderTestEnv;
    try {
      env = await setupRenderTestEnv();
      await arrangeCompressedContext(env);

      const sharedParams: EnqueueRenderJobParams = {
        jobId: crypto.randomUUID(),
        sessionId: env.testSessionId,
        stageSlug: env.stageSlug,
        iterationNumber: env.testIterationNumber,
        outputType: env.outputType,
        projectId: env.testProjectId,
        projectOwnerUserId: env.primaryUserId,
        userAuthToken: env.primaryUserJwt,
        modelId: env.providerRowId,
        walletId: env.testWalletId,
        isTestJob: true,
      };
      const sharedPayload = buildEnqueueRenderCompressedContextPayload({
        sourceType: "contribution",
        documentKey: env.documentKey,
        docType: env.outputType,
        sourceStageSlug: env.stageSlug,
        output_type: env.output_type,
      });

      // Act — insert parent job to satisfy the parent_job_id foreign key constraint
      await insertParentJob(env.admin, sharedParams.jobId, env);

      // Act — first dispatch
      const firstResult = await enqueueRenderJob(env.enqueueDeps, sharedParams, sharedPayload);
      if ("error" in firstResult) {
        throw new Error(`First enqueueRenderJob failed: ${firstResult.error.message}`);
      }
      assertExists(firstResult.renderJobId, "First dispatch should return a renderJobId");
      const firstRenderJobId: string = firstResult.renderJobId!;

      // Act — second dispatch with identical params and payload (same idempotency_key)
      const secondResult = await enqueueRenderJob(env.enqueueDeps, sharedParams, sharedPayload);
      if ("error" in secondResult) {
        throw new Error(
          `Second enqueueRenderJob should recover from 23505, not return error: ${secondResult.error.message}`,
        );
      }
      assertExists(secondResult.renderJobId, "Second dispatch should return the existing renderJobId");
      const secondRenderJobId: string = secondResult.renderJobId!;

      // Assert — 23505 recovery returned the same renderJobId
      assertEquals(
        secondRenderJobId,
        firstRenderJobId,
        "23505 recovery should return the existing renderJobId",
      );

      // Assert — the recovered row still routes to its arm through processRenderJob
      const { data: jobRow, error: readErr } = await env.admin
        .from("dialectic_generation_jobs")
        .select("*")
        .eq("id", firstRenderJobId)
        .single();
      if (readErr || !jobRow) {
        throw new Error(`Failed to read recovered job row: ${readErr?.message}`);
      }

      await processRenderJob(
        env.admin,
        jobRow,
        env.primaryUserId,
        env.renderCtx,
        env.primaryUserJwt,
      );

      const { data: finalRow } = await env.admin
        .from("dialectic_generation_jobs")
        .select("status")
        .eq("id", firstRenderJobId)
        .single();
      assertEquals(
        finalRow?.status,
        "completed",
        "Recovered row should route to the compressed arm and reach 'completed'",
      );

      console.log(
        `[integration] PASS: 23505 recovery returned existing renderJobId ${firstRenderJobId}; ` +
        `recovered row routed to compressed arm and completed`,
      );
    } finally {
      await coreCleanupTestResources();
    }
  },
});
