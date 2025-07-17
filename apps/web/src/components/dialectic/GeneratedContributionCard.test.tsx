import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeneratedContributionCard } from './GeneratedContributionCard';
import { 
  DialecticContribution, 
  ContributionCacheEntry, 
  ApiError
} from '@paynless/types';
import { vi, beforeEach, describe, it, expect } from 'vitest';
import { initializeMockDialecticState, getDialecticStoreState, setDialecticStateValues } from '../../mocks/dialecticStore.mock';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock @paynless/store to use our mock implementation
vi.mock('@paynless/store', async (importOriginal) => {
  const mockStoreExports = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
  const actualStoreModule = await importOriginal<typeof import('@paynless/store')>();

  return {
    ...actualStoreModule,
    ...mockStoreExports,
  };
});

// Mock child components
vi.mock('@/components/common/TextInputArea', () => ({
    TextInputArea: vi.fn((props) => {
    const isResponseArea = props.id && props.id.startsWith('response-');
    const isContentArea = props.onPreviewModeChange && !isResponseArea;
    
    const testId = isContentArea ? 'content-textarea' : 'response-textarea';
    const mockId = props.id || `${testId}-mock-id`;

    const handlePreviewToggle = () => props.onPreviewModeChange?.(!props.initialPreviewMode);

    return (
      <div>
        <textarea
          data-testid={testId}
          id={mockId}
          value={props.value}
          onChange={(e) => props.onChange?.(e.target.value)}
          placeholder={props.placeholder}
          disabled={props.disabled}
        />
        {props.showPreviewToggle && (
          <button data-testid={`${testId}-preview-toggle`} onClick={handlePreviewToggle} type="button">
            Toggle Preview
          </button>
        )}
      </div>
    );
  })
}));

const mockProjectId = 'proj-gcc-1';
const mockSessionId = 'sess-gcc-1';
const modelId = 'model-gpt4s';
const modelName = 'GPT-4 Super';
const iterationNumber = 1;

// --- MOCK DATA ---
const createMockContribution = (
  id: string,
  status?: DialecticContribution['status'],
  error?: ApiError | null,
  content?: string,
): DialecticContribution => ({
  id,
  session_id: mockSessionId,
  stage: 'thesis',
  iteration_number: iterationNumber,
  original_model_contribution_id: id,
  is_latest_edit: true,
  edit_version: 1,
  user_id: null,
  model_name: modelName,
  model_id: modelId,
  created_at: 'now',
  updated_at: 'now',
  prompt_template_id_used: 'tpl-thesis-default',
  seed_prompt_url: null,
  raw_response_storage_path: `path/to/raw/${id}.json`,
  target_contribution_id: null,
  tokens_used_input: 10,
  tokens_used_output: 200,
  processing_time_ms: 1500,
  citations: [],
  contribution_type: 'ai',
  file_name: 'ai-contribution.md',
  storage_bucket: 'test-bucket',
  storage_path: `path/to/${id}.md`,
  size_bytes: content?.length || 100,
  mime_type: 'text/markdown',
  status,
  error: error || null,
});

const completedContent = "# Final AI Content\nThis is the complete and final response.";
const partialContent = "# Partial AI Content\nThis is the first part of the response...";

const mockCompletedContribution = createMockContribution('contrib-completed', 'completed', null, completedContent);
const mockPendingContribution = createMockContribution(`placeholder-${mockSessionId}-${modelId}-${iterationNumber}`, 'pending');
const mockGeneratingContribution = createMockContribution(`placeholder-${mockSessionId}-${modelId}-${iterationNumber}`, 'generating');
const mockContinuingContribution = createMockContribution(`placeholder-${mockSessionId}-${modelId}-${iterationNumber}`, 'continuing', null, partialContent);
const mockRetryingContribution = createMockContribution(`placeholder-${mockSessionId}-${modelId}-${iterationNumber}`, 'retrying', { message: 'First attempt failed', code: 'E01' });
const mockFailedContribution = createMockContribution(`placeholder-${mockSessionId}-${modelId}-${iterationNumber}`, 'failed', { message: 'All attempts failed', code: 'E02' });


describe('GeneratedContributionCard', () => {
  const onResponseChangeMock = vi.fn();

  // Helper to set up the store with specific state for a test
  const setupStore = (
    contribution: DialecticContribution | null,
    contentCache: Record<string, ContributionCacheEntry> = {},
  ) => {
    act(() => {
      const contributions = contribution ? [contribution] : [];
      initializeMockDialecticState({
        activeContextProjectId: mockProjectId,
        activeContextSessionId: mockSessionId,
        currentProjectDetail: {
          id: mockProjectId,
          dialectic_sessions: [{
            id: mockSessionId,
            dialectic_contributions: contributions,
            // ... other required session fields
            project_id: mockProjectId, status: 'active', session_description: '', user_input_reference_url: null, iteration_count: 1, selected_model_ids: [], associated_chat_id: null, current_stage_id: null, created_at: 'now', updated_at: 'now',
          }],
          // ... other required project fields
          user_id: 'user-1', project_name: 'Test Project', selected_domain_id: 'd-1', dialectic_domains: null, selected_domain_overlay_id: null, repo_url: null, status: 'active', created_at: 'now', updated_at: 'now', dialectic_process_templates: null, isLoadingProcessTemplate: false, processTemplateError: null, contributionGenerationStatus: 'idle', generateContributionsError: null, isSubmittingStageResponses: false, submitStageResponsesError: null, isSavingContributionEdit: false, saveContributionEditError: null,
        },
        contributionContentCache: contentCache,
      });
    });
  };

  const renderCard = (contributionId: string) => {
    return render(
      <GeneratedContributionCard
        contributionId={contributionId}
        originalModelContributionIdForResponse={contributionId}
        initialResponseText=""
        onResponseChange={onResponseChangeMock}
      />
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  describe('Content Display and Editing', () => {
    it('fetches content on render if contribution exists and is not in cache', async () => {
      setupStore(mockCompletedContribution);
      const { fetchContributionContent } = getDialecticStoreState();
      renderCard(mockCompletedContribution.id);
      
      await waitFor(() => {
        expect(fetchContributionContent).toHaveBeenCalledWith(mockCompletedContribution.id);
      });
    });

    it('displays content from cache', async () => {
        const cache: Record<string, ContributionCacheEntry> = {
            [mockCompletedContribution.id]: { content: completedContent, isLoading: false, error: null }
        };
        setupStore(mockCompletedContribution, cache);
        renderCard(mockCompletedContribution.id);
        
        await waitFor(() => {
            const contentTextArea: HTMLTextAreaElement = screen.getByTestId('content-textarea');
            expect(contentTextArea.value).toBe(completedContent);
        });
    });
    
    it('shows an error message if fetching content fails', async () => {
      const error: ApiError = { message: "Fetch Failed", code: 'FETCH_ERR' };
      setupStore(mockCompletedContribution, { [mockCompletedContribution.id]: { isLoading: false, error } });
      renderCard(mockCompletedContribution.id);
      expect(await screen.findByText("Fetch Failed")).toBeInTheDocument();
    });

    it('allows user to enter and save an edit', async () => {
      const user = userEvent.setup();
      setupStore(mockCompletedContribution, { [mockCompletedContribution.id]: { content: completedContent, isLoading: false } });
      const { saveContributionEdit } = getDialecticStoreState();
      vi.mocked(saveContributionEdit).mockResolvedValue({ data: { ...mockCompletedContribution, edit_version: 2 }, status: 200 });

      renderCard(mockCompletedContribution.id);
      await user.click(screen.getByTestId('content-textarea-preview-toggle'));
      
      const contentTextarea = screen.getByTestId('content-textarea');
      await user.clear(contentTextarea);
      await user.type(contentTextarea, "My new edit.");
      
      await user.click(screen.getByRole('button', { name: /Save Edit/i }));

      await waitFor(() => {
        expect(saveContributionEdit).toHaveBeenCalledWith(expect.objectContaining({ editedContentText: "My new edit." }));
        expect(toast.success).toHaveBeenCalled();
      });
    });
  });

  describe('Asynchronous Status Lifecycle', () => {
    it('renders a skeleton loader if the contribution does not exist in the store yet', () => {
        setupStore(null); // No contribution in the store initially
        renderCard('some-non-existent-id');
        expect(screen.getByTestId('skeleton-card')).toBeInTheDocument();
    });

    it('transitions from pending to generating', async () => {
        setupStore(mockPendingContribution);
        renderCard(mockPendingContribution.id);
        expect(screen.getByText(/pending in the queue/i)).toBeInTheDocument();

        // Simulate store update
        act(() => {
            const currentState = getDialecticStoreState();
            if (!currentState.currentProjectDetail || !currentState.currentProjectDetail.dialectic_sessions?.[0]) {
                throw new Error("Test setup failed: currentProjectDetail or session is missing in state.");
            }
            
            const newState = {
                ...currentState,
                currentProjectDetail: {
                    ...currentState.currentProjectDetail,
                    dialectic_sessions: [{
                        ...currentState.currentProjectDetail.dialectic_sessions[0],
                        dialectic_contributions: [mockGeneratingContribution],
                    }]
                }
            };
            setDialecticStateValues(newState);
        });
        
        await waitFor(() => {
            expect(screen.getByText(/Generating contribution/i)).toBeInTheDocument();
        });
    });

    it('transitions from generating to continuing', async () => {
        setupStore(mockGeneratingContribution);
        renderCard(mockGeneratingContribution.id);
        expect(screen.getByText(/Generating contribution/i)).toBeInTheDocument();

        // Simulate store update
        act(() => {
            const currentState = getDialecticStoreState();
            if (!currentState.currentProjectDetail || !currentState.currentProjectDetail.dialectic_sessions?.[0]) {
                throw new Error("Test setup failed: currentProjectDetail or session is missing in state.");
            }

            const newState = {
                ...currentState,
                currentProjectDetail: {
                    ...currentState.currentProjectDetail,
                    dialectic_sessions: [{
                        ...currentState.currentProjectDetail.dialectic_sessions[0],
                        dialectic_contributions: [mockContinuingContribution],
                    }]
                }
            };
            setDialecticStateValues(newState);
        });

        await waitFor(() => {
            expect(screen.getByText(/Receiving response/i)).toBeInTheDocument();
        });
    });
    
    it('renders retrying state with an error message', () => {
        setupStore(mockRetryingContribution);
        renderCard(mockRetryingContribution.id);
        expect(screen.getByText(/An issue occurred. Retrying generation/i)).toBeInTheDocument();
        expect(screen.getByText(/First attempt failed/i)).toBeInTheDocument();
    });

    it('renders failed state with an error message', () => {
      setupStore(mockFailedContribution);
      renderCard(mockFailedContribution.id);
      expect(screen.getByText(/Generation Failed/i)).toBeInTheDocument();
      expect(screen.getByText(/All attempts failed/i)).toBeInTheDocument();
    });
  });
}); 