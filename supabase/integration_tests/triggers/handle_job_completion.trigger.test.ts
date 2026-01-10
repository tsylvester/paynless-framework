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
import { SupabaseClient } from "npm:@supabase/supabase-js@^2";
import { 
    Database, 
    Json 
} from "../../functions/types_db.ts";
import { createSupabaseAdminClient } from "../../functions/_shared/auth.ts";
import { DialecticJobRow } from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";

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
async function createParentJob(
    status: DialecticJobRow['status'], 
    payload: Json,
    stepInfo?: { current_step: number; total_steps: number }
): Promise<string> {
    // Add step_info to payload if provided
    const fullPayload: Json = stepInfo 
        ? { ...(payload as Record<string, unknown>), step_info: stepInfo }
        : payload;
    
    const { data, error } = await adminClient
        .from('dialectic_generation_jobs')
        .insert({
            session_id: createdSessionId,
            stage_slug: 'test-stage-for-completion',
            iteration_number: 1,
            user_id: createdUserId,
            status,
            payload: fullPayload,
            job_type: 'PLAN',
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
            job_type: 'EXECUTE',
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

// Helper to create a session with a specific status
async function createSessionWithStatus(
    status: string,
    stageId: string,
    projectId: string,
): Promise<string> {
    const { data, error } = await adminClient
        .from('dialectic_sessions')
        .insert({
            project_id: projectId,
            status,
            iteration_count: 1,
            current_stage_id: stageId,
        })
        .select('id')
        .single();
    if (error) throw new Error(`Failed to create session: ${error.message}`);
    return data.id;
}

// Helper to get a session's status
async function getSessionStatus(sessionId: string): Promise<string> {
    const { data, error } = await adminClient
        .from('dialectic_sessions')
        .select('status')
        .eq('id', sessionId)
        .single();
    if (error) throw new Error(`Failed to fetch session ${sessionId}: ${error.message}`);
    return data.status;
}

// Helper to get an existing stage by slug
async function getStageBySlug(slug: string): Promise<string> {
    const { data, error } = await adminClient
        .from('dialectic_stages')
        .select('id')
        .eq('slug', slug)
        .single();
    if (error) throw new Error(`Failed to get stage with slug '${slug}': ${error.message}`);
    return data.id;
}


// Helper to create a root PLAN job
async function createRootPlanJob(
    sessionId: string,
    stageSlug: string,
    status: DialecticJobRow['status'],
    payload: Json,
): Promise<string> {
    const { data, error } = await adminClient
        .from('dialectic_generation_jobs')
        .insert({
            session_id: sessionId,
            stage_slug: stageSlug,
            iteration_number: 1,
            user_id: createdUserId,
            status,
            payload,
            job_type: 'PLAN',
            parent_job_id: null,
        })
        .select('id')
        .single();
    if (error) throw new Error(`Failed to create root PLAN job: ${error.message}`);
    createdJobIds.push(data.id);
    return data.id;
}

// Helper to create a child EXECUTE job
async function createChildExecuteJob(
    sessionId: string,
    stageSlug: string,
    parentJobId: string,
    status: DialecticJobRow['status'],
    payload: Json,
): Promise<string> {
    const { data, error } = await adminClient
        .from('dialectic_generation_jobs')
        .insert({
            session_id: sessionId,
            stage_slug: stageSlug,
            iteration_number: 1,
            user_id: createdUserId,
            status,
            payload,
            job_type: 'EXECUTE',
            parent_job_id: parentJobId,
        })
        .select('id')
        .single();
    if (error) throw new Error(`Failed to create child EXECUTE job: ${error.message}`);
    createdJobIds.push(data.id);
    return data.id;
}

// Helper to create a RENDER job
async function createRenderJob(
    sessionId: string,
    stageSlug: string,
    status: DialecticJobRow['status'],
    payload: Json,
): Promise<string> {
    const { data, error } = await adminClient
        .from('dialectic_generation_jobs')
        .insert({
            session_id: sessionId,
            stage_slug: stageSlug,
            iteration_number: 1,
            user_id: createdUserId,
            status,
            payload,
            job_type: 'RENDER',
            parent_job_id: null,
        })
        .select('id')
        .single();
    if (error) throw new Error(`Failed to create RENDER job: ${error.message}`);
    createdJobIds.push(data.id);
    return data.id;
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

        // Use existing Software Development domain
        const { data: domainData, error: domainError } = await adminClient
            .from('dialectic_domains')
            .select('id')
            .eq('name', 'Software Development')
            .single();
        if (domainError) throw new Error(`Test setup failed: could not find Software Development domain. ${domainError.message}`);
        createdDomainId = domainData.id;

        // Get thesis stage for default session
        const thesisStageId = await getStageBySlug('thesis');
        createdStageId = thesisStageId;

        // Create project using createProject to get real process_template_id
        const formData = new FormData();
        formData.append('projectName', `Completion Test ${testRunId}`);
        formData.append('initialUserPromptText', 'Test prompt for completion tests');
        formData.append('selectedDomainId', createdDomainId);

        const { data: { user } } = await adminClient.auth.admin.getUserById(createdUserId);
        if (!user) throw new Error('Failed to get test user');
        
        const projectResult = await createProject(formData, adminClient, user);
        if (projectResult.error || !projectResult.data) {
            throw new Error(`Test setup failed: could not create project. ${projectResult.error?.message}`);
        }
        createdProjectId = projectResult.data.id;

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
            model_id: 'test-model',
            sessionId: createdSessionId,
            projectId: createdProjectId,
        };
        // Final step: current_step equals total_steps (single-step job)
        const parentId = await createParentJob('waiting_for_children', parentPayload, {
            current_step: 1,
            total_steps: 1,
        });
        const childId = await createChildJob(parentId, 'pending');
        
        await updateJobStatus(childId, 'completed');
        
        const finalParentStatus = await getJobStatus(parentId);
        assertEquals(finalParentStatus, 'completed');
    });

    it("Scenario 2: Parent job should move to 'pending_next_step' after intermediate step's children finish", async () => {
        const parentPayload = {
            job_type: 'plan',
            model_id: 'test-model',
            sessionId: createdSessionId,
            projectId: createdProjectId,
        };
        // Intermediate step: current_step less than total_steps (multi-step job)
        const parentId = await createParentJob('waiting_for_children', parentPayload, {
            current_step: 1,
            total_steps: 2,
        });
        const childId = await createChildJob(parentId, 'pending');
        
        await updateJobStatus(childId, 'completed');
        
        const finalParentStatus = await getJobStatus(parentId);
        assertEquals(finalParentStatus, 'pending_next_step');
    });

    it("Scenario 3: Parent job should move to 'failed' if any child job fails", async () => {
        const parentPayload = {
            job_type: 'plan',
            model_id: 'test-model',
            sessionId: createdSessionId,
            projectId: createdProjectId,
        };
        // Failure should occur regardless of step_info, but include it for consistency
        const parentId = await createParentJob('waiting_for_children', parentPayload, {
            current_step: 1,
            total_steps: 1,
        });
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

    // Step 66.b: RED tests for session status advancement on stage completion
    describe("Step 66.b: Session Status Advancement on Stage Completion", () => {
        it("66.b.i: should advance session status to pending_{next_stage} when all root PLAN jobs complete", async () => {
            // Get existing stages from database
            const thesisStageId = await getStageBySlug('thesis');
            
            // Get project's actual process_template_id (already set by createProject)
            const { data: project, error: projectError } = await adminClient
                .from('dialectic_projects')
                .select('process_template_id')
                .eq('id', createdProjectId)
                .single();
            if (projectError || !project?.process_template_id) {
                throw new Error(`Failed to get project process_template_id: ${projectError?.message}`);
            }
            const processTemplateId = project.process_template_id;

            // Create a session with status = 'running_thesis'
            const testSessionId = await createSessionWithStatus('running_thesis', thesisStageId, createdProjectId);

            // Create a single root PLAN job for thesis stage with status = 'pending'
            const planPayload = {
                job_type: 'plan',
                model_id: 'test-model',
                sessionId: testSessionId,
                projectId: createdProjectId,
            };
            const planJobId = await createRootPlanJob(testSessionId, 'thesis', 'pending', planPayload);

            // Create child EXECUTE jobs under the PLAN job
            const executePayload = {
                job_type: 'execute',
                model_id: 'test-model',
                sessionId: testSessionId,
                projectId: createdProjectId,
            };
            const executeJob1Id = await createChildExecuteJob(testSessionId, 'thesis', planJobId, 'pending', executePayload);
            const executeJob2Id = await createChildExecuteJob(testSessionId, 'thesis', planJobId, 'pending', executePayload);

            // Mark all child jobs as completed
            await updateJobStatus(executeJob1Id, 'completed');
            await updateJobStatus(executeJob2Id, 'completed');

            // Mark the PLAN job as completed
            await updateJobStatus(planJobId, 'completed');

            // Wait for trigger to process
            await new Promise(resolve => setTimeout(resolve, 500));

            // Query dialectic_sessions and assert status = 'pending_antithesis'
            // RED: This test must initially FAIL because Part 3 doesn't exist
            const sessionStatus = await getSessionStatus(testSessionId);
            assertEquals(
                sessionStatus,
                'pending_antithesis',
                'Session status should be advanced to pending_antithesis when all root PLAN jobs complete',
            );

            // Cleanup
            await adminClient.from('dialectic_sessions').delete().eq('id', testSessionId);
        });

        it("66.b.ii: should handle multi-PLAN stages correctly (synthesis)", async () => {
            // Get existing stages from database
            const synthesisStageId = await getStageBySlug('synthesis');
            
            // Get project's actual process_template_id (already set by createProject)
            const { data: project, error: projectError } = await adminClient
                .from('dialectic_projects')
                .select('process_template_id')
                .eq('id', createdProjectId)
                .single();
            if (projectError || !project?.process_template_id) {
                throw new Error(`Failed to get project process_template_id: ${projectError?.message}`);
            }
            const processTemplateId = project.process_template_id;

            // Create a session with status = 'running_synthesis'
            const testSessionId = await createSessionWithStatus('running_synthesis', synthesisStageId, createdProjectId);

            // Create TWO root PLAN jobs for synthesis stage (pairwise header and final header)
            const planPayload1 = {
                job_type: 'plan',
                model_id: 'test-model',
                sessionId: testSessionId,
                projectId: createdProjectId,
                plan_type: 'pairwise_header',
            };
            const planJob1Id = await createRootPlanJob(testSessionId, 'synthesis', 'pending', planPayload1);

            const planPayload2 = {
                job_type: 'plan',
                model_id: 'test-model',
                sessionId: testSessionId,
                projectId: createdProjectId,
                plan_type: 'final_header',
            };
            const planJob2Id = await createRootPlanJob(testSessionId, 'synthesis', 'pending', planPayload2);

            // Mark the first PLAN job as completed
            await updateJobStatus(planJob1Id, 'completed');

            // Wait for trigger to process
            await new Promise(resolve => setTimeout(resolve, 500));

            // Assert session status is still 'running_synthesis' (not all PLAN jobs complete)
            let sessionStatus = await getSessionStatus(testSessionId);
            assertEquals(
                sessionStatus,
                'running_synthesis',
                'Session status should remain running_synthesis when only one of two PLAN jobs complete',
            );

            // Mark the second PLAN job as completed
            await updateJobStatus(planJob2Id, 'completed');

            // Wait for trigger to process
            await new Promise(resolve => setTimeout(resolve, 500));

            // Assert session status is now 'pending_{next_stage}' or 'iteration_complete_pending_review'
            // RED: This test must initially FAIL
            sessionStatus = await getSessionStatus(testSessionId);
            assertEquals(
                sessionStatus,
                'pending_parenthesis',
                'Session status should advance to pending_parenthesis when all PLAN jobs complete',
            );

            // Cleanup
            await adminClient.from('dialectic_sessions').delete().eq('id', testSessionId);
        });

        it("66.b.iii: should NOT advance session status when PLAN job fails", async () => {
            // Get existing stages from database
            const thesisStageId = await getStageBySlug('thesis');
            
            // Get project's actual process_template_id (already set by createProject)
            const { data: project, error: projectError } = await adminClient
                .from('dialectic_projects')
                .select('process_template_id')
                .eq('id', createdProjectId)
                .single();
            if (projectError || !project?.process_template_id) {
                throw new Error(`Failed to get project process_template_id: ${projectError?.message}`);
            }
            const processTemplateId = project.process_template_id;

            // Create a session with status = 'running_thesis'
            const testSessionId = await createSessionWithStatus('running_thesis', thesisStageId, createdProjectId);

            // Create a root PLAN job
            const planPayload = {
                job_type: 'plan',
                model_id: 'test-model',
                sessionId: testSessionId,
                projectId: createdProjectId,
            };
            const planJobId = await createRootPlanJob(testSessionId, 'thesis', 'pending', planPayload);

            // Mark the PLAN job as failed
            await updateJobStatus(planJobId, 'failed');

            // Wait for trigger to process
            await new Promise(resolve => setTimeout(resolve, 500));

            // Assert session status is still 'running_thesis' (stage failed, not complete)
            const sessionStatus = await getSessionStatus(testSessionId);
            assertEquals(
                sessionStatus,
                'running_thesis',
                'Session status should remain running_thesis when PLAN job fails',
            );

            // Cleanup
            await adminClient.from('dialectic_sessions').delete().eq('id', testSessionId);
        });

        it("66.b.iv: should NOT advance session status when non-root job completes", async () => {
            // Get existing stages from database
            const thesisStageId = await getStageBySlug('thesis');
            
            // Get project's actual process_template_id (already set by createProject)
            const { data: project, error: projectError } = await adminClient
                .from('dialectic_projects')
                .select('process_template_id')
                .eq('id', createdProjectId)
                .single();
            if (projectError || !project?.process_template_id) {
                throw new Error(`Failed to get project process_template_id: ${projectError?.message}`);
            }
            const processTemplateId = project.process_template_id;

            // Create a session
            const testSessionId = await createSessionWithStatus('running_thesis', thesisStageId, createdProjectId);

            // Create a root PLAN job
            const planPayload = {
                job_type: 'plan',
                model_id: 'test-model',
                sessionId: testSessionId,
                projectId: createdProjectId,
            };
            const planJobId = await createRootPlanJob(testSessionId, 'thesis', 'pending', planPayload);

            // Create child EXECUTE jobs
            const executePayload = {
                job_type: 'execute',
                model_id: 'test-model',
                sessionId: testSessionId,
                projectId: createdProjectId,
            };
            const executeJobId = await createChildExecuteJob(testSessionId, 'thesis', planJobId, 'pending', executePayload);

            // Mark a child EXECUTE job as completed
            await updateJobStatus(executeJobId, 'completed');

            // Wait for trigger to process
            await new Promise(resolve => setTimeout(resolve, 500));

            // Assert session status unchanged (only root PLAN job completion triggers check)
            const sessionStatus = await getSessionStatus(testSessionId);
            assertEquals(
                sessionStatus,
                'running_thesis',
                'Session status should remain unchanged when non-root job completes',
            );

            // Cleanup
            await adminClient.from('dialectic_sessions').delete().eq('id', testSessionId);
        });

        it("66.b.v: should set iteration_complete_pending_review for terminal stages", async () => {
            // Get existing terminal stage (paralysis)
            const paralysisStageId = await getStageBySlug('paralysis');
            
            // Get project's actual process_template_id (already set by createProject)
            const { data: project, error: projectError } = await adminClient
                .from('dialectic_projects')
                .select('process_template_id')
                .eq('id', createdProjectId)
                .single();
            if (projectError || !project?.process_template_id) {
                throw new Error(`Failed to get project process_template_id: ${projectError?.message}`);
            }
            const processTemplateId = project.process_template_id;

            // Update project with process_template_id
            await adminClient
                .from('dialectic_projects')
                .update({ process_template_id: processTemplateId })
                .eq('id', createdProjectId);

            // Create a session with status = 'running_paralysis' (terminal stage)
            const testSessionId = await createSessionWithStatus('running_paralysis', paralysisStageId, createdProjectId);

            // Create and complete all jobs for paralysis stage
            const planPayload = {
                job_type: 'plan',
                model_id: 'test-model',
                sessionId: testSessionId,
                projectId: createdProjectId,
            };
            const planJobId = await createRootPlanJob(testSessionId, 'paralysis', 'pending', planPayload);

            const executePayload = {
                job_type: 'execute',
                model_id: 'test-model',
                sessionId: testSessionId,
                projectId: createdProjectId,
            };
            const executeJobId = await createChildExecuteJob(testSessionId, 'paralysis', planJobId, 'pending', executePayload);

            // Complete all jobs
            await updateJobStatus(executeJobId, 'completed');
            await updateJobStatus(planJobId, 'completed');

            // Wait for trigger to process
            await new Promise(resolve => setTimeout(resolve, 500));

            // Assert session status is 'iteration_complete_pending_review' (no next stage exists)
            // RED: This test must initially FAIL
            const sessionStatus = await getSessionStatus(testSessionId);
            assertEquals(
                sessionStatus,
                'iteration_complete_pending_review',
                'Session status should be set to iteration_complete_pending_review for terminal stages',
            );

            // Cleanup
            await adminClient.from('dialectic_sessions').delete().eq('id', testSessionId);
        });

        it("66.b.vi: should exclude RENDER jobs from stage completion check", async () => {
            // Get existing stages from database
            const thesisStageId = await getStageBySlug('thesis');
            
            // Get project's actual process_template_id (already set by createProject)
            const { data: project, error: projectError } = await adminClient
                .from('dialectic_projects')
                .select('process_template_id')
                .eq('id', createdProjectId)
                .single();
            if (projectError || !project?.process_template_id) {
                throw new Error(`Failed to get project process_template_id: ${projectError?.message}`);
            }
            const processTemplateId = project.process_template_id;

            // Create a session
            const testSessionId = await createSessionWithStatus('running_thesis', thesisStageId, createdProjectId);

            // Create root PLAN and EXECUTE jobs, mark them completed
            const planPayload = {
                job_type: 'plan',
                model_id: 'test-model',
                sessionId: testSessionId,
                projectId: createdProjectId,
            };
            const planJobId = await createRootPlanJob(testSessionId, 'thesis', 'pending', planPayload);

            const executePayload = {
                job_type: 'execute',
                model_id: 'test-model',
                sessionId: testSessionId,
                projectId: createdProjectId,
            };
            const executeJobId = await createChildExecuteJob(testSessionId, 'thesis', planJobId, 'pending', executePayload);

            await updateJobStatus(executeJobId, 'completed');
            await updateJobStatus(planJobId, 'completed');

            // Create a RENDER job with status = 'pending' (stuck)
            const renderPayload = {
                job_type: 'render',
                model_id: 'test-model',
                sessionId: testSessionId,
                projectId: createdProjectId,
            };
            await createRenderJob(testSessionId, 'thesis', 'pending', renderPayload);

            // Wait for trigger to process
            await new Promise(resolve => setTimeout(resolve, 500));

            // Assert session status advances anyway (RENDER jobs never block completion)
            // RED: This test must initially FAIL
            const sessionStatus = await getSessionStatus(testSessionId);
            assertEquals(
                sessionStatus,
                'pending_antithesis',
                'Session status should advance even when RENDER jobs are stuck in pending',
            );

            // Cleanup
            await adminClient.from('dialectic_sessions').delete().eq('id', testSessionId);
        });

        it("66.b.vii: should exclude waiting_for_prerequisite jobs from completion check", async () => {
            // Get existing stages from database
            const thesisStageId = await getStageBySlug('thesis');
            
            // Get project's actual process_template_id (already set by createProject)
            const { data: project, error: projectError } = await adminClient
                .from('dialectic_projects')
                .select('process_template_id')
                .eq('id', createdProjectId)
                .single();
            if (projectError || !project?.process_template_id) {
                throw new Error(`Failed to get project process_template_id: ${projectError?.message}`);
            }
            const processTemplateId = project.process_template_id;

            // Create a session
            const testSessionId = await createSessionWithStatus('running_thesis', thesisStageId, createdProjectId);

            // Create root PLAN job, mark it completed
            const planPayload = {
                job_type: 'plan',
                model_id: 'test-model',
                sessionId: testSessionId,
                projectId: createdProjectId,
            };
            const planJobId = await createRootPlanJob(testSessionId, 'thesis', 'pending', planPayload);
            await updateJobStatus(planJobId, 'completed');

            // Create another root job with status = 'waiting_for_prerequisite'
            const waitingPayload = {
                job_type: 'plan',
                model_id: 'test-model',
                sessionId: testSessionId,
                projectId: createdProjectId,
            };
            const { data: waitingJobData, error: waitingJobError } = await adminClient
                .from('dialectic_generation_jobs')
                .insert({
                    session_id: testSessionId,
                    stage_slug: 'thesis',
                    iteration_number: 1,
                    user_id: createdUserId,
                    status: 'waiting_for_prerequisite',
                    payload: waitingPayload,
                    job_type: 'PLAN',
                    parent_job_id: null,
                })
                .select('id')
                .single();
            if (waitingJobError) throw new Error(`Failed to create waiting job: ${waitingJobError.message}`);
            createdJobIds.push(waitingJobData.id);

            // Wait for trigger to process
            await new Promise(resolve => setTimeout(resolve, 500));

            // Assert session status advances (waiting jobs excluded from incomplete count)
            // RED: This test must initially FAIL
            const sessionStatus = await getSessionStatus(testSessionId);
            assertEquals(
                sessionStatus,
                'pending_antithesis',
                'Session status should advance even when jobs are in waiting_for_prerequisite status',
            );

            // Cleanup
            await adminClient.from('dialectic_sessions').delete().eq('id', testSessionId);
        });
    });
}); 