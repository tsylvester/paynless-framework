import { renderHook } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import type { DialecticSession, User, DialecticStageRecipe } from '@paynless/types';

import { useStageRunProgressHydration } from './useStageRunProgressHydration';
import {
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
    const stageSlug = 'synthesis';
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

    beforeEach(() => {
        initializeMockDialecticState();
        resetAuthStoreMock();
        mockSetAuthUser(mockUser);
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('fetches the stage recipe before ensuring stage-run progress', async () => {
        const callOrder: string[] = [];
        const session: DialecticSession = {
            id: sessionId,
            project_id: projectId,
            session_description: 'Mock session',
            user_input_reference_url: null,
            iteration_count: iterationNumber,
            selected_model_ids: [],
            status: 'active',
            associated_chat_id: null,
            current_stage_id: 'stage-id',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            dialectic_contributions: [],
            dialectic_session_models: [],
            feedback: [],
        };

        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeStageSlug: stageSlug,
            activeSessionDetail: session,
            recipesByStageSlug: {},
        });

        const fetchStageRecipeMock = getDialecticStoreActionMock('fetchStageRecipe');
        const ensureRecipeForActiveStageMock = getDialecticStoreActionMock('ensureRecipeForActiveStage');

        fetchStageRecipeMock.mockImplementation(async () => {
            callOrder.push('fetch');
        });
        ensureRecipeForActiveStageMock.mockImplementation(async () => {
            callOrder.push('ensure');
        });

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(ensureRecipeForActiveStageMock).toHaveBeenCalledTimes(1);
        });

        expect(fetchStageRecipeMock).toHaveBeenCalledWith(stageSlug);
        expect(ensureRecipeForActiveStageMock).toHaveBeenCalledWith(sessionId, stageSlug, iterationNumber);
        expect(callOrder).toEqual(['fetch', 'ensure']);
    });

    it('calls hydrateStageProgress after ensureRecipeForActiveStage to load existing documents', async () => {
        const callOrder: string[] = [];
        const session: DialecticSession = {
            id: sessionId,
            project_id: projectId,
            session_description: 'Mock session',
            user_input_reference_url: null,
            iteration_count: iterationNumber,
            selected_model_ids: [],
            status: 'active',
            associated_chat_id: null,
            current_stage_id: 'stage-id',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            dialectic_contributions: [],
            dialectic_session_models: [],
            feedback: [],
        };

        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeStageSlug: stageSlug,
            activeSessionDetail: session,
            recipesByStageSlug: {},
        });

        const fetchStageRecipeMock = getDialecticStoreActionMock('fetchStageRecipe');
        const ensureRecipeForActiveStageMock = getDialecticStoreActionMock('ensureRecipeForActiveStage');
        const hydrateStageProgressMock = getDialecticStoreActionMock('hydrateStageProgress');

        fetchStageRecipeMock.mockImplementation(async () => {
            callOrder.push('fetch');
        });
        ensureRecipeForActiveStageMock.mockImplementation(async () => {
            callOrder.push('ensure');
        });
        hydrateStageProgressMock.mockImplementation(async () => {
            callOrder.push('hydrate');
        });

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateStageProgressMock).toHaveBeenCalledTimes(1);
        });

        expect(hydrateStageProgressMock).toHaveBeenCalledWith({
            sessionId,
            stageSlug,
            iterationNumber,
            userId,
            projectId,
        });
        expect(callOrder).toEqual(['fetch', 'ensure', 'hydrate']);
    });

    it('calls hydrateStageProgress in ensureProgress path when recipe already exists', async () => {
        const callOrder: string[] = [];
        const session: DialecticSession = {
            id: sessionId,
            project_id: projectId,
            session_description: 'Mock session',
            user_input_reference_url: null,
            iteration_count: iterationNumber,
            selected_model_ids: [],
            status: 'active',
            associated_chat_id: null,
            current_stage_id: 'stage-id',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            dialectic_contributions: [],
            dialectic_session_models: [],
            feedback: [],
        };

        const existingRecipe: DialecticStageRecipe = {
            stageSlug: stageSlug,
            instanceId: 'instance-1',
            steps: [],
        };

        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeStageSlug: stageSlug,
            activeSessionDetail: session,
            recipesByStageSlug: {
                [stageSlug]: existingRecipe,
            },
        });

        const fetchStageRecipeMock = getDialecticStoreActionMock('fetchStageRecipe');
        const ensureRecipeForActiveStageMock = getDialecticStoreActionMock('ensureRecipeForActiveStage');
        const hydrateStageProgressMock = getDialecticStoreActionMock('hydrateStageProgress');

        fetchStageRecipeMock.mockImplementation(async () => {
            callOrder.push('fetch');
        });
        ensureRecipeForActiveStageMock.mockImplementation(async () => {
            callOrder.push('ensure');
        });
        hydrateStageProgressMock.mockImplementation(async () => {
            callOrder.push('hydrate');
        });

        renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateStageProgressMock).toHaveBeenCalledTimes(1);
        });

        // In ensureProgress path, fetchStageRecipe should NOT be called (recipe already exists)
        expect(fetchStageRecipeMock).not.toHaveBeenCalled();
        expect(ensureRecipeForActiveStageMock).toHaveBeenCalledWith(sessionId, stageSlug, iterationNumber);
        expect(hydrateStageProgressMock).toHaveBeenCalledWith({
            sessionId,
            stageSlug,
            iterationNumber,
            userId,
            projectId,
        });
        expect(callOrder).toEqual(['ensure', 'hydrate']);
    });
});

