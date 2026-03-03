import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDialecticStore, initialDialecticStateValues } from './dialecticStore';
import type {
  DialecticProject,
  GetAllStageProgressPayload,
  RegenerateDocumentPayload,
  User,
} from '@paynless/types';
import { resetApiMock, getMockDialecticClient } from '@paynless/api/mocks';
import { useAuthStore } from './authStore';

vi.mock('@paynless/api', async () => {
  const { api, resetApiMock, getMockDialecticClient } = await import('@paynless/api/mocks');
  return {
    api,
    initializeApiClient: vi.fn(),
    resetApiMock,
    getMockDialecticClient,
  };
});

describe('dialecticStore regenerateDocument', () => {
  const sessionId = 'session-regen-1';
  const projectId = 'project-regen-1';
  const stageSlug = 'thesis';
  const iterationNumber = 1;
  const userId = 'user-regen-1';

  const regeneratePayload: RegenerateDocumentPayload = {
    sessionId,
    stageSlug,
    iterationNumber,
    documents: [
      { documentKey: 'business_case', modelId: 'model-1' },
      { documentKey: 'feature_spec', modelId: 'model-2' },
    ],
  };

  const minimalProject: DialecticProject = {
    id: projectId,
    user_id: userId,
    project_name: 'Regen Test Project',
    selected_domain_id: 'domain-1',
    dialectic_domains: { name: 'Tech' },
    selected_domain_overlay_id: null,
    repo_url: null,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dialectic_sessions: [],
    process_template_id: null,
    dialectic_process_templates: null,
    isLoadingProcessTemplate: false,
    processTemplateError: null,
    contributionGenerationStatus: 'idle',
    generateContributionsError: null,
    isSubmittingStageResponses: false,
    submitStageResponsesError: null,
    isSavingContributionEdit: false,
    saveContributionEditError: null,
  };

  beforeEach(() => {
    resetApiMock();
    useDialecticStore.getState()._resetForTesting?.();
    vi.clearAllMocks();
    const mockUser: User = { id: userId };
    useAuthStore.setState({ user: mockUser });
    useDialecticStore.setState({ currentProjectDetail: minimalProject });
    getMockDialecticClient().getAllStageProgress.mockResolvedValue({
      data: {
        dagProgress: { completedStages: 0, totalStages: 3 },
        stages: [
          { stageSlug: 'thesis', status: 'in_progress', modelCount: 2, steps: [], progress: { completedSteps: 0, totalSteps: 2, failedSteps: 0 }, documents: [] },
          { stageSlug: 'antithesis', status: 'not_started', modelCount: 1, steps: [], progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 }, documents: [] },
          { stageSlug: 'synthesis', status: 'not_started', modelCount: 1, steps: [], progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 }, documents: [] },
        ],
      },
      status: 200,
    });
  });

  it('calls api.dialectic().regenerateDocument(payload) with correct sessionId, stageSlug, iterationNumber, documents', async () => {
    getMockDialecticClient().regenerateDocument.mockResolvedValue({
      data: { jobIds: ['new-job-1', 'new-job-2'] },
      status: 200,
    });

    await useDialecticStore.getState().regenerateDocument(regeneratePayload);

    expect(getMockDialecticClient().regenerateDocument).toHaveBeenCalledTimes(1);
    expect(getMockDialecticClient().regenerateDocument).toHaveBeenCalledWith(regeneratePayload);
    const callPayload: RegenerateDocumentPayload = getMockDialecticClient().regenerateDocument.mock.calls[0][0];
    expect(callPayload.sessionId).toBe(sessionId);
    expect(callPayload.stageSlug).toBe(stageSlug);
    expect(callPayload.iterationNumber).toBe(iterationNumber);
    expect(callPayload.documents).toEqual(regeneratePayload.documents);
  });

  it('on successful API response, adds returned job IDs to generatingSessions[sessionId]', async () => {
    const jobIds: string[] = ['new-job-1', 'new-job-2'];
    getMockDialecticClient().regenerateDocument.mockResolvedValue({
      data: { jobIds },
      status: 200,
    });

    await useDialecticStore.getState().regenerateDocument(regeneratePayload);

    const state = useDialecticStore.getState();
    expect(state.generatingSessions[sessionId]).toEqual(jobIds);
  });

  it('on successful API response, sets contributionGenerationStatus to generating and generatingForStageSlug to payload.stageSlug', async () => {
    getMockDialecticClient().regenerateDocument.mockResolvedValue({
      data: { jobIds: ['new-job-1'] },
      status: 200,
    });

    const promise = useDialecticStore.getState().regenerateDocument(regeneratePayload);
    expect(useDialecticStore.getState().contributionGenerationStatus).toBe('generating');
    expect(useDialecticStore.getState().generatingForStageSlug).toBe(stageSlug);

    await promise;
    expect(useDialecticStore.getState().contributionGenerationStatus).toBe('generating');
    expect(useDialecticStore.getState().generatingForStageSlug).toBe(stageSlug);
  });

  it('on successful API response, calls hydrateAllStageProgress to refresh progress data', async () => {
    getMockDialecticClient().regenerateDocument.mockResolvedValue({
      data: { jobIds: ['new-job-1'] },
      status: 200,
    });

    await useDialecticStore.getState().regenerateDocument(regeneratePayload);

    expect(getMockDialecticClient().getAllStageProgress).toHaveBeenCalled();
    const hydrateCall: GetAllStageProgressPayload = getMockDialecticClient().getAllStageProgress.mock.calls[0][0];
    expect(hydrateCall.sessionId).toBe(sessionId);
    expect(hydrateCall.iterationNumber).toBe(iterationNumber);
    expect(hydrateCall.projectId).toBe(projectId);
    expect(hydrateCall.userId).toBe(userId);
  });

  it('on API failure, does not add job IDs to generatingSessions and resets contributionGenerationStatus', async () => {
    getMockDialecticClient().regenerateDocument.mockResolvedValue({
      error: { message: 'Regenerate failed', code: 'REGENERATE_FAILED' },
      status: 500,
    });

    await useDialecticStore.getState().regenerateDocument(regeneratePayload);

    const state = useDialecticStore.getState();
    expect(state.generatingSessions[sessionId]).toBeUndefined();
    expect(state.contributionGenerationStatus).toBe(initialDialecticStateValues.contributionGenerationStatus);
    expect(state.generatingForStageSlug).toBeNull();
  });

  it('on API failure, returns the error response', async () => {
    const apiError = { message: 'Stage mismatch', code: 'VALIDATION_ERROR' };
    getMockDialecticClient().regenerateDocument.mockResolvedValue({
      error: apiError,
      status: 400,
    });

    const result = await useDialecticStore.getState().regenerateDocument(regeneratePayload);

    expect(result.error).toEqual(apiError);
    expect(result.status).toBe(400);
  });
});
