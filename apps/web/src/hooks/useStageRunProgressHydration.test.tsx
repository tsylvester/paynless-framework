import { renderHook } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import type {
    ApiError,
    DialecticSession,
    User,
    GetAllStageProgressResponse,
    DialecticStageRecipe,
} from '@paynless/types';
import { api } from '@paynless/api';
import { logger } from '@paynless/utils';

import { useStageRunProgressHydration } from './useStageRunProgressHydration';
import {
    mockDialecticStage,
    mockDialecticProcessTemplate,
    mockDialecticProject,
    mockDialecticStageRecipe,
    mockSession,
    mockStageRunProgressSnapshot,
    initializeMockDialecticState,
    setDialecticStateValues,
    getDialecticStoreState,
    getDialecticStoreActionMock,
} from '../mocks/dialecticStore.mock';
import {
    resetAuthStoreMock,
    mockSetAuthUser,
} from '../mocks/authStore.mock';

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

    const stageThesis = mockDialecticStage({
        id: 'stage-thesis-id',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
    });

    const templateOneStage = mockDialecticProcessTemplate({
        id: 'pt-1',
        name: 'Template',
        description: '',
        starting_stage_id: stageThesis.id,
        stages: [stageThesis],
        transitions: [],
    });

    const stageSynthesis = mockDialecticStage({
        id: 'stage-synthesis-id',
        slug: 'synthesis',
        display_name: 'Synthesis',
        description: 'Synthesis stage',
        default_system_prompt_id: 'sp-2',
    });

    const templateTwoStages = mockDialecticProcessTemplate({
        id: 'pt-2',
        name: 'Template Two',
        starting_stage_id: stageThesis.id,
        stages: [stageThesis, stageSynthesis],
        transitions: [],
    });

    const runKey = `${sessionId}:${iterationNumber}`;

    const recipeThesis = mockDialecticStageRecipe({
        stageSlug: 'thesis',
        instanceId: 'inst-thesis',
        steps: [],
        edges: [],
    });

    const recipesForTemplateOneStage: Record<string, DialecticStageRecipe> = {
        thesis: recipeThesis,
    };

    const recipeSynthesis = mockDialecticStageRecipe({
        stageSlug: 'synthesis',
        instanceId: 'inst-synthesis',
        steps: [],
        edges: [],
    });

    const recipesForTemplateTwoStages: Record<string, DialecticStageRecipe> = {
        thesis: recipeThesis,
        synthesis: recipeSynthesis,
    };

    const synthesisProgressKey = `${sessionId}:synthesis:${iterationNumber}`;

    const emptyProgressSnapshot = mockStageRunProgressSnapshot({
        documents: {},
        stepStatuses: {},
        jobProgress: {},
        jobs: [],
        progress: { totalSteps: 0, completedSteps: 0, failedSteps: 0 },
    });

    const thesisProgressKey = `${sessionId}:thesis:${iterationNumber}`;

    const createSession = (): DialecticSession =>
        mockSession({
            id: sessionId,
            project_id: projectId,
            session_description: 'Mock session',
            iteration_count: iterationNumber,
            selected_models: [],
            current_stage_id: stageThesis.id,
            viewing_stage_id: 'thesis',
        });

    const createProjectForSession = (
        session: DialecticSession,
        template: typeof templateOneStage,
    ) =>
        mockDialecticProject({
            id: projectId,
            user_id: userId,
            project_name: 'Test',
            selected_domain_id: '',
            dialectic_domains: { name: 'Domain' },
            dialectic_sessions: [session],
            process_template_id: template.id,
            dialectic_process_templates: template,
        });

    const seedHydrationContext = (
        session: DialecticSession,
        overrides: Parameters<typeof setDialecticStateValues>[0] = {},
    ): void => {
        setDialecticStateValues({
            currentProjectDetail: createProjectForSession(session, templateOneStage),
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            currentProcessTemplate: templateOneStage,
            recipesByStageSlug: recipesForTemplateOneStage,
            ...overrides,
        });
    };

    const seedHydrationCompleteContext = (session: DialecticSession): void => {
        seedHydrationContext(session, {
            progressHydrationStatus: { [runKey]: 'success' },
            stageRunProgress: { [thesisProgressKey]: emptyProgressSnapshot },
        });
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
                expectedCount: 1,
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
        seedHydrationContext(session);

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
        seedHydrationContext(session);

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
        seedHydrationContext(session, { viewingStageSlug: stageSlug });

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

    it('does not call hydrateAllStageProgress again when viewingStageSlug changes (tab change)', async () => {
        const session: DialecticSession = createSession();
        seedHydrationContext(session, { viewingStageSlug: 'thesis' });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        const { rerender } = renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalledTimes(1);
        });

        setDialecticStateValues({ viewingStageSlug: 'antithesis' });
        rerender();

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalledTimes(1);
        });
    });

    it('does not re-trigger hydration when progressHydrationStatus[runKey] is success', async () => {
        const session: DialecticSession = createSession();
        seedHydrationCompleteContext(session);

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
        const project = mockDialecticProject({
            id: projectId,
            user_id: userId,
            project_name: 'Test',
            selected_domain_id: '',
            dialectic_domains: { name: 'Domain' },
            dialectic_sessions: [session],
            process_template_id: templateTwoStages.id,
            dialectic_process_templates: templateTwoStages,
        });
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
            currentProjectDetail: mockDialecticProject({
                id: projectId,
                user_id: userId,
                project_name: 'Test',
                selected_domain_id: '',
                dialectic_domains: { name: 'Domain' },
                dialectic_sessions: [sessionA, sessionB],
                process_template_id: templateOneStage.id,
                dialectic_process_templates: templateOneStage,
            }),
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
        const recipeThesisOnly = mockDialecticStageRecipe({
            stageSlug: 'thesis',
            instanceId: 'inst-thesis',
            steps: [],
            edges: [],
        });
        setDialecticStateValues({
            currentProjectDetail: createProjectForSession(session, templateTwoStages),
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
            currentProcessTemplate: templateTwoStages,
            recipesByStageSlug: { thesis: recipeThesisOnly },
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).not.toHaveBeenCalled();
        });

        expect(logger.error).toHaveBeenCalledWith(
            '[useStageRunProgressHydration] Recipe fetch did not populate all stages; missing:',
            { missingSlugs: ['synthesis'] },
        );
    });

    it('calls fetchStageRecipe for all sorted stages before calling ensureRecipeForViewingStage', async () => {
        const session: DialecticSession = createSession();
        seedHydrationContext(session);

        const fetchStageRecipeMock = getDialecticStoreActionMock('fetchStageRecipe');
        const ensureRecipeForViewingStageMock = getDialecticStoreActionMock('ensureRecipeForViewingStage');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(fetchStageRecipeMock).toHaveBeenCalledWith('thesis');
            expect(ensureRecipeForViewingStageMock).toHaveBeenCalled();
        });

        const fetchOrder: number[] = vi.mocked(fetchStageRecipeMock).mock.invocationCallOrder;
        const ensureOrder: number[] = vi.mocked(ensureRecipeForViewingStageMock).mock.invocationCallOrder;
        const maxFetchOrder: number = Math.max(...fetchOrder);
        const minEnsureOrder: number = Math.min(...ensureOrder);
        expect(maxFetchOrder).toBeLessThan(minEnsureOrder);
    });

    it('calls ensureRecipeForViewingStage for all stages with loaded recipes before calling hydrateAllStageProgress', async () => {
        const session: DialecticSession = createSession();
        seedHydrationContext(session);

        const ensureRecipeForViewingStageMock = getDialecticStoreActionMock('ensureRecipeForViewingStage');
        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalledTimes(1);
        });

        const ensureOrder: number[] = vi.mocked(ensureRecipeForViewingStageMock).mock.invocationCallOrder;
        const hydrateOrder: number[] = vi.mocked(hydrateAllStageProgressMock).mock.invocationCallOrder;
        const maxEnsureOrder: number = Math.max(...ensureOrder);
        const minHydrateOrder: number = Math.min(...hydrateOrder);
        expect(maxEnsureOrder).toBeLessThan(minHydrateOrder);
    });

    it('reads progressHydrationStatus from store and does not use a ref', async () => {
        const session: DialecticSession = createSession();
        seedHydrationCompleteContext(session);

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).not.toHaveBeenCalled();
        });
    });

    it('does not re-trigger hydration when progressHydrationStatus[runKey] is failed', async () => {
        const session: DialecticSession = createSession();
        seedHydrationContext(session, { progressHydrationStatus: { [runKey]: 'failed' } });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).not.toHaveBeenCalled();
        });
    });

    it('re-triggers hydration when progressHydrationStatus[runKey] is idle', async () => {
        const session: DialecticSession = createSession();
        seedHydrationContext(session);

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalled();
        });
    });

    it('when fetchStageRecipe throws, hook logs the error and does not proceed to ensureRecipeForViewingStage', async () => {
        const session: DialecticSession = createSession();
        seedHydrationContext(session, { recipesByStageSlug: {} });

        const fetchStageRecipeMock = getDialecticStoreActionMock('fetchStageRecipe');
        const ensureRecipeForViewingStageMock = getDialecticStoreActionMock('ensureRecipeForViewingStage');
        const fetchError: Error = new Error('fetch failed');
        vi.mocked(fetchStageRecipeMock).mockRejectedValueOnce(fetchError);

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(ensureRecipeForViewingStageMock).not.toHaveBeenCalled();
        });

        expect(logger.error).toHaveBeenCalledWith(
            '[useStageRunProgressHydration] Hydrate-all failed',
            { errorDetails: fetchError },
        );
    });

    it('when ensureRecipeForViewingStage throws, hook logs the error and does not proceed to hydrateAllStageProgress', async () => {
        const session: DialecticSession = createSession();
        seedHydrationContext(session, { viewingStageSlug: null });

        const ensureRecipeForViewingStageMock = getDialecticStoreActionMock('ensureRecipeForViewingStage');
        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');
        const ensureError: Error = new Error('ensure failed');
        vi.mocked(ensureRecipeForViewingStageMock).mockRejectedValueOnce(ensureError);

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).not.toHaveBeenCalled();
        });

        expect(logger.error).toHaveBeenCalledWith(
            '[useStageRunProgressHydration] Hydrate-all failed',
            { errorDetails: ensureError },
        );
    });

    it('per-stage effect respects ordering and does not call hydrateStageProgress when progressHydrationStatus for stage is success', async () => {
        const session: DialecticSession = createSession();
        const stageSlug = 'thesis';
        const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
        seedHydrationContext(session, {
            viewingStageSlug: stageSlug,
            progressHydrationStatus: { [progressKey]: 'success' },
        });

        const hydrateStageProgressMock = getDialecticStoreActionMock('hydrateStageProgress');

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateStageProgressMock).not.toHaveBeenCalled();
        });
    });

    it('when hydrateAllStageProgress rejects with apiError, sets progressHydrationStatus[runKey] to failed, logs unchanged apiError, and does not produce unhandled rejection', async () => {
        const apiError: ApiError = { code: 'SERVER_ERROR', message: 'Hydrate-all API failure' };
        const session: DialecticSession = createSession();
        seedHydrationContext(session, { viewingStageSlug: null });

        let unhandledRejectionCount = 0;
        const rejectionHandler = (event: PromiseRejectionEvent): void => {
            unhandledRejectionCount += 1;
            event.preventDefault();
        };
        window.addEventListener('unhandledrejection', rejectionHandler);

        const dialecticClient = api.dialectic();
        vi.mocked(dialecticClient.getAllStageProgress).mockResolvedValue({
            data: undefined,
            error: apiError,
            status: 500,
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        const { unmount } = renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalledTimes(1);
            expect(getDialecticStoreState().progressHydrationStatus[runKey]).toBe('failed');
            expect(logger.error).toHaveBeenCalledWith(
                '[useStageRunProgressHydration] Hydrate-all failed',
                { errorDetails: apiError },
            );
        });

        const firstHydrateValue: unknown =
            vi.mocked(hydrateAllStageProgressMock).mock.results[0].value;
        let rejectedError: unknown = null;
        if (firstHydrateValue instanceof Promise) {
            try {
                await firstHydrateValue;
            } catch (err: unknown) {
                rejectedError = err;
            }
        } else {
            rejectedError = firstHydrateValue;
        }
        expect(rejectedError).toBe(apiError);

        expect(unhandledRejectionCount).toBe(0);
        unmount();
        window.removeEventListener('unhandledrejection', rejectionHandler);
    });

    it('when hydrateStageProgress rejects with apiError, sets progressHydrationStatus[progressKey] to failed, logs unchanged apiError, and does not produce unhandled rejection', async () => {
        const apiError: ApiError = { code: 'SERVER_ERROR', message: 'Per-stage hydrate API failure' };
        const session: DialecticSession = createSession();
        const stageSlug = 'thesis';
        const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
        seedHydrationCompleteContext(session);
        setDialecticStateValues({ viewingStageSlug: stageSlug });

        let unhandledRejectionCount = 0;
        const rejectionHandler = (event: PromiseRejectionEvent): void => {
            unhandledRejectionCount += 1;
            event.preventDefault();
        };
        window.addEventListener('unhandledrejection', rejectionHandler);

        const dialecticClient = api.dialectic();
        vi.mocked(dialecticClient.listStageDocuments).mockResolvedValue({
            data: undefined,
            error: apiError,
            status: 500,
        });

        const hydrateStageProgressMock = getDialecticStoreActionMock('hydrateStageProgress');

        const { unmount } = renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateStageProgressMock).toHaveBeenCalledTimes(1);
            expect(getDialecticStoreState().progressHydrationStatus[progressKey]).toBe('failed');
            expect(logger.error).toHaveBeenCalledWith(
                '[useStageRunProgressHydration] Per-stage hydrate failed',
                { errorDetails: apiError },
            );
        });

        const firstHydrateValue: unknown =
            vi.mocked(hydrateStageProgressMock).mock.results[0].value;
        let rejectedError: unknown = null;
        if (firstHydrateValue instanceof Promise) {
            try {
                await firstHydrateValue;
            } catch (err: unknown) {
                rejectedError = err;
            }
        } else {
            rejectedError = firstHydrateValue;
        }
        expect(rejectedError).toBe(apiError);

        expect(unhandledRejectionCount).toBe(0);
        unmount();
        window.removeEventListener('unhandledrejection', rejectionHandler);
    });
});
