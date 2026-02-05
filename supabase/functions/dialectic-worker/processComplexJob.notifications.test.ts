import {
    assertEquals,
    assertExists,
    assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import type { Database } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { processComplexJob } from './processComplexJob.ts';
import {
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticRecipeTemplateStep,
} from '../dialectic-service/dialectic.interface.ts';
import { createMockJobProcessors } from '../_shared/dialectic.mock.ts';
import { isJson } from '../_shared/utils/type_guards.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { describe, it, beforeEach } from 'https://deno.land/std@0.170.0/testing/bdd.ts';
import { mockNotificationService, resetMockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { IPlanJobContext } from './JobContext.interface.ts';
import { createPlanJobContext, createJobContext } from './createJobContext.ts';
import { createMockJobContextParams } from './JobContext.mock.ts';

const mockTemplateRecipeSteps: DialecticRecipeTemplateStep[] = [
    {
        step_key: 'step_one_key',
        step_name: 'First Step',
        id: 'template-step-uuid-1',
        template_id: 'template-uuid-1',
        step_slug: 'step-one',
        job_type: 'PLAN',
        prompt_type: 'Turn',
        prompt_template_id: 'prompt-template-1',
        output_type: FileType.business_case,
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {},
        step_number: 1,
        parallel_group: null,
        branch_key: null,
        step_description: 'The first step',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        step_key: 'step_two_key',
        step_name: 'Second Step',
        id: 'template-step-uuid-2',
        template_id: 'template-uuid-1',
        step_slug: 'step-two',
        job_type: 'PLAN',
        prompt_type: 'Turn',
        prompt_template_id: 'prompt-template-2',
        output_type: FileType.business_case_critique,
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {},
        step_number: 2,
        parallel_group: null,
        branch_key: null,
        step_description: 'The second step',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    },
];

const mockTemplateRecipeEdges = [
    {
        id: 'edge-1-2',
        template_id: 'template-uuid-1',
        from_step_id: 'template-step-uuid-1',
        to_step_id: 'template-step-uuid-2',
        created_at: new Date().toISOString(),
    },
];

const mockStageRow = {
    id: 'stage-id-antithesis',
    slug: 'antithesis',
    active_recipe_instance_id: 'instance-uuid-1',
    created_at: new Date().toISOString(),
    display_name: 'Antithesis',
    expected_output_template_ids: [],
    default_system_prompt_id: null,
    description: null,
    recipe_template_id: null,
};

const mockInstanceRow_NotCloned = {
    id: 'instance-uuid-1',
    stage_id: 'stage-id-antithesis',
    template_id: 'template-uuid-1',
    is_cloned: false,
    cloned_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

const projectOwnerUserId = 'user-id-owner';

describe('processComplexJob - PLAN lifecycle notifications', () => {
    let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
    let mockParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload };

    beforeEach(() => {
        resetMockNotificationService();
        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_stages': {
                    select: { data: [mockStageRow], error: null },
                },
                'dialectic_stage_recipe_instances': {
                    select: { data: [mockInstanceRow_NotCloned], error: null },
                },
                'dialectic_recipe_template_steps': {
                    select: { data: mockTemplateRecipeSteps, error: null },
                },
                'dialectic_recipe_template_edges': {
                    select: { data: mockTemplateRecipeEdges, error: null },
                },
                'dialectic_stage_recipe_steps': {
                    select: { data: [], error: null },
                },
            },
        });

        const mockPayload: DialecticPlanJobPayload = {
            sessionId: 'session-id-complex',
            projectId: 'project-id-complex',
            stageSlug: 'antithesis',
            model_id: 'model-id-complex',
            walletId: 'wallet-id-complex',
            user_jwt: 'user-jwt-complex',
        };

        if (!isJson(mockPayload)) {
            throw new Error('Test setup failed: mockPayload is not valid JSON');
        }

        mockParentJob = {
            id: 'job-id-parent',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: mockPayload,
            iteration_number: 1,
            status: 'processing',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: null,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'PLAN',
        };
    });

    it('emits planner_started when PLAN job begins processing', async () => {
        const mockChildJob: DialecticJobRow = {
            id: 'child-1',
            user_id: mockParentJob.user_id,
            session_id: mockParentJob.session_id,
            stage_slug: mockParentJob.stage_slug,
            payload: { message: 'Child 1' },
            iteration_number: 1,
            status: 'pending',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };
        const params = {
            ...createMockJobContextParams(),
            planComplexStage: async () => [mockChildJob],
            notificationService: mockNotificationService,
        };
        const rootCtx = createJobContext(params);
        const planCtx = createPlanJobContext(rootCtx);

        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, projectOwnerUserId, planCtx, 'user-jwt-123');

        const calls = mockNotificationService.sendJobNotificationEvent.calls;
        assert(calls.length >= 1, 'Expected at least one notification');
        const [payloadArg, targetUserId] = calls[0].args;
        assertEquals(payloadArg.type, 'planner_started');
        assertEquals(targetUserId, projectOwnerUserId);
    });

    it('all PLAN payloads include sessionId, stageSlug, iterationNumber, job_id, step_key', async () => {
        const mockChildJob: DialecticJobRow = {
            id: 'child-1',
            user_id: mockParentJob.user_id,
            session_id: mockParentJob.session_id,
            stage_slug: mockParentJob.stage_slug,
            payload: { message: 'Child 1' },
            iteration_number: 1,
            status: 'pending',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };
        const params = {
            ...createMockJobContextParams(),
            planComplexStage: async () => [mockChildJob],
            notificationService: mockNotificationService,
        };
        const rootCtx = createJobContext(params);
        const planCtx = createPlanJobContext(rootCtx);

        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, projectOwnerUserId, planCtx, 'user-jwt-123');

        const [payloadArg] = mockNotificationService.sendJobNotificationEvent.calls[0].args;
        assertEquals(payloadArg.type, 'planner_started');
        assertExists(payloadArg.sessionId);
        assertExists(payloadArg.stageSlug);
        assertExists(payloadArg.iterationNumber);
        assertExists(payloadArg.job_id);
        assertExists(payloadArg.step_key);
    });

    it('PLAN payloads do NOT include modelId or document_key', async () => {
        const mockChildJob: DialecticJobRow = {
            id: 'child-1',
            user_id: mockParentJob.user_id,
            session_id: mockParentJob.session_id,
            stage_slug: mockParentJob.stage_slug,
            payload: { message: 'Child 1' },
            iteration_number: 1,
            status: 'pending',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };
        const params = {
            ...createMockJobContextParams(),
            planComplexStage: async () => [mockChildJob],
            notificationService: mockNotificationService,
        };
        const rootCtx = createJobContext(params);
        const planCtx = createPlanJobContext(rootCtx);

        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, projectOwnerUserId, planCtx, 'user-jwt-123');

        const [payloadArg] = mockNotificationService.sendJobNotificationEvent.calls[0].args;
        assertEquals(payloadArg.type, 'planner_started');
        assertEquals('modelId' in payloadArg ? payloadArg.modelId : undefined, undefined);
        assertEquals('document_key' in payloadArg ? payloadArg.document_key : undefined, undefined);
    });

    it('emits planner_completed when PLAN job transitions to completed (planner returns no children)', async () => {
        const params = {
            ...createMockJobContextParams(),
            planComplexStage: async () => [],
            notificationService: mockNotificationService,
        };
        const rootCtx = createJobContext(params);
        const planCtx = createPlanJobContext(rootCtx);

        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, projectOwnerUserId, planCtx, 'user-jwt-123');

        const calls = mockNotificationService.sendJobNotificationEvent.calls;
        const plannerCompletedCalls = calls.filter((c) => {
            const a = c.args?.[0];
            return a && typeof a === 'object' && (a as { type?: string }).type === 'planner_completed';
        });
        assertEquals(plannerCompletedCalls.length, 1, 'Expected one planner_completed notification');
        const [payloadArg, targetUserId] = plannerCompletedCalls[0].args;
        assertEquals((payloadArg as { type: string }).type, 'planner_completed');
        assertEquals(targetUserId, projectOwnerUserId);
    });

    it('emits job_failed when PLAN job exhausts retries or encounters terminal error', async () => {
        const params = {
            ...createMockJobContextParams(),
            planComplexStage: async () => Promise.reject(new Error('Planner failed!')),
            notificationService: mockNotificationService,
        };
        const rootCtx = createJobContext(params);
        const planCtx = createPlanJobContext(rootCtx);

        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, projectOwnerUserId, planCtx, 'user-jwt-123');

        const calls = mockNotificationService.sendJobNotificationEvent.calls;
        const jobFailedCalls = calls.filter((c) => {
            const a = c.args?.[0];
            return a && typeof a === 'object' && (a as { type?: string }).type === 'job_failed';
        });
        assertEquals(jobFailedCalls.length, 1, 'Expected one job_failed notification');
        const [payloadArg, targetUserId] = jobFailedCalls[0].args;
        assertEquals((payloadArg as { type: string }).type, 'job_failed');
        assertEquals(targetUserId, projectOwnerUserId);
    });

    it('job_failed payload for PLAN omits modelId and document_key', async () => {
        const params = {
            ...createMockJobContextParams(),
            planComplexStage: async () => Promise.reject(new Error('Planner failed!')),
            notificationService: mockNotificationService,
        };
        const rootCtx = createJobContext(params);
        const planCtx = createPlanJobContext(rootCtx);

        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, projectOwnerUserId, planCtx, 'user-jwt-123');

        const calls = mockNotificationService.sendJobNotificationEvent.calls;
        const jobFailedCalls = calls.filter((c) => {
            const a = c.args?.[0];
            return a && typeof a === 'object' && (a as { type?: string }).type === 'job_failed';
        });
        const [payloadArg] = jobFailedCalls[0].args;
        const payload = payloadArg as { modelId?: string; document_key?: string };
        assertEquals(payload.modelId, undefined);
        assertEquals(payload.document_key, undefined);
    });

    it('job_failed payload includes error code and message', async () => {
        const params = {
            ...createMockJobContextParams(),
            planComplexStage: async () => Promise.reject(new Error('Planner failed!')),
            notificationService: mockNotificationService,
        };
        const rootCtx = createJobContext(params);
        const planCtx = createPlanJobContext(rootCtx);

        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, projectOwnerUserId, planCtx, 'user-jwt-123');

        const calls = mockNotificationService.sendJobNotificationEvent.calls;
        const jobFailedCalls = calls.filter((c) => {
            const a = c.args?.[0];
            return a && typeof a === 'object' && (a as { type?: string }).type === 'job_failed';
        });
        const [payloadArg] = jobFailedCalls[0].args;
        const payload = payloadArg as { error?: { code: string; message: string } };
        assertExists(payload.error);
        assertExists(payload.error.code);
        assertExists(payload.error.message);
    });

    it('notification is sent to projectOwnerUserId', async () => {
        const mockChildJob: DialecticJobRow = {
            id: 'child-1',
            user_id: mockParentJob.user_id,
            session_id: mockParentJob.session_id,
            stage_slug: mockParentJob.stage_slug,
            payload: { message: 'Child 1' },
            iteration_number: 1,
            status: 'pending',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };
        const params = {
            ...createMockJobContextParams(),
            planComplexStage: async () => [mockChildJob],
            notificationService: mockNotificationService,
        };
        const rootCtx = createJobContext(params);
        const planCtx = createPlanJobContext(rootCtx);

        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, projectOwnerUserId, planCtx, 'user-jwt-123');

        const calls = mockNotificationService.sendJobNotificationEvent.calls;
        assert(calls.length >= 1);
        for (const c of calls) {
            const targetUserId = c.args?.[1];
            assertEquals(targetUserId, projectOwnerUserId);
        }
    });
});
