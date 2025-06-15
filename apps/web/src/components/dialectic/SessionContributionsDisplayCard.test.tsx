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

vi.mock('./GenerateContributionButton', () => ({
  GenerateContributionButton: vi.fn(() => (
    <div data-testid="generate-contributions-button-mock">Mock GenerateContributionsButton</div>
  )),
}));

// Then mock libraries/aliased paths
vi.mock('@paynless/store', async () => {
  const actualMock = await vi.importActual('../../mocks/dialecticStore.mock');
  return {
    ...(actualMock as Record<string, unknown>),
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
  DialecticActions,
  ApiResponse,
  SubmitStageResponsesPayload,
  SubmitStageResponsesResponse,
} from '@paynless/types';
import { vi, beforeEach, describe, it, expect } from 'vitest';
import { initializeMockDialecticState, getDialecticStoreState } from '../../mocks/dialecticStore.mock';
import { useDialecticStore } from '@paynless/store';

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
    (_payload: SubmitStageResponsesPayload): Promise<ApiResponse<SubmitStageResponsesResponse>> => {
      const updatedSession: DialecticSession = {
        ...(mockSession as DialecticSession),
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
    domain_name: 'Software Development',
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
    overrides?: Partial<DialecticStateValues>
  ) => {
    const initialState: DialecticStateValues = {
      ...getDialecticStoreState(),
      currentProjectDetail: project,
      activeContextSessionId: activeSessionId,
      activeContextStageSlug: activeStage, // Note: activeContextStageSlug holds the full stage object
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
      ...overrides,
    };

    initializeMockDialecticState(initialState);
    (useDialecticStore as unknown as { setState: (state: Partial<DialecticActions>) => void }).setState({
      submitStageResponses: mockSubmitStageResponses,
      setActiveDialecticContext: mockSetActiveDialecticContext,
      resetSubmitStageResponsesError: mockResetSubmitStageResponsesError,
    });

    render(<SessionContributionsDisplayCard />);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders contributions for the active stage only', () => {
    setup(mockProject, 'sess-1', mockThesisStage);
    expect(screen.getByTestId('generated-contribution-card-c1')).toBeInTheDocument();
    expect(screen.queryByTestId('generated-contribution-card-c2')).not.toBeInTheDocument();
  });

  it('displays a message when there are no contributions for the active stage', () => {
    const mockSynthesisStage: DialecticStage = { ...mockThesisStage, id: 's3', slug: 'synthesis', display_name: 'Synthesis' };
    setup(mockProject, 'sess-1', mockSynthesisStage);
    expect(screen.getByText(/No contributions found for this stage yet/i)).toBeInTheDocument();
  });
  
  it('renders the GenerateContributionButton when no contributions exist for the stage', () => {
    const mockSynthesisStage: DialecticStage = { ...mockThesisStage, id: 's3', slug: 'synthesis', display_name: 'Synthesis' };
    setup(mockProject, 'sess-1', mockSynthesisStage);
    expect(screen.getByTestId('generate-contributions-button-mock')).toBeInTheDocument();
  });

  it('does NOT render the GenerateContributionButton when contributions already exist for the stage', () => {
    setup(mockProject, 'sess-1', mockThesisStage);
    expect(screen.queryByTestId('generate-contributions-button-mock')).not.toBeInTheDocument();
  });

  it('manages local state for user responses correctly', () => {
    setup(mockProject, 'sess-1', mockThesisStage);
    const textarea = screen.getByTestId('response-textarea-c1') as HTMLTextAreaElement;
    
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