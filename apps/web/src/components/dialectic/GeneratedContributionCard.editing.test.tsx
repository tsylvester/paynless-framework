import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeneratedContributionCard } from './GeneratedContributionCard';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initializeMockDialecticState, getDialecticStoreState } from '../../mocks/dialecticStore.mock';
import { mockSetAuthUser } from '../../mocks/authStore.mock';
import { toast } from 'sonner';
import {
  StageRunDocumentDescriptor,
  StageDocumentCompositeKey,
  SaveContributionEditPayload,
  DialecticContribution,
  DialecticStageRecipe,
  FocusedStageDocumentState,
  DialecticStateValues,
  StageDocumentContentState,
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

vi.mock('@paynless/api', () => ({
  api: {
    dialectic: vi.fn().mockReturnValue({
      getStageDocumentFeedback: vi.fn().mockResolvedValue({ data: [], error: null }),
      submitStageDocumentFeedback: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    }),
  },
}));

// Mock the store to use our mock implementation
vi.mock('@paynless/store', async (importOriginal) => {
  // IMPORTANT: Use the same module specifier as this test file's imports
  // to avoid loading a second instance of the mock store module.
  const mockStoreExports =
    await vi.importActual<typeof import('../../mocks/dialecticStore.mock')>(
      '../../mocks/dialecticStore.mock',
    );
  const actualStoreModule = await importOriginal<typeof import('@paynless/store')>();
  const authMock =
    await vi.importActual<typeof import('../../mocks/authStore.mock')>(
      '../../mocks/authStore.mock',
    );

  // Capture the real selectors in closure variables
  const realSelectStageDocumentResource = actualStoreModule.selectStageDocumentResource;
  const realSelectValidMarkdownDocumentKeys = actualStoreModule.selectValidMarkdownDocumentKeys;
  const realSelectFocusedStageDocument = actualStoreModule.selectFocusedStageDocument;

  // Use the actual selector implementations so they read from state
  // Tests can still spy on them to verify they're called
  // The mocks call through to the real functions by default
  const mockSelectStageDocumentResource = vi.fn((...args: Parameters<typeof actualStoreModule.selectStageDocumentResource>) => {
    return realSelectStageDocumentResource(...args);
  });

  const mockSelectValidMarkdownDocumentKeys = vi.fn((...args: Parameters<typeof actualStoreModule.selectValidMarkdownDocumentKeys>) => {
    return realSelectValidMarkdownDocumentKeys(...args);
  });

  const mockSelectFocusedStageDocument = vi.fn((...args: Parameters<typeof actualStoreModule.selectFocusedStageDocument>) => {
    return realSelectFocusedStageDocument(...args);
  });

  return {
    ...actualStoreModule,
    ...mockStoreExports,
    useAuthStore: authMock.useAuthStore,
    selectStageDocumentResource: mockSelectStageDocumentResource,
    selectValidMarkdownDocumentKeys: mockSelectValidMarkdownDocumentKeys,
    selectFocusedStageDocument: mockSelectFocusedStageDocument,
  };
});

// Get reference to the mocked selector after module is loaded
import { selectStageDocumentResource, selectValidMarkdownDocumentKeys, selectFocusedStageDocument } from '@paynless/store';
const mockSelectStageDocumentResource = vi.mocked(selectStageDocumentResource);
const mockSelectValidMarkdownDocumentKeys = vi.mocked(selectValidMarkdownDocumentKeys);
const mockSelectFocusedStageDocument = vi.mocked(selectFocusedStageDocument);

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

const mockIsDocumentHighlighted = vi.fn<[string, string, string, string, Record<string, { modelId: string; documentKey: string } | null> | null | undefined], boolean>();

vi.mock('@paynless/utils', async (importOriginal) => {
  const actualUtils = await importOriginal<typeof import('@paynless/utils')>();
  return {
    ...actualUtils,
    isDocumentHighlighted: (
      sessionId: string,
      stageSlug: string,
      modelId: string,
      documentKey: string,
      focusedStageDocumentMap?: Record<string, { modelId: string; documentKey: string } | null> | null,
    ) => {
      const result = actualUtils.isDocumentHighlighted(
        sessionId,
        stageSlug,
        modelId,
        documentKey,
        focusedStageDocumentMap,
      );
      mockIsDocumentHighlighted(
        sessionId,
        stageSlug,
        modelId,
        documentKey,
        focusedStageDocumentMap,
      );
      return result;
    },
  };
});

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

const buildDialecticContribution = (payload: {
  id: string;
  modelId: string;
  modelName: string;
  createdAtIso: string;
  updatedAtIso: string;
}): DialecticContribution => ({
  id: payload.id,
  session_id: mockSessionId,
  user_id: null,
  stage: mockStageSlug,
  iteration_number: iterationNumber,
  model_id: payload.modelId,
  model_name: payload.modelName,
  prompt_template_id_used: null,
  seed_prompt_url: null,
  edit_version: 0,
  is_latest_edit: true,
  original_model_contribution_id: null,
  raw_response_storage_path: null,
  target_contribution_id: null,
  tokens_used_input: null,
  tokens_used_output: null,
  processing_time_ms: null,
  error: null,
  citations: null,
  created_at: payload.createdAtIso,
  updated_at: payload.updatedAtIso,
  contribution_type: null,
  file_name: null,
  storage_bucket: null,
  storage_path: null,
  size_bytes: null,
  mime_type: null,
});

const setupStore = (overrides: Partial<DialecticStateValues> & {
  focusedDocument?: FocusedStageDocumentState | null;
  content?: string;
  contentDraft?: string;
  feedback?: string;
  isLoading?: boolean;
  contribution?: DialecticContribution | null;
  sourceContributionId?: string | null;
  resourceType?: string | null;
}) => {
  const {
    focusedDocument = null,
    content = '',
    contentDraft = '',
    feedback,
    isLoading = false,
    contribution = null,
    sourceContributionId,
    resourceType = null,
    ...stateOverrides
  } = overrides;

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

  const effectiveSourceContributionId: string | null =
    sourceContributionId !== undefined
      ? sourceContributionId
      : focusedDocument
        ? `contrib-${focusedDocument.modelId}`
        : null;
    
  const contentStateEntry: StageDocumentContentState = {
    baselineMarkdown: content,
    currentDraftMarkdown: contentDraft,
    isDirty: contentDraft.trim().length > 0,
    isLoading: isLoading,
    error: null,
    lastBaselineVersion: effectiveSourceContributionId ? { resourceId: 'res-1', versionHash: 'hash-1', updatedAt: '2023-01-01T00:00:00Z' } : null,
    pendingDiff: null,
    lastAppliedVersionHash: 'hash-1',
    sourceContributionId: effectiveSourceContributionId,
    feedbackDraftMarkdown: feedback,
    feedbackIsDirty: feedback !== undefined && feedback !== '',
    resourceType,
  };
  
  const contentState = compositeKey ? {
    [compositeKey]: contentStateEntry,
  } : {};

  const defaultRecipesByStageSlug: Record<string, DialecticStageRecipe> = {
    [mockStageSlug]: defaultTestRecipe,
  };

  const { activeSessionDetail: activeSessionDetailOverride, ...restStateOverrides } = stateOverrides;

  const baseModelAContribution = buildDialecticContribution({
    id: `contrib-${modelA}`,
    modelId: modelA,
    modelName: 'Model Alpha',
    createdAtIso: '2023-01-01T00:00:00Z',
    updatedAtIso: '2023-01-01T00:00:00Z',
  });
  const baseModelBContribution = buildDialecticContribution({
    id: `contrib-${modelB}`,
    modelId: modelB,
    modelName: 'Model Beta',
    createdAtIso: '2023-01-01T00:00:00Z',
    updatedAtIso: '2023-01-01T00:00:00Z',
  });

  const sourceContribution =
    focusedDocument && effectiveSourceContributionId
      ? buildDialecticContribution({
          id: effectiveSourceContributionId,
          modelId: focusedDocument.modelId,
          modelName: focusedDocument.modelId === modelB ? 'Model Beta' : 'Model Alpha',
          createdAtIso: '2023-01-01T00:00:00Z',
          updatedAtIso: '2023-01-01T00:00:00Z',
        })
      : null;

  const contributionList: DialecticContribution[] = [
    baseModelAContribution,
    baseModelBContribution,
    ...(sourceContribution ? [sourceContribution] : []),
    ...(contribution ? [contribution] : []),
  ];

  initializeMockDialecticState({
    activeContextProjectId: mockProjectId,
    activeContextSessionId: mockSessionId,
    activeStageSlug: mockStageSlug,
    activeSessionDetail: {
      ...(activeSessionDetailOverride ?? {
        id: mockSessionId,
        project_id: mockProjectId,
        session_description: 'Mock Session',
        user_input_reference_url: null,
        iteration_count: iterationNumber,
        selected_models: [{ id: modelA, displayName: 'Model Alpha' }, { id: modelB, displayName: 'Model Beta' }],
        status: 'active',
        associated_chat_id: null,
        current_stage_id: mockStageSlug,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      }),
      dialectic_contributions: contributionList,
    },
    modelCatalog: [
      { id: modelA, model_name: 'Model Alpha', provider_name: 'OpenAI', api_identifier: 'openai', description: '', created_at: '', updated_at: '', is_active: true, context_window_tokens: 0, input_token_cost_usd_millionths: 0, output_token_cost_usd_millionths: 0, max_output_tokens: 0, strengths: [], weaknesses: [] },
      { id: modelB, model_name: 'Model Beta', provider_name: 'Anthropic', api_identifier: 'anthropic', description: '', created_at: '', updated_at: '', is_active: true, context_window_tokens: 0, input_token_cost_usd_millionths: 0, output_token_cost_usd_millionths: 0, max_output_tokens: 0, strengths: [], weaknesses: [] },
    ],
    stageRunProgress: {
      [progressKey]: {
        stepStatuses: {},
        documents: documents,
        jobProgress: {},
      },
    },
    stageDocumentContent: contentState,
    recipesByStageSlug: defaultRecipesByStageSlug,
    ...restStateOverrides,
  });
};

describe('GeneratedContributionCard', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // IMPORTANT: mockReturnValue/mockImplementation can leak between tests if we only clear calls.
    // Always reset and restore call-through behavior here so each test starts from a clean baseline.
    const actualStoreModule =
      await vi.importActual<typeof import('@paynless/store')>('@paynless/store');

    mockSelectStageDocumentResource.mockReset();
    mockSelectStageDocumentResource.mockImplementation((...args) => {
      return actualStoreModule.selectStageDocumentResource(...args);
    });

    mockSelectValidMarkdownDocumentKeys.mockReset();
    mockSelectValidMarkdownDocumentKeys.mockImplementation((...args) => {
      return actualStoreModule.selectValidMarkdownDocumentKeys(...args);
    });

    mockSelectFocusedStageDocument.mockReset();
    mockSelectFocusedStageDocument.mockImplementation((...args) => {
      return actualStoreModule.selectFocusedStageDocument(...args);
    });

    mockIsDocumentHighlighted.mockClear();
    mockSetAuthUser(null);
  });
  describe('document editing', () => {
    beforeEach(() => {
      mockSelectStageDocumentResource.mockClear();
    });

    it('should use selectStageDocumentResource selector instead of direct state access', () => {
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document content',
        focusedStageDocument: {
          [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
        },
      });

      const documentResourceState: StageDocumentContentState = {
        baselineMarkdown: 'Document content',
        currentDraftMarkdown: '',
        isDirty: false,
        isLoading: false,
        error: null,
        lastBaselineVersion: { resourceId: 'res-1', versionHash: 'hash-1', updatedAt: '2023-01-01T00:00:00Z' },
        pendingDiff: null,
        lastAppliedVersionHash: 'hash-1',
        sourceContributionId: `contrib-${modelA}`,
        resourceType: null,
        feedbackDraftMarkdown: undefined,
        feedbackIsDirty: false,
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
        focusedStageDocument: {
          [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
        },
      });

      const documentResourceState: StageDocumentContentState = {
        baselineMarkdown: 'Document content from resource',
        currentDraftMarkdown: 'Document content from resource',
        isDirty: false,
        isLoading: false,
        error: null,
        lastBaselineVersion: { resourceId: 'res-1', versionHash: 'hash-1', updatedAt: '2023-01-01T00:00:00Z' },
        pendingDiff: null,
        lastAppliedVersionHash: 'hash-1',
        sourceContributionId: `contrib-${modelA}`,
        resourceType: null,
        feedbackDraftMarkdown: undefined,
        feedbackIsDirty: false,
      };

      mockSelectStageDocumentResource.mockReturnValue(documentResourceState);

      render(<GeneratedContributionCard modelId={modelA} />);

      expect(await screen.findAllByDisplayValue('Document content from resource')).toHaveLength(2);
    });

    it('should call saveContributionEdit with originalContributionIdToEdit derived from sourceContributionId in document resource state, not from lastBaselineVersion.resourceId', async () => {
      const user = userEvent.setup();
      const originalContributionId = 'contrib-orig-123';

      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Original document content',
        contribution: null,
        sourceContributionId: originalContributionId,
        resourceType: 'rendered_document',
        focusedStageDocument: {
          [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
        },
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
        const contentTextareas = screen.getAllByTestId('content-textarea');
        expect(contentTextareas).toHaveLength(2);
        expect(contentTextareas[0]).toHaveValue('Edited document content');
      });

      const saveEditButtons = screen.getAllByRole('button', { name: /save edit/i });
      await waitFor(() => {
        expect(saveEditButtons[0]).not.toBeDisabled();
      });
      await user.click(saveEditButtons[0]);

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
        expect(activeSessionDetail).not.toBeNull();
      });
    });

    it('should call saveContributionEdit with resourceType from documentResourceState.resourceType', async () => {
      const user = userEvent.setup();
      const originalContributionId = 'contrib-orig-456';
      // Only rendered_document is ever shown for editing; assert payload uses state value.
      const stateResourceType = 'rendered_document';

      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document content',
        contribution: null,
        sourceContributionId: originalContributionId,
        resourceType: stateResourceType,
        focusedStageDocument: {
          [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
        },
      });

      mockSelectStageDocumentResource.mockReset();
      const actualStoreModule = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
      mockSelectStageDocumentResource.mockImplementation((...args) => {
        return actualStoreModule.selectStageDocumentResource(...args);
      });

      const { updateStageDocumentDraft } = getDialecticStoreState();
      const compositeKey: StageDocumentCompositeKey = {
        sessionId: mockSessionId,
        stageSlug: mockStageSlug,
        iterationNumber,
        modelId: modelA,
        documentKey: docA1Key,
      };
      updateStageDocumentDraft(compositeKey, 'Edited content');

      render(<GeneratedContributionCard modelId={modelA} />);

      await waitFor(() => {
        const contentTextareas = screen.getAllByTestId('content-textarea');
        expect(contentTextareas[0]).toHaveValue('Edited content');
      });

      const saveEditButtons = screen.getAllByRole('button', { name: /save edit/i });
      await user.click(saveEditButtons[0]);

      const { saveContributionEdit } = getDialecticStoreState();
      await waitFor(() => {
        expect(saveContributionEdit).toHaveBeenCalled();
      });
      const payload: SaveContributionEditPayload = (saveContributionEdit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(payload).toBeDefined();
      expect(payload.resourceType).toBe(stateResourceType);
    });

    it('should display EditedDocumentResource metadata after successful edit', async () => {
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document content',
        focusedStageDocument: {
          [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
        },
      });

      const documentResourceState: StageDocumentContentState = {
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
        sourceContributionId: `contrib-${modelA}`,
        feedbackDraftMarkdown: undefined,
        feedbackIsDirty: false,
        resourceType: null,
      };

      mockSelectStageDocumentResource.mockReturnValue(documentResourceState);

      render(<GeneratedContributionCard modelId={modelA} />);

      // Assert metadata is displayed (date in header is locale formatted)
      const expectedUpdatedDate = new Date('2023-01-02T12:00:00Z').toLocaleDateString();
      const bodyText = document.body.textContent ?? '';
      expect(bodyText).toContain(`Updated ${expectedUpdatedDate}`);
    });

    it('should show optimistic UI updates after saveContributionEdit succeeds using resource-driven state', async () => {
      const user = userEvent.setup();
      const originalContributionId = 'contrib-orig-123';

      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Original content',
        contribution: null,
        sourceContributionId: originalContributionId,
        resourceType: 'rendered_document',
        focusedStageDocument: {
          [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
        },
      });

      mockSelectStageDocumentResource.mockReset();
      const actualStoreModule = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
      mockSelectStageDocumentResource.mockImplementation((...args) => {
        return actualStoreModule.selectStageDocumentResource(...args);
      });

      const { saveContributionEdit, updateStageDocumentDraft } = getDialecticStoreState();

      render(<GeneratedContributionCard modelId={modelA} />);

      const compositeKey: StageDocumentCompositeKey = {
        sessionId: mockSessionId,
        stageSlug: mockStageSlug,
        iterationNumber,
        modelId: modelA,
        documentKey: docA1Key,
      };
      updateStageDocumentDraft(compositeKey, 'Edited content');

      await waitFor(() => {
        const contentTextareas = screen.getAllByTestId('content-textarea');
        expect(contentTextareas).toHaveLength(2);
        expect(contentTextareas[0]).toHaveValue('Edited content');
      });

      const saveEditButtons = screen.getAllByRole('button', { name: /save edit/i });
      await user.click(saveEditButtons[0]);

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

      await waitFor(() => {
        const serializedKey = getStageDocumentKey(compositeKey);
        const entry = getDialecticStoreState().stageDocumentContent[serializedKey];
        expect(entry).toBeDefined();
        expect(entry?.sourceContributionId).toBe(originalContributionId);
        expect(entry?.resourceType).toBe('rendered_document');
      });

      expect(toast.success).toHaveBeenCalledWith('Edit saved successfully.');
    });

    it('should enable save edit button based on resource state, not dialectic_contributions', async () => {
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document content',
        contribution: null,
        sourceContributionId: 'contrib-123',
        focusedStageDocument: {
          [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
        },
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
        const saveEditButtons = screen.getAllByRole('button', { name: /save edit/i });
        expect(saveEditButtons[0]).not.toBeDisabled();
      });

      const activeSessionDetail = getDialecticStoreState().activeSessionDetail;
      expect(activeSessionDetail).not.toBeNull();
      expect(activeSessionDetail?.dialectic_contributions?.length).toBeGreaterThan(0);
    });
  });

  it('17.c.ii: Save Edit submits content draft and Save Feedback submits feedback draft when both are filled', async () => {
    const user = userEvent.setup();
    mockSetAuthUser({ id: 'user-test-123' });
    setupStore({
      focusedDocument: { modelId: modelA, documentKey: docA1Key },
      content: 'Edited content draft',
      feedback: 'Feedback draft for submit',
      sourceContributionId: 'contrib-1',
      focusedStageDocument: {
        [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
      },
    });

    const mockResourceState: StageDocumentContentState = {
      baselineMarkdown: 'Edited content draft',
      currentDraftMarkdown: 'Edited content draft',
      isDirty: false,
      isLoading: false,
      error: null,
      lastBaselineVersion: { resourceId: 'res-1', versionHash: 'hash-1', updatedAt: '2023-01-01T00:00:00Z' },
      pendingDiff: null,
      lastAppliedVersionHash: 'hash-1',
      sourceContributionId: 'contrib-1',
      resourceType: 'rendered_document',
      feedbackDraftMarkdown: 'Feedback draft for submit',
      feedbackIsDirty: true,
    };
    
    mockSelectStageDocumentResource.mockReturnValue(mockResourceState);

    const { saveContributionEdit, submitStageDocumentFeedback } = getDialecticStoreState();

    render(<GeneratedContributionCard modelId={modelA} />);

    const [contentTextarea] = await screen.findAllByTestId('content-textarea');
    const [feedbackTextarea] = await screen.findAllByTestId('feedback-textarea');

    expect(contentTextarea).toHaveValue('Edited content draft');
    expect(feedbackTextarea).toHaveValue('Feedback draft for submit');

    const saveEditButtons = screen.getAllByRole('button', { name: /save edit/i });
    expect(saveEditButtons[0]).not.toBeDisabled();
    await user.click(saveEditButtons[0]);

    await waitFor(() => {
      expect(saveContributionEdit).toHaveBeenCalled();
      const editPayload = vi.mocked(saveContributionEdit).mock.calls[0]?.[0];
      expect(editPayload.editedContentText).toBe('Edited content draft');
    });

    const saveFeedbackButtons = screen.getAllByRole('button', { name: /save feedback/i });
    expect(saveFeedbackButtons[0]).not.toBeDisabled();
    await user.click(saveFeedbackButtons[0]);

    await waitFor(() => {
      expect(submitStageDocumentFeedback).toHaveBeenCalled();
      const feedbackPayload = vi.mocked(submitStageDocumentFeedback).mock.calls[0]?.[0];
      expect(feedbackPayload.feedbackContent).toBe('Feedback draft for submit');
    });
  });
});