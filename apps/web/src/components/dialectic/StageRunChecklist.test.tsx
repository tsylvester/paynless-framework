import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

import type {
    DialecticStageRecipe,
    DialecticStageRecipeStep,
    DialecticSession,
    DialecticStateValues,
} from '@paynless/types';

import {
    initializeMockDialecticState,
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
        output_type: 'HeaderContext',
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
        output_type: 'AssembledDocumentJson',
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
        output_type: 'RenderedDocument',
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
        output_type: 'RenderedDocument',
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

        const stepStatuses: StepStatuses = {
            render_document: 'failed',
        };

        const documents: StageRunDocuments = {
            synthesis_document_rendered: {
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

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        const failureIcon = screen.getByTestId('document-failed-icon');
        expect(failureIcon).toBeInTheDocument();
    });

    it('lists only markdown deliverables for the active model', () => {
        const recipe = createRecipe([
            buildDraftStep(),
            buildRenderStep(),
            buildSecondaryRenderStep(),
        ]);

        const stepStatuses: StepStatuses = {
            draft_document: 'completed',
            render_document: 'completed',
            render_document_secondary: 'in_progress',
        };

        const documents: StageRunDocuments = {
            synthesis_document_rendered: {
                status: 'completed',
                job_id: 'job-render',
                latestRenderedResourceId: 'resource-render',
                modelId: modelIdA,
                versionHash: 'hash-render',
                lastRenderedResourceId: 'resource-render',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_secondary: {
                status: 'continuing',
                job_id: 'job-secondary',
                latestRenderedResourceId: 'resource-secondary',
                modelId: modelIdA,
                versionHash: 'hash-secondary',
                lastRenderedResourceId: 'resource-secondary',
                lastRenderAtIso: '2025-01-01T00:00:01.000Z',
            },
            synthesis_document_outline: {
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

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        expect(screen.getByTestId('document-synthesis_document_rendered')).toBeInTheDocument();
        expect(screen.getByTestId('document-synthesis_document_secondary')).toBeInTheDocument();
        expect(screen.queryByTestId('document-synthesis_document_outline')).toBeNull();

        expect(screen.getByText('Completed 1 of 2 documents')).toBeInTheDocument();
    });

    it('renders a condensed header without legacy checklist framing', () => {
        const recipe = createRecipe([buildPlannerStep(), buildRenderStep()]);

        const stepStatuses: StepStatuses = {
            planner_header: 'completed',
            render_document: 'completed',
        };

        const documents: StageRunDocuments = {
            synthesis_plan_header: {
                status: 'completed',
                job_id: 'job-plan',
                latestRenderedResourceId: 'resource-plan',
                modelId: modelIdA,
                versionHash: 'hash-plan',
                lastRenderedResourceId: 'resource-plan',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_rendered: {
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

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        expect(screen.getByText('Completed 1 of 1 documents')).toBeInTheDocument();
        expect(screen.queryByText(/Stage Run Checklist/i)).toBeNull();
        expect(screen.queryByText(/Parallel Group/i)).toBeNull();
        expect(screen.queryByText(/Branch/i)).toBeNull();
        expect(screen.queryByText(/Outstanding/i)).toBeNull();
    });

    it('renders minimal document rows and forwards selection payloads', () => {
        const recipe = createRecipe([buildRenderStep()]);

        const stepStatuses: StepStatuses = {
            render_document: 'in_progress',
        };

        const documents: StageRunDocuments = {
            synthesis_document_rendered: {
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

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={onDocumentSelect} />);

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

        const stepStatuses: StepStatuses = {
            draft_document: 'completed',
        };

        const documents: StageRunDocuments = {
            synthesis_document_outline: {
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

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        expect(screen.getByText('Completed 0 of 0 documents')).toBeInTheDocument();
        expect(screen.getAllByText('No documents generated yet.')).toHaveLength(1);
        expect(screen.queryByText('No documents for this step.')).toBeNull();
        expect(screen.queryByTestId('document-synthesis_document_outline')).toBeNull();
    });

    it('renders guard state when prerequisites are missing', () => {
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeStageSlug: stageSlug,
            activeSessionDetail: baseSession,
            recipesByStageSlug: {},
            stageRunProgress: {},
        });

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        expect(screen.getByText('Stage progress data is unavailable.')).toBeInTheDocument();

        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeStageSlug: stageSlug,
            activeSessionDetail: null,
            recipesByStageSlug: {},
            stageRunProgress: {},
        });

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        expect(screen.getAllByText('Stage progress data is unavailable.')).toHaveLength(2);
    });

    it('renders markdown deliverables when progress entry is unavailable', () => {
        const recipe = createRecipe([buildRenderStep(), buildSecondaryRenderStep()]);

        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeStageSlug: recipe.stageSlug,
            activeSessionDetail: baseSession,
            recipesByStageSlug: {
                [recipe.stageSlug]: recipe,
            },
            stageRunProgress: {},
        });

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        expect(screen.queryByText('Stage progress data is unavailable.')).toBeNull();
        expect(screen.getByText('Completed 0 of 2 documents')).toBeInTheDocument();

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
        const progressEntry = createProgressEntry(
            {
                planner_header: 'completed',
                draft_document: 'completed',
            },
            {
                synthesis_plan_header: {
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

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        expect(screen.getByText('Stage progress data is unavailable.')).toBeInTheDocument();

        initializeMockDialecticState();

        setChecklistState(recipe, progressEntry, { activeStageSlug: null });

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);
        expect(screen.getAllByText('Stage progress data is unavailable.')).toHaveLength(2);
    });

    it('does not render checklist when progress exists for a different iteration', () => {
        const recipe = createRecipe([buildPlannerStep(), buildDraftStep()]);

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
                        synthesis_plan_header: {
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

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        expect(screen.getByText('Stage progress data is unavailable.')).toBeInTheDocument();
    });

    it('does not render checklist when progress belongs to another stage', () => {
        const recipe = createRecipe([buildPlannerStep(), buildDraftStep()]);
        const alternateRecipe = createRecipe([buildPlannerStep()], alternateStageSlug);

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
                        synthesis_plan_header: {
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

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        expect(screen.getByText('Stage progress data is unavailable.')).toBeInTheDocument();
    });

    it('does not allow selecting documents without a usable model id', () => {
        const blankModelId = '';
        const recipe = createRecipe([buildRenderStep()]);

        const stepStatuses: StepStatuses = {
            render_document: 'completed',
        };

        const documents: StageRunDocuments = {
            synthesis_document_rendered: {
                status: 'completed',
                job_id: 'job-render',
                latestRenderedResourceId: 'resource-render',
                modelId: blankModelId,
                versionHash: 'hash-render',
                lastRenderedResourceId: 'resource-render',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        const onDocumentSelect = vi.fn();

        render(<StageRunChecklist modelId={blankModelId} onDocumentSelect={onDocumentSelect} />);

        const documentRow = screen.getByTestId('document-synthesis_document_rendered');

        expect(documentRow).not.toHaveAttribute('role');
        expect(documentRow).not.toHaveAttribute('tabindex');

        fireEvent.click(documentRow);

        expect(onDocumentSelect).not.toHaveBeenCalled();
    });

    it('renders planned markdown documents before generation begins', () => {
        const recipe = createRecipe([buildRenderStep(), buildSecondaryRenderStep()]);

        const stepStatuses: StepStatuses = {
            render_document: 'not_started',
            render_document_secondary: 'not_started',
        };

        const documents: StageRunDocuments = {};

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        expect(screen.getByText('Completed 0 of 2 documents')).toBeInTheDocument();

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

        const stepStatuses: StepStatuses = {
            render_document: 'completed',
        };

        const documents: StageRunDocuments = {
            synthesis_document_rendered: {
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

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

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

        const stepStatuses: StepStatuses = {
            render_document: 'completed',
        };

        const documents: StageRunDocuments = {
            synthesis_document_rendered: {
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

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        const checklistCard = screen.getByTestId('stage-run-checklist-card');
        const accordion = screen.getByTestId('stage-run-checklist-accordion');

        expect(checklistCard).toContainElement(accordion);

        const accordionTrigger = within(accordion).getByTestId('stage-run-checklist-accordion-trigger');
        const accordionContent = within(accordion).getByTestId('stage-run-checklist-accordion-content');

        expect(accordion).toContainElement(accordionTrigger);
        expect(accordion).toContainElement(accordionContent);
        expect(accordion.closest('[data-testid="stage-run-checklist-card"]')).toBe(checklistCard);
    });

    it('matches checklist container size to the parent card', () => {
        const recipe = createRecipe([buildRenderStep()]);

        const stepStatuses: StepStatuses = {
            render_document: 'completed',
        };

        const documents: StageRunDocuments = {
            synthesis_document_rendered: {
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

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        const checklistCard = screen.getByTestId('stage-run-checklist-card');
        const accordion = screen.getByTestId('stage-run-checklist-accordion');

        const sharedLayoutClasses = ['w-full'];

        sharedLayoutClasses.forEach((className) => {
            expect(checklistCard.classList.contains(className)).toBe(true);
            expect(accordion.classList.contains(className)).toBe(true);
        });
    });
});
