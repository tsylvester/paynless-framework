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
import { DialecticProject, DialecticSession, DialecticContribution, DialecticStage, ApiError, DialecticStateValues } from '@paynless/types';
import { vi, beforeEach, describe, it, expect } from 'vitest';
import { initializeMockDialecticState, getDialecticStoreState } from '../../mocks/dialecticStore.mock';

const mockProjectId = 'proj-sdc-1';
const mockSessionId = 'sess-sdc-1';
const defaultMockActiveStageSlug = DialecticStage.THESIS;
const mockIterationNumber = 1;

const mockContribution1_v1: DialecticContribution = {
  id: 'contrib-1-v1',
  session_id: mockSessionId,
  stage: DialecticStage.THESIS,
  iteration_number: mockIterationNumber,
  original_model_contribution_id: 'contrib-1-v1', // Points to self as it's the first AI version
  is_latest_edit: false,
  edit_version: 1,
  model_name: 'GPT-4',
  // ... other required fields
  model_id: 'openai/gpt-4',
  prompt_template_id_used: 'tpl-thesis-1',
  seed_prompt_url: 'path/to/thesis1.md',
  error: null,
  user_id: 'ai',
  content_storage_bucket: 'bucket',
  content_storage_path: 'path',
  content_mime_type: 'text/plain',
  content_size_bytes: 100,
  created_at: 'now',
  updated_at: 'now',
  raw_response_storage_path: 'path',
  target_contribution_id: null,
  tokens_used_input: 100,
  tokens_used_output: 100,
  processing_time_ms: 100,
  citations: [],
};
const mockContribution1_v2_userEdit: DialecticContribution = {
  id: 'contrib-1-v2',
  session_id: mockSessionId,
  stage: DialecticStage.THESIS,
  iteration_number: mockIterationNumber,
  original_model_contribution_id: 'contrib-1-v1', // Points to the original AI version
  is_latest_edit: true, // This is the one to display
  edit_version: 2,
  user_id: 'user-editor-1',
  model_name: 'GPT-4', // model name can be preserved from original
  // ... other required fields
  model_id: 'openai/gpt-4',
  prompt_template_id_used: 'tpl-thesis-1',
  seed_prompt_url: 'path/to/thesis1.md',
  error: null,
  content_storage_bucket: 'bucket',
  content_storage_path: 'path',
  content_mime_type: 'text/plain',
  content_size_bytes: 100,
  created_at: 'now',
  updated_at: 'now',
  raw_response_storage_path: 'path',
  target_contribution_id: null,
  tokens_used_input: 100,
  tokens_used_output: 100,
  processing_time_ms: 100,
  citations: [],
};

const mockContribution2_v1_latest: DialecticContribution = {
  id: 'contrib-2-v1',
  session_id: mockSessionId,
  stage: DialecticStage.THESIS,
  iteration_number: mockIterationNumber,
  original_model_contribution_id: 'contrib-2-v1',
  is_latest_edit: true,
  edit_version: 1,
  model_name: 'Claude Opus',
  // ... other required fields
  model_id: 'anthropic/claude-3-opus',
  prompt_template_id_used: 'tpl-antithesis-1',
  seed_prompt_url: 'path/to/antithesis1.md',
  error: null,
  content_storage_bucket: 'bucket',
  content_storage_path: 'path',
  content_mime_type: 'text/plain',
  content_size_bytes: 100,
  created_at: 'now',
  updated_at: 'now',
  raw_response_storage_path: 'path',
  target_contribution_id: null,
  tokens_used_input: 100,
  tokens_used_output: 100,
  processing_time_ms: 100,
  citations: [],
  user_id: 'ai',
};

const mockSession: DialecticSession = {
  id: mockSessionId,
  project_id: mockProjectId,
  current_iteration: mockIterationNumber,
  status: 'pending_thesis',
  dialectic_contributions: [mockContribution1_v1, mockContribution1_v2_userEdit, mockContribution2_v1_latest],
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
};

const mockProject: DialecticProject = {
  id: mockProjectId,
  dialectic_sessions: [mockSession],
  // ... other required project fields
  user_id: 'u1', project_name: 'p1', initial_user_prompt: 'ipu', selected_domain_overlay_id: null, selected_domain_tag: null,
  repo_url: null, status: 'active', created_at: 'now', updated_at: 'now',
};

describe('SessionContributionsDisplayCard', () => {
  const setupStore = (
    activeStageForTest: DialecticStage = defaultMockActiveStageSlug, 
    sessionOverrides?: Partial<DialecticSession>, 
    storeOverrides?: Partial<DialecticStateValues>
  ) => {
    const effectiveSession = { ...mockSession, ...sessionOverrides, id: mockSessionId, project_id: mockProjectId };
    const project = { ...mockProject, id: mockProjectId, dialectic_sessions: [effectiveSession] };

    const initialState: DialecticStateValues = {
      activeContextProjectId: mockProjectId,
      activeContextSessionId: effectiveSession.id,
      activeContextStageSlug: activeStageForTest,
      currentProjectDetail: project,
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
      contributionContentCache: {},
      projects: [project],
      modelCatalog: [],
      availableDomainTags: [],
      availableDomainOverlays: [],
      allSystemPrompts: [],
      isLoadingDomainTags: false,
      domainTagsError: null,
      selectedDomainTag: null,
      selectedStageAssociation: null,
      isLoadingDomainOverlays: false,
      domainOverlaysError: null,
      selectedDomainOverlayId: null,
      isLoadingProjects: false,
      projectsError: null,
      isLoadingProjectDetail: false,
      projectDetailError: null,
      isLoadingModelCatalog: false,
      modelCatalogError: null,
      isCreatingProject: false,
      createProjectError: null,
      isStartingSession: false,
      startSessionError: null,
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
      isGeneratingContributions: false,
      generateContributionsError: null,
      isSavingContributionEdit: false,
      saveContributionEditError: null,
      ...storeOverrides,
    };
    initializeMockDialecticState(initialState);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // setupStore(); // Default setup with THESIS active - This will be handled by setupAndRender
  });

  // New helper function to combine store setup and rendering
  const setupAndRender = (
    activeSlugForTest: DialecticStage = defaultMockActiveStageSlug,
    sessionOverrides?: Partial<DialecticSession>,
    storeOverrides?: Partial<DialecticStateValues>
  ) => {
    setupStore(activeSlugForTest, sessionOverrides, storeOverrides);
    return render(<SessionContributionsDisplayCard />);
  };

  it('renders correct latest contributions for the active stage and iteration', () => {
    setupAndRender(); // Use new helper
    // Should render contrib-1-v2 (latest edit of original contrib-1-v1)
    expect(screen.getByTestId(`generated-contribution-card-${mockContribution1_v2_userEdit.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`generated-contribution-card-${mockContribution1_v2_userEdit.id}`)).toHaveTextContent(`Original ID for response: ${mockContribution1_v1.id}`);
    // Should render contrib-2-v1 (latest and only version)
    expect(screen.getByTestId(`generated-contribution-card-${mockContribution2_v1_latest.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`generated-contribution-card-${mockContribution2_v1_latest.id}`)).toHaveTextContent(`Original ID for response: ${mockContribution2_v1_latest.id}`);
    // Should NOT render the older version of contribution 1
    expect(screen.queryByTestId(`generated-contribution-card-${mockContribution1_v1.id}`)).not.toBeInTheDocument();
  });

  it('updates local stageResponses state when child card calls onResponseChange', () => {
    setupAndRender(); // Use new helper
    const responseTextarea = screen.getByTestId(`response-textarea-${mockContribution1_v1.id}`);
    fireEvent.change(responseTextarea, { target: { value: 'My response to C1' } });
    
    expect(responseTextarea).toHaveValue('My response to C1');
  });

  describe('"Submit Responses & Prepare Next Stage" Button', () => {
    it('is disabled initially or if no responses are entered', () => {
      setupAndRender(DialecticStage.THESIS); // Use new helper
      const submitButton = screen.getByRole('button', { name: /Submit Responses for Hypothesis & Prepare Next Stage/i });
      expect(submitButton).toBeDisabled();
    });

    it('is enabled when at least one response is entered', () => {
      setupAndRender(DialecticStage.THESIS); // Use new helper
      const responseTextarea = screen.getByTestId(`response-textarea-${mockContribution1_v1.id}`);
      fireEvent.change(responseTextarea, { target: { value: 'A valid response' } });
      const submitButton = screen.getByRole('button', { name: /Submit Responses for Hypothesis & Prepare Next Stage/i });
      expect(submitButton).toBeEnabled();
    });

    it('dispatches submitStageResponsesAndPrepareNextSeed with correct payload on click', async () => {
      // setupStore(DialecticStage.THESIS); // No longer needed here
      setupAndRender(DialecticStage.THESIS); // Use new helper
      const response1Text = 'Response for C1';
      const response2Text = 'Response for C2';
      fireEvent.change(screen.getByTestId(`response-textarea-${mockContribution1_v1.id}`), { target: { value: response1Text } });
      fireEvent.change(screen.getByTestId(`response-textarea-${mockContribution2_v1_latest.id}`), { target: { value: response2Text } });

      const submitButton = screen.getByRole('button', { name: /Submit Responses for Hypothesis & Prepare Next Stage/i });
      fireEvent.click(submitButton);
      
      const store = getDialecticStoreState();
      await waitFor(() => {
        expect(store.submitStageResponsesAndPrepareNextSeed).toHaveBeenCalledWith({
          sessionId: mockSessionId,
          stageSlug: DialecticStage.THESIS, 
          currentIterationNumber: mockIterationNumber,
          projectId: mockProjectId,
          responses: [
            { originalModelContributionId: mockContribution1_v1.id, responseText: response1Text },
            { originalModelContributionId: mockContribution2_v1_latest.id, responseText: response2Text },
          ],
        });
      });
    });

    it('button shows loading state when isSubmittingStageResponses is true', () => {
      // setupStore(DialecticStage.THESIS, undefined, { isSubmittingStageResponses: true }); // No longer needed here
      setupAndRender(DialecticStage.THESIS, undefined, { isSubmittingStageResponses: true }); // Use new helper
      fireEvent.change(screen.getByTestId(`response-textarea-${mockContribution1_v1.id}`), { target: { value: 'enable submit' } });
      const submitButton = screen.getByRole('button', { name: /Submitting.../i });
      expect(submitButton).toBeDisabled();
    });

    it('displays error message if submitStageResponsesError is set', () => {
      const errorMsg = 'Failed to submit responses';
      const storeOverrides = { submitStageResponsesError: { code: 'SubmitError', message: errorMsg } as ApiError };

      // Call setupStore directly to initialize the store with the error
      setupStore(DialecticStage.THESIS, undefined, storeOverrides);

      // Now get the store instance and override the reset action
      const store = getDialecticStoreState();
      const originalResetError = store.resetSubmitStageResponsesError;
      store.resetSubmitStageResponsesError = vi.fn(); // Temporarily make it a no-op

      try {
        // Render the component - it will use the modified store
        render(<SessionContributionsDisplayCard />); 
        
        const alert = screen.getByRole('alert');
        expect(within(alert).getByText(errorMsg)).toBeInTheDocument();
      } finally {
        // Restore original mock action on the store instance
        store.resetSubmitStageResponsesError = originalResetError; 
      }
    });

    it('clears local responses and shows success feedback on successful submission', async () => {
        // setupStore(DialecticStage.THESIS); // No longer needed here
        const store = getDialecticStoreState(); // Get store for mocking function
        store.submitStageResponsesAndPrepareNextSeed = vi.fn().mockResolvedValue({ success: true, message: "Responses submitted successfully." });
        
        setupAndRender(DialecticStage.THESIS); // Use new helper

        const r1Textarea = screen.getByTestId(`response-textarea-${mockContribution1_v1.id}`);
        fireEvent.change(r1Textarea, { target: { value: 'A good response' } });
        
        const submitButton = screen.getByRole('button', { name: /Submit Responses for Hypothesis & Prepare Next Stage/i });
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(screen.getByText(/Responses submitted successfully./i)).toBeInTheDocument();
        });
        expect(r1Textarea).toHaveValue('');
    });
  });

  it('renders no contributions message if none match criteria', () => {
    // setupStore(defaultMockActiveStageSlug, { ...mockSession, dialectic_contributions: [] }); // No longer needed here
    setupAndRender(defaultMockActiveStageSlug, { ...mockSession, dialectic_contributions: [] }); // Use new helper
    expect(screen.getByText(/No contributions found for this stage yet./i)).toBeInTheDocument();
  });

  it('renders GenerateContributionsButton when no contributions are present', () => {
    setupAndRender(defaultMockActiveStageSlug, { ...mockSession, dialectic_contributions: [] });
    expect(screen.getByTestId('generate-contributions-button-mock')).toBeInTheDocument();
  });
}); 