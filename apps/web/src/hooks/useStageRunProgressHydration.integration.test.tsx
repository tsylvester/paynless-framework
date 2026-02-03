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
    UnifiedProjectProgress,
    User,
} from '@paynless/types';

import { useStageRunProgressHydration } from './useStageRunProgressHydration';
import { DynamicProgressBar } from '../components/common/DynamicProgressBar';
import {
    getDialecticStoreState,
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

vi.mock('@paynless/api', async () => {
    const actualModule: typeof import('@paynless/api') = await vi.importActual('@paynless/api');
    const { createMockDialecticClient } = await import('../../../../packages/api/src/mocks/dialectic.api.mock');
    const dialecticClient = createMockDialecticClient();
    const getAllStageProgressResponse: GetAllStageProgressResponse = [
        {
            stageSlug: 'thesis',
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
            stepStatuses: { document_step: 'completed' },
            stageStatus: 'completed',
        },
    ];
    dialecticClient.getAllStageProgress.mockResolvedValue({
        data: getAllStageProgressResponse,
        status: 200,
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
            currentProjectDetail: project,
            recipesByStageSlug: { thesis: recipeThesis },
            selectedModels,
        });
    });

    it('after hydration selectUnifiedProjectProgress returns correct overall percentage', async () => {
        render(<HydrationWrapper />);

        await waitFor(() => {
            const state = getDialecticStoreState();
            const progressKeys = Object.keys(state.stageRunProgress);
            expect(progressKeys.length).toBeGreaterThan(0);
        });

        const state = getDialecticStoreState();
        const progress: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
        expect(progress.totalStages).toBeGreaterThan(0);
        expect(progress.overallPercentage).toBeGreaterThan(0);
    });

    it('after hydration all stage statuses are correctly populated', async () => {
        render(<HydrationWrapper />);

        await waitFor(() => {
            const state = getDialecticStoreState();
            const progressKeys = Object.keys(state.stageRunProgress);
            expect(progressKeys.length).toBeGreaterThan(0);
        });

        const state = getDialecticStoreState();
        const progress: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
        expect(progress.stageDetails.length).toBeGreaterThan(0);
        const thesisDetail = progress.stageDetails.find((s) => s.stageSlug === 'thesis');
        expect(thesisDetail).toBeDefined();
        if (thesisDetail !== undefined) {
            expect(thesisDetail.stageStatus).toBeDefined();
        }
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
