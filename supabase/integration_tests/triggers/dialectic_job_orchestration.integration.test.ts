import {
  describe,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "jsr:@std/testing@0.225.1/bdd";
import {
  assertEquals,
  assertExists,
  assertNotEquals,
  fail,
} from "jsr:@std/assert@0.225.3";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2";
import type { Database } from "../../functions/types_db.ts";
import { createSupabaseAdminClient } from "../../functions/_shared/auth.ts";

const testRunId = `orchestration-test-${Date.now()}`;

let adminClient: SupabaseClient<Database>;
let createdUserId: string | null = null;
let createdUserEmail: string;

// Test data cleanup arrays
let createdJobIds: string[] = [];
let createdSessionId: string | null = null;
let createdProjectId: string | null = null;
let createdDomainId: string | null = null;
let createdStageId: string | null = null;

describe("Dialectic Job Orchestration Trigger Integration Tests", () => {
  // These tests focus on the handle_child_job_completion trigger that coordinates
  // parent/child job relationships, NOT the HTTP worker invocation trigger

  beforeAll(async () => {
    adminClient = createSupabaseAdminClient();
    console.log("Admin client initialized for orchestration tests.");

    // Create a test user
    createdUserEmail = `orchestration-user-${testRunId}@example.com`;
    const userPassword = "password123";
    const { data: userAuthData, error: userAuthError } = await adminClient.auth.admin.createUser({
      email: createdUserEmail,
      password: userPassword,
      email_confirm: true,
    });

    if (userAuthError) fail(`Failed to create test user: ${userAuthError.message}`);
    if (!userAuthData.user?.id) fail("User creation succeeded but no user ID returned");

    createdUserId = userAuthData.user.id;
    console.log(`Test user created with ID: ${createdUserId}`);

    // Create test domain
    const { data: domainData, error: domainError } = await adminClient
      .from('dialectic_domains')
      .insert({
        name: `Test Domain ${testRunId}`,
        description: 'Domain for orchestration testing',
        is_enabled: true,
      })
      .select('id')
      .single();

    if (domainError) fail(`Failed to create test domain: ${domainError.message}`);
    createdDomainId = domainData.id;

    // Create test stage
    const { data: stageData, error: stageError } = await adminClient
      .from('dialectic_stages')
      .insert({
        slug: `test-stage-${testRunId}`,
        display_name: `Test Stage ${testRunId}`,
        description: 'Stage for orchestration testing',
      })
      .select('id')
      .single();

    if (stageError) fail(`Failed to create test stage: ${stageError.message}`);
    createdStageId = stageData.id;

    // Create test project
    const { data: projectData, error: projectError } = await adminClient
      .from('dialectic_projects')
      .insert({
        project_name: `Orchestration Test Project ${testRunId}`,
        initial_user_prompt: 'Test prompt for orchestration',
        selected_domain_id: createdDomainId,
        user_id: createdUserId,
        status: 'active',
      })
      .select('id')
      .single();

    if (projectError) fail(`Failed to create test project: ${projectError.message}`);
    createdProjectId = projectData.id;

    // Create test session
    const { data: sessionData, error: sessionError } = await adminClient
      .from('dialectic_sessions')
      .insert({
        project_id: createdProjectId,
        current_stage_id: createdStageId,
        status: 'active',
        iteration_count: 1,
      })
      .select('id')
      .single();

    if (sessionError) fail(`Failed to create test session: ${sessionError.message}`);
    createdSessionId = sessionData.id;

    console.log(`Test setup complete - Session ID: ${createdSessionId}`);
  });

  afterAll(async () => {
    console.log("Starting cleanup of orchestration test data...");

    // Clean up jobs first (due to foreign key constraints)
    if (createdJobIds.length > 0) {
      const { error: jobsDeleteError } = await adminClient
        .from('dialectic_generation_jobs')
        .delete()
        .in('id', createdJobIds);
      
      if (jobsDeleteError) {
        console.warn(`Failed to clean up jobs: ${jobsDeleteError.message}`);
      } else {
        console.log(`Cleaned up ${createdJobIds.length} test jobs`);
      }
    }

    // Clean up session
    if (createdSessionId) {
      const { error: sessionDeleteError } = await adminClient
        .from('dialectic_sessions')
        .delete()
        .eq('id', createdSessionId);
      
      if (sessionDeleteError) {
        console.warn(`Failed to clean up session: ${sessionDeleteError.message}`);
      }
    }

    // Clean up project
    if (createdProjectId) {
      const { error: projectDeleteError } = await adminClient
        .from('dialectic_projects')
        .delete()
        .eq('id', createdProjectId);
      
      if (projectDeleteError) {
        console.warn(`Failed to clean up project: ${projectDeleteError.message}`);
      }
    }

    // Clean up stage
    if (createdStageId) {
      const { error: stageDeleteError } = await adminClient
        .from('dialectic_stages')
        .delete()
        .eq('id', createdStageId);
      
      if (stageDeleteError) {
        console.warn(`Failed to clean up stage: ${stageDeleteError.message}`);
      }
    }

    // Clean up domain
    if (createdDomainId) {
      const { error: domainDeleteError } = await adminClient
        .from('dialectic_domains')
        .delete()
        .eq('id', createdDomainId);
      
      if (domainDeleteError) {
        console.warn(`Failed to clean up domain: ${domainDeleteError.message}`);
      }
    }

    // Clean up user
    if (createdUserId) {
      const { error: userDeleteError } = await adminClient.auth.admin.deleteUser(createdUserId);
      if (userDeleteError) {
        console.warn(`Failed to clean up user: ${userDeleteError.message}`);
      }
    }

    console.log("Orchestration test cleanup completed.");
  });

  beforeEach(async () => {
    // Reset job tracking for each test
    createdJobIds = [];
    
    // Temporarily disable the HTTP trigger to focus on testing the orchestration trigger
    await adminClient.rpc('execute_sql', { 
      query: 'DROP TRIGGER IF EXISTS on_new_job_created ON public.dialectic_generation_jobs' 
    });
  });

  afterEach(async () => {
    // Clean up any jobs created during the test
    if (createdJobIds.length > 0) {
      await adminClient
        .from('dialectic_generation_jobs')
        .delete()
        .in('id', createdJobIds);
      createdJobIds = [];
    }
  });

  it("should not trigger orchestration for jobs without parent_job_id", async () => {
    if (!createdSessionId || !createdUserId) fail("Test setup incomplete");

    // Create a standalone job (no parent)
    const { data: jobData, error: jobError } = await adminClient
      .from('dialectic_generation_jobs')
      .insert({
        session_id: createdSessionId,
        stage_slug: 'test-stage',
        iteration_number: 1,
        payload: { test: 'standalone job' },
        user_id: createdUserId,
        status: 'pending',
      })
      .select('id')
      .single();

    if (jobError) fail(`Failed to create standalone job: ${jobError.message}`);
    createdJobIds.push(jobData.id);

    // Update job to completed
    const { error: updateError } = await adminClient
      .from('dialectic_generation_jobs')
      .update({ status: 'completed' })
      .eq('id', jobData.id);

    if (updateError) fail(`Failed to update job status: ${updateError.message}`);

    // Verify no parent job was affected (since there isn't one)
    // This is a negative test - we just need to ensure no errors occurred
    const { data: updatedJob, error: fetchError } = await adminClient
      .from('dialectic_generation_jobs')
      .select('status, parent_job_id')
      .eq('id', jobData.id)
      .single();

    if (fetchError) fail(`Failed to fetch updated job: ${fetchError.message}`);
    assertEquals(updatedJob.status, 'completed');
    assertEquals(updatedJob.parent_job_id, null);
  });

  it("should update parent job when all child jobs complete", async () => {
    if (!createdSessionId || !createdUserId) fail("Test setup incomplete");

    // Create parent job
    const { data: parentJobData, error: parentJobError } = await adminClient
      .from('dialectic_generation_jobs')
      .insert({
        session_id: createdSessionId,
        stage_slug: 'test-stage',
        iteration_number: 1,
        payload: { test: 'parent job' },
        user_id: createdUserId,
        status: 'waiting_for_children',
      })
      .select('id')
      .single();

    if (parentJobError) fail(`Failed to create parent job: ${parentJobError.message}`);
    createdJobIds.push(parentJobData.id);

    // Create 3 child jobs
    const childJobPayloads = [
      { test: 'child job 1', model: 'model-1' },
      { test: 'child job 2', model: 'model-2' },
      { test: 'child job 3', model: 'model-3' },
    ];

    const childJobIds: string[] = [];
    
    for (const payload of childJobPayloads) {
      const { data: childJobData, error: childJobError } = await adminClient
        .from('dialectic_generation_jobs')
        .insert({
          session_id: createdSessionId,
          stage_slug: 'test-stage',
          iteration_number: 1,
          payload: payload,
          user_id: createdUserId,
          status: 'pending',
          parent_job_id: parentJobData.id,
        })
        .select('id')
        .single();

      if (childJobError) fail(`Failed to create child job: ${childJobError.message}`);
      childJobIds.push(childJobData.id);
      createdJobIds.push(childJobData.id);
    }

    // Complete first child job
    const { error: firstUpdateError } = await adminClient
      .from('dialectic_generation_jobs')
      .update({ status: 'completed' })
      .eq('id', childJobIds[0]);

    if (firstUpdateError) fail(`Failed to complete first child: ${firstUpdateError.message}`);

    // Verify parent is still waiting
    const { data: parentAfterFirst, error: fetchError1 } = await adminClient
      .from('dialectic_generation_jobs')
      .select('status')
      .eq('id', parentJobData.id)
      .single();

    if (fetchError1) fail(`Failed to fetch parent after first child: ${fetchError1.message}`);
    assertEquals(parentAfterFirst.status, 'waiting_for_children', "Parent should still be waiting after first child completes");

    // Complete second child job
    const { error: secondUpdateError } = await adminClient
      .from('dialectic_generation_jobs')
      .update({ status: 'completed' })
      .eq('id', childJobIds[1]);

    if (secondUpdateError) fail(`Failed to complete second child: ${secondUpdateError.message}`);

    // Verify parent is still waiting
    const { data: parentAfterSecond, error: fetchError2 } = await adminClient
      .from('dialectic_generation_jobs')
      .select('status')
      .eq('id', parentJobData.id)
      .single();

    if (fetchError2) fail(`Failed to fetch parent after second child: ${fetchError2.message}`);
    assertEquals(parentAfterSecond.status, 'waiting_for_children', "Parent should still be waiting after second child completes");

    // Complete third (final) child job
    const { error: thirdUpdateError } = await adminClient
      .from('dialectic_generation_jobs')
      .update({ status: 'completed' })
      .eq('id', childJobIds[2]);

    if (thirdUpdateError) fail(`Failed to complete third child: ${thirdUpdateError.message}`);

    // Wait a moment for trigger to process
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify parent job status changed to pending_next_step
    const { data: parentAfterAll, error: fetchError3 } = await adminClient
      .from('dialectic_generation_jobs')
      .select('status, started_at')
      .eq('id', parentJobData.id)
      .single();

    if (fetchError3) fail(`Failed to fetch parent after all children: ${fetchError3.message}`);
    assertEquals(parentAfterAll.status, 'pending_next_step', "Parent should be pending_next_step after all children complete");
    assertEquals(parentAfterAll.started_at, null, "Parent started_at should be reset to null");
  });

  it("should handle mixed child job statuses correctly", async () => {
    if (!createdSessionId || !createdUserId) fail("Test setup incomplete");

    // Create parent job
    const { data: parentJobData, error: parentJobError } = await adminClient
      .from('dialectic_generation_jobs')
      .insert({
        session_id: createdSessionId,
        stage_slug: 'test-stage',
        iteration_number: 1,
        payload: { test: 'parent with mixed children' },
        user_id: createdUserId,
        status: 'waiting_for_children',
      })
      .select('id')
      .single();

    if (parentJobError) fail(`Failed to create parent job: ${parentJobError.message}`);
    createdJobIds.push(parentJobData.id);

    // Create child jobs with different statuses
    const childStatuses = ['completed', 'failed', 'retry_loop_failed'];
    const childJobIds: string[] = [];

    for (let i = 0; i < childStatuses.length; i++) {
      const { data: childJobData, error: childJobError } = await adminClient
        .from('dialectic_generation_jobs')
        .insert({
          session_id: createdSessionId,
          stage_slug: 'test-stage',
          iteration_number: 1,
          payload: { test: `child job ${i + 1}` },
          user_id: createdUserId,
          status: 'pending',
          parent_job_id: parentJobData.id,
        })
        .select('id')
        .single();

      if (childJobError) fail(`Failed to create child job ${i + 1}: ${childJobError.message}`);
      childJobIds.push(childJobData.id);
      createdJobIds.push(childJobData.id);
    }

    // Set each child to its final status (only 'completed' should trigger orchestration)
    for (let i = 0; i < childStatuses.length; i++) {
      const { error: updateError } = await adminClient
        .from('dialectic_generation_jobs')
        .update({ status: childStatuses[i] })
        .eq('id', childJobIds[i]);

      if (updateError) fail(`Failed to update child ${i + 1} to ${childStatuses[i]}: ${updateError.message}`);

      // Wait briefly between updates
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Wait for trigger processing
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify parent job status changed to pending_next_step
    // The trigger should only count 'completed' status, so parent should transition
    const { data: parentFinal, error: fetchError } = await adminClient
      .from('dialectic_generation_jobs')
      .select('status')
      .eq('id', parentJobData.id)
      .single();

    if (fetchError) fail(`Failed to fetch final parent status: ${fetchError.message}`);
    assertEquals(parentFinal.status, 'pending_next_step', "Parent should transition when only completed jobs are counted");
  });

  it("should only trigger when parent status is 'waiting_for_children'", async () => {
    if (!createdSessionId || !createdUserId) fail("Test setup incomplete");

    // Create parent job with different status
    const { data: parentJobData, error: parentJobError } = await adminClient
      .from('dialectic_generation_jobs')
      .insert({
        session_id: createdSessionId,
        stage_slug: 'test-stage',
        iteration_number: 1,
        payload: { test: 'parent in processing status' },
        user_id: createdUserId,
        status: 'processing', // Different status
      })
      .select('id')
      .single();

    if (parentJobError) fail(`Failed to create parent job: ${parentJobError.message}`);
    createdJobIds.push(parentJobData.id);

    // Create and complete a child job
    const { data: childJobData, error: childJobError } = await adminClient
      .from('dialectic_generation_jobs')
      .insert({
        session_id: createdSessionId,
        stage_slug: 'test-stage',
        iteration_number: 1,
        payload: { test: 'child of processing parent' },
        user_id: createdUserId,
        status: 'pending',
        parent_job_id: parentJobData.id,
      })
      .select('id')
      .single();

    if (childJobError) fail(`Failed to create child job: ${childJobError.message}`);
    createdJobIds.push(childJobData.id);

    // Complete the child job
    const { error: updateError } = await adminClient
      .from('dialectic_generation_jobs')
      .update({ status: 'completed' })
      .eq('id', childJobData.id);

    if (updateError) fail(`Failed to complete child job: ${updateError.message}`);

    // Wait for potential trigger processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify parent status did NOT change (because it wasn't 'waiting_for_children')
    const { data: parentFinal, error: fetchError } = await adminClient
      .from('dialectic_generation_jobs')
      .select('status')
      .eq('id', parentJobData.id)
      .single();

    if (fetchError) fail(`Failed to fetch final parent status: ${fetchError.message}`);
    assertEquals(parentFinal.status, 'processing', "Parent status should remain unchanged when not 'waiting_for_children'");
  });

  it("should handle completion of already completed jobs gracefully", async () => {
    if (!createdSessionId || !createdUserId) fail("Test setup incomplete");

    // Create parent job
    const { data: parentJobData, error: parentJobError } = await adminClient
      .from('dialectic_generation_jobs')
      .insert({
        session_id: createdSessionId,
        stage_slug: 'test-stage',
        iteration_number: 1,
        payload: { test: 'parent for duplicate completion test' },
        user_id: createdUserId,
        status: 'waiting_for_children',
      })
      .select('id')
      .single();

    if (parentJobError) fail(`Failed to create parent job: ${parentJobError.message}`);
    createdJobIds.push(parentJobData.id);

    // Create a child job that's already completed
    const { data: childJobData, error: childJobError } = await adminClient
      .from('dialectic_generation_jobs')
      .insert({
        session_id: createdSessionId,
        stage_slug: 'test-stage',
        iteration_number: 1,
        payload: { test: 'already completed child' },
        user_id: createdUserId,
        status: 'completed', // Already completed
        parent_job_id: parentJobData.id,
      })
      .select('id')
      .single();

    if (childJobError) fail(`Failed to create completed child job: ${childJobError.message}`);
    createdJobIds.push(childJobData.id);

    // Try to "complete" it again (should not trigger orchestration due to trigger condition)
    const { error: updateError } = await adminClient
      .from('dialectic_generation_jobs')
      .update({ status: 'completed' })
      .eq('id', childJobData.id);

    if (updateError) fail(`Failed to update already completed job: ${updateError.message}`);

    // Wait for potential trigger processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify parent should transition since we have 1 completed child out of 1 total
    const { data: parentFinal, error: fetchError } = await adminClient
      .from('dialectic_generation_jobs')
      .select('status')
      .eq('id', parentJobData.id)
      .single();

    if (fetchError) fail(`Failed to fetch final parent status: ${fetchError.message}`);
    assertEquals(parentFinal.status, 'pending_next_step', "Parent should transition when all children are complete, even with duplicate updates");
  });

}); 