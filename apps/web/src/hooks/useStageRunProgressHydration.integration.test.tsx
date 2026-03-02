import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    DialecticSession,
    DialecticProject,
    DialecticProcessTemplate,
    DialecticStage,
    DialecticStageRecipe,
    DialecticStageRecipeStep,
    GetAllStageProgressResponse,
    SelectedModels,
    StageRunProgressSnapshot,
    UnifiedProjectProgress,
    User,
} from '@paynless/types';

import { useStageRunProgressHydration } from './useStageRunProgressHydration';
import { DynamicProgressBar } from '../components/common/DynamicProgressBar';
import {
    getDialecticStoreState,
    getDialecticStoreActionMock,
    initializeMockDialecticState,
    setDialecticStateValues,
} from '../mocks/dialecticStore.mock';
import { resetAuthStoreMock, mockSetAuthUser } from '../mocks/authStore.mock';
import { selectUnifiedProjectProgress } from '@paynless/store';

const sessionId = 'session-hydration-int';
const projectId = 'project-hydration-int';
const iterationNumber = 1;
const userId = 'user-hydration-int';

const stageThesis: DialecticStage = {
    id: 'stage-thesis-hydration',
    slug: 'thesis',
    display_name: 'Thesis',
    description: 'Thesis stage',
    created_at: new Date().toISOString(),
    default_system_prompt_id: 'sp-thesis',
    expected_output_template_ids: [],
    recipe_template_id: null,
    active_recipe_instance_id: null,
};

const templateOneStage: DialecticProcessTemplate = {
    id: 'pt-hydration',
    name: 'Hydration Test Template',
    description: 'One-stage template for hydration integration test',
    created_at: new Date().toISOString(),
    starting_stage_id: stageThesis.id,
    stages: [stageThesis],
    transitions: [],
};

const documentStep: DialecticStageRecipeStep = {
    id: 'step-doc',
    step_key: 'document_step',
    step_slug: 'document',
    step_name: 'Document',
    execution_order: 1,
    job_type: 'EXECUTE',
    prompt_type: 'Turn',
    output_type: 'assembled_document_json',
    granularity_strategy: 'per_source_document',
    inputs_required: [],
    outputs_required: [
        { document_key: 'business_case', artifact_class: 'rendered_document', file_type: 'markdown' },
    ],
};

const recipeThesis: DialecticStageRecipe = {
    stageSlug: 'thesis',
    instanceId: 'instance-thesis-hydration',
    steps: [documentStep],
    edges: [],
};

const selectedModels: SelectedModels[] = [
    { id: 'model-1', displayName: 'Model 1' },
];

const session: DialecticSession = {
    id: sessionId,
    project_id: projectId,
    session_description: null,
    user_input_reference_url: null,
    iteration_count: iterationNumber,
    selected_models: selectedModels,
    status: 'active',
    associated_chat_id: null,
    current_stage_id: stageThesis.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dialectic_contributions: [],
    dialectic_session_models: [],
    feedback: [],
};

const project: DialecticProject = {
    id: projectId,
    user_id: userId,
    project_name: 'Hydration Test Project',
    initial_user_prompt: 'Initial',
    selected_domain_id: 'domain1',
    dialectic_domains: { name: 'Tech' },
    selected_domain_overlay_id: null,
    repo_url: null,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dialectic_sessions: [session],
    resources: [],
    process_template_id: templateOneStage.id,
    dialectic_process_templates: templateOneStage,
    isLoadingProcessTemplate: false,
    processTemplateError: null,
    contributionGenerationStatus: 'idle',
    generateContributionsError: null,
    isSubmittingStageResponses: false,
    submitStageResponsesError: null,
    isSavingContributionEdit: false,
    saveContributionEditError: null,
};

const mockUser: User = {
    id: userId,
    email: 'hydration@example.com',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

const runKey = `${sessionId}:${iterationNumber}`;
const thesisProgressKey = `${sessionId}:thesis:${iterationNumber}`;

const initialStageRunProgress: Record<string, StageRunProgressSnapshot> = {
    [thesisProgressKey]: {
        documents: {},
        stepStatuses: { document_step: 'not_started' },
        jobProgress: {},
        progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 },
    },
};

vi.mock('@paynless/api', async () => {
    const actualModule: typeof import('@paynless/api') = await vi.importActual('@paynless/api');
    const { createMockDialecticClient } = await import('../../../../packages/api/src/mocks/dialectic.api.mock');
    const dialecticClient = createMockDialecticClient();
    const getAllStageProgressResponse: GetAllStageProgressResponse = {
        dagProgress: { completedStages: 1, totalStages: 1 },
        stages: [
            {
                stageSlug: 'thesis',
                status: 'completed',
                modelCount: 1,
                progress: { completedSteps: 1, totalSteps: 1, failedSteps: 0 },
                steps: [{ stepKey: 'document_step', status: 'completed' }],
                documents: [
                    {
                        documentKey: 'business_case',
                        modelId: 'model-1',
                        status: 'completed',
                        jobId: 'job-1',
                        latestRenderedResourceId: 'res-1',
                        stepKey: 'document_step',
                    },
                ],
            },
        ],
    };
    dialecticClient.getAllStageProgress.mockResolvedValue({
        data: getAllStageProgressResponse,
        status: 200,
        error: undefined,
    });
    dialecticClient.listStageDocuments.mockResolvedValue({
        data: [],
        status: 200,
        error: undefined,
    });
    return {
        ...actualModule,
        api: {
            ...actualModule.api,
            dialectic: () => dialecticClient,
        },
    };
});

vi.mock('@paynless/store', async () => {
    const actual = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
    const dialecticMock = await import('../mocks/dialecticStore.mock');
    const authMock = await import('../mocks/authStore.mock');
    return {
        ...actual,
        useDialecticStore: dialecticMock.useDialecticStore,
        getDialecticStoreState: dialecticMock.getDialecticStoreState,
        getDialecticStoreActionMock: dialecticMock.getDialecticStoreActionMock,
        setDialecticStateValues: dialecticMock.setDialecticStateValues,
        initializeMockDialecticState: dialecticMock.initializeMockDialecticState,
        selectUnifiedProjectProgress: actual.selectUnifiedProjectProgress,
        useAuthStore: authMock.useAuthStore,
    };
});

function HydrationWrapper(): React.ReactElement {
    useStageRunProgressHydration();
    return <DynamicProgressBar sessionId={sessionId} />;
}

describe('useStageRunProgressHydration integration', () => {
    beforeEach(() => {
        initializeMockDialecticState();
        resetAuthStoreMock();
        mockSetAuthUser(mockUser);
        vi.clearAllMocks();
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            activeStageSlug: 'thesis',
            currentProcessTemplate: templateOneStage,
            currentProjectDetail: project,
            recipesByStageSlug: { thesis: recipeThesis },
            selectedModels,
            dagProgressByRun: { [runKey]: { completedStages: 0, totalStages: 1 } },
            stageRunProgress: initialStageRunProgress,
        });
    });

    it('full hydration pipeline from hook → store actions → selectors produces correct selectUnifiedProjectProgress output after reload', async () => {
        render(<HydrationWrapper />);

        await waitFor(() => {
            const state = getDialecticStoreState();
            const thesisProgress = state.stageRunProgress[thesisProgressKey];
            expect(thesisProgress?.progress.completedSteps).toBe(1);
        });

        const state = getDialecticStoreState();
        const progress: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
        expect(progress.totalStages).toBe(1);
        expect(progress.completedStages).toBe(1);
        expect(progress.overallPercentage).toBeGreaterThan(0);
        expect(progress.currentStageSlug).toBe('thesis');
    });

    it('when API returns valid progress data, selectUnifiedProjectProgress returns hydrationReady: true with correct step counts and document counts', async () => {
        render(<HydrationWrapper />);

        await waitFor(() => {
            const state = getDialecticStoreState();
            const thesisProgress = state.stageRunProgress[thesisProgressKey];
            expect(thesisProgress?.progress.completedSteps).toBe(1);
        });

        const state = getDialecticStoreState();
        const progress: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
        expect(progress.hydrationReady).toBe(true);
        expect(progress.stageDetails.length).toBe(1);
        const thesisDetail = progress.stageDetails.find((s) => s.stageSlug === 'thesis');
        expect(thesisDetail).toBeDefined();
        if (thesisDetail !== undefined) {
            expect(thesisDetail.totalSteps).toBe(1);
            expect(thesisDetail.completedSteps).toBe(1);
            expect(thesisDetail.totalDocuments).toBe(1);
            expect(thesisDetail.completedDocuments).toBe(1);
            expect(thesisDetail.stageStatus).toBe('completed');
        }
    });

    it('when recipe fetch fails for a stage, hydration does not proceed, status reflects failure', async () => {
        const fetchStageRecipeMock = getDialecticStoreActionMock('fetchStageRecipe');
        vi.mocked(fetchStageRecipeMock).mockRejectedValueOnce(new Error('recipe fetch failed'));

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        render(<HydrationWrapper />);

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).not.toHaveBeenCalled();
        });

        const state = getDialecticStoreState();
        expect(state.progressHydrationStatus[runKey]).not.toBe('success');
    });

    it('after failed hydration, re-triggering the hook retries and succeeds when the API is available', async () => {
        setDialecticStateValues({ progressHydrationStatus: { [runKey]: 'failed' } });

        const { rerender } = render(<HydrationWrapper />);

        await waitFor(() => {
            const state = getDialecticStoreState();
            expect(state.progressHydrationStatus[runKey]).toBe('failed');
        });

        setDialecticStateValues({ progressHydrationStatus: {} });
        rerender(<HydrationWrapper />);

        await waitFor(() => {
            const state = getDialecticStoreState();
            const thesisProgress = state.stageRunProgress[thesisProgressKey];
            expect(thesisProgress?.progress.completedSteps).toBe(1);
        });

        const state = getDialecticStoreState();
        const progress: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
        expect(progress.hydrationReady).toBe(true);
        expect(progress.overallPercentage).toBeGreaterThan(0);
    });

    it('DynamicProgressBar displays non-zero percentage when documents exist after hydration', async () => {
        render(<HydrationWrapper />);

        await waitFor(() => {
            const percentageText = screen.getByText(/\d+%/);
            expect(percentageText).toBeInTheDocument();
            const textContent: string | null = percentageText.textContent;
            expect(textContent).not.toBeNull();
            if (textContent === null) return;
            const match: RegExpMatchArray | null = textContent.match(/(\d+)%/);
            expect(match).not.toBeNull();
            if (match === null) return;
            const digitGroup: string | undefined = match[1];
            expect(digitGroup).toBeDefined();
            if (digitGroup === undefined) return;
            const value: number = Number.parseInt(digitGroup, 10);
            expect(value).toBeGreaterThan(0);
        });
    });
});
