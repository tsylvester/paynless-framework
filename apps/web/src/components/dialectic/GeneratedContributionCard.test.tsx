import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GeneratedContributionCard } from './GeneratedContributionCard';
// import { useDialecticStore } from '@paynless/store'; // Will be mocked
import { DialecticContribution, DialecticStage, DialecticStore, ContributionCacheEntry, ApiError, DialecticStateValues } from '@paynless/types';
import { vi, Mock, beforeEach, describe, it, expect } from 'vitest';
// Removed: import { createMockStore } from '../../mocks/dialecticStore.mock'; 
import { initializeMockDialecticState, getDialecticStoreState, mockDialecticActions } from '../../mocks/dialecticStore.mock';

// Mock @paynless/store
vi.mock('@paynless/store', async (importOriginal) => {
  const actualStoreModule = await importOriginal<typeof import('@paynless/store')>();
  const mockDialecticStoreUtils = await import('../../mocks/dialecticStore.mock');
  return {
    ...actualStoreModule, // Keep actual selectors like selectContributionById if they exist and are used by the component
    useDialecticStore: mockDialecticStoreUtils.useDialecticStore,
  };
});

// Mock child components
vi.mock('@/components/common/MarkdownRenderer', () => ({
  MarkdownRenderer: vi.fn(({ content }) => <div data-testid="markdown-renderer-mock">{content}</div>),
}));
vi.mock('@/components/common/TextInputArea', () => ({
  TextInputArea: vi.fn(({ value, onChange, rawTextMode, showPreviewToggle, showFileUpload }) => (
    <textarea 
      data-testid={rawTextMode ? "edit-textarea" : "response-textarea"} 
      value={value}
      onChange={(e) => onChange(e.target.value)} 
    />
  ))
}));

const mockContributionId_v1 = 'contrib-ai-original-v1';
const mockContributionId_v2_edit = 'contrib-user-edit-v2';
const originalModelContributionIdForResponse = mockContributionId_v1; // Edits point to the first AI version

const mockAIContribution: DialecticContribution = {
  id: mockContributionId_v1,
  session_id: 'sess-gcc-1',
  stage: DialecticStage.THESIS,
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
  // ... other required fields
  session_model_id: 'sm-gcc-1', actual_prompt_sent: 'prompt-gcc', created_at: 'now', updated_at: 'now',
};

const mockUserEditContribution: DialecticContribution = {
  id: mockContributionId_v2_edit,
  session_id: 'sess-gcc-1',
  stage: DialecticStage.THESIS,
  iteration_number: 1,
  original_model_contribution_id: mockContributionId_v1, // Points to AI version
  is_latest_edit: true,
  edit_version: 2,
  user_id: 'user-editor-gcc',
  model_name: 'GPT-4 Super',
  content_storage_bucket: 'test-bucket',
  content_storage_path: `path/to/${mockContributionId_v2_edit}.md`,
  content_mime_type: 'text/markdown',
  content_size_bytes: 120,
  // ... other required fields
  session_model_id: 'sm-gcc-1', actual_prompt_sent: 'prompt-gcc', created_at: 'now', updated_at: 'now',
};

const aiContent = "# AI Content\nOriginal thoughts.";
const userEditContent = "# User Edited AI Content\nRevised thoughts.";

describe('GeneratedContributionCard', () => {
  // Removed: let currentMockStore: DialecticStore;
  const onResponseChangeMock = vi.fn();

  const setupStore = (contribution: DialecticContribution, contentCache?: Record<string, ContributionCacheEntry>, storeOverrides?: Partial<DialecticStateValues & typeof mockDialecticActions >) => {
    const baseState: DialecticStateValues = {
      currentProjectDetail: {
        id: 'proj-gcc-1',
        dialectic_sessions: [{
          id: 'sess-gcc-1',
          project_id: 'proj-gcc-1',
          current_iteration: 1,
          status: 'thesis_complete',
          session_description: 'desc',
          current_stage_seed_prompt: null,
          iteration_count: 1,
          associated_chat_id: 'c1',
          active_thesis_prompt_template_id: null,
          active_antithesis_prompt_template_id: null,
          active_synthesis_prompt_template_id: null,
          active_parenthesis_prompt_template_id: null,
          active_paralysis_prompt_template_id: null,
          formal_debate_structure_id: null,
          max_iterations: 1,
          convergence_status: null,
          preferred_model_for_stage: null,
          created_at: 'now',
          updated_at: 'now',
          dialectic_contributions: [contribution],
          dialectic_session_models: [],
        }],
        user_id: 'u1',
        project_name: 'p1',
        initial_user_prompt: 'ipu',
        selected_domain_overlay_id: null,
        selected_domain_tag: null,
        repo_url: null,
        status: 'active',
        created_at: 'now',
        updated_at: 'now',
      } as any,
      contributionContentCache: contentCache || {},
      isSavingContributionEdit: false,
      saveContributionEditError: null,
      activeContextProjectId: 'proj-gcc-1',
      activeContextSessionId: 'sess-gcc-1',
      // Initialize other state properties to their defaults from DialecticStateValues or a base mock state
      isLoadingProjects: false, projectsError: null, projects: [],
      isLoadingProjectDetail: false, projectDetailError: null, 
      modelCatalog: [], isLoadingModelCatalog: false, modelCatalogError: null,
      availableDomainTags: [], isLoadingDomainTags: false, domainTagsError: null, selectedDomainTag: null,
      availableDomainOverlays: [], isLoadingDomainOverlays: false, domainOverlaysError: null, selectedDomainOverlayId: null,
      isGeneratingContributions: false, generateContributionsError: null,
      isSubmittingStageResponses: false, submitStageResponsesError: null,
      fetchContributionContent: vi.fn(), // Default mock for actions
      saveContributionEdit: vi.fn(),
      // ... other state and actions ...
    };

    const effectiveState = { ...baseState, ...mockDialecticActions, ...(storeOverrides || {}) }; // Spread mockDialecticActions here
    initializeMockDialecticState(effectiveState as DialecticStore);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderCard = (contributionToRender: DialecticContribution, initialResponse: string = '') =>
    render(
      <GeneratedContributionCard 
        contributionId={contributionToRender.id} 
        originalModelContributionIdForResponse={originalModelContributionIdForResponse}
        initialResponseText={initialResponse}
        onResponseChange={onResponseChangeMock}
      />
    );

  describe('Content Display', () => {
    it('fetches content if not in cache and renders it', async () => {
      const mockFetchImpl = vi.fn(async (fetchedId) => {
        const currentStoreState = getDialecticStoreState() as DialecticStore;
        let pathToUpdate: string | undefined;
        // Ensure projectDetail and sessions exist before trying to access them
        if (currentStoreState.currentProjectDetail && currentStoreState.currentProjectDetail.dialectic_sessions) {
          currentStoreState.currentProjectDetail.dialectic_sessions.forEach(session => {
            if (session.dialectic_contributions) {
              session.dialectic_contributions.forEach(contrib => {
                if (contrib.id === fetchedId) {
                  pathToUpdate = contrib.content_storage_path;
                }
              });
            }
          });
        }

        if (pathToUpdate) {
          initializeMockDialecticState({
            ...currentStoreState,
            contributionContentCache: {
              ...currentStoreState.contributionContentCache,
              [pathToUpdate]: { content: aiContent, isLoading: false, error: undefined, mimeType: 'text/markdown' },
            },
          });
        } else {
          // console.warn(`Path to update not found for ${fetchedId} in mockFetchImpl`);
        }
      });

      setupStore(mockAIContribution, {}, { fetchContributionContent: mockFetchImpl as any });
      renderCard(mockAIContribution); // Initial render
      
      await waitFor(() => {
        expect(mockFetchImpl).toHaveBeenCalledWith(mockAIContribution.id);
      });

      renderCard(mockAIContribution);
      
      await waitFor(() => {
        expect(screen.getByTestId('markdown-renderer-mock')).toHaveTextContent(aiContent.replace("\n", " "));
      });
    });

    it('shows loading skeleton for content', () => {
      setupStore(mockAIContribution, { 
        [mockAIContribution.content_storage_path!]: { isLoading: true, content: undefined, error: undefined, mimeType: undefined } 
      });
      renderCard(mockAIContribution);
      expect(screen.getByTestId('content-loading-skeleton')).toBeInTheDocument();
    });

    it('shows error alert for content fetching failure', () => {
      const errorMsg = 'Failed to load content';
      setupStore(mockAIContribution, { 
        [mockAIContribution.content_storage_path!]: { isLoading: false, error: errorMsg }
      });
      renderCard(mockAIContribution);
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });

    it('indicates if content is a user edit', () => {
      setupStore(mockUserEditContribution, { 
        [mockUserEditContribution.content_storage_path!]: { content: userEditContent, isLoading: false }
      });
      renderCard(mockUserEditContribution);
      expect(screen.getByText(/Edited by user/i)).toBeInTheDocument(); 
    });

     it('shows model name for AI contribution', () => {
      setupStore(mockAIContribution, { 
        [mockAIContribution.content_storage_path!]: { content: aiContent, isLoading: false }
      });
      renderCard(mockAIContribution);
      expect(screen.getByText(new RegExp(mockAIContribution.model_name!, 'i'))).toBeInTheDocument(); 
    });
  });

  describe('Direct Editing Feature', () => {
    beforeEach(() => {
      setupStore(mockAIContribution, { 
        [mockAIContribution.content_storage_path!]: { content: aiContent, isLoading: false, error: undefined, mimeType: 'text/markdown' }
      });
      renderCard(mockAIContribution);
    });

    it('toggles edit mode', () => {
      const editButton = screen.getByTitle(/Edit this contribution/i);
      fireEvent.click(editButton);
      expect(screen.getByTestId('edit-textarea')).toBeInTheDocument();
      expect(screen.getByTestId('edit-textarea')).toHaveValue(aiContent);
      expect(screen.getByRole('button', { name: /Save Edit/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Discard/i })).toBeInTheDocument();
      
      const discardButton = screen.getByRole('button', { name: /Discard/i });
      fireEvent.click(discardButton);
      expect(screen.queryByTestId('edit-textarea')).not.toBeInTheDocument();
    });

    it('calls saveContributionEdit thunk on save with correct payload', async () => {
      fireEvent.click(screen.getByTitle(/Edit this contribution/i));
      const textarea = screen.getByTestId('edit-textarea');
      const newEditedText = "This is my superior edit.";
      fireEvent.change(textarea, { target: { value: newEditedText } });
      
      const saveButton = screen.getByRole('button', { name: /Save Edit/i });
      fireEvent.click(saveButton);

      const store = getDialecticStoreState();
      await waitFor(() => {
        expect(store.saveContributionEdit).toHaveBeenCalledWith({
          originalContributionIdToEdit: mockAIContribution.id, // original_model_contribution_id or id if first version
          editedContentText: newEditedText,
        });
      });
    });

    it('shows loading state for save edit action', () => {
      setupStore(mockAIContribution, 
        { [mockAIContribution.content_storage_path!]: { content: aiContent, isLoading: false, error: undefined, mimeType: 'text/markdown' } }, 
        { isSavingContributionEdit: true }
      );
      fireEvent.click(screen.getByTitle(/Edit this contribution/i));
      const saveButton = screen.getByRole('button', { name: /Saving.../i });
      expect(saveButton).toBeDisabled();
      expect(saveButton).toHaveTextContent(/Saving.../i);
    });

    it('shows error if save edit fails', () => {
      const saveError = "Failed to save edit!";
      setupStore(mockAIContribution, 
        { [mockAIContribution.content_storage_path!]: { content: aiContent, isLoading: false, error: undefined, mimeType: 'text/markdown' } }, 
        { saveContributionEditError: { code:'SaveError', message: saveError} as ApiError }
      );
      fireEvent.click(screen.getByTitle(/Edit this contribution/i));
      expect(screen.getByText(saveError)).toBeInTheDocument();
    });

    it('displays guidance message for editing', () => {
        // The guidance message appears when isEditing is true.
        // The beforeEach for this describe block renders the card in a non-editing state.
        // So, first, we need to click the edit button.
        fireEvent.click(screen.getByTitle(/Edit this contribution/i));
        expect(screen.getByText(/Recommended for minor corrections/i)).toBeInTheDocument();
    });
  });

  describe('User Response Area', () => {
    beforeEach(() => {
      setupStore(mockAIContribution, { 
        [mockAIContribution.content_storage_path!]: { content: aiContent, isLoading: false }
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