import { assert, assertEquals, assertExists, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../types_db.ts";
import { FileType, DialecticStageSlug } from "../../types/file_manager.types.ts";
import { FileManagerService } from "../../services/file_manager.ts";
import { constructStoragePath } from "../path_constructor.ts";
import { assembleChunks } from "../assembleChunks/assembleChunks.provides.ts";
import { logger } from "../../logger.ts";
import { buildUploadContext } from "./buildUploadContext.ts";
import {
  buildBuildUploadContextParams,
  buildBuildUploadContextResourceParams,
} from "./buildUploadContext.mock.ts";
import { isBuildUploadContextParams, isBuildUploadContextResourceParams } from "./buildUploadContext.guards.ts";
import {
  initializeTestDeps,
  initializeSupabaseAdminClient,
  coreInitializeTestStep,
  coreCleanupTestResources,
  coreUpsertTestProviders,
  registerUndoAction,
} from "../../_integration.test.utils.ts";

interface IntegrationTestEnv {
  admin: SupabaseClient<Database>;
  primaryUserId: string;
  testProjectId: string;
  testSessionId: string;
  testIterationNumber: number;
  providerRowId: string;
  promptRowId: string;
  fileManager: FileManagerService;
}

async function setupIntegrationTestEnv(): Promise<IntegrationTestEnv> {
  initializeTestDeps();
  const admin = initializeSupabaseAdminClient();

  const { primaryUserId } = await coreInitializeTestStep(
    { initialWalletBalance: 100_000 },
    "local",
  );

  await coreUpsertTestProviders(admin, "local");

  const { data: providerRow, error: providerErr } = await admin
    .from("ai_providers")
    .select("id")
    .eq("api_identifier", "openai-gpt-4o")
    .single();
  if (providerErr || !providerRow) {
    throw new Error("No active AI provider 'openai-gpt-4o' — run coreUpsertTestProviders first.");
  }
  const providerRowId = providerRow.id;

  const { data: stage, error: stageErr } = await admin
    .from("dialectic_stages")
    .select("id")
    .eq("slug", DialecticStageSlug.Thesis)
    .single();
  if (stageErr || !stage) {
    throw new Error("Thesis stage not found in the database.");
  }

  const { data: domain, error: domainErr } = await admin
    .from("dialectic_domains")
    .select("id")
    .limit(1)
    .single();
  if (domainErr || !domain) {
    throw new Error("No dialectic_domains row found — seed the DB first.");
  }

  const testProjectId = crypto.randomUUID();
  const testSessionId = crypto.randomUUID();
  const testIterationNumber = 1;
  const storageBucket = Deno.env.get("SB_CONTENT_STORAGE_BUCKET") ?? "dialectic-contributions";

  const { error: projectErr } = await admin
    .from("dialectic_projects")
    .insert({
      id: testProjectId,
      user_id: primaryUserId,
      project_name: "buildUploadContext integration test project",
      initial_user_prompt: "Integration test project for buildUploadContext provenance.",
      selected_domain_id: domain.id,
      status: "active",
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
      session_description: "buildUploadContext integration test session",
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

  const promptRowId = crypto.randomUUID();
  const { error: promptErr } = await admin
    .from("dialectic_project_resources")
    .insert({
      id: promptRowId,
      project_id: testProjectId,
      session_id: testSessionId,
      iteration_number: testIterationNumber,
      stage_slug: DialecticStageSlug.Thesis,
      resource_type: FileType.CompressionPrompt,
      storage_bucket: storageBucket,
      storage_path: `build-upload-context-test/${crypto.randomUUID()}`,
      file_name: "compression_prompt.json",
      mime_type: "application/json",
      size_bytes: 0,
      user_id: primaryUserId,
    });
  if (promptErr) throw new Error(`Failed to insert compression prompt resource: ${promptErr.message}`);
  registerUndoAction({
    type: "DELETE_CREATED_ROW",
    tableName: "dialectic_project_resources",
    criteria: { id: promptRowId },
    scope: "local",
  });

  const fileManager = new FileManagerService(admin, { constructStoragePath, logger, assembleChunks });

  return {
    admin,
    primaryUserId,
    testProjectId,
    testSessionId,
    testIterationNumber,
    providerRowId,
    promptRowId,
    fileManager,
  };
}

Deno.test({
  name: "buildUploadContext integration: sourcePromptResourceId reaches both artifact tables through file_manager",
  ignore: !Deno.env.get("SUPABASE_URL"),
  fn: async (t) => {
    /**
     * Contract: given a real CompressionPrompt resource row, buildUploadContext carries its
     *   id through file_manager.uploadAndRegisterFile to the source_prompt_resource_id column
     *   on both dialectic_project_resources and dialectic_contributions. An undefined member
     *   reaches the resource table as null.
     * Arrange: a real user, project, session, AI provider, and CompressionPrompt row in the
     *   real DB; a real FileManagerService with constructStoragePath and assembleChunks.
     * Act:     buildUploadContext for each arm, pass the result to uploadAndRegisterFile, and
     *   select the written row back.
     * Assert:  the resource row's source_prompt_resource_id equals the prompt row id and is not
     *   the artifact row's own id; the contribution row's source_prompt_resource_id equals the
     *   same prompt row id and is not the contribution row's own id; the undefined resource arm
     *   persists a null.
     * Boundary: buildUploadContext → file_manager.uploadAndRegisterFile → real storage object and
     *   real dialectic_contributions / dialectic_project_resources rows. constructStoragePath and
     *   both params guards run as part of the chain; the migration column + FKs are proven by the
     *   inserts. The test runs against the local Supabase stack through _integration.test.utils.ts.
     * Mocked: nothing.
     */

    let env: IntegrationTestEnv;
    try {
      env = await setupIntegrationTestEnv();

      await t.step("resource arm persists source_prompt_resource_id on dialectic_project_resources", async () => {
        /**
         * Contract: given a real CompressionPrompt row, the resource arm of buildUploadContext
         *   routes sourcePromptResourceId to file_manager and the written resource row's
         *   source_prompt_resource_id equals the prompt row's id and is not the artifact row's
         *   own id.
         * Arrange: real resource params with sourcePromptResourceId = promptRowId, project and
         *   session matching the seeded DB.
         * Act:     isBuildUploadContextResourceParams; buildUploadContext; uploadAndRegisterFile;
         *   select the row back by id.
         * Assert:  upload returns a record, and the selected row has source_prompt_resource_id
         *   equal to promptRowId and not equal to the artifact row's own id.
         * Boundary: buildUploadContext (resource arm) → file_manager.uploadAndRegisterFile →
         *   real dialectic_project_resources row and real storage object.
         * Mocked: nothing.
         */

        // Arrange
        const resourceParams = buildBuildUploadContextResourceParams({
          projectId: env.testProjectId,
          sessionId: env.testSessionId,
          iterationNumber: env.testIterationNumber,
          projectOwnerUserId: env.primaryUserId,
          sourcePromptResourceId: env.promptRowId,
        });

        // Act
        assert(
          isBuildUploadContextResourceParams(resourceParams),
          "builder must produce a valid BuildUploadContextResourceParams value",
        );
        const resourceContext = buildUploadContext(resourceParams);
        const resourceResult = await env.fileManager.uploadAndRegisterFile(resourceContext);

        // Assert
        assertExists(resourceResult.record, "resource upload must return a record");
        if (!("source_prompt_resource_id" in resourceResult.record)) {
          throw new Error("resource record is missing source_prompt_resource_id");
        }
        assertEquals(resourceResult.record.source_prompt_resource_id, env.promptRowId);
        assertNotEquals(resourceResult.record.source_prompt_resource_id, resourceResult.record.id);

        const { data: readBack, error: readBackErr } = await env.admin
          .from("dialectic_project_resources")
          .select("*")
          .eq("id", resourceResult.record.id)
          .single();
        if (readBackErr || !readBack) {
          throw new Error(`Failed to select back resource row: ${readBackErr?.message ?? "no row"}`);
        }
        assertEquals(readBack.source_prompt_resource_id, env.promptRowId);
        assertNotEquals(readBack.source_prompt_resource_id, readBack.id);

        registerUndoAction({
          type: "DELETE_STORAGE_OBJECT",
          bucketName: readBack.storage_bucket,
          path: `${readBack.storage_path}/${readBack.file_name}`,
          scope: "local",
        });
        registerUndoAction({
          type: "DELETE_CREATED_ROW",
          tableName: "dialectic_project_resources",
          criteria: { id: readBack.id },
          scope: "local",
        });
      });

      await t.step("contribution arm persists source_prompt_resource_id on dialectic_contributions", async () => {
        /**
         * Contract: given the same CompressionPrompt row, the contribution arm of buildUploadContext
         *   routes sourcePromptResourceId to file_manager and the written contribution row's
         *   source_prompt_resource_id equals the same prompt row id under the same column name.
         * Arrange: real contribution params with sourcePromptResourceId = promptRowId, using the
         *   same project and session as the resource arm.
         * Act:     isBuildUploadContextParams; buildUploadContext; uploadAndRegisterFile; select
         *   the row back by id.
         * Assert:  the contribution row's source_prompt_resource_id equals promptRowId and is not
         *   the contribution row's own id.
         * Boundary: buildUploadContext (contribution arm) → file_manager.uploadAndRegisterFile →
         *   real dialectic_contributions row and real storage object.
         * Mocked: nothing.
         */

        // Arrange
        const contributionParams = buildBuildUploadContextParams({
          projectId: env.testProjectId,
          sessionId: env.testSessionId,
          iterationNumber: env.testIterationNumber,
          projectOwnerUserId: env.primaryUserId,
          sourcePromptResourceId: env.promptRowId,
          providerDetails: {
            id: env.providerRowId,
            name: "Test Provider",
          },
        });

        // Act
        assert(
          isBuildUploadContextParams(contributionParams),
          "builder must produce a valid BuildUploadContextParams value",
        );
        const contributionContext = buildUploadContext(contributionParams);
        const contributionResult = await env.fileManager.uploadAndRegisterFile(contributionContext);

        // Assert
        assertExists(contributionResult.record, "contribution upload must return a record");
        if (!("source_prompt_resource_id" in contributionResult.record)) {
          throw new Error("contribution record is missing source_prompt_resource_id");
        }
        assertEquals(contributionResult.record.source_prompt_resource_id, env.promptRowId);
        assertNotEquals(contributionResult.record.source_prompt_resource_id, contributionResult.record.id);

        const { data: readBack, error: readBackErr } = await env.admin
          .from("dialectic_contributions")
          .select("*")
          .eq("id", contributionResult.record.id)
          .single();
        if (readBackErr || !readBack) {
          throw new Error(`Failed to select back contribution row: ${readBackErr?.message ?? "no row"}`);
        }
        assertEquals(readBack.source_prompt_resource_id, env.promptRowId);
        assertNotEquals(readBack.source_prompt_resource_id, readBack.id);

        registerUndoAction({
          type: "DELETE_STORAGE_OBJECT",
          bucketName: readBack.storage_bucket,
          path: `${readBack.storage_path}/${readBack.file_name}`,
          scope: "local",
        });
        registerUndoAction({
          type: "DELETE_CREATED_ROW",
          tableName: "dialectic_contributions",
          criteria: { id: readBack.id },
          scope: "local",
        });
      });

      await t.step("resource arm persists null when sourcePromptResourceId is undefined", async () => {
        /**
         * Contract: given a resource params value with sourcePromptResourceId undefined,
         *   buildUploadContext and file_manager leave the written row's source_prompt_resource_id
         *   as null.
         * Arrange: real resource params with sourcePromptResourceId undefined and a distinct
         *   document key from the populated resource case so the storage path does not collide.
         * Act:     isBuildUploadContextResourceParams; buildUploadContext; uploadAndRegisterFile;
         *   select the row back by id.
         * Assert:  the written resource row's source_prompt_resource_id is null.
         * Boundary: buildUploadContext (resource arm) → file_manager.uploadAndRegisterFile →
         *   real dialectic_project_resources row and real storage object.
         * Mocked: nothing.
         */

        // Arrange
        const resourceParams = buildBuildUploadContextResourceParams({
          projectId: env.testProjectId,
          sessionId: env.testSessionId,
          iterationNumber: env.testIterationNumber,
          projectOwnerUserId: env.primaryUserId,
          sourcePromptResourceId: undefined,
          documentKey: FileType.technical_approach,
        });

        // Act
        assert(
          isBuildUploadContextResourceParams(resourceParams),
          "builder must produce a valid BuildUploadContextResourceParams value",
        );
        const resourceContext = buildUploadContext(resourceParams);
        const resourceResult = await env.fileManager.uploadAndRegisterFile(resourceContext);

        // Assert
        assertExists(resourceResult.record, "resource upload must return a record");
        if (!("source_prompt_resource_id" in resourceResult.record)) {
          throw new Error("resource record is missing source_prompt_resource_id");
        }
        assertEquals(resourceResult.record.source_prompt_resource_id, null);

        const { data: readBack, error: readBackErr } = await env.admin
          .from("dialectic_project_resources")
          .select("*")
          .eq("id", resourceResult.record.id)
          .single();
        if (readBackErr || !readBack) {
          throw new Error(`Failed to select back resource row: ${readBackErr?.message ?? "no row"}`);
        }
        assertEquals(readBack.source_prompt_resource_id, null);

        registerUndoAction({
          type: "DELETE_STORAGE_OBJECT",
          bucketName: readBack.storage_bucket,
          path: `${readBack.storage_path}/${readBack.file_name}`,
          scope: "local",
        });
        registerUndoAction({
          type: "DELETE_CREATED_ROW",
          tableName: "dialectic_project_resources",
          criteria: { id: readBack.id },
          scope: "local",
        });
      });
    } finally {
      await coreCleanupTestResources();
    }
  },
});
