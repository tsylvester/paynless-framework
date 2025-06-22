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
  // Import the actual mock module
  const actualDialecticStoreMock = await vi.importActual<typeof import('../../mocks/dialecticStore.mock')>('../../mocks/dialecticStore.mock');
  return {
    __esModule: true, // Required for ES modules when using await vi.importActual
    ...actualDialecticStoreMock, // Spread all exports from the mock, including the vi.fn() for the selector
    // Ensure all selectors used by the component are vi.fn()
    useDialecticStore: actualDialecticStoreMock.useDialecticStore, // Keep the actual store hook
    // Selectors should be defined as vi.fn() so their return values can be controlled per test
    selectIsStageReadyForSessionIteration: vi.fn(), 
    selectFeedbackForStageIteration: vi.fn(),       // ADDED
    selectIsLoadingProjectDetail: vi.fn(),          // CHANGED from actualStore
    selectContributionGenerationStatus: vi.fn(),    // CHANGED from actualStore
    selectProjectDetailError: vi.fn(),              // CHANGED from actualStore
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
  ContributionGenerationStatus,
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
  selectProjectDetailError
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
        ...mockSession,
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

  // ADDED: Mock functions for new actions
  const mockFetchFeedbackFileContent = vi.fn();
  const mockClearCurrentFeedbackFileContent = vi.fn();
  const mockResetFetchFeedbackFileContentError = vi.fn();

  const mockThesisContrib: DialecticContribution = {
    id: 'c1',
    stage: mockThesisStage,
    original_model_contribution_id: 'c1',
    is_latest_edit: true,
    session_id: 'sess-1',
    iteration_number: 1,
    created_at: '2023-01-01T12:00:00Z',
    updated_at: '2023-01-01T12:00:00Z',
    user_id: 'u1',
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
  };

  const mockAntithesisContrib: DialecticContribution = {
    ...mockThesisContrib,
    id: 'c2',
    stage: mockAntithesisStage,
    original_model_contribution_id: 'c2',
    model_name: 'Claude 3',
  };

  const mockSession: DialecticSession = {
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
    dialectic_domains: {
      name: 'Software Development',
    },
    dialectic_process_templates: {
      created_at: '2023-01-01T09:00:00Z',
      description: 'pt-1',
      id: 'pt-1',
      name: 'pt-1',
      starting_stage_id: 's1',
    },
    process_template_id: 'pt-1',
    dialectic_sessions: [mockSession],
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
    project: DialecticProject | null,
    activeSessionId: string | null,
    activeStage: DialecticStage | null,
    overrides?: Partial<DialecticStateValues>, 
    isStageReadyOverride: boolean = true,
    isLoadingDetailsOverride: boolean = false,
    generationStatusOverride: ContributionGenerationStatus = 'idle',
    projectErrorOverride: ApiError | null = null,
    // ADDED: Override for feedback data
    mockFeedbackDataOverride: DialecticFeedback[] | null = null 
  ) => {
    const initialState: DialecticStateValues = {
      ...getDialecticStoreState(), 
      currentProjectDetail: project,
      activeContextSessionId: activeSessionId,
      activeContextStage: activeStage,
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
      isLoadingProjectDetail: isLoadingDetailsOverride,
      contributionGenerationStatus: generationStatusOverride,
      projectDetailError: projectErrorOverride,
      // ADDED: Initial state for feedback content fetching
      currentFeedbackFileContent: null,
      isFetchingFeedbackFileContent: false,
      fetchFeedbackFileContentError: null,
      ...overrides, 
    };

    initializeMockDialecticState(initialState);
    // UPDATED: Include new mock actions
    useDialecticStore.setState({
      submitStageResponses: mockSubmitStageResponses,
      setActiveDialecticContext: mockSetActiveDialecticContext,
      resetSubmitStageResponsesError: mockResetSubmitStageResponsesError,
      // ADDED: New actions
      fetchFeedbackFileContent: mockFetchFeedbackFileContent,
      clearCurrentFeedbackFileContent: mockClearCurrentFeedbackFileContent,
      resetFetchFeedbackFileContentError: mockResetFetchFeedbackFileContentError,
    });

    // ADDED: Ensure mockFetchFeedbackFileContent returns a resolved promise by default
    mockFetchFeedbackFileContent.mockResolvedValue(undefined);

    // UPDATED: Mock return values for all relevant selectors
    (selectIsStageReadyForSessionIteration as unknown as MockInstance<
        [DialecticStateValues, string, string, string],
        boolean
    >).mockReturnValue(isStageReadyOverride);

    (selectFeedbackForStageIteration as unknown as MockInstance<
        [DialecticStateValues, string, string, string, number],
        DialecticFeedback[] | null
    >).mockReturnValue(mockFeedbackDataOverride);
    
    (selectIsLoadingProjectDetail as unknown as MockInstance<
        [DialecticStateValues],
        boolean
    >).mockReturnValue(isLoadingDetailsOverride);

    (selectContributionGenerationStatus as unknown as MockInstance<
        [DialecticStateValues],
        ContributionGenerationStatus
    >).mockReturnValue(generationStatusOverride);

    (selectProjectDetailError as unknown as MockInstance<
        [DialecticStateValues],
        ApiError | null
    >).mockReturnValue(projectErrorOverride);

    const activeSession = project?.dialectic_sessions?.find(s => s.id === activeSessionId);

    render(<SessionContributionsDisplayCard session={activeSession} activeStage={activeStage} />);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default setup REMOVED from here
  });

  it('renders contributions for the active stage only', () => {
    setup(mockProject, 'sess-1', mockThesisStage, {}, true, false, 'idle', null);
    expect(screen.getByTestId('generated-contribution-card-c1')).toBeInTheDocument();
    expect(screen.queryByTestId('generated-contribution-card-c2')).not.toBeInTheDocument();
  });

  it('displays correct elements when stage is ready but there are no contributions for the active stage', () => {
    const mockSynthesisStage: DialecticStage = { ...mockThesisStage, id: 's3', slug: 'synthesis', display_name: 'Synthesis' };
    const projectWithNoSynthContributions: DialecticProject = {
      ...mockProject,
      dialectic_sessions: mockProject.dialectic_sessions ? mockProject.dialectic_sessions.map(s => {
        if (s.id === 'sess-1') {
          return {
            ...s,
            // Ensure no contributions for synthesis stage in iteration 1
            dialectic_contributions: s.dialectic_contributions?.filter(
              c => !(c.stage.slug === mockSynthesisStage.slug && c.iteration_number === s.iteration_count)
            ) || []
          };
        }
        return s;
      }) : []
    };
    setup(projectWithNoSynthContributions, 'sess-1', mockSynthesisStage, {}, true, false, 'idle', null);
    
    expect(screen.getByText(`Contributions for: ${mockSynthesisStage.display_name}`)).toBeInTheDocument();
    expect(screen.getByText(/Review the generated contributions below./i)).toBeInTheDocument(); // CardDescription
    expect(screen.queryByTestId(/generated-contribution-card-/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit Responses & Proceed/i })).not.toBeInTheDocument();
  });
  
  it('does NOT render the GenerateContributionButton when no contributions exist for the stage', () => {
    const mockSynthesisStage: DialecticStage = { ...mockThesisStage, id: 's3', slug: 'synthesis', display_name: 'Synthesis' };
    // Similar setup: ensure no contributions for this stage
     const projectWithNoSynthContributions: DialecticProject = {
      ...mockProject,
      dialectic_sessions: mockProject.dialectic_sessions ? mockProject.dialectic_sessions.map(s => {
        if (s.id === 'sess-1') {
          return {
            ...s,
            dialectic_contributions: s.dialectic_contributions?.filter(
              c => !(c.stage.slug === mockSynthesisStage.slug && c.iteration_number === s.iteration_count)
            ) || []
          };
        }
        return s;
      }) : []
    };
    setup(projectWithNoSynthContributions, 'sess-1', mockSynthesisStage, {}, true, false, 'idle', null);
    expect(screen.queryByTestId('generate-contributions-button-mock')).not.toBeInTheDocument();
  });

  it('displays a "Stage Not Ready" message and no contributions when the stage is not ready', () => {
    setup(mockProject, 'sess-1', mockThesisStage, {}, false, false, 'idle', null); // Explicitly set isStageReadyOverride to false

    expect(screen.getByText('Stage Not Ready')).toBeInTheDocument(); // AlertTitle
    expect(screen.getByText(/The seed prompt for this stage and iteration is not yet available. Contributions cannot be displayed or generated./i)).toBeInTheDocument(); // AlertDescription
    expect(screen.queryByTestId(/generated-contribution-card-/)).not.toBeInTheDocument(); // No contribution cards
    expect(screen.queryByRole('button', { name: /Submit Responses & Proceed/i })).not.toBeInTheDocument(); // No submit button
  });

  it('manages local state for user responses correctly', () => {
    setup(mockProject, 'sess-1', mockThesisStage, {}, true, false, 'idle', null);
    const textarea: HTMLTextAreaElement = screen.getByTestId('response-textarea-c1');
    
    expect(textarea.value).toBe('');
    fireEvent.change(textarea, { target: { value: 'This is a test response.' } });
    expect(textarea.value).toBe('This is a test response.');
  });
  
  it('shows the "Submit Responses & Proceed" button as enabled by default when contributions are present', () => {
    setup(mockProject, 'sess-1', mockThesisStage, {}, true, false, 'idle', null);
    const submitButton = screen.getByRole('button', { name: /Submit Responses & Proceed/i });
    expect(submitButton).toBeInTheDocument();
    expect(submitButton).toBeEnabled();
  });

  it('disables the "Submit Responses & Proceed" button when isSubmittingStageResponses is true', () => {
    setup(mockProject, 'sess-1', mockThesisStage, {isSubmittingStageResponses: true}, true, false, 'idle', null);
    const submitButton = screen.getByRole('button', { name: /Submit Responses & Proceed/i });
    expect(submitButton).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
  });
  
  it('calls submitStageResponses with the correct payload when the submit button is clicked (with responses)', async () => {
    const projectWithSession = {
      ...mockProject,
      dialectic_sessions: [mockSession],
    };
    setup(projectWithSession, 'sess-1', mockThesisStage, {
      isSubmittingStageResponses: false,
    });

    // Simulate user typing a response
    const textarea = screen.getByTestId('response-textarea-c1') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'My detailed feedback.' } });

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
          content: `## Feedback for Contribution by GPT-4 (ID: c1...)

My detailed feedback.

---

`,
          feedbackType: 'StageContributionResponses_v1',
        },
      });
    });

    // Check for success message after submission
    await waitFor(() => {
      expect(screen.getByText('Responses submitted successfully. The next stage is being prepared.')).toBeInTheDocument();
    });
  });

  it('disables the submit button while submitting and shows loading state', () => {
    setup(mockProject, 'sess-1', mockThesisStage, { isSubmittingStageResponses: true }, true, false, 'idle', null);
    
    const submitButton = screen.getByRole('button', { name: /Submit Responses & Proceed/i });
    expect(submitButton).toBeDisabled();
    // Check for loader icon within the button
    expect(within(submitButton).getByTestId('loader-icon')).toBeInTheDocument();
    expect(within(submitButton).getByTestId('loader-icon')).toHaveClass('animate-spin');
  });
  
  it('displays an error message if submitting responses fails', () => {
    const error: ApiError = { code: '500', message: 'Submission failed', details: 'Server error' };
    setup(mockProject, 'sess-1', mockThesisStage, { submitStageResponsesError: error }, true, false, 'idle', null);

    expect(screen.getByText(/Submission failed/i)).toBeInTheDocument();
  });

  // --- New Tests for Loading, Error, and Empty States ---

  it('should display contributions for the active stage and iteration', () => {
    setup(mockProject, mockSession.id, mockThesisStage, {}, true, false, 'idle', null);
    expect(screen.getByTestId('generated-contribution-card-c1')).toBeInTheDocument();
  });

  it('should display spinner when contributionGenerationStatus is "initiating"', () => {
    setup(mockProject, mockSession.id, mockThesisStage, {}, true, false, 'initiating', null);
    expect(screen.getByTestId('contributions-generating-spinner')).toBeInTheDocument();
    expect(screen.getByText(/Contributions are being generated./i)).toBeInTheDocument();
  });

  it('should display spinner when contributionGenerationStatus is "generating"', () => {
    setup(mockProject, mockSession.id, mockThesisStage, {}, true, false, 'generating', null);
    expect(screen.getByTestId('contributions-generating-spinner')).toBeInTheDocument();
  });

  it('should display stage not ready message if stage is not ready and generation is idle', () => {
    setup(mockProject, mockSession.id, mockThesisStage, {}, false, false, 'idle', null);
    expect(screen.getByTestId('stage-not-ready-alert')).toBeInTheDocument();
    expect(screen.getByText(/The seed prompt for this stage and iteration is not yet available./i)).toBeInTheDocument();
  });

  it('should display loading skeletons when isLoadingCurrentProjectDetail is true, generation is idle, and no contributions displayed', () => {
    const projectWithNoContributions = {
      ...mockProject,
      dialectic_sessions: [{
        ...mockSession,
        dialectic_contributions: [], // Ensure no contributions to trigger skeleton
      }]
    };
    setup(projectWithNoContributions, mockSession.id, mockThesisStage, {}, true, true, 'idle', null);
    expect(screen.getByTestId('contributions-loading-skeletons')).toBeInTheDocument();
    expect(screen.getByText(/Loading new contributions.../i)).toBeInTheDocument();
    // GeneratedContributionCardSkeleton has 6 skeleton elements with role="status"
    // The test renders two such cards when loading.
    const skeletons = screen.getAllByRole('status');
    expect(skeletons.length).toBe(12); 
  });

  it('should display projectDetailError if present, generation is idle, and not loading details', () => {
    const error: ApiError = { message: 'Failed to fetch details!', code: 'FETCH_ERROR' };
    setup(mockProject, mockSession.id, mockThesisStage, {}, true, false, 'idle', error);
    expect(screen.getByTestId('contributions-fetch-error')).toBeInTheDocument();
    expect(screen.getByText(/Error Loading Contributions/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed to load contributions: Failed to fetch details!/i)).toBeInTheDocument();
  });

  it('should display "no contributions yet" message when stage is ready, idle, not loading, no error, and no contributions', () => {
    const projectWithNoContributions = {
      ...mockProject,
      dialectic_sessions: [{
        ...mockSession,
        dialectic_contributions: [], // Ensure no contributions
      }]
    };
    setup(projectWithNoContributions, mockSession.id, mockThesisStage, {}, true, false, 'idle', null);
    expect(screen.getByTestId('no-contributions-yet')).toBeInTheDocument();
    expect(screen.getByText(/No contributions have been generated for Thesis in this iteration yet./i)).toBeInTheDocument();
  });

  // --- End of New Tests ---

  it('should not display antithesis contributions when thesis stage is active', () => {
    setup(mockProject, mockSession.id, mockThesisStage, {}, true, false, 'idle', null);
    expect(screen.queryByTestId('generated-contribution-card-c2')).not.toBeInTheDocument();
  });

  it('shows confirmation modal when submitting without responses and no edits', async () => {
    setup(mockProject, 'sess-1', mockThesisStage, {}, true, false, 'idle', null);
    const submitButton = screen.getByRole('button', { name: /Submit Responses & Proceed/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Proceed Without Feedback?')).toBeInTheDocument();
    });
    // Click cancel
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);
    await waitFor(() => {
        expect(screen.queryByText('Proceed Without Feedback?')).not.toBeInTheDocument();
    });
    expect(mockSubmitStageResponses).not.toHaveBeenCalled();
  });

  it('proceeds with submission from confirmation modal', async () => {
    setup(mockProject, 'sess-1', mockThesisStage, {}, true, false, 'idle', null);
    const submitButton = screen.getByRole('button', { name: /Submit Responses & Proceed/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Proceed Without Feedback?')).toBeInTheDocument();
    });
    
    const proceedButton = screen.getByRole('button', { name: 'Proceed' });
    fireEvent.click(proceedButton);

    await waitFor(() => {
      expect(mockSubmitStageResponses).toHaveBeenCalledTimes(1);
      expect(mockSubmitStageResponses).toHaveBeenCalledWith({
        sessionId: 'sess-1',
        projectId: 'proj-1',
        stageSlug: 'thesis',
        currentIterationNumber: 1,
        responses: [], // No responses in this case
      });
    });
  });

  // ADDED: New test suite for feedback display and content viewing
  describe('Feedback Display and Content Viewing', () => {
    const mockFeedback: DialecticFeedback = {
      id: 'fb-1',
      project_id: 'proj-1',
      session_id: 'sess-1',
      stage_slug: 'thesis',
      iteration_number: 1,
      file_name: 'feedback_for_thesis_iter_1.md',
      storage_bucket: 'dialectic-feedback',
      storage_path: 'proj-1/sess-1/thesis/1/feedback.md',
      feedback_type: 'StageContributionResponses_v1',
      created_at: '2023-10-26T10:00:00Z',
      updated_at: '2023-10-26T10:00:00Z',
      user_id: 'u1',
      mime_type: 'text/markdown',
      size_bytes: 1234,
    };

    const mockFeedbackContentResponse: GetProjectResourceContentResponse = {
      content: "## Mock Feedback\n\nThis is the content.",
      fileName: "feedback_for_thesis_iter_1.md",
      mimeType: "text/markdown",
    };

    it('displays feedback metadata and "View Feedback Content" button when feedback exists for the stage/iteration', () => {
      setup(mockProject, 'sess-1', mockThesisStage, {}, true, false, 'idle', null, [mockFeedback]);

      expect(screen.getByText('Stage Feedback Summary')).toBeInTheDocument();
      // Use a regex to find the text parts, allowing for intervening elements like spans
      expect(screen.getByText((content, element) => {
        const hasText = (node: Element | null) => node?.textContent?.includes('Feedback File:') && node?.textContent?.includes(mockFeedback.file_name) || false;
        const elementHasText = hasText(element);
        const childrenDontHaveText = Array.from(element?.children || []).every(child => !hasText(child));
        return elementHasText && childrenDontHaveText;
      })).toBeInTheDocument();
      expect(screen.getByText(`Submitted on: ${new Date(mockFeedback.created_at).toLocaleString()}`)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'View Feedback Content' })).toBeInTheDocument();
    });

    it('does not display feedback section if no feedback exists for the stage/iteration', () => {
      setup(mockProject, 'sess-1', mockThesisStage, {}, true, false, 'idle', null, null); // No feedback
      expect(screen.queryByText('Stage Feedback Summary')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'View Feedback Content' })).not.toBeInTheDocument();
    });

    it('calls fetchFeedbackFileContent and opens modal when "View Feedback Content" button is clicked', async () => {
      setup(mockProject, 'sess-1', mockThesisStage, {}, true, false, 'idle', null, [mockFeedback]);
      
      const viewButton = screen.getByRole('button', { name: 'View Feedback Content' });
      fireEvent.click(viewButton);

      expect(mockFetchFeedbackFileContent).toHaveBeenCalledWith({
        projectId: mockFeedback.project_id,
        storagePath: mockFeedback.storage_path,
      });

      // Wait for modal to appear (modal title can be used as an indicator)
      await waitFor(() => {
        expect(screen.getByText(/Feedback Content:/)).toBeInTheDocument();
      });
    });

    it('displays loading spinner in modal while fetching feedback content', async () => {
      const sessionWithFeedback: DialecticSession = {
        ...mockSession,
        dialectic_contributions: [mockThesisContrib], 
      };

      const projectWithFeedbackSession: DialecticProject = {
        ...mockProject,
        id: 'proj-feedback-test', // Ensure a unique ID if it matters for other parts of the test context
        dialectic_sessions: [sessionWithFeedback],
      };

      // Ensure currentProjectDetail in the store has the project data
      setup(
        projectWithFeedbackSession, // This will set currentProjectDetail in the store via setup's logic
        sessionWithFeedback.id,
        mockThesisStage,
        { 
          currentProjectDetail: projectWithFeedbackSession, // Explicitly set it in overrides as well for clarity
          currentFeedbackFileContent: null,
          isFetchingFeedbackFileContent: false, 
          fetchFeedbackFileContentError: null,
        },
        true, 
        false, 
        'idle', 
        null, 
        [mockFeedback]
      );

      mockFetchFeedbackFileContent.mockImplementation(() => {
        useDialecticStore.setState({ isFetchingFeedbackFileContent: true });
        return new Promise(() => {}); 
      });

      render(
        <SessionContributionsDisplayCard
          // Remove the project prop, as the component gets it from the store
          session={sessionWithFeedback} // Pass the session directly as per component props
          activeStage={mockThesisStage}
          // Props below are not part of the defined SessionContributionsDisplayCardProps, 
          // but were in the previous version of the test code. Review if they are still needed or handled differently.
          // displayedContributions={[mockThesisContrib]} 
          // stageResponses={{}}
          // onStageResponseChange={() => {}}
          // onProceedToNextStage={() => {}}
          // onGenerateContribution={() => {}}
          // onEditContribution={() => {}}
          // contextualHelpContent={{ title: 'Help', content: 'Help content' }}
        />
      );

      const viewButton = screen.getByRole('button', { name: /View Feedback Content/i });
      expect(viewButton).toBeEnabled(); 
      
      fireEvent.click(viewButton);

      const modal = await screen.findByRole('alertdialog');
      expect(modal).toBeInTheDocument();

      // Remove unused loaderInModal
      const loaderSvg = modal.querySelector('svg.animate-spin');
      expect(loaderSvg).toBeInTheDocument();
      expect(loaderSvg?.classList.contains('h-8')).toBe(true);
      expect(loaderSvg?.classList.contains('w-8')).toBe(true);
      
      expect(mockFetchFeedbackFileContent).toHaveBeenCalledTimes(1);
      // The component uses project.id from the store, ensure it's called with that
      expect(mockFetchFeedbackFileContent).toHaveBeenCalledWith(
        projectWithFeedbackSession.id, 
        mockFeedback.storage_path
      );
    });

    it('displays fetched feedback content using MarkdownRenderer in the modal', async () => {
      setup(
        mockProject, 
        'sess-1', 
        mockThesisStage, 
        { 
          currentFeedbackFileContent: mockFeedbackContentResponse,
          isFetchingFeedbackFileContent: false 
        }, 
        true, false, 'idle', null, [mockFeedback]
      );

      const viewButton = screen.getByRole('button', { name: 'View Feedback Content' });
      fireEvent.click(viewButton);

      await waitFor(() => {
        expect(screen.getByText(/Feedback Content:/)).toBeInTheDocument();
      });
      
      const modalContent = screen.getByRole('alertdialog');
      // Check for the actual mock Markdown content
      expect(within(modalContent).getByText(/Mock Feedback/)).toBeInTheDocument();
      expect(within(modalContent).getByText(/This is the content./)).toBeInTheDocument();
    });

    it('displays error message in modal if fetching feedback content fails', async () => {
      const error: ApiError = { code: 'FETCH_ERROR', message: 'Could not load feedback.' };
      setup(
        mockProject, 
        'sess-1', 
        mockThesisStage, 
        { 
          fetchFeedbackFileContentError: error,
          isFetchingFeedbackFileContent: false 
        }, 
        true, false, 'idle', null, [mockFeedback]
      );

      const viewButton = screen.getByRole('button', { name: 'View Feedback Content' });
      fireEvent.click(viewButton);

      await waitFor(() => {
        expect(screen.getByText(/Feedback Content:/)).toBeInTheDocument();
      });
      
      const modalContent = screen.getByRole('alertdialog');
      expect(within(modalContent).getByText('Error Loading Content')).toBeInTheDocument();
      expect(within(modalContent).getByText(error.message)).toBeInTheDocument();
    });

    it('closes the modal and calls clearCurrentFeedbackFileContent when "Close" button is clicked', async () => {
      setup(
        mockProject, 
        'sess-1', 
        mockThesisStage, 
        { currentFeedbackFileContent: mockFeedbackContentResponse }, 
        true, false, 'idle', null, [mockFeedback]
      );

      const viewButton = screen.getByRole('button', { name: 'View Feedback Content' });
      fireEvent.click(viewButton);

      await waitFor(() => {
        expect(screen.getByText(/Feedback Content:/)).toBeInTheDocument();
      });

      const closeButton = screen.getByRole('button', { name: 'Close' });
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText(/Feedback Content:/)).not.toBeInTheDocument();
      });
      expect(mockClearCurrentFeedbackFileContent).toHaveBeenCalled();
    });
  });

}); 