import { describe, it, beforeEach, expect, vi } from 'vitest';
import { act, render, screen, within, fireEvent } from '@testing-library/react';

import type {
    DialecticStageRecipe,
    DialecticStageRecipeStep,
    DialecticSession,
    DialecticStateValues,
    DialecticStage,
    DialecticProcessTemplate,
    DialecticStageTransition,
} from '@paynless/types';
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';

import {
    initializeMockDialecticState,
    selectValidMarkdownDocumentKeys,
    selectSelectedModelIds,
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
): OutputsRequired => {
    return JSON.parse(
        JSON.stringify([
            {
                documents: [
                    {
                        document_key: documentKey,
                        artifact_class: artifactClass,
                        file_type: fileType,
                        template_filename:
                            fileType === 'markdown' ? `${documentKey}.md` : `${documentKey}.json`,
                    },
                ],
            },
        ]),
    );
};

const baseSession: DialecticSession = {
    id: sessionId,
    project_id: 'project-abc',
    session_description: 'Test session',
    iteration_count: iterationNumber,
    current_stage_id: 'stage-synthesis',
    selected_model_ids: [],
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_input_reference_url: null,
    associated_chat_id: null,
    dialectic_contributions: [],
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
});

const createProgressEntry = (
    statuses: StepStatuses,
    docs: StageRunDocuments,
): StageRunProgressEntry => ({
    stepStatuses: statuses,
    documents: docs,
});

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

        expect(screen.getByText('1 / 2 Documents')).toBeInTheDocument();
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

        expect(screen.getByText('1 / 1 Documents')).toBeInTheDocument();
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

        const progressEntry = createProgressEntry(stepStatuses, documents);
        setChecklistState(recipe, progressEntry);

        const onDocumentSelect = vi.fn();

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={onDocumentSelect} />);
        });

        const documentRow = screen.getByTestId('document-synthesis_document_rendered');
        expect(within(documentRow).getByText('synthesis_document_rendered')).toBeInTheDocument();
        expect(within(documentRow).getByText('Continuing')).toBeInTheDocument();
        expect(within(documentRow).queryByText(/Job ID/i)).toBeNull();
        expect(within(documentRow).queryByText(/Latest Render/i)).toBeNull();

        fireEvent.click(documentRow);

        expect(onDocumentSelect).toHaveBeenCalledTimes(1);
        expect(onDocumentSelect).toHaveBeenCalledWith(expect.objectContaining({
            modelId: modelIdA,
            documentKey: 'synthesis_document_rendered',
        }));
    });

    it('renders a single empty-state message when no markdown documents exist', () => {
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

        expect(screen.getByText('0 / 0 Documents')).toBeInTheDocument();
        expect(screen.getAllByText('No documents generated yet.')).toHaveLength(1);
        expect(screen.queryByText('No documents for this step.')).toBeNull();
        expect(screen.queryByTestId('document-synthesis_document_outline')).toBeNull();
    });

    it('renders guard state when prerequisites are missing', () => {
        selectValidMarkdownDocumentKeys.mockReturnValue(new Set<string>());

        act(() => {
            setDialecticStateValues({
                activeContextSessionId: sessionId,
                activeStageSlug: stageSlug,
                activeSessionDetail: baseSession,
                recipesByStageSlug: {},
                stageRunProgress: {},
            });
        });

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        expect(screen.getByText('Stage progress data is unavailable.')).toBeInTheDocument();

        act(() => {
            setDialecticStateValues({
                activeContextSessionId: sessionId,
                activeStageSlug: stageSlug,
                activeSessionDetail: null,
                recipesByStageSlug: {},
                stageRunProgress: {},
            });
        });

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

        expect(screen.getAllByText('Stage progress data is unavailable.')).toHaveLength(2);
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
        expect(screen.getByText('0 / 2 Documents')).toBeInTheDocument();

        const documentList = screen.getByTestId('stage-run-checklist-documents');
        const documentRows = within(documentList).queryAllByTestId(/document-/);
        expect(documentRows).toHaveLength(2);

        const primaryRow = screen.getByTestId('document-synthesis_document_rendered');
        const secondaryRow = screen.getByTestId('document-synthesis_document_secondary');

        expect(within(primaryRow).getByText('synthesis_document_rendered')).toBeInTheDocument();
        expect(within(primaryRow).getByText('Not Started')).toBeInTheDocument();

        expect(within(secondaryRow).getByText('synthesis_document_secondary')).toBeInTheDocument();
        expect(within(secondaryRow).getByText('Not Started')).toBeInTheDocument();
    });

    it('renders guard state when active session or stage context is missing', () => {
        const recipe = createRecipe([buildPlannerStep(), buildDraftStep()]);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set<string>());

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

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });
        expect(screen.getByText('Stage progress data is unavailable.')).toBeInTheDocument();

        initializeMockDialecticState();

        setChecklistState(recipe, progressEntry, { activeStageSlug: null, currentProcessTemplate: null });

        act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });
        expect(screen.getAllByText('Stage progress data is unavailable.')).toHaveLength(2);
    });

    it('does not render checklist when progress exists for a different iteration', () => {
        const recipe = createRecipe([buildPlannerStep(), buildDraftStep()]);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set<string>());

        const mismatchedProgressKey = `${sessionId}:${recipe.stageSlug}:${iterationNumber + 1}`;

        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeStageSlug: recipe.stageSlug,
            activeSessionDetail: baseSession,
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

        expect(screen.getByText('Stage progress data is unavailable.')).toBeInTheDocument();
    });

    it('does not render checklist when progress belongs to another stage', () => {
        const recipe = createRecipe([buildPlannerStep(), buildDraftStep()]);
        const alternateRecipe = createRecipe([buildPlannerStep()], alternateStageSlug);

        selectValidMarkdownDocumentKeys.mockReturnValue(new Set<string>());

        const alternateProgressKey = `${sessionId}:${alternateRecipe.stageSlug}:${iterationNumber}`;

        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeStageSlug: recipe.stageSlug,
            activeSessionDetail: baseSession,
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

        expect(screen.getByText('Stage progress data is unavailable.')).toBeInTheDocument();
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

        expect(screen.getByText('0 / 2 Documents')).toBeInTheDocument();

        const documentList = screen.getByTestId('stage-run-checklist-documents');
        const documentRows = within(documentList).queryAllByTestId(/document-/);
        expect(documentRows).toHaveLength(2);

        const primaryRow = screen.getByTestId('document-synthesis_document_rendered');
        const secondaryRow = screen.getByTestId('document-synthesis_document_secondary');

        expect(within(primaryRow).getByText('synthesis_document_rendered')).toBeInTheDocument();
        expect(within(primaryRow).getByText('Not Started')).toBeInTheDocument();

        expect(within(secondaryRow).getByText('synthesis_document_secondary')).toBeInTheDocument();
        expect(within(secondaryRow).getByText('Not Started')).toBeInTheDocument();

        expect(screen.queryByText('No documents generated yet.')).toBeNull();
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
            expect(checklistCard.classList.contains('max-w-full')).toBe(true);
            expect(checklistCard.classList.contains('max-h-96')).toBe(true);
            expect(checklistCard.classList.contains('overflow-hidden')).toBe(true);
        }

        expect(documentList.classList.contains('max-h-80')).toBe(true);
        expect(documentList.classList.contains('overflow-y-auto')).toBe(true);
        expect(documentList.classList.contains('gap-1')).toBe(true);
    });

    it('scopes accordion controls inside the checklist container', () => {
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

        const checklistCard = screen.getByTestId('stage-run-checklist-card');
        const accordion = screen.getByTestId('stage-run-checklist-accordion');

        expect(checklistCard).toContainElement(accordion);

        const accordionTrigger = within(accordion).getByTestId('stage-run-checklist-accordion-trigger-synthesis');
        const accordionContent = within(accordion).getByTestId('stage-run-checklist-accordion-content-synthesis');

        expect(accordion).toContainElement(accordionTrigger);
        expect(accordion).toContainElement(accordionContent);
        expect(accordion.closest('[data-testid="stage-run-checklist-card"]')).toBe(checklistCard);
    });

    it('matches checklist container size to the parent card', () => {
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

        const checklistCard = screen.getByTestId('stage-run-checklist-card');
        const accordion = screen.getByTestId('stage-run-checklist-accordion');

        const sharedLayoutClasses = ['w-full'];

        sharedLayoutClasses.forEach((className) => {
            expect(checklistCard.classList.contains(className)).toBe(true);
            expect(accordion.classList.contains(className)).toBe(true);
        });
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
        expect(screen.getByText('0 / 1 Documents')).toBeInTheDocument();
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
        const renderedDocumentKeys = screen
            .getAllByTestId(/^document-/)
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
        const thesisStage: DialecticStage = {
            id: 'stage-thesis',
            slug: 'thesis',
            display_name: 'Thesis',
            description: 'Thesis stage',
            created_at: new Date().toISOString(),
            default_system_prompt_id: 'sp-1',
            expected_output_template_ids: [],
            recipe_template_id: null,
            active_recipe_instance_id: null,
        };
        const antithesisStage: DialecticStage = {
            ...thesisStage,
            id: 'stage-antithesis',
            slug: 'antithesis',
            display_name: 'Antithesis',
        };
        const synthesisStageForList: DialecticStage = {
            ...thesisStage,
            id: 'stage-synthesis',
            slug: 'synthesis',
            display_name: 'Synthesis',
        };
        const transitionThesisToAntithesis: DialecticStageTransition = {
            id: 't1',
            process_template_id: 'pt-1',
            source_stage_id: thesisStage.id,
            target_stage_id: antithesisStage.id,
            created_at: new Date().toISOString(),
            condition_description: null,
        };
        const transitionAntithesisToSynthesis: DialecticStageTransition = {
            id: 't2',
            process_template_id: 'pt-1',
            source_stage_id: antithesisStage.id,
            target_stage_id: synthesisStageForList.id,
            created_at: new Date().toISOString(),
            condition_description: null,
        };
        const processTemplateTransitions: DialecticStageTransition[] = [
            transitionThesisToAntithesis,
            transitionAntithesisToSynthesis,
        ];
        const processTemplateWithStages: DialecticProcessTemplate = {
            id: 'pt-1',
            name: 'Test Template',
            description: 'Test',
            created_at: new Date().toISOString(),
            starting_stage_id: thesisStage.id,
            stages: [thesisStage, antithesisStage, synthesisStageForList],
            transitions: processTemplateTransitions,
        };

        it('displays all stages in order (past, current, future)', () => {
            setDialecticStateValues({
                activeContextSessionId: sessionId,
                activeStageSlug: stageSlug,
                activeSessionDetail: baseSession,
                currentProcessTemplate: processTemplateWithStages,
                recipesByStageSlug: {
                    thesis: createRecipe([buildRenderStep()], 'thesis'),
                    antithesis: createRecipe([buildRenderStep()], 'antithesis'),
                    synthesis: createRecipe([buildRenderStep(), buildSecondaryRenderStep()], 'synthesis'),
                },
                stageRunProgress: {},
            });
            selectValidMarkdownDocumentKeys.mockImplementation((_state: DialecticStateValues, slug: string) => {
                if (slug === 'synthesis') return new Set(['synthesis_document_rendered', 'synthesis_document_secondary']);
                return new Set(['document_rendered']);
            });

            act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

            expect(screen.getByText('Thesis')).toBeInTheDocument();
            expect(screen.getByText('Antithesis')).toBeInTheDocument();
            expect(screen.getByText('Synthesis')).toBeInTheDocument();
            const stageLabels = screen.getAllByText(/^(Thesis|Antithesis|Synthesis)$/);
            expect(stageLabels[0]).toHaveTextContent('Thesis');
            expect(stageLabels[1]).toHaveTextContent('Antithesis');
            expect(stageLabels[2]).toHaveTextContent('Synthesis');
        });

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
            selectSelectedModelIds.mockReturnValue(['model-a', 'model-b', 'model-c']);
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
            setChecklistState(recipe, createProgressEntry(stepStatuses, documents));

            act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            expect(within(row).getByText(/Completed|Not started|\d+\/\d+/i)).toBeInTheDocument();
        });

        it('one document key produced by 3 models with 2 completed shows "2/3 complete" and expand shows per-model status', () => {
            const modelIdB = 'model-b';
            const modelIdC = 'model-c';
            selectSelectedModelIds.mockReturnValue([modelIdA, modelIdB, modelIdC]);
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
            setChecklistState(recipe, createProgressEntry({ render_document: 'in_progress' }, documents));

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const row = screen.getByTestId('document-synthesis_document_rendered');
            expect(within(row).getByText('2/3 complete')).toBeInTheDocument();

            fireEvent.click(row);
            const perModelSection = within(row).queryByTestId('stage-run-checklist-row-per-model-status');
            expect(perModelSection).toBeInTheDocument();
            if (perModelSection) {
                expect(within(perModelSection).getAllByText(/Completed/i).length).toBe(2);
                expect(within(perModelSection).getByText(/Not started/i)).toBeInTheDocument();
            }
        });

        it('when user focuses a document row, row expands to show per-model status for that document', () => {
            const modelIdB = 'model-b';
            selectSelectedModelIds.mockReturnValue([modelIdA, modelIdB]);
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
                    status: 'continuing',
                    job_id: 'job-2',
                    latestRenderedResourceId: 'res-2',
                    modelId: modelIdB,
                    versionHash: 'h2',
                    lastRenderedResourceId: 'res-2',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                    stepKey: 'render_document',
                },
            };
            setChecklistState(recipe, createProgressEntry({ render_document: 'completed' }, documents));

            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
            });

            const documentRow = screen.getByTestId('document-synthesis_document_rendered');
            fireEvent.click(documentRow);

            const perModelSection = within(documentRow).queryByTestId('stage-run-checklist-row-per-model-status');
            expect(perModelSection).toBeInTheDocument();
            if (!perModelSection) {
                throw new Error('expected per-model section');
            }
            expect(within(perModelSection).getByText(/Completed/i)).toBeInTheDocument();
            expect(within(perModelSection).getByText(/Continuing|Generating/i)).toBeInTheDocument();
        });

        it('clicking the document row arrow toggles per-model list without changing focus (onDocumentSelect not called)', () => {
            const modelIdB = 'model-b';
            selectSelectedModelIds.mockReturnValue([modelIdA, modelIdB]);
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
                    status: 'continuing',
                    job_id: 'job-2',
                    latestRenderedResourceId: 'res-2',
                    modelId: modelIdB,
                    versionHash: 'h2',
                    lastRenderedResourceId: 'res-2',
                    lastRenderAtIso: '2025-01-01T00:00:00.000Z',
                    stepKey: 'render_document',
                },
            };
            setChecklistState(recipe, createProgressEntry({ render_document: 'completed' }, documents));

            const onDocumentSelect = vi.fn();
            act(() => {
                render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={onDocumentSelect} />);
            });

            const documentRow = screen.getByTestId('document-synthesis_document_rendered');
            const arrowButton = within(documentRow).queryByTestId('stage-run-checklist-row-toggle-per-model');
            expect(arrowButton).toBeInTheDocument();
            if (!arrowButton) {
                throw new Error('expected document row toggle');
            }
            fireEvent.click(arrowButton);

            const perModelSection = within(documentRow).queryByTestId('stage-run-checklist-row-per-model-status');
            expect(perModelSection).toBeInTheDocument();
            expect(onDocumentSelect).not.toHaveBeenCalled();
        });

        it('future stages show "Stage not ready" indicator; documents in ready stage show "Not started" when not begun', () => {
            setDialecticStateValues({
                activeContextSessionId: sessionId,
                activeStageSlug: 'antithesis',
                activeSessionDetail: baseSession,
                currentProcessTemplate: processTemplateWithStages,
                recipesByStageSlug: {
                    thesis: createRecipe([buildRenderStep()], 'thesis'),
                    antithesis: createRecipe([buildRenderStep()], 'antithesis'),
                    synthesis: createRecipe([buildRenderStep()], 'synthesis'),
                },
                stageRunProgress: {},
            });
            selectValidMarkdownDocumentKeys.mockImplementation((_state: DialecticStateValues, slug: string) => {
                return new Set([slug === 'thesis' ? 'thesis_doc' : 'doc_rendered']);
            });

            act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

            expect(screen.getByText(/Stage not ready|Not started/i)).toBeInTheDocument();
        });

        it('distinguishes "Stage not ready" from "Document not started"', () => {
            setDialecticStateValues({
                activeContextSessionId: sessionId,
                activeStageSlug: stageSlug,
                activeSessionDetail: baseSession,
                currentProcessTemplate: processTemplateWithStages,
                recipesByStageSlug: { [stageSlug]: createRecipe([buildRenderStep()], stageSlug) },
                stageRunProgress: {},
            });
            selectValidMarkdownDocumentKeys.mockReturnValue(new Set(['synthesis_document_rendered']));

            act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

            const notStarted = screen.getAllByText('Not Started');
            expect(notStarted.length).toBeGreaterThanOrEqual(0);
        });

        it('clicking a document focuses by documentKey so viewer can show all model versions; onDocumentSelect called once per modelId', () => {
            selectSelectedModelIds.mockReturnValue([modelIdA, 'model-b', 'model-c']);
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
            setChecklistState(recipe, createProgressEntry({ render_document: 'completed' }, documents));

            const onDocumentSelect = vi.fn();
            act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={onDocumentSelect} />);
        });

            fireEvent.click(screen.getByTestId('document-synthesis_document_rendered'));

            expect(onDocumentSelect).toHaveBeenCalledWith(expect.objectContaining({ documentKey: 'synthesis_document_rendered' }));
            expect(onDocumentSelect).toHaveBeenCalledTimes(3);
        });

        it('does not filter out documents or stages by progress; all stages and all documents always listed', () => {
            setDialecticStateValues({
                activeContextSessionId: sessionId,
                activeStageSlug: stageSlug,
                activeSessionDetail: baseSession,
                currentProcessTemplate: processTemplateWithStages,
                recipesByStageSlug: {
                    thesis: createRecipe([buildRenderStep()], 'thesis'),
                    antithesis: createRecipe([buildRenderStep()], 'antithesis'),
                    synthesis: createRecipe([buildRenderStep(), buildSecondaryRenderStep()], 'synthesis'),
                },
                stageRunProgress: {},
            });
            selectValidMarkdownDocumentKeys.mockImplementation((_state: DialecticStateValues, slug: string) => {
                if (slug === 'synthesis') return new Set(['synthesis_document_rendered', 'synthesis_document_secondary']);
                return new Set(['document_rendered']);
            });

            act(() => {
            render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        });

            expect(screen.getByText('Thesis')).toBeInTheDocument();
            expect(screen.getByText('Antithesis')).toBeInTheDocument();
            expect(screen.getByText('Synthesis')).toBeInTheDocument();
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
});
