import {
  describe,
  it,
  beforeAll,
  afterAll,
  afterEach,
} from "jsr:@std/testing@0.225.1/bdd";
import {
  assertEquals,
  assertExists,
} from "jsr:@std/assert@0.225.3";
import { type SupabaseClient } from "npm:@supabase/supabase-js@^2";
import type { Database, Json } from "../../functions/types_db.ts";
import { createSupabaseAdminClient } from "../../functions/_shared/auth.ts";
import { DialecticJobRow } from "../../functions/dialectic-service/dialectic.interface.ts";

const testRunId = `worker-status-change-test-${Date.now()}`;

let adminClient: SupabaseClient<Database>;
let createdUserId: string;

// Test data cleanup arrays
let createdJobIds: string[] = [];
let createdSessionId: string;
let createdProjectId: string;
let createdDomainId: string;
let createdStageId: string;

type DialecticTriggerLogRow =
  Database["public"]["Tables"]["dialectic_trigger_logs"]["Row"];

// Helper to poll for trigger logs
const pollForTriggerLog = async (
  jobId: string,
  expectedCount: number,
  timeoutMessage: string,
  timeout = 3000,
): Promise<DialecticTriggerLogRow[]> => {
  const startTime = Date.now();
  let logs: DialecticTriggerLogRow[] = [];
  while (Date.now() - startTime < timeout) {
    const { data, error } = await adminClient
      .from("dialectic_trigger_logs")
      .select("*")
      .eq("job_id", jobId);

    if (error) {
      console.warn(
        `[pollForTriggerLog] Error fetching logs for job ${jobId}: ${error.message}`,
      );
    } else {
      logs = data || [];
      if (logs.length >= expectedCount) {
        return logs;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  // Return whatever we have, even if not enough
  return logs;
};

// Helper to create a job with a specific status
async function createJob(
  status: DialecticJobRow["status"],
  payload: Json,
  overrides?: Partial<{
    attempt_count: number;
    max_retries: number;
    is_test_job: boolean;
  }>,
): Promise<string> {
  const { data, error } = await adminClient
    .from("dialectic_generation_jobs")
    .insert({
      session_id: createdSessionId,
      stage_slug: "test-stage-for-worker",
      iteration_number: 1,
      user_id: createdUserId,
      status,
      payload,
      attempt_count: overrides?.attempt_count ?? 0,
      max_retries: overrides?.max_retries ?? 3,
      is_test_job: overrides?.is_test_job ?? false,
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(`Failed to create job: ${error.message}`);
  }
  createdJobIds.push(data.id);
  return data.id;
}

// Helper to update a job's status
async function updateJobStatus(
  jobId: string,
  status: DialecticJobRow["status"],
): Promise<void> {
  const { error } = await adminClient
    .from("dialectic_generation_jobs")
    .update({ status })
    .eq("id", jobId);
  if (error) {
    throw new Error(`Failed to update job ${jobId} status: ${error.message}`);
  }
  // Wait a moment for the trigger to fire and process
  await new Promise((resolve) => setTimeout(resolve, 300));
}

// Helper to get a job's status
async function getJobStatus(
  jobId: string,
): Promise<DialecticJobRow["status"]> {
  const { data, error } = await adminClient
    .from("dialectic_generation_jobs")
    .select("status")
    .eq("id", jobId)
    .single();
  if (error) {
    throw new Error(`Failed to fetch job ${jobId}: ${error.message}`);
  }
  return data.status;
}

// Helper to check if trigger logs indicate HTTP invocation was attempted
function hasInvocationLogs(logs: DialecticTriggerLogRow[]): boolean {
  return logs.some(
    (log) =>
      log.log_message?.includes("Preparing HTTP call") ||
      log.log_message?.includes("invoke_dialectic_worker: after_post") ||
      log.log_message?.includes("invoke_worker_on_status_change: after_post"),
  );
}

describe("`invoke_worker_on_status_change` Trigger Integration Tests", () => {
  beforeAll(async () => {
    adminClient = createSupabaseAdminClient();
    const { data: userData, error: userError } =
      await adminClient.auth.admin.createUser({
        email: `worker-status-user-${testRunId}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (userError) {
      throw new Error(
        `Test setup failed: could not create user. ${userError.message}`,
      );
    }
    createdUserId = userData.user.id;

    const { data: domainData, error: domainError } = await adminClient
      .from("dialectic_domains")
      .insert({
        name: `Worker Status Test Domain ${testRunId}`,
        description: "test",
        is_enabled: true,
      })
      .select("id")
      .single();
    if (domainError) {
      throw new Error(
        `Test setup failed: could not create domain. ${domainError.message}`,
      );
    }
    createdDomainId = domainData.id;

    const { data: stageData, error: stageError } = await adminClient
      .from("dialectic_stages")
      .insert({
        slug: `test-stage-${testRunId}`,
        display_name: `Worker Status Test Stage ${testRunId}`,
        description: "test",
      })
      .select("id")
      .single();
    if (stageError) {
      throw new Error(
        `Test setup failed: could not create stage. ${stageError.message}`,
      );
    }
    createdStageId = stageData.id;

    const { data: projectData, error: projectError } = await adminClient
      .from("dialectic_projects")
      .insert({
        project_name: `Worker Status Test ${testRunId}`,
        initial_user_prompt: "test",
        user_id: createdUserId,
        selected_domain_id: createdDomainId,
      })
      .select("id")
      .single();
    if (projectError) {
      throw new Error(
        `Test setup failed: could not create project. ${projectError.message}`,
      );
    }
    createdProjectId = projectData.id;

    const { data: sessionData, error: sessionError } = await adminClient
      .from("dialectic_sessions")
      .insert({
        project_id: createdProjectId,
        status: "active",
        iteration_count: 1,
        current_stage_id: createdStageId,
      })
      .select("id")
      .single();
    if (sessionError) {
      throw new Error(
        `Test setup failed: could not create session. ${sessionError.message}`,
      );
    }
    createdSessionId = sessionData.id;
  });

  afterAll(async () => {
    if (createdJobIds.length > 0) {
      await adminClient
        .from("dialectic_trigger_logs")
        .delete()
        .in("job_id", createdJobIds);
      await adminClient
        .from("dialectic_generation_jobs")
        .delete()
        .in("id", createdJobIds);
    }
    if (createdSessionId) {
      await adminClient
        .from("dialectic_sessions")
        .delete()
        .eq("id", createdSessionId);
    }
    if (createdProjectId) {
      await adminClient
        .from("dialectic_projects")
        .delete()
        .eq("id", createdProjectId);
    }
    if (createdStageId) {
      await adminClient
        .from("dialectic_stages")
        .delete()
        .eq("id", createdStageId);
    }
    if (createdDomainId) {
      await adminClient
        .from("dialectic_domains")
        .delete()
        .eq("id", createdDomainId);
    }
    if (createdUserId) {
      await adminClient.auth.admin.deleteUser(createdUserId);
    }
  });

  afterEach(async () => {
    if (createdJobIds.length > 0) {
      await adminClient
        .from("dialectic_trigger_logs")
        .delete()
        .in("job_id", createdJobIds);
      await adminClient
        .from("dialectic_generation_jobs")
        .delete()
        .in("id", createdJobIds);
    }
    createdJobIds = [];
  });

  it("GREEN: pending_next_step status should invoke worker", async () => {
    const payload = {
      job_type: "plan",
      model_id: "test-model",
      sessionId: createdSessionId,
      projectId: createdProjectId,
    };

    // Create job in processing state
    const jobId = await createJob("processing", payload);

    // Clear any logs from initial creation
    await adminClient
      .from("dialectic_trigger_logs")
      .delete()
      .eq("job_id", jobId);

    // Update to pending_next_step (simulating handle_job_completion setting this)
    await updateJobStatus(jobId, "pending_next_step");

    // Wait and check for trigger logs
    const logs = await pollForTriggerLog(
      jobId,
      1,
      "Expected trigger logs for pending_next_step",
      2000,
    );

    // GREEN: This should pass - the trigger should invoke the worker
    const hasInvocation = hasInvocationLogs(logs);
    assertEquals(
      hasInvocation,
      true,
      "pending_next_step should invoke worker when status changes to this state",
    );
  });

  it("GREEN: pending_continuation status should invoke worker", async () => {
    const payload = {
      job_type: "continue",
      model_id: "test-model",
      sessionId: createdSessionId,
      projectId: createdProjectId,
    };

    // Create job in processing state
    const jobId = await createJob("processing", payload);

    // Clear any logs from initial creation
    await adminClient
      .from("dialectic_trigger_logs")
      .delete()
      .eq("job_id", jobId);

    // Update to pending_continuation (simulating continueJob setting this)
    await updateJobStatus(jobId, "pending_continuation");

    // Wait and check for trigger logs
    const logs = await pollForTriggerLog(
      jobId,
      1,
      "Expected trigger logs for pending_continuation",
      2000,
    );

    // GREEN: This should pass - the trigger should invoke the worker
    const hasInvocation = hasInvocationLogs(logs);
    assertEquals(
      hasInvocation,
      true,
      "pending_continuation should invoke worker when status changes to this state",
    );
  });

  it("GREEN: pending status via UPDATE should invoke worker", async () => {
    const payload = {
      job_type: "simple",
      model_id: "test-model",
      sessionId: createdSessionId,
      projectId: createdProjectId,
    };

    // Create job in waiting_for_prerequisite state
    const jobId = await createJob("waiting_for_prerequisite", payload);

    // Clear any logs from initial creation
    await adminClient
      .from("dialectic_trigger_logs")
      .delete()
      .eq("job_id", jobId);

    // Update to pending (simulating handle_job_completion setting this)
    await updateJobStatus(jobId, "pending");

    // Wait and check for trigger logs
    const logs = await pollForTriggerLog(
      jobId,
      1,
      "Expected trigger logs for pending via UPDATE",
      2000,
    );

    // GREEN: This should pass - the trigger should invoke the worker
    const hasInvocation = hasInvocationLogs(logs);
    assertEquals(
      hasInvocation,
      true,
      "pending via UPDATE should invoke worker when status changes to this state",
    );
  });

  it("Existing: retrying status with attempt_count >= (max_retries + 1) should mark job as retry_loop_failed", async () => {
    const payload = {
      job_type: "simple",
      model_id: "test-model",
      sessionId: createdSessionId,
      projectId: createdProjectId,
    };

    // Create job with attempt_count at max_retries + 1
    const jobId = await createJob("failed", payload, {
      attempt_count: 4, // max_retries is 3 by default, so 4 >= (3 + 1)
      max_retries: 3,
    });

    // Update to retrying - should trigger retry limit check
    await updateJobStatus(jobId, "retrying");

    // Wait for status to change
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check that job was marked as retry_loop_failed
    const finalStatus = await getJobStatus(jobId);
    assertEquals(
      finalStatus,
      "retry_loop_failed",
      "Job should be marked as retry_loop_failed when attempt_count >= (max_retries + 1)",
    );
  });

  it("Existing: retrying status with attempt_count < (max_retries + 1) should invoke worker", async () => {
    const payload = {
      job_type: "simple",
      model_id: "test-model",
      sessionId: createdSessionId,
      projectId: createdProjectId,
    };

    // Create job with attempt_count below limit
    const jobId = await createJob("failed", payload, {
      attempt_count: 2, // 2 < (3 + 1)
      max_retries: 3,
      is_test_job: false,
    });

    // Update to retrying - should invoke worker
    await updateJobStatus(jobId, "retrying");

    // Wait and check for trigger logs
    const logs = await pollForTriggerLog(
      jobId,
      1,
      "Expected trigger logs for retrying status",
      2000,
    );

    // Check that worker was invoked
    const hasInvocation = hasInvocationLogs(logs);
    assertEquals(
      hasInvocation,
      true,
      "Worker should be invoked for retrying status when attempt_count < (max_retries + 1)",
    );
  });

  it("Existing: test jobs with retrying status should NOT invoke worker", async () => {
    const payload = {
      job_type: "simple",
      model_id: "test-model",
      sessionId: createdSessionId,
      projectId: createdProjectId,
      is_test_job: true,
    };

    // Create test job
    const jobId = await createJob("failed", payload, {
      attempt_count: 1,
      max_retries: 3,
      is_test_job: true,
    });

    // Update to retrying
    await updateJobStatus(jobId, "retrying");

    // Wait and check for trigger logs
    const logs = await pollForTriggerLog(
      jobId,
      0,
      "Expected no invocation logs for test jobs",
      1000,
    );

    // Check that worker was NOT invoked (test jobs should be skipped)
    const hasInvocation = hasInvocationLogs(logs);
    assertEquals(
      hasInvocation,
      false,
      "Worker should NOT be invoked for test jobs, even with retrying status",
    );
  });

  it("Edge case: status updates that don't require worker should NOT invoke worker", async () => {
    const payload = {
      job_type: "simple",
      model_id: "test-model",
      sessionId: createdSessionId,
      projectId: createdProjectId,
    };

    // Test various statuses that should NOT trigger worker
    const nonWorkerStatuses: DialecticJobRow["status"][] = [
      "completed",
      "failed",
      "waiting_for_children",
      "waiting_for_prerequisite",
    ];

    for (const status of nonWorkerStatuses) {
      const jobId = await createJob("processing", payload);

      // Clear any logs from initial creation (INSERT trigger may have fired)
      await adminClient
        .from("dialectic_trigger_logs")
        .delete()
        .eq("job_id", jobId);

      // Update to non-worker status
      await updateJobStatus(jobId, status);

      // Wait and check for trigger logs
      const logs = await pollForTriggerLog(
        jobId,
        0,
        `Expected no trigger logs for ${status}`,
        500,
      );

      // Should NOT have invocation logs from the UPDATE trigger
      // Filter out any logs that might have been created before the UPDATE
      const updateLogs = logs.filter(
        (log) =>
          log.log_message &&
          (log.log_message.includes("invoke_worker_on_status_change") ||
            log.log_message.includes(`status: ${status}`)),
      );

      const hasInvocation = hasInvocationLogs(updateLogs);
      assertEquals(
        hasInvocation,
        false,
        `Worker should NOT be invoked for ${status} status via UPDATE trigger`,
      );
    }
  });

  it("Edge case: updating status to the same value should NOT invoke worker", async () => {
    const payload = {
      job_type: "simple",
      model_id: "test-model",
      sessionId: createdSessionId,
      projectId: createdProjectId,
    };

    // Create job in retrying state
    const jobId = await createJob("retrying", payload, {
      attempt_count: 1,
      max_retries: 3,
      is_test_job: false,
    });

    // Clear any logs from initial creation
    await adminClient
      .from("dialectic_trigger_logs")
      .delete()
      .eq("job_id", jobId);

    // Update to same status (retrying -> retrying)
    await updateJobStatus(jobId, "retrying");

    // Wait briefly
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Check for trigger logs (should have none since status didn't change)
    const logs = await pollForTriggerLog(
      jobId,
      0,
      "Expected no new trigger logs for same-status update",
      500,
    );

    // Should NOT have new invocation logs (status didn't actually change)
    const hasInvocation = hasInvocationLogs(logs);
    assertEquals(
      hasInvocation,
      false,
      "Worker should NOT be invoked when status is updated to the same value",
    );
  });
});

