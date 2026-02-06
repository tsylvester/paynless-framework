import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import {
  getDialecticStoreState,
  initializeMockDialecticState,
  setDialecticStateValues,
  selectIsStageReadyForSessionIteration,
} from '../../mocks/dialecticStore.mock';
import type {
  DialecticProject,
  DialecticSession,
  DialecticStage,
  DialecticProcessTemplate,
  DialecticStageTransition,
  StageRenderedDocumentDescriptor,
  StageDocumentContentState,
} from '@paynless/types';
import { SubmitResponsesButton } from './SubmitResponsesButton.tsx';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@paynless/store', async (importOriginal) => {
  const mock = await import('../../mocks/dialecticStore.mock');
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...mock,
    selectStageHasUnsavedChanges: actual.selectStageHasUnsavedChanges,
  };
});

const projectId = 'proj-1';
const sessionId = 'sess-1';
const stageSlug = 'thesis';
const iterationNumber = 1;
const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
const isoTimestamp = '2024-01-01T00:00:00.000Z';

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
    feedbackDraftMarkdown: '',
    feedbackIsDirty: false,
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

function setupVisibleButtonState(): void {
  const stage1 = buildStage('stage-1', 'thesis', 'Thesis');
  const stage2 = buildStage('stage-2', 'antithesis', 'Antithesis');
  const processTemplate = buildProcessTemplate([stage1, stage2]);
  const session = buildSession();
  const project = buildProject(session, processTemplate);

  setDialecticStateValues({
    currentProjectDetail: project,
    activeSessionDetail: session,
    currentProcessTemplate: processTemplate,
    activeContextStage: stage1,
    activeStageSlug: stage1.slug,
    stageRunProgress: {
      [progressKey]: {
        stepStatuses: {},
        documents: {
          [`success_metrics:model-1`]: buildRenderedDescriptor('model-1', 'res-1'),
        },
      },
    },
    isSubmittingStageResponses: false,
    submitStageResponsesError: null,
  });
  selectIsStageReadyForSessionIteration.mockReturnValue(true);
}

describe('SubmitResponsesButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeMockDialecticState();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it('does not render when project is null', () => {
    setDialecticStateValues({
      currentProjectDetail: null,
      activeSessionDetail: buildSession(),
      activeContextStage: buildStage('stage-1', stageSlug, 'Thesis'),
      currentProcessTemplate: buildProcessTemplate([buildStage('stage-1', stageSlug, 'Thesis')]),
    });
    selectIsStageReadyForSessionIteration.mockReturnValue(true);
    render(<SubmitResponsesButton />);
    expect(screen.queryByTestId('card-footer')).not.toBeInTheDocument();
  });

  it('does not render when session is null', () => {
    const stage = buildStage('stage-1', stageSlug, 'Thesis');
    setDialecticStateValues({
      currentProjectDetail: buildProject(buildSession(), buildProcessTemplate([stage])),
      activeSessionDetail: null,
      activeContextStage: stage,
      currentProcessTemplate: buildProcessTemplate([stage]),
    });
    selectIsStageReadyForSessionIteration.mockReturnValue(true);
    render(<SubmitResponsesButton />);
    expect(screen.queryByTestId('card-footer')).not.toBeInTheDocument();
  });

  it('does not render when activeStage is null', () => {
    const session = buildSession();
    const stage = buildStage('stage-1', stageSlug, 'Thesis');
    setDialecticStateValues({
      currentProjectDetail: buildProject(session, buildProcessTemplate([stage])),
      activeSessionDetail: session,
      activeContextStage: null,
      currentProcessTemplate: buildProcessTemplate([stage]),
    });
    selectIsStageReadyForSessionIteration.mockReturnValue(true);
    render(<SubmitResponsesButton />);
    expect(screen.queryByTestId('card-footer')).not.toBeInTheDocument();
  });

  it('does not render when selectIsStageReadyForSessionIteration returns false', () => {
    setupVisibleButtonState();
    selectIsStageReadyForSessionIteration.mockReturnValue(false);
    render(<SubmitResponsesButton />);
    expect(screen.queryByTestId('card-footer')).not.toBeInTheDocument();
  });

  it('does not render when isFinalStage is true (no outgoing transitions from activeStage)', () => {
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
          stepStatuses: {},
          documents: {
            ['doc:model-1']: buildRenderedDescriptor('model-1', 'res-1'),
          },
        },
      },
    });
    selectIsStageReadyForSessionIteration.mockReturnValue(true);
    render(<SubmitResponsesButton />);
    expect(screen.queryByTestId('card-footer')).not.toBeInTheDocument();
  });

  it('does not render when session has no contributions for current stage/iteration', () => {
    const stage1 = buildStage('stage-1', 'thesis', 'Thesis');
    const stage2 = buildStage('stage-2', 'antithesis', 'Antithesis');
    const processTemplate = buildProcessTemplate([stage1, stage2]);
    const session = buildSession();
    setDialecticStateValues({
      currentProjectDetail: buildProject(session, processTemplate),
      activeSessionDetail: session,
      activeContextStage: stage1,
      currentProcessTemplate: processTemplate,
      stageRunProgress: {},
    });
    selectIsStageReadyForSessionIteration.mockReturnValue(true);
    render(<SubmitResponsesButton />);
    expect(screen.queryByTestId('card-footer')).not.toBeInTheDocument();
  });

  it('button is disabled when selectStageProgressSummary.isComplete is false (stage incomplete)', () => {
    setupVisibleButtonState();
    setDialecticStateValues({
      stageRunProgress: {
        [progressKey]: {
          stepStatuses: {},
          documents: {
            ['doc:model-1']: {
              ...buildRenderedDescriptor('model-1', 'res-1'),
              status: 'generating',
              latestRenderedResourceId: '',
            },
          },
        },
      },
    });
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    expect(trigger).toBeDisabled();
  });

  it('button is NOT disabled when selectStageProgressSummary.isComplete is true (stage complete)', () => {
    setupVisibleButtonState();
    render(<SubmitResponsesButton />);
    const trigger = screen.getByRole('button', { name: /Submit Responses & Advance Stage/i });
    expect(trigger).not.toBeDisabled();
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
    const state = getDialecticStoreState();
    setDialecticStateValues({
      ...state,
      isSubmittingStageResponses: false,
    });
    render(<SubmitResponsesButton />);
    const newTrigger = screen.queryByRole('button', { name: /Submit Responses & Advance Stage/i });
    if (newTrigger) {
      expect(newTrigger).not.toHaveClass('animate-pulse');
    }
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

  it('shows "Unsaved work will be saved automatically" message when hasUnsavedEdits or hasUnsavedFeedback is true', () => {
    setupVisibleButtonState();
    setDialecticStateValues({
      stageDocumentContent: {
        [`${sessionId}:${stageSlug}:${iterationNumber}:model-1:doc1`]: buildStageDocumentContent({
          currentDraftMarkdown: 'x',
          isDirty: true,
        }),
      },
    });
    render(<SubmitResponsesButton />);
    expect(screen.getByText(/Unsaved work will be saved automatically/i)).toBeInTheDocument();
  });

  it('calls setActiveStage with next stage slug on successful submission', async () => {
    setupVisibleButtonState();
    const { submitStageResponses, setActiveStage } = getDialecticStoreState();
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
      expect(vi.mocked(setActiveStage)).toHaveBeenCalledWith('antithesis');
    });
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
});
