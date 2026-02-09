import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  StageRenderedDocumentDescriptor,
  SaveContributionEditPayload,
  DialecticContribution,
} from '@paynless/types';

import { GeneratedContributionCard } from './GeneratedContributionCard';

import {
  getDialecticStoreState,
  initializeMockDialecticState,
  setDialecticStateValues,
} from '../../mocks/dialecticStore.mock';
import { selectStageDocumentResource, selectFocusedStageDocument } from '@paynless/store';

vi.mock('@paynless/store', async () => {
  const actual = await import('@paynless/store');
  const mock = await import('../../mocks/dialecticStore.mock');
  return {
    ...actual,
    useDialecticStore: mock.useDialecticStore,
    selectStageDocumentResource: actual.selectStageDocumentResource,
  };
});

vi.mock('@paynless/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/utils')>();
  return {
    ...actual,
    isDocumentHighlighted: vi.fn((_sessionId, _stageSlug, _modelId, _documentKey, focusedStageDocumentMap) => {
      if (!focusedStageDocumentMap) return false;
      const focusKey = `${_sessionId}:${_stageSlug}:${_modelId}`;
      const focused = focusedStageDocumentMap[focusKey];
      return focused?.documentKey === _documentKey;
    }),
  };
});

vi.mock('./StageRunChecklist', () => ({
  StageRunChecklist: vi.fn(() => <div data-testid="stage-run-checklist">Stage Run Checklist</div>),
}));

vi.mock('@/components/common/TextInputArea', () => ({
  TextInputArea: vi.fn(({ value, onChange, placeholder, disabled, label, id, dataTestId }) => (
    <div>
      {label && <label htmlFor={id}>{label}</label>}
      <textarea
        data-testid={dataTestId || (placeholder?.startsWith('Enter feedback') ? 'feedback-textarea' : 'content-textarea')}
        id={id}
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  )),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const stageSlug = 'thesis';
const sessionId = 'sess-1';
const projectId = 'proj-1';
const modelId = 'model-a';
const documentKey = 'business_case';
const iterationNumber = 1;
const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
const compositeKeyString = `${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`;

const buildStageDocumentDescriptor = (
  overrides: Partial<StageRenderedDocumentDescriptor> = {},
): StageRenderedDocumentDescriptor => ({
  descriptorType: 'rendered',
  modelId,
  status: 'completed',
  job_id: 'job-1',
  latestRenderedResourceId: 'resource-123',
  versionHash: 'hash-1',
  lastRenderedResourceId: 'resource-123',
  lastRenderAtIso: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const buildDialecticContribution = (
  overrides: Partial<DialecticContribution> = {},
): DialecticContribution => ({
  id: 'contrib-1',
  session_id: sessionId,
  user_id: null,
  stage: stageSlug,
  iteration_number: iterationNumber,
  model_id: modelId,
  model_name: 'Test Model',
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
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  contribution_type: null,
  file_name: null,
  storage_bucket: null,
  storage_path: null,
  size_bytes: null,
  mime_type: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  initializeMockDialecticState();
});

describe('GeneratedContributionCard Integration Tests', () => {
  describe('Step 10.f: Component works with producer when using sourceContributionId', () => {
    it('10.f.i: should use sourceContributionId from selectStageDocumentResource for originalContributionIdToEdit when calling saveContributionEdit', async () => {
      const user = userEvent.setup();
      const sourceContributionId = 'contrib-source-123';
      const editedContent = 'Edited document content';

      // (1) Set up store state with sourceContributionId in the document resource state
      const documentDescriptor = buildStageDocumentDescriptor({
        latestRenderedResourceId: 'resource-123',
      });

      setDialecticStateValues({
        activeContextProjectId: projectId,
        activeContextSessionId: sessionId,
        activeStageSlug: stageSlug,
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,
          session_description: 'Test Session',
          user_input_reference_url: null,
          iteration_count: iterationNumber,
          selected_models: [{ id: modelId, displayName: 'Test Model' }],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: stageSlug,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          dialectic_contributions: [
            buildDialecticContribution({
              id: sourceContributionId,
              model_id: modelId,
              model_name: 'Test Model',
            }),
          ],
        },
        focusedStageDocument: {
          [`${sessionId}:${stageSlug}:${modelId}`]: {
            modelId,
            documentKey,
          },
        },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: {},
            documents: {
              [documentKey]: documentDescriptor,
            },
          },
        },
        stageDocumentContent: {
          [compositeKeyString]: {
            baselineMarkdown: 'Original document content',
            currentDraftMarkdown: editedContent,
            isDirty: true,
            isLoading: false,
            error: null,
            lastBaselineVersion: {
              resourceId: 'resource-123',
              versionHash: 'hash-1',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
            pendingDiff: null,
            lastAppliedVersionHash: 'hash-1',
            sourceContributionId: sourceContributionId,
            feedbackDraftMarkdown: '',
            feedbackIsDirty: false,
            resourceType: 'rendered_document',
          },
        },
        recipesByStageSlug: {
          [stageSlug]: {
            stageSlug,
            instanceId: 'instance-1',
            steps: [
              {
                id: 'step-1',
                step_key: 'draft_document',
                step_slug: 'draft-document',
                step_name: 'Draft Document',
                execution_order: 1,
                parallel_group: 1,
                branch_key: 'document',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                inputs_required: [],
                outputs_required: [
                  {
                    document_key: documentKey,
                    artifact_class: 'rendered_document',
                    file_type: 'markdown',
                  },
                ],
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
              },
            ],
          },
        },
        modelCatalog: [
          {
            id: modelId,
            model_name: 'Test Model',
            provider_name: 'Test Provider',
            api_identifier: 'test-model',
            description: '',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            is_active: true,
            context_window_tokens: 128000,
            input_token_cost_usd_millionths: 1000,
            output_token_cost_usd_millionths: 2000,
            max_output_tokens: 16000,
            strengths: [],
            weaknesses: [],
          },
        ],
      });

      // Verify selectStageDocumentResource (producer) returns sourceContributionId
      const state = getDialecticStoreState();
      const documentResourceState = selectStageDocumentResource(
        state,
        sessionId,
        stageSlug,
        iterationNumber,
        modelId,
        documentKey,
      );

      expect(documentResourceState).toBeDefined();
      expect(documentResourceState?.sourceContributionId).toBe(sourceContributionId);

      // (2) Render the component
      render(<GeneratedContributionCard modelId={modelId} />);

      // Wait for component to render
      await waitFor(() => {
        expect(screen.getByText(/Test Model/i)).toBeInTheDocument();
      });

      // Verify the content textarea has the edited content
      const contentTextarea = screen.getByTestId(`stage-document-content-${modelId}-${documentKey}`);
      expect(contentTextarea).toHaveValue(editedContent);

      // Verify the save edit button is enabled
      const saveEditButtons = screen.getAllByRole('button', { name: /save edit/i });
      await waitFor(() => {
        expect(saveEditButtons[0]).not.toBeDisabled();
      });

      // (3) Trigger handleSaveEdit
      await user.click(saveEditButtons[0]);

      // (4) Verify saveContributionEdit is called with originalContributionIdToEdit matching sourceContributionId
      const { saveContributionEdit } = getDialecticStoreState();
      const saveContributionEditMock = vi.mocked(saveContributionEdit);

      await waitFor(() => {
        expect(saveContributionEditMock).toHaveBeenCalled();
      });

      const callArgs = saveContributionEditMock.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();

      const payload: SaveContributionEditPayload = callArgs;
      expect(payload.originalContributionIdToEdit).toBe(sourceContributionId);
      expect(payload.editedContentText).toBe(editedContent);
      expect(payload.projectId).toBe(projectId);
      expect(payload.sessionId).toBe(sessionId);
      expect(payload.documentKey).toBe(documentKey);
      expect(payload.originalModelContributionId).toBe(sourceContributionId);
      expect(payload.responseText).toBe(editedContent);
      expect(payload.resourceType).toBe('rendered_document');
    });
  });

  describe('Step 4.e: Component correctly triggers content fetching and displays content from the store', () => {
    it('4.e.i: should trigger fetchStageDocumentContent when selectFocusedStageDocument returns document with latestRenderedResourceId', async () => {
      const resourceId = 'resource-123';
      const documentDescriptor = buildStageDocumentDescriptor({
        latestRenderedResourceId: resourceId,
      });

      setDialecticStateValues({
        activeContextProjectId: projectId,
        activeContextSessionId: sessionId,
        activeStageSlug: stageSlug,
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,
          session_description: 'Test Session',
          user_input_reference_url: null,
          iteration_count: iterationNumber,
          selected_models: [{ id: modelId, displayName: 'Test Model' }],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: stageSlug,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          dialectic_contributions: [
            buildDialecticContribution({
              id: 'contrib-loading-1',
              model_id: modelId,
              model_name: 'Test Model',
            }),
          ],
        },
        focusedStageDocument: {
          [`${sessionId}:${stageSlug}:${modelId}`]: {
            modelId,
            documentKey,
          },
        },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: {},
            documents: {
              [documentKey]: documentDescriptor,
            },
          },
        },
        stageDocumentContent: {
          [compositeKeyString]: {
            baselineMarkdown: '',
            currentDraftMarkdown: '',
            isDirty: false,
            isLoading: false,
            error: null,
            lastBaselineVersion: null,
            pendingDiff: null,
            lastAppliedVersionHash: null,
            sourceContributionId: 'contrib-loading-1',
            feedbackDraftMarkdown: '',
            feedbackIsDirty: false,
          },
        },
        recipesByStageSlug: {
          [stageSlug]: {
            stageSlug,
            instanceId: 'instance-1',
            steps: [
              {
                id: 'step-1',
                step_key: 'draft_document',
                step_slug: 'draft-document',
                step_name: 'Draft Document',
                execution_order: 1,
                parallel_group: 1,
                branch_key: 'document',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                inputs_required: [],
                outputs_required: [
                  {
                    document_key: documentKey,
                    artifact_class: 'rendered_document',
                    file_type: 'markdown',
                  },
                ],
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
              },
            ],
          },
        },
        modelCatalog: [
          {
            id: modelId,
            model_name: 'Test Model',
            provider_name: 'Test Provider',
            api_identifier: 'test-model',
            description: '',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            is_active: true,
            context_window_tokens: 128000,
            input_token_cost_usd_millionths: 1000,
            output_token_cost_usd_millionths: 2000,
            max_output_tokens: 16000,
            strengths: [],
            weaknesses: [],
          },
        ],
      });

      // Verify selectFocusedStageDocument (producer) returns document with latestRenderedResourceId
      const state = getDialecticStoreState();
      const focusedDocument = selectFocusedStageDocument(state, sessionId, stageSlug, modelId);
      expect(focusedDocument).toBeDefined();
      expect(focusedDocument?.documentKey).toBe(documentKey);

      const { fetchStageDocumentContent } = getDialecticStoreState();
      const fetchStageDocumentContentMock = vi.mocked(fetchStageDocumentContent);

      // Render component (test subject)
      render(<GeneratedContributionCard modelId={modelId} />);

      // Verify fetchStageDocumentContent is called with correct composite key and resourceId
      await waitFor(() => {
        expect(fetchStageDocumentContentMock).toHaveBeenCalledWith(
          {
            sessionId,
            stageSlug,
            iterationNumber,
            modelId,
            documentKey,
          },
          resourceId,
        );
      });

      // Verify selectStageDocumentResource (consumer) can provide fetched content
      // (After fetch completes, the content should be available via selectStageDocumentResource)
      // The test verifies that fetchStageDocumentContent was called with correct parameters
      expect(fetchStageDocumentContentMock).toHaveBeenCalled();
    });

    it('4.e.ii: should display content from selectStageDocumentResource in Document Content TextInputArea', async () => {
      const loadedContent = 'Loaded document content from resource';
      const documentDescriptor = buildStageDocumentDescriptor({
        latestRenderedResourceId: 'resource-123',
      });

      setDialecticStateValues({
        activeContextProjectId: projectId,
        activeContextSessionId: sessionId,
        activeStageSlug: stageSlug,
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,
          session_description: 'Test Session',
          user_input_reference_url: null,
          iteration_count: iterationNumber,
          selected_models: [{ id: modelId, displayName: 'Test Model' }],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: stageSlug,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          dialectic_contributions: [
            buildDialecticContribution({
              id: 'contrib-loaded-1',
              model_id: modelId,
              model_name: 'Test Model',
            }),
          ],
        },
        focusedStageDocument: {
          [`${sessionId}:${stageSlug}:${modelId}`]: {
            modelId,
            documentKey,
          },
        },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: {},
            documents: {
              [documentKey]: documentDescriptor,
            },
          },
        },
        stageDocumentContent: {
          [compositeKeyString]: {
            baselineMarkdown: loadedContent,
            currentDraftMarkdown: loadedContent,
            isDirty: false,
            isLoading: false,
            error: null,
            lastBaselineVersion: {
              resourceId: 'resource-123',
              versionHash: 'hash-1',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
            pendingDiff: null,
            lastAppliedVersionHash: 'hash-1',
            sourceContributionId: 'contrib-loaded-1',
            feedbackDraftMarkdown: '',
            feedbackIsDirty: false,
          },
        },
        recipesByStageSlug: {
          [stageSlug]: {
            stageSlug,
            instanceId: 'instance-1',
            steps: [
              {
                id: 'step-1',
                step_key: 'draft_document',
                step_slug: 'draft-document',
                step_name: 'Draft Document',
                execution_order: 1,
                parallel_group: 1,
                branch_key: 'document',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                inputs_required: [],
                outputs_required: [
                  {
                    document_key: documentKey,
                    artifact_class: 'rendered_document',
                    file_type: 'markdown',
                  },
                ],
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
              },
            ],
          },
        },
        modelCatalog: [
          {
            id: modelId,
            model_name: 'Test Model',
            provider_name: 'Test Provider',
            api_identifier: 'test-model',
            description: '',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            is_active: true,
            context_window_tokens: 128000,
            input_token_cost_usd_millionths: 1000,
            output_token_cost_usd_millionths: 2000,
            max_output_tokens: 16000,
            strengths: [],
            weaknesses: [],
          },
        ],
      });

      // Verify selectStageDocumentResource (consumer) returns content with currentDraftMarkdown
      const state = getDialecticStoreState();
      const documentResourceState = selectStageDocumentResource(
        state,
        sessionId,
        stageSlug,
        iterationNumber,
        modelId,
        documentKey,
      );
      expect(documentResourceState).toBeDefined();
      expect(documentResourceState?.currentDraftMarkdown).toBe(loadedContent);

      // Render component (test subject)
      render(<GeneratedContributionCard modelId={modelId} />);

      // Verify component displays content in Document Content TextInputArea
      await waitFor(() => {
        const contentTextarea = screen.getByTestId(`stage-document-content-${modelId}-${documentKey}`);
        expect(contentTextarea).toHaveValue(loadedContent);
      });
    });

    it('4.e.iii: should disable content input when selectStageDocumentResource returns isLoading: true', async () => {
      const documentDescriptor = buildStageDocumentDescriptor({
        latestRenderedResourceId: 'resource-123',
      });

      setDialecticStateValues({
        activeContextProjectId: projectId,
        activeContextSessionId: sessionId,
        activeStageSlug: stageSlug,
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,
          session_description: 'Test Session',
          user_input_reference_url: null,
          iteration_count: iterationNumber,
          selected_models: [{ id: modelId, displayName: 'Test Model' }],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: stageSlug,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          dialectic_contributions: [
            buildDialecticContribution({
              id: 'contrib-loading-2',
              model_id: modelId,
              model_name: 'Test Model',
            }),
          ],
        },
        focusedStageDocument: {
          [`${sessionId}:${stageSlug}:${modelId}`]: {
            modelId,
            documentKey,
          },
        },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: {},
            documents: {
              [documentKey]: documentDescriptor,
            },
          },
        },
        stageDocumentContent: {
          [compositeKeyString]: {
            baselineMarkdown: '',
            currentDraftMarkdown: '',
            isDirty: false,
            isLoading: true,
            error: null,
            lastBaselineVersion: null,
            pendingDiff: null,
            lastAppliedVersionHash: null,
            sourceContributionId: null,
            feedbackDraftMarkdown: '',
            feedbackIsDirty: false,
          },
        },
        recipesByStageSlug: {
          [stageSlug]: {
            stageSlug,
            instanceId: 'instance-1',
            steps: [
              {
                id: 'step-1',
                step_key: 'draft_document',
                step_slug: 'draft-document',
                step_name: 'Draft Document',
                execution_order: 1,
                parallel_group: 1,
                branch_key: 'document',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                inputs_required: [],
                outputs_required: [
                  {
                    document_key: documentKey,
                    artifact_class: 'rendered_document',
                    file_type: 'markdown',
                  },
                ],
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
              },
            ],
          },
        },
        modelCatalog: [
          {
            id: modelId,
            model_name: 'Test Model',
            provider_name: 'Test Provider',
            api_identifier: 'test-model',
            description: '',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            is_active: true,
            context_window_tokens: 128000,
            input_token_cost_usd_millionths: 1000,
            output_token_cost_usd_millionths: 2000,
            max_output_tokens: 16000,
            strengths: [],
            weaknesses: [],
          },
        ],
      });

      // Verify selectStageDocumentResource (consumer) returns isLoading: true
      const state = getDialecticStoreState();
      const documentResourceState = selectStageDocumentResource(
        state,
        sessionId,
        stageSlug,
        iterationNumber,
        modelId,
        documentKey,
      );
      expect(documentResourceState).toBeDefined();
      expect(documentResourceState?.isLoading).toBe(true);

      // Render component (test subject)
      render(<GeneratedContributionCard modelId={modelId} />);

      // Verify content input is disabled while loading
      await waitFor(() => {
        const contentTextarea = screen.getByTestId(
          `stage-document-content-${modelId}-${documentKey}`,
        );
        expect(contentTextarea).toBeDisabled();
      });
    });

    it('4.e.iv: should display error message when selectStageDocumentResource returns an error', async () => {
      const errorMessage = 'Failed to fetch document content';
      const documentDescriptor = buildStageDocumentDescriptor({
        latestRenderedResourceId: 'resource-123',
      });

      setDialecticStateValues({
        activeContextProjectId: projectId,
        activeContextSessionId: sessionId,
        activeStageSlug: stageSlug,
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,
          session_description: 'Test Session',
          user_input_reference_url: null,
          iteration_count: iterationNumber,
          selected_models: [{ id: modelId, displayName: 'Test Model' }],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: stageSlug,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          dialectic_contributions: [
            buildDialecticContribution({
              id: 'contrib-error-1',
              model_id: modelId,
              model_name: 'Test Model',
            }),
          ],
        },
        focusedStageDocument: {
          [`${sessionId}:${stageSlug}:${modelId}`]: {
            modelId,
            documentKey,
          },
        },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: {},
            documents: {
              [documentKey]: documentDescriptor,
            },
          },
        },
        stageDocumentContent: {
          [compositeKeyString]: {
            baselineMarkdown: '',
            currentDraftMarkdown: '',
            isDirty: false,
            isLoading: false,
            error: { message: errorMessage, code: 'FETCH_ERROR' },
            lastBaselineVersion: null,
            pendingDiff: null,
            lastAppliedVersionHash: null,
            sourceContributionId: 'contrib-error-1',
            feedbackDraftMarkdown: '',
            feedbackIsDirty: false,
          },
        },
        recipesByStageSlug: {
          [stageSlug]: {
            stageSlug,
            instanceId: 'instance-1',
            steps: [
              {
                id: 'step-1',
                step_key: 'draft_document',
                step_slug: 'draft-document',
                step_name: 'Draft Document',
                execution_order: 1,
                parallel_group: 1,
                branch_key: 'document',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                inputs_required: [],
                outputs_required: [
                  {
                    document_key: documentKey,
                    artifact_class: 'rendered_document',
                    file_type: 'markdown',
                  },
                ],
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
              },
            ],
          },
        },
        modelCatalog: [
          {
            id: modelId,
            model_name: 'Test Model',
            provider_name: 'Test Provider',
            api_identifier: 'test-model',
            description: '',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            is_active: true,
            context_window_tokens: 128000,
            input_token_cost_usd_millionths: 1000,
            output_token_cost_usd_millionths: 2000,
            max_output_tokens: 16000,
            strengths: [],
            weaknesses: [],
          },
        ],
      });

      // Verify selectStageDocumentResource (consumer) returns an error
      const state = getDialecticStoreState();
      const documentResourceState = selectStageDocumentResource(
        state,
        sessionId,
        stageSlug,
        iterationNumber,
        modelId,
        documentKey,
      );
      expect(documentResourceState).toBeDefined();
      expect(documentResourceState?.error).toBeDefined();
      expect(documentResourceState?.error?.message).toBe(errorMessage);

      // Render component (test subject)
      render(<GeneratedContributionCard modelId={modelId} />);

      // Verify component displays error message in rendered output
      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });
  });

  describe('Unsaved indicators with store state', () => {
    it('does not show unsaved indicator when document is loaded with isDirty false', async () => {
      const documentDescriptor = buildStageDocumentDescriptor({
        latestRenderedResourceId: 'resource-123',
      });

      setDialecticStateValues({
        activeContextProjectId: projectId,
        activeContextSessionId: sessionId,
        activeStageSlug: stageSlug,
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,
          session_description: 'Test Session',
          user_input_reference_url: null,
          iteration_count: iterationNumber,
          selected_models: [{ id: modelId, displayName: 'Test Model' }],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: stageSlug,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          dialectic_contributions: [
            buildDialecticContribution({
              id: 'contrib-unsaved-1',
              model_id: modelId,
              model_name: 'Test Model',
            }),
          ],
        },
        focusedStageDocument: {
          [`${sessionId}:${stageSlug}:${modelId}`]: {
            modelId,
            documentKey,
          },
        },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: {},
            documents: {
              [documentKey]: documentDescriptor,
            },
          },
        },
        stageDocumentContent: {
          [compositeKeyString]: {
            baselineMarkdown: 'Loaded content',
            currentDraftMarkdown: 'Loaded content',
            isDirty: false,
            isLoading: false,
            error: null,
            lastBaselineVersion: {
              resourceId: 'resource-123',
              versionHash: 'hash-1',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
            pendingDiff: null,
            lastAppliedVersionHash: 'hash-1',
            sourceContributionId: 'contrib-unsaved-1',
            feedbackDraftMarkdown: '',
            feedbackIsDirty: false,
          },
        },
        recipesByStageSlug: {
          [stageSlug]: {
            stageSlug,
            instanceId: 'instance-1',
            steps: [
              {
                id: 'step-1',
                step_key: 'draft_document',
                step_slug: 'draft-document',
                step_name: 'Draft Document',
                execution_order: 1,
                parallel_group: 1,
                branch_key: 'document',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                inputs_required: [],
                outputs_required: [
                  {
                    document_key: documentKey,
                    artifact_class: 'rendered_document',
                    file_type: 'markdown',
                  },
                ],
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
              },
            ],
          },
        },
        modelCatalog: [
          {
            id: modelId,
            model_name: 'Test Model',
            provider_name: 'Test Provider',
            api_identifier: 'test-model',
            description: '',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            is_active: true,
            context_window_tokens: 128000,
            input_token_cost_usd_millionths: 1000,
            output_token_cost_usd_millionths: 2000,
            max_output_tokens: 16000,
            strengths: [],
            weaknesses: [],
          },
        ],
      });

      render(<GeneratedContributionCard modelId={modelId} />);

      await waitFor(() => {
        expect(screen.getByText(/Test Model/i)).toBeInTheDocument();
      });

      expect(screen.queryByText('Unsaved edits')).not.toBeInTheDocument();
      expect(screen.queryByText('Unsaved feedback')).not.toBeInTheDocument();
    });

    it('shows unsaved indicator after user edits document and isDirty becomes true', async () => {
      const user = userEvent.setup();
      const documentDescriptor = buildStageDocumentDescriptor({
        latestRenderedResourceId: 'resource-123',
      });

      setDialecticStateValues({
        activeContextProjectId: projectId,
        activeContextSessionId: sessionId,
        activeStageSlug: stageSlug,
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,
          session_description: 'Test Session',
          user_input_reference_url: null,
          iteration_count: iterationNumber,
          selected_models: [{ id: modelId, displayName: 'Test Model' }],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: stageSlug,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          dialectic_contributions: [
            buildDialecticContribution({
              id: 'contrib-unsaved-2',
              model_id: modelId,
              model_name: 'Test Model',
            }),
          ],
        },
        focusedStageDocument: {
          [`${sessionId}:${stageSlug}:${modelId}`]: {
            modelId,
            documentKey,
          },
        },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: {},
            documents: {
              [documentKey]: documentDescriptor,
            },
          },
        },
        stageDocumentContent: {
          [compositeKeyString]: {
            baselineMarkdown: 'Original content',
            currentDraftMarkdown: 'Original content',
            isDirty: false,
            isLoading: false,
            error: null,
            lastBaselineVersion: {
              resourceId: 'resource-123',
              versionHash: 'hash-1',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
            pendingDiff: null,
            lastAppliedVersionHash: 'hash-1',
            sourceContributionId: 'contrib-unsaved-2',
            feedbackDraftMarkdown: '',
            feedbackIsDirty: false,
          },
        },
        recipesByStageSlug: {
          [stageSlug]: {
            stageSlug,
            instanceId: 'instance-1',
            steps: [
              {
                id: 'step-1',
                step_key: 'draft_document',
                step_slug: 'draft-document',
                step_name: 'Draft Document',
                execution_order: 1,
                parallel_group: 1,
                branch_key: 'document',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                inputs_required: [],
                outputs_required: [
                  {
                    document_key: documentKey,
                    artifact_class: 'rendered_document',
                    file_type: 'markdown',
                  },
                ],
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
              },
            ],
          },
        },
        modelCatalog: [
          {
            id: modelId,
            model_name: 'Test Model',
            provider_name: 'Test Provider',
            api_identifier: 'test-model',
            description: '',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            is_active: true,
            context_window_tokens: 128000,
            input_token_cost_usd_millionths: 1000,
            output_token_cost_usd_millionths: 2000,
            max_output_tokens: 16000,
            strengths: [],
            weaknesses: [],
          },
        ],
      });

      render(<GeneratedContributionCard modelId={modelId} />);

      await waitFor(() => {
        expect(screen.getByText(/Test Model/i)).toBeInTheDocument();
      });

      expect(screen.queryByText('Unsaved edits')).not.toBeInTheDocument();

      const contentTextarea = screen.getByTestId(`stage-document-content-${modelId}-${documentKey}`);
      await user.clear(contentTextarea);
      await user.type(contentTextarea, 'Edited content');

      await waitFor(() => {
        expect(screen.getAllByText('Unsaved edits').length).toBeGreaterThan(0);
      });
    });

    it('hides unsaved indicator after document is saved and isDirty becomes false', async () => {
      const documentDescriptor = buildStageDocumentDescriptor({
        latestRenderedResourceId: 'resource-123',
      });

      setDialecticStateValues({
        activeContextProjectId: projectId,
        activeContextSessionId: sessionId,
        activeStageSlug: stageSlug,
        activeSessionDetail: {
          id: sessionId,
          project_id: projectId,
          session_description: 'Test Session',
          user_input_reference_url: null,
          iteration_count: iterationNumber,
          selected_models: [{ id: modelId, displayName: 'Test Model' }],
          status: 'active',
          associated_chat_id: null,
          current_stage_id: stageSlug,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          dialectic_contributions: [
            buildDialecticContribution({
              id: 'contrib-unsaved-3',
              model_id: modelId,
              model_name: 'Test Model',
            }),
          ],
        },
        focusedStageDocument: {
          [`${sessionId}:${stageSlug}:${modelId}`]: {
            modelId,
            documentKey,
          },
        },
        stageRunProgress: {
          [progressKey]: {
            stepStatuses: {},
            documents: {
              [documentKey]: documentDescriptor,
            },
          },
        },
        stageDocumentContent: {
          [compositeKeyString]: {
            baselineMarkdown: 'Saved content',
            currentDraftMarkdown: 'Saved content',
            isDirty: true,
            isLoading: false,
            error: null,
            lastBaselineVersion: {
              resourceId: 'resource-123',
              versionHash: 'hash-1',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
            pendingDiff: null,
            lastAppliedVersionHash: 'hash-1',
            sourceContributionId: 'contrib-unsaved-3',
            feedbackDraftMarkdown: '',
            feedbackIsDirty: false,
          },
        },
        recipesByStageSlug: {
          [stageSlug]: {
            stageSlug,
            instanceId: 'instance-1',
            steps: [
              {
                id: 'step-1',
                step_key: 'draft_document',
                step_slug: 'draft-document',
                step_name: 'Draft Document',
                execution_order: 1,
                parallel_group: 1,
                branch_key: 'document',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                inputs_required: [],
                outputs_required: [
                  {
                    document_key: documentKey,
                    artifact_class: 'rendered_document',
                    file_type: 'markdown',
                  },
                ],
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
              },
            ],
          },
        },
        modelCatalog: [
          {
            id: modelId,
            model_name: 'Test Model',
            provider_name: 'Test Provider',
            api_identifier: 'test-model',
            description: '',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            is_active: true,
            context_window_tokens: 128000,
            input_token_cost_usd_millionths: 1000,
            output_token_cost_usd_millionths: 2000,
            max_output_tokens: 16000,
            strengths: [],
            weaknesses: [],
          },
        ],
      });

      render(<GeneratedContributionCard modelId={modelId} />);

      await waitFor(() => {
        expect(screen.getAllByText('Unsaved edits').length).toBeGreaterThan(0);
      });

      setDialecticStateValues({
        stageDocumentContent: {
          [compositeKeyString]: {
            baselineMarkdown: 'Saved content',
            currentDraftMarkdown: 'Saved content',
            isDirty: false,
            isLoading: false,
            error: null,
            lastBaselineVersion: {
              resourceId: 'resource-123',
              versionHash: 'hash-1',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
            pendingDiff: null,
            lastAppliedVersionHash: 'hash-1',
            sourceContributionId: 'contrib-unsaved-3',
            feedbackDraftMarkdown: '',
            feedbackIsDirty: false,
          },
        },
      });

      await waitFor(() => {
        expect(screen.queryAllByText('Unsaved edits')).toHaveLength(0);
      });
    });
  });
});

