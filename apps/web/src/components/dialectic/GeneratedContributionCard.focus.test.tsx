import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
} from '@paynless/types';

// --- MOCKS ---

vi.mock('@paynless/api', () => ({
  api: {
    dialectic: vi.fn().mockReturnValue({
      getStageDocumentFeedback: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  },
}));

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
    contentDraft,
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
    currentDraftMarkdown: contentDraft ?? content,
    isDirty: (contentDraft ?? content).trim() !== content.trim(),
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

  describe('document highlighting validation', () => {
    it('does not render document content when selectFocusedStageDocument returns a document but focusedStageDocumentMap has no entry', async () => {
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document A1 baseline',
        focusedStageDocument: {},
      });

      render(<GeneratedContributionCard modelId={modelA} />);

      expect(
        await screen.findByText(/Select a document to view its content and provide feedback./i),
      ).toBeInTheDocument();

      expect(screen.queryByText(/doc-a1/i)).not.toBeInTheDocument();
      expect(screen.queryAllByTestId('content-textarea')).toHaveLength(0);
    });

    it('renders document content when focusedStageDocumentMap has entry matching selectFocusedStageDocument', async () => {
      const focusKey = buildFocusKey(modelA);
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document A1 baseline',
        focusedStageDocument: {
          [focusKey]: { modelId: modelA, documentKey: docA1Key },
        },
      });

      render(<GeneratedContributionCard modelId={modelA} />);

      expect(await screen.findByText(/doc-a1/i)).toBeInTheDocument();
      expect(screen.getAllByTestId('content-textarea')).toHaveLength(2);
      expect(screen.getAllByDisplayValue('Document A1 baseline')).toHaveLength(2);

      expect(
        screen.queryByText(/Select a document to view its content and provide feedback./i),
      ).not.toBeInTheDocument();
    });

    it('does not render document content when selectFocusedStageDocument returns a document but focusedStageDocumentMap has different documentKey', async () => {
      const focusKey = buildFocusKey(modelA);
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document A1 baseline',
        focusedStageDocument: {
          [focusKey]: { modelId: modelA, documentKey: docA2Key },
        },
      });

      mockSelectFocusedStageDocument.mockReturnValue({ modelId: modelA, documentKey: docA1Key });

      render(<GeneratedContributionCard modelId={modelA} />);

      expect(
        await screen.findByText(/Select a document to view its content and provide feedback./i),
      ).toBeInTheDocument();

      expect(screen.queryAllByTestId('content-textarea')).toHaveLength(0);
    });

    it('does not render document content when focusedDocument is null', () => {
      setupStore({
        focusedDocument: null,
        focusedStageDocument: {},
      });

      render(<GeneratedContributionCard modelId={modelA} />);

      expect(
        screen.getByText(/Select a document to view its content and provide feedback./i),
      ).toBeInTheDocument();

      expect(screen.queryAllByTestId('content-textarea')).toHaveLength(0);
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    });

    it('does not render document content when focusedDocument exists but document is not highlighted in checklist', async () => {
      setupStore({
        focusedDocument: { modelId: modelA, documentKey: docA1Key },
        content: 'Document A1 baseline',
        focusedStageDocument: {},
      });

      render(<GeneratedContributionCard modelId={modelA} />);

      expect(
        await screen.findByText(/Select a document to view its content and provide feedback./i),
      ).toBeInTheDocument();

      expect(screen.queryAllByTestId('content-textarea')).toHaveLength(0);
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

  it('17.c.i: Document Content input is bound to content draft and Document Feedback input to feedback draft; changing one does not change the other', async () => {
    const user = userEvent.setup();
    setupStore({
      focusedDocument: { modelId: modelA, documentKey: docA1Key },
      content: 'Content draft text',
      feedback: 'Feedback draft text',
      focusedStageDocument: {
        [buildFocusKey(modelA)]: { modelId: modelA, documentKey: docA1Key },
      },
    });

    const actualStore = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
    const realSelectStageDocumentResource = actualStore.selectStageDocumentResource;
    const fallbackKey = `${mockSessionId}:${mockStageSlug}:${iterationNumber}:${modelA}:${docA1Key}`;
    const fallbackState: StageDocumentContentState = {
      baselineMarkdown: 'Content draft text',
      currentDraftMarkdown: 'Content draft text',
      isDirty: false,
      isLoading: false,
      error: null,
      lastBaselineVersion: null,
      pendingDiff: null,
      lastAppliedVersionHash: null,
      sourceContributionId: null,
      resourceType: null,
      feedbackDraftMarkdown: 'Feedback draft text',
      feedbackIsDirty: true,
    };
    mockSelectStageDocumentResource.mockImplementation(
      (state: Parameters<typeof realSelectStageDocumentResource>[0], sessionId: string, stageSlug: string, iter: number, modelId: string, documentKey: string) => {
        const result = realSelectStageDocumentResource(state, sessionId, stageSlug, iter, modelId, documentKey);
        if (result !== undefined) return result;
        const key = `${sessionId}:${stageSlug}:${iter}:${modelId}:${documentKey}`;
        if (key === fallbackKey) return fallbackState;
        return result;
      },
    );

    const { updateStageDocumentDraft, updateStageDocumentFeedbackDraft } = getDialecticStoreState();

    render(<GeneratedContributionCard modelId={modelA} />);

    const [contentTextarea] = await screen.findAllByTestId('content-textarea');
    const [feedbackTextarea] = await screen.findAllByTestId('feedback-textarea');

    expect(contentTextarea).toHaveValue('Content draft text');
    expect(feedbackTextarea).toHaveValue('Feedback draft text');

    await user.clear(contentTextarea);
    await user.type(contentTextarea, 'New content only');

    await waitFor(() => {
      const contentCalls = vi.mocked(updateStageDocumentDraft).mock.calls;
      expect(contentCalls.length).toBeGreaterThan(0);
      const lastContentCall = contentCalls[contentCalls.length - 1];
      expect(lastContentCall[1]).toBe('New content only');
    });
    expect(feedbackTextarea).toHaveValue('Feedback draft text');

    await user.clear(feedbackTextarea);
    await user.type(feedbackTextarea, 'New feedback only');

    await waitFor(() => {
      const feedbackCalls = vi.mocked(updateStageDocumentFeedbackDraft).mock.calls;
      expect(feedbackCalls.length).toBeGreaterThan(0);
      const lastFeedbackCall = feedbackCalls[feedbackCalls.length - 1];
      expect(lastFeedbackCall[1]).toBe('New feedback only');
    });
    expect(contentTextarea).toHaveValue('New content only');
  });

});