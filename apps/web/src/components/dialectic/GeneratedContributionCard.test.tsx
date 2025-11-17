import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeneratedContributionCard } from './GeneratedContributionCard';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initializeMockDialecticState, getDialecticStoreState } from '../../mocks/dialecticStore.mock';
import { toast } from 'sonner';
import {
  StageRunDocumentDescriptor,
  StageDocumentCompositeKey,
  SetFocusedStageDocumentPayload,
  StageRunChecklistProps,
  SaveContributionEditPayload,
  DialecticContribution,
  DialecticStageRecipe,
} from '@paynless/types';
// --- MOCKS ---

const getStageDocumentKey = (key: StageDocumentCompositeKey): string =>
	`${key.sessionId}:${key.stageSlug}:${key.iterationNumber}:${key.modelId}:${key.documentKey}`;

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the store to use our mock implementation
vi.mock('@paynless/store', async (importOriginal) => {
  const mockStoreExports = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
  const actualStoreModule = await importOriginal<typeof import('@paynless/store')>();
  
  // Capture the real selectors in closure variables
  const realSelectStageDocumentResource = actualStoreModule.selectStageDocumentResource;
  const realSelectValidMarkdownDocumentKeys = actualStoreModule.selectValidMarkdownDocumentKeys;
  
  // Use the actual selector implementations so they read from state
  // Tests can still spy on them to verify they're called
  // The mocks call through to the real functions by default
  const mockSelectStageDocumentResource = vi.fn((...args: Parameters<typeof actualStoreModule.selectStageDocumentResource>) => {
    return realSelectStageDocumentResource(...args);
  });
  
  const mockSelectValidMarkdownDocumentKeys = vi.fn((...args: Parameters<typeof actualStoreModule.selectValidMarkdownDocumentKeys>) => {
    return realSelectValidMarkdownDocumentKeys(...args);
  });
  
  return { 
    ...actualStoreModule, 
    ...mockStoreExports,
    selectStageDocumentResource: mockSelectStageDocumentResource,
    selectValidMarkdownDocumentKeys: mockSelectValidMarkdownDocumentKeys,
  };
});

// Get reference to the mocked selector after module is loaded
import { selectStageDocumentResource, selectValidMarkdownDocumentKeys } from '@paynless/store';
const mockSelectStageDocumentResource = vi.mocked(selectStageDocumentResource);
const mockSelectValidMarkdownDocumentKeys = vi.mocked(selectValidMarkdownDocumentKeys);

// Mock child components
vi.mock('@/components/common/TextInputArea', () => ({
  TextInputArea: vi.fn(({ value, onChange, placeholder, disabled, label, id }) => (
    <div>
      {label && <label htmlFor={id}>{label}</label>}
      <textarea
        // NOTE: The test now finds these by placeholder or display value, not testid
        data-testid={placeholder?.startsWith('Enter feedback') ? 'feedback-textarea' : 'content-textarea'}
        id={id}
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  )),
}));

const stageRunChecklistMock = vi.fn<[StageRunChecklistProps], void>();

vi.mock('./StageRunChecklist', () => ({
  StageRunChecklist: (props: StageRunChecklistProps) => {
    stageRunChecklistMock(props);
    const { modelId } = props;
    return (
      <div data-testid="stage-run-checklist" data-model-id={modelId}>
        Stage Run Checklist for {modelId}
      </div>
    );
  },
}));

// --- TEST SETUP ---

const mockProjectId = 'proj-gcc-1';
const mockSessionId = 'sess-gcc-1';
const mockStageSlug = 'synthesis';
const iterationNumber = 1;
const progressKey = `${mockSessionId}:${mockStageSlug}:${iterationNumber}`;

const modelA = 'model-a';
const modelB = 'model-b';

const docA1Key = 'doc-a1';
const docA2Key = 'doc-a2';
const docB1Key = 'doc-b1';

const docA1: StageRunDocumentDescriptor = {
  modelId: modelA,
  status: 'completed',
  job_id: 'job-a1',
  latestRenderedResourceId: 'path/to/a1.md',
  versionHash: 'hash-a1',
  lastRenderedResourceId: 'path/to/a1.md',
  lastRenderAtIso: '2023-01-01T00:00:00Z',
};
const docA2: StageRunDocumentDescriptor = {
  modelId: modelA,
  status: 'generating',
  job_id: 'job-a2',
  latestRenderedResourceId: 'path/to/a2.md',
  versionHash: 'hash-a2',
  lastRenderedResourceId: 'path/to/a2.md',
  lastRenderAtIso: '2023-01-01T00:00:00Z',
};
const docB1: StageRunDocumentDescriptor = {
  modelId: modelB,
  status: 'completed',
  job_id: 'job-b1',
  latestRenderedResourceId: 'path/to/b1.md',
  versionHash: 'hash-b1',
  lastRenderedResourceId: 'path/to/b1.md',
  lastRenderAtIso: '2023-01-01T00:00:00Z',
};

const buildFocusKey = (modelId: string) => `${mockSessionId}:${mockStageSlug}:${modelId}`;

// Recipe with test document keys as valid markdown outputs
const defaultTestRecipe: DialecticStageRecipe = {
  stageSlug: mockStageSlug,
  instanceId: 'instance-test',
  steps: [
    {
      id: 'step-doc-a1',
      step_key: 'step_doc_a1',
      step_slug: 'step-doc-a1',
      step_name: 'Document A1 Step',
      execution_order: 1,
      parallel_group: 1,
      branch_key: 'branch-1',
      job_type: 'EXECUTE',
      prompt_type: 'Turn',
      prompt_template_id: 'prompt-1',
      output_type: 'assembled_document_json',
      granularity_strategy: 'per_source_document',
      inputs_required: [],
      inputs_relevance: [],
      outputs_required: [
        {
          document_key: docA1Key,
          artifact_class: 'rendered_document',
          file_type: 'markdown',
        },
      ],
    },
    {
      id: 'step-doc-a2',
      step_key: 'step_doc_a2',
      step_slug: 'step-doc-a2',
      step_name: 'Document A2 Step',
      execution_order: 2,
      parallel_group: 2,
      branch_key: 'branch-2',
      job_type: 'EXECUTE',
      prompt_type: 'Turn',
      prompt_template_id: 'prompt-2',
      output_type: 'assembled_document_json',
      granularity_strategy: 'per_source_document',
      inputs_required: [],
      inputs_relevance: [],
      outputs_required: [
        {
          document_key: docA2Key,
          artifact_class: 'rendered_document',
          file_type: 'markdown',
        },
      ],
    },
    {
      id: 'step-doc-b1',
      step_key: 'step_doc_b1',
      step_slug: 'step-doc-b1',
      step_name: 'Document B1 Step',
      execution_order: 3,
      parallel_group: 3,
      branch_key: 'branch-3',
      job_type: 'EXECUTE',
      prompt_type: 'Turn',
      prompt_template_id: 'prompt-3',
      output_type: 'assembled_document_json',
      granularity_strategy: 'per_source_document',
      inputs_required: [],
      inputs_relevance: [],
      outputs_required: [
        {
          document_key: docB1Key,
          artifact_class: 'rendered_document',
          file_type: 'markdown',
        },
      ],
    },
  ],
};

const setupStore = ({
  focusedDocument = null,
  content = '',
  feedback = '',
  isLoading = false,
  contribution = null,
  sourceContributionId = null,
  recipesByStageSlug = {},
}: {
  focusedDocument?: { modelId: string; documentKey: string } | null;
  content?: string;
  feedback?: string;
  isLoading?: boolean;
  contribution?: DialecticContribution | null;
  sourceContributionId?: string | null;
  recipesByStageSlug?: Record<string, DialecticStageRecipe>;
}) => {
  // Merge default recipe with provided recipes (provided recipes take precedence)
  const mergedRecipesByStageSlug: Record<string, DialecticStageRecipe> = {
    [mockStageSlug]: defaultTestRecipe,
    ...recipesByStageSlug,
  };
  const documents = {
    [docA1Key]: docA1,
    [docA2Key]: docA2,
    [docB1Key]: docB1,
  };

  const compositeKey = focusedDocument 
    ? getStageDocumentKey({
        sessionId: mockSessionId,
        stageSlug: mockStageSlug,
        iterationNumber,
        modelId: focusedDocument.modelId,
        documentKey: focusedDocument.documentKey,
      })
    : null;
    
  const contentState = compositeKey ? {
    [compositeKey]: {
      baselineMarkdown: content,
      currentDraftMarkdown: feedback,
      isDirty: feedback !== '',
      isLoading: isLoading,
      error: null,
      lastBaselineVersion: sourceContributionId ? { resourceId: sourceContributionId, versionHash: 'hash-1', updatedAt: '2023-01-01T00:00:00Z' } : null,
      pendingDiff: null,
      lastAppliedVersionHash: 'hash-1',
    }
  } : {};

  initializeMockDialecticState({
    activeContextProjectId: mockProjectId,
    activeContextSessionId: mockSessionId,
    activeStageSlug: mockStageSlug,
    activeSessionDetail: {
      id: mockSessionId,
      project_id: mockProjectId,
      session_description: 'Mock Session',
      user_input_reference_url: null,
      iteration_count: iterationNumber,
      selected_model_ids: [modelA, modelB],
      status: 'active',
      associated_chat_id: null,
      current_stage_id: mockStageSlug,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
      dialectic_contributions: contribution ? [contribution] : [],
    },
    modelCatalog: [
      { id: modelA, model_name: 'Model Alpha', provider_name: 'OpenAI', api_identifier: 'openai', description: '', created_at: '', updated_at: '', is_active: true, context_window_tokens: 0, input_token_cost_usd_millionths: 0, output_token_cost_usd_millionths: 0, max_output_tokens: 0, strengths: [], weaknesses: [] },
      { id: modelB, model_name: 'Model Beta', provider_name: 'Anthropic', api_identifier: 'anthropic', description: '', created_at: '', updated_at: '', is_active: true, context_window_tokens: 0, input_token_cost_usd_millionths: 0, output_token_cost_usd_millionths: 0, max_output_tokens: 0, strengths: [], weaknesses: [] },
    ],
    stageRunProgress: {
      [progressKey]: {
        stepStatuses: {},
        documents: documents,
      },
    },
    focusedStageDocument: focusedDocument ? {
      [buildFocusKey(focusedDocument.modelId)]: focusedDocument,
    } : {},
    stageDocumentContent: contentState,
    recipesByStageSlug: mergedRecipesByStageSlug,
  });
};

describe('GeneratedContributionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stageRunChecklistMock.mockClear();
    mockSelectStageDocumentResource.mockClear();
    mockSelectValidMarkdownDocumentKeys.mockClear();
  });

  it('renders model and document metadata when its model has a focused document', async () => {
    setupStore({
      focusedDocument: { modelId: modelA, documentKey: docA1Key },
      content: 'Document A1 baseline',
    });

    render(<GeneratedContributionCard modelId={modelA} />);

    expect(await screen.findByText(/Model Alpha/i)).toBeInTheDocument();
    expect(screen.getByText(/Document: doc-a1/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Document A1 baseline')).toBeInTheDocument();
  });

  it('displays a placeholder when its model has no focused document', () => {
    setupStore({
      focusedDocument: { modelId: modelB, documentKey: docB1Key },
    });

    render(<GeneratedContributionCard modelId={modelA} />);

    expect(
      screen.getByText(/Select a document to view its content and provide feedback./i),
    ).toBeInTheDocument();
  });

  it('passes focus state to StageRunChecklist and forwards selections', () => {
    setupStore({
      focusedDocument: { modelId: modelA, documentKey: docA1Key },
    });
    const { setFocusedStageDocument } = getDialecticStoreState();

    render(<GeneratedContributionCard modelId={modelA} />);

    expect(stageRunChecklistMock).toHaveBeenCalled();
    const lastCall = stageRunChecklistMock.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const checklistProps = lastCall![0];

    expect(checklistProps.modelId).toBe(modelA);
    expect(checklistProps.focusedStageDocumentMap).toEqual(
      expect.objectContaining({
        [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
      }),
    );

    const handleSelectPayload: SetFocusedStageDocumentPayload = {
      sessionId: mockSessionId,
      stageSlug: mockStageSlug,
      iterationNumber,
      modelId: modelA,
      documentKey: docA2Key,
      stepKey: 'draft_document',
    };

    checklistProps.onDocumentSelect(handleSelectPayload);

    expect(setFocusedStageDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: mockSessionId,
        stageSlug: mockStageSlug,
        iterationNumber,
        modelId: modelA,
        documentKey: docA2Key,
      }),
    );
  });

  it('updates the stage document draft when feedback changes', async () => {
    const user = userEvent.setup();
    setupStore({
      focusedDocument: { modelId: modelA, documentKey: docA1Key },
      content: 'Baseline content',
      feedback: 'Existing feedback',
    });

    const { updateStageDocumentDraft } = getDialecticStoreState();

    render(<GeneratedContributionCard modelId={modelA} />);

    const feedbackTextarea = await screen.findByPlaceholderText(/Enter feedback for doc-a1/i);
    await user.type(feedbackTextarea, ' - updated');

    const expectedKey: StageDocumentCompositeKey = {
      sessionId: mockSessionId,
      stageSlug: mockStageSlug,
      iterationNumber,
      modelId: modelA,
      documentKey: docA1Key,
    };

    await waitFor(() => {
      // user.type types character by character, so check the last call
      const mockedUpdate = vi.mocked(updateStageDocumentDraft);
      const calls = mockedUpdate.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toEqual(expect.objectContaining(expectedKey));
      expect(lastCall[1]).toBe('Existing feedback - updated');
    });
  });

  it('allows user to enter feedback and save it for the correct document', async () => {
    const user = userEvent.setup();
    setupStore({
      focusedDocument: { modelId: modelA, documentKey: docA1Key },
      content: 'Content for A1',
      feedback: 'This is my feedback for A1.',
    });
    const { submitStageDocumentFeedback, updateStageDocumentDraft } = getDialecticStoreState();

    render(<GeneratedContributionCard modelId={modelA} />);

    const feedbackTextarea = await screen.findByPlaceholderText(/Enter feedback for doc-a1/i);
    await user.type(feedbackTextarea, ' This is new feedback.');

    const expectedKey: StageDocumentCompositeKey = {
      sessionId: mockSessionId,
      stageSlug: mockStageSlug,
      iterationNumber,
      modelId: modelA,
      documentKey: docA1Key,
    };

    await waitFor(() => {
      // user.type types character by character, so check the last call
      const mockedUpdate = vi.mocked(updateStageDocumentDraft);
      const calls = mockedUpdate.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toEqual(expect.objectContaining(expectedKey));
      expect(lastCall[1]).toBe('This is my feedback for A1. This is new feedback.');
    });

    const saveButton = screen.getByRole('button', { name: /save feedback/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(submitStageDocumentFeedback).toHaveBeenCalled();
      const callArgs = vi.mocked(submitStageDocumentFeedback).mock.calls[0]?.[0];
      
      // Verify all required composite key fields are present
      expect(callArgs).toHaveProperty('sessionId', mockSessionId);
      expect(callArgs).toHaveProperty('stageSlug', mockStageSlug);
      expect(callArgs).toHaveProperty('iterationNumber', iterationNumber);
      expect(callArgs).toHaveProperty('modelId', modelA);
      expect(callArgs).toHaveProperty('documentKey', docA1Key);
      expect(callArgs).toHaveProperty('feedback', 'This is my feedback for A1. This is new feedback.');
      
      // Verify component passes only composite key + feedback; store may enrich with sourceContributionId
      // Component does not compute or set sourceContributionId - that's the store's responsibility
      // This assertion verifies the payload structure is compatible with enriched payloads
      expect(callArgs).toEqual(
        expect.objectContaining({
          ...expectedKey,
          feedback: 'This is my feedback for A1. This is new feedback.',
        }),
      );
      
      expect(toast.success).toHaveBeenCalledWith('Feedback saved successfully.');
    });
  });

  describe('document editing', () => {
    beforeEach(() => {
      mockSelectStageDocumentResource.mockClear();
    });

    it('should use selectStageDocumentResource selector instead of direct state access', () => {
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document content',
      });

      const documentResourceState = {
        baselineMarkdown: 'Document content',
        currentDraftMarkdown: '',
        isDirty: false,
        isLoading: false,
        error: null,
        lastBaselineVersion: { resourceId: 'res-1', versionHash: 'hash-1', updatedAt: '2023-01-01T00:00:00Z' },
        pendingDiff: null,
        lastAppliedVersionHash: 'hash-1',
      };

      mockSelectStageDocumentResource.mockReturnValue(documentResourceState);

      render(<GeneratedContributionCard modelId={modelA} />);

      expect(mockSelectStageDocumentResource).toHaveBeenCalledWith(
        expect.any(Object),
        mockSessionId,
        mockStageSlug,
        iterationNumber,
        modelA,
        docA1Key,
      );
    });

    it('should render stageDocumentContent entries using selectStageDocumentResource', async () => {
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document content from resource',
      });

      const documentResourceState = {
        baselineMarkdown: 'Document content from resource',
        currentDraftMarkdown: '',
        isDirty: false,
        isLoading: false,
        error: null,
        lastBaselineVersion: { resourceId: 'res-1', versionHash: 'hash-1', updatedAt: '2023-01-01T00:00:00Z' },
        pendingDiff: null,
        lastAppliedVersionHash: 'hash-1',
      };

      mockSelectStageDocumentResource.mockReturnValue(documentResourceState);

      render(<GeneratedContributionCard modelId={modelA} />);

      expect(await screen.findByDisplayValue('Document content from resource')).toBeInTheDocument();
    });

    it('should call saveContributionEdit with originalContributionIdToEdit derived from resource state, not dialectic_contributions', async () => {
      const user = userEvent.setup();
      const originalContributionId = 'contrib-orig-123';
      
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Original document content',
        contribution: null,
        sourceContributionId: originalContributionId,
      });

      // Don't override the selector - let it read from the actual store state
      // Reset any previous mockReturnValue and restore the default call-through implementation
      mockSelectStageDocumentResource.mockReset();
      // The mock factory captures the real selector in a closure, but after mockReset we need to restore it
      // Import the actual module to get the real selector
      const actualStoreModule = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
      mockSelectStageDocumentResource.mockImplementation((...args) => {
        return actualStoreModule.selectStageDocumentResource(...args);
      });

      const { saveContributionEdit, updateStageDocumentDraft } = getDialecticStoreState();

      // Update the draft BEFORE rendering so the component renders with the correct content
      const compositeKey: StageDocumentCompositeKey = {
        sessionId: mockSessionId,
        stageSlug: mockStageSlug,
        iterationNumber,
        modelId: modelA,
        documentKey: docA1Key,
      };
      updateStageDocumentDraft(compositeKey, 'Edited document content');

      render(<GeneratedContributionCard modelId={modelA} />);
      
      // Wait for the component to render with the updated content
      await waitFor(() => {
        const contentTextarea = screen.getByTestId('content-textarea');
        expect(contentTextarea).toHaveValue('Edited document content');
      });

      const saveEditButton = screen.getByRole('button', { name: /save edit/i });
      await waitFor(() => {
        expect(saveEditButton).not.toBeDisabled();
      });
      await user.click(saveEditButton);

      const expectedPayload: SaveContributionEditPayload = {
        originalContributionIdToEdit: originalContributionId,
        editedContentText: 'Edited document content',
        projectId: mockProjectId,
        sessionId: mockSessionId,
        originalModelContributionId: originalContributionId,
        responseText: 'Edited document content',
        documentKey: docA1Key,
        resourceType: 'rendered_document',
      };

      await waitFor(() => {
        expect(saveContributionEdit).toHaveBeenCalledWith(
          expect.objectContaining(expectedPayload),
        );
        
        const activeSessionDetail = getDialecticStoreState().activeSessionDetail;
        expect(activeSessionDetail?.dialectic_contributions).toEqual([]);
      });
    });

    it('should display EditedDocumentResource metadata after successful edit', async () => {
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document content',
      });

      const documentResourceState = {
        baselineMarkdown: 'Edited content',
        currentDraftMarkdown: 'Edited content',
        isDirty: false,
        isLoading: false,
        error: null,
        lastBaselineVersion: {
          resourceId: 'resource-456',
          versionHash: 'hash-456',
          updatedAt: '2023-01-02T12:00:00Z',
        },
        pendingDiff: null,
        lastAppliedVersionHash: 'hash-456',
      };

      mockSelectStageDocumentResource.mockReturnValue(documentResourceState);

      render(<GeneratedContributionCard modelId={modelA} />);

      // Assert metadata is displayed (last updated timestamp)
      expect(await screen.findByText(/Last updated:/i)).toBeInTheDocument();
      expect(screen.getByText(/2023-01-02/i)).toBeInTheDocument();
    });

    it('should show optimistic UI updates after saveContributionEdit succeeds using resource-driven state', async () => {
      const user = userEvent.setup();
      const originalContributionId = 'contrib-orig-123';
      
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Original content',
        contribution: null,
        sourceContributionId: originalContributionId,
      });

      // Don't override the selector - let it read from the actual store state
      // Reset the mock to clear any previous mockReturnValue and restore default call-through behavior
      mockSelectStageDocumentResource.mockReset();
      const actualStoreModule = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
      mockSelectStageDocumentResource.mockImplementation((...args) => {
        return actualStoreModule.selectStageDocumentResource(...args);
      });

      const { saveContributionEdit, updateStageDocumentDraft } = getDialecticStoreState();

      render(<GeneratedContributionCard modelId={modelA} />);

      // Directly set the new content in the store - the component uses || so empty string falls back to baseline
      const compositeKey: StageDocumentCompositeKey = {
        sessionId: mockSessionId,
        stageSlug: mockStageSlug,
        iterationNumber,
        modelId: modelA,
        documentKey: docA1Key,
      };
      updateStageDocumentDraft(compositeKey, 'Edited content');
      
      // Wait for the store to update and component to re-render with the new content
      await waitFor(() => {
        const contentTextarea = screen.getByTestId('content-textarea');
        expect(contentTextarea).toHaveValue('Edited content');
      });

      // Save the edit
      const saveEditButton = screen.getByRole('button', { name: /save edit/i });
      await user.click(saveEditButton);

      // Assert saveContributionEdit was called
      const expectedPayload: SaveContributionEditPayload = {
        originalContributionIdToEdit: originalContributionId,
        editedContentText: 'Edited content',
        projectId: mockProjectId,
        sessionId: mockSessionId,
        originalModelContributionId: originalContributionId,
        responseText: 'Edited content',
        documentKey: docA1Key,
        resourceType: 'rendered_document',
      };

      await waitFor(() => {
        expect(saveContributionEdit).toHaveBeenCalledWith(
          expect.objectContaining(expectedPayload),
        );
      });

      const { updateStageDocumentResource } = getDialecticStoreState();
      updateStageDocumentResource(
        {
          sessionId: mockSessionId,
          stageSlug: mockStageSlug,
          iterationNumber,
          modelId: modelA,
          documentKey: docA1Key,
        },
        {
          id: 'resource-new',
          resource_type: 'rendered_document',
          project_id: mockProjectId,
          session_id: mockSessionId,
          stage_slug: mockStageSlug,
          iteration_number: iterationNumber,
          document_key: docA1Key,
          source_contribution_id: originalContributionId,
          storage_bucket: 'dialectic-resources',
          storage_path: '/edited/resource-new.md',
          file_name: 'edited-resource-new.md',
          mime_type: 'text/markdown',
          size_bytes: 'Edited content'.length,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T12:00:00Z',
        },
        'Edited content',
      );

      await waitFor(() => {
        const contentTextarea = screen.getByTestId('content-textarea');
        expect(contentTextarea).toHaveValue('Edited content');
        expect(screen.getByText(/Last updated:/i)).toBeInTheDocument();
        expect(screen.getByText(/2023-01-02/i)).toBeInTheDocument();
      });

      expect(toast.success).toHaveBeenCalledWith('Edit saved successfully.');
    });

    it('should enable save edit button based on resource state, not dialectic_contributions', async () => {
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document content',
        contribution: null,
        sourceContributionId: 'contrib-123',
      });

      const { updateStageDocumentDraft } = getDialecticStoreState();
      const compositeKey: StageDocumentCompositeKey = {
        sessionId: mockSessionId,
        stageSlug: mockStageSlug,
        iterationNumber,
        modelId: modelA,
        documentKey: docA1Key,
      };
      
      // Set draft content
      updateStageDocumentDraft(compositeKey, 'Edited content');

      render(<GeneratedContributionCard modelId={modelA} />);

      await waitFor(() => {
        const saveEditButton = screen.getByRole('button', { name: /save edit/i });
        expect(saveEditButton).not.toBeDisabled();
      });

      const activeSessionDetail = getDialecticStoreState().activeSessionDetail;
      expect(activeSessionDetail?.dialectic_contributions).toEqual([]);
    });
  });

  describe('markdown document validation', () => {
    const validMarkdownDocumentKey = 'draft_document_markdown';
    const invalidNonMarkdownDocumentKey = 'HeaderContext';

    const recipeWithMixedOutputs: DialecticStageRecipe = {
      stageSlug: mockStageSlug,
      instanceId: 'instance-mixed',
      steps: [
        {
          id: 'step-markdown-1',
          step_key: 'markdown_step_1',
          step_slug: 'markdown-step-1',
          step_name: 'Markdown Step 1',
          execution_order: 1,
          parallel_group: 1,
          branch_key: 'branch-1',
          job_type: 'EXECUTE',
          prompt_type: 'Turn',
          prompt_template_id: 'prompt-1',
          output_type: 'assembled_document_json',
          granularity_strategy: 'per_source_document',
          inputs_required: [],
          inputs_relevance: [],
          outputs_required: [
            {
              document_key: validMarkdownDocumentKey,
              artifact_class: 'rendered_document',
              file_type: 'markdown',
            },
          ],
        },
        {
          id: 'step-json',
          step_key: 'json_step',
          step_slug: 'json-step',
          step_name: 'JSON Step',
          execution_order: 2,
          parallel_group: 2,
          branch_key: 'branch-2',
          job_type: 'PLAN',
          prompt_type: 'Planner',
          prompt_template_id: 'prompt-2',
          output_type: 'header_context',
          granularity_strategy: 'all_to_one',
          inputs_required: [],
          inputs_relevance: [],
          outputs_required: [
            {
              document_key: invalidNonMarkdownDocumentKey,
              artifact_class: 'header_context',
              file_type: 'json',
            },
          ],
        },
      ],
    };

    it('does not render document content section when focusedDocument has documentKey not in valid markdown documents', async () => {
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: invalidNonMarkdownDocumentKey },
        content: 'HeaderContext content',
        recipesByStageSlug: {
          [mockStageSlug]: recipeWithMixedOutputs,
        },
      });

      render(<GeneratedContributionCard modelId={modelA} />);

      // Assert the placeholder is rendered
      expect(
        await screen.findByText(/Select a document to view its content and provide feedback./i),
      ).toBeInTheDocument();

      // Assert document content section elements are NOT rendered
      expect(screen.queryByLabelText(/Document Content/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save edit/i })).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/Enter feedback for HeaderContext/i)).not.toBeInTheDocument();
    });

    it('renders document content section normally when focusedDocument has valid markdown documentKey', async () => {
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: validMarkdownDocumentKey },
        content: 'Document content',
        recipesByStageSlug: {
          [mockStageSlug]: recipeWithMixedOutputs,
        },
      });

      render(<GeneratedContributionCard modelId={modelA} />);

      // Assert document content section is rendered
      expect(await screen.findByText(/Document: draft_document_markdown/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Document Content/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save edit/i })).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Enter feedback for draft_document_markdown/i)).toBeInTheDocument();

      // Assert placeholder is NOT rendered
      expect(
        screen.queryByText(/Select a document to view its content and provide feedback./i),
      ).not.toBeInTheDocument();
    });

    it('renders placeholder when focusedDocument is null', () => {
      setupStore({
        focusedDocument: null,
        recipesByStageSlug: {
          [mockStageSlug]: recipeWithMixedOutputs,
        },
      });

      render(<GeneratedContributionCard modelId={modelA} />);

      expect(
        screen.getByText(/Select a document to view its content and provide feedback./i),
      ).toBeInTheDocument();

      // Assert document content section elements are NOT rendered
      expect(screen.queryByLabelText(/Document Content/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save edit/i })).not.toBeInTheDocument();
    });
  });
});






