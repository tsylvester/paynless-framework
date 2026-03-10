import { renderHook } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import type {
    DialecticSession,
    DialecticStage,
    DialecticProcessTemplate,
    DialecticProject,
    User,
    GetAllStageProgressResponse,
    StageRunProgressSnapshot,
} from '@paynless/types';
import { api } from '@paynless/api';

import { useStageRunProgressHydration } from './useStageRunProgressHydration';
import {
    emptyDialecticStageRecipe,
    initializeMockDialecticState,
    setDialecticStateValues,
    getDialecticStoreActionMock,
} from '../mocks/dialecticStore.mock';
import {
    resetAuthStoreMock,
    mockSetAuthUser,
} from '../mocks/authStore.mock';

vi.mock('@paynless/store', async () => {
    const dialecticMock = await import('../mocks/dialecticStore.mock');
    const authMock = await import('../mocks/authStore.mock');
    return {
        ...dialecticMock,
        useAuthStore: authMock.useAuthStore,
    };
});

describe('useStageRunProgressHydration', () => {
    const sessionId = 'session-123';
    const iterationNumber = 4;
    const userId = 'user-456';
    const projectId = 'project-1';

    const mockUser: User = {
        id: userId,
        email: 'test@example.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const createSession = (): DialecticSession => ({
        id: sessionId,
        project_id: projectId,
        session_description: 'Mock session',
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [],
        status: 'active',
        associated_chat_id: null,
        current_stage_id: 'stage-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        dialectic_contributions: [],
        dialectic_session_models: [],
        feedback: [],
    });

    const stageThesis: DialecticStage = {
        id: 'stage-thesis-id',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
        created_at: new Date().toISOString(),
        default_system_prompt_id: 'sp-1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
    };

    const templateOneStage: DialecticProcessTemplate = {
        id: 'pt-1',
        name: 'Template',
        description: '',
        created_at: new Date().toISOString(),
        starting_stage_id: stageThesis.id,
        stages: [stageThesis],
        transitions: [],
    };

    const stageSynthesis: DialecticStage = {
        id: 'stage-synthesis-id',
        slug: 'synthesis',
        display_name: 'Synthesis',
        description: 'Synthesis stage',
        created_at: new Date().toISOString(),
        default_system_prompt_id: 'sp-2',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
    };

    const templateTwoStages: DialecticProcessTemplate = {
        id: 'pt-2',
        name: 'Template Two',
        description: '',
        created_at: new Date().toISOString(),
        starting_stage_id: stageThesis.id,
        stages: [stageThesis, stageSynthesis],
        transitions: [],
    };

    const runKey = `${sessionId}:${iterationNumber}`;

    const recipeThesis: typeof emptyDialecticStageRecipe = {
        ...emptyDialecticStageRecipe,
        stageSlug: 'thesis',
        instanceId: 'inst-thesis',
    };

    const recipesForTemplateOneStage: Record<string, typeof emptyDialecticStageRecipe> = {
        thesis: recipeThesis,
    };

    const recipeSynthesis: typeof emptyDialecticStageRecipe = {
        ...emptyDialecticStageRecipe,
        stageSlug: 'synthesis',
        instanceId: 'inst-synthesis',
    };

    const recipesForTemplateTwoStages: Record<string, typeof emptyDialecticStageRecipe> = {
        thesis: recipeThesis,
        synthesis: recipeSynthesis,
    };

    const synthesisProgressKey = `${sessionId}:synthesis:${iterationNumber}`;

    const emptyProgressSnapshot: StageRunProgressSnapshot = {
        documents: {},
        stepStatuses: {},
        jobProgress: {},
        progress: { totalSteps: 0, completedSteps: 0, failedSteps: 0 },
        jobs: [],
    };

    const validGetAllStageProgressResponse: GetAllStageProgressResponse = {
        dagProgress: { completedStages: 1, totalStages: 1 },
        stages: [
            {
                stageSlug: 'thesis',
                status: 'completed',
                modelCount: 1,
                progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
                steps: [],
                documents: [
                    {
                        documentKey: 'doc-1',
                        modelId: 'model-1',
                        jobId: 'job-1',
                        latestRenderedResourceId: 'res-1',
                        status: 'completed',
                    },
                ],
                edges: [],
                jobs: [],
            },
        ],
    };

    beforeEach(() => {
        initializeMockDialecticState();
        resetAuthStoreMock();
        mockSetAuthUser(mockUser);
        vi.clearAllMocks();
        const dialecticClient = api.dialectic();
        vi.spyOn(api, 'dialectic').mockReturnValue(dialecticClient);
        vi.mocked(dialecticClient.getAllStageProgress).mockResolvedValue({
            data: validGetAllStageProgressResponse,
            error: undefined,
            status: 200,
        });
        vi.mocked(dialecticClient.listStageDocuments).mockResolvedValue({
            data: [],
            error: undefined,
            status: 200,
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('calls hydrateAllStageProgress once when activeSessionDetail and user are first available', async () => {
        const session: DialecticSession = createSession();
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            currentProcessTemplate: templateOneStage,
            recipesByStageSlug: recipesForTemplateOneStage,
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalledTimes(1);
        });

        expect(hydrateAllStageProgressMock).toHaveBeenCalledWith({
            sessionId,
            iterationNumber,
            userId,
            projectId,
        });
    });

    it('calls hydrateAllStageProgress with correct payload shape (no stageSlug)', async () => {
        const session: DialecticSession = createSession();
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            currentProcessTemplate: templateOneStage,
            recipesByStageSlug: recipesForTemplateOneStage,
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalledTimes(1);
        });

        expect(hydrateAllStageProgressMock).toHaveBeenCalledWith({
            sessionId,
            iterationNumber,
            userId,
            projectId,
        });
        const call = vi.mocked(hydrateAllStageProgressMock).mock.calls[0][0];
        expect(Object.prototype.hasOwnProperty.call(call, 'stageSlug')).toBe(false);
    });

    it('calls hydrateStageProgress for active stage after all-stage hydration', async () => {
        const session: DialecticSession = createSession();
        const stageSlug = 'thesis';
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            activeStageSlug: stageSlug,
            currentProcessTemplate: templateOneStage,
            recipesByStageSlug: recipesForTemplateOneStage,
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');
        const hydrateStageProgressMock = getDialecticStoreActionMock('hydrateStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalledTimes(1);
        });

        await waitFor(() => {
            expect(hydrateStageProgressMock).toHaveBeenCalledWith({
                sessionId,
                stageSlug,
                iterationNumber,
                userId,
                projectId,
            });
        });
    });

    it('does not call hydrateAllStageProgress again when activeStageSlug changes (tab change)', async () => {
        const session: DialecticSession = createSession();
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            activeStageSlug: 'thesis',
            currentProcessTemplate: templateOneStage,
            recipesByStageSlug: recipesForTemplateOneStage,
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        const { rerender } = renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalledTimes(1);
        });

        setDialecticStateValues({ activeStageSlug: 'antithesis' });
        rerender();

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalledTimes(1);
        });
    });

    it('does not re-trigger hydration when progressHydrationStatus[runKey] is success', async () => {
        const session: DialecticSession = createSession();
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            currentProcessTemplate: templateOneStage,
            progressHydrationStatus: { [runKey]: 'success' },
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).not.toHaveBeenCalled();
        });
    });

    it('re-triggers hydration when progressHydrationStatus[runKey] is success but stageRunProgress is partial (missing stage)', async () => {
        const session: DialecticSession = {
            ...createSession(),
            current_stage_id: stageThesis.id,
        };
        const project: DialecticProject = {
            id: projectId,
            user_id: userId,
            project_name: 'Test',
            initial_user_prompt: null,
            selected_domain_id: '',
            dialectic_domains: { name: 'Domain' },
            selected_domain_overlay_id: null,
            repo_url: null,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            dialectic_sessions: [session],
            resources: [],
            process_template_id: templateTwoStages.id,
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
        setDialecticStateValues({
            currentProjectDetail: project,
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            currentProcessTemplate: templateTwoStages,
            recipesByStageSlug: recipesForTemplateTwoStages,
            stageRunProgress: { [synthesisProgressKey]: emptyProgressSnapshot },
            progressHydrationStatus: { [runKey]: 'success' },
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalled();
        });
    });

    it('re-hydrates when sessionId changes (user navigates to different session)', async () => {
        const sessionA: DialecticSession = createSession();
        const sessionIdB = 'session-456';
        const sessionB: DialecticSession = {
            ...createSession(),
            id: sessionIdB,
        };
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: sessionA,
            currentProcessTemplate: templateOneStage,
            recipesByStageSlug: recipesForTemplateOneStage,
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        const { rerender } = renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalledTimes(1);
        });
        expect(hydrateAllStageProgressMock).toHaveBeenLastCalledWith({
            sessionId,
            iterationNumber,
            userId,
            projectId,
        });

        setDialecticStateValues({
            activeContextSessionId: sessionIdB,
            activeSessionDetail: sessionB,
        });
        rerender();

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalledTimes(2);
        });
        expect(hydrateAllStageProgressMock).toHaveBeenLastCalledWith({
            sessionId: sessionIdB,
            iterationNumber,
            userId,
            projectId,
        });
    });

    it('does not attempt hydration when user is null', async () => {
        mockSetAuthUser(null);
        const session: DialecticSession = createSession();
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            currentProcessTemplate: templateOneStage,
        });

        const fetchStageRecipeMock = getDialecticStoreActionMock('fetchStageRecipe');
        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(fetchStageRecipeMock).not.toHaveBeenCalled();
            expect(hydrateAllStageProgressMock).not.toHaveBeenCalled();
        });
    });

    it('does not attempt hydration when activeContextSessionId is null', async () => {
        const session: DialecticSession = createSession();
        setDialecticStateValues({
            activeContextSessionId: null,
            activeSessionDetail: session,
            currentProcessTemplate: templateOneStage,
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).not.toHaveBeenCalled();
        });
    });

    it('does not attempt hydration when activeSessionDetail is null', async () => {
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: null,
            currentProcessTemplate: templateOneStage,
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).not.toHaveBeenCalled();
        });
    });

    it('does not attempt hydration when sortedStages is empty', async () => {
        const session: DialecticSession = createSession();
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            currentProcessTemplate: null,
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).not.toHaveBeenCalled();
        });
    });

    it('verifies recipesByStageSlug has entries for all stages after fetchStageRecipe — if any missing, does not proceed and logs error', async () => {
        const session: DialecticSession = createSession();
        const recipeThesis: typeof emptyDialecticStageRecipe = {
            ...emptyDialecticStageRecipe,
            stageSlug: 'thesis',
            instanceId: 'inst-thesis',
        };
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            currentProcessTemplate: templateTwoStages,
            recipesByStageSlug: { thesis: recipeThesis },
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).not.toHaveBeenCalled();
        });

        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });

    it('calls fetchStageRecipe for all sorted stages before calling ensureRecipeForActiveStage', async () => {
        const session: DialecticSession = createSession();
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            currentProcessTemplate: templateOneStage,
            recipesByStageSlug: recipesForTemplateOneStage,
        });

        const fetchStageRecipeMock = getDialecticStoreActionMock('fetchStageRecipe');
        const ensureRecipeForActiveStageMock = getDialecticStoreActionMock('ensureRecipeForActiveStage');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(fetchStageRecipeMock).toHaveBeenCalledWith('thesis');
            expect(ensureRecipeForActiveStageMock).toHaveBeenCalled();
        });

        const fetchOrder: number[] = vi.mocked(fetchStageRecipeMock).mock.invocationCallOrder;
        const ensureOrder: number[] = vi.mocked(ensureRecipeForActiveStageMock).mock.invocationCallOrder;
        const maxFetchOrder: number = Math.max(...fetchOrder);
        const minEnsureOrder: number = Math.min(...ensureOrder);
        expect(maxFetchOrder).toBeLessThan(minEnsureOrder);
    });

    it('calls ensureRecipeForActiveStage for all stages with loaded recipes before calling hydrateAllStageProgress', async () => {
        const session: DialecticSession = createSession();
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            currentProcessTemplate: templateOneStage,
            recipesByStageSlug: recipesForTemplateOneStage,
        });

        const ensureRecipeForActiveStageMock = getDialecticStoreActionMock('ensureRecipeForActiveStage');
        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalledTimes(1);
        });

        const ensureOrder: number[] = vi.mocked(ensureRecipeForActiveStageMock).mock.invocationCallOrder;
        const hydrateOrder: number[] = vi.mocked(hydrateAllStageProgressMock).mock.invocationCallOrder;
        const maxEnsureOrder: number = Math.max(...ensureOrder);
        const minHydrateOrder: number = Math.min(...hydrateOrder);
        expect(maxEnsureOrder).toBeLessThan(minHydrateOrder);
    });

    it('reads progressHydrationStatus from store and does not use a ref', async () => {
        const session: DialecticSession = createSession();
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            currentProcessTemplate: templateOneStage,
            progressHydrationStatus: { [runKey]: 'success' },
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).not.toHaveBeenCalled();
        });
    });

    it('re-triggers hydration when progressHydrationStatus[runKey] is failed', async () => {
        const session: DialecticSession = createSession();
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            currentProcessTemplate: templateOneStage,
            recipesByStageSlug: recipesForTemplateOneStage,
            progressHydrationStatus: { [runKey]: 'failed' },
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalled();
        });
    });

    it('re-triggers hydration when progressHydrationStatus[runKey] is idle', async () => {
        const session: DialecticSession = createSession();
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            currentProcessTemplate: templateOneStage,
            recipesByStageSlug: recipesForTemplateOneStage,
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalled();
        });
    });

    it('when fetchStageRecipe throws, hook logs the error and does not proceed to ensureRecipeForActiveStage', async () => {
        const session: DialecticSession = createSession();
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            currentProcessTemplate: templateOneStage,
        });

        const fetchStageRecipeMock = getDialecticStoreActionMock('fetchStageRecipe');
        const ensureRecipeForActiveStageMock = getDialecticStoreActionMock('ensureRecipeForActiveStage');
        vi.mocked(fetchStageRecipeMock).mockRejectedValueOnce(new Error('fetch failed'));

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(ensureRecipeForActiveStageMock).not.toHaveBeenCalled();
        });

        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });

    it('when ensureRecipeForActiveStage throws, hook logs the error and does not proceed to hydrateAllStageProgress', async () => {
        const session: DialecticSession = createSession();
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            currentProcessTemplate: templateOneStage,
            recipesByStageSlug: recipesForTemplateOneStage,
        });

        const ensureRecipeForActiveStageMock = getDialecticStoreActionMock('ensureRecipeForActiveStage');
        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');
        vi.mocked(ensureRecipeForActiveStageMock).mockRejectedValueOnce(new Error('ensure failed'));

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).not.toHaveBeenCalled();
        });

        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });

    it('per-stage effect respects ordering and does not call hydrateStageProgress when progressHydrationStatus for stage is success', async () => {
        const session: DialecticSession = createSession();
        const stageSlug = 'thesis';
        const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            activeStageSlug: stageSlug,
            currentProcessTemplate: templateOneStage,
            progressHydrationStatus: { [progressKey]: 'success' },
        });

        const hydrateStageProgressMock = getDialecticStoreActionMock('hydrateStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateStageProgressMock).not.toHaveBeenCalled();
        });
    });
});
