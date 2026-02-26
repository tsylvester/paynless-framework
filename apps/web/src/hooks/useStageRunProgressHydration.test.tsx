import { renderHook } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import type { DialecticSession, User } from '@paynless/types';

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

    beforeEach(() => {
        initializeMockDialecticState();
        resetAuthStoreMock();
        mockSetAuthUser(mockUser);
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('calls hydrateAllStageProgress once when activeSessionDetail and user are first available', async () => {
        const session: DialecticSession = createSession();
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
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

    it('guard ref prevents duplicate calls when effect re-runs with same session', async () => {
        const session: DialecticSession = createSession();
        setDialecticStateValues({
            activeContextSessionId: sessionId,
            activeSessionDetail: session,
        });

        const hydrateAllStageProgressMock = getDialecticStoreActionMock('hydrateAllStageProgress');

        const { rerender } = renderHook(() => useStageRunProgressHydration());

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalledTimes(1);
        });

        setDialecticStateValues({
            activeSessionDetail: { ...createSession() },
        });
        rerender();

        await waitFor(() => {
            expect(hydrateAllStageProgressMock).toHaveBeenCalledTimes(1);
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
});
