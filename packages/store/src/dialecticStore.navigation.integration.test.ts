import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useNotificationStore } from './notificationStore';
import { useDialecticStore, initialDialecticStateValues } from './dialecticStore';
import type {
  Notification,
  ApiResponse,
  DialecticProcessTemplate,
  DialecticStage,
  DialecticProject,
  DialecticSession,
  SubmitStageResponsesResponse,
} from '@paynless/types';
import { mockLogger, resetMockLogger } from '../../api/src/mocks/logger.mock';
import { resetApiMock, getMockDialecticClient } from '@paynless/api/mocks';

vi.mock('@paynless/utils', async (importOriginal) => {
  const actualUtils = await importOriginal<typeof import('@paynless/utils')>();
  const { mockLogger: loggerMock, resetMockLogger: resetLoggerMock } = await import(
    '../../api/src/mocks/logger.mock'
  );
  return {
    ...actualUtils,
    logger: loggerMock,
    resetMockLogger: resetLoggerMock,
  };
});

vi.mock('@paynless/api', async () => {
  const { api, resetApiMock, getMockDialecticClient } = await import(
    '@paynless/api/mocks'
  );
  return {
    api,
    initializeApiClient: vi.fn(),
    resetApiMock,
    getMockDialecticClient,
  };
});

const thesisStage: DialecticStage = {
  id: 'stage-1',
  slug: 'thesis',
  description: 'Thesis stage',
  created_at: new Date().toISOString(),
  display_name: 'Thesis',
  default_system_prompt_id: null,
  expected_output_template_ids: [],
  recipe_template_id: null,
  active_recipe_instance_id: null,
};

const antithesisStage: DialecticStage = {
  id: 'stage-2',
  slug: 'antithesis',
  description: 'Antithesis stage',
  created_at: new Date().toISOString(),
  display_name: 'Antithesis',
  default_system_prompt_id: null,
  expected_output_template_ids: [],
  recipe_template_id: null,
  active_recipe_instance_id: null,
};

const templateWithStages: DialecticProcessTemplate = {
  id: 'pt1',
  name: 'Standard Dialectic',
  description: 'A standard template',
  created_at: new Date().toISOString(),
  starting_stage_id: 'stage-1',
  stages: [thesisStage, antithesisStage],
};

const sessionWithThesisStage: DialecticSession = {
  id: 'session-1',
  project_id: 'proj-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  current_stage_id: 'stage-1',
  selected_model_ids: [],
  dialectic_contributions: [],
  feedback: [],
  session_description: null,
  user_input_reference_url: null,
  iteration_count: 1,
  status: 'thesis_completed',
  associated_chat_id: null,
  dialectic_session_models: [],
};

const sessionWithAntithesisStage: DialecticSession = {
  ...sessionWithThesisStage,
  current_stage_id: 'stage-2',
  status: 'pending_antithesis',
};

const currentProjectDetailWithSession: DialecticProject = {
  id: 'proj-1',
  project_name: 'Test Project',
  selected_domain_id: 'domain-1',
  user_id: 'user-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  status: 'active',
  initial_user_prompt: null,
  initial_prompt_resource_id: null,
  selected_domain_overlay_id: null,
  repo_url: null,
  process_template_id: 'pt1',
  dialectic_domains: { name: 'Test' },
  dialectic_sessions: [sessionWithThesisStage],
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

describe('Stage navigation stability during generation lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetApiMock();
    resetMockLogger();
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
    });
    useDialecticStore.setState(initialDialecticStateValues);
    useDialecticStore.getState()._resetForTesting?.();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps activeStageSlug unchanged when contribution_generation_complete fires while user is viewing thesis', async () => {
    const projectId = 'proj-1';
    const sessionId = 'session-1';

    getMockDialecticClient().getProjectDetails.mockResolvedValue({
      data: currentProjectDetailWithSession,
      status: 200,
    } as ApiResponse<DialecticProject>);
    getMockDialecticClient().fetchProcessTemplate.mockResolvedValue({
      data: templateWithStages,
      status: 200,
    } as ApiResponse<DialecticProcessTemplate>);

    useDialecticStore.setState({
      currentProjectDetail: currentProjectDetailWithSession,
      currentProcessTemplate: templateWithStages,
      activeStageSlug: 'thesis',
      activeContextStage: thesisStage,
    });

    const notification: Notification = {
      id: 'notif-gen-complete',
      user_id: 'user-1',
      type: 'contribution_generation_complete',
      data: { sessionId, projectId },
      read: false,
      created_at: new Date().toISOString(),
      is_internal_event: true,
      title: null,
      message: null,
      link_path: null,
    };

    act(() => {
      useNotificationStore.getState().handleIncomingNotification(notification);
    });

    await vi.waitFor(() => {
      expect(useDialecticStore.getState().isLoadingProjectDetail).toBe(false);
    });

    const state = useDialecticStore.getState();
    expect(state.activeStageSlug).toBe('thesis');
  });

  it('keeps activeStageSlug unchanged when document_completed fires while user is viewing thesis', () => {
    useDialecticStore.setState({
      currentProjectDetail: currentProjectDetailWithSession,
      currentProcessTemplate: templateWithStages,
      activeStageSlug: 'thesis',
      activeContextStage: thesisStage,
    });

    const notification: Notification = {
      id: 'notif-doc-complete',
      user_id: 'user-1',
      type: 'document_completed',
      data: {
        sessionId: 'session-1',
        stageSlug: 'thesis',
        iterationNumber: 1,
        job_id: 'job-1',
        document_key: 'business_case',
        modelId: 'model-1',
        step_key: 'execute_step',
      },
      read: false,
      created_at: new Date().toISOString(),
      is_internal_event: true,
      title: null,
      message: null,
      link_path: null,
    };

    act(() => {
      useNotificationStore.getState().handleIncomingNotification(notification);
    });

    const state = useDialecticStore.getState();
    expect(state.activeStageSlug).toBe('thesis');
    expect(state.activeContextStage).toEqual(thesisStage);
  });

  it('keeps activeStageSlug unchanged when render_completed fires while user is viewing thesis', () => {
    useDialecticStore.setState({
      currentProjectDetail: currentProjectDetailWithSession,
      currentProcessTemplate: templateWithStages,
      activeStageSlug: 'thesis',
      activeContextStage: thesisStage,
    });

    const notification: Notification = {
      id: 'notif-render-complete',
      user_id: 'user-1',
      type: 'render_completed',
      data: {
        sessionId: 'session-1',
        stageSlug: 'thesis',
        iterationNumber: 1,
        job_id: 'job-1',
        document_key: 'business_case',
        modelId: 'model-1',
        latestRenderedResourceId: 'resource-1',
      },
      read: false,
      created_at: new Date().toISOString(),
      is_internal_event: true,
      title: null,
      message: null,
      link_path: null,
    };

    act(() => {
      useNotificationStore.getState().handleIncomingNotification(notification);
    });

    const state = useDialecticStore.getState();
    expect(state.activeStageSlug).toBe('thesis');
    expect(state.activeContextStage).toEqual(thesisStage);
  });

  it('updates activeStageSlug to antithesis when user explicitly calls setActiveStage', () => {
    useDialecticStore.setState({
      activeStageSlug: 'thesis',
      activeContextStage: thesisStage,
    });

    const { setActiveStage } = useDialecticStore.getState();
    act(() => {
      setActiveStage('antithesis');
    });

    const state = useDialecticStore.getState();
    expect(state.activeStageSlug).toBe('antithesis');
  });

  it('submitStageResponses success then setActiveStage(next) advances viewed stage to next', async () => {
    const submitPayload = {
      sessionId: 'session-1',
      projectId: 'proj-1',
      stageSlug: 'thesis' as const,
      currentIterationNumber: 1,
    };

    const submitResponse: ApiResponse<SubmitStageResponsesResponse> = {
      data: {
        updatedSession: sessionWithAntithesisStage,
        message: 'Stage advanced',
      },
      status: 200,
    };

    getMockDialecticClient().submitStageResponses.mockResolvedValue(submitResponse);
    getMockDialecticClient().getProjectDetails.mockResolvedValue({
      data: { ...currentProjectDetailWithSession, dialectic_sessions: [sessionWithAntithesisStage] },
      status: 200,
    } as ApiResponse<DialecticProject>);
    getMockDialecticClient().fetchProcessTemplate.mockResolvedValue({
      data: templateWithStages,
      status: 200,
    } as ApiResponse<DialecticProcessTemplate>);

    useDialecticStore.setState({
      currentProjectDetail: currentProjectDetailWithSession,
      currentProcessTemplate: templateWithStages,
      activeStageSlug: 'thesis',
      activeContextStage: thesisStage,
      activeSessionDetail: sessionWithThesisStage,
    });

    const { submitStageResponses, setActiveStage } = useDialecticStore.getState();
    const result = await submitStageResponses(submitPayload);

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();

    act(() => {
      setActiveStage('antithesis');
    });

    const state = useDialecticStore.getState();
    expect(state.activeStageSlug).toBe('antithesis');
  });
});
