import { SupabaseClient } from 'npm:@supabase/supabase-js';
import {
    describe, 
    it, 
    beforeAll, 
    afterAll,
    afterEach,
} from 'https://deno.land/std@0.208.0/testing/bdd.ts';
import {
    assertExists,
    assertEquals,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import { Database } from '../../functions/types_db.ts'; 
import {
    initializeSupabaseAdminClient, 
    initializeTestDeps,
    coreCreateAndSetupTestUser 
} from '../../functions/_shared/_integration.test.utils.ts';
import { DialecticJobRow } from '../../functions/dialectic-service/dialectic.interface.ts';

const testRunId = `handle-job-completion-render-exclusion-test-${Date.now()}`;

describe('Integration Test: handle_job_completion should exclude RENDER jobs from sibling counts', () => {
    let adminClient: SupabaseClient<Database>;
    let testProjectId: string;
    let testUserId: string;
    let testSessionId: string;
    let testDomainId: string;
    let testStageId: string;
    let createdJobIds: string[] = [];

    beforeAll(async () => {
        initializeTestDeps();
        adminClient = initializeSupabaseAdminClient(); 
        
        // Create a test user using the utility function
        try {
            const { userId } = await coreCreateAndSetupTestUser();
            testUserId = userId;
        } catch (error) {
            console.error('Error creating test user via utility:', error);
            throw error;
        }
        assertExists(testUserId);

        // Create a test domain
        const { data: domainData, error: domainError } = await adminClient
            .from('dialectic_domains')
            .insert({
                name: `Test Domain for Render Exclusion ${testRunId}`,
                description: 'test',
                is_enabled: true,
            })
            .select('id')
            .single();
        if (domainError) throw new Error(`Test setup failed: could not create domain. ${domainError.message}`);
        testDomainId = domainData!.id;

        // Create a test stage
        const { data: stageData, error: stageError } = await adminClient
            .from('dialectic_stages')
            .insert({
                slug: `test-stage-${testRunId}`,
                display_name: `Test Stage for Render Exclusion ${testRunId}`,
                description: 'test',
            })
            .select('id')
            .single();
        if (stageError) throw new Error(`Test setup failed: could not create stage. ${stageError.message}`);
        testStageId = stageData!.id;

        // Create a test project
        const { data: projectData, error: projectError } = await adminClient
            .from('dialectic_projects')
            .insert({
                project_name: `Test Project for Render Exclusion ${testRunId}`,
                initial_user_prompt: 'Test initial prompt',
                user_id: testUserId,
                selected_domain_id: testDomainId,
            })
            .select('id')
            .single();
        if (projectError) throw new Error(`Test setup failed: could not create project. ${projectError.message}`);
        testProjectId = projectData!.id;

        // Create a test session
        const { data: sessionData, error: sessionError } = await adminClient
            .from('dialectic_sessions')
            .insert({
                project_id: testProjectId,
                status: 'active',
                iteration_count: 1,
                current_stage_id: testStageId,
            })
            .select('id')
            .single();
        if (sessionError) throw new Error(`Test setup failed: could not create session. ${sessionError.message}`);
        testSessionId = sessionData!.id;
    });

    afterEach(async () => {
        // Clean up jobs created in each test
        if (createdJobIds.length > 0) {
            await adminClient
                .from('dialectic_generation_jobs')
                .delete()
                .in('id', createdJobIds);
            createdJobIds = [];
        }
    });

    afterAll(async () => {
        if (createdJobIds.length > 0) {
            await adminClient
                .from('dialectic_generation_jobs')
                .delete()
                .in('id', createdJobIds);
        }
        if (testSessionId) {
            await adminClient
                .from('dialectic_sessions')
                .delete()
                .eq('id', testSessionId);
        }
        if (testProjectId) {
            await adminClient
                .from('dialectic_projects')
                .delete()
                .eq('id', testProjectId);
        }
        if (testStageId) {
            await adminClient
                .from('dialectic_stages')
                .delete()
                .eq('id', testStageId);
        }
        if (testDomainId) {
            await adminClient
                .from('dialectic_domains')
                .delete()
                .eq('id', testDomainId);
        }
        if (testUserId) {
            const { error: userDeleteError } = await adminClient.auth.admin.deleteUser(testUserId);
            if (userDeleteError && !userDeleteError.message.includes('User not found')) {
                console.error('Error deleting test user:', userDeleteError);
            }
        }
    });

    // Helper to create a job
    async function createJob(
        jobType: 'PLAN' | 'EXECUTE' | 'RENDER',
        status: DialecticJobRow['status'],
        parentJobId?: string
    ): Promise<string> {
        const { data, error } = await adminClient
            .from('dialectic_generation_jobs')
            .insert({
                session_id: testSessionId,
                stage_slug: `test-stage-${testRunId}`,
                iteration_number: 1,
                user_id: testUserId,
                job_type: jobType,
                status,
                parent_job_id: parentJobId || null,
                payload: {
                    job_type: jobType.toLowerCase(),
                    model_id: 'test-model',
                    projectId: testProjectId,
                    sessionId: testSessionId,
                },
            })
            .select('id')
            .single();
        if (error) throw new Error(`Failed to create ${jobType} job: ${error.message}`);
        createdJobIds.push(data.id);
        return data.id;
    }

    // Helper to update job status
    async function updateJobStatus(jobId: string, status: DialecticJobRow['status']): Promise<void> {
        const { error } = await adminClient
            .from('dialectic_generation_jobs')
            .update({ status })
            .eq('id', jobId);
        if (error) throw new Error(`Failed to update job ${jobId} status: ${error.message}`);
        // Wait for trigger to fire and process
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Helper to get job status
    async function getJobStatus(jobId: string): Promise<DialecticJobRow['status']> {
        const { data, error } = await adminClient
            .from('dialectic_generation_jobs')
            .select('status')
            .eq('id', jobId)
            .single();
        if (error) throw new Error(`Failed to fetch job ${jobId} status: ${error.message}`);
        return data.status;
    }

    it('should exclude RENDER jobs when counting siblings for parent job wake-up', async () => {
        // Create a PLAN job with status 'waiting_for_children', job_type 'PLAN'
        const planId = await createJob('PLAN', 'waiting_for_children');
        
        // Create an EXECUTE job with parent_job_id pointing to the PLAN job, status 'pending', job_type 'EXECUTE'
        const executeId = await createJob('EXECUTE', 'pending', planId);
        
        // Create a RENDER job with parent_job_id pointing to the EXECUTE job, status 'pending', job_type 'RENDER'
        const renderId = await createJob('RENDER', 'pending', executeId);
        
        // Update the EXECUTE job status to 'completed' to trigger handle_job_completion()
        await updateJobStatus(executeId, 'completed');
        
        // Query the PLAN job and assert its status is 'pending_next_step' despite the RENDER job being pending
        // This proves RENDER jobs are excluded from sibling counts
        const planStatus = await getJobStatus(planId);
        assertEquals(planStatus, 'pending_next_step', 
            'PLAN job should proceed to pending_next_step even when RENDER job is pending, proving RENDER jobs are excluded from sibling counts');
    });

    it('should only count EXECUTE and PLAN jobs as recipe-relevant siblings', async () => {
        // Create a PLAN job with status 'waiting_for_children'
        const planId = await createJob('PLAN', 'waiting_for_children');
        
        // Create two EXECUTE children with parent_job_id pointing to the PLAN job, both status 'completed'
        const execute1Id = await createJob('EXECUTE', 'completed', planId);
        const execute2Id = await createJob('EXECUTE', 'completed', planId);
        
        // Create a RENDER child with parent_job_id pointing to one of the EXECUTE jobs, status 'pending'
        const renderId = await createJob('RENDER', 'pending', execute1Id);
        
        // Update the second EXECUTE job to 'completed' to trigger handle_job_completion()
        // (even though it's already completed, this ensures the trigger processes)
        await updateJobStatus(execute2Id, 'completed');
        
        // Query the PLAN job and assert its status is 'pending_next_step'
        // This proves only EXECUTE/PLAN jobs are counted, as the RENDER job is still pending
        const planStatus = await getJobStatus(planId);
        assertEquals(planStatus, 'pending_next_step',
            'PLAN job should proceed to pending_next_step when all EXECUTE siblings are complete, even if RENDER job is pending');
    });

    it('should not fail parent job when RENDER job fails', async () => {
        // Create a PLAN job with status 'waiting_for_children'
        const planId = await createJob('PLAN', 'waiting_for_children');
        
        // Create an EXECUTE child with parent_job_id pointing to the PLAN job, status 'completed'
        const executeId = await createJob('EXECUTE', 'completed', planId);
        
        // Create a RENDER child with parent_job_id pointing to the EXECUTE job, status 'failed'
        const renderId = await createJob('RENDER', 'failed', executeId);
        
        // Wait for trigger processing from INSERTs
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Update the EXECUTE job to trigger handle_job_completion()
        await updateJobStatus(executeId, 'completed');
        
        // Query the PLAN job and assert its status is 'pending_next_step' (not 'failed')
        // This proves RENDER job failures don't affect parent PLAN jobs
        const planStatus = await getJobStatus(planId);
        assertEquals(planStatus, 'pending_next_step',
            'PLAN job should proceed to pending_next_step when EXECUTE job completes, even if RENDER job failed');
    });
});

