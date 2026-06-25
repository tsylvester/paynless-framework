import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDialecticStore } from './dialecticStore';
import type {
    ApiError,
    ApiResponse,
    DialecticStateValues,
    GetAllStageProgressPayload,
} from '@paynless/types';
import {
    mockGetAllStageProgressResponse,
    mockStageProgressEntry,
} from '../../../apps/web/src/mocks/dialecticStore.mock';
import { isApiError } from '@paynless/utils';

vi.mock('@paynless/api', async () => {
    const { api, resetApiMock, getMockDialecticClient } = await import('@paynless/api/mocks');
    return {
        api,
        initializeApiClient: vi.fn(),
        resetApiMock,
        getMockDialecticClient,
    };
});

import { resetApiMock, getMockDialecticClient } from '@paynless/api/mocks';

describe('hydrateAllStageProgress thunk', () => {
    const payload: GetAllStageProgressPayload = {
        sessionId: 'session-1',
        iterationNumber: 1,
        userId: 'user-1',
        projectId: 'project-1',
    };
    const runKey = `${payload.sessionId}:${payload.iterationNumber}`;

    const validGetAllStageProgressData = mockGetAllStageProgressResponse({
        dagProgress: { completedStages: 0, totalStages: 0 },
        stages: [
            mockStageProgressEntry({
                stageSlug: 'thesis',
                status: 'not_started',
                modelCount: null,
                progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
            }),
        ],
    });

    beforeEach(() => {
        resetApiMock();
        useDialecticStore.getState()._resetForTesting?.();
        vi.clearAllMocks();
    });

    it('hydrateAllStageProgress action exists', () => {
        const state = useDialecticStore.getState();
        expect(typeof state.hydrateAllStageProgress).toBe('function');
    });

    it('hydrateAllStageProgress calls getAllStageProgress with payload', async () => {
        getMockDialecticClient().getAllStageProgress.mockResolvedValue({
            data: validGetAllStageProgressData,
            status: 200,
        });

        const { hydrateAllStageProgress } = useDialecticStore.getState();
        await hydrateAllStageProgress(payload);

        expect(getMockDialecticClient().getAllStageProgress).toHaveBeenCalledTimes(1);
        expect(getMockDialecticClient().getAllStageProgress).toHaveBeenCalledWith(payload);
    });

    it('hydrateAllStageProgress sets progressHydrationStatus[runKey] to pending before calling logic', async () => {
        let resolveApi: (value: ApiResponse<typeof validGetAllStageProgressData>) => void;
        const apiPromise = new Promise<ApiResponse<typeof validGetAllStageProgressData>>((resolve) => {
            resolveApi = resolve;
        });
        getMockDialecticClient().getAllStageProgress.mockImplementation(() => apiPromise);

        const { hydrateAllStageProgress } = useDialecticStore.getState();
        const promise = hydrateAllStageProgress(payload);

        await Promise.resolve();
        const stateBefore = useDialecticStore.getState();
        expect(stateBefore.progressHydrationStatus[runKey]).toBe('pending');

        resolveApi!({ data: validGetAllStageProgressData, status: 200 });
        await promise;
    }, 3000);

    it('hydrateAllStageProgress sets progressHydrationStatus[runKey] to success when logic completes without throwing', async () => {
        getMockDialecticClient().getAllStageProgress.mockResolvedValue({
            data: validGetAllStageProgressData,
            status: 200,
        });

        const { hydrateAllStageProgress } = useDialecticStore.getState();
        await hydrateAllStageProgress(payload);

        const state = useDialecticStore.getState();
        expect(state.progressHydrationStatus[runKey]).toBe('success');
    });

    it('sets progressHydrationStatus[runKey] to failed, rethrows apiError, and does not store progressHydrationError when API returns error', async () => {
        const apiError: ApiError = { code: 'SERVER_ERROR', message: 'Backend error' };
        getMockDialecticClient().getAllStageProgress.mockResolvedValue({
            error: apiError,
            status: 500,
        });

        const { hydrateAllStageProgress } = useDialecticStore.getState();
        await expect(hydrateAllStageProgress(payload)).rejects.toBe(apiError);

        const state: DialecticStateValues = useDialecticStore.getState();
        expect(state.progressHydrationStatus[runKey]).toBe('failed');
        expect('progressHydrationError' in state).toBe(false);
    });

    it('rejects with the same ApiError reference when documents logic pass-through receives response.error', async () => {
        const apiError: ApiError = { code: 'INTERNAL_ERROR', message: 'Server error' };
        getMockDialecticClient().getAllStageProgress.mockResolvedValue({
            data: undefined,
            error: apiError,
            status: 500,
        });

        const { hydrateAllStageProgress } = useDialecticStore.getState();
        await expect(hydrateAllStageProgress(payload)).rejects.toBe(apiError);

        const state: DialecticStateValues = useDialecticStore.getState();
        expect(state.progressHydrationStatus[runKey]).toBe('failed');
        expect('progressHydrationError' in state).toBe(false);
    });

    it('sets progressHydrationStatus[runKey] to failed and rethrows origin ApiError when stages array is empty', async () => {
        getMockDialecticClient().getAllStageProgress.mockResolvedValue({
            data: { dagProgress: { completedStages: 0, totalStages: 0 }, stages: [] },
            status: 200,
        });

        const { hydrateAllStageProgress } = useDialecticStore.getState();
        let originError: ApiError | null = null;
        await expect(hydrateAllStageProgress(payload)).rejects.toSatisfy((err) => {
            if (!isApiError(err)) {
                return false;
            }
            originError = err;
            return err.code === 'HYDRATE_ALL_STAGE_PROGRESS_STAGES_EMPTY';
        });

        expect(originError).not.toBeNull();

        const state: DialecticStateValues = useDialecticStore.getState();
        expect(state.progressHydrationStatus[runKey]).toBe('failed');
        expect('progressHydrationError' in state).toBe(false);
    });
});

describe('resetProgressHydrationStatus', () => {
    beforeEach(() => {
        resetApiMock();
        useDialecticStore.getState()._resetForTesting?.();
        vi.clearAllMocks();
    });

    it('clears progressHydrationStatus[runKey] only', () => {
        const runKey = 'session-1:1';
        useDialecticStore.setState({
            progressHydrationStatus: { [runKey]: 'failed' },
        });

        const { resetProgressHydrationStatus } = useDialecticStore.getState();
        resetProgressHydrationStatus(runKey);

        const state: DialecticStateValues = useDialecticStore.getState();
        expect(state.progressHydrationStatus[runKey]).toBeUndefined();
        expect('progressHydrationError' in state).toBe(false);
    });
});
