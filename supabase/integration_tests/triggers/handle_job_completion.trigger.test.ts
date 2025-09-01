import {
  describe,
  it,
  beforeAll,
  afterAll,
  afterEach,
} from "jsr:@std/testing@0.225.1/bdd";
import {
  assertEquals,
} from "jsr:@std/assert@0.225.3";
import { type SupabaseClient } from "npm:@supabase/supabase-js@^2";
import type { Database, Json } from "../../functions/types_db.ts";
import { createSupabaseAdminClient } from "../../functions/_shared/auth.ts";
import { DialecticJobRow } from "../../functions/dialectic-service/dialectic.interface.ts";

const testRunId = `handle-completion-test-${Date.now()}`;

let adminClient: SupabaseClient<Database>;
let createdUserId: string;

// Test data cleanup arrays
let createdJobIds: string[] = [];
let createdSessionId: string;
let createdProjectId: string;
let createdDomainId: string;
let createdStageId: string;

// Helper to create a parent job
async function createParentJob(status: DialecticJobRow['status'], payload: Json): Promise<string> {
    const { data, error } = await adminClient
        .from('dialectic_generation_jobs')
        .insert({
            session_id: createdSessionId,
            stage_slug: 'test-stage-for-completion',
            iteration_number: 1,
            user_id: createdUserId,
            status,
            payload,
        })
        .select('id')
        .single();
    if (error) throw new Error(`Failed to create parent job: ${error.message}`);
    createdJobIds.push(data.id);
    return data.id;
}

// Helper to create a child job
async function createChildJob(parentId: string, status: DialecticJobRow['status']): Promise<string> {
    const { data, error } = await adminClient
        .from('dialectic_generation_jobs')
        .insert({
            session_id: createdSessionId,
            stage_slug: 'test-stage-for-completion',
            iteration_number: 1,
            user_id: createdUserId,
            status,
            parent_job_id: parentId,
            payload: { job_type: 'execute', inputs: {}, prompt_template_name: 'test', model_id: 'test-model', projectId: createdProjectId, sessionId: createdSessionId },
        })
        .select('id')
        .single();
    if (error) throw new Error(`Failed to create child job: ${error.message}`);
    createdJobIds.push(data.id);
    return data.id;
}

// Helper to create a standalone job
async function createStandaloneJob(status: DialecticJobRow['status'], prerequisiteId?: string): Promise<string> {
    const { data, error } = await adminClient
        .from('dialectic_generation_jobs')
        .insert({
            session_id: createdSessionId,
            stage_slug: 'test-stage-for-completion',
            iteration_number: 1,
            user_id: createdUserId,
            status,
            prerequisite_job_id: prerequisiteId,
            payload: { job_type: 'simple', model_id: 'test-model', projectId: createdProjectId, sessionId: createdSessionId },
        })
        .select('id')
        .single();
    if (error) throw new Error(`Failed to create standalone job: ${error.message}`);
    createdJobIds.push(data.id);
    return data.id;
}

// Helper to update a job's status
async function updateJobStatus(jobId: string, status: DialecticJobRow['status']) {
    const { error } = await adminClient
        .from('dialectic_generation_jobs')
        .update({ status })
        .eq('id', jobId);
    if (error) throw new Error(`Failed to update job ${jobId} status: ${error.message}`);
    // Wait a moment for the trigger to fire and process
    await new Promise(resolve => setTimeout(resolve, 200));
}

// Helper to fetch a job's status
async function getJobStatus(jobId: string): Promise<DialecticJobRow['status']> {
    const { data, error } = await adminClient
        .from('dialectic_generation_jobs')
        .select('status')
        .eq('id', jobId)
        .single();
    if (error) throw new Error(`Failed to fetch job ${jobId}: ${error.message}`);
    return data.status;
}

describe("`handle_job_completion` Trigger Integration Tests", () => {
    beforeAll(async () => {
        adminClient = createSupabaseAdminClient();
        const { data: userData, error: userError } = await adminClient.auth.admin.createUser({
            email: `completion-user-${testRunId}@example.com`,
            password: "password123",
            email_confirm: true,
        });
        if (userError) throw new Error(`Test setup failed: could not create user. ${userError.message}`);
        createdUserId = userData.user.id;

        const { data: domainData, error: domainError } = await adminClient
            .from('dialectic_domains')
            .insert({ name: `Completion Test Domain ${testRunId}`, description: 'test', is_enabled: true })
            .select('id').single();
        if (domainError) throw new Error(`Test setup failed: could not create domain. ${domainError.message}`);
        createdDomainId = domainData.id;

        const { data: stageData, error: stageError } = await adminClient
            .from('dialectic_stages')
            .insert({ slug: `test-stage-${testRunId}`, display_name: `Completion Test Stage ${testRunId}`, description: 'test' })
            .select('id').single();
        if (stageError) throw new Error(`Test setup failed: could not create stage. ${stageError.message}`);
        createdStageId = stageData.id;

        const { data: projectData, error: projectError } = await adminClient
            .from('dialectic_projects')
            .insert({ project_name: `Completion Test ${testRunId}`, initial_user_prompt: 'test', user_id: createdUserId, selected_domain_id: createdDomainId })
            .select('id')
            .single();
        if (projectError) throw new Error(`Test setup failed: could not create project. ${projectError.message}`);
        createdProjectId = projectData.id;

        const { data: sessionData, error: sessionError } = await adminClient
            .from('dialectic_sessions')
            .insert({ project_id: createdProjectId, status: 'active', iteration_count: 1, current_stage_id: createdStageId })
            .select('id')
            .single();
        if (sessionError) throw new Error(`Test setup failed: could not create session. ${sessionError.message}`);
        createdSessionId = sessionData.id;
    });

    afterAll(async () => {
        if (createdJobIds.length > 0) {
            await adminClient.from('dialectic_generation_jobs').delete().in('id', createdJobIds);
        }
        if (createdSessionId) {
            await adminClient.from('dialectic_sessions').delete().eq('id', createdSessionId);
        }
        if (createdProjectId) {
            await adminClient.from('dialectic_projects').delete().eq('id', createdProjectId);
        }
        if (createdStageId) {
            await adminClient.from('dialectic_stages').delete().eq('id', createdStageId);
        }
        if (createdDomainId) {
            await adminClient.from('dialectic_domains').delete().eq('id', createdDomainId);
        }
        if (createdUserId) {
            await adminClient.auth.admin.deleteUser(createdUserId);
        }
    });

    afterEach(async () => {
        if (createdJobIds.length > 0) {
            await adminClient.from('dialectic_generation_jobs').delete().in('id', createdJobIds);
        }
        createdJobIds = [];
    });

    it("Scenario 1: Parent job should move to 'completed' after final step's children finish", async () => {
        const parentPayload = {
            job_type: 'plan',
            step_info: { current_step: 2, total_steps: 2 },
            model_id: 'test-model',
            sessionId: createdSessionId,
            projectId: createdProjectId,
        };
        const parentId = await createParentJob('waiting_for_children', parentPayload);
        const childId = await createChildJob(parentId, 'pending');
        
        await updateJobStatus(childId, 'completed');
        
        const finalParentStatus = await getJobStatus(parentId);
        assertEquals(finalParentStatus, 'completed');
    });

    it("Scenario 2: Parent job should move to 'pending_next_step' after intermediate step's children finish", async () => {
        const parentPayload = {
            job_type: 'plan',
            step_info: { current_step: 1, total_steps: 2 },
            model_id: 'test-model',
            sessionId: createdSessionId,
            projectId: createdProjectId,
        };
        const parentId = await createParentJob('waiting_for_children', parentPayload);
        const childId = await createChildJob(parentId, 'pending');
        
        await updateJobStatus(childId, 'completed');
        
        const finalParentStatus = await getJobStatus(parentId);
        assertEquals(finalParentStatus, 'pending_next_step');
    });

    it("Scenario 3: Parent job should move to 'failed' if any child job fails", async () => {
        const parentPayload = {
            job_type: 'plan',
            step_info: { current_step: 1, total_steps: 2 },
            model_id: 'test-model',
            sessionId: createdSessionId,
            projectId: createdProjectId,
        };
        const parentId = await createParentJob('waiting_for_children', parentPayload);
        const child1Id = await createChildJob(parentId, 'pending');
        const child2Id = await createChildJob(parentId, 'pending');

        await updateJobStatus(child1Id, 'completed');
        await updateJobStatus(child2Id, 'failed');

        const finalParentStatus = await getJobStatus(parentId);
        assertEquals(finalParentStatus, 'failed');
    });
    
    it("Scenario 4: Waiting job should move to 'pending' when prerequisite completes", async () => {
        const prerequisiteId = await createStandaloneJob('pending');
        const waitingJobId = await createStandaloneJob('waiting_for_prerequisite', prerequisiteId);

        await updateJobStatus(prerequisiteId, 'completed');

        const finalWaitingJobStatus = await getJobStatus(waitingJobId);
        assertEquals(finalWaitingJobStatus, 'pending');
    });

    it("Scenario 5: Waiting job should move to 'failed' when prerequisite fails", async () => {
        const prerequisiteId = await createStandaloneJob('pending');
        const waitingJobId = await createStandaloneJob('waiting_for_prerequisite', prerequisiteId);
        
        await updateJobStatus(prerequisiteId, 'failed');

        const finalWaitingJobStatus = await getJobStatus(waitingJobId);
        assertEquals(finalWaitingJobStatus, 'failed');
    });
}); 