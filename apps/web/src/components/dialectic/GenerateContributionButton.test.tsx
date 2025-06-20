import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom'; // Still useful for DOM assertions
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'sonner'; // Import the mocked toast
import { GenerateContributionButton } from './GenerateContributionButton';
import { useDialecticStore } from '@paynless/store';
import { DialecticStage, DialecticContribution, ApiError } from '@paynless/types';

// Mock the store
const mockGenerateContributions = vi.fn();

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useDialecticStore: vi.fn(),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(), // Define mocks directly here
    error: vi.fn(),   // Define mocks directly here
  },
}));

const mockedUseDialecticStore = useDialecticStore as typeof useDialecticStore & ReturnType<typeof vi.fn>;

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

describe('GenerateContributionButton', () => {
  const defaultProps = {
    sessionId: 'test-session-id',
    projectId: 'test-project-id',
    currentStage: mockThesisStage,
    currentStageFriendlyName: 'Thesis',
    onGenerationStart: vi.fn(),
    onGenerationComplete: vi.fn(),
  };

  // Create a deep mock for the entire store state and actions
  const getMockStoreState = (overrides?: Partial<ReturnType<typeof useDialecticStore>>): ReturnType<typeof useDialecticStore> => {
    return {
      generateContributions: mockGenerateContributions,
      isGeneratingContributions: false,
      generateContributionsError: null,
      currentProjectDetail: {
        id: 'test-project-id',
        dialectic_sessions: [
          {
            id: 'test-session-id',
            project_id: 'test-project-id',
            current_iteration: 1,
            status: 'pending_thesis',
            dialectic_contributions: [],
            active_thesis_prompt_template_id: null,
            active_antithesis_prompt_template_id: null,
            active_synthesis_prompt_template_id: null,
            active_parenthesis_prompt_template_id: null,
            active_paralysis_prompt_template_id: null,
            formal_debate_structure_id: null,
            session_description: 'desc',
            current_stage_seed_prompt: null,
            iteration_count: 1,
            associated_chat_id: 'c1',
            max_iterations: 1,
            convergence_status: null,
            preferred_model_for_stage: null,
            created_at: 'now',
            updated_at: 'now',
            dialectic_session_models: [],
          }
        ],
        user_id: 'u1', 
        project_name: 'p1', 
        initial_user_prompt: 'ipu', 
        initial_prompt_resource_id: null,
        selected_domain_id: 'd1',
        domain_name: 'Software Development',
        selected_domain_overlay_id: null,
        repo_url: null, 
        status: 'active', 
        created_at: 'now', 
        updated_at: 'now',
        dialectic_project_resources: [],
      },
      fetchAvailableDomains: vi.fn(),
      setSelectedDomainId: vi.fn(),
      fetchAvailableDomainOverlays: vi.fn(),
      setSelectedStageAssociation: vi.fn(),
      setSelectedDomainOverlayId: vi.fn(),
      fetchDialecticProjects: vi.fn(),
      fetchDialecticProjectDetails: vi.fn(),
      createDialecticProject: vi.fn().mockResolvedValue({ data: {}, error: null }),
      startDialecticSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
      fetchAIModelCatalog: vi.fn(),
      fetchContributionContent: vi.fn(),
      resetCreateProjectError: vi.fn(),
      resetProjectDetailsError: vi.fn(),
      deleteDialecticProject: vi.fn().mockResolvedValue({ data: {}, error: null }),
      cloneDialecticProject: vi.fn().mockResolvedValue({ data: {}, error: null }),
      exportDialecticProject: vi.fn().mockResolvedValue({ data: {}, error: null }),
      updateDialecticProjectInitialPrompt: vi.fn().mockResolvedValue({ data: {}, error: null }),
      setStartNewSessionModalOpen: vi.fn(),
      setModelMultiplicity: vi.fn(),
      resetSelectedModelId: vi.fn(),
      fetchInitialPromptContent: vi.fn(),
      availableDomains: [],
      isLoadingDomains: false,
      domainsError: null,
      selectedDomainId: null,
      selectedStageAssociation: null,
      availableDomainOverlays: [],
      isLoadingDomainOverlays: false,
      domainOverlaysError: null,
      selectedDomainOverlayId: null,
      projects: [],
      isLoadingProjects: false,
      projectsError: null,
      modelCatalog: [],
      isLoadingModelCatalog: false,
      modelCatalogError: null,
      isCreatingProject: false,
      createProjectError: null,
      isStartingSession: false,
      startSessionError: null,
      contributionContentCache: {},
      allSystemPrompts: null,
      isCloningProject: false,
      cloneProjectError: null,
      isExportingProject: false,
      exportProjectError: null,
      isUpdatingProjectPrompt: false,
      isUploadingProjectResource: false,
      uploadProjectResourceError: null,
      isStartNewSessionModalOpen: false,
      selectedModelIds: [],
      initialPromptFileContent: null,
      isLoadingInitialPromptFileContent: false,
      initialPromptFileContentError: null,
      ...(overrides || {}),
    } as ReturnType<typeof useDialecticStore>; // Cast to the store type
  };

  beforeEach(() => {
    mockedUseDialecticStore.mockReturnValue(getMockStoreState());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the button with the correct label', () => {
    render(<GenerateContributionButton {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Generate Thesis/i })).toBeInTheDocument();
  });

  it('calls generateContributions and onGenerationStart/Complete on click for successful generation', async () => {
    const mockContributions: DialecticContribution[] = [{ 
      id: 'c1', 
      session_id: 
      'test-session-id', 
      user_id: 'u1', 
      stage: mockThesisStage, 
      iteration_number: 1, 
      created_at: 'now', 
      updated_at: 'now', 
      model_id: 'm1', 
      model_name: 'GPT-4', 
      content_storage_path: 'path/c1', 
      content_storage_bucket: 'b', 
      content_mime_type: 'text/plain', 
      content_size_bytes: 100, 
      edit_version: 1, 
      prompt_template_id_used: 'p', 
      raw_response_storage_path: 'p', 
      seed_prompt_url: 'p', 
      target_contribution_id: null, 
      tokens_used_input: 1, 
      tokens_used_output: 1, 
      processing_time_ms: 1, 
      error: null, 
      citations: null, 
      is_latest_edit: true, 
      original_model_contribution_id: 'c1' 
    }];
    mockGenerateContributions.mockResolvedValue({
      data: { message: 'Success', contributions: mockContributions },
      error: null
    });
    render(<GenerateContributionButton {...defaultProps} />);

    fireEvent.click(screen.getByRole('button'));

    expect(defaultProps.onGenerationStart).toHaveBeenCalledTimes(1);
    expect(mockGenerateContributions).toHaveBeenCalledWith({
      sessionId: 'test-session-id',
      projectId: 'test-project-id',
      stageSlug: defaultProps.currentStage.slug,
      iterationNumber: 1
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Thesis contributions generated successfully!');
    });
    expect(defaultProps.onGenerationComplete).toHaveBeenCalledWith(true, mockContributions);
  });

  it('handles successful generation with empty contributions array', async () => {
    mockGenerateContributions.mockResolvedValue({
      data: { message: 'Success', contributions: [] },
      error: null
    });
    render(<GenerateContributionButton {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Thesis contributions generated successfully!');
    });
    expect(defaultProps.onGenerationComplete).toHaveBeenCalledWith(true, []);
  });

  it('shows loading state when isGeneratingContributions is true', () => {
    mockedUseDialecticStore.mockReturnValueOnce(getMockStoreState({ isGeneratingContributions: true }));
    render(<GenerateContributionButton {...defaultProps} />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByText(/Generating.../i)).toBeInTheDocument();
  });

  it('is disabled when the disabled prop is true', () => {
    render(<GenerateContributionButton {...defaultProps} disabled={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('handles API error correctly', async () => {
    const apiError: ApiError = { message: 'API Error', code: 'API_ERROR' };
    mockGenerateContributions.mockResolvedValue({ data: null, error: apiError });
    render(<GenerateContributionButton {...defaultProps} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('API Error');
    });
    expect(defaultProps.onGenerationComplete).toHaveBeenCalledWith(false, undefined, apiError);
  });

  it('handles API error response without a message field correctly', async () => {
    mockGenerateContributions.mockImplementation(async () => ({ 
      data: null, 
      error: { code: 'SOME_ERROR', message: undefined } as unknown as ApiError 
    }));

    render(<GenerateContributionButton {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to generate thesis contributions.');
    });
    expect(defaultProps.onGenerationComplete).toHaveBeenCalledWith(false, undefined, { code: 'SOME_ERROR', message: undefined });
  });

  it('handles unexpected exception during thunk execution', async () => {
    mockGenerateContributions.mockRejectedValue(new Error('Unexpected error'));
    render(<GenerateContributionButton {...defaultProps} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Unexpected error');
    });
    expect(defaultProps.onGenerationComplete).toHaveBeenCalledWith(false, undefined, { message: 'Unexpected error', code: 'CLIENT_EXCEPTION' });
  });
}); 