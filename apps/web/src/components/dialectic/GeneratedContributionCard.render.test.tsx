import { render, screen, waitFor } from '@testing-library/react';
import { GeneratedContributionCard } from './GeneratedContributionCard';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initializeMockDialecticState } from '../../mocks/dialecticStore.mock';
import { mockSetAuthUser } from '../../mocks/authStore.mock';
import {
  StageRunDocumentDescriptor,
  StageDocumentCompositeKey,
  DialecticContribution,
  DialecticStageRecipe,
  FocusedStageDocumentState,
  DialecticStateValues,
  StageDocumentContentState,
  STAGE_RUN_DOCUMENT_KEY_SEPARATOR,
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

// Mock API to prevent "api.dialectic is not a function" errors
vi.mock('@paynless/api', () => ({
  api: {
    dialectic: vi.fn().mockReturnValue({
      getStageDocumentFeedback: vi.fn().mockResolvedValue({ feedback: null }),
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

  // Use correct separator for stageRunProgress document keys
  const getDescriptorKey = (docKey: string, mId: string) => 
    `${docKey}${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}${mId}`;

  const documents = {
    [getDescriptorKey(docA1Key, modelA)]: docA1,
    [getDescriptorKey(docA2Key, modelA)]: docA2,
    [getDescriptorKey(docB1Key, modelB)]: docB1,
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
    isDirty: contentDraft !== '' && contentDraft !== content,
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

  it('renders model and document metadata when its model has a focused document', async () => {
    setupStore({
      focusedDocument: { modelId: modelA, documentKey: docA1Key },
      content: 'Document A1 baseline',
      contentDraft: 'Document A1 baseline',
      focusedStageDocument: {
        [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
      },
    });

    render(<GeneratedContributionCard modelId={modelA} />);

    expect(await screen.findByText(/Model Alpha/i)).toBeInTheDocument();
    expect(screen.getByText(/doc-a1/i)).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Document A1 baseline')).toHaveLength(2);
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

  describe('shared utility function integration', () => {
    it('calls isDocumentHighlighted from @paynless/utils with correct parameters when checking if document content should be rendered', async () => {
      const focusKey = buildFocusKey(modelA);
      const focusedStageDocumentMap = {
        [focusKey]: { modelId: modelA, documentKey: docA1Key },
      };

      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document A1 baseline',
        focusedStageDocument: focusedStageDocumentMap,
      });

      render(<GeneratedContributionCard modelId={modelA} />);

      await waitFor(() => {
        expect(mockIsDocumentHighlighted).toHaveBeenCalledWith(
          mockSessionId,
          mockStageSlug,
          modelA,
          docA1Key,
          focusedStageDocumentMap,
        );
      });

      expect(await screen.findByText(/doc-a1/i)).toBeInTheDocument();
    });

    it('verifies highlighting behavior matches StageRunChecklist behavior when using same focusedStageDocumentMap state', async () => {
      const focusKey = buildFocusKey(modelA);
      const focusedStageDocumentMap = {
        [focusKey]: { modelId: modelA, documentKey: docA1Key },
      };

      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document A1 baseline',
        focusedStageDocument: focusedStageDocumentMap,
      });

      render(<GeneratedContributionCard modelId={modelA} />);

      await waitFor(() => {
        expect(mockIsDocumentHighlighted).toHaveBeenCalled();
      });

      const callArgs = mockIsDocumentHighlighted.mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.[0]).toBe(mockSessionId);
      expect(callArgs?.[1]).toBe(mockStageSlug);
      expect(callArgs?.[2]).toBe(modelA);
      expect(callArgs?.[3]).toBe(docA1Key);
      expect(callArgs?.[4]).toBe(focusedStageDocumentMap);

      expect(await screen.findByText(/doc-a1/i)).toBeInTheDocument();
    });

    it('ensures highlighting logic is consistent between GeneratedContributionCard and StageRunChecklist by using same shared utility function', async () => {
      const focusKeyA = buildFocusKey(modelA);
      const focusKeyB = buildFocusKey(modelB);
      const focusedStageDocumentMap = {
        [focusKeyA]: { modelId: modelA, documentKey: docA1Key },
        [focusKeyB]: { modelId: modelB, documentKey: docB1Key },
      };

      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document A1 baseline',
        focusedStageDocument: focusedStageDocumentMap,
      });

      render(<GeneratedContributionCard modelId={modelA} />);

      await waitFor(() => {
        expect(mockIsDocumentHighlighted).toHaveBeenCalled();
      });

      const callArgs = mockIsDocumentHighlighted.mock.calls[0];
      expect(callArgs).toBeDefined();
      const [sessionId, stageSlug, modelId, documentKey, map] = callArgs!;

      expect(sessionId).toBe(mockSessionId);
      expect(stageSlug).toBe(mockStageSlug);
      expect(modelId).toBe(modelA);
      expect(documentKey).toBe(docA1Key);
      expect(map).toBe(focusedStageDocumentMap);

      expect(await screen.findByText(/doc-a1/i)).toBeInTheDocument();
    });
  });

  it('renders model name, focused document detail, document content, document feedback, Save Edit and Save Feedback when a document is focused', async () => {
    setupStore({
      focusedDocument: { modelId: modelA, documentKey: docA1Key },
      content: 'Document A1 baseline',
      feedback: 'Feedback draft',
      focusedStageDocument: {
        [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
      },
    });

    render(<GeneratedContributionCard modelId={modelA} />);

    expect(await screen.findByText(/Model Alpha/i)).toBeInTheDocument();
    expect(screen.getByText(/doc-a1/i)).toBeInTheDocument();
    expect(screen.getAllByTestId('content-textarea')).toHaveLength(2);
    expect(screen.getAllByTestId('feedback-textarea')).toHaveLength(2);
    const saveEditButtons = screen.getAllByRole('button', { name: /save edit/i });
    const saveFeedbackButtons = screen.getAllByRole('button', { name: /save feedback/i });
    expect(saveEditButtons.length).toBeGreaterThanOrEqual(1);
    expect(saveFeedbackButtons.length).toBeGreaterThanOrEqual(1);
  });

  describe('model name and header layout (canonical provenance)', () => {
    it('displays model name from dialectic_contributions.model_name (not from selected_models or modelCatalog)', async () => {
      const selectedModelsDisplayName = 'Selected Model Display Name (should not be used)';
      const catalogDisplayName = 'Catalog Model Name (should not be used)';
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document A1 baseline',
        focusedStageDocument: {
          [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
        },
        activeSessionDetail: {
          id: mockSessionId,
          project_id: mockProjectId,
          session_description: 'Mock Session',
          user_input_reference_url: null,
          iteration_count: iterationNumber,
          selected_models: [
            { id: modelA, displayName: selectedModelsDisplayName },
            { id: modelB, displayName: 'Session Model Beta' },
          ],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: mockStageSlug,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          dialectic_contributions: [
            buildDialecticContribution({
              id: `contrib-${modelA}`,
              modelId: modelA,
              modelName: 'Model Alpha',
              createdAtIso: '2023-01-01T00:00:00Z',
              updatedAtIso: '2023-01-01T00:00:00Z',
            }),
          ],
        },
        modelCatalog: [
          { id: modelA, model_name: catalogDisplayName, provider_name: 'OpenAI', api_identifier: 'openai', description: '', created_at: '', updated_at: '', is_active: true, context_window_tokens: 0, input_token_cost_usd_millionths: 0, output_token_cost_usd_millionths: 0, max_output_tokens: 0, strengths: [], weaknesses: [] },
        ],
      });

      render(<GeneratedContributionCard modelId={modelA} />);

      expect(await screen.findByText(/Model Alpha/i)).toBeInTheDocument();
      expect(screen.queryByText(new RegExp(selectedModelsDisplayName))).not.toBeInTheDocument();
      expect(screen.queryByText(new RegExp(catalogDisplayName))).not.toBeInTheDocument();
    });

    it('renders header as single dense line with document key, model name, and created/updated timestamps', async () => {
      const createdAtIso = '2023-01-01T00:00:00Z';
      const updatedAtIso = '2023-01-02T12:00:00Z';
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Content',
        focusedStageDocument: {
          [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
        },
        sourceContributionId: `contrib-${modelA}`,
        activeSessionDetail: {
          id: mockSessionId,
          project_id: mockProjectId,
          session_description: 'Mock Session',
          user_input_reference_url: null,
          iteration_count: iterationNumber,
          selected_models: [{ id: modelA, displayName: 'Selected Name' }, { id: modelB, displayName: 'Beta' }],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: mockStageSlug,
          created_at: createdAtIso,
          updated_at: createdAtIso,
          dialectic_contributions: [
            buildDialecticContribution({
              id: `contrib-${modelA}`,
              modelId: modelA,
              modelName: 'Model Alpha',
              createdAtIso: createdAtIso,
              updatedAtIso: createdAtIso,
            }),
          ],
        },
      });

      const mockResourceState: StageDocumentContentState = {
        baselineMarkdown: 'Content',
        currentDraftMarkdown: 'Content',
        isDirty: false,
        isLoading: false,
        error: null,
        lastBaselineVersion: { resourceId: 'res-1', versionHash: 'hash-1', updatedAt: updatedAtIso },
        pendingDiff: null,
        lastAppliedVersionHash: 'hash-1',
        sourceContributionId: `contrib-${modelA}`,
        resourceType: null,
        feedbackDraftMarkdown: undefined,
        feedbackIsDirty: false,
      };
      
      mockSelectStageDocumentResource.mockReturnValue(mockResourceState);

      render(<GeneratedContributionCard modelId={modelA} />);

      const createdDate = new Date(createdAtIso).toLocaleDateString();
      const updatedDate = new Date(updatedAtIso).toLocaleDateString();

      expect(await screen.findByText(/doc-a1/i)).toBeInTheDocument();
      expect(screen.getByText(/Model Alpha/i)).toBeInTheDocument();
      const bodyText = document.body.textContent ?? '';
      expect(bodyText).toContain(`Created ${createdDate}`);
      expect(bodyText).toContain(`Updated ${updatedDate}`);
    });

    it('does not display internal IDs (job_id, latestRenderedResourceId) in header or document detail', async () => {
      const jobId = 'job-a1';
      const latestRenderedResourceId = 'path/to/a1.md';
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document A1 baseline',
        focusedStageDocument: {
          [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
        },
      });

      render(<GeneratedContributionCard modelId={modelA} />);

      await screen.findByText(/doc-a1/i);

      expect(screen.queryByText(/Job:/i)).not.toBeInTheDocument();
      expect(screen.queryByText(jobId)).not.toBeInTheDocument();
      expect(screen.queryByText(/Latest Render:/i)).not.toBeInTheDocument();
      expect(screen.queryByText(latestRenderedResourceId)).not.toBeInTheDocument();
    });
  });
});