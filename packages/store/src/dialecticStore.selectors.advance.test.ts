import { describe, it, expect } from 'vitest';
import { selectCanAdvanceStage } from './dialecticStore.selectors';
import { initialDialecticStateValues } from './dialecticStore';
import type {
    DialecticStateValues,
    SelectCanAdvanceStageReturn,
    DialecticSession,
    DialecticStage,
    DialecticProcessTemplate,
    DialecticProject,
    DialecticStageRecipe,
    DialecticStageRecipeStep,
    StageRunProgressSnapshot,
} from '@paynless/types';
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';

describe('selectCanAdvanceStage', () => {
    const sessionId = 'session-advance';
    const iterationNumber = 1;
    const progressKey = (stageSlug: string): string =>
        `${sessionId}:${stageSlug}:${iterationNumber}`;

    const stageCurrent: DialecticStage = {
        id: 'stage-current',
        slug: 'current',
        display_name: 'Current',
        description: '',
        created_at: new Date().toISOString(),
        default_system_prompt_id: null,
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        minimum_balance: 0,
    };
    const stageNext: DialecticStage = {
        id: 'stage-next',
        slug: 'next',
        display_name: 'Next',
        description: '',
        created_at: new Date().toISOString(),
        default_system_prompt_id: null,
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        minimum_balance: 0,
    };
    const templateTwoStages: DialecticProcessTemplate = {
        id: 'pt-advance',
        name: 'Advance Template',
        description: '',
        created_at: new Date().toISOString(),
        starting_stage_id: stageCurrent.id,
        stages: [stageCurrent, stageNext],
        transitions: [
            {
                id: 't1',
                process_template_id: 'pt-advance',
                source_stage_id: stageCurrent.id,
                target_stage_id: stageNext.id,
                created_at: new Date().toISOString(),
                condition_description: null,
            },
        ],
    };
    const stepWithOutput: DialecticStageRecipeStep = {
        id: 'step-1',
        step_key: 'doc_step',
        step_slug: 'doc-step',
        step_name: 'Doc Step',
        execution_order: 1,
        parallel_group: 1,
        branch_key: 'b1',
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        output_type: 'assembled_document_json',
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: [
            { document_key: 'doc_a', artifact_class: 'rendered_document', file_type: 'markdown' },
        ],
    };
    const recipeCurrent: DialecticStageRecipe = {
        stageSlug: 'current',
        instanceId: 'inst-current',
        steps: [stepWithOutput],
        edges: [],
    };
    const recipeNext: DialecticStageRecipe = {
        stageSlug: 'next',
        instanceId: 'inst-next',
        steps: [
            {
                ...stepWithOutput,
                id: 'step-2',
                step_key: 'doc_step_next',
                step_slug: 'doc-step-next',
                inputs_required: [{ type: 'document', slug: 'current.doc_a', required: true, document_key: 'doc_a' }],
                outputs_required: [{ document_key: 'doc_b', artifact_class: 'rendered_document', file_type: 'markdown' }],
            },
        ],
        edges: [],
    };
    const emptyProgress: StageRunProgressSnapshot = {
        stepStatuses: {},
        documents: {},
        jobProgress: {},
        progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
        jobs: [],
    };

    const baseSession: DialecticSession = {
        id: sessionId,
        project_id: 'proj-advance',
        session_description: null,
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: 'model-1', displayName: 'Model 1' }],
        status: null,
        associated_chat_id: null,
        current_stage_id: stageCurrent.id,
        viewing_stage_id: stageCurrent.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const projectWithSession: DialecticProject = {
        id: 'proj-advance',
        user_id: 'user1',
        project_name: 'Advance Project',
        initial_user_prompt: null,
        selected_domain_id: 'd1',
        dialectic_domains: { name: 'Tech' },
        selected_domain_overlay_id: null,
        repo_url: null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        dialectic_sessions: [baseSession],
        resources: [],
        process_template_id: 'pt-advance',
        dialectic_process_templates: templateTwoStages,
        isLoadingProcessTemplate: false,
        processTemplateError: null,
        contributionGenerationStatus: 'idle',
        generateContributionsError: null,
        isSubmittingStageResponses: false,
        submitStageResponsesError: null,
        isSavingContributionEdit: false,
        saveContributionEditError: null,
    };

    it('returns canAdvance: false when session is null', () => {
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            activeSessionDetail: null,
            currentProcessTemplate: templateTwoStages,
            stageRunProgress: {},
            recipesByStageSlug: {},
        };
        const result: SelectCanAdvanceStageReturn = selectCanAdvanceStage(state);
        expect(result.canAdvance).toBe(false);
        expect(result.reason).not.toBeNull();
        expect(typeof result.reason).toBe('string');
    });

    it('returns canAdvance: false when template is null', () => {
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            activeSessionDetail: baseSession,
            currentProcessTemplate: null,
            currentProjectDetail: projectWithSession,
            stageRunProgress: {},
            recipesByStageSlug: {},
        };
        const result: SelectCanAdvanceStageReturn = selectCanAdvanceStage(state);
        expect(result.canAdvance).toBe(false);
        expect(result.reason).not.toBeNull();
    });

    it('returns canAdvance false when current_stage_id does not match viewing_stage_id (logical does not match viewing)', () => {
        const session: DialecticSession = {
            ...baseSession,
            current_stage_id: stageCurrent.id,
            viewing_stage_id: stageNext.id,
        };
        const project: DialecticProject = {
            ...projectWithSession,
            dialectic_sessions: [session],
        };
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            activeSessionDetail: session,
            currentProcessTemplate: templateTwoStages,
            currentProjectDetail: project,
            recipesByStageSlug: { current: recipeCurrent, next: recipeNext },
            stageRunProgress: {
                [progressKey('current')]: {
                    ...emptyProgress,
                    stepStatuses: { doc_step: 'completed' },
                    documents: {
                        [`doc_a${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}model-1`]: {
                            descriptorType: 'rendered',
                            status: 'completed',
                            job_id: 'j1',
                            latestRenderedResourceId: 'r1',
                            modelId: 'model-1',
                            versionHash: 'v1',
                            lastRenderedResourceId: 'r1',
                            lastRenderAtIso: new Date().toISOString(),
                            stepKey: 'doc_step',
                        },
                    },
                    progress: { completedSteps: 1, totalSteps: 1, failedSteps: 0 },
                    jobs: [],
                },
                [progressKey('next')]: emptyProgress,
            },
        };
        const result: SelectCanAdvanceStageReturn = selectCanAdvanceStage(state);
        expect(result.conditions.logicalMatchesViewing).toBe(false);
        expect(result.canAdvance).toBe(false);
        expect(result.reason).not.toBeNull();
    });

    it('returns canAdvance false when not all T×M documents completed for current stage (outputs_required not satisfied)', () => {
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            activeSessionDetail: baseSession,
            currentProcessTemplate: templateTwoStages,
            currentProjectDetail: projectWithSession,
            recipesByStageSlug: { current: recipeCurrent, next: recipeNext },
            stageRunProgress: {
                [progressKey('current')]: {
                    ...emptyProgress,
                    stepStatuses: { doc_step: 'in_progress' },
                    documents: {},
                    progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 },
                    jobs: [],
                },
                [progressKey('next')]: emptyProgress,
            },
        };
        const result: SelectCanAdvanceStageReturn = selectCanAdvanceStage(state);
        expect(result.conditions.currentStageComplete).toBe(false);
        expect(result.canAdvance).toBe(false);
        expect(result.reason).not.toBeNull();
    });

    it('returns canAdvance false when next stage inputs_required not satisfied (prior outputs missing)', () => {
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            activeSessionDetail: baseSession,
            currentProcessTemplate: templateTwoStages,
            currentProjectDetail: projectWithSession,
            recipesByStageSlug: { current: recipeCurrent, next: recipeNext },
            stageRunProgress: {
                [progressKey('current')]: {
                    ...emptyProgress,
                    stepStatuses: { doc_step: 'completed' },
                    documents: {},
                    progress: { completedSteps: 1, totalSteps: 1, failedSteps: 0 },
                    jobs: [],
                },
                [progressKey('next')]: emptyProgress,
            },
        };
        const result: SelectCanAdvanceStageReturn = selectCanAdvanceStage(state);
        expect(result.conditions.nextStageInputsReady).toBe(false);
        expect(result.canAdvance).toBe(false);
        expect(result.reason).not.toBeNull();
    });

    it('returns canAdvance false when current stage has jobs paused, running, or failed', () => {
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            activeSessionDetail: baseSession,
            currentProcessTemplate: templateTwoStages,
            currentProjectDetail: projectWithSession,
            recipesByStageSlug: { current: recipeCurrent, next: recipeNext },
            stageRunProgress: {
                [progressKey('current')]: {
                    ...emptyProgress,
                    stepStatuses: { doc_step: 'in_progress' },
                    documents: {},
                    progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 },
                    jobs: [
                        {
                            id: 'j1',
                            status: 'processing',
                            jobType: 'EXECUTE',
                            stepKey: 'doc_step',
                            modelId: 'model-1',
                            documentKey: 'doc_a',
                            parentJobId: null,
                            createdAt: new Date().toISOString(),
                            startedAt: new Date().toISOString(),
                            completedAt: null,
                            modelName: 'Model 1',
                        },
                    ],
                },
                [progressKey('next')]: emptyProgress,
            },
        };
        const result: SelectCanAdvanceStageReturn = selectCanAdvanceStage(state);
        expect(result.conditions.currentStageNoActiveJobs).toBe(false);
        expect(result.canAdvance).toBe(false);
        expect(result.reason).not.toBeNull();
    });

    it('returns canAdvance false when next stage has progress (jobs started, paused, running, or failed)', () => {
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            activeSessionDetail: baseSession,
            currentProcessTemplate: templateTwoStages,
            currentProjectDetail: projectWithSession,
            recipesByStageSlug: { current: recipeCurrent, next: recipeNext },
            stageRunProgress: {
                [progressKey('current')]: {
                    ...emptyProgress,
                    stepStatuses: { doc_step: 'completed' },
                    documents: {
                        [`doc_a${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}model-1`]: {
                            descriptorType: 'rendered',
                            status: 'completed',
                            job_id: 'j1',
                            latestRenderedResourceId: 'r1',
                            modelId: 'model-1',
                            versionHash: 'v1',
                            lastRenderedResourceId: 'r1',
                            lastRenderAtIso: new Date().toISOString(),
                            stepKey: 'doc_step',
                        },
                    },
                    progress: { completedSteps: 1, totalSteps: 1, failedSteps: 0 },
                    jobs: [],
                },
                [progressKey('next')]: {
                    ...emptyProgress,
                    stepStatuses: { doc_step_next: 'in_progress' },
                    progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 },
                },
            },
        };
        const result: SelectCanAdvanceStageReturn = selectCanAdvanceStage(state);
        expect(result.conditions.nextStageNoProgress).toBe(false);
        expect(result.canAdvance).toBe(false);
        expect(result.reason).not.toBeNull();
    });

    it('returns canAdvance false when current stage has no outgoing transition (next stage does not exist)', () => {
        const templateNoNext: DialecticProcessTemplate = {
            ...templateTwoStages,
            transitions: [],
        };
        const project: DialecticProject = {
            ...projectWithSession,
            dialectic_process_templates: templateNoNext,
        };
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            activeSessionDetail: baseSession,
            currentProcessTemplate: templateNoNext,
            currentProjectDetail: project,
            recipesByStageSlug: { current: recipeCurrent, next: recipeNext },
            stageRunProgress: {
                [progressKey('current')]: {
                    ...emptyProgress,
                    stepStatuses: { doc_step: 'completed' },
                    documents: {
                        [`doc_a${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}model-1`]: {
                            descriptorType: 'rendered',
                            status: 'completed',
                            job_id: 'j1',
                            latestRenderedResourceId: 'r1',
                            modelId: 'model-1',
                            versionHash: 'v1',
                            lastRenderedResourceId: 'r1',
                            lastRenderAtIso: new Date().toISOString(),
                            stepKey: 'doc_step',
                        },
                    },
                    progress: { completedSteps: 1, totalSteps: 1, failedSteps: 0 },
                    jobs: [],
                },
                [progressKey('next')]: emptyProgress,
            },
        };
        const result: SelectCanAdvanceStageReturn = selectCanAdvanceStage(state);
        expect(result.conditions.nextStageExists).toBe(false);
        expect(result.canAdvance).toBe(false);
        expect(result.reason).not.toBeNull();
    });

    it('returns canAdvance true when current equals viewing, current stage complete, next inputs ready, no active jobs on current, no progress on next, and next stage exists', () => {
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            activeSessionDetail: baseSession,
            currentProcessTemplate: templateTwoStages,
            currentProjectDetail: projectWithSession,
            recipesByStageSlug: { current: recipeCurrent, next: recipeNext },
            stageRunProgress: {
                [progressKey('current')]: {
                    ...emptyProgress,
                    stepStatuses: { doc_step: 'completed' },
                    documents: {
                        [`doc_a${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}model-1`]: {
                            descriptorType: 'rendered',
                            status: 'completed',
                            job_id: 'j1',
                            latestRenderedResourceId: 'r1',
                            modelId: 'model-1',
                            versionHash: 'v1',
                            lastRenderedResourceId: 'r1',
                            lastRenderAtIso: new Date().toISOString(),
                            stepKey: 'doc_step',
                        },
                    },
                    progress: { completedSteps: 1, totalSteps: 1, failedSteps: 0 },
                    jobs: [
                        {
                            id: 'j1',
                            status: 'completed',
                            jobType: 'EXECUTE',
                            stepKey: 'doc_step',
                            modelId: 'model-1',
                            documentKey: 'doc_a',
                            parentJobId: null,
                            createdAt: new Date().toISOString(),
                            startedAt: new Date().toISOString(),
                            completedAt: new Date().toISOString(),
                            modelName: 'Model 1',
                        },
                    ],
                },
                [progressKey('next')]: emptyProgress,
            },
        };
        const result: SelectCanAdvanceStageReturn = selectCanAdvanceStage(state);
        expect(result.conditions.logicalMatchesViewing).toBe(true);
        expect(result.conditions.currentStageComplete).toBe(true);
        expect(result.conditions.nextStageInputsReady).toBe(true);
        expect(result.conditions.currentStageNoActiveJobs).toBe(true);
        expect(result.conditions.nextStageNoProgress).toBe(true);
        expect(result.conditions.nextStageExists).toBe(true);
        expect(result.canAdvance).toBe(true);
        expect(result.reason).toBeNull();
    });

    it('reason is non-empty when canAdvance is false', () => {
        const stateSessionNull: DialecticStateValues = {
            ...initialDialecticStateValues,
            activeSessionDetail: null,
            currentProcessTemplate: templateTwoStages,
            stageRunProgress: {},
            recipesByStageSlug: {},
        };
        const resultSessionNull: SelectCanAdvanceStageReturn = selectCanAdvanceStage(stateSessionNull);
        expect(resultSessionNull.canAdvance).toBe(false);
        expect(resultSessionNull.reason).toBeDefined();
        expect(resultSessionNull.reason).not.toBe('');
    });
});
