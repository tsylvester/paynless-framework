import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDialecticStore, initialDialecticStateValues } from './dialecticStore';
import type {
  ContributionGenerationPausedNsfPayload,
  DialecticLifecycleEvent,
  DialecticProject,
  GetAllStageProgressPayload,
  PauseActiveJobsPayload,
  ResumePausedNsfJobsPayload,
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

describe('dialecticStore pause and resume', () => {
  const sessionId = 'session-nsf-1';
  const projectId = 'project-nsf-1';
  const stageSlug = 'antithesis';
  const iterationNumber = 1;
  const userId = 'user-nsf-1';

  const pausedNsfPayload: ContributionGenerationPausedNsfPayload = {
    type: 'contribution_generation_paused_nsf',
    sessionId,
    projectId,
    stageSlug,
    iterationNumber,
  };

  beforeEach(() => {
    resetApiMock();
    useDialecticStore.getState()._resetForTesting?.();
    vi.clearAllMocks();
    const mockUser: User = { id: userId };
    useAuthStore.setState({ user: mockUser });
    const progressComplete: { completedSteps: number; totalSteps: number; failedSteps: number } = {
      completedSteps: 1,
      totalSteps: 1,
      failedSteps: 0,
    };
    const progressNone: { completedSteps: number; totalSteps: number; failedSteps: number } = {
      completedSteps: 0,
      totalSteps: 1,
      failedSteps: 0,
    };
    getMockDialecticClient().getAllStageProgress.mockResolvedValue({
      data: {
        dagProgress: { completedStages: 0, totalStages: 3 },
        stages: [
          { stageSlug: 'thesis', status: 'completed', modelCount: 1, steps: [], progress: progressComplete, documents: [], jobs: [], edges: [] },
          { stageSlug: 'antithesis', status: 'paused_nsf', modelCount: 1, steps: [], progress: progressNone, documents: [], jobs: [], edges: [] },
          { stageSlug: 'synthesis', status: 'not_started', modelCount: 1, steps: [], progress: progressNone, documents: [], jobs: [], edges: [] },
        ],
      },
      status: 200,
    });
  });

  describe('_handleContributionGenerationPausedNsf', () => {
    it('clears the affected session from generatingSessions and resets contributionGenerationStatus and generatingForStageSlug', () => {
      useDialecticStore.setState({
        contributionGenerationStatus: 'generating',
        generatingForStageSlug: stageSlug,
        generatingSessions: { [sessionId]: ['job-1', 'job-2'] },
      });

      useDialecticStore.getState()._handleContributionGenerationPausedNsf(pausedNsfPayload);

      const state = useDialecticStore.getState();
      expect(state.contributionGenerationStatus).toBe('idle');
      expect(state.generatingForStageSlug).toBeNull();
      expect(state.generatingSessions[sessionId]).toBeUndefined();
    });

    it('calls hydrateAllStageProgress with sessionId, iterationNumber, userId, projectId from the payload so the progress tracker refreshes to show paused_nsf', () => {
      useDialecticStore.getState()._handleContributionGenerationPausedNsf(pausedNsfPayload);

      expect(getMockDialecticClient().getAllStageProgress).toHaveBeenCalledTimes(1);
      const callPayload: GetAllStageProgressPayload = getMockDialecticClient().getAllStageProgress.mock.calls[0][0];
      expect(callPayload.sessionId).toBe(sessionId);
      expect(callPayload.iterationNumber).toBe(iterationNumber);
      expect(callPayload.projectId).toBe(projectId);
      expect(callPayload.userId).toBe(userId);
    });
  });

  describe('_handleDialecticLifecycleEvent', () => {
    it('routes type contribution_generation_paused_nsf to _handleContributionGenerationPausedNsf', () => {
      useDialecticStore.setState({
        contributionGenerationStatus: 'generating',
        generatingSessions: { [sessionId]: ['job-1'] },
      });

      const event: DialecticLifecycleEvent = pausedNsfPayload;
      useDialecticStore.getState()._handleDialecticLifecycleEvent?.(event);

      const state = useDialecticStore.getState();
      expect(state.contributionGenerationStatus).toBe('idle');
      expect(state.generatingSessions[sessionId]).toBeUndefined();
      expect(getMockDialecticClient().getAllStageProgress).toHaveBeenCalled();
    });
  });

  describe('resumePausedNsfJobs', () => {
    const resumePayload: ResumePausedNsfJobsPayload = {
      sessionId,
      stageSlug,
      iterationNumber,
    };

    it('calls api.dialectic().resumePausedNsfJobs(payload) with correct sessionId, stageSlug, iterationNumber', async () => {
      getMockDialecticClient().resumePausedNsfJobs.mockResolvedValue({
        data: { resumedCount: 3 },
        status: 200,
      });

      await useDialecticStore.getState().resumePausedNsfJobs(resumePayload);

      expect(getMockDialecticClient().resumePausedNsfJobs).toHaveBeenCalledTimes(1);
      expect(getMockDialecticClient().resumePausedNsfJobs).toHaveBeenCalledWith(resumePayload);
      expect(getMockDialecticClient().resumePausedNsfJobs.mock.calls[0][0]).toEqual({
        sessionId,
        stageSlug,
        iterationNumber,
      });
    });

    it('on successful API response, calls hydrateAllStageProgress to refresh progress data', async () => {
      const minimalProject: DialecticProject = {
        id: projectId,
        user_id: userId,
        project_name: 'Pause Test Project',
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
      useDialecticStore.setState({ currentProjectDetail: minimalProject });

      getMockDialecticClient().resumePausedNsfJobs.mockResolvedValue({
        data: { resumedCount: 2 },
        status: 200,
      });

      await useDialecticStore.getState().resumePausedNsfJobs(resumePayload);

      expect(getMockDialecticClient().getAllStageProgress).toHaveBeenCalled();
      const hydrateCall: GetAllStageProgressPayload = getMockDialecticClient().getAllStageProgress.mock.calls[0][0];
      expect(hydrateCall.sessionId).toBe(sessionId);
      expect(hydrateCall.iterationNumber).toBe(iterationNumber);
      expect(hydrateCall.projectId).toBeDefined();
    });

    it('on API failure, does not call hydrateAllStageProgress', async () => {
      getMockDialecticClient().resumePausedNsfJobs.mockResolvedValue({
        error: { message: 'RPC failed', code: 'RESUME_FAILED' },
        status: 500,
      });

      await useDialecticStore.getState().resumePausedNsfJobs(resumePayload);

      expect(getMockDialecticClient().getAllStageProgress).not.toHaveBeenCalled();
    });

    it('on API failure, returns the error response and does not leave the store in a broken state', async () => {
      const apiError = { message: 'Resume failed', code: 'RESUME_FAILED' };
      getMockDialecticClient().resumePausedNsfJobs.mockResolvedValue({
        error: apiError,
        status: 500,
      });

      const result = await useDialecticStore.getState().resumePausedNsfJobs(resumePayload);

      expect(result.error).toEqual(apiError);
      expect(result.status).toBe(500);
      const state = useDialecticStore.getState();
      expect(state.contributionGenerationStatus).toBe(initialDialecticStateValues.contributionGenerationStatus);
      expect(state.resumePausedNsfJobs).toBeDefined();
    });
  });

  describe('pauseActiveJobs', () => {
    const pausePayload: PauseActiveJobsPayload = {
      sessionId,
      stageSlug,
      iterationNumber,
    };

    it('calls api.dialectic().pauseActiveJobs(payload) with correct sessionId, stageSlug, iterationNumber', async () => {
      getMockDialecticClient().pauseActiveJobs.mockResolvedValue({
        data: { pausedCount: 3 },
        status: 200,
      });

      await useDialecticStore.getState().pauseActiveJobs(pausePayload);

      expect(getMockDialecticClient().pauseActiveJobs).toHaveBeenCalledTimes(1);
      expect(getMockDialecticClient().pauseActiveJobs).toHaveBeenCalledWith(pausePayload);
      expect(getMockDialecticClient().pauseActiveJobs.mock.calls[0][0]).toEqual({
        sessionId,
        stageSlug,
        iterationNumber,
      });
    });

    it('on successful API response, calls hydrateAllStageProgress to refresh progress data', async () => {
      const minimalProject: DialecticProject = {
        id: projectId,
        user_id: userId,
        project_name: 'Pause Test Project',
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
      useDialecticStore.setState({ currentProjectDetail: minimalProject });

      getMockDialecticClient().pauseActiveJobs.mockResolvedValue({
        data: { pausedCount: 2 },
        status: 200,
      });

      await useDialecticStore.getState().pauseActiveJobs(pausePayload);

      expect(getMockDialecticClient().getAllStageProgress).toHaveBeenCalled();
      const hydrateCall: GetAllStageProgressPayload = getMockDialecticClient().getAllStageProgress.mock.calls[0][0];
      expect(hydrateCall.sessionId).toBe(sessionId);
      expect(hydrateCall.iterationNumber).toBe(iterationNumber);
      expect(hydrateCall.projectId).toBeDefined();
    });

    it('on API failure, logs error and returns error response', async () => {
      getMockDialecticClient().pauseActiveJobs.mockResolvedValue({
        error: { message: 'RPC failed', code: 'PAUSE_ACTIVE_JOBS_FAILED' },
        status: 500,
      });

      const result = await useDialecticStore.getState().pauseActiveJobs(pausePayload);

      expect(result.error).toEqual({ message: 'RPC failed', code: 'PAUSE_ACTIVE_JOBS_FAILED' });
      expect(result.status).toBe(500);
      expect(getMockDialecticClient().getAllStageProgress).not.toHaveBeenCalled();
    });

    it('does not call hydrateAllStageProgress when userId or projectId is missing', async () => {
      useAuthStore.setState({ user: null });
      useDialecticStore.setState({ currentProjectDetail: undefined });

      getMockDialecticClient().pauseActiveJobs.mockResolvedValue({
        data: { pausedCount: 1 },
        status: 200,
      });

      await useDialecticStore.getState().pauseActiveJobs(pausePayload);

      expect(getMockDialecticClient().getAllStageProgress).not.toHaveBeenCalled();
    });
  });
});
