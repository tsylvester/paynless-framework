import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { GeneratedContributionCard } from './GeneratedContributionCard';
import { useDialecticStore } from '@paynless/store'; // Ensures the mocked store is imported and available
import { DialecticContribution, DialecticStage, DialecticStore, ContributionCacheEntry, ApiError, DialecticStateValues, DialecticProject, DialecticSession } from '@paynless/types';
import { vi, beforeEach, describe, it, expect, Mock } from 'vitest';
// Removed: import { createMockStore } from '../../mocks/dialecticStore.mock'; 
import { initializeMockDialecticState, getDialecticStoreState, useDialecticStore as originalUseDialecticStoreFromMock } from '../../mocks/dialecticStore.mock';
import { toast } from 'sonner';

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
vi.mock('@/components/common/TextInputArea', () => ({
  TextInputArea: vi.fn((props) => {
    // Determine if this is the content area or response area based on props
    // Content area has onPreviewModeChange but no id, response area has id starting with 'response-'
    const isResponseArea = props.id && props.id.startsWith('response-');
    const isContentArea = props.onPreviewModeChange && !isResponseArea;
    
    let testId: string;
    let mockId: string;
    
    if (isContentArea) {
      testId = 'content-textarea';
      mockId = 'content-textarea-mock-id';
    } else if (isResponseArea) {
      testId = 'response-textarea';
      mockId = props.id || 'response-textarea-mock-id';
    } else {
      // Fallback for edge cases
      testId = 'generic-textarea';
      mockId = 'generic-textarea-mock-id';
    }

    // Mock the preview toggle functionality
    const handlePreviewToggle = () => {
      if (props.onPreviewModeChange) {
        // Toggle between preview and edit mode
        const currentlyInPreview = props.initialPreviewMode !== false;
        props.onPreviewModeChange(!currentlyInPreview);
      }
    };

    return (
      <div data-testid={`${testId}-container`}>
        <textarea
          aria-label={props.label || ""}
          id={mockId}
          data-testid={testId}
          value={props.value}
          onChange={(e) => props.onChange?.(e.target.value)}
          placeholder={props.placeholder}
          disabled={props.disabled}
        />
        {props.showPreviewToggle && (
          <button
            data-testid={`${testId}-preview-toggle`}
            onClick={handlePreviewToggle}
            type="button"
          >
            {props.initialPreviewMode ? 'Edit' : 'Preview'}
          </button>
        )}
      </div>
    );
  })
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
  stage: mockStage.slug,
  iteration_number: 1,
  original_model_contribution_id: mockContributionId_v1, // Points to self
  is_latest_edit: true,
  edit_version: 1,
  user_id: null, // AI generated
  model_name: 'GPT-4 Super',
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
  contribution_type: 'ai',
  file_name: 'ai-contribution.md',
  storage_bucket: 'test-bucket',
  storage_path: `path/to/${mockContributionId_v1}.md`,
  size_bytes: 100,
  mime_type: 'text/markdown',
};

const mockUserEditContribution: DialecticContribution = {
  id: mockContributionId_v2_edit,
  session_id: mockSessionId,
  stage: mockStage.slug,
  iteration_number: 1,
  original_model_contribution_id: mockContributionId_v1, // Points to AI version
  is_latest_edit: true,
  edit_version: 2,
  user_id: 'user-editor-gcc',
  model_name: 'GPT-4 Super', // Model name might be preserved from original
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
  contribution_type: 'user_edit',
  file_name: 'user-edit-contribution.md',
  storage_bucket: 'test-bucket',
  storage_path: `path/to/${mockContributionId_v2_edit}.md`,
  size_bytes: 120,
  mime_type: 'text/markdown',
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
      selected_model_ids: ['model-catalog-gpt4s'],
      associated_chat_id: null,
      dialectic_contributions: [contribution], 
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
      dialectic_sessions: [mockSession],
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
      activeSessionDetail: mockSession, // Ensure activeSessionDetail is also set for components that might use it directly
      contributionContentCache: contentCache,
      projects: [mockProject], 
      // Removed sessions and contributionsBySession as they were causing type errors
      // and data should flow from currentProjectDetail and activeSessionDetail
      modelCatalog: [
        { 
          id: 'model-catalog-gpt4s', // Used by mockSession's selected_model_ids
          provider_name: 'OpenAI',
          model_name: 'GPT-4 Super', // Corrected from 'name'
          api_identifier: 'gpt-4s',
          description: 'A super model from OpenAI for testing.',
          strengths: ['dialogue', 'code-generation'],
          weaknesses: ['cost', 'speed'],
          context_window_tokens: 8192,
          input_token_cost_usd_millionths: 10, // Example value
          output_token_cost_usd_millionths: 30, // Example value
          max_output_tokens: 4096,
          is_active: true,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          // Removed: family, is_default, features, model_type
          // Renamed/Corrected: input_cost_per_million_tokens, output_cost_per_million_tokens, context_length
        },
      ],
    };
    
    const mergedOverrides: Partial<DialecticStateValues> = { ...baseStateOverrides, ...storeOverrides };
    
    initializeMockDialecticState(mergedOverrides); // Call with a single argument

    // Retrieve the actual mock functions from the initialized store state
    const storeState = getDialecticStoreState();
    const actualFetchMock = storeState.fetchContributionContent as Mock;
    const actualSaveMock = storeState.saveContributionEdit as Mock;

    return {
      mockFetchContentImpl: actualFetchMock,
      mockSaveEditImpl: actualSaveMock
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    initializeMockDialecticState();
    onResponseChangeMock.mockClear();
  });

  const renderCard = (contribution: DialecticContribution, initialResponse: string = '') =>
    render(
      <GeneratedContributionCard 
        contributionId={contribution.id} 
        originalModelContributionIdForResponse={originalModelContributionIdForResponse}
        initialResponseText={initialResponse || ''}
        onResponseChange={onResponseChangeMock}
      />
    );

  describe('Content Display', () => {
    it('fetches content if not in cache and renders it', async () => {
      const { mockFetchContentImpl } = setupStore(mockAIContribution, {}); // Empty cache

      mockFetchContentImpl.mockImplementationOnce(async (id: string) => {
        if (id === mockAIContribution.id) {
          useDialecticStore.setState(current => ({
            contributionContentCache: {
              ...current.contributionContentCache,
              [id]: { content: aiContent, isLoading: false, error: null, mimeType: 'text/markdown' },
            },
          }));
          return { data: { content: aiContent, mimeType: 'text/markdown' }, error: null };
        }
        return { data: null, error: { message: 'Unknown ID', code: 'TEST_ERR' } };
      });

      renderCard(mockAIContribution);

      await waitFor(() => {
        expect(mockFetchContentImpl).toHaveBeenCalledWith(mockAIContribution.id);
        const contentTextarea = screen.getByTestId('content-textarea');
        expect(contentTextarea).toHaveValue(aiContent);
      }, { timeout: 1000 });
    });

    it('displays content directly if already in cache', () => {
      // Cache has the content already
      setupStore(
        mockAIContribution,
        { [mockAIContribution.id]: { content: aiContent, isLoading: false, error: null } }
      );
      renderCard(mockAIContribution);

      const contentTextarea = screen.getByTestId('content-textarea');
      expect(contentTextarea).toHaveValue(aiContent);
      
      // Ensure fetch was NOT called
      const storeActions = getDialecticStoreState() as DialecticStore;
      if (storeActions.fetchContributionContent) {
        const fetchMock = storeActions.fetchContributionContent as Mock;
        expect(fetchMock).not.toHaveBeenCalled();
      }
    });

    it('shows loading skeleton when content is loading', async () => {
      const { mockFetchContentImpl } = setupStore(mockAIContribution, {});
      mockFetchContentImpl.mockImplementationOnce(async (contributionId: string) => {
        useDialecticStore.setState(current => ({
          contributionContentCache: {
            ...current.contributionContentCache,
            [contributionId]: { ...(current.contributionContentCache?.[contributionId] || {}), content: undefined, isLoading: true, error: null, mimeType: undefined },
          },
        }));
        return new Promise(() => {}); // Never resolves
      });

      renderCard(mockAIContribution);

      await waitFor(() => {
        expect(mockFetchContentImpl).toHaveBeenCalledWith(mockAIContribution.id);
        expect(screen.getByTestId('content-loading-skeleton')).toBeInTheDocument();
        expect(screen.queryByTestId('content-textarea')).not.toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it('shows error message when content fetching fails', () => {
      const error: ApiError = { message: 'Failed to load content', code: 'TEST_ERR' };
      setupStore(
        mockAIContribution,
        {
          [mockAIContribution.id]: { content: undefined, isLoading: false, error: error, mimeType: 'text/markdown' },
        }
      );
      renderCard(mockAIContribution);
      expect(screen.getByText(error.message)).toBeInTheDocument();
    });
    
    it('displays "No content available" if content is empty string and not loading/error', () => {
      setupStore(
        mockAIContribution,
        {
          [mockAIContribution.id]: { content: '', isLoading: false, error: null, mimeType: 'text/markdown' },
        }
      );
      renderCard(mockAIContribution);
      const contentTextarea = screen.getByTestId('content-textarea');
      expect(contentTextarea).toHaveValue('No content available');
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

    it('toggles edit mode via preview toggle', async () => {
      setupStore(mockAIContribution, { 
        [mockAIContribution.id!]: { content: aiContent, isLoading: false, error: undefined, mimeType: 'text/markdown' } 
      });
      renderCard(mockAIContribution);

      const previewToggle = screen.getByTestId('content-textarea-preview-toggle');
      expect(previewToggle).toHaveTextContent('Edit');
      
      fireEvent.click(previewToggle);
      
      // After clicking edit, should show save/discard buttons
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Save Edit/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Discard/i })).toBeInTheDocument();
      });
      
      const discardButton = screen.getByRole('button', { name: /Discard/i });
      fireEvent.click(discardButton);
      
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /Save Edit/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Discard/i })).not.toBeInTheDocument();
      });
    });

    it('calls saveContributionEdit thunk on save with correct payload', async () => {
      setupStore(mockAIContribution, { 
        [mockAIContribution.id!]: { content: aiContent, isLoading: false, error: undefined, mimeType: 'text/markdown' } 
      });
      
      const storeActions = getDialecticStoreState();
      const saveEditMock = storeActions.saveContributionEdit as Mock;

      renderCard(mockAIContribution);
      
      const previewToggle = screen.getByTestId('content-textarea-preview-toggle');
      fireEvent.click(previewToggle);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Save Edit/i })).toBeInTheDocument();
      });

      const textarea = screen.getByTestId('content-textarea');
      const newEditedText = "This is my superior edit.";
      fireEvent.change(textarea, { target: { value: newEditedText } });
      
      const saveButton = screen.getByRole('button', { name: /Save Edit/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(saveEditMock).toHaveBeenCalledWith(expect.objectContaining({
          projectId: mockProjectId,
          sessionId: mockAIContribution.session_id,
          originalModelContributionId: mockAIContribution.original_model_contribution_id,
          editedContentText: newEditedText,
          originalContributionIdToEdit: mockAIContribution.id,
        }));
      });
    });

    it('shows loading state for save edit action', async () => {
      const { mockSaveEditImpl } = setupStore(mockAIContribution, { 
        [mockAIContribution.id!]: { content: aiContent, isLoading: false, error: undefined, mimeType: 'text/markdown' } 
      });

      const unresolvedPromise = new Promise(() => {});
      mockSaveEditImpl.mockImplementation(async () => {
        useDialecticStore.setState({ 
          isSavingContributionEdit: true,
          saveContributionEditError: null 
        });
        return unresolvedPromise; 
      });

      renderCard(mockAIContribution);
      
      const previewToggle = screen.getByTestId('content-textarea-preview-toggle');
      fireEvent.click(previewToggle);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Save Edit/i })).toBeInTheDocument();
      });

      const textarea = screen.getByTestId('content-textarea');
      fireEvent.change(textarea, { target: { value: "New content to save" } });
      
      const saveButton = screen.getByRole('button', { name: /Save Edit/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockSaveEditImpl).toHaveBeenCalled();
        const savingButton = screen.getByRole('button', { name: /Saving.../i });
        expect(savingButton).toBeDisabled();
        expect(savingButton.querySelector('svg.animate-spin')).toBeInTheDocument();
      });
    });

    it('shows error if save edit fails', async () => {
      const errorMsg = 'Failed to save contribution edit.';
      const { mockSaveEditImpl } = setupStore(
        mockAIContribution,
        { [mockAIContribution.id!]: { content: aiContent, isLoading: false, error: null, mimeType: 'text/markdown' } }
      );

      mockSaveEditImpl.mockImplementationOnce(async () => {
        const error: ApiError = { code: 'TEST_ERROR', message: errorMsg };
        useDialecticStore.setState({ isSavingContributionEdit: false, saveContributionEditError: error });
        return { data: null, error }; 
      });

      renderCard(mockAIContribution);

      const previewToggle = screen.getByTestId('content-textarea-preview-toggle');
      fireEvent.click(previewToggle);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Save Edit/i })).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('content-textarea'), { target: { value: 'Attempting to save this, expecting failure.' } });
      
      const saveButton = screen.getByRole('button', { name: 'Save Edit' });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockSaveEditImpl).toHaveBeenCalled();
        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
        expect(within(alert).getByText('Save Error')).toBeInTheDocument(); 
        expect(within(alert).getByText(errorMsg)).toBeInTheDocument(); 
        expect(toast.error).toHaveBeenCalledWith("Failed to Save Edit", { description: errorMsg });
        
        const saveButtonAfterError = screen.getByRole('button', { name: 'Save Edit' });
        expect(saveButtonAfterError).not.toBeDisabled();
        expect(saveButtonAfterError.querySelector('svg.animate-spin')).not.toBeInTheDocument();
      });
    });

    it('displays guidance message for editing', async () => {
        setupStore(mockAIContribution, {
          [mockAIContribution.id!]: { content: aiContent, isLoading: false, error: undefined, mimeType: 'text/markdown' } 
        });
        renderCard(mockAIContribution);
        
        const previewToggle = screen.getByTestId('content-textarea-preview-toggle');
        fireEvent.click(previewToggle);
        
        await waitFor(() => {
          expect(screen.getByText(/Recommended for significant corrections/i)).toBeInTheDocument();
        });
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