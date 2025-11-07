import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeneratedContributionCard } from './GeneratedContributionCard';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initializeMockDialecticState, getDialecticStoreState } from '../../mocks/dialecticStore.mock';
import { toast } from 'sonner';
import {
  type StageRunDocumentDescriptor,
  type StageDocumentCompositeKey,
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

vi.mock('./StageRunChecklist', () => ({
  StageRunChecklist: vi.fn(({ modelId }) => (
    <div data-testid="stage-run-checklist" data-model-id={modelId}>
      Stage Run Checklist for {modelId}
    </div>
  )),
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

const renderComponent = (modelId: string) => {
  return render(
    <GeneratedContributionCard
      modelId={modelId}
    />
  );
};


describe('GeneratedContributionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the StageRunChecklist and passes the correct modelId to it', () => {
    setupStore({});
    renderComponent(modelA);

    const checklist = screen.getByTestId('stage-run-checklist');
    expect(checklist).toBeInTheDocument();
    expect(checklist).toHaveAttribute('data-model-id', modelA);
  });

  it('displays a placeholder when no document is focused for its model', () => {
    setupStore({ focusedDocument: { modelId: modelB, documentKey: docB1Key } }); // Focus on other model
    renderComponent(modelA);
    expect(screen.getByText(/Select a document to view its content and provide feedback./i)).toBeInTheDocument();
  });

  it('displays the content for the focused document of its model', async () => {
    setupStore({
      focusedDocument: { modelId: modelA, documentKey: docA1Key },
      content: 'Content for document A1',
    });

    renderComponent(modelA);
    
    const contentTextArea = await screen.findByDisplayValue('Content for document A1');
    expect(contentTextArea).toBeInTheDocument();
  });

  it('does not display content for a document focused for a different model', () => {
    setupStore({
      focusedDocument: { modelId: modelB, documentKey: docB1Key },
      content: 'Content for document B1',
    });

    renderComponent(modelA);

    expect(screen.queryByDisplayValue('Content for document B1')).not.toBeInTheDocument();
    expect(screen.getByText(/Select a document to view its content and provide feedback./i)).toBeInTheDocument();
  });

  it('allows user to enter feedback and save it for the correct document', async () => {
    const user = userEvent.setup();
    setupStore({
      focusedDocument: { modelId: modelA, documentKey: docA1Key },
      content: 'Content for A1',
      feedback: 'This is my feedback for A1.',
    });
    const { submitStageDocumentFeedback, updateStageDocumentDraft } = getDialecticStoreState();

    renderComponent(modelA);

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
        'This is my feedback for A1. This is new feedback.'
      );
    });

    const saveButton = screen.getByRole('button', { name: /save feedback/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(submitStageDocumentFeedback).toHaveBeenCalledWith(expect.objectContaining({
        ...expectedKey,
        feedback: 'This is my feedback for A1. This is new feedback.',
      }));
      expect(toast.success).toHaveBeenCalledWith('Feedback saved successfully.');
    });
  });
}); 