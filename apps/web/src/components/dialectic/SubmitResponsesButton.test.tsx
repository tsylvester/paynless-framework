import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import {
  mockDialecticProcessTemplate,
  mockDialecticProject,
  mockDialecticStage,
  mockDialecticStageRecipe,
  mockDialecticStageRecipeStep,
  mockDialecticStageTransition,
  mockJobProgressDto,
  mockSession,
  mockStageDocumentContentState,
  mockStageRenderedDocumentDescriptor,
  mockStageRunProgressSnapshot,
  getDialecticStoreState,
  initializeMockDialecticState,
  setDialecticStateValues,
} from '../../mocks/dialecticStore.mock';
import type {
  DialecticProcessTemplate,
  DialecticProject,
  DialecticSession,
  DialecticStageRecipe,
  StageRunProgressSnapshot,
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

const stageThesis = mockDialecticStage({
  id: 'stage-1',
  slug: 'thesis',
  display_name: 'Thesis',
  description: '',
  default_system_prompt_id: null,
  created_at: isoTimestamp,
  minimum_balance: 0,
});

const stageAntithesis = mockDialecticStage({
  id: 'stage-2',
  slug: 'antithesis',
  display_name: 'Antithesis',
  description: '',
  default_system_prompt_id: null,
  created_at: isoTimestamp,
  minimum_balance: 0,
});

const twoStageProcessTemplate = mockDialecticProcessTemplate({
  id: 'template-1',
  name: 'Template',
  description: '',
  created_at: isoTimestamp,
  starting_stage_id: 'stage-1',
  stages: [stageThesis, stageAntithesis],
  transitions: [
    mockDialecticStageTransition({
      id: 'trans-1',
      process_template_id: 'template-1',
      source_stage_id: 'stage-1',
      target_stage_id: 'stage-2',
      created_at: isoTimestamp,
    }),
  ],
});

const singleStageThesisTemplate = mockDialecticProcessTemplate({
  id: 'template-1',
  name: 'Template',
  description: '',
  created_at: isoTimestamp,
  starting_stage_id: 'stage-1',
  stages: [stageThesis],
  transitions: [],
});

const testSession = mockSession({
  id: sessionId,
  project_id: projectId,
  session_description: 'Session',
  iteration_count: iterationNumber,
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  current_stage_id: 'stage-1',
  viewing_stage_id: 'stage-1',
  selected_models: [],
});

const emptyStageProgress = mockStageRunProgressSnapshot({
  documents: {},
  stepStatuses: {},
  jobs: [],
  jobProgress: {},
  progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
});

const thesisRecipeWithDocumentKey = (documentKey: string): DialecticStageRecipe =>
  mockDialecticStageRecipe({
    stageSlug: 'thesis',
    steps: [
      mockDialecticStageRecipeStep({
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
      }),
    ],
  });

const antithesisFirstStepRecipe = mockDialecticStageRecipe({
  stageSlug: 'antithesis',
  steps: [
    mockDialecticStageRecipeStep({
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
    }),
  ],
});

const antithesisRecipeWithDocOutput = mockDialecticStageRecipe({
  stageSlug: 'antithesis',
  steps: [
    mockDialecticStageRecipeStep({
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
    }),
  ],
});

const minimalThesisRecipe = mockDialecticStageRecipe({
  stageSlug: 'thesis',
  steps: [],
  edges: [],
});

const renderedDescriptor = (
  modelId: string,
  latestRenderedResourceId: string,
): ReturnType<typeof mockStageRenderedDocumentDescriptor> =>
  mockStageRenderedDocumentDescriptor({
    status: 'completed',
    job_id: `job-${modelId}`,
    latestRenderedResourceId,
    modelId,
    versionHash: `hash-${modelId}`,
    lastRenderedResourceId: latestRenderedResourceId,
    lastRenderAtIso: isoTimestamp,
  });

const completedThesisProgress = (
  documentKey: string,
  jobId: string,
): StageRunProgressSnapshot =>
  mockStageRunProgressSnapshot({
    progress: { totalSteps: 1, completedSteps: 1, failedSteps: 0 },
    stepStatuses: { 'step-1': 'completed' },
    documents: {
      [`${documentKey}:model-1`]: renderedDescriptor('model-1', 'res-1'),
    },
    jobProgress: {},
    jobs: [
      mockJobProgressDto({
        id: jobId,
        status: 'completed',
        documentKey,
        modelId: 'model-1',
        jobType: 'RENDER',
        stepKey: 'step-1',
        createdAt: isoTimestamp,
        startedAt: isoTimestamp,
        completedAt: isoTimestamp,
      }),
    ],
  });

const projectFor = (
  session: DialecticSession,
  processTemplate: DialecticProcessTemplate,
): DialecticProject =>
  mockDialecticProject({
    id: projectId,
    project_name: 'Project',
    initial_user_prompt: null,
    selected_domain_id: 'domain-1',
    dialectic_domains: { name: 'Software Development' },
    created_at: isoTimestamp,
    updated_at: isoTimestamp,
    dialectic_sessions: [session],
    process_template_id: processTemplate.id,
    dialectic_process_templates: processTemplate,
  });

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
    isViewingAheadOfCurrentStage: false,
    viewingAheadReason: null,
  };
}

function setupVisibleButtonState(): void {
  setDialecticStateValues({
    currentProjectDetail: projectFor(testSession, twoStageProcessTemplate),
    activeSessionDetail: testSession,
    activeContextSessionId: sessionId,
    currentProcessTemplate: twoStageProcessTemplate,
    activeContextStage: stageThesis,
    viewingStageSlug: stageThesis.slug,
    recipesByStageSlug: {
      thesis: thesisRecipeWithDocumentKey('success_metrics'),
      antithesis: antithesisFirstStepRecipe,
    },
    stageRunProgress: {
      [progressKey]: completedThesisProgress('success_metrics', 'job-1'),
      [antithesisProgressKey]: emptyStageProgress,
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
      activeSessionDetail: testSession,
      activeContextStage: stageThesis,
      currentProcessTemplate: singleStageThesisTemplate,
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeDisabled();
  });

  it('renders disabled button when canAdvance is false (session null)', () => {
    setDialecticStateValues({
      currentProjectDetail: projectFor(testSession, singleStageThesisTemplate),
      activeSessionDetail: null,
      activeContextStage: stageThesis,
      currentProcessTemplate: singleStageThesisTemplate,
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeDisabled();
  });

  it('renders disabled button when canAdvance is false (final stage, no next stage)', () => {
    setDialecticStateValues({
      currentProjectDetail: projectFor(testSession, singleStageThesisTemplate),
      activeSessionDetail: testSession,
      activeContextStage: stageThesis,
      currentProcessTemplate: singleStageThesisTemplate,
      stageRunProgress: {
        [progressKey]: mockStageRunProgressSnapshot({
          progress: { totalSteps: 1, completedSteps: 0, failedSteps: 0 },
          stepStatuses: {},
          documents: {
            ['doc:model-1']: renderedDescriptor('model-1', 'res-1'),
          },
          jobProgress: {},
          jobs: [
            mockJobProgressDto({
              id: 'job-1',
              status: 'completed',
              documentKey: 'doc',
              modelId: 'model-1',
              jobType: 'RENDER',
              stepKey: 'step-1',
              createdAt: isoTimestamp,
              startedAt: isoTimestamp,
              completedAt: isoTimestamp,
            }),
          ],
        }),
      },
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeDisabled();
  });

  it('renders disabled button when canAdvance is false (user on final stage of multi-stage process)', () => {
    setDialecticStateValues({
      currentProjectDetail: projectFor(testSession, twoStageProcessTemplate),
      activeSessionDetail: testSession,
      activeContextSessionId: sessionId,
      activeContextStage: stageAntithesis,
      viewingStageSlug: stageAntithesis.slug,
      currentProcessTemplate: twoStageProcessTemplate,
      recipesByStageSlug: {
        thesis: minimalThesisRecipe,
        antithesis: antithesisFirstStepRecipe,
      },
      stageRunProgress: {
        [progressKey]: emptyStageProgress,
        [antithesisProgressKey]: emptyStageProgress,
      },
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeDisabled();
  });

  it('renders disabled button when canAdvance is false (viewed stage does not match app current stage)', () => {
    const session: DialecticSession = {
      ...testSession,
      current_stage_id: stageThesis.id,
      viewing_stage_id: stageAntithesis.id,
    };
    setDialecticStateValues({
      currentProjectDetail: projectFor(session, twoStageProcessTemplate),
      activeSessionDetail: session,
      activeContextSessionId: sessionId,
      currentProcessTemplate: twoStageProcessTemplate,
      activeContextStage: stageThesis,
      viewingStageSlug: stageThesis.slug,
      recipesByStageSlug: {
        thesis: thesisRecipeWithDocumentKey('success_metrics'),
        antithesis: antithesisFirstStepRecipe,
      },
      stageRunProgress: {
        [progressKey]: completedThesisProgress('success_metrics', 'job-1'),
        [antithesisProgressKey]: emptyStageProgress,
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
    setDialecticStateValues({
      currentProjectDetail: projectFor(testSession, twoStageProcessTemplate),
      activeSessionDetail: testSession,
      activeContextSessionId: sessionId,
      activeContextStage: stageThesis,
      currentProcessTemplate: twoStageProcessTemplate,
      recipesByStageSlug: {
        thesis: minimalThesisRecipe,
        antithesis: antithesisFirstStepRecipe,
      },
      stageRunProgress: {
        [progressKey]: emptyStageProgress,
        [antithesisProgressKey]: emptyStageProgress,
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
    setupVisibleButtonState();
    const { submitStageResponses } = getDialecticStoreState();
    vi.mocked(submitStageResponses).mockResolvedValue({
      data: { updatedSession: testSession, message: 'ok' },
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
        ...testSession,
        current_stage_id: stageAntithesis.id,
        viewing_stage_id: stageAntithesis.id,
      };
      setDialecticStateValues({
        activeSessionDetail: advancedSession,
        currentProjectDetail: projectFor(advancedSession, twoStageProcessTemplate),
        viewingStageSlug: stageAntithesis.slug,
        activeContextStage: stageAntithesis,
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
        [`${sessionId}:${stageSlug}:${iterationNumber}:model-1:doc1`]: mockStageDocumentContentState({
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
    setDialecticStateValues({
      currentProjectDetail: projectFor(testSession, twoStageProcessTemplate),
      activeSessionDetail: testSession,
      activeContextSessionId: sessionId,
      currentProcessTemplate: twoStageProcessTemplate,
      activeContextStage: stageThesis,
      viewingStageSlug: stageThesis.slug,
      recipesByStageSlug: {
        thesis: thesisRecipeWithDocumentKey('success_metrics'),
        antithesis: antithesisRecipeWithDocOutput,
      },
      stageRunProgress: {
        [progressKey]: completedThesisProgress('success_metrics', 'job-1'),
        [antithesisProgressKey]: mockStageRunProgressSnapshot({
          progress: { totalSteps: 1, completedSteps: 1, failedSteps: 0 },
          stepStatuses: { 'step-1': 'completed' },
          documents: {
            ['doc:model-1']: renderedDescriptor('model-1', 'res-1'),
          },
          jobProgress: {},
          jobs: [
            mockJobProgressDto({
              id: 'job-2',
              status: 'completed',
              documentKey: 'doc',
              modelId: 'model-1',
              jobType: 'RENDER',
              stepKey: 'step-1',
              createdAt: isoTimestamp,
              startedAt: isoTimestamp,
              completedAt: isoTimestamp,
            }),
          ],
        }),
      },
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Responses & Advance Stage/i })).toBeDisabled();
  });

  it('renders disabled button when canAdvance is false (next stage has progress)', () => {
    setDialecticStateValues({
      currentProjectDetail: projectFor(testSession, twoStageProcessTemplate),
      activeSessionDetail: testSession,
      activeContextSessionId: sessionId,
      currentProcessTemplate: twoStageProcessTemplate,
      activeContextStage: stageThesis,
      viewingStageSlug: stageThesis.slug,
      recipesByStageSlug: {
        thesis: thesisRecipeWithDocumentKey('success_metrics'),
        antithesis: antithesisFirstStepRecipe,
      },
      stageRunProgress: {
        [progressKey]: completedThesisProgress('success_metrics', 'job-1'),
        [antithesisProgressKey]: mockStageRunProgressSnapshot({
          progress: { totalSteps: 1, completedSteps: 0, failedSteps: 0 },
          stepStatuses: { 'step-1': 'in_progress' },
          documents: {},
          jobProgress: {},
          jobs: [],
        }),
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
            ['success_metrics:model-1']: renderedDescriptor('model-1', 'res-1'),
          },
          jobProgress: {},
          jobs: [
            mockJobProgressDto({
              id: 'job-1',
              status: 'processing',
              documentKey: 'success_metrics',
              modelId: 'model-1',
            }),
          ],
        },
        [antithesisProgressKey]: mockStageRunProgressSnapshot(),
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
            ['success_metrics:model-1']: renderedDescriptor('model-1', 'res-1'),
          },
          jobProgress: {},
          jobs: [
            mockJobProgressDto({
              id: 'job-1',
              status: 'completed',
              documentKey: 'success_metrics',
              modelId: 'model-1',
            }),
          ],
        },
        [antithesisProgressKey]: emptyStageProgress,
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
      data: { updatedSession: testSession, message: 'ok' },
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
      data: { updatedSession: testSession, message: 'ok' },
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
      data: { updatedSession: testSession, message: 'ok' },
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
      data: { updatedSession: testSession, message: 'ok' },
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
      data: { updatedSession: testSession, message: 'ok' },
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
      data: { updatedSession: testSession, message: 'ok' },
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
