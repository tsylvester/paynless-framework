import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useNotificationStore } from './notificationStore';
import { useDialecticStore, initialDialecticStateValues } from './dialecticStore';
import { selectUnifiedProjectProgress } from './dialecticStore.selectors';
import type {
  Notification,
  DialecticStageRecipe,
  DialecticStageRecipeStep,
  DialecticProcessTemplate,
  DialecticStage,
  DialecticSession,
  DialecticProject,
  DialecticStateValues,
  UnifiedProjectProgress,
  NotificationData,
  DialecticNotificationTypes,
  StageRenderedDocumentDescriptor,
  SelectedModels,
} from '@paynless/types';
import { mockLogger, resetMockLogger } from '../../api/src/mocks/logger.mock';
import { getStageRunDocumentKey } from './dialecticStore.documents';

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

const stageThesis: DialecticStage = {
  id: 'stage-thesis-id',
  slug: 'thesis',
  display_name: 'Thesis',
  description: 'Thesis stage',
  created_at: new Date().toISOString(),
  default_system_prompt_id: 'sp-thesis',
  expected_output_template_ids: [],
  recipe_template_id: null,
  active_recipe_instance_id: null,
};

const stageAntithesis: DialecticStage = {
  id: 'stage-antithesis-id',
  slug: 'antithesis',
  display_name: 'Antithesis',
  description: 'Antithesis stage',
  created_at: new Date().toISOString(),
  default_system_prompt_id: 'sp-antithesis',
  expected_output_template_ids: [],
  recipe_template_id: null,
  active_recipe_instance_id: null,
};

const templateTwoStages: DialecticProcessTemplate = {
  id: 'pt-progress',
  name: 'Progress Test Template',
  description: 'Two-stage template for progress integration tests',
  created_at: new Date().toISOString(),
  starting_stage_id: stageThesis.id,
  stages: [stageThesis, stageAntithesis],
  transitions: [
    {
      id: 't1',
      process_template_id: 'pt-progress',
      source_stage_id: stageThesis.id,
      target_stage_id: stageAntithesis.id,
      created_at: new Date().toISOString(),
      condition_description: null,
    },
  ],
};

const plannerStep: DialecticStageRecipeStep = {
  id: 'step-planner',
  step_key: 'planner_step',
  step_slug: 'planner',
  step_name: 'Planner',
  execution_order: 1,
  job_type: 'PLAN',
  prompt_type: 'Planner',
  output_type: 'header_context',
  granularity_strategy: 'all_to_one',
  inputs_required: [],
};

const documentStep: DialecticStageRecipeStep = {
  id: 'step-document',
  step_key: 'document_step',
  step_slug: 'document',
  step_name: 'Document',
  execution_order: 2,
  job_type: 'EXECUTE',
  prompt_type: 'Turn',
  output_type: 'assembled_document_json',
  granularity_strategy: 'per_source_document',
  inputs_required: [],
  outputs_required: [
    { document_key: 'business_case', artifact_class: 'rendered_document', file_type: 'markdown' },
    { document_key: 'executive_summary', artifact_class: 'rendered_document', file_type: 'markdown' },
    { document_key: 'scope', artifact_class: 'rendered_document', file_type: 'markdown' },
  ],
};

const renderStep: DialecticStageRecipeStep = {
  id: 'step-render',
  step_key: 'render_step',
  step_slug: 'render',
  step_name: 'Render',
  execution_order: 3,
  job_type: 'RENDER',
  prompt_type: 'Turn',
  output_type: 'rendered_document',
  granularity_strategy: 'per_source_document',
  inputs_required: [],
  outputs_required: [],
};

const recipeThesis: DialecticStageRecipe = {
  stageSlug: 'thesis',
  instanceId: 'instance-thesis-progress',
  steps: [plannerStep, documentStep, renderStep],
};

function buildNotification(
  type: DialecticNotificationTypes,
  data: NotificationData,
  id: string
): Notification {
  return {
    id,
    user_id: 'user-progress-test',
    type,
    data,
    read: false,
    created_at: new Date().toISOString(),
    is_internal_event: true,
    title: null,
    message: null,
    link_path: null,
  };
}

describe('Integration test: Frontend progress tracking from notifications to display', () => {
  const sessionId = 'session-progress-integration';
  const stageSlug = 'thesis';
  const iterationNumber = 1;
  const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

  const progressSelectedModels: SelectedModels[] = [
    { id: 'model-1', displayName: 'Model 1' },
    { id: 'model-2', displayName: 'Model 2' },
    { id: 'model-3', displayName: 'Model 3' },
  ];

  const session: DialecticSession = {
    id: sessionId,
    project_id: 'proj-progress',
    session_description: null,
    user_input_reference_url: null,
    iteration_count: iterationNumber,
    selected_models: progressSelectedModels,
    status: null,
    associated_chat_id: null,
    current_stage_id: stageThesis.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const project: DialecticProject = {
    id: 'proj-progress',
    user_id: 'user-progress-test',
    project_name: 'Progress Test Project',
    initial_user_prompt: 'Initial',
    selected_domain_id: 'domain1',
    dialectic_domains: { name: 'Tech' },
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

  beforeEach(() => {
    vi.clearAllMocks();
    resetMockLogger();
    useNotificationStore.setState({ notifications: [], unreadCount: 0 });
    useDialecticStore.setState({
      ...initialDialecticStateValues,
      currentProjectDetail: project,
      currentProcessTemplate: templateTwoStages,
      selectedModels: progressSelectedModels,
      recipesByStageSlug: { [stageSlug]: recipeThesis },
      stageRunProgress: {
        [progressKey]: {
          stepStatuses: {
            planner_step: 'not_started',
            document_step: 'not_started',
            render_step: 'not_started',
          },
          documents: {},
          jobProgress: {},
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('planner_started notification updates stepStatus to in_progress and selector returns in_progress status', () => {
    const notification: Notification = buildNotification(
      'planner_started',
      {
        sessionId,
        stageSlug,
        iterationNumber,
        job_id: 'job-planner',
        step_key: 'planner_step',
        document_key: 'global_header',
        modelId: 'model-1',
      },
      'notif-planner-started'
    );

    act(() => {
      useNotificationStore.getState().handleIncomingNotification(notification);
    });

    const state: DialecticStateValues = useDialecticStore.getState();
    expect(state.stageRunProgress[progressKey].stepStatuses.planner_step).toBe('in_progress');

    const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
    expect(result.totalStages).toBe(2);
    const thesisStage = result.stageDetails.find((s) => s.stageSlug === stageSlug);
    expect(thesisStage).toBeDefined();
    const plannerStepDetail = thesisStage?.stepsDetail.find((s) => s.stepKey === 'planner_step');
    expect(plannerStepDetail).toBeDefined();
    expect(plannerStepDetail?.status).toBe('in_progress');
  });

  it('planner_step completed (non-model step) counts as 1/1 and selector returns 100% for that step', () => {
    useDialecticStore.setState((state) => {
      const progress = state.stageRunProgress[progressKey];
      if (!progress) return;
      progress.stepStatuses.planner_step = 'completed';
      if (progress.jobProgress) {
        progress.jobProgress.planner_step = { totalJobs: 1, completedJobs: 1, inProgressJobs: 0, failedJobs: 0 };
      }
    });

    const state: DialecticStateValues = useDialecticStore.getState();
    const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
    const thesisStage = result.stageDetails.find((s) => s.stageSlug === stageSlug);
    const plannerStepDetail = thesisStage?.stepsDetail.find((s) => s.stepKey === 'planner_step');
    expect(plannerStepDetail?.totalJobs).toBe(1);
    expect(plannerStepDetail?.completedJobs).toBe(1);
    expect(plannerStepDetail?.stepPercentage).toBe(100);
    expect(plannerStepDetail?.status).toBe('completed');
  });

  it('document_started notification updates step status and selector returns in_progress for document step', () => {
    useDialecticStore.setState((state) => {
      const progress = state.stageRunProgress[progressKey];
      if (progress?.jobProgress) {
        progress.jobProgress.document_step = { totalJobs: 1, completedJobs: 0, inProgressJobs: 1, failedJobs: 0 };
      }
    });

    const notification: Notification = buildNotification(
      'document_started',
      {
        sessionId,
        stageSlug,
        iterationNumber,
        job_id: 'job-doc',
        document_key: 'business_case',
        modelId: 'model-1',
        step_key: 'document_step',
        latestRenderedResourceId: 'res-1',
      },
      'notif-doc-started'
    );

    act(() => {
      useNotificationStore.getState().handleIncomingNotification(notification);
    });

    const state: DialecticStateValues = useDialecticStore.getState();
    expect(state.stageRunProgress[progressKey].stepStatuses.document_step).toBe('in_progress');

    const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
    const thesisStage = result.stageDetails.find((s) => s.stageSlug === stageSlug);
    const documentStepDetail = thesisStage?.stepsDetail.find((s) => s.stepKey === 'document_step');
    expect(documentStepDetail?.status).toBe('in_progress');
  });

  it('document_completed for one of three models yields selector step progress 1/3 (33%)', () => {
    useDialecticStore.setState((state) => {
      const progress = state.stageRunProgress[progressKey];
      if (!progress) return;
      if (progress.jobProgress) {
        progress.jobProgress.document_step = { totalJobs: 3, completedJobs: 1, inProgressJobs: 2, failedJobs: 0 };
      }
      progress.documents[getStageRunDocumentKey('business_case', 'model-1')] = {
        descriptorType: 'rendered',
        status: 'completed',
        job_id: 'job-1',
        latestRenderedResourceId: 'res-1',
        modelId: 'model-1',
        versionHash: 'h1',
        lastRenderedResourceId: 'res-1',
        lastRenderAtIso: new Date().toISOString(),
        stepKey: 'document_step',
      };
    });

    const state: DialecticStateValues = useDialecticStore.getState();
    const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
    const thesisStage = result.stageDetails.find((s) => s.stageSlug === stageSlug);
    const documentStepDetail = thesisStage?.stepsDetail.find((s) => s.stepKey === 'document_step');
    expect(documentStepDetail?.totalJobs).toBe(3);
    expect(documentStepDetail?.completedJobs).toBe(1);
    expect(documentStepDetail?.stepPercentage).toBeGreaterThan(0);
    expect(documentStepDetail?.stepPercentage).toBeLessThan(100);
    expect(documentStepDetail?.status).toBe('in_progress');
  });

  it('all document step models complete yields selector 100% step progress for document step', () => {
    useDialecticStore.setState((state) => {
      const progress = state.stageRunProgress[progressKey];
      if (!progress) return;
      progress.stepStatuses.planner_step = 'completed';
      if (progress.jobProgress) {
        progress.jobProgress.document_step = { totalJobs: 3, completedJobs: 1, inProgressJobs: 0, failedJobs: 0 };
      }
      progress.documents[getStageRunDocumentKey('business_case', 'model-1')] = {
        descriptorType: 'rendered',
        status: 'completed',
        job_id: 'job-1',
        latestRenderedResourceId: 'res-1',
        modelId: 'model-1',
        versionHash: 'h1',
        lastRenderedResourceId: 'res-1',
        lastRenderAtIso: new Date().toISOString(),
        stepKey: 'document_step',
      };
    });

    const docStartedM2: Notification = buildNotification(
      'document_started',
      {
        sessionId,
        stageSlug,
        iterationNumber,
        job_id: 'job-2',
        document_key: 'executive_summary',
        modelId: 'model-2',
        step_key: 'document_step',
        latestRenderedResourceId: 'res-2',
      },
      'notif-doc-started-m2'
    );
    const docCompletedM2: Notification = buildNotification(
      'document_completed',
      {
        sessionId,
        stageSlug,
        iterationNumber,
        job_id: 'job-2',
        document_key: 'executive_summary',
        modelId: 'model-2',
        step_key: 'document_step',
        latestRenderedResourceId: 'res-2',
      },
      'notif-doc-m2'
    );

    act(() => {
      useNotificationStore.getState().handleIncomingNotification(docStartedM2);
    });
    act(() => {
      useNotificationStore.getState().handleIncomingNotification(docCompletedM2);
    });

    const docStartedM3: Notification = buildNotification(
      'document_started',
      {
        sessionId,
        stageSlug,
        iterationNumber,
        job_id: 'job-3',
        document_key: 'scope',
        modelId: 'model-3',
        step_key: 'document_step',
        latestRenderedResourceId: 'res-3',
      },
      'notif-doc-started-m3'
    );
    const docCompletedM3: Notification = buildNotification(
      'document_completed',
      {
        sessionId,
        stageSlug,
        iterationNumber,
        job_id: 'job-3',
        document_key: 'scope',
        modelId: 'model-3',
        step_key: 'document_step',
        latestRenderedResourceId: 'res-3',
      },
      'notif-doc-m3'
    );

    act(() => {
      useNotificationStore.getState().handleIncomingNotification(docStartedM3);
    });
    act(() => {
      useNotificationStore.getState().handleIncomingNotification(docCompletedM3);
    });

    const state: DialecticStateValues = useDialecticStore.getState();
    const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
    const thesisStage = result.stageDetails.find((s) => s.stageSlug === stageSlug);
    const documentStepDetail = thesisStage?.stepsDetail.find((s) => s.stepKey === 'document_step');
    expect(documentStepDetail?.totalJobs).toBe(3);
    expect(documentStepDetail?.completedJobs).toBe(3);
    expect(documentStepDetail?.stepPercentage).toBe(100);
    expect(documentStepDetail?.status).toBe('completed');
  });

  it('render_completed flow updates document descriptor and selector reflects render step when step_key provided', () => {
    useDialecticStore.setState((state) => {
      const progress = state.stageRunProgress[progressKey];
      if (!progress) return;
      if (progress.jobProgress) {
        progress.jobProgress.render_step = { totalJobs: 1, completedJobs: 1, inProgressJobs: 0, failedJobs: 0 };
      }
      progress.documents[getStageRunDocumentKey('business_case', 'model-1')] = {
        descriptorType: 'rendered',
        status: 'generating',
        job_id: 'job-render',
        latestRenderedResourceId: '',
        modelId: 'model-1',
        versionHash: '',
        lastRenderedResourceId: '',
        lastRenderAtIso: new Date().toISOString(),
        stepKey: 'render_step',
      };
    });

    const renderCompleted: Notification = buildNotification(
      'render_completed',
      {
        sessionId,
        stageSlug,
        iterationNumber,
        job_id: 'job-render',
        document_key: 'business_case',
        modelId: 'model-1',
        step_key: 'render_step',
        latestRenderedResourceId: 'resource-rendered-1',
      },
      'notif-render-completed'
    );

    act(() => {
      useNotificationStore.getState().handleIncomingNotification(renderCompleted);
    });

    const state: DialecticStateValues = useDialecticStore.getState();
    const descriptor = state.stageRunProgress[progressKey]?.documents[getStageRunDocumentKey('business_case', 'model-1')];
    expect(descriptor).toBeDefined();
    expect(descriptor?.descriptorType).toBe('rendered');
    if (descriptor && descriptor.descriptorType === 'rendered') {
      expect(descriptor.latestRenderedResourceId).toBe('resource-rendered-1');
    }
    expect(state.stageRunProgress[progressKey].stepStatuses.render_step).toBe('completed');

    const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
    const thesisStage = result.stageDetails.find((s) => s.stageSlug === stageSlug);
    const renderStepDetail = thesisStage?.stepsDetail.find((s) => s.stepKey === 'render_step');
    expect(renderStepDetail?.status).toBe('completed');
  });

  it('job_failed notification for PLAN job updates store status and selector returns failed status', () => {
    const notification: Notification = buildNotification(
      'job_failed',
      {
        sessionId,
        stageSlug,
        iterationNumber,
        job_id: 'job-planner-fail',
        step_key: 'planner_step',
        document_key: 'global_header',
        modelId: 'model-1',
        error: { code: 'PLAN_FAILED', message: 'Planner failed' },
      },
      'notif-job-failed'
    );

    act(() => {
      useNotificationStore.getState().handleIncomingNotification(notification);
    });

    const state: DialecticStateValues = useDialecticStore.getState();
    expect(state.stageRunProgress[progressKey].stepStatuses.planner_step).toBe('failed');

    const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
    const thesisStage = result.stageDetails.find((s) => s.stageSlug === stageSlug);
    const plannerStepDetail = thesisStage?.stepsDetail.find((s) => s.stepKey === 'planner_step');
    expect(plannerStepDetail?.status).toBe('failed');
    expect(result.projectStatus).toBe('failed');
  });

  it('job_failed notification for EXECUTE job updates store and selector returns failed status', () => {
    useDialecticStore.setState((state) => {
      const progress = state.stageRunProgress[progressKey];
      if (!progress) return;
      progress.documents[getStageRunDocumentKey('business_case', 'model-1')] = {
        descriptorType: 'rendered',
        status: 'generating',
        job_id: 'job-doc',
        latestRenderedResourceId: 'res-1',
        modelId: 'model-1',
        versionHash: 'h1',
        lastRenderedResourceId: 'res-1',
        lastRenderAtIso: new Date().toISOString(),
        stepKey: 'document_step',
      };
    });

    const notification: Notification = buildNotification(
      'job_failed',
      {
        sessionId,
        stageSlug,
        iterationNumber,
        job_id: 'job-doc-fail',
        document_key: 'business_case',
        modelId: 'model-1',
        step_key: 'document_step',
        error: { code: 'EXECUTE_FAILED', message: 'Execute failed' },
      },
      'notif-exec-failed'
    );

    act(() => {
      useNotificationStore.getState().handleIncomingNotification(notification);
    });

    const state: DialecticStateValues = useDialecticStore.getState();
    expect(state.stageRunProgress[progressKey].stepStatuses.document_step).toBe('failed');

    const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
    const thesisStage = result.stageDetails.find((s) => s.stageSlug === stageSlug);
    const documentStepDetail = thesisStage?.stepsDetail.find((s) => s.stepKey === 'document_step');
    expect(documentStepDetail?.status).toBe('failed');
  });

  it('full stage lifecycle (planner completed, document step 3/3, render completed) yields 100% stage progress', () => {
    useDialecticStore.setState((state) => {
      const progress = state.stageRunProgress[progressKey];
      if (!progress) return;
      progress.stepStatuses.planner_step = 'completed';
      progress.stepStatuses.document_step = 'completed';
      progress.stepStatuses.render_step = 'completed';
      if (progress.jobProgress) {
        progress.jobProgress.planner_step = { totalJobs: 1, completedJobs: 1, inProgressJobs: 0, failedJobs: 0 };
        progress.jobProgress.document_step = { totalJobs: 3, completedJobs: 3, inProgressJobs: 0, failedJobs: 0 };
        progress.jobProgress.render_step = { totalJobs: 1, completedJobs: 1, inProgressJobs: 0, failedJobs: 0 };
      }
      const baseDescriptor: Omit<StageRenderedDocumentDescriptor, 'modelId'> = {
        descriptorType: 'rendered',
        status: 'completed',
        job_id: 'job-1',
        latestRenderedResourceId: 'res-1',
        versionHash: 'h1',
        lastRenderedResourceId: 'res-1',
        lastRenderAtIso: new Date().toISOString(),
        stepKey: 'document_step',
      };
      progress.documents[getStageRunDocumentKey('business_case', 'model-1')] = {
        ...baseDescriptor,
        modelId: 'model-1',
      };
      progress.documents[getStageRunDocumentKey('executive_summary', 'model-2')] = {
        ...baseDescriptor,
        modelId: 'model-2',
      };
      progress.documents[getStageRunDocumentKey('scope', 'model-3')] = {
        ...baseDescriptor,
        modelId: 'model-3',
      };
    });

    const state: DialecticStateValues = useDialecticStore.getState();
    const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
    const thesisStage = result.stageDetails.find((s) => s.stageSlug === stageSlug);
    expect(thesisStage?.stageStatus).toBe('completed');
    expect(thesisStage?.stagePercentage).toBe(100);
    expect(result.completedStages).toBe(1);
    expect(result.overallPercentage).toBeGreaterThan(0);
  });

  it('multi-stage project: completing first stage shows partial overall progress', () => {
    useDialecticStore.setState((state) => {
      const progress = state.stageRunProgress[progressKey];
      if (!progress) return;
      progress.stepStatuses.planner_step = 'completed';
      progress.stepStatuses.document_step = 'completed';
      progress.stepStatuses.render_step = 'completed';
      if (progress.jobProgress) {
        progress.jobProgress.planner_step = { totalJobs: 1, completedJobs: 1, inProgressJobs: 0, failedJobs: 0 };
        progress.jobProgress.document_step = { totalJobs: 3, completedJobs: 3, inProgressJobs: 0, failedJobs: 0 };
        progress.jobProgress.render_step = { totalJobs: 1, completedJobs: 1, inProgressJobs: 0, failedJobs: 0 };
      }
      const baseDescriptor: Omit<StageRenderedDocumentDescriptor, 'modelId'> = {
        descriptorType: 'rendered',
        status: 'completed',
        job_id: 'job-1',
        latestRenderedResourceId: 'res-1',
        versionHash: 'h1',
        lastRenderedResourceId: 'res-1',
        lastRenderAtIso: new Date().toISOString(),
        stepKey: 'document_step',
      };
      progress.documents[getStageRunDocumentKey('business_case', 'model-1')] = {
        ...baseDescriptor,
        modelId: 'model-1',
      };
      progress.documents[getStageRunDocumentKey('executive_summary', 'model-2')] = {
        ...baseDescriptor,
        modelId: 'model-2',
      };
      progress.documents[getStageRunDocumentKey('scope', 'model-3')] = {
        ...baseDescriptor,
        modelId: 'model-3',
      };
    });

    const state: DialecticStateValues = useDialecticStore.getState();
    const result: UnifiedProjectProgress = selectUnifiedProjectProgress(state, sessionId);
    expect(result.totalStages).toBe(2);
    expect(result.completedStages).toBe(1);
    expect(result.overallPercentage).toBe(50);
  });
});
