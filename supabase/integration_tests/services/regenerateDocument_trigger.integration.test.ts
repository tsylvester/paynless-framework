import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  coreGenerateTestUserJwt,
  initializeSupabaseAdminClient,
  initializeTestDeps,
  setSharedAdminClient,
} from "../../functions/_shared/_integration.test.utils.ts";
import { type Database } from "../../functions/types_db.ts";
import { regenerateDocument } from "../../functions/dialectic-service/regenerateDocument.ts";
import { logger } from "../../functions/_shared/logger.ts";
import type { RegenerateDocumentPayload } from "../../functions/dialectic-service/dialectic.interface.ts";

type DialecticTriggerLogRow =
  Database["public"]["Tables"]["dialectic_trigger_logs"]["Row"];

const pollForCondition = async (
  condition: () => Promise<boolean>,
  timeoutMessage: string,
  interval = 500,
  timeout = 12000,
): Promise<void> => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Timeout waiting for condition: ${timeoutMessage}`);
};

const pollForTriggerLog = async (
  adminClient: SupabaseClient<Database>,
  jobId: string,
  expectedCount: number,
  timeoutMessage: string,
): Promise<DialecticTriggerLogRow[]> => {
  let logs: DialecticTriggerLogRow[] = [];
  await pollForCondition(async () => {
    const { data, error } = await adminClient
      .from("dialectic_trigger_logs")
      .select("*")
      .eq("job_id", jobId);

    if (error) {
      console.warn(
        `[pollForTriggerLog] Error fetching logs for job ${jobId}: ${error.message}`,
      );
      return false;
    }
    logs = data ?? [];
    return logs.length >= expectedCount;
  }, timeoutMessage);

  return logs;
};

describe("regenerateDocument: trigger fires and worker is invoked on clone", () => {
  let adminClient: SupabaseClient<Database>;
  let testUserId: string;
  let testUserJwt: string;
  let testProjectId: string;
  let testSessionId: string;
  const documentKey = "business_case";
  const modelId = "regenerate-trigger-test-model";
  const jobIdsToDelete: string[] = [];

  beforeAll(async () => {
    adminClient = initializeSupabaseAdminClient();
    setSharedAdminClient(adminClient);
    initializeTestDeps();
    const { userId, jwt } = await coreCreateAndSetupTestUser();
    assertExists(userId, "Test user could not be created.");
    assertExists(jwt, "Test user JWT could not be created.");
    testUserId = userId;
    testUserJwt = jwt;
  });

  afterAll(async () => {
    await coreCleanupTestResources();
  });

  beforeEach(async () => {
    const { data: domain } = await adminClient
      .from("dialectic_domains")
      .select("id")
      .eq("name", "Software Development")
      .single();
    assertExists(domain, 'Could not find "Software Development" domain.');

    const { data: project, error: projectError } = await adminClient
      .from("dialectic_projects")
      .insert({
        project_name: "Regenerate trigger test project",
        initial_user_prompt: "Test prompt",
        user_id: testUserId,
        selected_domain_id: domain.id,
      })
      .select("id")
      .single();

    assert(
      !projectError,
      `Failed to create test project: ${projectError?.message}`,
    );
    assertExists(project, "Test project was not created.");
    testProjectId = project.id;

    const { data: stage } = await adminClient
      .from("dialectic_stages")
      .select("id")
      .eq("slug", "thesis")
      .single();
    assertExists(stage, 'Could not find "thesis" stage.');

    const { data: session, error: sessionError } = await adminClient
      .from("dialectic_sessions")
      .insert({
        project_id: testProjectId,
        current_stage_id: stage.id,
      })
      .select("id")
      .single();

    assert(
      !sessionError,
      `Failed to create test session: ${sessionError?.message}`,
    );
    assertExists(session, "Test session was not created.");
    testSessionId = session.id;

    const originalPayload = {
      document_key: documentKey,
      model_id: modelId,
      user_jwt: testUserJwt,
    };

    const { data: originalJob, error: jobError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert({
        session_id: testSessionId,
        user_id: testUserId,
        stage_slug: "thesis",
        iteration_number: 1,
        payload: originalPayload,
        status: "completed",
        attempt_count: 1,
        max_retries: 3,
        job_type: "EXECUTE",
        parent_job_id: null,
        prerequisite_job_id: null,
        is_test_job: false,
      })
      .select("id")
      .single();

    assert(!jobError, `Failed to insert original EXECUTE job: ${jobError?.message}`);
    assertExists(originalJob, "Original job insert did not return data.");
    jobIdsToDelete.push(originalJob.id);
  });

  afterEach(async () => {
    if (jobIdsToDelete.length > 0) {
      await adminClient
        .from("dialectic_trigger_logs")
        .delete()
        .in("job_id", jobIdsToDelete);
      await adminClient
        .from("dialectic_generation_jobs")
        .delete()
        .in("id", jobIdsToDelete);
      jobIdsToDelete.length = 0;
    }
    if (testSessionId) {
      await adminClient.from("dialectic_sessions").delete().eq("id", testSessionId);
    }
    if (testProjectId) {
      await adminClient.from("dialectic_projects").delete().eq("id", testProjectId);
    }
  });

  it("after regenerateDocument inserts clone, trigger fires and worker is invoked", async () => {
    const { data: userData } = await adminClient.auth.admin.getUserById(
      testUserId,
    );
    assertExists(userData?.user, "Test user not found for regenerateDocument.");
    const user = userData.user;

    const payload: RegenerateDocumentPayload = {
      sessionId: testSessionId,
      stageSlug: "thesis",
      iterationNumber: 1,
      documents: [{ documentKey, modelId }],
    };

    const result = await regenerateDocument(
      payload,
      { user, authToken: testUserJwt },
      { dbClient: adminClient, logger },
    );

    assert(!result.error, `regenerateDocument failed: ${result.error?.message}`);
    assertExists(result.data?.jobIds, "regenerateDocument did not return jobIds.");
    const data = result.data;
    assertExists(data, "regenerateDocument data should exist after jobIds check.");
    if (!data) {
      throw new Error("regenerateDocument data should exist after jobIds check.");
    }
    assertEquals(
      data.jobIds.length,
      1,
      "Expected exactly one clone job id.",
    );

    const cloneJobId: string = data.jobIds[0];
    jobIdsToDelete.push(cloneJobId);

    const logs = await pollForTriggerLog(
      adminClient,
      cloneJobId,
      2,
      `Expected two trigger logs for clone job ${cloneJobId}`,
    );

    assertEquals(
      logs.length,
      2,
      `Expected exactly two trigger logs (prepare and after_post), got ${logs.length}`,
    );

    const prepareLog = logs.find((log) => log.log_message === "Preparing HTTP call");
    assertExists(
      prepareLog,
      "The 'Preparing HTTP call' log was not found for the clone job.",
    );

    const afterPostLog = logs.find(
      (log) => log.log_message === "invoke_dialectic_worker: after_post",
    );
    assertExists(
      afterPostLog,
      "The 'invoke_dialectic_worker: after_post' log was not found for the clone job.",
    );
  });
});
