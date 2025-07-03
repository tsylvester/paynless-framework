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
  DialecticStateValues
} from '@paynless/types'; // Corrected DialecticProjectDetail to DialecticProject

// Import utilities from the actual mock file
import { 
  initializeMockDialecticState, 
  getDialecticStoreState
} from '@/mocks/dialecticStore.mock';

import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';

// Mock the actual store path to use exports from our mock file
vi.mock('@paynless/store', async () => {
  // Import all exports from our mock file
  const mockStoreExports = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
  const actualStore = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');

  return {
    ...mockStoreExports,
    selectSessionById: actualStore.selectSessionById,
    // Ensure selectSelectedModelIds is correctly defined for these tests.
    // This assumes the mock store's state has a 'selectedModelIds' property.
    selectSelectedModelIds: (state: { selectedModelIds?: string[] }) => state.selectedModelIds || [],
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
  sessions: DialecticSession[] = []
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
    starting_stage_id: 'stage-1'},
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
  const defaultProps = {
    sessionId: 'test-session-id',
    projectId: 'test-project-id',
    currentStage: mockThesisStage,
    currentStageFriendlyName: 'Thesis',
  };

  let storeActions: {
     generateContributions: ReturnType<typeof vi.fn<[GenerateContributionsPayload], Promise<ApiResponse<GenerateContributionsResponse>>>>;
  };

  beforeEach(() => {
    initializeMockDialecticState(); // Reset the mock store
    // Set default state that allows button to be enabled initially for most tests
    const defaultSession = createMockSession(defaultProps.sessionId, defaultProps.projectId, 1);
    const defaultProject = createMockProject(defaultProps.projectId, [defaultSession]);
    setDialecticStateValues({ 
      selectedModelIds: ['model-1'],
      currentProjectDetail: defaultProject,
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
    // beforeEach already sets up models selected and a basic project/session
    render(<GenerateContributionButton {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Generate Thesis/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('renders "Choose AI Models" and is disabled when no models are selected', () => {
    setDialecticStateValues({ selectedModelIds: [] }); // Override: No models selected
    render(<GenerateContributionButton {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Choose AI Models/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders "Stage Not Ready" when currentStageFriendlyName indicates so', () => {
    // Models are selected by default from beforeEach
    render(<GenerateContributionButton {...defaultProps} currentStageFriendlyName="Stage Not Ready" />);
    expect(screen.getByRole('button', { name: /Stage Not Ready/i })).toBeInTheDocument();
    // The button should be disabled if the stage is not ready.
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders "Regenerate [StageName]" when contributions for current stage and iteration exist', () => {
    const currentIter = 1;
    const existingContribution = { ...mockGenericContribution, stage: mockThesisStage.slug, iteration_number: currentIter, session_id: defaultProps.sessionId };
    const sessionWithContribution = createMockSession(defaultProps.sessionId, defaultProps.projectId, currentIter, [existingContribution]);
    const projectWithContribution = createMockProject(defaultProps.projectId, [sessionWithContribution]);
    
    setDialecticStateValues({
      selectedModelIds: ['model1'], // Ensure models are selected
      currentProjectDetail: projectWithContribution,
    });

    render(<GenerateContributionButton {...defaultProps} currentStage={mockThesisStage} />);
    expect(screen.getByRole('button', { name: /Regenerate Thesis/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('renders "Generating..." and is disabled when that specific session is generating', () => {
    // Setup the mock store to return a generating state for this session
    setDialecticStateValues({
      selectedModelIds: ['model-1'], // Ensure models are selected
      generatingSessions: { [defaultProps.sessionId]: true },
    });
    
    render(<GenerateContributionButton {...defaultProps} />);
    
    expect(screen.getByText(/Generating.../i)).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders "Regenerate" when contributions for the current stage/iteration already exist', () => {
    // Override the mock session to include contributions for the current stage
    const sessionWithContributions = createMockSession(
      defaultProps.sessionId,
      defaultProps.projectId,
      1,
      [mockGenericContribution]
    );
    const projectWithContributions = createMockProject(defaultProps.projectId, [sessionWithContributions]);

    setDialecticStateValues({
      selectedModelIds: ['model1'],
      currentProjectDetail: projectWithContributions,
    });

    render(<GenerateContributionButton {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Regenerate Thesis/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('calls generateContributions and shows a toast on click', async () => {
    // Mock the successful API call
    storeActions.generateContributions.mockResolvedValue({ status: 202, data: { message: 'Request accepted' } });
    
    render(<GenerateContributionButton {...defaultProps} />);
    
    fireEvent.click(screen.getByRole('button'));
    
    await waitFor(() => {
      expect(storeActions.generateContributions).toHaveBeenCalledWith({
        sessionId: defaultProps.sessionId,
        projectId: defaultProps.projectId,
        stageSlug: defaultProps.currentStage.slug,
        iterationNumber: 1, // from mock session
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

    render(<GenerateContributionButton {...defaultProps} />);
    
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Thunk dispatch failed');
    });
  });

  it('shows an error toast if the session data is missing', async () => {
    // Set a project detail with a session that has a null iteration_count
    const sessionWithNullIteration = createMockSession(defaultProps.sessionId, defaultProps.projectId, undefined as unknown as number);
    const projectWithBadSession = createMockProject(defaultProps.projectId, [sessionWithNullIteration]);
    setDialecticStateValues({ 
      selectedModelIds: ['model1'],
      currentProjectDetail: projectWithBadSession,
    });
    
    render(<GenerateContributionButton {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));
    
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Could not determine the current iteration number. Please ensure the session is active.');
    });

    expect(storeActions.generateContributions).not.toHaveBeenCalled();
  });

  it('is disabled when the disabled prop is true', () => {
    // beforeEach ensures models are selected & project details are present
    render(<GenerateContributionButton {...defaultProps} disabled={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('handles unexpected exception during thunk execution (mockRejectedValue)', async () => {
    const exceptionError = new Error('Unexpected Thunk Error');
    storeActions.generateContributions.mockRejectedValueOnce(exceptionError);
    render(<GenerateContributionButton {...defaultProps} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Unexpected Thunk Error');
    });
  });

  it('is disabled and shows "Choose AI Models" when no models selected, overriding "Regenerate" label', () => {
    const currentIter = 1;
    const existingContribution = { ...mockGenericContribution, stage: mockThesisStage.slug, iteration_number: currentIter, session_id: defaultProps.sessionId };
    const sessionWithContribution = createMockSession(defaultProps.sessionId, defaultProps.projectId, currentIter, [existingContribution]);
    const projectWithContribution = createMockProject(defaultProps.projectId, [sessionWithContribution]);

    setDialecticStateValues({
      selectedModelIds: [], // NO models selected
      currentProjectDetail: projectWithContribution, // Contributions exist
    });

    render(<GenerateContributionButton {...defaultProps} currentStage={mockThesisStage} />);
    expect(screen.getByRole('button', { name: /Choose AI Models/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Regenerate Thesis/i })).not.toBeInTheDocument();
  });
  
  it('handles missing activeSession or iteration_count gracefully', async () => {
    setDialecticStateValues({
      selectedModelIds: ['model1'],
      currentProjectDetail: createMockProject(defaultProps.projectId, [
        // Session with missing iteration_count (though our helper enforces it)
        // More realistically, the session might be missing or currentProjectDetail is null
        { ...createMockSession(defaultProps.sessionId, defaultProps.projectId, 1), iteration_count: undefined as unknown as number } 
      ]),
    });

    render(<GenerateContributionButton {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Could not determine the current iteration number. Please ensure the session is active.');
    });
    expect(storeActions.generateContributions).not.toHaveBeenCalled();
  });

   it('handles currentProjectDetail being null gracefully', async () => {
    setDialecticStateValues({
      selectedModelIds: ['model1'],
      currentProjectDetail: null, // Project details not loaded
    });

    render(<GenerateContributionButton {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Could not determine the current iteration number. Please ensure the session is active.');
    });
    expect(storeActions.generateContributions).not.toHaveBeenCalled();
  });
}); 