import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom'; // Still useful for DOM assertions
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'sonner'; // Import the mocked toast
import { GenerateContributionButton } from './GenerateContributionButton';
import type {
  DialecticStage,
  DialecticContribution,
  DialecticProject,
  DialecticSession,
  GenerateContributionsPayload,
  GenerateContributionsResponse,
  ApiResponse,
  DialecticStateValues,
  DialecticProcessTemplate,
  SelectedModels,
  StageDAGProgressDialogProps,
} from '@paynless/types';

// Import utilities from the actual mock file
import { 
  initializeMockDialecticState, 
  getDialecticStoreState
} from '@/mocks/dialecticStore.mock';
import { selectActiveChatWalletInfo } from '@/mocks/walletStore.mock';

import { useDialecticStore, initialDialecticStateValues, selectIsStageReadyForSessionIteration } from '@paynless/store';

// Mock the actual store path to use exports from our mock file
vi.mock('@paynless/store', async () => {
  const mockStoreExports = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
  const actualPaynlessStore = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
  const walletStoreMock = await vi.importActual<typeof import('@/mocks/walletStore.mock')>('@/mocks/walletStore.mock');

  // Use real selectSelectedModels so component reads state.selectedModels.
  const selectSelectedModels = actualPaynlessStore.selectSelectedModels;
  
  const selectActiveStage = (state: DialecticStateValues): DialecticStage | null => {
    const { currentProjectDetail, activeStageSlug } = state;
    if (!currentProjectDetail || !activeStageSlug || !currentProjectDetail.dialectic_process_templates) return null;
    const processTemplate: DialecticProcessTemplate = currentProjectDetail.dialectic_process_templates;
    return processTemplate.stages?.find((s: DialecticStage) => s.slug === activeStageSlug) || null;
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
    selectActiveStage, // Use our test-specific implementation
    // Add the new selector to our mocks
    selectIsStageReadyForSessionIteration: vi.fn(),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
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

const mockThesisStage: DialecticStage = {
  id: 'stage-1',
  slug: 'thesis',
  display_name: 'Thesis',
  description: 'Initial hypothesis generation',
  default_system_prompt_id: 'prompt-1',
  created_at: new Date().toISOString(),
  expected_output_template_ids: [],
  recipe_template_id: null,
  active_recipe_instance_id: null,
};

// Define mockContribution at a higher scope if used in multiple tests
const mockGenericContribution: DialecticContribution = {
  id: 'contrib-generic',
  session_id: 'test-session-id',
  stage: mockThesisStage.slug, // Use mockThesisStage for consistency
  iteration_number: 1,
  user_id: 'u1', 
  created_at: 'now', 
  updated_at: 'now', 
  model_id: 'm1', 
  model_name: 'GPT-4', 
  edit_version: 1, 
  prompt_template_id_used: 'p-template', 
  raw_response_storage_path: 'raw/p', 
  seed_prompt_url: 'seed/p', 
  target_contribution_id: null, 
  tokens_used_input: 10, 
  tokens_used_output: 20, 
  processing_time_ms: 50, 
  error: null, 
  citations: null, 
  is_latest_edit: true, 
  original_model_contribution_id: 'contrib-generic',
  file_name: 'p.md',
  storage_bucket: 'b',
  storage_path: 'p',
  mime_type: 'text/plain',
  size_bytes: 100,
  contribution_type: 'ai',
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
});

// SelectedModels fixtures for store state (component uses selectSelectedModels)
const oneSelectedModel: SelectedModels[] = [{ id: 'model-1', displayName: 'Model 1' }];
const oneSelectedModelAlt: SelectedModels[] = [{ id: 'model1', displayName: 'Model 1' }];

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
  // Let TypeScript infer the type of storeActions from the mock store
  let storeActions: {
    generateContributions: (payload: GenerateContributionsPayload) => Promise<ApiResponse<GenerateContributionsResponse>>;
  };

  beforeEach(() => {
    initializeMockDialecticState(); // Reset the mock store
    // Set default state that allows button to be enabled initially for most tests
    const defaultSession = createMockSession('test-session-id', 'test-project-id', 1);
    const defaultProject = createMockProject('test-project-id', [defaultSession]);
    setDialecticStateValues({ 
      selectedModels: oneSelectedModel,
      currentProjectDetail: defaultProject,
      activeContextSessionId: 'test-session-id', // New state
      activeStageSlug: 'thesis', // New state
      contributionGenerationStatus: 'idle', // Explicitly set idle status
    });
    // Retrieve the mock function instance from the initialized store
    storeActions = {
        generateContributions: getDialecticStoreState().generateContributions,
    };
    // Clear mocks for props and toast for each test
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();

    // Set a default "wallet ready" state for all tests; individual tests can override
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue({
      status: 'ok',
      type: 'personal',
      walletId: 'default-wallet-id',
      orgId: null,
      balance: '1000',
      isLoadingPrimaryWallet: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks(); // Clear all mocks, including vi.fn() from the store if necessary
  });

  it('renders "Generate [StageName]" when models are selected and no other conditions met', () => {
    // We now need to explicitly mock the stage readiness check to return true
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);

    // beforeEach already sets up models selected and a basic project/session in the store
    render(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Generate Thesis/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('renders "Choose AI Models" and is disabled when no models are selected', () => {
    const defaultSession = createMockSession('test-session-id', 'test-project-id', 1);
    const defaultProject = createMockProject('test-project-id', [defaultSession]);
    setDialecticStateValues({
      selectedModels: [], // Override: No models selected
      currentProjectDetail: defaultProject,
      activeContextSessionId: 'test-session-id',
      activeStageSlug: 'thesis',
    });
    render(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Choose AI Models/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is disabled and shows "Stage Not Ready" when no active stage is selected', () => {
    // We now need to explicitly mock the stage readiness check to return true to isolate the test
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    setDialecticStateValues({
      selectedModels: oneSelectedModel,
      activeStageSlug: null, // No active stage
      currentProjectDetail: createMockProject('test-project-id', [createMockSession('test-session-id', 'test-project-id', 1)]),
    });
    render(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Stage Not Ready/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is disabled and shows "Previous Stage Incomplete" when the stage is not ready', () => {
    // This is the new test case for our added logic
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(false);

    render(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Previous Stage Incomplete/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders "Regenerate [StageName]" when contributions for current stage and iteration exist', () => {
    // We now need to explicitly mock the stage readiness check to return true
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    const currentIter = 1;
    const existingContribution = { ...mockGenericContribution, stage: mockThesisStage.slug, iteration_number: currentIter, session_id: 'test-session-id' };
    const sessionWithContribution = createMockSession('test-session-id', 'test-project-id', currentIter, [existingContribution]);
    const projectWithContribution = createMockProject('test-project-id', [sessionWithContribution]);
    
    setDialecticStateValues({
      selectedModels: oneSelectedModelAlt,
      currentProjectDetail: projectWithContribution,
      activeContextSessionId: 'test-session-id',
      activeStageSlug: 'thesis',
    });

    render(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Regenerate Thesis/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('renders "Generating..." and is disabled when that specific session is generating', () => {
    // We now need to explicitly mock the stage readiness check to return true
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    const defaultSession = createMockSession('test-session-id', 'test-project-id', 1);
    const defaultProject = createMockProject('test-project-id', [defaultSession]);
    setDialecticStateValues({
      selectedModels: oneSelectedModel,
      currentProjectDetail: defaultProject,
      activeContextSessionId: 'test-session-id',
      activeStageSlug: 'thesis',
      generatingSessions: { 'test-session-id': ['job-1'] }, // This session is generating
    });

    render(<GenerateContributionButton />);

    // The text is inside a more complex structure now with an SVG
    expect(screen.getByRole('button')).toHaveTextContent(/Generating.../i);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders "Regenerate" when contributions for the current stage/iteration already exist', () => {
    // We now need to explicitly mock the stage readiness check to return true
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    const currentIter = 1;
    const existingContribution = { ...mockGenericContribution, stage: mockThesisStage.slug, iteration_number: currentIter, session_id: 'test-session-id' };
    const sessionWithContribution = createMockSession('test-session-id', 'test-project-id', currentIter, [existingContribution]);
    const projectWithContributions = createMockProject('test-project-id', [sessionWithContribution]);

    setDialecticStateValues({
      selectedModels: oneSelectedModelAlt,
      currentProjectDetail: projectWithContributions,
      activeContextSessionId: 'test-session-id',
      activeStageSlug: 'thesis',
    });

    render(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Regenerate Thesis/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('calls generateContributions and shows a toast on click', async () => {
    // We now need to explicitly mock the stage readiness check to return true
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    const user = userEvent.setup();
    // Mock the successful API call
    vi.mocked(storeActions.generateContributions).mockResolvedValue({
      data: {
        job_ids: ['job-123'],
        sessionId: 'test-session-id',
        projectId: 'test-project-id',
        stage: 'thesis',
        iteration: 1,
        status: 'generating',
        successfulContributions: [],
        failedAttempts: [],
      },
      status: 202,
    });
    
    render(<GenerateContributionButton />);
    
    const button = screen.getByRole('button', { name: /Generate Thesis/i });
    await user.click(button);
    
    await waitFor(() => {
      expect(storeActions.generateContributions).toHaveBeenCalledWith({
        sessionId: 'test-session-id', // from store state
        projectId: 'test-project-id', // from store state
        stageSlug: 'thesis', // from store state
        iterationNumber: 1, // from mock session in store
        continueUntilComplete: false,
        walletId: 'default-wallet-id', // WalletId is now expected
      });
    });

    expect(toast.success).toHaveBeenCalledWith('Contribution generation started!', {
      description: 'The AI is working. We will notify you when it is complete.',
    });
  });

  it('shows an error toast if generateContributions fails unexpectedly at dispatch', async () => {
    // We now need to explicitly mock the stage readiness check to return true
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    const user = userEvent.setup();
    const errorMessage = 'Thunk dispatch failed';
    const dispatchError = new Error(errorMessage);
    // Ensure the mock is for the instance used in the component
    const { generateContributions } = getDialecticStoreState();
    vi.mocked(generateContributions).mockRejectedValue(dispatchError);

    render(<GenerateContributionButton />);
    
    const button = screen.getByRole('button', { name: /Generate Thesis/i });
    await user.click(button);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(errorMessage);
    });
  });

  it('shows an error toast if the session data is missing', async () => {
    // We now need to explicitly mock the stage readiness check to return true
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    // Set a project detail with a session that has a null iteration_count
    const sessionWithNullIteration = createMockSession('test-session-id', 'test-project-id', 1);
    const projectWithNullIterationSession = createMockProject('test-project-id', [sessionWithNullIteration]);
    setDialecticStateValues({ 
      selectedModels: oneSelectedModelAlt,
      // Set active session to null to test the guard clause
      activeContextSessionId: null,
      currentProjectDetail: projectWithNullIterationSession,
      activeStageSlug: 'thesis',
    });
    
    render(<GenerateContributionButton />);
    const button = screen.getByRole('button');
    // The button should be disabled because the active session is missing.
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/Stage Not Ready/i);

    // Ensure toast.error was not called because the button is disabled
    expect(toast.error).not.toHaveBeenCalled();
    expect(storeActions.generateContributions).not.toHaveBeenCalled();
  });

  it('is disabled when the active stage cannot be found from the store', () => {
    // This test implicitly checks for the 'Stage Not Ready' state, so no readiness mock needed
    const defaultSession = createMockSession('test-session-id', 'test-project-id', 1);
    const projectWithoutStages = createMockProject('test-project-id', [defaultSession], []); // No stages in template
    setDialecticStateValues({
      selectedModels: oneSelectedModel,
      activeStageSlug: 'non-existent-stage', // This stage doesn't exist in the mock project
      currentProjectDetail: projectWithoutStages,
      activeContextSessionId: 's-id'
    });
    render(<GenerateContributionButton />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('handles unexpected exception during thunk execution (mockRejectedValue)', async () => {
    // We now need to explicitly mock the stage readiness check to return true
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    const user = userEvent.setup();
    const errorMessage = 'Unexpected Thunk Error';
    vi.mocked(storeActions.generateContributions).mockRejectedValue(new Error(errorMessage));
    render(<GenerateContributionButton />);

    const button = screen.getByRole('button', { name: /Generate Thesis/i });
    await user.click(button);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(errorMessage);
    });
  });

  it('is disabled and shows "Choose AI Models" when no models selected, overriding "Regenerate" label', () => {
    // We now need to explicitly mock the stage readiness check to return true
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    const currentIter = 1;
    const existingContribution = { ...mockGenericContribution, stage: mockThesisStage.slug, iteration_number: currentIter, session_id: 'test-session-id' };
    const sessionWithContribution = createMockSession('test-session-id', 'test-project-id', currentIter, [existingContribution]);
    const projectWithContribution = createMockProject('test-project-id', [sessionWithContribution]);

    setDialecticStateValues({
      selectedModels: [], // NO models selected
      currentProjectDetail: projectWithContribution, // Contributions exist
      activeContextSessionId: 'test-session-id',
      activeStageSlug: 'thesis',
    });

    render(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Choose AI Models/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Regenerate Thesis/i })).not.toBeInTheDocument();
  });
  
  it('handles missing activeSession or iteration_count gracefully', async () => {
    // We now need to explicitly mock the stage readiness check to return true
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    const user = userEvent.setup();
    
    // Test Case 1: Active session is missing
    setDialecticStateValues({ 
      selectedModels: oneSelectedModelAlt,
      activeContextSessionId: null, // No active session
      currentProjectDetail: createMockProject('test-project-id', [createMockSession('test-session-id', 'test-project-id', 1)]),
      activeStageSlug: 'thesis',
    });

    const { rerender } = render(<GenerateContributionButton />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/Stage Not Ready/i);

    // Test Case 2: Iteration count is missing
    // @ts-expect-error - Intentionally creating an invalid state for testing the guard clause.
    const sessionWithoutIteration: DialecticSession = { ...createMockSession('test-session-id', 'test-project-id', 1), iteration_count: null };
    const projectWithBadSession = createMockProject('test-project-id', [sessionWithoutIteration]);
    
    act(() => {
      setDialecticStateValues({
        selectedModels: oneSelectedModel,
        currentProjectDetail: projectWithBadSession,
        activeContextSessionId: 'test-session-id',
        activeStageSlug: 'thesis',
      });
    });

    // Use rerender to update the component with the new state
    rerender(<GenerateContributionButton />);
    const button2 = screen.getByRole('button', { name: /Generate Thesis/i });
    
    // The button is enabled, but the click handler should catch the missing iteration
    await act(async () => {
      await user.click(button2);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Could not determine the required context. Please ensure a project, session, stage, and wallet are active.');
    });
    expect(storeActions.generateContributions).not.toHaveBeenCalled();
  });

   it('handles currentProjectDetail being null gracefully by being disabled', () => {
    // No readiness mock needed as this checks a more fundamental missing piece of state
    setDialecticStateValues({
      selectedModels: oneSelectedModel,
      currentProjectDetail: null, // Project is null
      activeContextSessionId: 'test-session-id',
      activeStageSlug: 'thesis',
    });

    render(<GenerateContributionButton />);
    
    // The button should be disabled because there's no project/stage info
    expect(screen.getByRole('button')).toBeDisabled();
    // And it should indicate why
    expect(screen.getByText(/Stage Not Ready/i)).toBeInTheDocument();
  });

  it('is disabled when no active wallet is available', () => {
    // Ensure stage is otherwise ready so wallet gating is the deciding factor
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    // Simulate wallet selector returning a loading/no-wallet state
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue({
      status: 'loading',
      type: null,
      walletId: null,
      orgId: null,
      balance: null,
      message: 'Determining wallet policy and consent...',
      isLoadingPrimaryWallet: true,
    });

    render(<GenerateContributionButton />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('passes walletId in payload to generateContributions when wallet is ready', async () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue({
      status: 'ok',
      type: 'personal',
      walletId: 'wallet-123',
      orgId: null,
      balance: '100',
      isLoadingPrimaryWallet: false,
    });

    const user = userEvent.setup();
    render(<GenerateContributionButton />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(getDialecticStoreState().generateContributions).toHaveBeenCalledWith(
        expect.objectContaining({ walletId: 'wallet-123' })
      );
    });
  });

  it('reacts to chat context: personal wallet makes button enabled', () => {
    // Stage is ready
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);

    // Selector returns ok only when ctx === 'personal'; otherwise loading
    vi.mocked(selectActiveChatWalletInfo).mockImplementation((state, ctx) => {
      void state;
      if (ctx === 'personal') {
        return {
          status: 'ok',
          type: 'personal',
          walletId: 'personal-wallet',
          orgId: null,
          balance: '100',
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

    render(<GenerateContributionButton />);
    // Desired behavior: with personal context, button should be enabled and say Generate
    expect(screen.getByRole('button', { name: /Generate Thesis/i })).not.toBeDisabled();
  });

  it('opens DAG progress dialog when generate button is clicked', async () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    vi.mocked(storeActions.generateContributions).mockResolvedValue({
      data: {
        job_ids: ['job-123'],
        sessionId: 'test-session-id',
        projectId: 'test-project-id',
        stage: 'thesis',
        iteration: 1,
        status: 'generating',
        successfulContributions: [],
        failedAttempts: [],
      },
      status: 202,
    });
    const user = userEvent.setup();
    render(<GenerateContributionButton />);
    expect(screen.queryByTestId('stage-dag-progress-dialog')).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Generate Thesis/i });
    await user.click(button);
    await waitFor(() => {
      expect(screen.getByTestId('stage-dag-progress-dialog')).toBeInTheDocument();
    });
  });

  it('passes correct stageSlug, sessionId, and iterationNumber to DAG progress dialog', async () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    vi.mocked(storeActions.generateContributions).mockResolvedValue({
      data: {
        job_ids: ['job-123'],
        sessionId: 'test-session-id',
        projectId: 'test-project-id',
        stage: 'thesis',
        iteration: 1,
        status: 'generating',
        successfulContributions: [],
        failedAttempts: [],
      },
      status: 202,
    });
    const user = userEvent.setup();
    render(<GenerateContributionButton />);
    await user.click(screen.getByRole('button', { name: /Generate Thesis/i }));
    await waitFor(() => {
      const dialog = screen.getByTestId('stage-dag-progress-dialog');
      expect(dialog).toHaveAttribute('data-stage-slug', 'thesis');
      expect(dialog).toHaveAttribute('data-session-id', 'test-session-id');
      expect(dialog).toHaveAttribute('data-iteration-number', '1');
    });
  });

  it('closes DAG progress dialog when onOpenChange(false) is called', async () => {
    vi.mocked(selectIsStageReadyForSessionIteration).mockReturnValue(true);
    vi.mocked(storeActions.generateContributions).mockResolvedValue({
      data: {
        job_ids: ['job-123'],
        sessionId: 'test-session-id',
        projectId: 'test-project-id',
        stage: 'thesis',
        iteration: 1,
        status: 'generating',
        successfulContributions: [],
        failedAttempts: [],
      },
      status: 202,
    });
    const user = userEvent.setup();
    render(<GenerateContributionButton />);
    await user.click(screen.getByRole('button', { name: /Generate Thesis/i }));
    await waitFor(() => {
      expect(screen.getByTestId('stage-dag-progress-dialog')).toBeInTheDocument();
    });
    const dialog = screen.getByTestId('stage-dag-progress-dialog');
    expect(dialog).toBeInTheDocument();
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
}); 