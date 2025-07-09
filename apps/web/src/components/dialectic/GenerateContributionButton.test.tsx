import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom'; // Still useful for DOM assertions
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'sonner'; // Import the mocked toast
import { GenerateContributionButton } from './GenerateContributionButton';
import type { 
  DialecticStage, 
  DialecticContribution, 
  DialecticProject, 
  DialecticSession,
  GenerateContributionsPayload, // For explicit mock typing
  GenerateContributionsResponse, // For explicit mock typing
  ApiResponse, // For explicit mock typing
  DialecticStateValues,
  DialecticProcessTemplate
} from '@paynless/types'; // Corrected DialecticProjectDetail to DialecticProject

// Import utilities from the actual mock file
import { 
  initializeMockDialecticState, 
  getDialecticStoreState
} from '@/mocks/dialecticStore.mock';

import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';

// Mock the actual store path to use exports from our mock file
vi.mock('@paynless/store', async () => {
  const mockStoreExports = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
  const actualPaynlessStore = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');

  // These are simple, test-specific selectors that work with our flat mock state.
  // This isolates the component test from the real store's implementation details.
  const selectSelectedModelIds = (state: DialecticStateValues) => state.selectedModelIds || [];
  
  const selectActiveStage = (state: DialecticStateValues): DialecticStage | null => {
    const { currentProjectDetail, activeStageSlug } = state;
    if (!currentProjectDetail || !activeStageSlug || !currentProjectDetail.dialectic_process_templates) return null;
    const processTemplate: DialecticProcessTemplate = currentProjectDetail.dialectic_process_templates;
    return processTemplate.stages?.find((s: DialecticStage) => s.slug === activeStageSlug) || null;
  };

  const useAiStore = (selector: (state: { continueUntilComplete: boolean }) => void) => {
    const state = {
      continueUntilComplete: false,
      // Add other properties from useAiStore that are needed for tests
    };
    return selector(state);
  };
  
  return {
    ...mockStoreExports,
    useAiStore,
    initialDialecticStateValues: actualPaynlessStore.initialDialecticStateValues,
    selectSessionById: actualPaynlessStore.selectSessionById, // This selector is simple enough to work with our mock state
    selectSelectedModelIds, // Use our test-specific implementation
    selectActiveStage, // Use our test-specific implementation
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(), // Define mocks directly here
    error: vi.fn(),   // Define mocks directly here
  },
}));

const mockThesisStage: DialecticStage = {
  id: 'stage-1',
  slug: 'thesis',
  display_name: 'Thesis',
  description: 'Initial hypothesis generation',
  default_system_prompt_id: 'prompt-1',
  input_artifact_rules: {},
  expected_output_artifacts: {},
  created_at: new Date().toISOString(),
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
  selected_model_ids: [],
  status: 'active',
  associated_chat_id: null,
  current_stage_id: mockThesisStage.id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  dialectic_contributions: contributions,
  dialectic_session_models: [],
});

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
  // This is no longer needed as props are removed.
  // const defaultProps = { ... };

  let storeActions: {
     generateContributions: ReturnType<typeof vi.fn<[GenerateContributionsPayload], Promise<ApiResponse<GenerateContributionsResponse>>>>;
  };

  beforeEach(() => {
    initializeMockDialecticState(); // Reset the mock store
    // Set default state that allows button to be enabled initially for most tests
    const defaultSession = createMockSession('test-session-id', 'test-project-id', 1);
    const defaultProject = createMockProject('test-project-id', [defaultSession]);
    setDialecticStateValues({ 
      selectedModelIds: ['model-1'],
      currentProjectDetail: defaultProject,
      activeContextSessionId: 'test-session-id', // New state
      activeStageSlug: 'thesis', // New state
      contributionGenerationStatus: 'idle', // Explicitly set idle status
    });
    // Retrieve the mock function instance from the initialized store
    storeActions = {
        generateContributions: getDialecticStoreState().generateContributions as ReturnType<typeof vi.fn<[GenerateContributionsPayload], Promise<ApiResponse<GenerateContributionsResponse>>>>,
    };
    // Clear mocks for props and toast for each test
    (toast.success as ReturnType<typeof vi.fn>).mockClear();
    (toast.error as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks(); // Clear all mocks, including vi.fn() from the store if necessary
  });

  it('renders "Generate [StageName]" when models are selected and no other conditions met', () => {
    // beforeEach already sets up models selected and a basic project/session in the store
    render(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Generate Thesis/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('renders "Choose AI Models" and is disabled when no models are selected', () => {
    const defaultSession = createMockSession('test-session-id', 'test-project-id', 1);
    const defaultProject = createMockProject('test-project-id', [defaultSession]);
    setDialecticStateValues({
      selectedModelIds: [], // Override: No models selected
      currentProjectDetail: defaultProject,
      activeContextSessionId: 'test-session-id',
      activeStageSlug: 'thesis',
    });
    render(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Choose AI Models/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is disabled and shows "Stage Not Ready" when no active stage is selected', () => {
    setDialecticStateValues({
      selectedModelIds: ['model-1'],
      activeStageSlug: null, // No active stage
      currentProjectDetail: createMockProject('test-project-id', [createMockSession('test-session-id', 'test-project-id', 1)]),
    });
    render(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Stage Not Ready/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders "Regenerate [StageName]" when contributions for current stage and iteration exist', () => {
    const currentIter = 1;
    const existingContribution = { ...mockGenericContribution, stage: mockThesisStage.slug, iteration_number: currentIter, session_id: 'test-session-id' };
    const sessionWithContribution = createMockSession('test-session-id', 'test-project-id', currentIter, [existingContribution]);
    const projectWithContribution = createMockProject('test-project-id', [sessionWithContribution]);
    
    setDialecticStateValues({
      selectedModelIds: ['model1'],
      currentProjectDetail: projectWithContribution,
      activeContextSessionId: 'test-session-id',
      activeStageSlug: 'thesis',
    });

    render(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Regenerate Thesis/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('renders "Generating..." and is disabled when that specific session is generating', () => {
    // Setup the mock store to return a generating state for this session
    setDialecticStateValues({
      selectedModelIds: ['model-1'], // Ensure models are selected
      generatingSessions: { 'test-session-id': true },
      activeContextSessionId: 'test-session-id',
      activeStageSlug: 'thesis',
      currentProjectDetail: createMockProject('test-project-id', [createMockSession('test-session-id', 'test-project-id', 1)]),
    });
    
    render(<GenerateContributionButton />);
    
    expect(screen.getByText(/Generating.../i)).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders "Regenerate" when contributions for the current stage/iteration already exist', () => {
    // This test is somewhat redundant with the one above, but we keep it for coverage.
    const sessionWithContributions = createMockSession(
      'test-session-id',
      'test-project-id',
      1,
      [mockGenericContribution]
    );
    const projectWithContributions = createMockProject('test-project-id', [sessionWithContributions]);

    setDialecticStateValues({
      selectedModelIds: ['model1'],
      currentProjectDetail: projectWithContributions,
      activeContextSessionId: 'test-session-id',
      activeStageSlug: 'thesis',
    });

    render(<GenerateContributionButton />);
    expect(screen.getByRole('button', { name: /Regenerate Thesis/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('calls generateContributions and shows a toast on click', async () => {
    // Mock the successful API call
    storeActions.generateContributions.mockResolvedValue({ 
      status: 202, 
      data: {
        sessionId: 'test-session-id',
        projectId: 'test-project-id',
        stage: 'thesis',
        iteration: 1,
        status: 'complete',
        successfulContributions: [],
        failedAttempts: [],
      } 
    });
    
    render(<GenerateContributionButton />);
    
    fireEvent.click(screen.getByRole('button'));
    
    await waitFor(() => {
      expect(storeActions.generateContributions).toHaveBeenCalledWith({
        sessionId: 'test-session-id', // from store state
        projectId: 'test-project-id', // from store state
        stageSlug: 'thesis', // from store state
        iterationNumber: 1, // from mock session in store
        continueUntilComplete: false,
      });
    });

    expect(toast.success).toHaveBeenCalledWith('Contribution generation started!', {
      description: 'The AI is working. We will notify you when it is complete.',
    });
  });

  it('shows an error toast if generateContributions fails unexpectedly at dispatch', async () => {
    const dispatchError = new Error('Thunk dispatch failed');
    // Ensure the mock is for the instance used in the component
    const { generateContributions } = getDialecticStoreState();
    (generateContributions as ReturnType<typeof vi.fn>).mockRejectedValue(dispatchError);

    render(<GenerateContributionButton />);
    
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Thunk dispatch failed');
    });
  });

  it('shows an error toast if the session data is missing', async () => {
    // Set a project detail with a session that has a null iteration_count
    const sessionWithNullIteration = createMockSession('test-session-id', 'test-project-id', undefined as unknown as number);
    const projectWithBadSession = createMockProject('test-project-id', [sessionWithNullIteration]);
    setDialecticStateValues({ 
      selectedModelIds: ['model1'],
      currentProjectDetail: projectWithBadSession,
      activeContextSessionId: 'test-session-id',
      activeStageSlug: 'thesis',
    });
    
    render(<GenerateContributionButton />);
    fireEvent.click(screen.getByRole('button'));
    
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Could not determine the required context. Please ensure a project, session, and stage are active.');
    });

    expect(storeActions.generateContributions).not.toHaveBeenCalled();
  });

  it('is disabled when the active stage cannot be found from the store', () => {
    setDialecticStateValues({
      selectedModelIds: ['model-1'],
      activeStageSlug: 'non-existent-stage', // This stage doesn't exist in the mock project
      currentProjectDetail: createMockProject('p-id', [createMockSession('s-id', 'p-id', 1)], [mockThesisStage]),
      activeContextSessionId: 's-id'
    });
    render(<GenerateContributionButton />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('handles unexpected exception during thunk execution (mockRejectedValue)', async () => {
    const exceptionError = new Error('Unexpected Thunk Error');
    storeActions.generateContributions.mockRejectedValueOnce(exceptionError);
    render(<GenerateContributionButton />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Unexpected Thunk Error');
    });
  });

  it('is disabled and shows "Choose AI Models" when no models selected, overriding "Regenerate" label', () => {
    const currentIter = 1;
    const existingContribution = { ...mockGenericContribution, stage: mockThesisStage.slug, iteration_number: currentIter, session_id: 'test-session-id' };
    const sessionWithContribution = createMockSession('test-session-id', 'test-project-id', currentIter, [existingContribution]);
    const projectWithContribution = createMockProject('test-project-id', [sessionWithContribution]);

    setDialecticStateValues({
      selectedModelIds: [], // NO models selected
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
    setDialecticStateValues({
      selectedModelIds: ['model1'],
      currentProjectDetail: createMockProject('test-project-id', [
        // Session with missing iteration_count
        { ...createMockSession('test-session-id', 'test-project-id', 1), iteration_count: undefined as unknown as number } 
      ]),
      activeContextSessionId: 'test-session-id',
      activeStageSlug: 'thesis',
    });

    render(<GenerateContributionButton />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Could not determine the required context. Please ensure a project, session, and stage are active.');
    });
    expect(storeActions.generateContributions).not.toHaveBeenCalled();
  });

   it('handles currentProjectDetail being null gracefully by being disabled', () => {
    setDialecticStateValues({
      selectedModelIds: ['model1'],
      currentProjectDetail: null, // Project details not loaded
      activeContextSessionId: 'test-session-id',
      activeStageSlug: 'thesis',
    });

    render(<GenerateContributionButton />);
    
    // The button should be disabled because there's no project/stage info
    expect(screen.getByRole('button')).toBeDisabled();
    // And it should indicate why
    expect(screen.getByText(/Stage Not Ready/i)).toBeInTheDocument();
  });
}); 