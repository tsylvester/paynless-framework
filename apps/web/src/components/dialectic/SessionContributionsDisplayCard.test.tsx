// Mock local components first
vi.mock('./GeneratedContributionCard', () => ({
  GeneratedContributionCard: vi.fn(({ contributionId, originalModelContributionIdForResponse, initialResponseText, onResponseChange }) => (
    <div data-testid={`generated-contribution-card-${contributionId}`}>
      <p>Original ID for response: {originalModelContributionIdForResponse}</p>
      <textarea
        data-testid={`response-textarea-${originalModelContributionIdForResponse}`}
        value={initialResponseText || ''}
        onChange={(e) => onResponseChange(originalModelContributionIdForResponse, e.target.value)}
      />
    </div>
  )),
}));

// Then mock libraries/aliased paths
vi.mock('@paynless/store', async () => {
  // CORRECTED: Import and spread ALL exports from the actual mock file.
  const actualMock = await vi.importActual<typeof import('../../mocks/dialecticStore.mock')>('../../mocks/dialecticStore.mock');
  return {
    ...actualMock,
    __esModule: true, // Typically needed when using vi.importActual with ES modules
    // Override specific selectors to be mock functions for this test suite
    selectIsStageReadyForSessionIteration: vi.fn(),
    selectFeedbackForStageIteration: vi.fn(),
    selectActiveContextStage: vi.fn(),
    selectCurrentProjectDetail: vi.fn(),
    selectIsLoadingProjectDetail: vi.fn(),
    selectContributionGenerationStatus: vi.fn(),
    selectProjectDetailError: vi.fn(),
  };
});

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SessionContributionsDisplayCard } from './SessionContributionsDisplayCard';
import {
  DialecticProject,
  DialecticSession,
  DialecticContribution,
  DialecticStage,
  ApiError,
  DialecticStateValues,
  ApiResponse,
  SubmitStageResponsesResponse,
  DialecticFeedback,
  GetProjectResourceContentResponse,
} from '@paynless/types';
import { vi, beforeEach, describe, it, expect, type MockInstance } from 'vitest';
import { initializeMockDialecticState, getDialecticStoreState } from '../../mocks/dialecticStore.mock';
import { 
  useDialecticStore, 
  selectIsStageReadyForSessionIteration, 
  selectFeedbackForStageIteration,
  selectIsLoadingProjectDetail,
  selectContributionGenerationStatus,
  selectProjectDetailError,
  selectActiveContextStage,
  selectCurrentProjectDetail
} from '@paynless/store';

const mockThesisStage: DialecticStage = {
    id: 's1',
    slug: 'thesis',
    display_name: 'Thesis',
    description: 'A stage for initial ideas.',
    default_system_prompt_id: 'p1',
    input_artifact_rules: {},
    expected_output_artifacts: {},
    created_at: 'now',
};

const mockAntithesisStage: DialecticStage = {
    id: 's2',
    slug: 'antithesis',
    display_name: 'Antithesis',
    description: 'A stage for critiques.',
    default_system_prompt_id: 'p2',
    input_artifact_rules: {},
    expected_output_artifacts: {},
    created_at: 'now',
};

describe('SessionContributionsDisplayCard', () => {
  const mockSubmitStageResponses = vi.fn(
    (): Promise<ApiResponse<SubmitStageResponsesResponse>> => {
      const updatedSession: DialecticSession = {
        ...mockBaseSession,
        status: 'antithesis_pending',
        current_stage_id: mockAntithesisStage.id,
      };

      return Promise.resolve({
        data: {
          userFeedbackStoragePath: 'path/to/feedback',
          nextStageSeedPromptStoragePath: 'path/to/seed',
          updatedSession: updatedSession,
          message: 'Success',
        },
        status: 200,
      });
    }
  );
  const mockSetActiveDialecticContext = vi.fn();
  const mockResetSubmitStageResponsesError = vi.fn();

  const mockFetchFeedbackFileContent = vi.fn();
  const mockClearCurrentFeedbackFileContent = vi.fn();
  const mockResetFetchFeedbackFileContentError = vi.fn();

  const mockFetchedContent: GetProjectResourceContentResponse = {
    content: '# Feedback\n\nThis is the markdown feedback.',
    fileName: 'user_feedback_thesis.md',
    mimeType: 'text/markdown',
  };

  const mockFeedback: DialecticFeedback = {
    id: 'fb1',
    session_id: 'sess-1',
    project_id: 'proj-1',
    stage_slug: mockThesisStage.slug,
    iteration_number: 1,
    user_id: 'u1',
    file_name: 'user_feedback_thesis.md',
    storage_bucket: 'feedback-bucket',
    storage_path: 'project-123/session-abc/iteration_1/thesis/user_feedback_thesis.md',
    mime_type: 'text/markdown',
    size_bytes: 200,
    created_at: '2023-10-27T05:00:00Z',
    feedback_type: 'user_provided_feedback_v1',
    updated_at: '2023-10-27T05:00:00Z',
  };

  const mockThesisContrib: DialecticContribution = {
    id: 'c1',
    stage: mockThesisStage.slug, 
    original_model_contribution_id: 'c1',
    is_latest_edit: true,
    session_id: 'sess-1',
    iteration_number: 1,
    created_at: '2023-01-01T12:00:00Z',
    updated_at: '2023-01-01T12:00:00Z',
    user_id: 'u1',
    model_id: 'm1',
    model_name: 'GPT-4',
    file_name: 'gpt-4_thesis_contribution.md',
    storage_bucket: 'dialectic-content',
    storage_path: 'project-123/session-abc/iteration_1/thesis/gpt-4_thesis_contribution.md',
    mime_type: 'text/markdown', 
    size_bytes: 120,           
    contribution_type: 'model_contribution',
    edit_version: 1,
    prompt_template_id_used: 'p',
    raw_response_storage_path: 'path/to/raw/c1.json',
    seed_prompt_url: 'path/to/seed/prompt_c1.md',
    target_contribution_id: null,
    tokens_used_input: 1,
    tokens_used_output: 1,
    processing_time_ms: 1,
    error: null,
    citations: null,
  };

  const mockAntithesisContrib: DialecticContribution = {
    ...mockThesisContrib,
    id: 'c2',
    stage: mockAntithesisStage.slug, 
    original_model_contribution_id: 'c2',
    model_name: 'Claude 3',
    file_name: 'claude-3_antithesis_contribution.md',
    storage_path: 'project-123/session-abc/iteration_1/antithesis/claude-3_antithesis_contribution.md',
    mime_type: 'text/markdown',
    size_bytes: 160,
    contribution_type: 'model_contribution',
    raw_response_storage_path: 'path/to/raw/c2.json',
    seed_prompt_url: 'path/to/seed/prompt_c2.md',
    prompt_template_id_used: 'p2',
    storage_bucket: 'dialectic-content',
  };

  const mockBaseSession: DialecticSession = {
    id: 'sess-1',
    project_id: 'proj-1',
    status: 'thesis_complete',
    iteration_count: 1,
    dialectic_contributions: [mockThesisContrib, mockAntithesisContrib],
    session_description: 'A session',
    current_stage_id: mockThesisStage.id,
    user_input_reference_url: null,
    selected_model_catalog_ids: [],
    associated_chat_id: 'c1',
    created_at: '2023-01-01T10:00:00Z',
    updated_at: '2023-01-01T11:00:00Z',
  };

  const mockProject: DialecticProject = {
    id: 'proj-1',
    user_id: 'u1',
    project_name: 'p1',
    initial_user_prompt: 'ipu',
    selected_domain_id: 'd1',
    dialectic_domains: { name: 'Software Development' },
    dialectic_process_templates: {
      created_at: '2023-01-01T09:00:00Z',
      description: 'pt-1',
      id: 'pt-1',
      name: 'pt-1',
      starting_stage_id: 's1',
    },
    process_template_id: 'pt-1',
    dialectic_sessions: [mockBaseSession],
    selected_domain_overlay_id: null,
    initial_prompt_resource_id: null,
    repo_url: null,
    status: 'active',
    created_at: '2023-01-01T09:00:00Z',
    updated_at: '2023-01-01T09:00:00Z',
    isLoadingProcessTemplate: false,
    processTemplateError: null,
    contributionGenerationStatus: 'idle',
    generateContributionsError: null,
    isSubmittingStageResponses: false,
    submitStageResponsesError: null,
    isSavingContributionEdit: false,
    saveContributionEditError: null,
  };

  const setup = (
    {
      projectInStore = mockProject,
      activeSessionInStore = mockBaseSession,
      activeStageInStore = mockThesisStage,
      overrides = {},
      isStageReadyOverride = true,
      mockFeedbackDataOverride = null as DialecticFeedback[] | null
    }: {
      projectInStore?: DialecticProject | null;
      activeSessionInStore?: DialecticSession | null;
      activeStageInStore?: DialecticStage | null;
      overrides?: Partial<DialecticStateValues>;
      isStageReadyOverride?: boolean;
      mockFeedbackDataOverride?: DialecticFeedback[] | null;
    } = {}
  ) => {
    const initialState: Partial<DialecticStateValues> = {
      currentProjectDetail: projectInStore,
      activeSessionDetail: activeSessionInStore, 
      activeContextStage: activeStageInStore,
      activeContextSessionId: activeSessionInStore?.id || null,
      activeContextProjectId: projectInStore?.id || null, 
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
      isLoadingProjectDetail: false,
      contributionGenerationStatus: 'idle',
      projectDetailError: null,
      currentFeedbackFileContent: null,
      isFetchingFeedbackFileContent: false,
      fetchFeedbackFileContentError: null,
      ...(overrides || {}),
    };

    initializeMockDialecticState(initialState);
    useDialecticStore.setState({
      submitStageResponses: mockSubmitStageResponses,
      setActiveDialecticContext: mockSetActiveDialecticContext,
      resetSubmitStageResponsesError: mockResetSubmitStageResponsesError,
      fetchFeedbackFileContent: mockFetchFeedbackFileContent,
      clearCurrentFeedbackFileContent: mockClearCurrentFeedbackFileContent,
      resetFetchFeedbackFileContentError: mockResetFetchFeedbackFileContentError,
    });

    mockFetchFeedbackFileContent.mockResolvedValue(undefined);

    (selectIsStageReadyForSessionIteration as unknown as MockInstance).mockReturnValue(isStageReadyOverride);
    (selectFeedbackForStageIteration as unknown as MockInstance).mockReturnValue(mockFeedbackDataOverride);
    (selectActiveContextStage as unknown as MockInstance).mockReturnValue(activeStageInStore);
    (selectCurrentProjectDetail as unknown as MockInstance).mockReturnValue(projectInStore);
    
    (selectIsLoadingProjectDetail as unknown as MockInstance).mockReturnValue(initialState.isLoadingProjectDetail ?? false);
    (selectContributionGenerationStatus as unknown as MockInstance).mockReturnValue(initialState.contributionGenerationStatus ?? 'idle');
    (selectProjectDetailError as unknown as MockInstance).mockReturnValue(initialState.projectDetailError ?? null);

    return render(<SessionContributionsDisplayCard />); 
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const freshInitialState = getDialecticStoreState();
    initializeMockDialecticState({
        ...freshInitialState,
        currentProjectDetail: null,
        activeSessionDetail: null,
        activeContextStage: null,
        isLoadingProjectDetail: false,
        contributionGenerationStatus: 'idle',
        projectDetailError: null,
        isSubmittingStageResponses: false,
        submitStageResponsesError: null,
    });

    (selectIsStageReadyForSessionIteration as unknown as MockInstance).mockReturnValue(false);
    (selectFeedbackForStageIteration as unknown as MockInstance).mockReturnValue(null);
    (selectActiveContextStage as unknown as MockInstance).mockReturnValue(null);
    (selectCurrentProjectDetail as unknown as MockInstance).mockReturnValue(null);
    (selectIsLoadingProjectDetail as unknown as MockInstance).mockReturnValue(false);
    (selectContributionGenerationStatus as unknown as MockInstance).mockReturnValue('idle');
    (selectProjectDetailError as unknown as MockInstance).mockReturnValue(null);
  });

  describe('Contribution Display Logic', () => {
    it('should display contributions for the active stage and iteration from store', () => {
      const sessionWithThesisOnly = {
          ...mockBaseSession, 
          dialectic_contributions: [mockThesisContrib]
      };
      setup({ 
        activeSessionInStore: sessionWithThesisOnly,
        activeStageInStore: mockThesisStage 
      });
      expect(screen.getByTestId('generated-contribution-card-c1')).toBeInTheDocument();
      expect(screen.queryByTestId('generated-contribution-card-c2')).not.toBeInTheDocument();
    });

    it('should display no contributions if active stage has none for current iteration in store', () => {
      const sessionWithOnlyAntithesis = {
        ...mockBaseSession,
        dialectic_contributions: [mockAntithesisContrib] 
      };
      setup({ 
        activeSessionInStore: sessionWithOnlyAntithesis,
        activeStageInStore: mockThesisStage
      });
      expect(screen.queryByText(/No contributions have been generated for Thesis in this iteration yet./i)).toBeInTheDocument();
      expect(screen.queryByTestId('generated-contribution-card-c1')).not.toBeInTheDocument();
    });

    it('should handle scenario where session has no contributions at all from store', () => {
      const sessionWithNoContributions = {
        ...mockBaseSession,
        dialectic_contributions: [] 
      };
      setup({
        activeSessionInStore: sessionWithNoContributions,
        activeStageInStore: mockThesisStage
      });
      expect(screen.queryByText(/No contributions have been generated for Thesis in this iteration yet./i)).toBeInTheDocument();
    });

    it('should correctly filter contributions based on session iteration_count from store', () => {
      const contribIter1 = { ...mockThesisContrib, id: 'c_iter1', original_model_contribution_id: 'c_iter1', iteration_number: 1 };
      const contribIter2 = { ...mockThesisContrib, id: 'c_iter2', original_model_contribution_id: 'c_iter2', iteration_number: 2 };
      const sessionIter2Active = {
            ...mockBaseSession,
            iteration_count: 2, 
            dialectic_contributions: [contribIter1, contribIter2]
      };
      setup({
        activeSessionInStore: sessionIter2Active,
        activeStageInStore: mockThesisStage
      });
      expect(screen.queryByTestId('generated-contribution-card-c_iter1')).not.toBeInTheDocument();
      expect(screen.getByTestId('generated-contribution-card-c_iter2')).toBeInTheDocument();
    });
  });

  describe('Feedback Submission Logic (with store-derived session/project)', () => {
    it('should call submitStageResponses with correct payload using store data when submitting feedback', async () => {
      const feedbackText = 'This is a test feedback.';
      const sessionForFeedbackTest = {
        ...mockBaseSession,
        dialectic_contributions: [mockThesisContrib, mockAntithesisContrib]
      };
      setup({ 
        projectInStore: mockProject, 
        activeSessionInStore: sessionForFeedbackTest, 
        activeStageInStore: mockThesisStage 
      });

      const textarea = screen.getByTestId(`response-textarea-${mockThesisContrib.original_model_contribution_id}`);
      fireEvent.change(textarea, { target: { value: feedbackText } });

      const submitButton = screen.getByRole('button', { name: /Submit Responses & Proceed/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSubmitStageResponses).toHaveBeenCalledTimes(1);
        expect(mockSubmitStageResponses).toHaveBeenCalledWith({
          sessionId: 'sess-1',
          projectId: 'proj-1',
          stageSlug: 'thesis',
          currentIterationNumber: 1,
          responses: [],
          userStageFeedback: {
            content: expect.stringContaining(feedbackText),
            feedbackType: 'StageContributionResponses_v1',
          },
        });
      });
    });
  });

  describe('Loading and Error States (driven by store)', () => {
    it('should display loading skeletons when isLoadingProjectDetail is true and no contributions are initially displayed', () => {
      // Ensure no contributions for the active stage to trigger the skeleton loading state
      const sessionWithNoThesisContributions = {
        ...mockBaseSession,
        dialectic_contributions: [mockAntithesisContrib] // Only antithesis, so thesis stage has none
      };
      setup({ 
        overrides: { 
          isLoadingProjectDetail: true,
          contributionGenerationStatus: 'idle', // Ensure not generating
          projectDetailError: null,
        },
        activeSessionInStore: sessionWithNoThesisContributions,
        activeStageInStore: mockThesisStage 
      });
      expect(screen.getByTestId('contributions-loading-skeletons')).toBeInTheDocument();
      expect(screen.getByText(/Loading new contributions.../i)).toBeInTheDocument();
      // Also check the card title is still there
      expect(screen.getByText(`Contributions for: ${mockThesisStage.display_name}`)).toBeInTheDocument();
    });

    it('should display "Contributions are being generated" when contributionGenerationStatus is "generating"', () => {
      setup({ overrides: { contributionGenerationStatus: 'generating' } });
      const generatingSpinnerContainer = screen.getByTestId('contributions-generating-spinner');
      expect(generatingSpinnerContainer).toBeInTheDocument();
      // Use a function to check for the presence of both parts of the text within the specific container
      expect(within(generatingSpinnerContainer).getByText((content, element) => {
        if (!element) return false;
        // Check text within the direct children paragraphs of the container
        const pElements = Array.from(element.querySelectorAll(':scope > p'));
        const hasPart1 = pElements.some(p => p.textContent?.includes('Contributions are being generated.'));
        const hasPart2 = pElements.some(p => p.textContent?.includes('This card will update shortly.'));
        return hasPart1 && hasPart2;
      })).toBeInTheDocument();
    });
    
    it('should display project detail error message if projectDetailError is present in store and not generating', () => {
      const error: ApiError = { message: 'Network Error', code: 'NETWORK_ISSUE' };
      setup({ 
        overrides: { 
          projectDetailError: error,
          isLoadingProjectDetail: false, // Ensure not loading
          contributionGenerationStatus: 'idle' // Ensure not generating
        } 
      });
      const fetchErrorContainer = screen.getByTestId('contributions-fetch-error');
      expect(fetchErrorContainer).toBeInTheDocument();
      expect(within(fetchErrorContainer).getByText('Error Loading Contributions')).toBeInTheDocument();
      // MODIFIED: Correctly query for the alert box and then its description
      const alertBox = fetchErrorContainer.querySelector('[data-slot="alert"]');
      expect(alertBox).toBeInTheDocument();
      const alertDescription = alertBox?.querySelector('[data-slot="alert-description"]');
      expect(alertDescription).toBeInTheDocument();
      expect(alertDescription?.textContent).toContain(`Failed to load contributions: ${error.message}. Please try refreshing or generating again.`);
    });

    it('should display generate contributions error message if contributionGenerationStatus is "failed" and projectDetailError is present', () => {
      const error: ApiError = { message: 'Failed to generate contributions', code: 'GENERATION_ERROR' };
      setup({ 
        overrides: { 
          contributionGenerationStatus: 'failed',
          projectDetailError: error, 
          isLoadingProjectDetail: false 
        } 
      });
      const generationErrorContainer = screen.getByTestId('contributions-generation-error');
      expect(generationErrorContainer).toBeInTheDocument();
      expect(within(generationErrorContainer).getByText('Error Generating Contributions')).toBeInTheDocument();
      // MODIFIED: Correctly query for the alert box and then its description
      const alertBox = generationErrorContainer.querySelector('[data-slot="alert"]');
      expect(alertBox).toBeInTheDocument();
      const alertDescription = alertBox?.querySelector('[data-slot="alert-description"]');
      expect(alertDescription).toBeInTheDocument();
      expect(alertDescription?.textContent).toContain(`Failed to generate contributions: ${error.message}. Please try again.`);
    });
  });

  describe('General UI and No Contributions Message', () => {
    it('should display no contributions message if session has no contributions for the active stage and iteration', () => {
      const sessionWithOnlyAntithesisContributions = {
        ...mockBaseSession,
        dialectic_contributions: [mockAntithesisContrib]
      };
      setup({ 
        projectInStore: mockProject, 
        activeSessionInStore: sessionWithOnlyAntithesisContributions,
        activeStageInStore: mockThesisStage, 
      });
      expect(screen.getByTestId('no-contributions-yet')).toBeInTheDocument();
      expect(screen.getByText(/No contributions have been generated for Thesis in this iteration yet./i)).toBeInTheDocument();
    });

    it('should display fetched feedback content in a modal', async () => {
      setup({ 
        mockFeedbackDataOverride: [mockFeedback],
      });
      
      // Mock the store state update that happens on successful fetch
      mockFetchFeedbackFileContent.mockImplementationOnce(async () => {
        useDialecticStore.setState({ 
          currentFeedbackFileContent: mockFetchedContent,
          isFetchingFeedbackFileContent: false,
          fetchFeedbackFileContentError: null,
        });
        return { data: mockFetchedContent, error: null, status: 200 }; // Ensure it returns ApiResponse structure
      });

      const viewButton = screen.getByRole('button', { name: /View Feedback Content/i });
      fireEvent.click(viewButton);

      const dialog = await screen.findByRole('alertdialog'); // MODIFIED: Wait for alertdialog
      expect(dialog).toBeInTheDocument();
      // Corrected modal title assertion
      expect(within(dialog).getByText(`Feedback Content: ${mockFeedback.file_name}`)).toBeInTheDocument();
      expect(within(dialog).getByRole('heading', { name: 'Feedback', level: 1 })).toBeInTheDocument();
      expect(within(dialog).getByText('This is the markdown feedback.')).toBeInTheDocument();
    });

    it('displays error message in modal if fetching feedback content fails', async () => {
      setup({ mockFeedbackDataOverride: [mockFeedback] });
      const error: ApiError = { message: 'Could not load feedback.', code: 'FETCH_ERROR' };
      
      mockFetchFeedbackFileContent.mockImplementationOnce(async () => {
        useDialecticStore.setState({ 
          fetchFeedbackFileContentError: error,
          isFetchingFeedbackFileContent: false,
          currentFeedbackFileContent: null,
        });
        // Simulate the actual return type of the store action on error
        return { data: null, error, status: 500 }; 
      });

      const viewButton = screen.getByRole('button', { name: /View Feedback Content/i });
      fireEvent.click(viewButton);
      
      const dialog = await screen.findByRole('alertdialog'); // MODIFIED: Wait for alertdialog
      expect(dialog).toBeInTheDocument();

      // Corrected modal title assertion
      expect(within(dialog).getByText(`Feedback Content: ${mockFeedback.file_name}`)).toBeInTheDocument();
      expect(within(dialog).getByText('Error Loading Content')).toBeInTheDocument();
      expect(within(dialog).getByText(error.message)).toBeInTheDocument();
    });

    it('closes the modal and calls clearCurrentFeedbackFileContent when "Close" button is clicked', async () => {
      setup({ mockFeedbackDataOverride: [mockFeedback] });
      // Mock successful fetch to show content initially
      mockFetchFeedbackFileContent.mockImplementationOnce(async () => {
        useDialecticStore.setState({
          currentFeedbackFileContent: mockFetchedContent,
          isFetchingFeedbackFileContent: false,
          fetchFeedbackFileContentError: null,
        });
        return { data: mockFetchedContent, error: null, status: 200 };
      });

      const viewButton = screen.getByRole('button', { name: /View Feedback Content/i });
      fireEvent.click(viewButton);

      const dialog = await screen.findByRole('alertdialog'); // MODIFIED: findByRole alertdialog
      expect(dialog).toBeInTheDocument();

      const closeButton = within(dialog).getByRole('button', { name: /Close/i });
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(); // MODIFIED: queryByRole alertdialog
      });
      expect(mockClearCurrentFeedbackFileContent).toHaveBeenCalledTimes(1);
    });
  });

  // Test for when activeSessionDetail or activeContextStage is null/undefined
  describe('Edge Cases: Missing Store Data', () => {
    it('should display an appropriate message or loading state if activeSessionDetail is null', () => {
      setup({ activeSessionInStore: null });
      // Component shows a specific message when essential context is missing
      expect(screen.getByText('Loading Contributions...')).toBeInTheDocument();
      expect(screen.getByText('Waiting for project, active session, and stage context...')).toBeInTheDocument();
    });

    it('should display an appropriate message if activeContextStage is null but session is present', () => {
      setup({ activeStageInStore: null });
      // Component shows a specific message when essential context is missing
      expect(screen.getByText('Loading Contributions...')).toBeInTheDocument();
      expect(screen.getByText('Waiting for project, active session, and stage context...')).toBeInTheDocument();
    });

    it('should not attempt to render contributions or submit if essential data is missing', () => {
      setup({ activeSessionInStore: null });
      expect(screen.queryByTestId(/generated-contribution-card-/)).toBeNull();
      const submitButton = screen.queryByRole('button', { name: /Submit Responses & Proceed/i });
      // The button might be disabled or not rendered. If rendered and disabled:
      // expect(submitButton).toBeDisabled(); 
      // If not rendered:
      expect(submitButton).toBeNull();
    });
  });
}); 