import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DialecticContribution,
  DialecticProject,
  DialecticSession,
  DialecticStage,
  DialecticStageRecipe,
  DialecticStageRecipeStep,
  DialecticStateValues,
  DialecticProcessTemplate,
  StageRenderedDocumentDescriptor,
} from '@paynless/types';

import { SessionContributionsDisplayCard } from './SessionContributionsDisplayCard';

import {
  getDialecticStoreState,
  initializeMockDialecticState,
  setDialecticStateValues,
} from '../../mocks/dialecticStore.mock';
import { selectStageDocumentChecklist } from '@paynless/store';

vi.mock('@paynless/store', async () => {
  const actual = await import('@paynless/store');
  const mock = await import('../../mocks/dialecticStore.mock');
  return {
    ...actual,
    useDialecticStore: mock.useDialecticStore,
    selectStageDocumentChecklist: actual.selectStageDocumentChecklist,
  };
});

vi.mock('./ExportProjectButton', () => ({
  ExportProjectButton: vi.fn(() => null),
}));

vi.mock('../../hooks/useStageRunProgressHydration', () => ({
  useStageRunProgressHydration: vi.fn(),
}));

const stageSlug = 'thesis';
const sessionId = 'sess-1';
const projectId = 'proj-1';
const iterationNumber = 1;
const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

type StageRunProgressEntry = NonNullable<DialecticStateValues['stageRunProgress'][string]>;
type StepStatuses = StageRunProgressEntry['stepStatuses'];
type StageRunDocuments = StageRunProgressEntry['documents'];

const isoTimestamp = '2024-01-01T00:00:00.000Z';

const buildRecipeSteps = (): DialecticStageRecipeStep[] => [
  {
    id: 'step-planner',
    step_key: 'planner_header',
    step_slug: 'planner-header',
    step_name: 'Planner Header',
    execution_order: 1,
    parallel_group: 1,
    branch_key: 'planner',
    job_type: 'PLAN',
    prompt_type: 'Planner',
    inputs_required: [],
    outputs_required: [
      {
        document_key: 'header_context',
        artifact_class: 'header_context',
        file_type: 'json',
      },
    ],
    output_type: 'header_context',
    granularity_strategy: 'all_to_one',
  },
  {
    id: 'step-execute',
    step_key: 'draft_document',
    step_slug: 'draft-document',
    step_name: 'Draft Document',
    execution_order: 2,
    parallel_group: 1,
    branch_key: 'document',
    job_type: 'EXECUTE',
    prompt_type: 'Turn',
    inputs_required: [],
    outputs_required: [
      {
        document_key: 'draft_document_outline',
        artifact_class: 'assembled_json',
        file_type: 'json',
      },
    ],
    output_type: 'assembled_document_json',
    granularity_strategy: 'per_source_document',
  },
  {
    id: 'step-render',
    step_key: 'render_document',
    step_slug: 'render-document',
    step_name: 'Render Document',
    execution_order: 3,
    parallel_group: 2,
    branch_key: 'render',
    job_type: 'RENDER',
    prompt_type: 'Planner',
    inputs_required: [],
    outputs_required: [
      {
        document_key: 'draft_document_markdown',
        artifact_class: 'rendered_document',
        file_type: 'markdown',
      },
    ],
    output_type: 'rendered_document',
    granularity_strategy: 'all_to_one',
  },
];

const buildStage = (): DialecticStage => ({
  id: 'stage-1',
  slug: stageSlug,
  display_name: 'Thesis',
  description: 'Stage description',
  default_system_prompt_id: 'prompt-1',
  expected_output_template_ids: [],
  recipe_template_id: null,
  active_recipe_instance_id: null,
  created_at: isoTimestamp,
});

const buildProcessTemplate = (stage: DialecticStage): DialecticProcessTemplate => ({
  id: 'template-1',
  name: 'Template',
  description: 'Process template',
  starting_stage_id: stage.id,
  created_at: isoTimestamp,
  stages: [stage],
  transitions: [],
});

const buildContribution = (modelId: string): DialecticContribution => ({
  id: `contrib-${modelId}`,
  session_id: sessionId,
  user_id: 'user-1',
  stage: stageSlug,
  iteration_number: iterationNumber,
  model_id: modelId,
  model_name: `Model ${modelId}`,
  prompt_template_id_used: null,
  seed_prompt_url: null,
  edit_version: 1,
  is_latest_edit: true,
  original_model_contribution_id: null,
  raw_response_storage_path: null,
  target_contribution_id: null,
  tokens_used_input: null,
  tokens_used_output: null,
  processing_time_ms: null,
  error: null,
  citations: null,
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  contribution_type: 'thesis',
  file_name: 'contribution.md',
  storage_bucket: 'bucket',
  storage_path: 'path',
  size_bytes: 1024,
  mime_type: 'text/markdown',
});

const buildSession = (
  contributions: DialecticContribution[],
  selectedModelIds: string[],
): DialecticSession => ({
  id: sessionId,
  project_id: projectId,
  session_description: 'Session',
  user_input_reference_url: null,
  iteration_count: iterationNumber,
  selected_model_ids: selectedModelIds,
  status: 'active',
  associated_chat_id: null,
  current_stage_id: 'stage-1',
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  dialectic_session_models: [],
  dialectic_contributions: contributions,
  feedback: [],
});

const buildProject = (
  session: DialecticSession,
  processTemplate: DialecticProcessTemplate,
): DialecticProject => ({
  id: projectId,
  user_id: 'user-1',
  project_name: 'Project',
  initial_user_prompt: null,
  initial_prompt_resource_id: null,
  selected_domain_id: 'domain-1',
  dialectic_domains: { name: 'Software Development' },
  selected_domain_overlay_id: null,
  repo_url: null,
  status: 'active',
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  dialectic_sessions: [session],
  resources: [],
  process_template_id: processTemplate.id,
  dialectic_process_templates: processTemplate,
  isLoadingProcessTemplate: false,
  processTemplateError: null,
  contributionGenerationStatus: 'idle',
  generateContributionsError: null,
  isSubmittingStageResponses: false,
  submitStageResponsesError: null,
  isSavingContributionEdit: false,
  saveContributionEditError: null,
});

const buildRecipe = (steps: DialecticStageRecipeStep[]): DialecticStageRecipe => ({
  stageSlug,
  instanceId: 'instance-1',
  steps,
});

const buildStageRunProgress = (
  stepStatuses: StepStatuses,
  documents: StageRunDocuments,
): StageRunProgressEntry => ({
  stepStatuses,
  documents,
});

const buildStageDocumentDescriptor = (
  modelId: string,
  overrides: Partial<StageRenderedDocumentDescriptor> = {},
): StageRunDocuments[string] => ({
  descriptorType: 'rendered',
  status: 'completed',
  job_id: `${modelId}-job`,
  latestRenderedResourceId: `${modelId}-resource`,
  modelId,
  versionHash: `${modelId}-hash`,
  lastRenderedResourceId: `${modelId}-resource`,
  lastRenderAtIso: isoTimestamp,
  ...overrides,
});

const renderSessionContributionsDisplayCard = () => render(<SessionContributionsDisplayCard />);

beforeEach(() => {
  vi.clearAllMocks();
  initializeMockDialecticState();
});

describe('SessionContributionsDisplayCard Integration Tests', () => {
  const seedBaseStore = (
    progress: StageRunProgressEntry,
    overrides?: Partial<DialecticStateValues>,
  ) => {
    const steps = buildRecipeSteps();
    const stage = buildStage();
    const processTemplate = buildProcessTemplate(stage);
    const contributions = ['model-a', 'model-b'].map(buildContribution);
    const session = buildSession(contributions, ['model-a', 'model-b']);
    const project = buildProject(session, processTemplate);
    const recipe = buildRecipe(steps);

    setDialecticStateValues({
      activeContextProjectId: project.id,
      activeContextSessionId: session.id,
      activeContextStage: stage,
      activeStageSlug: stage.slug,
      activeSessionDetail: session,
      selectedModelIds: session.selected_model_ids ?? [],
      currentProjectDetail: project,
      currentProcessTemplate: processTemplate,
      recipesByStageSlug: {
        [stage.slug]: recipe,
      },
      stageRunProgress: {
        [progressKey]: progress,
      },
      ...overrides,
    });
  };

  describe('Step 3.e: Component reads document status from store and updates correctly', () => {
    it('does not display banner when selectStageDocumentChecklist returns documents with status completed', () => {
      // 3.e.i: Assert that when selectStageDocumentChecklist (producer) returns documents with status 'completed',
      // the component SessionContributionsDisplayCard (test subject) calculates hasGeneratingDocuments as false,
      // calculates isGenerating as false, and the rendered output (consumer) does not display the banner
      const progress = buildStageRunProgress(
        {
          planner_header: 'completed',
          draft_document: 'completed',
          render_document: 'completed',
        },
        {
          header_context: {
            status: 'completed',
            job_id: 'job-1',
            latestRenderedResourceId: 'header.json',
            modelId: 'model-a',
            versionHash: 'hash-a',
            lastRenderedResourceId: 'resource-a',
            lastRenderAtIso: isoTimestamp,
          },
          draft_document_outline: buildStageDocumentDescriptor('model-a', {
            status: 'completed',
          }),
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'completed',
          }),
        },
      );

      seedBaseStore(progress, {
        generateContributionsError: null,
      });

      // Verify producer: selectStageDocumentChecklist returns documents with status 'completed'
      const state = getDialecticStoreState();
      const checklist = selectStageDocumentChecklist(state, progressKey, 'model-a');
      expect(checklist.every((doc) => doc.status === 'completed')).toBe(true);

      renderSessionContributionsDisplayCard();

      // Verify test subject: Component calculates hasGeneratingDocuments as false and isGenerating as false
      // (Verified indirectly via rendered output)
      // Verify consumer: Rendered output does NOT display the "Generating documents" banner
      expect(screen.queryByText('Generating documents')).not.toBeInTheDocument();
    });

    it('displays banner when selectStageDocumentChecklist returns at least one document with status generating', () => {
      // 3.e.ii: Assert that when selectStageDocumentChecklist (producer) returns at least one document with status 'generating',
      // the component SessionContributionsDisplayCard (test subject) calculates hasGeneratingDocuments as true,
      // calculates isGenerating as true, and the rendered output (consumer) displays the banner
      const progress = buildStageRunProgress(
        {
          planner_header: 'completed',
          draft_document: 'in_progress',
          render_document: 'not_started',
        },
        {
          header_context: {
            status: 'completed',
            job_id: 'job-1',
            latestRenderedResourceId: 'header.json',
            modelId: 'model-a',
            versionHash: 'hash-a',
            lastRenderedResourceId: 'resource-a',
            lastRenderAtIso: isoTimestamp,
          },
          draft_document_outline: buildStageDocumentDescriptor('model-a', {
            status: 'generating',
          }),
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'not_started',
          }),
        },
      );

      seedBaseStore(progress, {
        generateContributionsError: null,
      });

      // Verify producer: selectStageDocumentChecklist returns at least one document with status 'generating'
      const state = getDialecticStoreState();
      const checklist = selectStageDocumentChecklist(state, progressKey, 'model-a');
      expect(checklist.some((doc) => doc.status === 'generating')).toBe(true);

      renderSessionContributionsDisplayCard();

      // Verify test subject: Component calculates hasGeneratingDocuments as true and isGenerating as true
      // (Verified indirectly via rendered output)
      // Verify consumer: Rendered output displays the "Generating documents" banner
      expect(screen.getByText('Generating documents')).toBeInTheDocument();
    });

    it('updates banner visibility when document status changes from generating to completed via selectStageDocumentChecklist', () => {
      // 3.e.iii: Assert that when document status in the store (via selectStageDocumentChecklist - producer) changes
      // from 'generating' to 'completed', the component SessionContributionsDisplayCard (test subject) correctly
      // updates hasGeneratingDocuments to false (via useMemo dependencies) and the rendered output (consumer) hides the banner
      const initialProgress = buildStageRunProgress(
        {
          planner_header: 'completed',
          draft_document: 'in_progress',
          render_document: 'not_started',
        },
        {
          header_context: {
            status: 'completed',
            job_id: 'job-1',
            latestRenderedResourceId: 'header.json',
            modelId: 'model-a',
            versionHash: 'hash-a',
            lastRenderedResourceId: 'resource-a',
            lastRenderAtIso: isoTimestamp,
          },
          draft_document_outline: buildStageDocumentDescriptor('model-a', {
            status: 'generating',
          }),
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'not_started',
          }),
        },
      );

      seedBaseStore(initialProgress, {
        generateContributionsError: null,
      });

      // Verify producer: Initially, selectStageDocumentChecklist returns document with status 'generating'
      let state = getDialecticStoreState();
      let checklist = selectStageDocumentChecklist(state, progressKey, 'model-a');
      expect(checklist.some((doc) => doc.status === 'generating')).toBe(true);

      const { rerender } = renderSessionContributionsDisplayCard();

      // Initially: Component calculates hasGeneratingDocuments as true, isGenerating as true
      // Rendered output displays the banner
      expect(screen.getByText('Generating documents')).toBeInTheDocument();

      // Update store state: Change document status from 'generating' to 'completed'
      // This causes selectStageDocumentChecklist (producer) to return documents with status 'completed'
      const updatedProgress = buildStageRunProgress(
        {
          planner_header: 'completed',
          draft_document: 'completed',
          render_document: 'not_started',
        },
        {
          header_context: {
            status: 'completed',
            job_id: 'job-1',
            latestRenderedResourceId: 'header.json',
            modelId: 'model-a',
            versionHash: 'hash-a',
            lastRenderedResourceId: 'resource-a',
            lastRenderAtIso: isoTimestamp,
          },
          draft_document_outline: buildStageDocumentDescriptor('model-a', {
            status: 'completed',
          }),
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'not_started',
          }),
        },
      );

      seedBaseStore(updatedProgress, {
        generateContributionsError: null,
      });

      // Verify producer: After update, selectStageDocumentChecklist returns documents with status 'completed'
      state = getDialecticStoreState();
      checklist = selectStageDocumentChecklist(state, progressKey, 'model-a');
      expect(checklist.every((doc) => doc.status === 'completed' || doc.status === 'not_started')).toBe(true);
      expect(checklist.some((doc) => doc.status === 'generating')).toBe(false);

      // Rerender with updated store state
      rerender(<SessionContributionsDisplayCard />);

      // After status change: Component updates hasGeneratingDocuments to false (via useMemo dependencies on documentGroups)
      // Component updates isGenerating to false (via useMemo dependencies)
      // Rendered output hides the banner
      expect(screen.queryByText('Generating documents')).not.toBeInTheDocument();
    });
  });
});

