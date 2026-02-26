import { render, screen, waitFor } from '@testing-library/react';
import { GeneratedContributionCard } from './GeneratedContributionCard';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initializeMockDialecticState, getDialecticStoreState } from '../../mocks/dialecticStore.mock';
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

// Mock api to include dialectic namespace
vi.mock('@paynless/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      dialectic: vi.fn().mockReturnValue({
        getProjectResourceContent: vi.fn().mockResolvedValue({ 
          data: { content: 'test content', sourceContributionId: 'contrib-model-a', resourceType: 'test-type' }, 
          error: null 
        }),
        getStageDocumentFeedback: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    },
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

const pickVisible = <T extends Element>(elements: T[]): T => {
  const visible = elements.find((element) => element.closest('.hidden') === null);
  if (visible) {
    return visible;
  }
  if (elements.length === 0) {
    throw new Error('Expected at least one element.');
  }
  return elements[0];
};

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
    [`${docA1Key}${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}${modelA}`]: docA1,
    [`${docA2Key}${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}${modelA}`]: docA2,
    [`${docB1Key}${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}${modelB}`]: docB1,
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

  describe('document content fetching and display', () => {
    it('triggers content fetching when document is selected with latestRenderedResourceId', async () => {
      const resourceId = 'resource-123';
      const docWithResourceId: StageRunDocumentDescriptor = {
        ...docA1,
        latestRenderedResourceId: resourceId,
      };

      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: '',
        focusedStageDocument: {
          [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
        },
      });

      // Override the document descriptor to include latestRenderedResourceId
      const { stageRunProgress } = getDialecticStoreState();
      if (stageRunProgress?.[progressKey]) {
        stageRunProgress[progressKey] = {
          ...stageRunProgress[progressKey],
          documents: {
            ...stageRunProgress[progressKey].documents,
            [`${docA1Key}${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}${modelA}`]: docWithResourceId,
          },
        };
      }

      const { fetchStageDocumentContent } = getDialecticStoreState();

      render(<GeneratedContributionCard modelId={modelA} />);

      await waitFor(() => {
        expect(fetchStageDocumentContent).toHaveBeenCalledWith(
          {
            sessionId: mockSessionId,
            stageSlug: mockStageSlug,
            iterationNumber,
            modelId: modelA,
            documentKey: docA1Key,
          },
          resourceId,
        );
      });
    });

    it('displays loaded content in Document Content TextInputArea', async () => {
      const loadedContent = 'Loaded document content from resource';
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: loadedContent,
        focusedStageDocument: {
          [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
        },
      });

      const documentResourceState: StageDocumentContentState = {
        baselineMarkdown: loadedContent,
        currentDraftMarkdown: loadedContent,
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

      const contentTextareas = await screen.findAllByTestId('content-textarea');
      expect(contentTextareas).toHaveLength(2);
      expect(contentTextareas[0]).toHaveValue(loadedContent);
    });

    it('disables content input when content is loading', async () => {
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: '',
        isLoading: true,
        focusedStageDocument: {
          [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
        },
      });

      const documentResourceState: StageDocumentContentState = {
        baselineMarkdown: '',
        currentDraftMarkdown: '',
        isDirty: false,
        isLoading: true,
        error: null,
        lastBaselineVersion: null,
        pendingDiff: null,
        lastAppliedVersionHash: null,
        sourceContributionId: `contrib-${modelA}`,
        resourceType: null,
        feedbackDraftMarkdown: undefined,
        feedbackIsDirty: false,
      };

      mockSelectStageDocumentResource.mockReturnValue(documentResourceState);

      render(<GeneratedContributionCard modelId={modelA} />);

      const contentTextarea = pickVisible(await screen.findAllByTestId('content-textarea'));
      expect(contentTextarea).toBeDisabled();
    });

    it('displays error message when content fetch fails', async () => {
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: '',
        focusedStageDocument: {
          [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
        },
      });

      const errorMessage = 'Failed to fetch document content';
      const documentResourceState: StageDocumentContentState = {
        baselineMarkdown: '',
        currentDraftMarkdown: '',
        isDirty: false,
        isLoading: false,
        error: { message: errorMessage, code: 'FETCH_ERROR' },
        lastBaselineVersion: null,
        pendingDiff: null,
        lastAppliedVersionHash: null,
        sourceContributionId: `contrib-${modelA}`,
        resourceType: null,
        feedbackDraftMarkdown: undefined,
        feedbackIsDirty: false,
      };

      mockSelectStageDocumentResource.mockReturnValue(documentResourceState);

      render(<GeneratedContributionCard modelId={modelA} />);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('handles missing latestRenderedResourceId gracefully by showing appropriate message', async () => {
      const docWithoutResourceId: StageRunDocumentDescriptor = {
        ...docA1,
        latestRenderedResourceId: undefined,
      } as unknown as StageRunDocumentDescriptor;

      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: '',
        focusedStageDocument: {
          [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
        },
      });

      // Override the document descriptor to exclude latestRenderedResourceId
      const { stageRunProgress } = getDialecticStoreState();
      if (stageRunProgress?.[progressKey]) {
        stageRunProgress[progressKey] = {
          ...stageRunProgress[progressKey],
          documents: {
            ...stageRunProgress[progressKey].documents,
            [`${docA1Key}${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}${modelA}`]: docWithoutResourceId,
          },
        };
      }

      const documentResourceState: StageDocumentContentState = {
        baselineMarkdown: '',
        currentDraftMarkdown: '',
        isDirty: false,
        isLoading: false,
        error: null,
        lastBaselineVersion: null,
        pendingDiff: null,
        lastAppliedVersionHash: null,
        sourceContributionId: `contrib-${modelA}`,
        resourceType: null,
        feedbackDraftMarkdown: undefined,
        feedbackIsDirty: false,
      };

      mockSelectStageDocumentResource.mockReturnValue(documentResourceState);

      render(<GeneratedContributionCard modelId={modelA} />);

      await waitFor(() => {
        // Verify the component displays an appropriate message indicating the RENDER job has not completed
        expect(screen.getByText(/RENDER job has not completed yet/i)).toBeInTheDocument();
        expect(screen.getByText(/Document content will be available once rendering is finished/i)).toBeInTheDocument();
        const contentTextarea = screen.getAllByTestId('content-textarea')[0];
        expect(contentTextarea).toHaveValue('');
        expect(contentTextarea).toHaveAttribute('placeholder', 'No content available.');
      });
    });
  });

});