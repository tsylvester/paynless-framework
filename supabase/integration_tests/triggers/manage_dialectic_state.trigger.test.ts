import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { Database } from "../../functions/types_db.ts";
import {
  DialecticProject,
  StartSessionPayload,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  initializeSupabaseAdminClient,
  setSharedAdminClient,
} from "../../functions/_shared/_integration.test.utils.ts";

let recipeSteps: { step_slug: string }[];

describe("manage_dialectic_state Trigger Integration Tests (Thesis)", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testProject: DialecticProject;
  let testSessionId: string;

  beforeAll(async () => {
    // Standard setup using verified helpers
    const adminClientInstance = initializeSupabaseAdminClient();
    adminClient = adminClientInstance;
    setSharedAdminClient(adminClientInstance);

    const { userClient } = await coreCreateAndSetupTestUser();
    const { data: { user } } = await userClient.auth.getUser();
    assertExists(user, "Test user could not be created");
    testUser = user;

    const formData = new FormData();
    formData.append("projectName", "Trigger Test Project");
    formData.append(
      "initialUserPromptText",
      "Trigger test prompt",
    );
    const { data: domain, error: domainError } = await adminClient
      .from("dialectic_domains")
      .select("id")
      .eq("name", "Software Development")
      .single();
    assert(!domainError, `Failed to fetch domain: ${domainError?.message}`);
    assertExists(domain, "Software Development domain must exist");
    formData.append("selectedDomainId", domain.id);

    const projectResult = await createProject(formData, adminClient, testUser);
    if (projectResult.error) {
      throw new Error(
        `Failed to create test project: ${projectResult.error.message}`,
      );
    }
    assertExists(projectResult.data, "Project creation returned no data");
    testProject = projectResult.data;

    // Fetch the recipe steps for the 'thesis' stage to know what's required
    const { data: stageData, error: stageError } = await adminClient
      .from("dialectic_stages")
      .select("active_recipe_instance_id")
      .eq("slug", "thesis")
      .single();

    assert(!stageError, `Failed to fetch thesis stage: ${stageError?.message}`);
    assertExists(stageData, "Thesis stage must exist");

    const { data: stepsData, error: stepsError } = await adminClient
      .from("dialectic_stage_recipe_steps")
      .select("step_slug")
      .eq("instance_id", stageData.active_recipe_instance_id);

    assert(!stepsError, `Failed to fetch recipe steps: ${stepsError?.message}`);
    assert(stepsData && stepsData.length > 0, "Thesis recipe must have steps");
    recipeSteps = stepsData;
    assertEquals(
      recipeSteps.length,
      5,
      "The thesis recipe is expected to have 5 steps",
    );

    // 32.c.i: Create a session with status pending_thesis
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      stageSlug: "thesis",
      selectedModelIds: [], // Not needed for this test
    };
    const sessionResult = await startSession(
      testUser,
      adminClient,
      sessionPayload,
    );
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(
        `Failed to start session for thesis stage: ${sessionResult.error?.message}`,
      );
    }
    testSessionId = sessionResult.data.id;

    const { data: session, error: sessionFetchError } = await adminClient
      .from("dialectic_sessions")
      .select("status")
      .eq("id", testSessionId)
      .single();

    assert(
      !sessionFetchError,
      `Failed to fetch session: ${sessionFetchError?.message}`,
    );
    assertEquals(
      session?.status,
      "pending_thesis",
      "Session status should be pending_thesis",
    );
  });

  afterAll(async () => {
    await coreCleanupTestResources();
  });

  it("32.c.ii: should NOT update session status if a required recipe step job is missing", async () => {
    // Arrange: Create and complete jobs for only 4 of the 5 required steps
    const requiredStepSlugs = recipeSteps.map((s) => s.step_slug);
    const stepsToComplete = requiredStepSlugs.slice(0, 4); // Leave one out

    const { data: jobs, error: jobInsertError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert(
        stepsToComplete.map((slug) => ({
          session_id: testSessionId,
          project_id: testProject.id,
          user_id: testUser.id,
          stage_slug: "thesis",
          step_slug: slug,
          iteration_number: 1,
          job_type: "EXECUTE", // Simplified for this test
          status: "completed",
          completed_at: new Date().toISOString(),
        })),
      )
      .select("id");

    assert(
      !jobInsertError,
      `Failed to insert jobs: ${jobInsertError?.message}`,
    );
    assert(
      jobs && jobs.length === 4,
      "Should have inserted 4 completed jobs",
    );

    // Act: The trigger fires automatically on INSERT. We just need to check the result.
    // To be certain, we can trigger an update on the last job to ensure the trigger runs with the latest state.
    const lastJobId = jobs[jobs.length - 1].id;
    await adminClient.from("dialectic_generation_jobs").update({
      status: "completed",
    }).eq("id", lastJobId);

    // Assert: The session status remains generating_thesis (or pending_thesis)
    const { data: session, error: sessionFetchError } = await adminClient
      .from("dialectic_sessions")
      .select("status")
      .eq("id", testSessionId)
      .single();

    assert(
      !sessionFetchError,
      `Failed to fetch session: ${sessionFetchError?.message}`,
    );
    assert(
      session?.status === "generating_thesis" ||
        session?.status === "pending_thesis",
      `Session status should remain generating/pending, but was ${session?.status}`,
    );
  });

  it("32.c.iii: should handle full completion lifecycle and update session status", async () => {
    // Arrange: Create PLAN job and dependent EXECUTE jobs
    const planStepSlug = "build-stage-header";
    const executeStepSlugs = recipeSteps
      .map((s) => s.step_slug)
      .filter((s) => s !== planStepSlug);

    // 1. Create the parent PLAN job
    const { data: planJob, error: planJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert({
        session_id: testSessionId,
        project_id: testProject.id,
        user_id: testUser.id,
        stage_slug: "thesis",
        step_slug: planStepSlug,
        iteration_number: 1,
        job_type: "PLAN",
        status: "pending",
      })
      .select("id")
      .single();

    assert(!planJobError, `Failed to insert PLAN job: ${planJobError?.message}`);
    assertExists(planJob, "PLAN job not created");

    // 2. Create the child EXECUTE jobs waiting on the PLAN job
    const { data: executeJobs, error: executeJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert(
        executeStepSlugs.map((slug) => ({
          session_id: testSessionId,
          project_id: testProject.id,
          user_id: testUser.id,
          stage_slug: "thesis",
          step_slug: slug,
          iteration_number: 1,
          job_type: "EXECUTE",
          status: "waiting_for_prerequisite",
          parent_job_id: planJob.id,
          prerequisite_job_id: planJob.id,
        })),
      )
      .select("id");

    assert(
      !executeJobError,
      `Failed to insert EXECUTE jobs: ${executeJobError?.message}`,
    );
    assert(
      executeJobs && executeJobs.length === 4,
      "Should have inserted 4 waiting EXECUTE jobs",
    );

    // Act 1: Complete the PLAN job
    await adminClient
      .from("dialectic_generation_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", planJob.id);

    // Assert 1: The trigger should update the EXECUTE jobs to 'pending'
    const { data: updatedExecuteJobs, error: fetchError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("status")
      .in("id", executeJobs.map((j) => j.id));

    assert(!fetchError, `Failed to fetch updated EXECUTE jobs: ${fetchError?.message}`);
    assert(updatedExecuteJobs, "Updated EXECUTE jobs not found");
    for (const job of updatedExecuteJobs) {
      assertEquals(job.status, "pending", "Child jobs should be pending after prerequisite completes");
    }

    // Act 2: Complete all the EXECUTE jobs
    await adminClient
      .from("dialectic_generation_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .in("id", executeJobs.map((j) => j.id));

    // Assert 2: The trigger should now update the session status to complete
    let sessionStatus: string | undefined;
    for (let i = 0; i < 5; i++) {
        const { data: session } = await adminClient
            .from("dialectic_sessions")
            .select("status")
            .eq("id", testSessionId)
            .single();
        sessionStatus = session?.status;
        if (sessionStatus === "thesis_generation_complete") {
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    assertEquals(
      sessionStatus,
      "thesis_generation_complete",
      "Session status should be updated to thesis_generation_complete after all jobs finish",
    );
  });
});

describe("manage_dialectic_state Trigger Integration Tests (Synthesis)", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testProject: DialecticProject;
  let synthesisSessionId: string;
  let synthesisRecipeInstanceId: string;

  beforeAll(async () => {
    // Standard setup using verified helpers
    const adminClientInstance = initializeSupabaseAdminClient();
    adminClient = adminClientInstance;
    setSharedAdminClient(adminClientInstance);

    const { userClient } = await coreCreateAndSetupTestUser();
    const { data: { user } } = await userClient.auth.getUser();
    assertExists(user, "Test user could not be created");
    testUser = user;

    const formData = new FormData();
    formData.append("projectName", "Synthesis Trigger Test Project");
    formData.append("initialUserPromptText", "Synthesis trigger test prompt");
    const { data: domain } = await adminClient.from("dialectic_domains").select(
      "id",
    ).eq("name", "Software Development").single();
    assertExists(domain, "Software Development domain must exist");
    formData.append("selectedDomainId", domain.id);

    const projectResult = await createProject(formData, adminClient, testUser);
    assert(!projectResult.error, `Failed to create project: ${projectResult.error?.message}`);

    if (!projectResult.data) {
      throw new Error("Project creation returned no data");
    }
    testProject = projectResult.data;

    const { data: stageData } = await adminClient.from("dialectic_stages")
      .select("active_recipe_instance_id").eq("slug", "synthesis").single();
    assertExists(stageData, "Synthesis stage must exist");
    synthesisRecipeInstanceId = stageData.active_recipe_instance_id;

    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      stageSlug: "synthesis",
      selectedModelIds: [],
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    assert(!sessionResult.error, `Failed to start session: ${sessionResult.error?.message}`);
    if (!sessionResult.data) {
      throw new Error("Session creation returned no data");
    }
    synthesisSessionId = sessionResult.data.id;
  });

  afterAll(async () => {
    await coreCleanupTestResources();
  });

  it("32.d.ii: should handle fan-in logic for parallel steps", async () => {
    // Arrange: Create the full job dependency graph for the fan-in scenario up-front
    const { data: allSteps, error: stepsError } = await adminClient.from("dialectic_stage_recipe_steps")
        .select("id, step_key").eq("instance_id", synthesisRecipeInstanceId);
    assert(!stepsError);
    assert(allSteps);

    const stepIdMap = new Map(allSteps.map(s => [s.step_key, s.id]));

    // 1. Create the initial PLAN job
    const { data: planJob } = await adminClient.from("dialectic_generation_jobs").insert({
        session_id: synthesisSessionId, project_id: testProject.id, user_id: testUser.id, stage_slug: "synthesis",
        step_slug: "prepare-pairwise-synthesis-header", iteration_number: 1, job_type: "PLAN", status: "pending",
    }).select('id').single();
    assertExists(planJob, "Failed to create initial PLAN job");

    // 2. Create the four parallel EXECUTE jobs that depend on the PLAN job
    const parallelStepKeys = [
        "synthesis_pairwise_business_case", "synthesis_pairwise_feature_spec",
        "synthesis_pairwise_technical_approach", "synthesis_pairwise_success_metrics",
    ];
    const { data: parallelJobs } = await adminClient.from("dialectic_generation_jobs").insert(
        parallelStepKeys.map(key => ({
            session_id: synthesisSessionId, project_id: testProject.id, user_id: testUser.id, stage_slug: "synthesis",
            parent_job_id: planJob.id, step_slug: key.replace(/_/g, '-'), iteration_number: 1, job_type: "EXECUTE", 
            status: "waiting_for_prerequisite", prerequisite_job_id: planJob.id,
        }))
    ).select('id, step_slug');
    assert(parallelJobs && parallelJobs.length === 4, "Failed to create parallel EXECUTE jobs");

    // 3. Create the four consolidation jobs that depend on the parallel jobs
    const consolidationMapping = {
        "synthesis_pairwise_business_case": "synthesis_document_business_case",
        "synthesis_pairwise_feature_spec": "synthesis_document_feature_spec",
        "synthesis_pairwise_technical_approach": "synthesis_document_technical_approach",
        "synthesis_pairwise_success_metrics": "synthesis_document_success_metrics",
    };
    const { data: consolidationJobs } = await adminClient.from("dialectic_generation_jobs").insert(
      parallelJobs.map(pJob => {
            const prereqStepKey = pJob.step_slug.replace(/-/g, '_');
            if (!(prereqStepKey in consolidationMapping)) {
                throw new Error(`Invalid prerequisite step key for fan-in test: ${prereqStepKey}`);
            }
            const targetStepKey = consolidationMapping[prereqStepKey];
            return {
                session_id: synthesisSessionId, project_id: testProject.id, user_id: testUser.id, stage_slug: "synthesis",
                step_slug: targetStepKey.replace(/_/g, '-'), iteration_number: 1, job_type: "EXECUTE", 
                status: "waiting_for_prerequisite", prerequisite_job_id: pJob.id,
            };
        })
    ).select('id, step_slug');
    assert(consolidationJobs && consolidationJobs.length === 4, "Failed to create consolidation jobs");
    
    // Act: Complete the PLAN job, which should make the 4 parallel jobs pending.
    await adminClient.from("dialectic_generation_jobs")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", planJob.id);

    // Assert: The 4 parallel jobs are now pending
    const { data: updatedParallelJobs } = await adminClient.from("dialectic_generation_jobs").select("status").in("id", parallelJobs.map(j => j.id));
    assert(updatedParallelJobs);
    for(const job of updatedParallelJobs) { assertEquals(job.status, "pending"); }

    // Act 2: Complete the 4 parallel jobs
    await adminClient.from("dialectic_generation_jobs")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .in("id", parallelJobs.map(j => j.id));

    // Assert 2: The 4 consolidation jobs should now be pending
    const { data: updatedConsolidationJobs } = await adminClient.from("dialectic_generation_jobs").select("status, step_slug").in("id", consolidationJobs.map(j => j.id));
    assert(updatedConsolidationJobs);
    for (const job of updatedConsolidationJobs) {
        assertEquals(job.status, "pending", `Job ${job.step_slug} should be pending but is ${job.status}`);
    }
  });

  it("32.d.iii: should propagate failures downstream in the DAG", async () => {
    // Arrange: Create a similar dependency graph but for a new iteration to ensure isolation
    const iteration = 2;
    const { data: planJob } = await adminClient.from("dialectic_generation_jobs").insert({
        session_id: synthesisSessionId, project_id: testProject.id, user_id: testUser.id, stage_slug: "synthesis",
        step_slug: "prepare-pairwise-synthesis-header", iteration_number: iteration, job_type: "PLAN", status: "completed", completed_at: new Date().toISOString()
    }).select('id').single();
    assertExists(planJob);

    const parallelStepKeys = [
        "synthesis_pairwise_business_case", "synthesis_pairwise_feature_spec",
        "synthesis_pairwise_technical_approach", "synthesis_pairwise_success_metrics",
    ];
    const { data: parallelJobs } = await adminClient.from("dialectic_generation_jobs").insert(
        parallelStepKeys.map(key => ({
            session_id: synthesisSessionId, project_id: testProject.id, user_id: testUser.id, stage_slug: "synthesis", parent_job_id: planJob.id,
            step_slug: key.replace(/_/g, '-'), iteration_number: iteration, job_type: "EXECUTE", status: "pending",
        }))
    ).select('id, step_slug');
    assert(parallelJobs && parallelJobs.length === 4);

    const consolidationMapping = {
        "synthesis_pairwise_business_case": "synthesis_document_business_case",
        "synthesis_pairwise_feature_spec": "synthesis_document_feature_spec",
        "synthesis_pairwise_technical_approach": "synthesis_document_technical_approach",
        "synthesis_pairwise_success_metrics": "synthesis_document_success_metrics",
    };
    const { data: consolidationJobs } = await adminClient.from("dialectic_generation_jobs").insert(
      parallelJobs.map(pJob => {
            const prereqStepKey = pJob.step_slug.replace(/-/g, '_');
            if (!(prereqStepKey in consolidationMapping)) {
                throw new Error(`Invalid prerequisite step key for failure test: ${prereqStepKey}`);
            }
            const targetStepKey = consolidationMapping[prereqStepKey];
            return {
                session_id: synthesisSessionId, project_id: testProject.id, user_id: testUser.id, stage_slug: "synthesis",
                step_slug: targetStepKey.replace(/_/g, '-'), iteration_number: iteration, job_type: "EXECUTE", 
                status: "waiting_for_prerequisite", prerequisite_job_id: pJob.id,
            };
        })
    ).select('id, step_slug');
    assert(consolidationJobs && consolidationJobs.length === 4);

    // Act: Mark three jobs as 'completed' and one as 'failed'.
    const jobToFail = parallelJobs[0];
    const jobsToComplete = parallelJobs.slice(1);

    await adminClient.from("dialectic_generation_jobs").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", jobToFail.id);
    await adminClient.from("dialectic_generation_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).in("id", jobsToComplete.map(j => j.id));

    // Assert: The job dependent on the failed prerequisite should be 'failed', and the others should be 'pending'.
    const { data: nextWaveJobs } = await adminClient.from("dialectic_generation_jobs")
        .select("status, step_slug").eq("session_id", synthesisSessionId).eq('iteration_number', iteration)
        .in("step_slug", Object.values(consolidationMapping).map(s => s.replace(/_/g, '-')));

    assert(nextWaveJobs && nextWaveJobs.length === 4, "Should have found 4 consolidation jobs for failure test");

    const expectedStatuses: { [key: string]: string } = {
      "synthesis-document-business-case": "failed", // Depends on the failed job
      "synthesis-document-feature-spec": "pending", // Depends on a completed job
      "synthesis-document-technical-approach": "pending", // Depends on a completed job
      "synthesis-document-success-metrics": "pending", // Depends on a completed job
    };

    for (const job of nextWaveJobs) {
      assert(job.step_slug, `Job found with null step_slug`);
      assert(job.step_slug in expectedStatuses, `Unexpected job found: ${job.step_slug}`);
      const expectedStatus = expectedStatuses[job.step_slug];
      assertEquals(
        job.status,
        expectedStatus,
        `Job ${job.step_slug} should be ${expectedStatus} but is ${job.status}`,
      );
    }
  });

  it("32.f: should prove the full chain between worker completion and trigger update", async () => {
    // This test simulates the final step of processComplexJob updating a PLAN job,
    // which should trigger manage_dialectic_state to complete the session.
    
    // Arrange: Create a new session and all required jobs for the 'thesis' stage.
    // Use a new iteration number to ensure test isolation.
    const iteration = 3;
    const { data: session } = await adminClient.from("dialectic_sessions").insert({
        project_id: testProject.id,
        user_id: testUser.id,
        status: "generating_thesis",
        active_stage_slug: "thesis",
        iteration_number: iteration,
    }).select('id').single();
    assertExists(session, "Failed to create isolated session for final test");
    const isolatedSessionId = session.id;

    const planStepSlug = "build-stage-header";
    const executeStepSlugs = recipeSteps
      .map((s) => s.step_slug)
      .filter((s) => s !== planStepSlug);

    // Create a parent PLAN job that is still 'processing'
    const { data: planJob } = await adminClient.from("dialectic_generation_jobs").insert({
        session_id: isolatedSessionId,
        project_id: testProject.id,
        user_id: testUser.id,
        stage_slug: "thesis",
        step_slug: planStepSlug,
        iteration_number: iteration,
        job_type: "PLAN",
        status: "processing",
    }).select('id').single();
    assertExists(planJob, "Failed to create PLAN job for final test");

    // Create and immediately complete all child EXECUTE jobs
    await adminClient.from("dialectic_generation_jobs").insert(
        executeStepSlugs.map(slug => ({
            session_id: isolatedSessionId,
            project_id: testProject.id,
            user_id: testUser.id,
            stage_slug: "thesis",
            step_slug: slug,
            iteration_number: iteration,
            job_type: "EXECUTE",
            status: "completed",
            completed_at: new Date().toISOString(),
            parent_job_id: planJob.id,
        }))
    );
    
    // Act: Simulate the worker's final action by updating the PLAN job to 'completed'.
    // This is the action that should fire the trigger and cause the session status to update.
    await adminClient
      .from("dialectic_generation_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", planJob.id);

    // Assert: The trigger should have fired and updated the session status to complete.
    // We add a small delay and retry loop to account for database trigger latency.
    let finalSessionStatus: string | undefined;
    for (let i = 0; i < 5; i++) {
        const { data: finalSession } = await adminClient
            .from("dialectic_sessions")
            .select("status")
            .eq("id", isolatedSessionId)
            .single();
        finalSessionStatus = finalSession?.status;
        if (finalSessionStatus === "thesis_generation_complete") {
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 250)); // Wait 250ms before retrying
    }
    
    assertEquals(
      finalSessionStatus,
      "thesis_generation_complete",
      "Updating the final PLAN job to 'completed' should trigger the session status update.",
    );
  });
});

