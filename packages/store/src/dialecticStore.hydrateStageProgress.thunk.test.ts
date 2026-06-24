import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDialecticStore } from './dialecticStore';
import type {
    ApiError,
    ApiResponse,
    DialecticStateValues,
    ListStageDocumentsPayload,
    ListStageDocumentsResponse,
} from '@paynless/types';
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

describe('hydrateStageProgress thunk', () => {
    const payload: ListStageDocumentsPayload = {
        sessionId: 'session-1',
        stageSlug: 'thesis',
        iterationNumber: 1,
        userId: 'user-1',
        projectId: 'project-1',
    };
    const progressKey = `${payload.sessionId}:${payload.stageSlug}:${payload.iterationNumber}`;

    beforeEach(() => {
        resetApiMock();
        useDialecticStore.getState()._resetForTesting?.();
        vi.clearAllMocks();
    });

    it('hydrateStageProgress action exists', () => {
        const state = useDialecticStore.getState();
        expect(typeof state.hydrateStageProgress).toBe('function');
    });

    it('hydrateStageProgress sets progressHydrationStatus[progressKey] to pending before calling logic', async () => {
        let resolveApi: (value: ApiResponse<ListStageDocumentsResponse>) => void;
        const apiPromise = new Promise<ApiResponse<ListStageDocumentsResponse>>((resolve) => {
            resolveApi = resolve;
        });
        getMockDialecticClient().listStageDocuments.mockImplementation(() => apiPromise);

        const { hydrateStageProgress } = useDialecticStore.getState();
        const promise = hydrateStageProgress(payload);

        await Promise.resolve();
        const stateBefore = useDialecticStore.getState();
        expect(stateBefore.progressHydrationStatus[progressKey]).toBe('pending');

        resolveApi!({ data: [], status: 200 });
        await promise;
    }, 3000);

    it('hydrateStageProgress sets progressHydrationStatus[progressKey] to success when logic completes without throwing', async () => {
        getMockDialecticClient().listStageDocuments.mockResolvedValue({
            data: [],
            status: 200,
        });

        const { hydrateStageProgress } = useDialecticStore.getState();
        await hydrateStageProgress(payload);

        const state = useDialecticStore.getState();
        expect(state.progressHydrationStatus[progressKey]).toBe('success');
    });

    it('sets progressHydrationStatus[progressKey] to failed, rethrows apiError, and does not store progressHydrationError when logic throws API error', async () => {
        const apiError: ApiError = { code: 'SERVER_ERROR', message: 'Backend error' };
        getMockDialecticClient().listStageDocuments.mockResolvedValue({
            error: apiError,
            status: 500,
        });

        const { hydrateStageProgress } = useDialecticStore.getState();
        await expect(hydrateStageProgress(payload)).rejects.toBe(apiError);

        const state: DialecticStateValues = useDialecticStore.getState();
        expect(state.progressHydrationStatus[progressKey]).toBe('failed');
        expect('progressHydrationError' in state).toBe(false);
    });

    it('sets progressHydrationStatus[progressKey] to failed and rethrows origin ApiError when document validation fails', async () => {
        const invalidResponse: ListStageDocumentsResponse = [
            {
                documentKey: '',
                modelId: 'model-a',
                status: 'completed',
                jobId: 'job-a',
                latestRenderedResourceId: 'res-a',
            },
        ];
        getMockDialecticClient().listStageDocuments.mockResolvedValue({
            data: invalidResponse,
            status: 200,
        });

        const { hydrateStageProgress } = useDialecticStore.getState();
        let originError: ApiError | null = null;
        await expect(hydrateStageProgress(payload)).rejects.toSatisfy((err) => {
            if (!isApiError(err)) {
                return false;
            }
            originError = err;
            return err.code === 'HYDRATE_STAGE_PROGRESS_DOCUMENT_INVALID';
        });

        expect(originError).not.toBeNull();

        const state: DialecticStateValues = useDialecticStore.getState();
        expect(state.progressHydrationStatus[progressKey]).toBe('failed');
        expect('progressHydrationError' in state).toBe(false);
    });
});
