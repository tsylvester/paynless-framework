import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom'; // Still useful for DOM assertions
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'sonner'; // Import the mocked toast
import { GenerateContributionButton } from './GenerateContributionButton';
import type {
  DialecticStage,
  DialecticContribution,
  DialecticProject,
  DialecticSession,
  DialecticStateValues,
  DialecticProcessTemplate,
  SelectedModels,
  StageDAGProgressDialogProps,
  UseStartContributionGenerationReturn,
} from '@paynless/types';

// Import utilities from the actual mock file
import { 
  initializeMockDialecticState, 
  getDialecticStoreState
} from '@/mocks/dialecticStore.mock';
import { selectActiveChatWalletInfo } from '@/mocks/walletStore.mock';

import { useDialecticStore, initialDialecticStateValues, selectIsStageReadyForSessionIteration } from '@paynless/store';

const mockUseStartContributionGeneration = vi.fn<[], UseStartContributionGenerationReturn>();

vi.mock('@/hooks/useStartContributionGeneration', () => ({
  useStartContributionGeneration: () => mockUseStartContributionGeneration(),
}));

// Mock the actual store path to use exports from our mock file
vi.mock('@paynless/store', async () => {
  const mockStoreExports = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
  const actualPaynlessStore = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
  const walletStoreMock = await vi.importActual<typeof import('@/mocks/walletStore.mock')>('@/mocks/walletStore.mock');

  // Use real selectSelectedModels so component reads state.selectedModels.
  const selectSelectedModels = actualPaynlessStore.selectSelectedModels;
  
  const selectViewingStage = (state: DialecticStateValues): DialecticStage | null => {
    const { currentProjectDetail, viewingStageSlug } = state;
    if (!currentProjectDetail || !viewingStageSlug || !currentProjectDetail.dialectic_process_templates) return null;
    const processTemplate: DialecticProcessTemplate = currentProjectDetail.dialectic_process_templates;
    return processTemplate.stages?.find((s: DialecticStage) => s.slug === viewingStageSlug) || null;
  };

  const useAiStore = (selector: (state: { continueUntilComplete: boolean; newChatContext: string | null }) => unknown) => {
    const state = {
      continueUntilComplete: false,
      newChatContext: 'personal',
      // Add other properties from useAiStore that are needed for tests
    };
    return selector(state);
  };
  
  return {
    ...mockStoreExports,
    // Expose wallet store hook and selector for component under test
    useWalletStore: walletStoreMock.useWalletStore,
    selectActiveChatWalletInfo: walletStoreMock.selectActiveChatWalletInfo,
    useAiStore,
    initialDialecticStateValues: actualPaynlessStore.initialDialecticStateValues,
    // Pass through wallet state defaults required by the wallet mock itself
    initialWalletStateValues: actualPaynlessStore.initialWalletStateValues,
    selectSessionById: actualPaynlessStore.selectSessionById, // This selector is simple enough to work with our mock state
    selectSelectedModels,
    selectViewingStage, // Use our test-specific implementation
    // Add the new selector to our mocks
    selectIsStageReadyForSessionIteration: vi.fn(),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('./StageDAGProgressDialog', async () => {
  const React = await import('react');
  const mockImpl = vi.fn((props: StageDAGProgressDialogProps) =>
    props.open
      ? React.createElement('div', {
          'data-testid': 'stage-dag-progress-dialog',
          'data-stage-slug': props.stageSlug,
          'data-session-id': props.sessionId,
          'data-iteration-number': String(props.iterationNumber),
        })
      : null,
  );
  return { StageDAGProgressDialog: mockImpl };
});

const renderWithRouter = (ui: React.ReactElement) =>
  render(ui, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>{children}</MemoryRouter>
    ),
  });

const mockThesisStage: DialecticStage = {
  id: 'stage-1',
  slug: 'thesis',
  display_name: 'Proposal',
  description: 'Initial hypothesis generation',
  default_system_prompt_id: 'prompt-1',
  created_at: new Date().toISOString(),
  expected_output_template_ids: [],
  recipe_template_id: null,
  active_recipe_instance_id: null,
  minimum_balance: 100000,
};

// Helper to create a complete DialecticProject mock
const createMockProject = (
  projectId: string, 
  sessions: DialecticSession[] = [],
  stages: DialecticStage[] = [mockThesisStage] // Add stages to mock
): DialecticProject => ({
  id: projectId,
  user_id: `user-${projectId}`,
  project_name: `${projectId} Name`,
  initial_user_prompt: `Prompt for ${projectId}`,
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  dialectic_sessions: sessions,
  dialectic_domains: {name: 'Domain 1'},
  isLoadingProcessTemplate: false,
  processTemplateError: null,
  initial_prompt_resource_id: null,
  selected_domain_id: `domain-${projectId}`,
  selected_domain_overlay_id: null,
  repo_url: null,
  dialectic_process_templates: {
    name: 'Process Template 1', 
    created_at: new Date().toISOString(), 
    description: 'Description 1', 
    id: 'process-template-1', 
    starting_stage_id: 'stage-1',
    stages: stages, // Correctly use 'stages'
  },
  contributionGenerationStatus: 'idle',
  generateContributionsError: null,
  isSubmittingStageResponses: false,
  submitStageResponsesError: null,
  isSavingContributionEdit: false,
  saveContributionEditError: null,
});

// Helper to create a complete DialecticSession mock
const createMockSession = (
  sessionId: string,
  projectId: string,
  iteration: number,
  contributions: DialecticContribution[] = []
): DialecticSession => ({
  id: sessionId,
  project_id: projectId,
  session_description: `Session ${sessionId} for ${projectId}`,
  user_input_reference_url: null,
  iteration_count: iteration,
  selected_models: [],
  status: 'active',
  associated_chat_id: null,
  current_stage_id: mockThesisStage.id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  dialectic_contributions: contributions,
  dialectic_session_models: [],
  viewing_stage_id: 'stage-1',
});

// SelectedModels fixtures for store state (component uses selectSelectedModels)
const oneSelectedModel: SelectedModels[] = [{ id: 'model-1', displayName: 'Model 1' }];

function getDefaultHookReturn(
  overrides: Partial<UseStartContributionGenerationReturn> = {}
): UseStartContributionGenerationReturn {
  const defaultSession = createMockSession('test-session-id', 'test-project-id', 1);
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
    viewingStage: mockThesisStage,
    activeSession: defaultSession,
    stageThreshold: mockThesisStage.minimum_balance,
    isViewingAheadOfCurrentStage: false,
    viewingAheadReason: null,
    ...overrides,
  };
}

// Helper to set the state of the dialecticStore mock
const setDialecticStateValues = (state: Partial<DialecticStateValues>) => {
  useDialecticStore.setState({
    ...initialDialecticStateValues,
    // Ensure generatingSessions is initialized for all tests
    generatingSessions: {},
    ...state,
  });
};

describe('GenerateContributionButton', () => {
  beforeEach(() => {
    initializeMockDialecticState();
    const defaultSession = createMockSession('test-session-id', 'test-project-id', 1);
    const defaultProject = createMockProject('test-project-id', [defaultSession]);
    setDialecticStateValues({
      selectedModels: oneSelectedModel,
      currentProjectDetail: defaultProject,
      activeContextSessionId: 'test-session-id',
      viewingStageSlug: 'thesis',
      contributionGenerationStatus: 'idle',
    });
    mockUseStartContributionGeneration.mockReturnValue(getDefaultHookReturn());
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.info).mockClear();

    const thesisMinBalance = mockThesisStage.minimum_balance;
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue({
      status: 'ok',
      type: 'personal',
      walletId: 'default-wallet-id',
      orgId: null,
      balance: String(thesisMinBalance),
      isLoadingPrimaryWallet: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks(); // Clear all mocks, including vi.fn() from the store if necessary
  });

  it('renders "Generate [StageName]" when models are selected and no other conditions met', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Generate Proposal/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('renders "Choose AI Models" and is disabled when no models are selected', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ areAnyModelsSelected: false, isDisabled: true })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Choose AI Models/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is disabled and shows "Stage Not Ready" when no active stage is selected', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ activeSession: null, isDisabled: true })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Stage Not Ready/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is disabled and shows "Previous Stage Incomplete" when the stage is not ready', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ isStageReady: false, isDisabled: true })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Previous Stage Incomplete/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders "Regenerate [StageName]" when contributions for current stage and iteration exist', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        contributionsForStageAndIterationExist: true,
        isDisabled: false,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Regenerate Proposal/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('when isPauseMode is true, button shows "Pause [StageName]" with pause icon and is not disabled (for pause action)', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        isSessionGenerating: true,
        isPauseMode: true,
        isDisabled: false,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Pause');
    expect(button).toHaveTextContent('Proposal');
    expect(button).not.toBeDisabled();
  });

  it('renders "Regenerate [StageName]" when contributions for the current stage/iteration already exist', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        contributionsForStageAndIterationExist: true,
        isDisabled: false,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Regenerate Proposal/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });


  it('is disabled when the active stage cannot be found from the store', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ stageThreshold: undefined })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is disabled and shows "Choose AI Models" when no models selected, overriding "Regenerate" label', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        areAnyModelsSelected: false,
        contributionsForStageAndIterationExist: true,
        isDisabled: true,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Choose AI Models/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Regenerate Proposal/i })).not.toBeInTheDocument();
  });

  it('handles currentProjectDetail being null gracefully by being disabled', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ stageThreshold: undefined })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is disabled when no active wallet is available', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ isWalletReady: false, isDisabled: true })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('reacts to chat context: personal wallet makes button enabled', () => {
    // Stage is ready
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);

    // Selector returns ok only when ctx === 'personal'; otherwise loading
    const thesisMinBalance = mockThesisStage.minimum_balance;
    vi.mocked(selectActiveChatWalletInfo).mockImplementation((state, ctx) => {
      void state;
      if (ctx === 'personal') {
        return {
          status: 'ok',
          type: 'personal',
          walletId: 'personal-wallet',
          orgId: null,
          balance: String(thesisMinBalance),
          isLoadingPrimaryWallet: false,
        };
      }
      return {
        status: 'loading',
        type: null,
        walletId: null,
        orgId: null,
        balance: null,
        isLoadingPrimaryWallet: true,
        message: 'Determining wallet policy and consent...',
      };
    });

    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Generate Proposal/i })).not.toBeDisabled();
  });

  it('handleClick calls hook\'s startContributionGeneration with an onOpenDagProgress callback', async () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    const startContributionGeneration = vi.fn().mockResolvedValue({ success: true });
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ startContributionGeneration })
    );
    const user = userEvent.setup();
    renderWithRouter(<GenerateContributionButton />);
    const button = screen.getByRole('button', { name: /Generate Proposal/i });
    await user.click(button);
    await waitFor(() => {
      expect(startContributionGeneration).toHaveBeenCalledTimes(1);
      expect(startContributionGeneration).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  it('onOpenDagProgress callback sets dagDialogOpen to true', async () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    let capturedCallback: (() => void) | undefined;
    const startContributionGeneration = vi.fn().mockImplementation(async (cb) => {
      capturedCallback = cb;
      return { success: true };
    });
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ startContributionGeneration })
    );
    const user = userEvent.setup();
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.queryByTestId('stage-dag-progress-dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Generate Proposal/i }));
    expect(capturedCallback).toBeDefined();
    act(() => {
      capturedCallback?.();
    });
    await waitFor(() => {
      expect(screen.getByTestId('stage-dag-progress-dialog')).toBeInTheDocument();
    });
  });

  it('when shouldOpenDagProgress becomes true, dagDialogOpen is set to true and setShouldOpenDagProgress(false) is called', async () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(getDefaultHookReturn());
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.queryByTestId('stage-dag-progress-dialog')).not.toBeInTheDocument();
    const setShouldOpenDagProgress = getDialecticStoreState().setShouldOpenDagProgress;
    act(() => {
      useDialecticStore.setState({ shouldOpenDagProgress: true });
    });
    await waitFor(() => {
      expect(screen.getByTestId('stage-dag-progress-dialog')).toBeInTheDocument();
    });
    expect(vi.mocked(setShouldOpenDagProgress)).toHaveBeenCalledWith(false);
  });

  it('isDisabled prop on button reflects hook\'s isDisabled value', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(getDefaultHookReturn({ isDisabled: true }));
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('button text is computed correctly from hook\'s derived state values', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        isSessionGenerating: false,
        areAnyModelsSelected: true,
        isWalletReady: true,
        isStageReady: true,
        hasPausedNsfJobs: false,
        balanceMeetsThreshold: true,
        isResumeMode: false,
        didGenerationFail: false,
        contributionsForStageAndIterationExist: false,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Generate Proposal/i })).toBeInTheDocument();
  });

  it('StageDAGProgressDialog renders with correct props when dagDialogOpen is true', async () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    const startContributionGeneration = vi.fn().mockImplementation(async (cb) => {
      cb?.();
      return { success: true };
    });
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ startContributionGeneration })
    );
    const user = userEvent.setup();
    renderWithRouter(<GenerateContributionButton />);
    await user.click(screen.getByRole('button', { name: /Generate Proposal/i }));
    await waitFor(() => {
      const dialog = screen.getByTestId('stage-dag-progress-dialog');
      expect(dialog).toHaveAttribute('data-stage-slug', 'thesis');
      expect(dialog).toHaveAttribute('data-session-id', 'test-session-id');
      expect(dialog).toHaveAttribute('data-iteration-number', '1');
    });
  });

  it('balance callout renders when showBalanceCallout is true from hook', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ showBalanceCallout: true })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByTestId('generate-button-balance-callout')).toBeInTheDocument();
  });

  it('component returns null when stageThreshold is falsy', () => {
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ stageThreshold: undefined })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('closes DAG progress dialog when onOpenChange(false) is called', async () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    const startContributionGeneration = vi.fn().mockImplementation(async (cb) => {
      cb?.();
      return { success: true };
    });
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ startContributionGeneration })
    );
    const user = userEvent.setup();
    renderWithRouter(<GenerateContributionButton />);
    await user.click(screen.getByRole('button', { name: /Generate Proposal/i }));
    await waitFor(() => {
      expect(screen.getByTestId('stage-dag-progress-dialog')).toBeInTheDocument();
    });
    const { StageDAGProgressDialog } = await import('./StageDAGProgressDialog');
    const mockDialog = vi.mocked(StageDAGProgressDialog);
    const closeCall = mockDialog.mock.calls[mockDialog.mock.calls.length - 1];
    const onOpenChange = closeCall[0].onOpenChange;
    act(() => {
      onOpenChange(false);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('stage-dag-progress-dialog')).not.toBeInTheDocument();
    });
  });

  it('when isPauseMode is true, clicking button calls pauseGeneration with callback', async () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    const pauseGeneration = vi.fn().mockResolvedValue(undefined);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        isSessionGenerating: true,
        isPauseMode: true,
        isDisabled: false,
        pauseGeneration,
      })
    );
    const user = userEvent.setup();
    renderWithRouter(<GenerateContributionButton />);
    const button = screen.getByRole('button', { name: /Pause/i });
    await user.click(button);
    await waitFor(() => {
      expect(pauseGeneration).toHaveBeenCalledTimes(1);
      expect(pauseGeneration).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  it('when hasPausedUserJobs is true, button text shows "Resume [StageName]"', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        hasPausedUserJobs: true,
        isResumeMode: true,
        isDisabled: false,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Resume Proposal/i })).toBeInTheDocument();
  });

  it('when hasPausedUserJobs is true, clicking button calls startContributionGeneration (resume path)', async () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    const startContributionGeneration = vi.fn().mockResolvedValue({ success: true });
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        hasPausedUserJobs: true,
        isResumeMode: true,
        isDisabled: false,
        startContributionGeneration,
      })
    );
    const user = userEvent.setup();
    renderWithRouter(<GenerateContributionButton />);
    await user.click(screen.getByRole('button', { name: /Resume Proposal/i }));
    await waitFor(() => {
      expect(startContributionGeneration).toHaveBeenCalledTimes(1);
      expect(startContributionGeneration).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  it('when hasPausedNsfJobs is true and balanceMeetsThreshold, button shows "Resume [StageName]"', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        hasPausedNsfJobs: true,
        isResumeMode: true,
        balanceMeetsThreshold: true,
        isDisabled: false,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Resume Proposal/i })).toBeInTheDocument();
  });

  it('after click, button is disabled for 500ms debounce period then enters pause mode', async () => {
    vi.useFakeTimers();
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(getDefaultHookReturn());
    renderWithRouter(<GenerateContributionButton />);
    const button = screen.getByRole('button', { name: /Generate Proposal/i });
    // Use fireEvent to avoid userEvent's internal timer delays conflicting with fake timers
    fireEvent.click(button);
    expect(button).toBeDisabled();
    // After click, generation is in progress — hook now returns isPauseMode
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({ isPauseMode: true, isSessionGenerating: true, isDisabled: false })
    );
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    // Debounce cleared, button is now in pause mode and enabled
    expect(screen.getByRole('button')).not.toBeDisabled();
    expect(screen.getByRole('button')).toHaveTextContent(/Pause Proposal/i);
    vi.useRealTimers();
  });

  it('button state priority: isPauseMode (generating) over hasPausedNsfJobs and hasPausedUserJobs', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        isPauseMode: true,
        hasPausedNsfJobs: true,
        hasPausedUserJobs: true,
        isDisabled: false,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Pause');
    expect(button).toHaveTextContent('Proposal');
  });

  it('button renders at compact size (size sm) and full width suitable for sidebar', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    renderWithRouter(<GenerateContributionButton />);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button.className).toMatch(/w-full|width.*100/);
  });

  it('button text includes stage display_name so the exact stage is explicit', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        didGenerationFail: true,
        isDisabled: false,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Retry');
    expect(button).toHaveTextContent('Proposal');
  });

  it('shows "Prior Stage Not Submitted" when viewing ahead and stage not ready', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        isStageReady: false,
        isDisabled: true,
        isViewingAheadOfCurrentStage: true,
        viewingAheadReason: 'Submit your responses for "Proposal" first to unlock this stage.',
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button')).toHaveTextContent('Prior Stage Not Submitted');
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows tooltip with viewingAheadReason when viewing ahead of current stage', async () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    const reason = 'Submit your responses for "Proposal" first to unlock this stage.';
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        isStageReady: false,
        isDisabled: true,
        isViewingAheadOfCurrentStage: true,
        viewingAheadReason: reason,
      })
    );
    const user = userEvent.setup();
    renderWithRouter(<GenerateContributionButton />);
    const buttonWrapper = screen.getByRole('button').closest('span');
    expect(buttonWrapper).not.toBeNull();
    await user.hover(buttonWrapper!);
    await waitFor(() => {
      const matches = screen.getAllByText(reason);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows "Previous Stage Incomplete" when stage not ready but NOT viewing ahead', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        isStageReady: false,
        isDisabled: true,
        isViewingAheadOfCurrentStage: false,
        viewingAheadReason: null,
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button')).toHaveTextContent('Previous Stage Incomplete');
  });

  it('button is disabled when isViewingAheadOfCurrentStage is true even if other conditions pass', () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    mockUseStartContributionGeneration.mockReturnValue(
      getDefaultHookReturn({
        isDisabled: true,
        isViewingAheadOfCurrentStage: true,
        viewingAheadReason: 'Complete prior stages first. You are currently on "Proposal".',
      })
    );
    renderWithRouter(<GenerateContributionButton />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
}); 