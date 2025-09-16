import {
    assert,
    assertEquals,
    assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    it,
} from 'https://deno.land/std@0.224.0/testing/bdd.ts';
import { type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import {
    coreCleanupTestResources,
    coreCreateAndSetupTestUser,
    coreGenerateTestUserJwt,
    initializeSupabaseAdminClient,
    initializeTestDeps,
    setSharedAdminClient,
} from '../../functions/_shared/_integration.test.utils.ts';
import { type Database } from '../../functions/types_db.ts';

type DialecticTriggerLogRow =
    Database['public']['Tables']['dialectic_trigger_logs']['Row'];

const pollForCondition = async (
    condition: () => Promise<boolean>,
    timeoutMessage: string,
    interval = 500,
    timeout = 12000,
) => {
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
            .from('dialectic_trigger_logs')
            .select('*')
            .eq('job_id', jobId);

        if (error) {
            console.warn(
                `[pollForTriggerLog] Error fetching logs for job ${jobId}: ${error.message}`,
            );
            return false;
        }
        logs = data || [];
        return logs.length >= expectedCount;
    }, timeoutMessage);

    return logs;
};


describe('Trigger Isolation for Test Jobs', () => {
    let adminClient: SupabaseClient<Database>;
    let testUserId: string;
    let testUserJwt: string;
    let testProjectId: string;
    let testSessionId: string;
    const jobsToDelete: string[] = [];

    beforeAll(async () => {
        adminClient = initializeSupabaseAdminClient();
        setSharedAdminClient(adminClient);
        initializeTestDeps();
        const { userId, jwt } = await coreCreateAndSetupTestUser();
        assertExists(userId, 'Test user could not be created.');
        assertExists(jwt, 'Test user JWT could not be created.');
        testUserId = userId;
        testUserJwt = jwt;
    });

    afterAll(async () => {
        await coreCleanupTestResources();
    });

    beforeEach(async () => {
        // Create fresh project and session for each test to ensure isolation
        const { data: domain } = await adminClient.from('dialectic_domains')
            .select('id').eq('name', 'Software Development').single();
        assertExists(domain, 'Could not find "Software Development" domain.');

        const { data: project, error: projectError } = await adminClient.from(
            'dialectic_projects',
        ).insert({
            project_name: 'Trigger Isolation Test Project',
            initial_user_prompt: 'Test prompt',
            user_id: testUserId,
            selected_domain_id: domain.id,
        }).select('id').single();

        assert(!projectError, `Failed to create test project: ${projectError?.message}`);
        assertExists(project, 'Test project was not created.');
        testProjectId = project.id;

        const { data: stage } = await adminClient.from('dialectic_stages')
            .select('id').eq('slug', 'thesis').single();
        assertExists(stage, 'Could not find "thesis" stage.');

        const { data: session, error: sessionError } = await adminClient.from(
            'dialectic_sessions',
        ).insert({
            project_id: testProjectId,
            current_stage_id: stage.id,
        }).select('id').single();

        assert(!sessionError, `Failed to create test session: ${sessionError?.message}`);
        assertExists(session, 'Test session was not created.');
        testSessionId = session.id;
    });

    afterEach(async () => {
        if (jobsToDelete.length > 0) {
            await adminClient.from('dialectic_trigger_logs').delete().in(
                'job_id',
                jobsToDelete,
            );
            await adminClient
                .from('dialectic_generation_jobs')
                .delete()
                .in('id', jobsToDelete);
            jobsToDelete.length = 0; // Clear the array
        }
        if (testSessionId) {
            await adminClient.from('dialectic_sessions').delete().eq('id', testSessionId);
        }
        if (testProjectId) {
            await adminClient.from('dialectic_projects').delete().eq('id', testProjectId);
        }
    });

    it('should invoke worker for a normal job', async () => {
        const { data: model } = await adminClient.from('ai_providers').select('id').limit(1).single();
        assertExists(model, "Could not find an AI provider to use for test.");

        const normalPayload = {
            'is_test_job': false,
            'user_jwt': testUserJwt,
            'sessionId': testSessionId,
            'projectId': testProjectId,
            'model_id': model.id,
            'walletId': '00000000-0000-0000-0000-000000000000', // Dummy wallet for validation
        };

        const { data, error } = await adminClient
            .from('dialectic_generation_jobs')
            .insert({
                'payload': normalPayload,
                'status': 'pending',
                'session_id': testSessionId,
                'user_id': testUserId,
                'iteration_number': 1,
                'stage_slug': 'test',
            })
            .select('id')
            .single();

        assert(!error, `Failed to insert normal job: ${error?.message}`);
        assertExists(data, 'Normal job insertion did not return data.');

        const jobId = data.id;
        jobsToDelete.push(jobId);

        const logs = await pollForTriggerLog(
            adminClient,
            jobId,
            2,
            `Expected two trigger logs for normal job ${jobId}`,
        );

        assertEquals(
            logs.length,
            2,
            `Expected exactly two trigger logs for the normal job (prepare and after_post), but got ${logs.length}`,
        );

        const prepareLog = logs.find(log => log.log_message === 'Preparing HTTP call');
        assertExists(prepareLog, "The 'Preparing HTTP call' log was not found.");

        const afterPostLog = logs.find(log => log.log_message === 'invoke_dialectic_worker: after_post');
        assertExists(afterPostLog, "The 'invoke_dialectic_worker: after_post' log was not found.");
    });

    it('should not invoke worker for jobs marked as test jobs', async () => {
        const testPayload = {
            'is_test_job': true,
            'user_jwt': testUserJwt, // A test job would still have a JWT
        };

        const { data, error } = await adminClient
            .from('dialectic_generation_jobs')
            .insert({
                'payload': testPayload,
                'status': 'pending',
                'session_id': testSessionId,
                'user_id': testUserId,
                'iteration_number': 1,
                'stage_slug': 'test',
            })
            .select('id')
            .single();

        assert(!error, `Failed to insert test job: ${error?.message}`);
        assertExists(data, 'Test job insertion did not return data.');

        const jobId = data.id;
        jobsToDelete.push(jobId);

        // Poll for at least one log entry to appear.
        const logs = await pollForTriggerLog(
            adminClient,
            jobId,
            1, // We only need to wait for the first log to know the trigger ran
            `Expected at least one trigger log for test job ${jobId}`,
        );

        // This test is designed to fail until the trigger logic is updated.
        // It currently logs 'Preparing HTTP call' and 'after_post' instead of the expected skipping message.
        const skippingLog = logs.find(
            (log) =>
                log.log_message ===
                    'Test job detected. Skipping HTTP worker invocation.',
        );

        assertExists(
            skippingLog,
            "Expected the trigger to log that it was skipping the test job, but no such log was found.",
        );
    });
});
