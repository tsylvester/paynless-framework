import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import {
  emptyStageRunProgressSnapshot,
  getDialecticStoreState,
  initializeMockDialecticState,
  setDialecticStateValues,
} from '../../mocks/dialecticStore.mock';
import type {
  DialecticProcessTemplate,
  DialecticProject,
  DialecticSession,
  DialecticStage,
  DialecticStageRecipe,
  DialecticStageRecipeStep,
  DialecticStageTransition,
  JobProgressDto,
  StageRenderedDocumentDescriptor,
  StageDocumentContentState,
  UseStartContributionGenerationReturn,
} from '@paynless/types';
import { SubmitResponsesButton } from './SubmitResponsesButton.tsx';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockStartContributionGeneration = vi.fn<
  [],
  UseStartContributionGenerationReturn
>();

vi.mock('@/hooks/useStartContributionGeneration', () => ({
  useStartContributionGeneration: () => mockStartContributionGeneration(),
}));

vi.mock('@paynless/store', async (importOriginal) => {
  const mock = await import('../../mocks/dialecticStore.mock');
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...mock,
    selectStageHasUnsavedChanges: actual.selectStageHasUnsavedChanges,
    selectUnifiedProjectProgress: actual.selectUnifiedProjectProgress,
    selectValidMarkdownDocumentKeys: actual.selectValidMarkdownDocumentKeys,
  };
});

const projectId = 'proj-1';
const sessionId = 'sess-1';
const stageSlug = 'thesis';
const iterationNumber = 1;
const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
const antithesisProgressKey = `${sessionId}:antithesis:${iterationNumber}`;
const isoTimestamp = '2024-01-01T00:00:00.000Z';

function buildJobProgressDto(
  overrides: Partial<JobProgressDto> & Pick<JobProgressDto, 'id' | 'status' | 'documentKey' | 'modelId'>,
): JobProgressDto {
  return {
    id: overrides.id,
    status: overrides.status,
    jobType: overrides.jobType ?? 'RENDER',
    stepKey: overrides.stepKey ?? 'step-1',
    modelId: overrides.modelId,
    documentKey: overrides.documentKey,
    parentJobId: overrides.parentJobId ?? null,
    createdAt: overrides.createdAt ?? isoTimestamp,
    startedAt: overrides.startedAt ?? isoTimestamp,
    completedAt: overrides.completedAt ?? isoTimestamp,
    modelName: overrides.modelName ?? null,
  };
}

function buildMinimalRecipe(slug: string): DialecticStageRecipe {
  return {
    stageSlug: slug,
    instanceId: 'inst-1',
    steps: [],
    edges: [],
  };
}

/** Recipe with a single first step (execution_order 1) and no required inputs, so next-stage inputs check passes. */
function buildRecipeWithFirstStep(slug: string): DialecticStageRecipe {
  const step: DialecticStageRecipeStep = {
    id: 'step-1',
    step_key: 'step-1',
    step_slug: 'step-1',
    step_name: 'Step',
    execution_order: 1,
    job_type: 'RENDER',
    prompt_type: 'Turn',
    output_type: 'rendered_document',
    granularity_strategy: 'all_to_one',
    inputs_required: [],
    outputs_required: [],
  };
  return {
    stageSlug: slug,
    instanceId: 'inst-1',
    steps: [step],
    edges: [],
  };
}

function buildRenderedDescriptor(
  modelId: string,
  latestRenderedResourceId: string,
): StageRenderedDocumentDescriptor {
  return {
    descriptorType: 'rendered',
    status: 'completed',
    job_id: `job-${modelId}`,
    latestRenderedResourceId,
    modelId,
    versionHash: `hash-${modelId}`,
    lastRenderedResourceId: latestRenderedResourceId,
    lastRenderAtIso: isoTimestamp,
  };
}

function buildStageDocumentContent(
  overrides: Partial<StageDocumentContentState> = {},
): StageDocumentContentState {
  return {
    baselineMarkdown: '',
    currentDraftMarkdown: '',
    isDirty: false,
    isLoading: false,
    error: null,
    lastBaselineVersion: null,
    pendingDiff: null,
    lastAppliedVersionHash: null,
    sourceContributionId: null,
    feedbackDraftMarkdown: undefined,
    feedbackIsDirty: false,
    resourceType: null,
    ...overrides,
  };
}

const buildStage = (id: string, slug: string, displayName: string): DialecticStage => ({
  id,
  slug,
  display_name: displayName,
  description: '',
  default_system_prompt_id: null,
  expected_output_template_ids: [],
  recipe_template_id: null,
  active_recipe_instance_id: null,
  created_at: '2024-01-01T00:00:00.000Z',
  minimum_balance: 0,
});

const buildTransitions = (stages: DialecticStage[]): DialecticStageTransition[] =>
  stages.length >= 2
    ? [
        {
          id: 'trans-1',
          process_template_id: 'template-1',
          source_stage_id: stages[0].id,
          target_stage_id: stages[1].id,
          created_at: isoTimestamp,
          condition_description: null,
        },
      ]
    : [];

const buildProcessTemplate = (stages: DialecticStage[]): DialecticProcessTemplate => ({
  id: 'template-1',
  name: 'Template',
  description: '',
  starting_stage_id: stages[0].id,
  created_at: isoTimestamp,
  stages,
  transitions: buildTransitions(stages),
});

const buildSession = (): DialecticSession => ({
  id: sessionId,
  project_id: projectId,
  session_description: 'Session',
  user_input_reference_url: null,
  iteration_count: iterationNumber,
  selected_models: [],
  status: 'active',
  associated_chat_id: null,
  current_stage_id: 'stage-1',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  dialectic_session_models: [],
  dialectic_contributions: [],
  feedback: [],
  viewing_stage_id: 'stage-1',
});

const buildProject = (
  session: DialecticSession,
  processTemplate: DialecticProcessTemplate,
): DialecticProject => ({
  id: projectId,
  user_id: 'user-1',
  project_name: 'Project',
  initial_user_prompt: null,
  initial_prompt_resource_id: null,
  selected_domain_id: 'domain-1',
  dialectic_domains: { name: 'Software Development' },
  selected_domain_overlay_id: null,
  repo_url: null,
  status: 'active',
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  dialectic_sessions: [session],
  resources: [],
  process_template_id: processTemplate.id,
  dialectic_process_templates: processTemplate,
  isLoadingProcessTemplate: false,
  processTemplateError: null,
  contributionGenerationStatus: 'idle',
  generateContributionsError: null,
  isSubmittingStageResponses: false,
  submitStageResponsesError: null,
  isSavingContributionEdit: false,
  saveContributionEditError: null,
});

/** Minimal recipe so real selectValidMarkdownDocumentKeys returns the given document key for thesis. */
function buildThesisRecipeWithDocumentKey(documentKey: string): DialecticStageRecipe {
  const step: DialecticStageRecipeStep = {
    id: 'step-1',
    step_key: 'step-1',
    step_slug: 'step-1',
    step_name: 'Step',
    execution_order: 0,
    job_type: 'RENDER',
    prompt_type: 'Turn',
    output_type: 'rendered_document',
    granularity_strategy: 'all_to_one',
    inputs_required: [],
    outputs_required: [
      {
        document_key: documentKey,
        artifact_class: 'rendered_document',
        file_type: 'markdown',
      },
    ],
  };
  return {
    stageSlug: 'thesis',
    instanceId: 'inst-1',
    steps: [step],
    edges: [],
  };
}

function defaultStartContributionGenerationMock(): UseStartContributionGenerationReturn {
  return {
    startContributionGeneration: vi.fn().mockResolvedValue({ success: true }),
    isDisabled: false,
    isResumeMode: false,
    isSessionGenerating: false,
    isWalletReady: true,
    isStageReady: true,
    balanceMeetsThreshold: true,
    areAnyModelsSelected: true,
    hasPausedNsfJobs: false,
    hasPausedUserJobs: false,
    isPauseMode: false,
    pauseGeneration: vi.fn().mockResolvedValue(undefined),
    didGenerationFail: false,
    contributionsForStageAndIterationExist: false,
    showBalanceCallout: false,
    viewingStage: null,
    activeSession: null,
    stageThreshold: undefined,
  };
}

function setupVisibleButtonState(): void {
  const stage1 = buildStage('stage-1', 'thesis', 'Thesis');
  const stage2 = buildStage('stage-2', 'antithesis', 'Antithesis');
  const processTemplate = buildProcessTemplate([stage1, stage2]);
  const session = buildSession();
  const project = buildProject(session, processTemplate);

  setDialecticStateValues({
    currentProjectDetail: project,
    activeSessionDetail: session,
    activeContextSessionId: sessionId,
    currentProcessTemplate: processTemplate,
    activeContextStage: stage1,
    viewingStageSlug: stage1.slug,
    recipesByStageSlug: {
      thesis: buildThesisRecipeWithDocumentKey('success_metrics'),
      antithesis: buildRecipeWithFirstStep('antithesis'),
    },
    stageRunProgress: {
      [progressKey]: {
        progress: {
          totalSteps: 1,
          completedSteps: 1,
          failedSteps: 0,
        },
        stepStatuses: { 'step-1': 'completed' },
        documents: {
          [`success_metrics:model-1`]: buildRenderedDescriptor('model-1', 'res-1'),
        },
        jobProgress: {},
        jobs: [
          buildJobProgressDto({
            id: 'job-1',
            status: 'completed',
            documentKey: 'success_metrics',
            modelId: 'model-1',
          }),
        ],
      },
      [antithesisProgressKey]: emptyStageRunProgressSnapshot,
    },
    isSubmittingStageResponses: false,
    submitStageResponsesError: null,
  });
}

describe('SubmitResponsesButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeMockDialecticState();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    mockStartContributionGeneration.mockImplementation(
      defaultStartContributionGenerationMock,
    );
  });

  it('renders disabled button when canAdvance is false (project null, session not in project)', () => {
    setDialecticStateValues({
      currentProjectDetail: null,
      activeSessionDetail: buildSession(),
      activeContextStage: buildStage('stage-1', stageSlug, 'Thesis'),
      currentProcessTemplate: buildProcessTemplate([buildStage('stage-1', stageSlug, 'Thesis')]),
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeDisabled();
  });

  it('renders disabled button when canAdvance is false (session null)', () => {
    const stage = buildStage('stage-1', stageSlug, 'Thesis');
    setDialecticStateValues({
      currentProjectDetail: buildProject(buildSession(), buildProcessTemplate([stage])),
      activeSessionDetail: null,
      activeContextStage: stage,
      currentProcessTemplate: buildProcessTemplate([stage]),
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeDisabled();
  });

  it('renders disabled button when canAdvance is false (final stage, no next stage)', () => {
    const stage = buildStage('stage-1', stageSlug, 'Thesis');
    const processTemplate = buildProcessTemplate([stage]);
    const session = buildSession();
    setDialecticStateValues({
      currentProjectDetail: buildProject(session, processTemplate),
      activeSessionDetail: session,
      activeContextStage: stage,
      currentProcessTemplate: processTemplate,
      stageRunProgress: {
        [progressKey]: {
          progress: {
            totalSteps: 1,
            completedSteps: 0,
            failedSteps: 0,
          },
          stepStatuses: {},
          documents: {
            ['doc:model-1']: buildRenderedDescriptor('model-1', 'res-1'),
          },
          jobProgress: {},
          jobs: [
            buildJobProgressDto({
              id: 'job-1',
              status: 'completed',
              documentKey: 'doc',
              modelId: 'model-1',
            }),
          ],
        },
      },
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeDisabled();
  });

  it('renders disabled button when canAdvance is false (user on final stage of multi-stage process)', () => {
    const stage1 = buildStage('stage-1', 'thesis', 'Thesis');
    const stage2 = buildStage('stage-2', 'antithesis', 'Antithesis');
    const processTemplate = buildProcessTemplate([stage1, stage2]);
    const session = buildSession();
    setDialecticStateValues({
      currentProjectDetail: buildProject(session, processTemplate),
      activeSessionDetail: session,
      activeContextSessionId: sessionId,
      activeContextStage: stage2,
      viewingStageSlug: stage2.slug,
      currentProcessTemplate: processTemplate,
      recipesByStageSlug: {
        thesis: buildMinimalRecipe('thesis'),
        antithesis: buildRecipeWithFirstStep('antithesis'),
      },
      stageRunProgress: {
        [progressKey]: emptyStageRunProgressSnapshot,
        [antithesisProgressKey]: emptyStageRunProgressSnapshot,
      },
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeDisabled();
  });

  it('renders disabled button when canAdvance is false (viewed stage does not match app current stage)', () => {
    const stage1 = buildStage('stage-1', 'thesis', 'Thesis');
    const stage2 = buildStage('stage-2', 'antithesis', 'Antithesis');
    const processTemplate = buildProcessTemplate([stage1, stage2]);
    const session: DialecticSession = {
      ...buildSession(),
      current_stage_id: stage1.id,
      viewing_stage_id: stage2.id,
    };
    const project = buildProject(session, processTemplate);
    setDialecticStateValues({
      currentProjectDetail: project,
      activeSessionDetail: session,
      activeContextSessionId: sessionId,
      currentProcessTemplate: processTemplate,
      activeContextStage: stage1,
      viewingStageSlug: stage1.slug,
      recipesByStageSlug: {
        thesis: buildThesisRecipeWithDocumentKey('success_metrics'),
        antithesis: buildRecipeWithFirstStep('antithesis'),
      },
      stageRunProgress: {
        [progressKey]: {
          progress: { totalSteps: 1, completedSteps: 1, failedSteps: 0 },
          stepStatuses: { 'step-1': 'completed' },
          documents: {
            [`success_metrics:model-1`]: buildRenderedDescriptor('model-1', 'res-1'),
          },
          jobProgress: {},
          jobs: [
            buildJobProgressDto({
              id: 'job-1',
              status: 'completed',
              documentKey: 'success_metrics',
              modelId: 'model-1',
            }),
          ],
        },
        [antithesisProgressKey]: emptyStageRunProgressSnapshot,
      },
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeDisabled();
  });

  it('renders button when canAdvance is true', () => {
    setupVisibleButtonState();
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
  });

  it('button is enabled when canAdvance is true', () => {
    setupVisibleButtonState();
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    expect(trigger).not.toBeDisabled();
  });

  it('renders disabled button when canAdvance is false (current stage not complete)', () => {
    const stage1 = buildStage('stage-1', 'thesis', 'Thesis');
    const stage2 = buildStage('stage-2', 'antithesis', 'Antithesis');
    const processTemplate = buildProcessTemplate([stage1, stage2]);
    const session = buildSession();
    setDialecticStateValues({
      currentProjectDetail: buildProject(session, processTemplate),
      activeSessionDetail: session,
      activeContextSessionId: sessionId,
      activeContextStage: stage1,
      currentProcessTemplate: processTemplate,
      recipesByStageSlug: {
        thesis: buildMinimalRecipe('thesis'),
        antithesis: buildRecipeWithFirstStep('antithesis'),
      },
      stageRunProgress: {
        [progressKey]: emptyStageRunProgressSnapshot,
        [antithesisProgressKey]: emptyStageRunProgressSnapshot,
      },
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeDisabled();
  });


  it('button has animate-pulse class when enabled and stage has not been submitted for current iteration', () => {
    setupVisibleButtonState();
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    expect(trigger).toHaveClass('animate-pulse');
  });

  it('button does NOT have animate-pulse class when isSubmitting is true', () => {
    setupVisibleButtonState();
    setDialecticStateValues({ isSubmittingStageResponses: true });
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submitting/i });
    expect(trigger).not.toHaveClass('animate-pulse');
  });

  it('button does NOT have animate-pulse class after successful submission', async () => {
    const stage1 = buildStage('stage-1', 'thesis', 'Thesis');
    const stage2 = buildStage('stage-2', 'antithesis', 'Antithesis');
    const processTemplate = buildProcessTemplate([stage1, stage2]);
    setupVisibleButtonState();
    const { submitStageResponses } = getDialecticStoreState();
    vi.mocked(submitStageResponses).mockResolvedValue({
      data: { updatedSession: buildSession(), message: 'ok' },
      error: undefined,
      status: 200,
    });
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    await act(async () => {
      fireEvent.click(trigger);
    });
    const continueBtn = await screen.findByRole('button', { name: 'Continue' });
    await act(async () => {
      fireEvent.click(continueBtn);
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    await act(async () => {
      const advancedSession: DialecticSession = {
        ...buildSession(),
        current_stage_id: stage2.id,
        viewing_stage_id: stage2.id,
      };
      const project = buildProject(advancedSession, processTemplate);
      setDialecticStateValues({
        activeSessionDetail: advancedSession,
        currentProjectDetail: project,
        viewingStageSlug: stage2.slug,
        activeContextStage: stage2,
      });
    });
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeDisabled();
  });

  it('renders card-footer container with data-testid="card-footer" when all conditions met', () => {
    setupVisibleButtonState();
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
  });

  it('renders "Submit Responses & Advance Stage" button text', () => {
    setupVisibleButtonState();
    render(<SubmitResponsesButton />);
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeInTheDocument();
  });

  it('button is disabled when isSubmittingStageResponses is true', () => {
    setupVisibleButtonState();
    setDialecticStateValues({ isSubmittingStageResponses: true });
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submitting/i });
    expect(trigger).toBeDisabled();
  });

  it('button shows Loader2 spinner and "Submitting..." text when isSubmittingStageResponses is true', () => {
    setupVisibleButtonState();
    setDialecticStateValues({ isSubmittingStageResponses: true });
    render(<SubmitResponsesButton />);
    expect(screen.getByText('Submitting...')).toBeInTheDocument();
  });

  it('clicking button opens AlertDialog confirmation modal', async () => {
    setupVisibleButtonState();
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    await act(async () => {
      fireEvent.click(trigger);
    });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('confirmation dialog shows title "Submit and Advance?"', async () => {
    setupVisibleButtonState();
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    await act(async () => {
      fireEvent.click(trigger);
    });
    expect(screen.getByText('Submit and Advance?')).toBeInTheDocument();
  });

  it('confirmation dialog shows description about saving edits and feedback', async () => {
    setupVisibleButtonState();
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    await act(async () => {
      fireEvent.click(trigger);
    });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    const description = screen.getByText(/save|edits|feedback/i);
    expect(description).toBeInTheDocument();
  });

  it('confirmation dialog shows unsaved items count when hasUnsavedEdits or hasUnsavedFeedback is true', async () => {
    setupVisibleButtonState();
    setDialecticStateValues({
      stageDocumentContent: {
        [`${sessionId}:${stageSlug}:${iterationNumber}:model-1:doc1`]: buildStageDocumentContent({
          currentDraftMarkdown: 'edit',
          isDirty: true,
          feedbackDraftMarkdown: 'feedback',
          feedbackIsDirty: true,
        }),
      },
    });
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    await act(async () => {
      fireEvent.click(trigger);
    });
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/unsaved|will be saved/i)).toBeInTheDocument();
  });

  it('clicking Cancel button in dialog closes dialog without calling submitStageResponses', async () => {
    setupVisibleButtonState();
    const { submitStageResponses } = getDialecticStoreState();
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    await act(async () => {
      fireEvent.click(trigger);
    });
    const cancelBtn = await screen.findByRole('button', { name: 'Cancel' });
    await act(async () => {
      fireEvent.click(cancelBtn);
    });
    expect(vi.mocked(submitStageResponses)).not.toHaveBeenCalled();
  });

  it('clicking Continue button in dialog calls submitStageResponses with correct payload { sessionId, currentIterationNumber, projectId, stageSlug }', async () => {
    setupVisibleButtonState();
    const { submitStageResponses } = getDialecticStoreState();
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    await act(async () => {
      fireEvent.click(trigger);
    });
    const continueBtn = await screen.findByRole('button', { name: 'Continue' });
    await act(async () => {
      fireEvent.click(continueBtn);
    });
    await waitFor(() => {
      expect(vi.mocked(submitStageResponses)).toHaveBeenCalledWith({
        sessionId,
        currentIterationNumber: iterationNumber,
        projectId,
        stageSlug,
      });
    });
  });

  it('displays submitStageResponsesError in Alert when present', () => {
    setupVisibleButtonState();
    setDialecticStateValues({
      submitStageResponsesError: { code: 'ERR', message: 'Submit failed' },
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByText('Submit failed')).toBeInTheDocument();
  });

  it('shows success toast on successful submission', async () => {
    setupVisibleButtonState();
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    await act(async () => {
      fireEvent.click(trigger);
    });
    const continueBtn = await screen.findByRole('button', { name: 'Continue' });
    await act(async () => {
      fireEvent.click(continueBtn);
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Stage advanced!');
    });
  });

  it('shows error toast when submitStageResponses returns error', async () => {
    setupVisibleButtonState();
    const { submitStageResponses } = getDialecticStoreState();
    vi.mocked(submitStageResponses).mockResolvedValue({
      data: undefined,
      error: { code: 'ERR', message: 'Network error' },
      status: 500,
    });
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    await act(async () => {
      fireEvent.click(trigger);
    });
    const continueBtn = await screen.findByRole('button', { name: 'Continue' });
    await act(async () => {
      fireEvent.click(continueBtn);
    });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Network error');
    });
  });

  it('renders button when current stage complete, next stage not started, not final stage, no active jobs', () => {
    setupVisibleButtonState();
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeInTheDocument();
  });

  it('renders disabled button when canAdvance is false (next stage already has generated documents)', () => {
    const stage1 = buildStage('stage-1', 'thesis', 'Thesis');
    const stage2 = buildStage('stage-2', 'antithesis', 'Antithesis');
    const processTemplate = buildProcessTemplate([stage1, stage2]);
    const session = buildSession();
    const project = buildProject(session, processTemplate);
    const antithesisRecipe: DialecticStageRecipe = {
      stageSlug: 'antithesis',
      instanceId: 'inst-1',
      steps: [
        {
          id: 'step-1',
          step_key: 'step-1',
          step_slug: 'step-1',
          step_name: 'Step',
          execution_order: 1,
          job_type: 'RENDER',
          prompt_type: 'Turn',
          output_type: 'rendered_document',
          granularity_strategy: 'all_to_one',
          inputs_required: [],
          outputs_required: [
            { document_key: 'doc', artifact_class: 'rendered_document', file_type: 'markdown' },
          ],
        },
      ],
      edges: [],
    };
    setDialecticStateValues({
      currentProjectDetail: project,
      activeSessionDetail: session,
      activeContextSessionId: sessionId,
      currentProcessTemplate: processTemplate,
      activeContextStage: stage1,
      viewingStageSlug: stage1.slug,
      recipesByStageSlug: {
        thesis: buildThesisRecipeWithDocumentKey('success_metrics'),
        antithesis: antithesisRecipe,
      },
      stageRunProgress: {
        [progressKey]: {
          progress: { totalSteps: 1, completedSteps: 1, failedSteps: 0 },
          stepStatuses: { 'step-1': 'completed' },
          documents: {
            ['success_metrics:model-1']: buildRenderedDescriptor('model-1', 'res-1'),
          },
          jobProgress: {},
          jobs: [
            buildJobProgressDto({
              id: 'job-1',
              status: 'completed',
              documentKey: 'success_metrics',
              modelId: 'model-1',
            }),
          ],
        },
        [antithesisProgressKey]: {
          progress: { totalSteps: 1, completedSteps: 1, failedSteps: 0 },
          stepStatuses: { 'step-1': 'completed' },
          documents: {
            ['doc:model-1']: buildRenderedDescriptor('model-1', 'res-1'),
          },
          jobProgress: {},
          jobs: [
            buildJobProgressDto({
              id: 'job-2',
              status: 'completed',
              documentKey: 'doc',
              modelId: 'model-1',
            }),
          ],
        },
      },
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeDisabled();
  });

  it('renders disabled button when canAdvance is false (next stage has progress)', () => {
    const stage1 = buildStage('stage-1', 'thesis', 'Thesis');
    const stage2 = buildStage('stage-2', 'antithesis', 'Antithesis');
    const processTemplate = buildProcessTemplate([stage1, stage2]);
    const session = buildSession();
    const project = buildProject(session, processTemplate);
    const antithesisRecipe: DialecticStageRecipe = {
      stageSlug: 'antithesis',
      instanceId: 'inst-1',
      steps: [
        {
          id: 'step-1',
          step_key: 'step-1',
          step_slug: 'step-1',
          step_name: 'Step',
          execution_order: 1,
          job_type: 'RENDER',
          prompt_type: 'Turn',
          output_type: 'rendered_document',
          granularity_strategy: 'all_to_one',
          inputs_required: [],
          outputs_required: [],
        },
      ],
      edges: [],
    };
    setDialecticStateValues({
      currentProjectDetail: project,
      activeSessionDetail: session,
      activeContextSessionId: sessionId,
      currentProcessTemplate: processTemplate,
      activeContextStage: stage1,
      viewingStageSlug: stage1.slug,
      recipesByStageSlug: {
        thesis: buildThesisRecipeWithDocumentKey('success_metrics'),
        antithesis: antithesisRecipe,
      },
      stageRunProgress: {
        [progressKey]: {
          progress: { totalSteps: 1, completedSteps: 1, failedSteps: 0 },
          stepStatuses: { 'step-1': 'completed' },
          documents: {
            ['success_metrics:model-1']: buildRenderedDescriptor('model-1', 'res-1'),
          },
          jobProgress: {},
          jobs: [
            buildJobProgressDto({
              id: 'job-1',
              status: 'completed',
              documentKey: 'success_metrics',
              modelId: 'model-1',
            }),
          ],
        },
        [antithesisProgressKey]: {
          progress: { totalSteps: 1, completedSteps: 0, failedSteps: 0 },
          stepStatuses: { 'step-1': 'in_progress' },
          documents: {},
          jobProgress: {},
          jobs: [],
        },
      },
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeDisabled();
  });

  it('renders disabled button when canAdvance is false (current stage has active jobs)', () => {
    setupVisibleButtonState();
    setDialecticStateValues({
      stageRunProgress: {
        [progressKey]: {
          progress: { totalSteps: 1, completedSteps: 0, failedSteps: 0 },
          stepStatuses: {},
          documents: {
            ['success_metrics:model-1']: buildRenderedDescriptor('model-1', 'res-1'),
          },
          jobProgress: {},
          jobs: [
            buildJobProgressDto({
              id: 'job-1',
              status: 'processing',
              documentKey: 'success_metrics',
              modelId: 'model-1',
            }),
          ],
        },
        [antithesisProgressKey]: emptyStageRunProgressSnapshot,
      },
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeDisabled();
  });

  it('renders disabled button when canAdvance is false (current stage has paused jobs)', () => {
    setupVisibleButtonState();
    setDialecticStateValues({
      stageRunProgress: {
        [progressKey]: {
          progress: { totalSteps: 1, completedSteps: 0, failedSteps: 0 },
          stepStatuses: { 'step-1': 'paused_user' },
          documents: {
            ['success_metrics:model-1']: buildRenderedDescriptor('model-1', 'res-1'),
          },
          jobProgress: {},
          jobs: [
            buildJobProgressDto({
              id: 'job-1',
              status: 'completed',
              documentKey: 'success_metrics',
              modelId: 'model-1',
            }),
          ],
        },
        [antithesisProgressKey]: emptyStageRunProgressSnapshot,
      },
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeDisabled();
  });

  it('after successful submitStageResponses, calls startContributionGeneration', async () => {
    setupVisibleButtonState();
    const { submitStageResponses } = getDialecticStoreState();
    vi.mocked(submitStageResponses).mockResolvedValue({
      data: { updatedSession: buildSession(), message: 'ok' },
      error: undefined,
      status: 200,
    });
    const startContributionGeneration = vi.fn().mockResolvedValue({ success: true });
    mockStartContributionGeneration.mockReturnValue({
      ...defaultStartContributionGenerationMock(),
      startContributionGeneration,
    });
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    await act(async () => {
      fireEvent.click(trigger);
    });
    const continueBtn = await screen.findByRole('button', { name: 'Continue' });
    await act(async () => {
      fireEvent.click(continueBtn);
    });
    await waitFor(() => {
      expect(startContributionGeneration).toHaveBeenCalled();
    });
  });

  it('when startContributionGeneration returns { success: false }, renders persistent Alert with actionable guidance', async () => {
    setupVisibleButtonState();
    const { submitStageResponses } = getDialecticStoreState();
    vi.mocked(submitStageResponses).mockResolvedValue({
      data: { updatedSession: buildSession(), message: 'ok' },
      error: undefined,
      status: 200,
    });
    mockStartContributionGeneration.mockReturnValue({
      ...defaultStartContributionGenerationMock(),
      startContributionGeneration: vi.fn().mockResolvedValue({ success: false }),
      areAnyModelsSelected: false,
    });
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    await act(async () => {
      fireEvent.click(trigger);
    });
    const continueBtn = await screen.findByRole('button', { name: 'Continue' });
    await act(async () => {
      fireEvent.click(continueBtn);
    });
    await waitFor(() => {
      expect(screen.getByText(/Select at least one AI model to begin generating this stage/i)).toBeInTheDocument();
    });
  });

  it('persistent Alert displays correct message when models not selected', async () => {
    setupVisibleButtonState();
    const { submitStageResponses } = getDialecticStoreState();
    vi.mocked(submitStageResponses).mockResolvedValue({
      data: { updatedSession: buildSession(), message: 'ok' },
      error: undefined,
      status: 200,
    });
    mockStartContributionGeneration.mockReturnValue({
      ...defaultStartContributionGenerationMock(),
      startContributionGeneration: vi.fn().mockResolvedValue({ success: false }),
      areAnyModelsSelected: false,
    });
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    await act(async () => {
      fireEvent.click(trigger);
    });
    const continueBtn = await screen.findByRole('button', { name: 'Continue' });
    await act(async () => {
      fireEvent.click(continueBtn);
    });
    await waitFor(() => {
      expect(screen.getByText('Select at least one AI model to begin generating this stage.')).toBeInTheDocument();
    });
  });

  it('persistent Alert displays correct message when wallet not ready', async () => {
    setupVisibleButtonState();
    const { submitStageResponses } = getDialecticStoreState();
    vi.mocked(submitStageResponses).mockResolvedValue({
      data: { updatedSession: buildSession(), message: 'ok' },
      error: undefined,
      status: 200,
    });
    mockStartContributionGeneration.mockReturnValue({
      ...defaultStartContributionGenerationMock(),
      startContributionGeneration: vi.fn().mockResolvedValue({ success: false }),
      isWalletReady: false,
    });
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    await act(async () => {
      fireEvent.click(trigger);
    });
    const continueBtn = await screen.findByRole('button', { name: 'Continue' });
    await act(async () => {
      fireEvent.click(continueBtn);
    });
    await waitFor(() => {
      expect(screen.getByText('Connect a wallet to begin generating this stage.')).toBeInTheDocument();
    });
  });

  it('persistent Alert displays correct message when balance below threshold', async () => {
    setupVisibleButtonState();
    const { submitStageResponses } = getDialecticStoreState();
    vi.mocked(submitStageResponses).mockResolvedValue({
      data: { updatedSession: buildSession(), message: 'ok' },
      error: undefined,
      status: 200,
    });
    mockStartContributionGeneration.mockReturnValue({
      ...defaultStartContributionGenerationMock(),
      startContributionGeneration: vi.fn().mockResolvedValue({ success: false }),
      balanceMeetsThreshold: false,
    });
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    await act(async () => {
      fireEvent.click(trigger);
    });
    const continueBtn = await screen.findByRole('button', { name: 'Continue' });
    await act(async () => {
      fireEvent.click(continueBtn);
    });
    await waitFor(() => {
      expect(screen.getByText(/Your wallet balance is below the minimum required for this stage/i)).toBeInTheDocument();
    });
  });

  it('persistent Alert is not rendered when auto-generation succeeds', async () => {
    setupVisibleButtonState();
    const { submitStageResponses } = getDialecticStoreState();
    vi.mocked(submitStageResponses).mockResolvedValue({
      data: { updatedSession: buildSession(), message: 'ok' },
      error: undefined,
      status: 200,
    });
    mockStartContributionGeneration.mockReturnValue({
      ...defaultStartContributionGenerationMock(),
      startContributionGeneration: vi.fn().mockResolvedValue({ success: true }),
    });
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    await act(async () => {
      fireEvent.click(trigger);
    });
    const continueBtn = await screen.findByRole('button', { name: 'Continue' });
    await act(async () => {
      fireEvent.click(continueBtn);
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    expect(screen.queryByText(/Select at least one AI model/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Connect a wallet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/wallet balance is below/i)).not.toBeInTheDocument();
  });
});
