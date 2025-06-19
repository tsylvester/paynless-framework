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
} from '@paynless/types';
import { vi, beforeEach, describe, it, expect, type MockInstance } from 'vitest';
import { initializeMockDialecticState, getDialecticStoreState } from '../../mocks/dialecticStore.mock';
import { useDialecticStore, selectIsStageReadyForSessionIteration as actualSelectIsStageReady } from '@paynless/store';

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
  };

  const setup = (
    project: DialecticProject | null,
    activeSessionId: string | null,
    activeStage: DialecticStage | null,
    overrides?: Partial<DialecticStateValues>,
    isStageReadyOverride: boolean = true
  ) => {
    const initialState: DialecticStateValues = {
      ...getDialecticStoreState(),
      currentProjectDetail: project,
      activeContextSessionId: activeSessionId,
      activeContextStage: activeStage,
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
      ...overrides,
    };

    initializeMockDialecticState(initialState);
    useDialecticStore.setState({
      submitStageResponses: mockSubmitStageResponses,
      setActiveDialecticContext: mockSetActiveDialecticContext,
      resetSubmitStageResponsesError: mockResetSubmitStageResponsesError,
    });

    // Cast through 'unknown' to MockInstance for TypeScript
    const mockedSelectIsStageReady = actualSelectIsStageReady as unknown as MockInstance<
        [DialecticStateValues, string, string, string, number],
        boolean
    >; 
    mockedSelectIsStageReady.mockReturnValue(isStageReadyOverride);

    const activeSession = project?.dialectic_sessions?.find(s => s.id === activeSessionId);

    render(<SessionContributionsDisplayCard session={activeSession} activeStage={activeStage} />);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure selectIsStageReadyForSessionIteration is reset for each test if not overridden in setup
    (actualSelectIsStageReady as unknown as MockInstance<[DialecticStateValues, string, string, string, number], boolean>).mockClear();

  });

  it('renders contributions for the active stage only', () => {
    setup(mockProject, 'sess-1', mockThesisStage); // isStageReadyOverride defaults to true
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
    setup(projectWithNoSynthContributions, 'sess-1', mockSynthesisStage, undefined, true);
    
    expect(screen.getByText(`Contributions for: ${mockSynthesisStage.display_name}`)).toBeInTheDocument();
    expect(screen.getByText(/Review the AI-generated contributions for this stage./i)).toBeInTheDocument(); // CardDescription
    expect(screen.queryByTestId(/generated-contribution-card-/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit Responses/i })).not.toBeInTheDocument();
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
    setup(projectWithNoSynthContributions, 'sess-1', mockSynthesisStage, undefined, true);
    expect(screen.queryByTestId('generate-contributions-button-mock')).not.toBeInTheDocument();
  });

  it('does NOT render the GenerateContributionButton when contributions already exist for the stage', () => {
    setup(mockProject, 'sess-1', mockThesisStage);
    expect(screen.queryByTestId('generate-contributions-button-mock')).not.toBeInTheDocument();
  });

  it('manages local state for user responses correctly', () => {
    setup(mockProject, 'sess-1', mockThesisStage);
    const textarea: HTMLTextAreaElement = screen.getByTestId('response-textarea-c1');
    
    expect(textarea.value).toBe('');
    fireEvent.change(textarea, { target: { value: 'This is a test response.' } });
    expect(textarea.value).toBe('This is a test response.');
  });
  
  it('shows and enables the "Submit Responses" button only when there is text', () => {
    setup(mockProject, 'sess-1', mockThesisStage);
    const submitButton = screen.getByRole('button', { name: /Submit Responses for Thesis & Prepare Next Stage/i });
    expect(submitButton).toBeDisabled();
    
    fireEvent.change(screen.getByTestId('response-textarea-c1'), { target: { value: 'a response' } });
    expect(submitButton).toBeEnabled();
  });
  
  it('calls submitStageResponses with the correct payload when the submit button is clicked', async () => {
    setup(mockProject, 'sess-1', mockThesisStage);
    
    const textarea = screen.getByTestId('response-textarea-c1');
    fireEvent.change(textarea, { target: { value: 'My detailed feedback.' } });
    
    const submitButton = screen.getByRole('button', { name: /Submit Responses for Thesis & Prepare Next Stage/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockSubmitStageResponses).toHaveBeenCalledTimes(1);
      expect(mockSubmitStageResponses).toHaveBeenCalledWith({
        sessionId: 'sess-1',
        projectId: 'proj-1',
        stageSlug: 'thesis',
        currentIterationNumber: 1,
        responses: [
          {
            originalModelContributionId: 'c1',
            responseText: 'My detailed feedback.',
          },
        ],
      });
    });
  });

  it('disables the submit button while submitting and shows loading state', () => {
    setup(mockProject, 'sess-1', mockThesisStage, { isSubmittingStageResponses: true });
    
    // Have to add text to enable the button first
    fireEvent.change(screen.getByTestId('response-textarea-c1'), { target: { value: 'a response' } });

    const submitButton = screen.getByRole('button', { name: /Submitting.../i });
    expect(submitButton).toBeDisabled();
    expect(within(submitButton).getByTestId('loader')).toBeInTheDocument();
  });
  
  it('displays an error message if submitting responses fails', () => {
    const error: ApiError = { code: '500', message: 'Submission failed', details: 'Server error' };
    setup(mockProject, 'sess-1', mockThesisStage, { submitStageResponsesError: error });

    expect(screen.getByText(/Submission failed/i)).toBeInTheDocument();
  });

}); 