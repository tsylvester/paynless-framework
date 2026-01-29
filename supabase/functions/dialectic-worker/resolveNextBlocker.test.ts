import {
    assertEquals,
    assertExists,
    assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { describe, it, beforeEach } from 'https://deno.land/std@0.170.0/testing/bdd.ts';
import { Database } from '../types_db.ts';
import { createMockSupabaseClient, MockQueryBuilderState, MockSupabaseClientSetup } from '../_shared/supabase.mock.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MockLogger } from '../_shared/logger.mock.ts';
import { ILogger } from '../_shared/types.ts';
import {
    DialecticJobRow,
    DialecticRenderJobPayload,
    DialecticExecuteJobPayload,
    DialecticSkeletonJobPayload,
    DialecticRecipeTemplateStep,
    RequiredArtifactIdentity,
    ResolveNextBlockerDeps,
    ResolveNextBlockerParams,
    ResolveNextBlockerResult,
} from '../dialectic-service/dialectic.interface.ts';
import { FileType, ModelContributionFileTypes } from '../_shared/types/file_manager.types.ts';
import { isJson } from '../_shared/utils/type_guards.ts';
import { resolveNextBlocker } from './resolveNextBlocker.ts';

const PROJECT_ID = 'project-uuid-123';
const SESSION_ID = 'session-uuid-456';
const STAGE_SLUG = 'parenthesis';
const ITERATION = 1;
const MODEL_SLUG_A = 'gpt-4';
const MODEL_SLUG_B = 'claude-3-opus';
const MODEL_SLUG_C = 'gemini-1.5-pro';
const MODEL_ID_A = 'model-id-a';
const MODEL_ID_B = 'model-id-b';
const MODEL_ID_C = 'model-id-c';
const USER_ID = 'user-uuid-789';

const createMockLogger = (): ILogger => new MockLogger();

function createRequiredArtifactIdentity(
    modelId: string,
    documentKey: string,
): RequiredArtifactIdentity {
    return {
        projectId: PROJECT_ID,
        sessionId: SESSION_ID,
        stageSlug: STAGE_SLUG,
        iterationNumber: ITERATION,
        model_id: modelId,
        documentKey: documentKey,
        branchKey: null,
        parallelGroup: null,
        sourceGroupFragment: null,
    };
}

function createRenderJob(
    id: string,
    modelId: string,
    modelSlug: string,
    documentKey: FileType,
    status: DialecticJobRow['status'],
): DialecticJobRow {
    const payload: DialecticRenderJobPayload = {
        sessionId: SESSION_ID,
        projectId: PROJECT_ID,
        stageSlug: STAGE_SLUG,
        model_id: modelId,
        walletId: 'wallet-id',
        user_jwt: 'user-jwt',
        documentIdentity: `${modelSlug}_${documentKey}`,
        documentKey: documentKey,
        sourceContributionId: 'source-contribution-id',
        template_filename: 'template.md',
    };
    if (!isJson(payload)) {
        throw new Error('Test setup failed: payload is not valid JSON');
    }
    return {
        id: id,
        user_id: USER_ID,
        session_id: SESSION_ID,
        stage_slug: STAGE_SLUG,
        payload: payload,
        iteration_number: ITERATION,
        status: status,
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
        is_test_job: false,
        job_type: 'RENDER',
    };
}

function createExecuteJob(
    id: string,
    modelId: string,
    modelSlug: string,
    outputType: ModelContributionFileTypes,
    status: DialecticJobRow['status'],
): DialecticJobRow {
    const payload: DialecticExecuteJobPayload = {
        sessionId: SESSION_ID,
        projectId: PROJECT_ID,
        stageSlug: STAGE_SLUG,
        model_id: modelId,
        walletId: 'wallet-id',
        user_jwt: 'user-jwt',
        iterationNumber: ITERATION,
        prompt_template_id: 'prompt-template-id',
        output_type: outputType,
        canonicalPathParams: {
            contributionType: 'parenthesis',
            stageSlug: STAGE_SLUG,
            sourceModelSlugs: [],
        },
        inputs: {},
    };
    if (!isJson(payload)) {
        throw new Error('Test setup failed: payload is not valid JSON');
    }
    return {
        id: id,
        user_id: USER_ID,
        session_id: SESSION_ID,
        stage_slug: STAGE_SLUG,
        payload: payload,
        iteration_number: ITERATION,
        status: status,
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
        is_test_job: false,
        job_type: 'EXECUTE',
    };
}

function createSkeletonPlanJob(
    id: string,
    modelId: string,
    recipeStepId: string,
    outputType: FileType,
    status: DialecticJobRow['status'],
): DialecticJobRow {
    const payload: DialecticSkeletonJobPayload = {
        sessionId: SESSION_ID,
        projectId: PROJECT_ID,
        stageSlug: STAGE_SLUG,
        model_id: modelId,
        walletId: 'wallet-id',
        user_jwt: 'user-jwt',
        iterationNumber: ITERATION,
        planner_metadata: {
            recipe_step_id: recipeStepId,
        },
        step_info: {
            current_step: 1,
            total_steps: 1,
        },
    };
    if (!isJson(payload)) {
        throw new Error('Test setup failed: payload is not valid JSON');
    }
    return {
        id: id,
        user_id: USER_ID,
        session_id: SESSION_ID,
        stage_slug: STAGE_SLUG,
        payload: payload,
        iteration_number: ITERATION,
        status: status,
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
        is_test_job: false,
        job_type: 'PLAN',
    };
}

describe('resolveNextBlocker', () => {
    let mockSupabase: MockSupabaseClientSetup;
    let mockDbClient: SupabaseClient<Database>;
    let mockLogger: ILogger;
    let deps: ResolveNextBlockerDeps;

    beforeEach(() => {
        mockLogger = createMockLogger();
        mockSupabase = createMockSupabaseClient();
        mockDbClient = mockSupabase.client as unknown as SupabaseClient<Database>;
        deps = {
            dbClient: mockDbClient,
            logger: mockLogger,
        };
    });

    it('108.c.i: returns RENDER job for model C producing master_plan, never returns model A/B jobs', async () => {
        const renderJobA = createRenderJob('render-job-a', MODEL_ID_A, MODEL_SLUG_A, FileType.master_plan, 'pending');
        const renderJobB = createRenderJob('render-job-b', MODEL_ID_B, MODEL_SLUG_B, FileType.master_plan, 'pending');
        const renderJobC = createRenderJob('render-job-c', MODEL_ID_C, MODEL_SLUG_C, FileType.master_plan, 'pending');

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    select: (state: MockQueryBuilderState) => {
                        const typeFilter = state.filters.find(f => f.column === 'job_type' && f.value === 'RENDER');
                        const statusFilter = state.filters.find(f => f.column === 'status');
                        if (typeFilter && statusFilter) {
                            return Promise.resolve({
                                data: [renderJobA, renderJobB, renderJobC],
                                error: null,
                                count: 3,
                                status: 200,
                                statusText: 'OK',
                            });
                        }
                        return Promise.resolve({
                            data: [],
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });
        deps.dbClient = mockSupabase.client as unknown as SupabaseClient<Database>;

        const params: ResolveNextBlockerParams = {
            projectId: PROJECT_ID,
            sessionId: SESSION_ID,
            stageSlug: STAGE_SLUG,
            iterationNumber: ITERATION,
            model_id: MODEL_ID_C,
            requiredArtifactIdentity: createRequiredArtifactIdentity(MODEL_ID_C, FileType.master_plan),
        };

        const result: ResolveNextBlockerResult | null = await resolveNextBlocker(deps, params);

        assertExists(result);
        assertEquals(result.id, 'render-job-c');
        assertEquals(result.job_type, 'RENDER');
        assertEquals(result.status, 'pending');
    });

    it('108.c.ii: returns EXECUTE job when no RENDER job exists for model C producing master_plan', async () => {
        const executeJobC = createExecuteJob('execute-job-c', MODEL_ID_C, MODEL_SLUG_C, FileType.master_plan, 'pending');

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    select: (state: MockQueryBuilderState) => {
                        const typeFilter = state.filters.find(f => f.column === 'job_type');
                        if (typeFilter && typeFilter.value === 'RENDER') {
                            return Promise.resolve({
                                data: [],
                                error: null,
                                count: 0,
                                status: 200,
                                statusText: 'OK',
                            });
                        }
                        if (typeFilter && typeFilter.value === 'EXECUTE') {
                            return Promise.resolve({
                                data: [executeJobC],
                                error: null,
                                count: 1,
                                status: 200,
                                statusText: 'OK',
                            });
                        }
                        return Promise.resolve({
                            data: [],
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });
        deps.dbClient = mockSupabase.client as unknown as SupabaseClient<Database>;

        const params: ResolveNextBlockerParams = {
            projectId: PROJECT_ID,
            sessionId: SESSION_ID,
            stageSlug: STAGE_SLUG,
            iterationNumber: ITERATION,
            model_id: MODEL_ID_C,
            requiredArtifactIdentity: createRequiredArtifactIdentity(MODEL_ID_C, FileType.master_plan),
        };

        const result: ResolveNextBlockerResult | null = await resolveNextBlocker(deps, params);

        assertExists(result);
        assertEquals(result.id, 'execute-job-c');
        assertEquals(result.job_type, 'EXECUTE');
        assertEquals(result.status, 'pending');
    });

    it('108.c.iii: returns PLAN job when no EXECUTE or RENDER jobs exist, with recipe step producing master_plan', async () => {
        const recipeStep: DialecticRecipeTemplateStep = {
            id: 'generate-master-plan-step-id',
            template_id: 'template-id',
            step_number: 3,
            step_key: 'generate-master-plan',
            step_slug: 'generate-master-plan',
            step_name: 'Generate Master Plan',
            step_description: 'Generate master plan document',
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            prompt_template_id: 'prompt-id',
            output_type: FileType.master_plan,
            granularity_strategy: 'per_model',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: {},
            parallel_group: null,
            branch_key: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const planJobC = createSkeletonPlanJob(
            'plan-job-c',
            MODEL_ID_C,
            'generate-master-plan-step-id',
            FileType.master_plan,
            'pending',
        );

        const getRecipeStep = async (stepId: string): Promise<DialecticRecipeTemplateStep | null> => {
            if (stepId === 'generate-master-plan-step-id') {
                return recipeStep;
            }
            return null;
        };

        deps.getRecipeStep = getRecipeStep;

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    select: (state: MockQueryBuilderState) => {
                        const typeFilter = state.filters.find(f => f.column === 'job_type');
                        if (typeFilter && typeFilter.value === 'RENDER') {
                            return Promise.resolve({
                                data: [],
                                error: null,
                                count: 0,
                                status: 200,
                                statusText: 'OK',
                            });
                        }
                        if (typeFilter && typeFilter.value === 'EXECUTE') {
                            return Promise.resolve({
                                data: [],
                                error: null,
                                count: 0,
                                status: 200,
                                statusText: 'OK',
                            });
                        }
                        if (typeFilter && typeFilter.value === 'PLAN') {
                            return Promise.resolve({
                                data: [planJobC],
                                error: null,
                                count: 1,
                                status: 200,
                                statusText: 'OK',
                            });
                        }
                        return Promise.resolve({
                            data: [],
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });
        deps.dbClient = mockSupabase.client as unknown as SupabaseClient<Database>;

        const params: ResolveNextBlockerParams = {
            projectId: PROJECT_ID,
            sessionId: SESSION_ID,
            stageSlug: STAGE_SLUG,
            iterationNumber: ITERATION,
            model_id: MODEL_ID_C,
            requiredArtifactIdentity: createRequiredArtifactIdentity(MODEL_SLUG_C, FileType.master_plan),
        };

        const result: ResolveNextBlockerResult | null = await resolveNextBlocker(deps, params);

        assertExists(result);
        assertEquals(result.id, 'plan-job-c');
        assertEquals(result.job_type, 'PLAN');
        assertEquals(result.status, 'pending');
    });

    it('108.c.iv: returns RENDER job when both RENDER and EXECUTE jobs exist for same artifact (RENDER has higher priority)', async () => {
        const renderJobC = createRenderJob('render-job-c', MODEL_ID_C, MODEL_SLUG_C, FileType.master_plan, 'pending');
        const executeJobC = createExecuteJob('execute-job-c', MODEL_ID_C, MODEL_SLUG_C, FileType.master_plan, 'pending');

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    select: (state: MockQueryBuilderState) => {
                        const typeFilter = state.filters.find(f => f.column === 'job_type');
                        if (typeFilter && typeFilter.value === 'RENDER') {
                            return Promise.resolve({
                                data: [renderJobC],
                                error: null,
                                count: 1,
                                status: 200,
                                statusText: 'OK',
                            });
                        }
                        if (typeFilter && typeFilter.value === 'EXECUTE') {
                            return Promise.resolve({
                                data: [executeJobC],
                                error: null,
                                count: 1,
                                status: 200,
                                statusText: 'OK',
                            });
                        }
                        return Promise.resolve({
                            data: [],
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });
        deps.dbClient = mockSupabase.client as unknown as SupabaseClient<Database>;

        const params: ResolveNextBlockerParams = {
            projectId: PROJECT_ID,
            sessionId: SESSION_ID,
            stageSlug: STAGE_SLUG,
            iterationNumber: ITERATION,
            model_id: MODEL_ID_C,
            requiredArtifactIdentity: createRequiredArtifactIdentity(MODEL_ID_C, FileType.master_plan),
        };

        const result: ResolveNextBlockerResult | null = await resolveNextBlocker(deps, params);

        assertExists(result);
        assertEquals(result.id, 'render-job-c');
        assertEquals(result.job_type, 'RENDER');
    });

    it('108.c.v: does not return completed RENDER job, continues to check EXECUTE/PLAN', async () => {
        const completedRenderJobC = createRenderJob('render-job-c', MODEL_ID_C, MODEL_SLUG_C, FileType.master_plan, 'completed');
        const executeJobC = createExecuteJob('execute-job-c', MODEL_ID_C, MODEL_SLUG_C, FileType.master_plan, 'pending');

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    select: (state: MockQueryBuilderState) => {
                        const typeFilter = state.filters.find(f => f.column === 'job_type');
                        const statusFilter = state.filters.find(f => f.column === 'status');
                        if (typeFilter && typeFilter.value === 'RENDER' && statusFilter) {
                            return Promise.resolve({
                                data: [completedRenderJobC],
                                error: null,
                                count: 1,
                                status: 200,
                                statusText: 'OK',
                            });
                        }
                        if (typeFilter && typeFilter.value === 'EXECUTE') {
                            return Promise.resolve({
                                data: [executeJobC],
                                error: null,
                                count: 1,
                                status: 200,
                                statusText: 'OK',
                            });
                        }
                        return Promise.resolve({
                            data: [],
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });
        deps.dbClient = mockSupabase.client as unknown as SupabaseClient<Database>;

        const params: ResolveNextBlockerParams = {
            projectId: PROJECT_ID,
            sessionId: SESSION_ID,
            stageSlug: STAGE_SLUG,
            iterationNumber: ITERATION,
            model_id: MODEL_ID_C,
            requiredArtifactIdentity: createRequiredArtifactIdentity(MODEL_ID_C, FileType.master_plan),
        };

        const result: ResolveNextBlockerResult | null = await resolveNextBlocker(deps, params);

        assertExists(result);
        assertEquals(result.id, 'execute-job-c');
        assertEquals(result.job_type, 'EXECUTE');
    });

    it('108.c.vi: returns null when no jobs produce the required artifact', async () => {
        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    select: () => {
                        return Promise.resolve({
                            data: [],
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });
        deps.dbClient = mockSupabase.client as unknown as SupabaseClient<Database>;

        const params: ResolveNextBlockerParams = {
            projectId: PROJECT_ID,
            sessionId: SESSION_ID,
            stageSlug: STAGE_SLUG,
            iterationNumber: ITERATION,
            model_id: MODEL_ID_C,
            requiredArtifactIdentity: createRequiredArtifactIdentity(MODEL_ID_C, FileType.master_plan),
        };

        const result: ResolveNextBlockerResult | null = await resolveNextBlocker(deps, params);

        assertEquals(result, null);
    });

    it('108.c.vii: returns null without querying when requiredArtifactIdentity.documentKey is empty string', async () => {
        const params: ResolveNextBlockerParams = {
            projectId: PROJECT_ID,
            sessionId: SESSION_ID,
            stageSlug: STAGE_SLUG,
            iterationNumber: ITERATION,
            model_id: MODEL_ID_C,
            requiredArtifactIdentity: {
                ...createRequiredArtifactIdentity(MODEL_ID_C, FileType.master_plan),
                documentKey: '',
            },
        };

        const result: ResolveNextBlockerResult | null = await resolveNextBlocker(deps, params);

        assertEquals(result, null);
    });

    it('108.c.viii: correctly handles requiredArtifactIdentity object with all fields for scoping and matching', async () => {
        const renderJobC = createRenderJob('render-job-c', MODEL_ID_C, MODEL_SLUG_C, FileType.master_plan, 'pending');

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    select: (state: MockQueryBuilderState) => {
                        const sessionFilter = state.filters.find(f => f.column === 'session_id' && f.value === SESSION_ID);
                        const stageFilter = state.filters.find(f => f.column === 'stage_slug' && f.value === STAGE_SLUG);
                        const iterationFilter = state.filters.find(f => f.column === 'iteration_number' && f.value === ITERATION);
                        const typeFilter = state.filters.find(f => f.column === 'job_type' && f.value === 'RENDER');
                        if (sessionFilter && stageFilter && iterationFilter && typeFilter) {
                            return Promise.resolve({
                                data: [renderJobC],
                                error: null,
                                count: 1,
                                status: 200,
                                statusText: 'OK',
                            });
                        }
                        return Promise.resolve({
                            data: [],
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });
        deps.dbClient = mockSupabase.client as unknown as SupabaseClient<Database>;

        const params: ResolveNextBlockerParams = {
            projectId: PROJECT_ID,
            sessionId: SESSION_ID,
            stageSlug: STAGE_SLUG,
            iterationNumber: ITERATION,
            model_id: MODEL_ID_C,
            requiredArtifactIdentity: createRequiredArtifactIdentity(MODEL_ID_C, FileType.master_plan),
        };

        const result: ResolveNextBlockerResult | null = await resolveNextBlocker(deps, params);

        assertExists(result);
        assertEquals(result.id, 'render-job-c');
    });

    it('108.c.ix: considers jobs with status in pending, processing, retrying, waiting_for_children, waiting_for_prerequisite as in-progress blockers', async () => {
        const pendingJob = createRenderJob('pending-job', MODEL_ID_C, MODEL_SLUG_C, FileType.master_plan, 'pending');
        const processingJob = createRenderJob('processing-job', MODEL_ID_C, MODEL_SLUG_C, FileType.master_plan, 'processing');
        const retryingJob = createRenderJob('retrying-job', MODEL_ID_C, MODEL_SLUG_C, FileType.master_plan, 'retrying');
        const waitingForChildrenJob = createRenderJob('waiting-children-job', MODEL_ID_C, MODEL_SLUG_C, FileType.master_plan, 'waiting_for_children');
        const waitingForPrereqJob = createRenderJob('waiting-prereq-job', MODEL_ID_C, MODEL_SLUG_C, FileType.master_plan, 'waiting_for_prerequisite');

        const inProgressStatuses = ['pending', 'processing', 'retrying', 'waiting_for_children', 'waiting_for_prerequisite'];

        for (const status of inProgressStatuses) {
            const job = status === 'pending' ? pendingJob :
                        status === 'processing' ? processingJob :
                        status === 'retrying' ? retryingJob :
                        status === 'waiting_for_children' ? waitingForChildrenJob :
                        waitingForPrereqJob;

            mockSupabase = createMockSupabaseClient(undefined, {
                genericMockResults: {
                    'dialectic_generation_jobs': {
                        select: (state: MockQueryBuilderState) => {
                            const typeFilter = state.filters.find(f => f.column === 'job_type' && f.value === 'RENDER');
                            const statusFilter = state.filters.find(f => f.column === 'status');
                            if (typeFilter && statusFilter) {
                                return Promise.resolve({
                                    data: [job],
                                    error: null,
                                    count: 1,
                                    status: 200,
                                    statusText: 'OK',
                                });
                            }
                            return Promise.resolve({
                                data: [],
                                error: null,
                                count: 0,
                                status: 200,
                                statusText: 'OK',
                            });
                        },
                    },
                },
            });
            deps.dbClient = mockSupabase.client as unknown as SupabaseClient<Database>;

            const params: ResolveNextBlockerParams = {
                projectId: PROJECT_ID,
                sessionId: SESSION_ID,
                stageSlug: STAGE_SLUG,
                iterationNumber: ITERATION,
                model_id: MODEL_ID_C,
                requiredArtifactIdentity: createRequiredArtifactIdentity(MODEL_ID_C, FileType.master_plan),
            };

            const result: ResolveNextBlockerResult | null = await resolveNextBlocker(deps, params);

            assertExists(result, `Status ${status} should be considered in-progress`);
            assertEquals(result.status, status);
        }
    });
});
