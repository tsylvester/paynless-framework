import { renderHook } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import type { DialecticSession } from '@paynless/types';

import { useStageRunProgressHydration } from './useStageRunProgressHydration';
import {
    initializeMockDialecticState,
    setDialecticStateValues,
    getDialecticStoreActionMock,
} from '../mocks/dialecticStore.mock';

vi.mock('@paynless/store', () => import('../mocks/dialecticStore.mock'));

describe('useStageRunProgressHydration', () => {
    const stageSlug = 'synthesis';
    const sessionId = 'session-123';
    const iterationNumber = 4;

    beforeEach(() => {
        initializeMockDialecticState();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('fetches the stage recipe before ensuring stage-run progress', async () => {
        const callOrder: string[] = [];
        const session: DialecticSession = {
            id: sessionId,
            project_id: 'project-1',
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
});

