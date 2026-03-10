import {
    afterAll,
    beforeAll,
    describe,
    it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
    coreCleanupTestResources,
    coreCreateAndSetupTestUser,
    initializeSupabaseAdminClient,
    setSharedAdminClient,
    initializeTestDeps,
} from "../../functions/_shared/_integration.test.utils.ts";
import { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { Database } from "../../functions/types_db.ts";
import { DialecticProject, StartSessionPayload } from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";

describe("handle_job_completion trigger Integration Tests (Step 105.f)", () => {
    let adminClient: SupabaseClient<Database>;
    let testUser: User;
    let testProject: DialecticProject;
    let testSessionId: string;

    beforeAll(async () => {
        initializeTestDeps();
        adminClient = initializeSupabaseAdminClient();
        setSharedAdminClient(adminClient);

        const { userClient } = await coreCreateAndSetupTestUser();
        const { data: { user } } = await userClient.auth.getUser();
        assertExists(user, "Test user could not be created");
        testUser = user;

        const formData = new FormData();
        formData.append("projectName", "Trigger Test Project");
        formData.append("initialUserPromptText", "Test prompt for trigger test");
        
        const { data: domain, error: domainError } = await adminClient
            .from("dialectic_domains")
            .select("id")
            .eq("name", "Software Development")
            .single();
        if (domainError) throw new Error(`Failed to fetch domain: ${domainError.message}`);
        formData.append("selectedDomainId", domain.id);

        const projectResult = await createProject(formData, adminClient, testUser);
        if (projectResult.error || !projectResult.data) {
            throw new Error(`Failed to create test project: ${projectResult.error?.message}`);
        }
        testProject = projectResult.data;

        const sessionPayload: StartSessionPayload = {
            projectId: testProject.id,
            selectedModelIds: [], // Not needed for this test
            stageSlug: 'parenthesis',
        };
        const sessionResult = await startSession(testUser, adminClient, sessionPayload);
        if (sessionResult.error || !sessionResult.data) {
            throw new Error(`Failed to create test session: ${sessionResult.error?.message}`);
        }
        testSessionId = sessionResult.data.id;
    });

    afterAll(async () => {
        await coreCleanupTestResources('local');
    });

    it("105.f.i: transitions waiting job to pending when prerequisite job completes", async () => {
        // --- Setup: Use the actual recipe to create realistic job data ---

        // 1. Get the parenthesis recipe template by name/version (not hardcoded UUID)
        const { data: template, error: templateError } = await adminClient
            .from('dialectic_recipe_templates')
            .select('id')
            .eq('recipe_name', 'parenthesis_v1')
            .eq('recipe_version', 1)
            .single();

        if (templateError) throw new Error(`Failed to fetch parenthesis template: ${templateError.message}`);
        assertExists(template, "Parenthesis recipe template not found");

        // 2. Get the actual recipe step IDs from the database
        const { data: steps, error: stepsError } = await adminClient
            .from('dialectic_recipe_template_steps')
            .select('id, step_slug')
            .eq('template_id', template.id);

        if (stepsError) throw new Error(`Failed to fetch recipe steps: ${stepsError.message}`);
        assertExists(steps, "Parenthesis recipe steps not found");

        const techReqStep = steps.find(s => s.step_slug === 'generate-technical_requirements');
        const masterPlanStep = steps.find(s => s.step_slug === 'generate-master-plan');
        assertExists(techReqStep, "generate-technical_requirements step not found in recipe");
        assertExists(masterPlanStep, "generate-master-plan step not found in recipe");

        // 3. Create prerequisite job using the real recipe_step_id
        const { data: prerequisiteJob, error: prerequisiteError } = await adminClient
            .from('dialectic_generation_jobs')
            .insert({
                user_id: testUser.id,
                session_id: testSessionId,
                stage_slug: 'parenthesis',
                status: 'processing',
                job_type: 'EXECUTE',
                payload: { planner_metadata: { recipe_step_id: techReqStep.id } },
                iteration_number: 1,
            })
            .select()
            .single();

        if (prerequisiteError) throw new Error(`Failed to insert prerequisite job: ${prerequisiteError.message}`);
        assertExists(prerequisiteJob, "Prerequisite job was not created");

        // 4. Create waiting job using the real recipe_step_id
        const { data: waitingJob, error: waitingError } = await adminClient
            .from('dialectic_generation_jobs')
            .insert({
                user_id: testUser.id,
                session_id: testSessionId,
                stage_slug: 'parenthesis',
                status: 'waiting_for_prerequisite',
                prerequisite_job_id: prerequisiteJob.id,
                job_type: 'EXECUTE',
                payload: { planner_metadata: { recipe_step_id: masterPlanStep.id } },
                iteration_number: 1,
            })
            .select()
            .single();

        if (waitingError) throw new Error(`Failed to insert waiting job: ${waitingError.message}`);
        assertExists(waitingJob, "Waiting job was not created");
        assertEquals(waitingJob.status, 'waiting_for_prerequisite');

        // --- Action: Trigger the handle_job_completion function ---

        // 5. Update prerequisite job to 'completed', firing the trigger
        const { error: updateError } = await adminClient
            .from('dialectic_generation_jobs')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', prerequisiteJob.id);

        if (updateError) throw new Error(`Failed to update prerequisite job: ${updateError.message}`);

        // --- Assertion: Verify the trigger worked correctly ---

        // 6. Verify the waiting job is now 'pending'
        const { data: updatedWaitingJob, error: fetchError } = await adminClient
            .from('dialectic_generation_jobs')
            .select('status')
            .eq('id', waitingJob.id)
            .single();

        if (fetchError) throw new Error(`Failed to fetch updated waiting job: ${fetchError.message}`);
        assertExists(updatedWaitingJob, "Could not find waiting job after update");
        assertEquals(updatedWaitingJob.status, 'pending', "Waiting job should have been transitioned to 'pending' by the trigger");
    });

    it("106.g.i-ii: skeleton PLAN job transitions to pending when prerequisite EXECUTE job completes", async () => {
        // --- Setup: Create realistic skeleton PLAN job scenario from 106.d ---

        // 1. Get the parenthesis recipe template by name/version (not hardcoded UUID)
        const { data: template, error: templateError } = await adminClient
            .from('dialectic_recipe_templates')
            .select('id')
            .eq('recipe_name', 'parenthesis_v1')
            .eq('recipe_version', 1)
            .single();

        if (templateError) throw new Error(`Failed to fetch parenthesis template: ${templateError.message}`);
        assertExists(template, "Parenthesis recipe template not found");

        // 2. Get the actual recipe step IDs from the database
        const { data: steps, error: stepsError } = await adminClient
            .from('dialectic_recipe_template_steps')
            .select('id, step_slug')
            .eq('template_id', template.id);

        if (stepsError) throw new Error(`Failed to fetch recipe steps: ${stepsError.message}`);
        assertExists(steps, "Parenthesis recipe steps not found");

        const techReqStep = steps.find(s => s.step_slug === 'generate-technical_requirements');
        const masterPlanStep = steps.find(s => s.step_slug === 'generate-master-plan');
        assertExists(techReqStep, "generate-technical_requirements step not found in recipe");
        assertExists(masterPlanStep, "generate-master-plan step not found in recipe");

        // 3. Create prerequisite EXECUTE job (the job that produces technical_requirements)
        const { data: prerequisiteExecuteJob, error: prerequisiteError } = await adminClient
            .from('dialectic_generation_jobs')
            .insert({
                user_id: testUser.id,
                session_id: testSessionId,
                stage_slug: 'parenthesis',
                status: 'processing',
                job_type: 'EXECUTE',
                payload: { planner_metadata: { recipe_step_id: techReqStep.id } },
                iteration_number: 1,
            })
            .select()
            .single();

        if (prerequisiteError) throw new Error(`Failed to insert prerequisite EXECUTE job: ${prerequisiteError.message}`);
        assertExists(prerequisiteExecuteJob, "Prerequisite EXECUTE job was not created");

        // 4. Create skeleton PLAN job with waiting_for_prerequisite status (as created by 106.d)
        const { data: skeletonPlanJob, error: skeletonError } = await adminClient
            .from('dialectic_generation_jobs')
            .insert({
                user_id: testUser.id,
                session_id: testSessionId,
                stage_slug: 'parenthesis',
                status: 'waiting_for_prerequisite',
                prerequisite_job_id: prerequisiteExecuteJob.id,
                job_type: 'PLAN', // PLAN job, not EXECUTE - this is the skeleton
                payload: {
                    planner_metadata: { recipe_step_id: masterPlanStep.id },
                    projectId: testProject.id,
                    sessionId: testSessionId,
                    stageSlug: 'parenthesis',
                },
                iteration_number: 1,
            })
            .select()
            .single();

        if (skeletonError) throw new Error(`Failed to insert skeleton PLAN job: ${skeletonError.message}`);
        assertExists(skeletonPlanJob, "Skeleton PLAN job was not created");
        assertEquals(skeletonPlanJob.status, 'waiting_for_prerequisite');
        assertEquals(skeletonPlanJob.job_type, 'PLAN');

        // --- Action: Trigger the handle_job_completion function ---

        // 5. Update prerequisite EXECUTE job to 'completed', firing the trigger
        const { error: updateError } = await adminClient
            .from('dialectic_generation_jobs')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', prerequisiteExecuteJob.id);

        if (updateError) throw new Error(`Failed to update prerequisite EXECUTE job: ${updateError.message}`);

        // --- Assertion: Verify the trigger worked correctly for skeleton PLAN job ---

        // 6. Verify the skeleton PLAN job is now 'pending'
        const { data: updatedSkeletonJob, error: fetchError } = await adminClient
            .from('dialectic_generation_jobs')
            .select('status, job_type')
            .eq('id', skeletonPlanJob.id)
            .single();

        if (fetchError) throw new Error(`Failed to fetch updated skeleton PLAN job: ${fetchError.message}`);
        assertExists(updatedSkeletonJob, "Could not find skeleton PLAN job after update");
        assertEquals(updatedSkeletonJob.status, 'pending', "Skeleton PLAN job should have been transitioned to 'pending' by the trigger");
        assertEquals(updatedSkeletonJob.job_type, 'PLAN', "Skeleton job should still be PLAN type after transition");
    });
});
