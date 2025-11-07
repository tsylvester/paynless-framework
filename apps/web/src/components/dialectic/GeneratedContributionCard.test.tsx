import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeneratedContributionCard } from './GeneratedContributionCard';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initializeMockDialecticState, getDialecticStoreState } from '../../mocks/dialecticStore.mock';
import { toast } from 'sonner';
import {
  type StageRunDocumentDescriptor,
  type StageDocumentCompositeKey,
  type SetFocusedStageDocumentPayload,
  type StageRunChecklistProps,
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
  return { ...actualStoreModule, ...mockStoreExports };
});

// Mock child components
vi.mock('@/components/common/TextInputArea', () => ({
  TextInputArea: vi.fn(({ value, onChange, placeholder, disabled }) => (
    <textarea
      // NOTE: The test now finds these by placeholder or display value, not testid
      data-testid={placeholder?.startsWith('Enter feedback') ? 'feedback-textarea' : 'content-textarea'}
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
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

const setupStore = ({
  focusedDocument = null,
  content = '',
  feedback = '',
  isLoading = false,
}: {
  focusedDocument?: { modelId: string; documentKey: string } | null;
  content?: string;
  feedback?: string;
  isLoading?: boolean;
}) => {
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
      lastBaselineVersion: { resourceId: 'res-1', versionHash: 'hash-1', updatedAt: 'now' },
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
      dialectic_contributions: [],
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
  });
};

describe('GeneratedContributionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stageRunChecklistMock.mockClear();
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
      expect(updateStageDocumentDraft).toHaveBeenCalledWith(
        expect.objectContaining(expectedKey),
        'Existing feedback - updated',
      );
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
      expect(updateStageDocumentDraft).toHaveBeenCalledWith(
        expect.objectContaining(expectedKey),
        'This is my feedback for A1. This is new feedback.',
      );
    });

    const saveButton = screen.getByRole('button', { name: /save feedback/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(submitStageDocumentFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          ...expectedKey,
          feedback: 'This is my feedback for A1. This is new feedback.',
        }),
      );
      expect(toast.success).toHaveBeenCalledWith('Feedback saved successfully.');
    });
  });
});