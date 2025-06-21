import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GeneratedContributionCard } from './GeneratedContributionCard';
import { useDialecticStore } from '@paynless/store'; // Ensures the mocked store is imported and available
import { DialecticContribution, DialecticStage, DialecticStore, ContributionCacheEntry, ApiError, DialecticStateValues, DialecticProject, DialecticSession } from '@paynless/types';
import { vi, beforeEach, describe, it, expect, Mock } from 'vitest';
// Removed: import { createMockStore } from '../../mocks/dialecticStore.mock'; 
import { initializeMockDialecticState, getDialecticStoreState, useDialecticStore as originalUseDialecticStoreFromMock } from '../../mocks/dialecticStore.mock';

// Define MockedUseDialecticStoreType at the top level
type MockedUseDialecticStoreType = typeof originalUseDialecticStoreFromMock & {
  setState: (
    newValues: Partial<DialecticStore> | ((state: DialecticStore) => Partial<DialecticStore>),
    replace?: boolean
  ) => void;
  // If getState is also used, add it here too:
  // getState: () => DialecticStore;
};

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock @paynless/store
vi.mock('@paynless/store', async (importOriginal) => {
  const actualStoreModule = await importOriginal<typeof import('@paynless/store')>();
  const mockDialecticStoreUtils = await import('../../mocks/dialecticStore.mock');
  // Use the original import from the mock file for casting to our top-level type
  const typedMockUseDialecticStore = mockDialecticStoreUtils.useDialecticStore as MockedUseDialecticStoreType;

  return {
    ...actualStoreModule,
    useDialecticStore: typedMockUseDialecticStore,
    // selectContributionById: mockDialecticStoreUtils.selectContributionById, // if used directly by component
  };
});

// Mock child components
vi.mock('@/components/common/MarkdownRenderer', () => ({
  MarkdownRenderer: vi.fn(({ content }) => <div data-testid="markdown-renderer-mock">{content}</div>),
}));
vi.mock('@/components/common/TextInputArea', () => ({
  TextInputArea: vi.fn(({ value, onChange, rawTextMode, label, id }) => (
    <textarea
      aria-label={label}
      id={id || (rawTextMode ? "edit-textarea-mock" : "response-textarea-mock")}
      data-testid={rawTextMode ? "edit-textarea" : "response-textarea"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ))
}));

const mockContributionId_v1 = 'contrib-ai-original-v1';
const mockContributionId_v2_edit = 'contrib-user-edit-v2';
const originalModelContributionIdForResponse = mockContributionId_v1; // Edits point to the first AI version
const mockProjectId = 'proj-gcc-1';
const mockSessionId = 'sess-gcc-1';

const mockStage: DialecticStage = {
  created_at: 'now',
  default_system_prompt_id: null,
  description: 'THESIS Stage Desc',
  display_name: 'THESIS',
  expected_output_artifacts: {},
  id: 'stage-gcc-thesis-1',
  input_artifact_rules: {},
  slug: 'thesis',
};

const mockAIContribution: DialecticContribution = {
  id: mockContributionId_v1,
  session_id: mockSessionId,
  stage: mockStage,
  iteration_number: 1,
  original_model_contribution_id: mockContributionId_v1, // Points to self
  is_latest_edit: true,
  edit_version: 1,
  user_id: null, // AI generated
  model_name: 'GPT-4 Super',
  content_storage_bucket: 'test-bucket',
  content_storage_path: `path/to/${mockContributionId_v1}.md`,
  content_mime_type: 'text/markdown',
  content_size_bytes: 100,
  created_at: 'now',
  updated_at: 'now',
  model_id: 'model-gpt4s',
  prompt_template_id_used: 'tpl-thesis-default',
  seed_prompt_url: null,
  raw_response_storage_path: `path/to/raw/${mockContributionId_v1}.json`,
  target_contribution_id: null,
  tokens_used_input: 10,
  tokens_used_output: 200,
  processing_time_ms: 1500,
  error: null,
  citations: [],
};

const mockUserEditContribution: DialecticContribution = {
  id: mockContributionId_v2_edit,
  session_id: mockSessionId,
  stage: mockStage,
  iteration_number: 1,
  original_model_contribution_id: mockContributionId_v1, // Points to AI version
  is_latest_edit: true,
  edit_version: 2,
  user_id: 'user-editor-gcc',
  model_name: 'GPT-4 Super', // Model name might be preserved from original
  content_storage_bucket: 'test-bucket',
  content_storage_path: `path/to/${mockContributionId_v2_edit}.md`,
  content_mime_type: 'text/markdown',
  content_size_bytes: 120,
  created_at: 'now',
  updated_at: 'now',
  model_id: null, // User edits don't have a model_id directly
  prompt_template_id_used: null,
  seed_prompt_url: null,
  raw_response_storage_path: null,
  target_contribution_id: mockContributionId_v1, // Points to the contribution it's an edit of
  tokens_used_input: null,
  tokens_used_output: null,
  processing_time_ms: null,
  error: null,
  citations: [],
};

const aiContent = "# AI Content\nOriginal thoughts.";
const userEditContent = "# User Edited AI Content\nRevised thoughts.";

describe('GeneratedContributionCard', () => {
  // Removed: let currentMockStore: DialecticStore;
  const onResponseChangeMock = vi.fn();

  const setupStore = (
    contribution: DialecticContribution,
    contentCache: Record<string, ContributionCacheEntry> = {},
    storeOverrides?: Partial<DialecticStateValues>,
  ) => {
    const mockSession: DialecticSession = {
      id: mockSessionId,
      project_id: mockProjectId,
      status: 'thesis_complete',
      session_description: 'Test session for GCC',
      user_input_reference_url: null,
      iteration_count: 1,
      selected_model_catalog_ids: ['model-catalog-gpt4s'],
      associated_chat_id: null,
      dialectic_contributions: [contribution], // Ensure the current contribution is in the session
      dialectic_session_models: [],
      current_stage_id: mockStage.id,
      created_at: 'now',
      updated_at: 'now',
    };

    const mockProject: DialecticProject = {
      id: mockProjectId,
      user_id: 'user-gcc-test',
      project_name: 'GCC Test Project',
      initial_user_prompt: 'Test prompt',
      initial_prompt_resource_id: null,
      selected_domain_id: 'domain-software',
      selected_domain_overlay_id: null,
      repo_url: null,
      status: 'active',
      created_at: 'now',
      updated_at: 'now',
      dialectic_sessions: [mockSession], // Ensure the session is part of the project
      // Fields from DialecticProjectDetail that are part of DialecticStateValues.currentProjectDetail
      dialectic_domains: { name: 'Software Engineering' },
      dialectic_process_templates: { name: 'Default Process', description: '', starting_stage_id: mockStage.id, created_at: 'now', id: 'template-default' },
      isLoadingProcessTemplate: false,
      processTemplateError: null,
      contributionGenerationStatus: 'idle',
      generateContributionsError: null,
      isSubmittingStageResponses: false,
      submitStageResponsesError: null,
      isSavingContributionEdit: false,
      saveContributionEditError: null,
    };

    const baseStateOverrides: Partial<DialecticStateValues> = {
      activeContextProjectId: mockProjectId,
      activeContextSessionId: mockSessionId,
      currentProjectDetail: mockProject,
      contributionContentCache: contentCache,
      projects: [mockProject], // ensure projects array has the current project
      modelCatalog: [{
        api_identifier: 'gpt-4s', 
        created_at: 'now', 
        description: 'Mock GPT4S', 
        id: 'model-catalog-gpt4s', 
        input_token_cost_usd_millionths: 10, 
        is_active: true, 
        max_output_tokens: 4000, 
        model_name: 'GPT-4 Super', 
        output_token_cost_usd_millionths: 30, 
        provider_name: 'MockProvider', 
        strengths: [], 
        weaknesses: [], 
        updated_at: 'now', 
        context_window_tokens: 8000,
      }],
      // Apply specific overrides for state values
      ...(storeOverrides || {}),
    };

    // Initialize the store with this specific state
    initializeMockDialecticState(baseStateOverrides);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderCard = (contributionToRender: DialecticContribution, initialResponse: string = '') =>
    render(
      <GeneratedContributionCard 
        projectId={mockProjectId}
        contributionId={contributionToRender.id} 
        originalModelContributionIdForResponse={originalModelContributionIdForResponse}
        initialResponseText={initialResponse || ''}
        onResponseChange={onResponseChangeMock}
      />
    );

  describe('Content Display', () => {
    it('fetches content if not in cache and renders it', async () => {
      const mockFetchImpl = vi.fn(async (fetchedId: string) => {
        const currentStoreState = getDialecticStoreState() as DialecticStore;
        let contributionToUpdate: DialecticContribution | undefined;
        currentStoreState.currentProjectDetail?.dialectic_sessions?.forEach(session => {
            session.dialectic_contributions?.forEach(contrib => {
                if (contrib.id === fetchedId) {
                    contributionToUpdate = contrib;
                }
            });
        });

        if (contributionToUpdate) {
          initializeMockDialecticState({
            ...currentStoreState,
            contributionContentCache: {
              ...currentStoreState.contributionContentCache,
              [contributionToUpdate.id]: { content: aiContent, isLoading: false, error: undefined, mimeType: 'text/markdown' },
            },
          });
        }
      });

      setupStore(mockAIContribution, {});
      (getDialecticStoreState().fetchContributionContent as Mock).mockImplementation(mockFetchImpl);

      renderCard(mockAIContribution);
      
      await waitFor(() => {
        expect(getDialecticStoreState().fetchContributionContent).toHaveBeenCalledWith(mockAIContribution.id);
      });

      renderCard(mockAIContribution);
      
      await waitFor(() => {
        expect(screen.getByTestId('markdown-renderer-mock')).toHaveTextContent(aiContent.replace("\n", " "));
      });
    });

    it('shows loading skeleton for content', () => {
      setupStore(mockAIContribution, {
        [mockAIContribution.id]: { isLoading: true, content: undefined, error: undefined, mimeType: 'text/markdown' }
      });
      renderCard(mockAIContribution);
      expect(screen.getByTestId('content-loading-skeleton')).toBeInTheDocument();
    });

    it('shows error alert for content fetching failure', () => {
      const errorMsg = 'Failed to load content';
      const apiError: ApiError = { message: errorMsg, code: 'FetchError' };
      setupStore(mockAIContribution, {
        [mockAIContribution.id]: { isLoading: false, error: apiError, content: undefined, mimeType: 'text/markdown' }
      });
      renderCard(mockAIContribution);
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });

    it('indicates if content is a user edit', () => {
      setupStore(mockUserEditContribution, {
        [mockUserEditContribution.id]: { content: userEditContent, isLoading: false, error: undefined, mimeType: 'text/markdown' }
      });
      renderCard(mockUserEditContribution);
      expect(screen.getByText(/Edited by User/i)).toBeInTheDocument(); 
    });

     it('shows model name for AI contribution', () => {
      setupStore(mockAIContribution, {
        [mockAIContribution.id]: { content: aiContent, isLoading: false, error: undefined, mimeType: 'text/markdown' }
      });
      renderCard(mockAIContribution);
      expect(screen.getByText(new RegExp(mockAIContribution.model_name!, 'i'))).toBeInTheDocument(); 
    });
  });

  describe('Direct Editing Feature', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      initializeMockDialecticState();
    });

    it('toggles edit mode', async () => {
      setupStore(mockAIContribution, { 
        [mockAIContribution.id!]: { content: aiContent, isLoading: false, error: undefined, mimeType: 'text/markdown' } 
      });
      renderCard(mockAIContribution);

      const editButton = screen.getByTitle(/Edit this contribution/i);
      fireEvent.click(editButton);
      expect(screen.getByLabelText('Enter edited content...')).toBeInTheDocument();
      expect(screen.getByLabelText('Enter edited content...')).toHaveValue(aiContent);
      expect(screen.getByRole('button', { name: /Save Edit/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Discard/i })).toBeInTheDocument();
      
      fireEvent.click(screen.getByRole('button', { name: /Discard/i }));
      expect(screen.queryByLabelText('Enter edited content...')).not.toBeInTheDocument();
    });

    it('calls saveContributionEdit thunk on save with correct payload', async () => {
      setupStore(mockAIContribution, { 
        [mockAIContribution.id!]: { content: aiContent, isLoading: false, error: undefined, mimeType: 'text/markdown' } 
      });
      renderCard(mockAIContribution);
      
      fireEvent.click(screen.getByTitle(/Edit this contribution/i));
      const textarea = screen.getByLabelText('Enter edited content...');
      const newEditedText = "This is my superior edit.";
      fireEvent.change(textarea, { target: { value: newEditedText } });
      
      const saveButton = screen.getByRole('button', { name: /Save Edit/i });
      fireEvent.click(saveButton);

      const storeActions = getDialecticStoreState();
      await waitFor(() => {
        expect(storeActions.saveContributionEdit).toHaveBeenCalledWith(expect.objectContaining({
          projectId: mockProjectId,
          sessionId: mockAIContribution.session_id,
          originalModelContributionId: mockAIContribution.original_model_contribution_id,
          editedContentText: newEditedText,
          originalContributionIdToEdit: mockAIContribution.id,
        }));
      });
    });

    it('shows loading state for save edit action', async () => {
      setupStore(mockAIContribution, { 
        [mockAIContribution.id!]: { content: aiContent, isLoading: false, error: undefined, mimeType: 'text/markdown' } 
      });

      const unresolvedPromise = new Promise(() => {});
      (useDialecticStore.getState().saveContributionEdit as Mock).mockImplementation(async () => {
        useDialecticStore.setState({ 
          isSavingContributionEdit: true,
          saveContributionEditError: null 
        });
        return unresolvedPromise; 
      });

      renderCard(mockAIContribution);
      
      fireEvent.click(screen.getByTitle(/Edit this contribution/i));
      const textarea = screen.getByLabelText('Enter edited content...');
      fireEvent.change(textarea, { target: { value: "New content to save" } });
      
      const saveButtonTrigger = screen.getByRole('button', { name: /Save Edit/i });
      fireEvent.click(saveButtonTrigger);

      await waitFor(() => {
        const savingButton = screen.getByRole('button', { name: /Saving.../i });
        expect(savingButton).toBeDisabled();
        expect(screen.getByRole('button', { name: /Discard/i })).toBeDisabled();
        expect(savingButton.querySelector('.animate-spin')).toBeInTheDocument();
      });
    });

    it('shows error if save edit fails', async () => {
      const errorMsg = "Simulated save failure!";
      const apiError: ApiError = { message: errorMsg, code: 'TestSaveError' };

      setupStore(mockAIContribution, { 
        [mockAIContribution.id!]: { content: aiContent, isLoading: false, error: undefined, mimeType: 'text/markdown' } 
      });

      (useDialecticStore.getState().saveContributionEdit as Mock).mockImplementation(async () => {
        useDialecticStore.setState({ 
          isSavingContributionEdit: true, // Start loading
          saveContributionEditError: null 
        });
        await new Promise(resolve => setTimeout(resolve, 10)); // Brief pause
        useDialecticStore.setState({ 
          isSavingContributionEdit: false, // Stop loading
          saveContributionEditError: apiError // Set error
        });
        return { error: apiError }; // Propagate error for toast, as in component
      });
      
      const { toast } = await import('sonner'); // Get the mocked toast

      renderCard(mockAIContribution);
      
      fireEvent.click(screen.getByTitle(/Edit this contribution/i));
      const textarea = screen.getByLabelText('Enter edited content...');
      const newEditedText = "Attempting to save this, expecting failure.";
      fireEvent.change(textarea, { target: { value: newEditedText } });
      
      const saveButton = screen.getByRole('button', { name: /Save Edit/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(errorMsg)).toBeInTheDocument(); // Error message in the Alert
        expect(toast.error).toHaveBeenCalledWith("Failed to Save Edit", { description: errorMsg });
      });

      // Buttons should be active again, no spinner
      const finalSaveButton = screen.getByRole('button', { name: /Save Edit/i });
      expect(finalSaveButton).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /Discard/i })).not.toBeDisabled();
      expect(finalSaveButton.querySelector('.animate-spin')).not.toBeInTheDocument();
    });

    it('displays guidance message for editing', () => {
        setupStore(mockAIContribution, {
          [mockAIContribution.id!]: { content: aiContent, isLoading: false, error: undefined, mimeType: 'text/markdown' } 
        });
        renderCard(mockAIContribution);
        fireEvent.click(screen.getByTitle(/Edit this contribution/i));
        expect(screen.getByText(/Recommended for significant corrections/i)).toBeInTheDocument();
    });
  });

  describe('User Response Area', () => {
    beforeEach(() => {
      setupStore(mockAIContribution, { 
        [mockAIContribution.id!]: { content: aiContent, isLoading: false, error: undefined, mimeType: 'text/markdown' }
      });
      renderCard(mockAIContribution, 'Initial passed response');
    });

    it('integrates TextInputArea for responses with initial value', () => {
      const responseTextarea = screen.getByTestId('response-textarea');
      expect(responseTextarea).toBeInTheDocument();
      expect(responseTextarea).toHaveValue('Initial passed response');
    });

    it('calls onResponseChange callback with correct original ID and new text', () => {
      const responseTextarea = screen.getByTestId('response-textarea');
      const newResponse = "A thoughtful reply.";
      fireEvent.change(responseTextarea, { target: { value: newResponse } });
      expect(onResponseChangeMock).toHaveBeenCalledWith(originalModelContributionIdForResponse, newResponse);
    });
  });
}); 