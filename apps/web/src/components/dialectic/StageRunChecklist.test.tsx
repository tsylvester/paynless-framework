import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { useState } from 'react';

import type {
    DialecticStageRecipe,
    DialecticStageRecipeStep,
    DialecticSession,
    DialecticStateValues,
    FocusedStageDocumentState,
    SetFocusedStageDocumentPayload,
} from '@paynless/types';

import {
    initializeMockDialecticState,
    setDialecticStateValues,
    getDialecticStoreActionMock,
} from '../../mocks/dialecticStore.mock';

import { StageRunChecklist } from './StageRunChecklist';

vi.mock('@paynless/store', () => import('../../mocks/dialecticStore.mock'));

const sessionId = 'session-123';
const stageSlug = 'synthesis';
const iterationNumber = 2;
const modelIdA = 'model-a';
const modelIdB = 'model-b';

const alternateStageSlug = 'analysis';

type StageRunProgressEntry = NonNullable<DialecticStateValues['stageRunProgress'][string]>;

type StepStatuses = StageRunProgressEntry['stepStatuses'];
type StageRunDocuments = StageRunProgressEntry['documents'];

type OutputsRequired = DialecticStageRecipeStep['outputs_required'];
type InputsRequired = DialecticStageRecipeStep['inputs_required'];

type RecipeSteps = DialecticStageRecipeStep[];

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
    const plannerOutputs: OutputsRequired = [
        {
            document_key: 'synthesis_plan_header',
            artifact_class: 'header_context',
            file_type: 'json',
        },
    ];

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
    const draftOutputs: OutputsRequired = [
        {
            document_key: 'synthesis_document_outline',
            artifact_class: 'assembled_json',
            file_type: 'json',
        },
    ];

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
        granularity_strategy: 'one_to_one',
    };
};

const buildRenderStep = (): DialecticStageRecipeStep => {
    const renderOutputs: OutputsRequired = [
        {
            document_key: 'synthesis_document_rendered',
            artifact_class: 'rendered_document',
            file_type: 'markdown',
        },
    ];

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

const buildMultiDocumentExecuteStep = (): DialecticStageRecipeStep => {
    const executeOutputs: OutputsRequired = [
        {
            document_key: 'synthesis_document_outline',
            artifact_class: 'assembled_json',
            file_type: 'json',
        },
        {
            document_key: 'synthesis_document_manifest',
            artifact_class: 'assembled_json',
            file_type: 'json',
        },
        {
            document_key: 'synthesis_document_appendix',
            artifact_class: 'assembled_json',
            file_type: 'json',
        },
    ];

    const executeInputs: InputsRequired = [];

    return {
        id: 'step-2a',
        step_key: 'draft_document',
        step_slug: 'draft-document',
        step_name: 'Draft Document',
        execution_order: 2,
        parallel_group: 1,
        branch_key: 'document',
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        inputs_required: executeInputs,
        outputs_required: executeOutputs,
        output_type: 'AssembledDocumentJson',
        granularity_strategy: 'one_to_many',
    };
};

const buildSecondaryPlannerStep = (): DialecticStageRecipeStep => {
    const secondaryOutputs: OutputsRequired = [
        {
            document_key: 'analysis_plan_header',
            artifact_class: 'header_context',
            file_type: 'json',
        },
    ];

    const secondaryInputs: InputsRequired = [];

    return {
        id: 'step-1b',
        step_key: 'planner_refinement',
        step_slug: 'planner-refinement',
        step_name: 'Planner Refinement',
        execution_order: 1,
        parallel_group: 1,
        branch_key: 'planner-b',
        job_type: 'PLAN',
        prompt_type: 'Planner',
        inputs_required: secondaryInputs,
        outputs_required: secondaryOutputs,
        output_type: 'HeaderContext',
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

const buildFocusMapKey = (
    payload: Pick<SetFocusedStageDocumentPayload, 'sessionId' | 'stageSlug' | 'modelId'>,
): string => `${payload.sessionId}:${payload.stageSlug}:${payload.modelId}`;

const createFocusEntry = (
    payload: SetFocusedStageDocumentPayload,
): FocusedStageDocumentState => ({
    modelId: payload.modelId,
    documentKey: payload.documentKey,
});

describe('StageRunChecklist', () => {
    beforeEach(() => {
        initializeMockDialecticState();
    });

    it('renders stage steps and grouped documents using recipe and progress data', () => {
        const recipe = createRecipe([buildPlannerStep(), buildDraftStep(), buildRenderStep()]);

        const stepStatuses: StepStatuses = {
            planner_header: 'completed',
            draft_document: 'in_progress',
            render_document: 'not_started',
        };

        const documents: StageRunDocuments = {
            synthesis_plan_header: {
                status: 'completed',
                job_id: 'job-1',
                latestRenderedResourceId: 'resource-1',
                modelId: modelIdA,
                versionHash: 'hash-a1',
                lastRenderedResourceId: 'resource-1',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_outline: {
                status: 'continuing',
                job_id: 'job-2',
                latestRenderedResourceId: 'resource-2',
                modelId: modelIdB,
                versionHash: 'hash-b1',
                lastRenderedResourceId: 'resource-2',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        expect(screen.getByText('Completed 1 of 1 documents')).toBeInTheDocument();
        expect(screen.queryByText(/Outstanding/i)).not.toBeInTheDocument();

        const plannerRow = screen.getByTestId('step-row-planner_header');
        expect(within(plannerRow).getByText('Planner Header')).toBeInTheDocument();
        expect(within(plannerRow).getByText('Completed')).toBeInTheDocument();
        expect(within(plannerRow).getByText('Parallel Group 1')).toBeInTheDocument();
        expect(within(plannerRow).getByText('Branch planner')).toBeInTheDocument();

        const draftRow = screen.getByTestId('step-row-draft_document');
        expect(within(draftRow).getByText('Draft Document')).toBeInTheDocument();
        expect(within(draftRow).getByText('In Progress')).toBeInTheDocument();

        const renderRow = screen.getByTestId('step-row-render_document');
        expect(within(renderRow).getByText('Render Document')).toBeInTheDocument();
        expect(within(renderRow).getByText('Not Started')).toBeInTheDocument();

        const plannerDocuments = screen.getByTestId('documents-for-planner_header');
        const headerDocument = within(plannerDocuments).getByTestId('document-synthesis_plan_header');
        expect(within(headerDocument).getByText('synthesis_plan_header')).toBeInTheDocument();
        expect(within(headerDocument).getByText('Completed')).toBeInTheDocument();
        expect(within(headerDocument).getByText('job-1')).toBeInTheDocument();
        expect(within(headerDocument).getByText('resource-1')).toBeInTheDocument();

        expect(screen.queryByTestId('document-synthesis_document_outline')).not.toBeInTheDocument();
    });

    it('renders multiple documents per step with varied statuses and optional metadata', () => {
        const recipe = createRecipe([buildPlannerStep(), buildMultiDocumentExecuteStep(), buildRenderStep()]);

        const stepStatuses: StepStatuses = {
            planner_header: 'completed',
            draft_document: 'waiting_for_children',
            render_document: 'waiting_for_children',
        };

        const documents: StageRunDocuments = {
            synthesis_plan_header: {
                status: 'completed',
                job_id: 'plan-job-1',
                latestRenderedResourceId: 'resource-plan',
                modelId: modelIdA,
                versionHash: 'hash-a1',
                lastRenderedResourceId: 'resource-plan',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_outline: {
                status: 'retrying',
                job_id: 'execute-job-outline',
                latestRenderedResourceId: 'resource-outline-v1',
                modelId: modelIdB,
                versionHash: 'hash-b1',
                lastRenderedResourceId: 'resource-outline-v1',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_manifest: {
                status: 'failed',
                job_id: 'execute-job-manifest',
                latestRenderedResourceId: 'resource-manifest-v1',
                modelId: modelIdA,
                versionHash: 'hash-a2',
                lastRenderedResourceId: 'resource-manifest-v1',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_appendix: {
                status: 'generating',
                job_id: 'execute-job-appendix',
                latestRenderedResourceId: 'resource-appendix-v1',
                modelId: modelIdA,
                versionHash: 'hash-a3',
                lastRenderedResourceId: 'resource-appendix-v1',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        const draftRow = screen.getByTestId('step-row-draft_document');
        expect(within(draftRow).getByText('Waiting for Children')).toBeInTheDocument();

        const renderRow = screen.getByTestId('step-row-render_document');
        expect(within(renderRow).getByText('Waiting for Children')).toBeInTheDocument();

        const draftDocuments = screen.getByTestId('documents-for-draft_document');

        expect(within(draftDocuments).queryByTestId('document-synthesis_document_outline')).not.toBeInTheDocument();

        const manifestDocument = within(draftDocuments).getByTestId('document-synthesis_document_manifest');
        expect(within(manifestDocument).getByText('Failed')).toBeInTheDocument();
        expect(within(manifestDocument).getByText('resource-manifest-v1')).toBeInTheDocument();

        const appendixDocument = within(draftDocuments).getByTestId('document-synthesis_document_appendix');
        expect(within(appendixDocument).getByText('Generating')).toBeInTheDocument();
        expect(within(appendixDocument).getByText('execute-job-appendix')).toBeInTheDocument();
        expect(within(appendixDocument).getByText('resource-appendix-v1')).toBeInTheDocument();
    });

    it('renders documents in lexicographical order by document key', () => {
        const recipe = createRecipe([buildPlannerStep(), buildMultiDocumentExecuteStep()]);

        const stepStatuses: StepStatuses = {
            planner_header: 'completed',
            draft_document: 'in_progress',
        };

        const documents: StageRunDocuments = {
            synthesis_document_manifest: {
                status: 'continuing',
                job_id: 'job-manifest',
                latestRenderedResourceId: 'resource-manifest-v1',
                modelId: modelIdB,
                versionHash: 'hash-b1',
                lastRenderedResourceId: 'resource-manifest-v1',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_appendix: {
                status: 'continuing',
                job_id: 'job-appendix',
                latestRenderedResourceId: 'resource-appendix-v1',
                modelId: modelIdB,
                versionHash: 'hash-b2',
                lastRenderedResourceId: 'resource-appendix-v1',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_outline: {
                status: 'continuing',
                job_id: 'job-outline',
                latestRenderedResourceId: 'resource-outline-v1',
                modelId: modelIdB,
                versionHash: 'hash-b3',
                lastRenderedResourceId: 'resource-outline-v1',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        render(<StageRunChecklist modelId={modelIdB} onDocumentSelect={vi.fn()} />);

        const draftDocuments = screen.getByTestId('documents-for-draft_document');
        const renderedDocumentRows = within(draftDocuments).getAllByTestId(/^document-/);
        const renderedOrder = renderedDocumentRows.map(row => {
            const documentKeyElement = within(row).getByText(/synthesis_document_/);
            return documentKeyElement.textContent;
        });

        expect(renderedOrder).toEqual([
            'synthesis_document_appendix',
            'synthesis_document_manifest',
            'synthesis_document_outline',
        ]);
    });

    it('renders only the documents for the specified model', () => {
        const recipe = createRecipe([buildPlannerStep(), buildDraftStep(), buildRenderStep()]);

        const stepStatuses: StepStatuses = {
            planner_header: 'completed',
            draft_document: 'in_progress',
            render_document: 'not_started',
        };

        const documents: StageRunDocuments = {
            synthesis_plan_header: { // model-a
                status: 'completed',
                job_id: 'job-1',
                latestRenderedResourceId: 'resource-1',
                modelId: modelIdA,
                versionHash: 'hash-a1',
                lastRenderedResourceId: 'resource-1',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_outline: { // model-b
                status: 'continuing',
                job_id: 'job-2',
                latestRenderedResourceId: 'resource-2',
                modelId: modelIdB,
                versionHash: 'hash-b1',
                lastRenderedResourceId: 'resource-2',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        // Assert that only model-a's documents are rendered
        expect(screen.getByTestId('document-synthesis_plan_header')).toBeInTheDocument();
        expect(screen.queryByTestId('document-synthesis_document_outline')).not.toBeInTheDocument();

        // Assert summary is scoped to the model
        expect(screen.getByText('Completed 1 of 1 documents')).toBeInTheDocument();
        expect(screen.queryByText(/Outstanding/i)).not.toBeInTheDocument();

        const plannerRow = screen.getByTestId('step-row-planner_header');
        expect(within(plannerRow).getByText('Planner Header')).toBeInTheDocument();
        expect(within(plannerRow).getByText('Completed')).toBeInTheDocument();
    });

    it('renders multiple documents for its model and ignores others', () => {
        const recipe = createRecipe([buildPlannerStep(), buildMultiDocumentExecuteStep()]);

        const stepStatuses: StepStatuses = {
            planner_header: 'completed',
            draft_document: 'waiting_for_children',
        };

        const documents: StageRunDocuments = {
            synthesis_plan_header: { // Belongs to model-a
                status: 'completed',
                job_id: 'plan-job-1',
                latestRenderedResourceId: 'resource-plan',
                modelId: modelIdA,
                versionHash: 'hash-a1',
                lastRenderedResourceId: 'resource-plan',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_outline: { // Belongs to model-b
                status: 'retrying',
                job_id: 'execute-job-outline',
                latestRenderedResourceId: 'resource-outline-v1',
                modelId: modelIdB,
                versionHash: 'hash-b1',
                lastRenderedResourceId: 'resource-outline-v1',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_manifest: { // Belongs to model-a
                status: 'failed',
                job_id: 'execute-job-manifest',
                latestRenderedResourceId: 'resource-manifest-v1',
                modelId: modelIdA,
                versionHash: 'hash-a2',
                lastRenderedResourceId: 'resource-manifest-v1',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        const draftDocuments = screen.getByTestId('documents-for-draft_document');
        expect(within(draftDocuments).getByTestId('document-synthesis_document_manifest')).toBeInTheDocument();
        expect(within(draftDocuments).queryByTestId('document-synthesis_document_outline')).not.toBeInTheDocument();

        // Check header document for model-a
        const plannerDocuments = screen.getByTestId('documents-for-planner_header');
        expect(within(plannerDocuments).getByTestId('document-synthesis_plan_header')).toBeInTheDocument();
    });

    it('invokes onDocumentSelect with the correct modelId', () => {
        const recipe = createRecipe([buildMultiDocumentExecuteStep()]);
        const stepStatuses: StepStatuses = { draft_document: 'completed' };
        const documents: StageRunDocuments = {
            synthesis_document_outline: {
                status: 'completed',
                job_id: 'job-outline',
                latestRenderedResourceId: 'res-outline',
                modelId: modelIdA,
                versionHash: 'hash-a1',
                lastRenderedResourceId: 'res-outline',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_manifest: {
                status: 'completed',
                job_id: 'job-manifest',
                latestRenderedResourceId: 'res-manifest',
                modelId: modelIdB,
                versionHash: 'hash-b1',
                lastRenderedResourceId: 'res-manifest',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };
        const progressEntry = createProgressEntry(stepStatuses, documents);
        setChecklistState(recipe, progressEntry);
        const onDocumentSelect = vi.fn();

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={onDocumentSelect} />);

        const outlineRow = screen.getByTestId('document-synthesis_document_outline');
        fireEvent.click(outlineRow);

        expect(onDocumentSelect).toHaveBeenCalledTimes(1);
        expect(onDocumentSelect).toHaveBeenCalledWith(expect.objectContaining({
            modelId: modelIdA, // Assert the correct modelId is passed up
            documentKey: 'synthesis_document_outline',
        }));
    });

    it('does not mutate the store directly when a document row is clicked', () => {
        const recipe = createRecipe([buildMultiDocumentExecuteStep()]);

        const stepStatuses: StepStatuses = {
            draft_document: 'completed',
        };

        const documents: StageRunDocuments = {
            synthesis_document_outline: {
                status: 'completed',
                job_id: 'job-outline',
                latestRenderedResourceId: 'res-outline',
                modelId: modelIdA,
                versionHash: 'hash-a1',
                lastRenderedResourceId: 'res-outline',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        const storeSetter = getDialecticStoreActionMock('setFocusedStageDocument');
        storeSetter.mockClear();

        const onDocumentSelect = vi.fn();

        render(<StageRunChecklist modelId={modelIdA} focusedStageDocumentMap={{}} onDocumentSelect={onDocumentSelect} />);

        const outlineRow = screen.getByTestId('document-synthesis_document_outline');
        fireEvent.click(outlineRow);

        expect(onDocumentSelect).toHaveBeenCalledTimes(1);
        expect(storeSetter).not.toHaveBeenCalled();
    });

    it('highlights the focused document and leaves sibling documents unselected', () => {
        const recipe = createRecipe([buildMultiDocumentExecuteStep()]);

        const stepStatuses: StepStatuses = {
            draft_document: 'completed',
        };

        const documents: StageRunDocuments = {
            synthesis_document_outline: {
                status: 'completed',
                job_id: 'job-outline',
                latestRenderedResourceId: 'res-outline',
                modelId: modelIdA,
                versionHash: 'hash-a1',
                lastRenderedResourceId: 'res-outline',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_manifest: {
                status: 'completed',
                job_id: 'job-manifest',
                latestRenderedResourceId: 'res-manifest',
                modelId: modelIdB,
                versionHash: 'hash-b1',
                lastRenderedResourceId: 'res-manifest',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);
        setChecklistState(recipe, progressEntry);

        const focusedStageDocumentMap = {
            [`${sessionId}:${recipe.stageSlug}:${modelIdB}`]: {
                modelId: modelIdB,
                documentKey: 'synthesis_document_manifest',
            },
        };

        render(
            <StageRunChecklist
                focusedStageDocumentMap={focusedStageDocumentMap}
                onDocumentSelect={vi.fn()}
                modelId={modelIdB}
            />,
        );

        const manifestRow = screen.getByTestId('document-synthesis_document_manifest');
        expect(manifestRow).toHaveAttribute('data-active', 'true');

        // This assertion is key: the component for model B should not render model A's document.
        expect(screen.queryByTestId('document-synthesis_document_outline')).toBeNull();
    });

    it('propagates selection metadata across different steps for the same model', () => {
        const recipe = createRecipe([buildPlannerStep(), buildMultiDocumentExecuteStep()]);

        const stepStatuses: StepStatuses = {
            planner_header: 'completed',
            draft_document: 'in_progress',
        };

        const documents: StageRunDocuments = {
            synthesis_plan_header: { // model-a
                status: 'completed',
                job_id: 'planner-job',
                latestRenderedResourceId: 'planner-resource',
                modelId: modelIdA,
                versionHash: 'hash-a1',
                lastRenderedResourceId: 'planner-resource',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_manifest: { // model-b (should be ignored)
                status: 'generating',
                job_id: 'executor-job-manifest',
                latestRenderedResourceId: 'executor-resource-manifest',
                modelId: modelIdB,
                versionHash: 'hash-b1',
                lastRenderedResourceId: 'executor-resource-manifest',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_appendix: { // model-a
                status: 'continuing',
                job_id: 'executor-job-appendix',
                latestRenderedResourceId: 'executor-resource-appendix',
                modelId: modelIdA,
                versionHash: 'hash-a2',
                lastRenderedResourceId: 'executor-resource-appendix',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        const onDocumentSelect = vi.fn();

        render(
            <StageRunChecklist
                focusedStageDocumentMap={{}}
                onDocumentSelect={onDocumentSelect}
                modelId={modelIdA}
            />,
        );

        // Assert that the document for model-b is NOT rendered
        expect(screen.queryByTestId('document-synthesis_document_manifest')).toBeNull();

        // Click the planner document for model-a
        const plannerDocument = screen.getByTestId('document-synthesis_plan_header');
        fireEvent.click(plannerDocument);

        expect(onDocumentSelect).toHaveBeenCalledTimes(1);
        const plannerPayload = onDocumentSelect.mock.calls[0]?.[0];
        expect(plannerPayload).toMatchObject({
            modelId: modelIdA,
            documentKey: 'synthesis_plan_header',
            stepKey: 'planner_header',
        });

        // Click the appendix document for model-a
        const appendixDocument = screen.getByTestId('document-synthesis_document_appendix');
        fireEvent.click(appendixDocument);

        expect(onDocumentSelect).toHaveBeenCalledTimes(2);
        const appendixPayload = onDocumentSelect.mock.calls[1]?.[0];
        expect(appendixPayload).toMatchObject({
            modelId: modelIdA,
            documentKey: 'synthesis_document_appendix',
            stepKey: 'draft_document',
        });
    });

    it('defaults missing step statuses to Not Started', () => {
        const recipe = createRecipe([buildPlannerStep(), buildDraftStep(), buildRenderStep()]);

        const stepStatuses: StepStatuses = {
            planner_header: 'completed',
        };

        const documents: StageRunDocuments = {
            synthesis_plan_header: {
                status: 'completed',
                job_id: 'plan-job',
                latestRenderedResourceId: 'resource-plan',
                modelId: modelIdA,
                versionHash: 'hash-a1',
                lastRenderedResourceId: 'resource-plan',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        const plannerRow = screen.getByTestId('step-row-planner_header');
        expect(within(plannerRow).getByText('Completed')).toBeInTheDocument();

        const draftRow = screen.getByTestId('step-row-draft_document');
        expect(within(draftRow).getByText('Not Started')).toBeInTheDocument();

        const renderRow = screen.getByTestId('step-row-render_document');
        expect(within(renderRow).getByText('Not Started')).toBeInTheDocument();
    });

    it('renders an empty document message when no documents are tracked', () => {
        const recipe = createRecipe([buildPlannerStep(), buildDraftStep()]);

        const stepStatuses: StepStatuses = {
            planner_header: 'in_progress',
            draft_document: 'not_started',
        };

        const documents: StageRunDocuments = {};

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        expect(screen.getByText('No documents generated yet.')).toBeInTheDocument();
        expect(screen.queryByTestId(/^document-/)).toBeNull();
    });

    it('suppresses optional metadata labels when parallel_group and branch_key are absent', () => {
        const metadataFreeStep: DialecticStageRecipeStep = {
            id: 'step-no-meta',
            step_key: 'metadata_less_step',
            step_slug: 'metadata-less-step',
            step_name: 'Metadata-Less Step',
            execution_order: 1,
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            inputs_required: [],
            outputs_required: [
                {
                    document_key: 'metadata_less_document',
                    artifact_class: 'assembled_json',
                    file_type: 'json',
                },
            ],
            output_type: 'AssembledDocumentJson',
            granularity_strategy: 'one_to_one',
        };

        const recipe = createRecipe([metadataFreeStep]);

        const stepStatuses: StepStatuses = {};

        const documents: StageRunDocuments = {
            metadata_less_document: {
                status: 'idle',
                job_id: 'job-meta-free',
                latestRenderedResourceId: 'resource-meta-free',
                modelId: modelIdA,
                versionHash: 'hash-a1',
                lastRenderedResourceId: 'resource-meta-free',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        const stepRow = screen.getByTestId('step-row-metadata_less_step');
        expect(within(stepRow).getByText('Metadata-Less Step')).toBeInTheDocument();
        expect(within(stepRow).getByText('Not Started')).toBeInTheDocument();
        expect(within(stepRow).queryByText(/Parallel Group/i)).toBeNull();
        expect(within(stepRow).queryByText(/Branch/i)).toBeNull();

        const documentRow = screen.getByTestId('document-metadata_less_document');
        expect(within(documentRow).getByText('Idle')).toBeInTheDocument();
    });

    it('ignores documents that are not produced by any recipe step', () => {
        const recipe = createRecipe([buildPlannerStep(), buildDraftStep()]);

        const stepStatuses: StepStatuses = {
            planner_header: 'completed',
            draft_document: 'in_progress',
        };

        const documents: StageRunDocuments = {
            synthesis_plan_header: {
                status: 'completed',
                job_id: 'plan-job',
                latestRenderedResourceId: 'resource-plan',
                modelId: modelIdA,
                versionHash: 'hash-a1',
                lastRenderedResourceId: 'resource-plan',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_outline: {
                status: 'generating',
                job_id: 'draft-job',
                latestRenderedResourceId: 'resource-outline-v1',
                modelId: modelIdB,
                versionHash: 'hash-b1',
                lastRenderedResourceId: 'resource-outline-v1',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            unrelated_document: {
                status: 'completed',
                job_id: 'unexpected-job',
                latestRenderedResourceId: 'unexpected-resource',
                modelId: modelIdA,
                versionHash: 'hash-a2',
                lastRenderedResourceId: 'unexpected-resource',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        const draftDocuments = screen.getByTestId('documents-for-draft_document');
        expect(within(draftDocuments).queryByTestId('document-synthesis_document_outline')).not.toBeInTheDocument();
        expect(screen.queryByTestId('document-unrelated_document')).toBeNull();
    });

    it('sorts steps by execution order and then by step key', () => {
        const unorderedSteps: RecipeSteps = [
            {
                ...buildDraftStep(),
                execution_order: 4,
                step_key: 'draft_document',
            },
            {
                ...buildRenderStep(),
                execution_order: 5,
                step_key: 'render_document',
            },
            {
                ...buildPlannerStep(),
                execution_order: 2,
                step_key: 'planner_header',
            },
            {
                ...buildSecondaryPlannerStep(),
                execution_order: 2,
                step_key: 'planner_refinement',
            },
        ];

        const recipe = createRecipe(unorderedSteps);

        const stepStatuses: StepStatuses = {
            planner_header: 'completed',
            planner_refinement: 'completed',
            draft_document: 'completed',
            render_document: 'completed',
        };

        const documents: StageRunDocuments = {
            synthesis_plan_header: {
                status: 'completed',
                job_id: 'job-1',
                latestRenderedResourceId: 'resource-1',
                modelId: modelIdA,
                versionHash: 'hash-a1',
                lastRenderedResourceId: 'resource-1',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            analysis_plan_header: {
                status: 'completed',
                job_id: 'job-2',
                latestRenderedResourceId: 'resource-2',
                modelId: modelIdB,
                versionHash: 'hash-b1',
                lastRenderedResourceId: 'resource-2',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_outline: {
                status: 'completed',
                job_id: 'job-3',
                latestRenderedResourceId: 'resource-3',
                modelId: modelIdA,
                versionHash: 'hash-a2',
                lastRenderedResourceId: 'resource-3',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_rendered: {
                status: 'completed',
                job_id: 'job-4',
                latestRenderedResourceId: 'resource-4',
                modelId: modelIdB,
                versionHash: 'hash-b2',
                lastRenderedResourceId: 'resource-4',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        const stepRows = screen.getAllByTestId(/^step-row-/);
        const renderedStepKeys = stepRows.map(row => row.getAttribute('data-testid')?.replace('step-row-', ''));

        expect(renderedStepKeys).toEqual([
            'planner_header',
            'planner_refinement',
            'draft_document',
            'render_document',
        ]);
    });

    it('omits outstanding summary when all documents are complete', () => {
        const recipe = createRecipe([buildPlannerStep(), buildDraftStep()]);

        const stepStatuses: StepStatuses = {
            planner_header: 'completed',
            draft_document: 'completed',
        };

        const documents: StageRunDocuments = {
            synthesis_plan_header: {
                status: 'completed',
                job_id: 'plan-job',
                latestRenderedResourceId: 'resource-plan',
                modelId: modelIdA,
                versionHash: 'hash-a1',
                lastRenderedResourceId: 'resource-plan',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_outline: {
                status: 'completed',
                job_id: 'draft-job',
                latestRenderedResourceId: 'resource-outline',
                modelId: modelIdA,
                versionHash: 'hash-a2',
                lastRenderedResourceId: 'resource-outline',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        expect(screen.getByText('Completed 2 of 2 documents')).toBeInTheDocument();
        expect(screen.queryByText(/Outstanding:/i)).toBeNull();
    });

    it('lists multiple outstanding documents in the summary', () => {
        const recipe = createRecipe([buildPlannerStep(), buildDraftStep(), buildRenderStep()]);

        const stepStatuses: StepStatuses = {
            planner_header: 'completed',
            draft_document: 'in_progress',
            render_document: 'not_started',
        };

        const documents: StageRunDocuments = {
            synthesis_plan_header: {
                status: 'completed',
                job_id: 'job-plan',
                latestRenderedResourceId: 'resource-plan',
                modelId: modelIdA,
                versionHash: 'hash-a1',
                lastRenderedResourceId: 'resource-plan',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_outline: {
                status: 'continuing',
                job_id: 'job-outline',
                latestRenderedResourceId: 'resource-outline',
                modelId: modelIdA,
                versionHash: 'hash-a2',
                lastRenderedResourceId: 'resource-outline',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_rendered: {
                status: 'retrying',
                job_id: 'job-render',
                latestRenderedResourceId: 'resource-render',
                modelId: modelIdA,
                versionHash: 'hash-a3',
                lastRenderedResourceId: 'resource-render',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        render(<StageRunChecklist modelId={modelIdA} onDocumentSelect={vi.fn()} />);

        expect(screen.getByText('Completed 1 of 3 documents')).toBeInTheDocument();
        expect(screen.getByText(/Outstanding: synthesis_document_outline, synthesis_document_rendered/i)).toBeInTheDocument();
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

    it('renders guard state when recipe is available but progress is not', () => {
        const recipe = createRecipe([buildPlannerStep(), buildDraftStep()]);

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

        expect(screen.getByText('Stage progress data is unavailable.')).toBeInTheDocument();
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

    it('supports alternate stage slugs while preserving metadata rendering', () => {
        const plannerStepBase = buildPlannerStep();
        const analysisOutputs: OutputsRequired = [
            {
                document_key: 'analysis_plan_header',
                artifact_class: 'header_context',
                file_type: 'json',
            },
        ];

        const plannerStep: DialecticStageRecipeStep = {
            ...plannerStepBase,
            outputs_required: analysisOutputs,
            step_key: 'analysis_planner_header',
            step_slug: 'analysis-planner-header',
            step_name: 'Analysis Planner Header',
        };

        const renderStepBase = buildRenderStep();
        const renderStep: DialecticStageRecipeStep = {
            ...renderStepBase,
            step_key: 'analysis_render_document',
            step_slug: 'analysis-render-document',
            step_name: 'Render Analysis Document',
        };

        const recipe = createRecipe([plannerStep, renderStep], alternateStageSlug, 'instance-analysis');

        const stepStatuses: StepStatuses = {
            analysis_planner_header: 'completed',
            analysis_render_document: 'failed',
        };

        const documents: StageRunDocuments = {
            analysis_plan_header: {
                status: 'completed',
                job_id: 'analysis-job-1',
                latestRenderedResourceId: 'analysis-header',
                modelId: modelIdB,
                versionHash: 'hash-b1',
                lastRenderedResourceId: 'analysis-header',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
            synthesis_document_rendered: {
                status: 'failed',
                job_id: 'analysis-job-2',
                latestRenderedResourceId: 'analysis-render',
                modelId: modelIdB,
                versionHash: 'hash-b2',
                lastRenderedResourceId: 'analysis-render',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        render(<StageRunChecklist modelId={modelIdB} onDocumentSelect={vi.fn()} />);

        const plannerRow = screen.getByTestId('step-row-analysis_planner_header');
        expect(within(plannerRow).getByText('Analysis Planner Header')).toBeInTheDocument();
        expect(within(plannerRow).getByText('Completed')).toBeInTheDocument();

        const renderRow = screen.getByTestId('step-row-analysis_render_document');
        expect(within(renderRow).getByText('Render Analysis Document')).toBeInTheDocument();
        expect(within(renderRow).getByText('Failed')).toBeInTheDocument();

        const renderDocuments = screen.getByTestId('documents-for-analysis_render_document');
        const renderDocument = within(renderDocuments).getByTestId('document-synthesis_document_rendered');
        expect(within(renderDocument).getByText('Failed')).toBeInTheDocument();
        expect(within(renderDocument).getByText('analysis-job-2')).toBeInTheDocument();
        expect(within(renderDocument).getByText('analysis-render')).toBeInTheDocument();
    });

    it('highlights the clicked document using the provided focusedStageDocumentMap', () => {
        const recipe = createRecipe([buildMultiDocumentExecuteStep()]);

        const stepStatuses: StepStatuses = {
            draft_document: 'completed',
        };

        const documents: StageRunDocuments = {
            synthesis_document_outline: {
                status: 'completed',
                job_id: 'job-outline',
                latestRenderedResourceId: 'res-outline',
                modelId: modelIdA,
                versionHash: 'hash-a1',
                lastRenderedResourceId: 'res-outline',
                lastRenderAtIso: '2025-01-01T00:00:00.000Z',
            },
        };

        const progressEntry = createProgressEntry(stepStatuses, documents);

        setChecklistState(recipe, progressEntry);

        const onDocumentSelect = vi.fn();

        const ControlledChecklist = () => {
            const [focusedMap, setFocusedMap] = useState<Record<string, FocusedStageDocumentState | null>>({});

            const handleSelect = (payload: SetFocusedStageDocumentPayload) => {
                setFocusedMap({
                    [buildFocusMapKey(payload)]: createFocusEntry(payload),
                });
                onDocumentSelect(payload);
            };

            return (
                <StageRunChecklist
                    focusedStageDocumentMap={focusedMap}
                    onDocumentSelect={handleSelect}
                    modelId={modelIdA}
                />
            );
        };

        render(<ControlledChecklist />);

        const outlineRow = screen.getByTestId('document-synthesis_document_outline');
        fireEvent.click(outlineRow);

        expect(onDocumentSelect).toHaveBeenCalledTimes(1);
        expect(outlineRow).toHaveAttribute('data-active', 'true');
    });
});
