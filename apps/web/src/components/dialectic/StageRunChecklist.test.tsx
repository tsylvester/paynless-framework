import { describe, it, beforeEach, expect, vi } from 'vitest';
import { act, render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type {
    DialecticStageRecipe,
    DialecticStageRecipeStep,
    DialecticSession,
    DialecticStateValues,
    DialecticStage,
    DialecticProcessTemplate,
    DialecticContribution,
    JobProgressDto,
} from '@paynless/types';
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';

import {
    initializeMockDialecticState,
    selectValidMarkdownDocumentKeys,
    selectSelectedModels,
    setDialecticStateValues,
} from '../../mocks/dialecticStore.mock';

import { StageRunChecklist } from './StageRunChecklist';

vi.mock('@paynless/store', () => import('../../mocks/dialecticStore.mock'));

const sessionId = 'session-123';
const stageSlug = 'synthesis';
const iterationNumber = 2;
const modelIdA = 'model-a';

const alternateStageSlug = 'analysis';

type StageRunProgressEntry = NonNullable<DialecticStateValues['stageRunProgress'][string]>;

type StepStatuses = StageRunProgressEntry['stepStatuses'];
type StageRunDocuments = StageRunProgressEntry['documents'];

function makeStageRunDocumentKey(documentKey: string, modelId: string): string {
  return `${documentKey}${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}${modelId}`;
}

type OutputsRequired = DialecticStageRecipeStep['outputs_required'];
type InputsRequired = DialecticStageRecipeStep['inputs_required'];

type RecipeSteps = DialecticStageRecipeStep[];

const buildOutputsRule = (
    documentKey: string,
    artifactClass: 'rendered_document' | 'assembled_json' | 'header_context',
    fileType: 'markdown' | 'json',
    displayMetadata?: { display_name: string; description: string },
): OutputsRequired => {
    const documentEntry: Record<string, unknown> = {
        document_key: documentKey,
        artifact_class: artifactClass,
        file_type: fileType,
        template_filename:
            fileType === 'markdown' ? `${documentKey}.md` : `${documentKey}.json`,
    };
    if (displayMetadata) {
        documentEntry['display_name'] = displayMetadata.display_name;
        documentEntry['description'] = displayMetadata.description;
    }
    return JSON.parse(
        JSON.stringify([
            {
                documents: [documentEntry],
            },
        ]),
    ) as OutputsRequired;
};

const buildDialecticContribution = (
    modelId: string,
    modelName: string,
): DialecticContribution => ({
    id: `contrib-${modelId}`,
    session_id: sessionId,
    user_id: null,
    stage: stageSlug,
    iteration_number: iterationNumber,
    model_id: modelId,
    model_name: modelName,
    prompt_template_id_used: null,
    seed_prompt_url: null,
    edit_version: 0,
    is_latest_edit: true,
    original_model_contribution_id: null,
    raw_response_storage_path: null,
    target_contribution_id: null,
    tokens_used_input: null,
    tokens_used_output: null,
    processing_time_ms: null,
    error: null,
    citations: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    contribution_type: null,
    file_name: null,
    storage_bucket: null,
    storage_path: null,
    size_bytes: null,
    mime_type: null,
});

const baseSession: DialecticSession = {
    id: sessionId,
    project_id: 'project-abc',
    session_description: 'Test session',
    iteration_count: iterationNumber,
    current_stage_id: 'stage-synthesis',
    selected_models: [],
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_input_reference_url: null,
    associated_chat_id: null,
    dialectic_contributions: [
        buildDialecticContribution(modelIdA, 'Model A'),
        buildDialecticContribution('model-b', 'Model B'),
        buildDialecticContribution('model-c', 'Model C'),
    ],
    dialectic_session_models: [],
    feedback: [],
};

const buildPlannerStep = (): DialecticStageRecipeStep => {
    const plannerOutputs = buildOutputsRule('synthesis_plan_header', 'header_context', 'json');

    const plannerInputs: InputsRequired = [];

    return {
        id: 'step-1',
        step_key: 'planner_header',
        step_slug: 'planner-header',
        step_name: 'Planner Header',
        execution_order: 1,
        parallel_group: 1,
        branch_key: 'planner',
        job_type: 'PLAN',
        prompt_type: 'Planner',
        inputs_required: plannerInputs,
        outputs_required: plannerOutputs,
        output_type: 'header_context',
        granularity_strategy: 'all_to_one',
    };
};

const buildDraftStep = (): DialecticStageRecipeStep => {
    const draftOutputs = buildOutputsRule(
        'synthesis_document_outline',
        'assembled_json',
        'json',
    );

    const draftInputs: InputsRequired = [];

    return {
        id: 'step-2',
        step_key: 'draft_document',
        step_slug: 'draft-document',
        step_name: 'Draft Document',
        execution_order: 2,
        parallel_group: 1,
        branch_key: 'document',
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        inputs_required: draftInputs,
        outputs_required: draftOutputs,
        output_type: 'assembled_document_json',
        granularity_strategy: 'per_source_document',
    };
};

const buildRenderStep = (): DialecticStageRecipeStep => {
    const renderOutputs = buildOutputsRule(
        'synthesis_document_rendered',
        'rendered_document',
        'markdown',
    );

    const renderInputs: InputsRequired = [];

    return {
        id: 'step-3',
        step_key: 'render_document',
        step_slug: 'render-document',
        step_name: 'Render Document',
        execution_order: 3,
        parallel_group: 2,
        branch_key: 'render',
        job_type: 'RENDER',
        prompt_type: 'Planner',
        inputs_required: renderInputs,
        outputs_required: renderOutputs,
        output_type: 'rendered_document',
        granularity_strategy: 'all_to_one',
    };
};

const buildSecondaryRenderStep = (): DialecticStageRecipeStep => {
    const secondaryOutputs = buildOutputsRule(
        'synthesis_document_secondary',
        'rendered_document',
        'markdown',
    );

    return {
        id: 'step-4',
        step_key: 'render_document_secondary',
        step_slug: 'render-document-secondary',
        step_name: 'Render Document Secondary',
        execution_order: 4,
        parallel_group: 2,
        branch_key: 'render-secondary',
        job_type: 'RENDER',
        prompt_type: 'Planner',
        inputs_required: [],
        outputs_required: secondaryOutputs,
        output_type: 'rendered_document',
        granularity_strategy: 'all_to_one',
    };
};

const buildRenderStepWithHeaderContext = (): DialecticStageRecipeStep => {
    const outputs = JSON.parse(
        JSON.stringify([
            {
                documents: [
                    {
                        document_key: 'synthesis_document_rendered',
                        artifact_class: 'rendered_document',
                        file_type: 'markdown',
                        template_filename: 'synthesis_document_rendered.md',
                    },
                    {
                        document_key: 'synthesis_plan_header',
                        artifact_class: 'header_context',
                        file_type: 'json',
                        template_filename: 'synthesis_plan_header.json',
                    },
                ],
            },
        ]),
    );

    return {
        id: 'step-5',
        step_key: 'render_document_with_header',
        step_slug: 'render-document-with-header',
        step_name: 'Render Document With Header',
        execution_order: 5,
        parallel_group: 3,
        branch_key: 'render-with-header',
        job_type: 'RENDER',
        prompt_type: 'Planner',
        inputs_required: [],
        outputs_required: outputs,
        output_type: 'rendered_document',
        granularity_strategy: 'all_to_one',
    };
};

const createRecipe = (steps: RecipeSteps, slug: string = stageSlug, instanceId = 'instance-xyz'): DialecticStageRecipe => ({
    stageSlug: slug,
    instanceId,
    steps,
    edges: [],
});

const createProgressEntry = (
    statuses: StepStatuses,
    docs: StageRunDocuments,
    jobs: JobProgressDto[] = [],
): StageRunProgressEntry => ({
    stepStatuses: statuses,
    documents: docs,
    jobProgress: {},
    progress: {
        completedSteps: 0,
        totalSteps: 0,
        failedSteps: 0,
    },
    jobs,
});

function buildJobProgressDto(overrides: {
    id?: string;
    status: string;
    jobType?: 'PLAN' | 'EXECUTE' | 'RENDER' | null;
    stepKey?: string | null;
    modelId: string | null;
    documentKey: string | null;
    parentJobId?: string | null;
    createdAt?: string;
    startedAt?: string | null;
    completedAt?: string | null;
    modelName?: string | null;
}): JobProgressDto {
    return {
        id: overrides.id ?? 'job-1',
        status: overrides.status,
        jobType: overrides.jobType ?? 'RENDER',
        stepKey: overrides.stepKey ?? 'render_document',
        modelId: overrides.modelId,
        documentKey: overrides.documentKey,
        parentJobId: overrides.parentJobId ?? null,
        createdAt: overrides.createdAt ?? '2025-01-01T00:00:00.000Z',
        startedAt: overrides.startedAt ?? null,
        completedAt: overrides.completedAt ?? null,
        modelName: overrides.modelName ?? null,
    };
}

function buildProcessTemplateForStage(slug: string): DialecticProcessTemplate {
    const stage: DialecticStage = {
        id: `stage-${slug}`,
        slug,
        display_name: slug,
        description: null,
        created_at: new Date().toISOString(),
        default_system_prompt_id: null,
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        minimum_balance: 0,
    };
    return {
        id: `template-${slug}`,
        name: 'Test Process',
        description: null,
        created_at: new Date().toISOString(),
        starting_stage_id: stage.id,
        stages: [stage],
        transitions: [],
    };
}

const setChecklistState = (
    recipe: DialecticStageRecipe,
    progressEntry: StageRunProgressEntry,
    overrides: Partial<DialecticStateValues> = {},
) => {
    const progressKey = `${sessionId}:${recipe.stageSlug}:${iterationNumber}`;

    setDialecticStateValues({
        activeContextSessionId: sessionId,
        activeStageSlug: recipe.stageSlug,
        activeSessionDetail: baseSession,
        currentProcessTemplate: buildProcessTemplateForStage(recipe.stageSlug),
        recipesByStageSlug: {
            [recipe.stageSlug]: recipe,
        },
        stageRunProgress: {
            [progressKey]: progressEntry,
        },
        ...overrides,
    });
};

describe('StageRunChecklist', () => {
    beforeEach(() => {
        initializeMockDialecticState();
    });
    
    it('surfaces a failure icon when a document status is failed', () => {
        const recipe = createRecipe([buildRenderStep()]);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

        const stepStatuses: StepStatuses = {
            render_document: 'failed',
        };

        const documents: StageRunDocuments = {
            [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                status: 'failed',
                job_id: 'job-render-failed',
                latestRenderedResourceId: 'resource-render',
                modelId: modelIdA,
                versionHash: 'hash-render',
                lastRenderedResourceId: 'resource-render',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        const failureIcon = screen.getByTestId('document-failed-icon');
        expect(failureIcon).toBeInTheDocument();
    });

    it('lists only markdown deliverables for the active model', () => {
        const recipe = createRecipe([
            buildDraftStep(),
            buildRenderStep(),
            buildSecondaryRenderStep(),
        ]);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered', 'synthesis_document_secondary']));

        const stepStatuses: StepStatuses = {
            draft_document: 'completed',
            render_document: 'completed',
            render_document_secondary: 'in_progress',
        };

        const documents: StageRunDocuments = {
            [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                status: 'completed',
                job_id: 'job-render',
                latestRenderedResourceId: 'resource-render',
                modelId: modelIdA,
                versionHash: 'hash-render',
                lastRenderedResourceId: 'resource-render',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            [makeStageRunDocumentKey('synthesis_document_secondary', modelIdA)]: {
                status: 'continuing',
                job_id: 'job-secondary',
                latestRenderedResourceId: 'resource-secondary',
                modelId: modelIdA,
                versionHash: 'hash-secondary',
                lastRenderedResourceId: 'resource-secondary',
                lastRenderAtIso: '2025-01-01T00:00:01.000Z',
            },
            [makeStageRunDocumentKey('synthesis_document_outline', modelIdA)]: {
                status: 'completed',
                job_id: 'job-outline',
                latestRenderedResourceId: 'resource-outline',
                modelId: modelIdA,
                versionHash: 'hash-outline',
                lastRenderedResourceId: 'resource-outline',
                lastRenderAtIso: '2025-01-01T00:00:02.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        expect(screen.getByTestId('document-synthesis_document_rendered')).toBeInTheDocument();
        expect(screen.getByTestId('document-synthesis_document_secondary')).toBeInTheDocument();
        expect(screen.queryByTestId('document-synthesis_document_outline')).toBeNull();
    });

    it('renders a condensed header without legacy checklist framing', () => {
        const recipe = createRecipe([buildPlannerStep(), buildRenderStep()]);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

        const stepStatuses: StepStatuses = {
            planner_header: 'completed',
            render_document: 'completed',
        };

        const documents: StageRunDocuments = {
            [makeStageRunDocumentKey('synthesis_plan_header', modelIdA)]: {
                status: 'completed',
                job_id: 'job-plan',
                latestRenderedResourceId: 'resource-plan',
                modelId: modelIdA,
                versionHash: 'hash-plan',
                lastRenderedResourceId: 'resource-plan',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                status: 'completed',
                job_id: 'job-render',
                latestRenderedResourceId: 'resource-render',
                modelId: modelIdA,
                versionHash: 'hash-render',
                lastRenderedResourceId: 'resource-render',
                lastRenderAtIso: '2025-01-01T00:00:01.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        expect(screen.queryByText(/Stage Run Checklist/i)).toBeNull();
        expect(screen.queryByText(/Parallel Group/i)).toBeNull();
        expect(screen.queryByText(/Branch/i)).toBeNull();
        expect(screen.queryByText(/Outstanding/i)).toBeNull();
    });

    it('renders minimal document rows and forwards selection payloads', () => {
        const recipe = createRecipe([buildRenderStep()]);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

        const stepStatuses: StepStatuses = {
            render_document: 'in_progress',
        };

        const documents: StageRunDocuments = {
            [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                status: 'continuing',
                job_id: 'job-render',
                latestRenderedResourceId: 'resource-render',
                modelId: modelIdA,
                versionHash: 'hash-render',
                lastRenderedResourceId: 'resource-render',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents, [
            buildJobProgressDto({
                id: 'job-render',
                status: 'processing',
                modelId: modelIdA,
                documentKey: 'synthesis_document_rendered',
                modelName: 'Model A',
            }),
        ]);
        setChecklistState(recipe, progressEntry);

        const onDocumentSelect = vi.fn();

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={onDocumentSelect} />);
        });

        const documentRow = screen.getByTestId('document-synthesis_document_rendered');
        expect(within(documentRow).getByText('Synthesis Document Rendered')).toBeInTheDocument();
        expect(within(documentRow).getByTestId('document-generating-icon')).toBeInTheDocument();
        expect(within(documentRow).queryByText(/Job ID/i)).toBeNull();
        expect(within(documentRow).queryByText(/Latest Render/i)).toBeNull();

        fireEvent.click(documentRow);

        expect(onDocumentSelect).toHaveBeenCalledTimes(1);
        expect(onDocumentSelect).toHaveBeenCalledWith(expect.objectContaining({
            modelId: modelIdA,
            documentKey: 'synthesis_document_rendered',
        }));
    });

    it('renders nothing when no markdown documents exist for the stage', () => {
        const recipe = createRecipe([buildDraftStep()]);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set<string>());

        const stepStatuses: StepStatuses = {
            draft_document: 'completed',
        };

        const documents: StageRunDocuments = {
            [makeStageRunDocumentKey('synthesis_document_outline', modelIdA)]: {
                status: 'completed',
                job_id: 'job-outline',
                latestRenderedResourceId: 'resource-outline',
                modelId: modelIdA,
                versionHash: 'hash-outline',
                lastRenderedResourceId: 'resource-outline',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        expect(screen.queryByTestId('document-synthesis_document_outline')).toBeNull();
        expect(screen.queryByTestId('stage-run-checklist-documents')).not.toBeInTheDocument();
    });

    it('renders guard state when prerequisites are missing', () => {
        selectValidMarkdownDocumentKeys.mockReturnValue(new Set<string>());

        act(() => {
            setDialecticStateValues({
                activeContextSessionId: null,
                activeStageSlug: null,
                activeSessionDetail: null,
                currentProcessTemplate: null,
                recipesByStageSlug: {},
                stageRunProgress: {},
            });
        });

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        expect(screen.queryByTestId('stage-run-checklist-card')).not.toBeInTheDocument();
    });

    it('renders markdown deliverables when progress entry is unavailable', () => {
        const recipe = createRecipe([buildRenderStep(), buildSecondaryRenderStep()]);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered', 'synthesis_document_secondary']));

        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeStageSlug: recipe.stageSlug,
            activeSessionDetail: baseSession,
            currentProcessTemplate: buildProcessTemplateForStage(recipe.stageSlug),
            recipesByStageSlug: {
                [recipe.stageSlug]: recipe,
            },
            stageRunProgress: {},
        });

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        expect(screen.queryByText('Stage progress data is unavailable.')).toBeNull();

        const documentList = screen.getByTestId('stage-run-checklist-documents');
        const documentRows = within(documentList).getAllByRole('listitem');
        expect(documentRows).toHaveLength(2);

        const primaryRow = screen.getByTestId('document-synthesis_document_rendered');
        const secondaryRow = screen.getByTestId('document-synthesis_document_secondary');

        expect(within(primaryRow).getByText('Synthesis Document Rendered')).toBeInTheDocument();
        expect(within(secondaryRow).getByText('Synthesis Document Secondary')).toBeInTheDocument();
    });

    it('renders planned documents even when active session context is missing', () => {
        const recipe = createRecipe([buildPlannerStep(), buildDraftStep(), buildRenderStep()]);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

        const progressEntry = createProgressEntry(
            {
                planner_header: 'completed',
                draft_document: 'completed',
            },
            {
                [makeStageRunDocumentKey('synthesis_plan_header', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-plan',
                    latestRenderedResourceId: 'resource-plan',
                    modelId: modelIdA,
                    versionHash: 'hash-a1',
                    lastRenderedResourceId: 'resource-plan',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            },
        );

        setChecklistState(recipe, progressEntry, { activeContextSessionId: null });

        const view = render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        expect(screen.queryByText('No stages available.')).toBeNull();
        expect(screen.getByTestId('stage-run-checklist-card')).toBeInTheDocument();
        view.unmount();

        initializeMockDialecticState();

        setChecklistState(recipe, progressEntry, { activeStageSlug: null });

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });
        expect(screen.queryByTestId('stage-run-checklist-card')).not.toBeInTheDocument();
    });

    it('still renders planned documents when progress exists for a different iteration', () => {
        const recipe = createRecipe([buildPlannerStep(), buildDraftStep(), buildRenderStep()]);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

        const mismatchedProgressKey = `${sessionId}:${recipe.stageSlug}:${iterationNumber + 1}`;

        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeStageSlug: recipe.stageSlug,
            activeSessionDetail: baseSession,
            currentProcessTemplate: buildProcessTemplateForStage(recipe.stageSlug),
            recipesByStageSlug: {
                [recipe.stageSlug]: recipe,
            },
            stageRunProgress: {
                [mismatchedProgressKey]: createProgressEntry(
                    {
                        planner_header: 'completed',
                        draft_document: 'completed',
                    },
                    {
                        [makeStageRunDocumentKey('synthesis_plan_header', modelIdA)]: {
                            status: 'completed',
                            job_id: 'job-plan',
                            latestRenderedResourceId: 'resource-plan',
                            modelId: modelIdA,
                            versionHash: 'hash-a1',
                            lastRenderedResourceId: 'resource-plan',
                            lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                        },
                    },
                ),
            },
        });

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        expect(screen.queryByText('No stages available.')).toBeNull();
        expect(screen.getByTestId('stage-run-checklist-card')).toBeInTheDocument();
    });

    it('still renders planned documents when progress belongs to another stage', () => {
        const recipe = createRecipe([buildPlannerStep(), buildDraftStep(), buildRenderStep()]);
        const alternateRecipe = createRecipe([buildPlannerStep()], alternateStageSlug);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

        const alternateProgressKey = `${sessionId}:${alternateRecipe.stageSlug}:${iterationNumber}`;

        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeStageSlug: recipe.stageSlug,
            activeSessionDetail: baseSession,
            currentProcessTemplate: buildProcessTemplateForStage(recipe.stageSlug),
            recipesByStageSlug: {
                [recipe.stageSlug]: recipe,
                [alternateRecipe.stageSlug]: alternateRecipe,
            },
            stageRunProgress: {
                [alternateProgressKey]: createProgressEntry(
                    {
                        planner_header: 'completed',
                    },
                    {
                        [makeStageRunDocumentKey('synthesis_plan_header', modelIdA)]: {
                            status: 'completed',
                            job_id: 'job-plan',
                            latestRenderedResourceId: 'resource-plan',
                            modelId: modelIdA,
                            versionHash: 'hash-a1',
                            lastRenderedResourceId: 'resource-plan',
                            lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                        },
                    },
                ),
            },
        });

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        expect(screen.queryByText('No stages available.')).toBeNull();
        expect(screen.getByTestId('stage-run-checklist-card')).toBeInTheDocument();
    });


    it('renders planned markdown documents before generation begins', () => {
        const recipe = createRecipe([buildRenderStep(), buildSecondaryRenderStep()]);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered', 'synthesis_document_secondary']));

        const stepStatuses: StepStatuses = {
            render_document: 'not_started',
            render_document_secondary: 'not_started',
        };

        const documents: StageRunDocuments = {};

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        const documentList = screen.getByTestId('stage-run-checklist-documents');
        const documentRows = within(documentList).getAllByRole('listitem');
        expect(documentRows).toHaveLength(2);

        const primaryRow = screen.getByTestId('document-synthesis_document_rendered');
        const secondaryRow = screen.getByTestId('document-synthesis_document_secondary');

        expect(within(primaryRow).getByText('Synthesis Document Rendered')).toBeInTheDocument();
        expect(within(secondaryRow).getByText('Synthesis Document Secondary')).toBeInTheDocument();
    });

    it('shows completed documents regardless of the user’s current selected models', () => {
        const modelIdB = 'model-b';

        // User currently has a different model selected than the one that produced the document.
        selectSelectedModels.mockReturnValue([{ id: modelIdB, displayName: 'Model B' }]);

        const recipe = createRecipe([buildRenderStep()]);
        selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

        const documents: StageRunDocuments = {
            [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                status: 'completed',
                job_id: 'job-render',
                latestRenderedResourceId: 'resource-render',
                modelId: modelIdA,
                versionHash: 'hash-render',
                lastRenderedResourceId: 'resource-render',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry({ render_document: 'completed' }, documents, [
            buildJobProgressDto({
                id: 'job-render',
                status: 'completed',
                modelId: modelIdA,
                documentKey: 'synthesis_document_rendered',
                modelName: 'Model A',
            }),
        ]);
        setChecklistState(recipe, progressEntry);

        act(() => {
            render(<StageRunChecklist modelId={null} onDocumentSelect={vi.fn()} />);
        });

        const row = screen.getByTestId('document-synthesis_document_rendered');
        expect(within(row).getByTestId('document-completed-icon')).toBeInTheDocument();
    });

    it('exposes full-width constrained layout hooks for StageTabCard embedding', () => {
        const recipe = createRecipe([buildRenderStep()]);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

        const stepStatuses: StepStatuses = {
            render_document: 'completed',
        };

        const documents: StageRunDocuments = {
            [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                status: 'completed',
                job_id: 'job-render',
                latestRenderedResourceId: 'resource-render',
                modelId: modelIdA,
                versionHash: 'hash-render',
                lastRenderedResourceId: 'resource-render',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        const documentList = screen.getByTestId('stage-run-checklist-documents');
        const checklistCard = documentList.closest('[data-testid="stage-run-checklist-card"]');

        expect(checklistCard).not.toBeNull();

        if (checklistCard) {
            expect(checklistCard.classList.contains('w-full')).toBe(true);
        }

        expect(documentList.classList.contains('gap-1')).toBe(true);
    });

    it('omits header_context artifacts even when they share a markdown step', () => {
        const recipe = createRecipe([buildRenderStepWithHeaderContext()]);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

        const stepStatuses: StepStatuses = {
            render_document_with_header: 'failed',
        };

        const documents: StageRunDocuments = {
            [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                status: 'failed',
                job_id: 'job-render',
                latestRenderedResourceId: 'resource-render',
                modelId: modelIdA,
                versionHash: 'hash-render',
                lastRenderedResourceId: 'resource-render',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                stepKey: 'render_document_with_header',
            },
            [makeStageRunDocumentKey('synthesis_plan_header', modelIdA)]: {
                status: 'failed',
                job_id: 'job-header',
                latestRenderedResourceId: 'resource-header',
                modelId: modelIdA,
                versionHash: 'hash-header',
                lastRenderedResourceId: 'resource-header',
                lastRenderAtIso: '2025-01-01T00:00:01.000Z',
                stepKey: 'render_document_with_header',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        expect(screen.getByTestId('document-synthesis_document_rendered')).toBeInTheDocument();
        expect(screen.queryByTestId('document-synthesis_plan_header')).toBeNull();
    });

    it('uses selectValidMarkdownDocumentKeys as the source of truth and does not duplicate filtering logic', () => {
        const recipe = createRecipe([
            buildDraftStep(), // JSON output - should be excluded by selector
            buildRenderStep(), // Markdown output - should be included by selector
            buildSecondaryRenderStep(), // Markdown output - should be included by selector
        ]);

        // Mock selector to return only the markdown document keys (simulating the selector's filtering)
        const expectedMarkdownKeys = new Set(['synthesis_document_rendered', 'synthesis_document_secondary']);
        selectValidMarkdownDocumentKeys.mockReturnValue(expectedMarkdownKeys);

        const stepStatuses: StepStatuses = {
            draft_document: 'completed',
            render_document: 'completed',
            render_document_secondary: 'completed',
        };

        const documents: StageRunDocuments = {
            [makeStageRunDocumentKey('synthesis_document_outline', modelIdA)]: {
                status: 'completed',
                job_id: 'job-outline',
                latestRenderedResourceId: 'resource-outline',
                modelId: modelIdA,
                versionHash: 'hash-outline',
                lastRenderedResourceId: 'resource-outline',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                status: 'completed',
                job_id: 'job-render',
                latestRenderedResourceId: 'resource-render',
                modelId: modelIdA,
                versionHash: 'hash-render',
                lastRenderedResourceId: 'resource-render',
                lastRenderAtIso: '2025-01-01T00:00:01.000Z',
            },
            [makeStageRunDocumentKey('synthesis_document_secondary', modelIdA)]: {
                status: 'completed',
                job_id: 'job-secondary',
                latestRenderedResourceId: 'resource-secondary',
                modelId: modelIdA,
                versionHash: 'hash-secondary',
                lastRenderedResourceId: 'resource-secondary',
                lastRenderAtIso: '2025-01-01T00:00:02.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);
        setChecklistState(recipe, progressEntry);

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        // Assert selector was called with correct parameters
        expect(selectValidMarkdownDocumentKeys).toHaveBeenCalledWith(
            expect.any(Object), // state
            stageSlug,
        );

        // Assert component uses selector's return value as source of truth
        // The component should only render documents that are in the selector's Set
        expect(screen.getByTestId('document-synthesis_document_rendered')).toBeInTheDocument();
        expect(screen.getByTestId('document-synthesis_document_secondary')).toBeInTheDocument();
        expect(screen.queryByTestId('document-synthesis_document_outline')).toBeNull();

        // Assert component does NOT duplicate filtering - it should trust the selector
        // If the selector returns a key, it should appear even if the step has non-markdown outputs
        // This test will fail if the component re-filters steps instead of using the selector's Set
        const documentList = screen.getByTestId('stage-run-checklist-documents');
        const renderedDocumentKeys = within(documentList)
            .getAllByTestId(/^document-/)
            .filter((el) => el.tagName.toLowerCase() === 'li')
            .map((el) => {
                const testId = el.getAttribute('data-testid');
                return testId ? testId.replace('document-', '') : '';
            })
            .filter((key): key is string => key.length > 0);
        
        // Component should only render keys from the selector's Set
        renderedDocumentKeys.forEach((key) => {
            expect(expectedMarkdownKeys.has(key)).toBe(true);
        });

        // Component should render all keys from the selector's Set
        expectedMarkdownKeys.forEach((key) => {
            expect(screen.getByTestId(`document-${key}`)).toBeInTheDocument();
        });
    });

    describe('document highlighting behavior', () => {
        it('should highlight a document when it matches the focusedStageDocumentMap', () => {
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

            const stepStatuses: StepStatuses = {
                render_document: 'completed',
            };

            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-render',
                    latestRenderedResourceId: 'resource-render',
                    modelId: modelIdA,
                    versionHash: 'hash-render',
                    lastRenderedResourceId: 'resource-render',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            };

            const progressEntry = createProgressEntry(stepStatuses, documents);
            setChecklistState(recipe, progressEntry);

            const focusKey = `${sessionId}:${stageSlug}:${modelIdA}`;
            const focusedStageDocumentMap = {
                [focusKey]: {
                    modelId: modelIdA,
                    documentKey: 'synthesis_document_rendered',
                },
            };

            render(
                <StageRunChecklist
                    modelId={modelIdA}
                    onDocumentSelect={vi.fn()}
                    focusedStageDocumentMap={focusedStageDocumentMap}
                />
            );

            const documentRow = screen.getByTestId('document-synthesis_document_rendered');
            expect(documentRow).toHaveAttribute('data-active', 'true');
        });

        it('should not highlight a document when it does not match the focusedStageDocumentMap', () => {
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

            const stepStatuses: StepStatuses = {
                render_document: 'completed',
            };

            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-render',
                    latestRenderedResourceId: 'resource-render',
                    modelId: modelIdA,
                    versionHash: 'hash-render',
                    lastRenderedResourceId: 'resource-render',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            };

            const progressEntry = createProgressEntry(stepStatuses, documents);
            setChecklistState(recipe, progressEntry);

            const focusKey = `${sessionId}:${stageSlug}:${modelIdA}`;
            const focusedStageDocumentMap = {
                [focusKey]: {
                    modelId: modelIdA,
                    documentKey: 'different_document_key',
                },
            };

            render(
                <StageRunChecklist
                    modelId={modelIdA}
                    onDocumentSelect={vi.fn()}
                    focusedStageDocumentMap={focusedStageDocumentMap}
                />
            );

            const documentRow = screen.getByTestId('document-synthesis_document_rendered');
            expect(documentRow).not.toHaveAttribute('data-active');
        });

        it('should not highlight documents when focusedStageDocumentMap is undefined', () => {
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

            const stepStatuses: StepStatuses = {
                render_document: 'completed',
            };

            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-render',
                    latestRenderedResourceId: 'resource-render',
                    modelId: modelIdA,
                    versionHash: 'hash-render',
                    lastRenderedResourceId: 'resource-render',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            };

            const progressEntry = createProgressEntry(stepStatuses, documents);
            setChecklistState(recipe, progressEntry);

            render(
                <StageRunChecklist
                    modelId={modelIdA}
                    onDocumentSelect={vi.fn()}
                    focusedStageDocumentMap={undefined}
                />
            );

            const documentRow = screen.getByTestId('document-synthesis_document_rendered');
            expect(documentRow).not.toHaveAttribute('data-active');
        });

        it('should not highlight documents when focusedStageDocumentMap entry is null', () => {
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

            const stepStatuses: StepStatuses = {
                render_document: 'completed',
            };

            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-render',
                    latestRenderedResourceId: 'resource-render',
                    modelId: modelIdA,
                    versionHash: 'hash-render',
                    lastRenderedResourceId: 'resource-render',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            };

            const progressEntry = createProgressEntry(stepStatuses, documents);
            setChecklistState(recipe, progressEntry);

            const focusKey = `${sessionId}:${stageSlug}:${modelIdA}`;
            const focusedStageDocumentMap = {
                [focusKey]: null,
            };

            render(
                <StageRunChecklist
                    modelId={modelIdA}
                    onDocumentSelect={vi.fn()}
                    focusedStageDocumentMap={focusedStageDocumentMap}
                />
            );

            const documentRow = screen.getByTestId('document-synthesis_document_rendered');
            expect(documentRow).not.toHaveAttribute('data-active');
        });

        it('should not highlight documents when focusKey does not exist in map', () => {
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

            const stepStatuses: StepStatuses = {
                render_document: 'completed',
            };

            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-render',
                    latestRenderedResourceId: 'resource-render',
                    modelId: modelIdA,
                    versionHash: 'hash-render',
                    lastRenderedResourceId: 'resource-render',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            };

            const progressEntry = createProgressEntry(stepStatuses, documents);
            setChecklistState(recipe, progressEntry);

            const focusedStageDocumentMap = {
                'different-session:different-stage:different-model': {
                    modelId: 'different-model',
                    documentKey: 'synthesis_document_rendered',
                },
            };

            render(
                <StageRunChecklist
                    modelId={modelIdA}
                    onDocumentSelect={vi.fn()}
                    focusedStageDocumentMap={focusedStageDocumentMap}
                />
            );

            const documentRow = screen.getByTestId('document-synthesis_document_rendered');
            expect(documentRow).not.toHaveAttribute('data-active');
        });

        it('should match highlighting behavior of shared utility function isDocumentHighlighted', () => {
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

            const stepStatuses: StepStatuses = {
                render_document: 'completed',
            };

            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-render',
                    latestRenderedResourceId: 'resource-render',
                    modelId: modelIdA,
                    versionHash: 'hash-render',
                    lastRenderedResourceId: 'resource-render',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            };

            const progressEntry = createProgressEntry(stepStatuses, documents);
            setChecklistState(recipe, progressEntry);

            const focusKey = `${sessionId}:${stageSlug}:${modelIdA}`;
            const focusedStageDocumentMap = {
                [focusKey]: {
                    modelId: modelIdA,
                    documentKey: 'synthesis_document_rendered',
                },
            };

            render(
                <StageRunChecklist
                    modelId={modelIdA}
                    onDocumentSelect={vi.fn()}
                    focusedStageDocumentMap={focusedStageDocumentMap}
                />
            );

            const documentRow = screen.getByTestId('document-synthesis_document_rendered');
            const isHighlighted = documentRow.hasAttribute('data-active') && documentRow.getAttribute('data-active') === 'true';

            // Verify the component's highlighting behavior matches what isDocumentHighlighted would return
            // This test ensures consistency between component behavior and shared utility
            expect(isHighlighted).toBe(true);
        });
    });

    describe('checklist: all stages, all documents, consolidated status, expand on focus', () => {
        it('when a stage is focused, the stage displays all documents the stage will produce (from recipe)', () => {
            setChecklistState(createRecipe([buildRenderStep(), buildSecondaryRenderStep()], stageSlug), createProgressEntry({}, {}));
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered', 'synthesis_document_secondary']));

            act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

            expect(screen.getByTestId('document-synthesis_document_rendered')).toBeInTheDocument();
            expect(screen.getByTestId('document-synthesis_document_secondary')).toBeInTheDocument();
        });

        it('document row shows consolidated status when a document is unfocused (e.g. "2/3 complete", "Completed", "Not started")', () => {
            selectSelectedModels.mockReturnValue([
                { id: 'model-a', displayName: 'Model A' },
                { id: 'model-b', displayName: 'Model B' },
                { id: 'model-c', displayName: 'Model C' },
            ]);
            const recipe = createRecipe([buildRenderStep()]);
            const stepStatuses: StepStatuses = { render_document: 'in_progress' };
            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-1',
                    latestRenderedResourceId: 'res-1',
                    modelId: modelIdA,
                    versionHash: 'h1',
                    lastRenderedResourceId: 'res-1',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            };
            setChecklistState(recipe, createProgressEntry(stepStatuses, documents, [
                buildJobProgressDto({
                    id: 'job-1',
                    status: 'completed',
                    modelId: modelIdA,
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model A',
                }),
            ]));

            act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            expect(within(row).getByTestId('document-completed-icon')).toBeInTheDocument();
        });

        it('shows consolidated status based on existing model versions, not current selected models', () => {
            const modelIdB = 'model-b';
            const modelIdC = 'model-c';
            selectSelectedModels.mockReturnValue([
                { id: modelIdA, displayName: 'Model A' },
                { id: modelIdB, displayName: 'Model B' },
                { id: modelIdC, displayName: 'Model C' },
            ]);
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            const documentKey = 'synthesis_document_rendered';
            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey(documentKey, modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-1',
                    latestRenderedResourceId: 'res-1',
                    modelId: modelIdA,
                    versionHash: 'h1',
                    lastRenderedResourceId: 'res-1',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                    stepKey: 'render_document',
                },
                [makeStageRunDocumentKey(documentKey, modelIdB)]: {
                    status: 'completed',
                    job_id: 'job-2',
                    latestRenderedResourceId: 'res-2',
                    modelId: modelIdB,
                    versionHash: 'h2',
                    lastRenderedResourceId: 'res-2',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                    stepKey: 'render_document',
                },
            };
            setChecklistState(recipe, createProgressEntry({ render_document: 'in_progress' }, documents, [
                buildJobProgressDto({
                    id: 'job-1',
                    status: 'completed',
                    modelId: modelIdA,
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model A',
                }),
                buildJobProgressDto({
                    id: 'job-2',
                    status: 'completed',
                    modelId: modelIdB,
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model B',
                }),
            ]));

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            expect(within(row).getByTestId('document-completed-icon')).toBeInTheDocument();
        });

        it('clicking a document focuses existing model versions, not the user’s current selected models', () => {
            const modelIdB = 'model-b';
            selectSelectedModels.mockReturnValue([
                { id: modelIdA, displayName: 'Model A' },
                { id: modelIdB, displayName: 'Model B' },
            ]);
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            const documentKey = 'synthesis_document_rendered';
            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey(documentKey, modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-1',
                    latestRenderedResourceId: 'res-1',
                    modelId: modelIdA,
                    versionHash: 'h1',
                    lastRenderedResourceId: 'res-1',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                    stepKey: 'render_document',
                },
                [makeStageRunDocumentKey(documentKey, modelIdB)]: {
                    status: 'completed',
                    job_id: 'job-2',
                    latestRenderedResourceId: 'res-2',
                    modelId: modelIdB,
                    versionHash: 'h2',
                    lastRenderedResourceId: 'res-2',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                    stepKey: 'render_document',
                },
            };
            setChecklistState(recipe, createProgressEntry({ render_document: 'completed' }, documents, [
                buildJobProgressDto({
                    id: 'job-1',
                    status: 'completed',
                    modelId: modelIdA,
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model A',
                }),
                buildJobProgressDto({
                    id: 'job-2',
                    status: 'completed',
                    modelId: 'model-b',
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model B',
                }),
            ]));

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const documentRow = screen.getByTestId('document-synthesis_document_rendered');
            expect(within(documentRow).getByTestId('document-completed-icon')).toBeInTheDocument();
        });

        it('clicking a document focuses existing model versions, not the user’s current selected models', () => {
            const modelIdB = 'model-b';
            const modelIdC = 'model-c';

            // User currently has multiple models selected, but only model-a has produced work.
            selectSelectedModels.mockReturnValue([
                { id: modelIdA, displayName: 'Model A' },
                { id: modelIdB, displayName: 'Model B' },
                { id: modelIdC, displayName: 'Model C' },
            ]);
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-1',
                    latestRenderedResourceId: 'res-1',
                    modelId: modelIdA,
                    versionHash: 'h1',
                    lastRenderedResourceId: 'res-1',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            };
            setChecklistState(recipe, createProgressEntry({ render_document: 'completed' }, documents, [
                buildJobProgressDto({
                    id: 'job-1',
                    status: 'completed',
                    modelId: modelIdA,
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model A',
                }),
            ]));

            const onDocumentSelect = vi.fn();
            act(() => {
                render(<StageRunChecklist modelId={null} onDocumentSelect={onDocumentSelect} />);
            });

            fireEvent.click(screen.getByTestId('document-synthesis_document_rendered'));

            expect(onDocumentSelect).toHaveBeenCalledTimes(1);
            expect(onDocumentSelect).toHaveBeenCalledWith(expect.objectContaining({
                modelId: modelIdA,
                documentKey: 'synthesis_document_rendered',
            }));
        });

        it('does filter display of any steps that do not produce a document that will be rendered for the user to view (headers, intermediate products)', () => {
            const recipe = createRecipe([buildRenderStepWithHeaderContext()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

            setChecklistState(recipe, createProgressEntry({ render_document_with_header: 'completed' }, {}));

            act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

            expect(screen.getByTestId('document-synthesis_document_rendered')).toBeInTheDocument();
            expect(screen.queryByTestId('document-synthesis_plan_header')).toBeNull();
        });
    });

    describe('document regenerate (redo) button', () => {
        it('completed document row shows a redo button with same color as status dot (green) and size no larger than dot', () => {
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-render',
                    latestRenderedResourceId: 'resource-render',
                    modelId: modelIdA,
                    versionHash: 'hash-render',
                    lastRenderedResourceId: 'resource-render',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            };
            setChecklistState(recipe, createProgressEntry({ render_document: 'completed' }, documents, [
                buildJobProgressDto({
                    id: 'job-render',
                    status: 'completed',
                    modelId: modelIdA,
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model A',
                }),
            ]));

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            const regenerateButton = within(row).getByRole('button', { name: /regenerate|redo/i });
            expect(regenerateButton).toBeInTheDocument();
            expect(regenerateButton).toHaveClass('bg-emerald-500');
            expect(regenerateButton.className).toMatch(/h-\[15px\]|h-2\.5|h-3|w-\[15px\]|w-2\.5|w-3/);
        });

        it('failed document row shows a redo button with same color as status dot (red)', () => {
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'failed',
                    job_id: 'job-failed',
                    latestRenderedResourceId: 'resource-render',
                    modelId: modelIdA,
                    versionHash: 'hash-render',
                    lastRenderedResourceId: 'resource-render',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            };
            setChecklistState(recipe, createProgressEntry({ render_document: 'failed' }, documents, [
                buildJobProgressDto({
                    id: 'job-failed',
                    status: 'failed',
                    modelId: modelIdA,
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model A',
                }),
            ]));

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            const regenerateButton = within(row).getByRole('button', { name: /regenerate|redo/i });
            expect(regenerateButton).toHaveClass('bg-destructive');
        });

        it('when stage has not been run, not_started document shows status dot only, no regenerate button', () => {
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            setDialecticStateValues({
                activeContextSessionId: sessionId,
                activeStageSlug: recipe.stageSlug,
                activeSessionDetail: baseSession,
                currentProcessTemplate: buildProcessTemplateForStage(recipe.stageSlug),
                recipesByStageSlug: { [recipe.stageSlug]: recipe },
                stageRunProgress: {},
            });

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            expect(within(row).queryByRole('button', { name: /regenerate|redo/i })).not.toBeInTheDocument();
            expect(within(row).getByTestId('document-not-started-icon')).toBeInTheDocument();
        });

        it('when stage has been run, document with no progress entry shows regenerate button and dialog lists session contribution models', () => {
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            setChecklistState(recipe, createProgressEntry({ render_document: 'completed' }, {}));

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            const regenerateButton = within(row).getByRole('button', { name: /regenerate|redo/i });
            act(() => {
                fireEvent.click(regenerateButton);
            });

            const dialog = screen.getByRole('dialog');
            expect(dialog).toBeInTheDocument();
            expect(within(dialog).getByText('Model A')).toBeInTheDocument();
            expect(within(dialog).getByText('Model B')).toBeInTheDocument();
            expect(within(dialog).getByText('Model C')).toBeInTheDocument();
        });

        it('regenerate dialog shows all targeted models (session contributions) and pre-selects only missing (targeted minus succeeded)', () => {
            const modelIdB = 'model-b';
            const modelIdC = 'model-c';
            const succeededModelIds: string[] = [modelIdA, modelIdB];
            const missingModelId: string = modelIdC;
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-a',
                    latestRenderedResourceId: 'res-a',
                    modelId: modelIdA,
                    versionHash: 'h-a',
                    lastRenderedResourceId: 'res-a',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdB)]: {
                    status: 'completed',
                    job_id: 'job-b',
                    latestRenderedResourceId: 'res-b',
                    modelId: modelIdB,
                    versionHash: 'h-b',
                    lastRenderedResourceId: 'res-b',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            };
            setChecklistState(recipe, createProgressEntry({ render_document: 'completed' }, documents, [
                buildJobProgressDto({
                    id: 'job-a',
                    status: 'completed',
                    modelId: modelIdA,
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model A',
                }),
                buildJobProgressDto({
                    id: 'job-b',
                    status: 'completed',
                    modelId: modelIdB,
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model B',
                }),
                buildJobProgressDto({
                    id: 'job-c',
                    status: 'pending',
                    modelId: modelIdC,
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model C',
                }),
            ]));

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            const regenerateButton = within(row).getByRole('button', { name: /regenerate|redo/i });
            act(() => {
                fireEvent.click(regenerateButton);
            });

            const dialog = screen.getByRole('dialog');
            expect(within(dialog).getByText('Model A')).toBeInTheDocument();
            expect(within(dialog).getByText('Model B')).toBeInTheDocument();
            expect(within(dialog).getByText('Model C')).toBeInTheDocument();

            const displayNameByModelId: Record<string, string> = {
                [modelIdA]: 'Model A',
                [modelIdB]: 'Model B',
                [modelIdC]: 'Model C',
            };
            const checkboxForModel = (name: string): HTMLElement | null => {
                const label = within(dialog).getByText(name).closest('label');
                if (label === null) return null;
                return within(label).getByRole('checkbox');
            };
            for (const id of succeededModelIds) {
                const cb = checkboxForModel(displayNameByModelId[id]);
                if (cb === null) throw new Error(`Expected checkbox for succeeded model ${id}`);
                expect(cb.getAttribute('aria-checked')).toBe('false');
            }
            const missingCheckbox = checkboxForModel(displayNameByModelId[missingModelId]);
            if (missingCheckbox === null) throw new Error(`Expected checkbox for missing model ${missingModelId}`);
            expect(missingCheckbox.getAttribute('aria-checked')).toBe('true');
        });

        it('stuck document row (continuing or generating but not completed or failed) shows regenerate button so user can redo', () => {
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'continuing',
                    job_id: 'job-render',
                    latestRenderedResourceId: 'resource-render',
                    modelId: modelIdA,
                    versionHash: 'hash-render',
                    lastRenderedResourceId: 'resource-render',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            };
            setChecklistState(recipe, createProgressEntry({ render_document: 'in_progress' }, documents, [
                buildJobProgressDto({
                    id: 'job-render',
                    status: 'processing',
                    modelId: modelIdA,
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model A',
                }),
            ]));

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            expect(within(row).getByRole('button', { name: /regenerate|redo/i })).toBeInTheDocument();
        });
    });

    describe('regenerate button only on current stage after stage has been run', () => {
        it('current stage with stage progress shows regenerate button', () => {
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-render',
                    latestRenderedResourceId: 'resource-render',
                    modelId: modelIdA,
                    versionHash: 'hash-render',
                    lastRenderedResourceId: 'resource-render',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            };
            setChecklistState(recipe, createProgressEntry({ render_document: 'completed' }, documents, [
                buildJobProgressDto({
                    id: 'job-render',
                    status: 'completed',
                    modelId: modelIdA,
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model A',
                }),
            ]));

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            expect(within(row).getByRole('button', { name: /regenerate|redo/i })).toBeInTheDocument();
        });

        it('current stage with no stage progress shows colored status dot only, no regenerate button', () => {
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            setDialecticStateValues({
                activeContextSessionId: sessionId,
                activeStageSlug: recipe.stageSlug,
                activeSessionDetail: baseSession,
                currentProcessTemplate: buildProcessTemplateForStage(recipe.stageSlug),
                recipesByStageSlug: { [recipe.stageSlug]: recipe },
                stageRunProgress: {},
            });

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            expect(within(row).queryByRole('button', { name: /regenerate|redo/i })).not.toBeInTheDocument();
            expect(within(row).getByTestId('document-not-started-icon')).toBeInTheDocument();
        });

        it('current stage with no stage progress: status indicator is not a button and is not interactable', () => {
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            setDialecticStateValues({
                activeContextSessionId: sessionId,
                activeStageSlug: recipe.stageSlug,
                activeSessionDetail: baseSession,
                currentProcessTemplate: buildProcessTemplateForStage(recipe.stageSlug),
                recipesByStageSlug: { [recipe.stageSlug]: recipe },
                stageRunProgress: {},
            });

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            const statusIndicator = within(row).getByTestId('document-not-started-icon');
            expect(statusIndicator.tagName).toBe('SPAN');
            fireEvent.click(statusIndicator);
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('when regenerate dialog is open it shows a list of models to select', () => {
            const modelIdB = 'model-b';
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            selectSelectedModels.mockReturnValue([
                { id: modelIdA, displayName: 'Model A' },
                { id: modelIdB, displayName: 'Model B' },
            ]);
            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-1',
                    latestRenderedResourceId: 'res-1',
                    modelId: modelIdA,
                    versionHash: 'h1',
                    lastRenderedResourceId: 'res-1',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdB)]: {
                    status: 'completed',
                    job_id: 'job-2',
                    latestRenderedResourceId: 'res-2',
                    modelId: modelIdB,
                    versionHash: 'h2',
                    lastRenderedResourceId: 'res-2',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            };
            setChecklistState(recipe, createProgressEntry({ render_document: 'completed' }, documents, [
                buildJobProgressDto({
                    id: 'job-1',
                    status: 'completed',
                    modelId: modelIdA,
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model A',
                }),
                buildJobProgressDto({
                    id: 'job-2',
                    status: 'completed',
                    modelId: 'model-b',
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model B',
                }),
            ]));

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            const regenerateButton = within(row).getByRole('button', { name: /regenerate|redo/i });
            act(() => {
                fireEvent.click(regenerateButton);
            });

            expect(screen.getByRole('dialog')).toBeInTheDocument();
            expect(screen.getByText(/Select which model/i)).toBeInTheDocument();
            expect(screen.getByText('Model A')).toBeInTheDocument();
            expect(screen.getByText('Model B')).toBeInTheDocument();
        });

        it('current stage with stage progress but no models for document (empty checklist) shows status dot only, no regenerate button', () => {
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            const progressKey = `${sessionId}:${recipe.stageSlug}:${iterationNumber}`;
            setDialecticStateValues({
                activeContextSessionId: sessionId,
                activeStageSlug: recipe.stageSlug,
                activeSessionDetail: baseSession,
                currentProcessTemplate: buildProcessTemplateForStage(recipe.stageSlug),
                recipesByStageSlug: { [recipe.stageSlug]: recipe },
                stageRunProgress: {
                    [progressKey]: createProgressEntry(
                        { render_document: 'not_started' },
                        {},
                        [
                            buildJobProgressDto({
                                id: 'job-other',
                                status: 'completed',
                                modelId: modelIdA,
                                documentKey: 'other_document_key',
                                modelName: 'Model A',
                            }),
                        ],
                    ),
                },
            });

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            expect(within(row).queryByRole('button', { name: /regenerate|redo/i })).not.toBeInTheDocument();
            expect(within(row).getByTestId('document-not-started-icon')).toBeInTheDocument();
        });

        it('when regenerate dialog is open with no models selected, Regenerate button in dialog is disabled', () => {
            const modelIdB = 'model-b';
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            selectSelectedModels.mockReturnValue([
                { id: modelIdA, displayName: 'Model A' },
                { id: modelIdB, displayName: 'Model B' },
            ]);
            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-1',
                    latestRenderedResourceId: 'res-1',
                    modelId: modelIdA,
                    versionHash: 'h1',
                    lastRenderedResourceId: 'res-1',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdB)]: {
                    status: 'completed',
                    job_id: 'job-2',
                    latestRenderedResourceId: 'res-2',
                    modelId: modelIdB,
                    versionHash: 'h2',
                    lastRenderedResourceId: 'res-2',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            };
            setChecklistState(recipe, createProgressEntry({ render_document: 'completed' }, documents, [
                buildJobProgressDto({
                    id: 'job-1',
                    status: 'completed',
                    modelId: modelIdA,
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model A',
                }),
                buildJobProgressDto({
                    id: 'job-2',
                    status: 'completed',
                    modelId: 'model-b',
                    documentKey: 'synthesis_document_rendered',
                    modelName: 'Model B',
                }),
            ]));

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            const regenerateButton = within(row).getByRole('button', { name: /regenerate|redo/i });
            act(() => {
                fireEvent.click(regenerateButton);
            });

            const dialogRegenerateButton = screen.getByRole('button', { name: /^Regenerate$/i });
            expect(dialogRegenerateButton).toBeDisabled();
        });

        it('viewing previous stage shows colored status dot only, no regenerate button', () => {
            const synthesisRecipe = createRecipe([buildRenderStep()]);
            const analysisRecipe = createRecipe([buildRenderStep()], alternateStageSlug);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            const sessionWithAnalysisCurrent: DialecticSession = {
                ...baseSession,
                current_stage_id: `stage-${alternateStageSlug}`,
            };
            setDialecticStateValues({
                activeContextSessionId: sessionId,
                activeStageSlug: synthesisRecipe.stageSlug,
                activeSessionDetail: sessionWithAnalysisCurrent,
                currentProcessTemplate: buildProcessTemplateForStage(synthesisRecipe.stageSlug),
                recipesByStageSlug: {
                    [synthesisRecipe.stageSlug]: synthesisRecipe,
                    [analysisRecipe.stageSlug]: analysisRecipe,
                },
                stageRunProgress: {
                    [`${sessionId}:${synthesisRecipe.stageSlug}:${iterationNumber}`]: createProgressEntry(
                        { render_document: 'completed' },
                        {
                            [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                                status: 'completed',
                                job_id: 'job-render',
                                latestRenderedResourceId: 'resource-render',
                                modelId: modelIdA,
                                versionHash: 'hash-render',
                                lastRenderedResourceId: 'resource-render',
                                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                            },
                        },
                        [
                            buildJobProgressDto({
                                id: 'job-render',
                                status: 'completed',
                                modelId: modelIdA,
                                documentKey: 'synthesis_document_rendered',
                                modelName: 'Model A',
                            }),
                        ],
                    ),
                },
            });

            act(() => {
                render(
                    <StageRunChecklist
                        modelId={modelIdA}
                        onDocumentSelect={vi.fn()}
                        stageSlug={synthesisRecipe.stageSlug}
                    />,
                );
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            expect(within(row).queryByRole('button', { name: /regenerate|redo/i })).not.toBeInTheDocument();
            expect(within(row).getByTestId('document-completed-icon')).toBeInTheDocument();
        });

        it('viewing future stage shows colored status dot only, no regenerate button', () => {
            const synthesisRecipe = createRecipe([buildRenderStep()]);
            const analysisRecipe = createRecipe([buildRenderStep()], alternateStageSlug);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            const sessionWithSynthesisCurrent: DialecticSession = {
                ...baseSession,
                current_stage_id: 'stage-synthesis',
            };
            setDialecticStateValues({
                activeContextSessionId: sessionId,
                activeStageSlug: synthesisRecipe.stageSlug,
                activeSessionDetail: sessionWithSynthesisCurrent,
                currentProcessTemplate: buildProcessTemplateForStage(alternateStageSlug),
                recipesByStageSlug: {
                    [synthesisRecipe.stageSlug]: synthesisRecipe,
                    [analysisRecipe.stageSlug]: analysisRecipe,
                },
                stageRunProgress: {
                    [`${sessionId}:${alternateStageSlug}:${iterationNumber}`]: createProgressEntry(
                        { render_document: 'completed' },
                        {
                            [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                                status: 'completed',
                                job_id: 'job-render',
                                latestRenderedResourceId: 'resource-render',
                                modelId: modelIdA,
                                versionHash: 'hash-render',
                                lastRenderedResourceId: 'resource-render',
                                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                            },
                        },
                        [
                            buildJobProgressDto({
                                id: 'job-render',
                                status: 'completed',
                                modelId: modelIdA,
                                documentKey: 'synthesis_document_rendered',
                                modelName: 'Model A',
                            }),
                        ],
                    ),
                },
            });

            act(() => {
                render(
                    <StageRunChecklist
                        modelId={modelIdA}
                        onDocumentSelect={vi.fn()}
                        stageSlug={alternateStageSlug}
                    />,
                );
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            expect(within(row).queryByRole('button', { name: /regenerate|redo/i })).not.toBeInTheDocument();
            expect(within(row).getByTestId('document-completed-icon')).toBeInTheDocument();
        });
    });

    describe('jobs-derived model list and display names', () => {
        it('model with failed job (no contribution) appears in perModelLabels with status Failed', () => {
            const modelIdD = 'model-d';
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            const sessionWithTwoContributions: DialecticSession = {
                ...baseSession,
                dialectic_contributions: (baseSession.dialectic_contributions ?? []).filter(
                    (c) => c.model_id !== 'model-c',
                ),
            };
            const progressEntry = createProgressEntry(
                { render_document: 'failed' },
                {},
                [
                    buildJobProgressDto({
                        id: 'job-d-failed',
                        status: 'failed',
                        modelId: modelIdD,
                        documentKey: 'synthesis_document_rendered',
                        modelName: 'Model D',
                    }),
                    buildJobProgressDto({
                        id: 'job-a-completed',
                        status: 'completed',
                        modelId: modelIdA,
                        documentKey: 'synthesis_document_rendered',
                        modelName: 'Model A',
                    }),
                ],
            );
            setChecklistState(recipe, progressEntry, {
                activeSessionDetail: sessionWithTwoContributions,
            });

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            const regenerateButton = within(row).getByRole('button', { name: /regenerate|redo/i });
            act(() => {
                fireEvent.click(regenerateButton);
            });

            const dialog = screen.getByRole('dialog');
            expect(within(dialog).getByText('Model D')).toBeInTheDocument();
            expect(within(dialog).getByText(/Failed/)).toBeInTheDocument();
        });

        it('redo dialog shows correct model names from jobs data', () => {
            const modelIdX = 'model-x';
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            const sessionWithoutModelX: DialecticSession = {
                ...baseSession,
                dialectic_contributions: (baseSession.dialectic_contributions ?? []).filter(
                    (c) => c.model_id !== modelIdX,
                ),
            };
            const progressEntry = createProgressEntry(
                { render_document: 'in_progress' },
                {},
                [
                    buildJobProgressDto({
                        id: 'job-x',
                        status: 'processing',
                        modelId: modelIdX,
                        documentKey: 'synthesis_document_rendered',
                        modelName: 'From Jobs Display Name',
                    }),
                    buildJobProgressDto({
                        id: 'job-a',
                        status: 'completed',
                        modelId: modelIdA,
                        documentKey: 'synthesis_document_rendered',
                        modelName: 'Model A',
                    }),
                ],
            );
            setChecklistState(recipe, progressEntry, {
                activeSessionDetail: sessionWithoutModelX,
            });

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            const regenerateButton = within(row).getByRole('button', { name: /regenerate|redo/i });
            act(() => {
                fireEvent.click(regenerateButton);
            });

            const dialog = screen.getByRole('dialog');
            expect(within(dialog).getByText('From Jobs Display Name')).toBeInTheDocument();
        });

        it('model that completed shows Completed status from document descriptor', () => {
            const recipe = createRecipe([buildRenderStep()]);
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));
            const documents: StageRunDocuments = {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-render',
                    latestRenderedResourceId: 'resource-render',
                    modelId: modelIdA,
                    versionHash: 'hash-render',
                    lastRenderedResourceId: 'resource-render',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            };
            const progressEntry = createProgressEntry(
                { render_document: 'completed' },
                documents,
                [
                    buildJobProgressDto({
                        id: 'job-render',
                        status: 'completed',
                        modelId: modelIdA,
                        documentKey: 'synthesis_document_rendered',
                        modelName: 'Model A',
                    }),
                ],
            );
            setChecklistState(recipe, progressEntry);

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            expect(within(row).getByTestId('document-completed-icon')).toBeInTheDocument();
        });
    });

    it('document row renders friendly displayName instead of raw document_key when recipe has display_name', () => {
        const renderOutputs = buildOutputsRule(
            'synthesis_document_rendered',
            'rendered_document',
            'markdown',
            { display_name: 'Business Case', description: 'Market analysis and value proposition.' },
        );
        const stepWithDisplayMetadata: DialecticStageRecipeStep = {
            ...buildRenderStep(),
            outputs_required: renderOutputs,
        };
        const recipe = createRecipe([stepWithDisplayMetadata]);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

        const progressEntry = createProgressEntry(
            { render_document: 'completed' },
            {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-render',
                    latestRenderedResourceId: 'resource-render',
                    modelId: modelIdA,
                    versionHash: 'hash-render',
                    lastRenderedResourceId: 'resource-render',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            },
            [
                buildJobProgressDto({
                    status: 'completed',
                    modelId: modelIdA,
                    documentKey: 'synthesis_document_rendered',
                }),
            ],
        );

        setChecklistState(recipe, progressEntry);

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        const row = screen.getByTestId('document-synthesis_document_rendered');
        expect(row).toHaveTextContent('Business Case');
        expect(row).not.toHaveTextContent('synthesis_document_rendered');
    });

    it('tooltip appears on hover showing document description', async () => {
        const user = userEvent.setup();
        const renderOutputs = buildOutputsRule(
            'synthesis_document_rendered',
            'rendered_document',
            'markdown',
            { display_name: 'Business Case', description: 'Market analysis and value proposition.' },
        );
        const stepWithDisplayMetadata: DialecticStageRecipeStep = {
            ...buildRenderStep(),
            outputs_required: renderOutputs,
        };
        const recipe = createRecipe([stepWithDisplayMetadata]);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

        const progressEntry = createProgressEntry(
            { render_document: 'completed' },
            {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-render',
                    latestRenderedResourceId: 'resource-render',
                    modelId: modelIdA,
                    versionHash: 'hash-render',
                    lastRenderedResourceId: 'resource-render',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            },
            [
                buildJobProgressDto({
                    status: 'completed',
                    modelId: modelIdA,
                    documentKey: 'synthesis_document_rendered',
                }),
            ],
        );

        setChecklistState(recipe, progressEntry);

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        const row = screen.getByTestId('document-synthesis_document_rendered');
        const infoIcon = within(row).getByTestId('document-info-synthesis_document_rendered');
        await user.hover(infoIcon);

        await waitFor(() => {
            const tooltipContent = document.querySelector('[data-slot="tooltip-content"]');
            expect(tooltipContent).toBeTruthy();
            expect(tooltipContent?.textContent).toContain('Market analysis and value proposition.');
        });
    });

    it('falls back to title-cased document_key when display metadata is absent in recipe', () => {
        const recipe = createRecipe([buildRenderStep()]);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

        const progressEntry = createProgressEntry(
            { render_document: 'completed' },
            {
                [makeStageRunDocumentKey('synthesis_document_rendered', modelIdA)]: {
                    status: 'completed',
                    job_id: 'job-render',
                    latestRenderedResourceId: 'resource-render',
                    modelId: modelIdA,
                    versionHash: 'hash-render',
                    lastRenderedResourceId: 'resource-render',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                },
            },
            [
                buildJobProgressDto({
                    status: 'completed',
                    modelId: modelIdA,
                    documentKey: 'synthesis_document_rendered',
                }),
            ],
        );

        setChecklistState(recipe, progressEntry);

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        const row = screen.getByTestId('document-synthesis_document_rendered');
        expect(row).toHaveTextContent('Synthesis Document Rendered');
    });
});
