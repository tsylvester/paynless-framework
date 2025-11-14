import { fireEvent, render, screen, within } from '@testing-library/react';
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
  StageDocumentContentState,
  StageRenderedDocumentDescriptor,
} from '@paynless/types';

import { SessionContributionsDisplayCard } from './SessionContributionsDisplayCard';

import {
  getDialecticStoreState,
  initializeMockDialecticState,
  setDialecticStateValues,
  selectIsStageReadyForSessionIteration,
} from '../../mocks/dialecticStore.mock';
import { useStageRunProgressHydration } from '../../hooks/useStageRunProgressHydration';

vi.mock('@paynless/store', () => import('../../mocks/dialecticStore.mock'));

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
    output_type: 'HeaderContext',
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
    output_type: 'AssembledDocumentJson',
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
    output_type: 'RenderedDocument',
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

const buildStageDocumentContent = (
  overrides: Partial<StageDocumentContentState> = {},
): StageDocumentContentState => ({
  baselineMarkdown: 'Baseline draft content',
  currentDraftMarkdown: 'Baseline draft content',
  isDirty: false,
  isLoading: false,
  error: null,
  lastBaselineVersion: null,
  pendingDiff: null,
  lastAppliedVersionHash: null,
  ...overrides,
});

const buildStageDocumentKey = (modelId: string, documentKey: string): string =>
  `${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`;

const renderSessionContributionsDisplayCard = () => render(<SessionContributionsDisplayCard />);

beforeEach(() => {
  vi.clearAllMocks();
  initializeMockDialecticState();
});

describe('SessionContributionsDisplayCard', () => {
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

  describe('Document rendering', () => {
    it('renders a stage document card for each model document', () => {
      const progress = buildStageRunProgress(
        {},
        {
          draft_document_outline_model_a: buildStageDocumentDescriptor('model-a'),
          draft_document_outline_model_b: buildStageDocumentDescriptor('model-b'),
        },
      );

      seedBaseStore(progress, {
        stageDocumentContent: {
          [buildStageDocumentKey('model-a', 'draft_document_outline_model_a')]:
            buildStageDocumentContent(),
          [buildStageDocumentKey('model-b', 'draft_document_outline_model_b')]:
            buildStageDocumentContent(),
        },
      });

      renderSessionContributionsDisplayCard();

      expect(
        screen.getByTestId('stage-document-card-model-a-draft_document_outline_model_a'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('stage-document-card-model-b-draft_document_outline_model_b'),
      ).toBeInTheDocument();

      expect(screen.getByTestId('card-header')).toBeInTheDocument();
      expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    });

    it('routes document draft edits through updateStageDocumentDraft', () => {
      const documentKey = 'draft_document_outline_model_a';
      const progress = buildStageRunProgress(
        {},
        {
          [documentKey]: buildStageDocumentDescriptor('model-a'),
        },
      );

      seedBaseStore(progress, {
        stageDocumentContent: {
          [buildStageDocumentKey('model-a', documentKey)]: buildStageDocumentContent(),
        },
      });

      const { updateStageDocumentDraft } = getDialecticStoreState();

      renderSessionContributionsDisplayCard();

      const draftArea = screen.getByTestId(
        `stage-document-feedback-model-a-${documentKey}`,
      );

      fireEvent.change(draftArea, { target: { value: 'Updated draft' } });

      expect(updateStageDocumentDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId,
          stageSlug,
          iterationNumber,
          modelId: 'model-a',
          documentKey,
        }),
        'Updated draft',
      );
    });
  });

  describe('Hydration', () => {
    it('invokes useStageRunProgressHydration with active session context', () => {
      const progress = buildStageRunProgress(
        {
          planner_header: 'completed',
          draft_document: 'in_progress',
          render_document: 'not_started',
        },
        {
          header_context: {
            status: 'completed',
            modelId: 'model-a',
            versionHash: 'hash-a',
            lastRenderedResourceId: 'resource-a',
            lastRenderAtIso: isoTimestamp,
            job_id: 'job-1',
            latestRenderedResourceId: 'header.json',
          },
          draft_document_outline: {
            status: 'generating',
            job_id: 'job-1',
            modelId: 'model-a',
            versionHash: 'hash-a',
            lastRenderedResourceId: 'resource-a',
            lastRenderAtIso: isoTimestamp,
            latestRenderedResourceId: 'outline.json',
          },
          draft_document_markdown: {
            status: 'idle',
            modelId: 'model-a',
            versionHash: 'hash-a',
            lastRenderedResourceId: 'resource-a',
            lastRenderAtIso: isoTimestamp,  
            job_id: 'job-1',
            latestRenderedResourceId: 'render.md',
          },
        },
      );

      seedBaseStore(progress);

      renderSessionContributionsDisplayCard();

      expect(useStageRunProgressHydration).toHaveBeenCalledTimes(1);
    });
  });

  describe('Submit gating via StageProgressSummary', () => {
    it('disables the submit button when StageProgressSummary reports incomplete documents', () => {
      const progress = buildStageRunProgress(
        {
          planner_header: 'completed',
          draft_document: 'in_progress',
          render_document: 'waiting_for_children',
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
          draft_document_outline: {
            status: 'generating',
            job_id: 'job-2',
            modelId: 'model-a',
            versionHash: 'hash-a',
            lastRenderedResourceId: 'resource-a',
            lastRenderAtIso: isoTimestamp,
            latestRenderedResourceId: 'outline.json',
          },
          draft_document_markdown: {
            status: 'idle',
            modelId: 'model-a',
            versionHash: 'hash-a',
            lastRenderedResourceId: 'resource-a',
            lastRenderAtIso: isoTimestamp,
            latestRenderedResourceId: 'render.md',
            job_id: 'job-3',
          },
        },
      );

      seedBaseStore(progress);

      selectIsStageReadyForSessionIteration.mockReturnValue(true);

      renderSessionContributionsDisplayCard();

      const header = screen.getByTestId('card-header');
      expect(
        within(header).getByRole('button', { name: 'Submit Responses & Advance Stage' }),
      ).toBeDisabled();
    });

    it('enables the submit button when all documents are complete even if legacy readiness reports false', () => {
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
          draft_document_outline: {
            status: 'completed',
            job_id: 'job-2',
            latestRenderedResourceId: 'outline.json',
            modelId: 'model-a',
            versionHash: 'hash-a',
            lastRenderedResourceId: 'resource-a',
            lastRenderAtIso: isoTimestamp,
          },
          draft_document_markdown: {
            status: 'completed',
            job_id: 'job-3',
            latestRenderedResourceId: 'render.md',
            modelId: 'model-a',
            versionHash: 'hash-a',
            lastRenderedResourceId: 'resource-a',
            lastRenderAtIso: isoTimestamp,
          },
        },
      );

      seedBaseStore(progress);

      selectIsStageReadyForSessionIteration.mockReturnValue(false);

      renderSessionContributionsDisplayCard();

      const footer = screen.getByTestId('card-footer');
      expect(
        within(footer).getByRole('button', { name: 'Submit Responses & Advance Stage' }),
      ).not.toBeDisabled();
    });
  });

  describe('Legacy readiness regression', () => {
    it('does not consult selectIsStageReadyForSessionIteration for gating', () => {
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
          draft_document_outline: {
            status: 'completed',
            job_id: 'job-2',
            latestRenderedResourceId: 'outline.json',
            modelId: 'model-a',
            versionHash: 'hash-a',
            lastRenderedResourceId: 'resource-a',
            lastRenderAtIso: isoTimestamp,
          },
          draft_document_markdown: {
            status: 'completed',
            job_id: 'job-3',
            latestRenderedResourceId: 'render.md',
            modelId: 'model-a',
            versionHash: 'hash-a',
            lastRenderedResourceId: 'resource-a',
            lastRenderAtIso: isoTimestamp,
          },
        },
      );

      seedBaseStore(progress);

      renderSessionContributionsDisplayCard();

      expect(selectIsStageReadyForSessionIteration).not.toHaveBeenCalled();
    });
  });

  describe('Failure handling', () => {
    it('hides the spinner and surfaces failed document details when generation fails', () => {
      const failureMessage = 'Planner failure for model-a';
      const progress = buildStageRunProgress(
        {
          planner_header: 'completed',
          draft_document: 'failed',
          render_document: 'failed',
        },
        {
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'failed',
            job_id: 'job-failure',
            latestRenderedResourceId: 'render.md',
            error: { code: 'MODEL_FAILURE', message: failureMessage },
          }),
        },
      );

      seedBaseStore(progress, {
        contributionGenerationStatus: 'generating',
        generateContributionsError: { code: 'MODEL_FAILURE', message: failureMessage },
      });

      renderSessionContributionsDisplayCard();

      expect(screen.queryByText('Generating documents')).toBeNull();

      const errorBanner = screen.getByTestId('generation-error-banner');
      expect(within(errorBanner).getByText('Generation Error')).toBeInTheDocument();
      expect(within(errorBanner).getByText(failureMessage)).toBeInTheDocument();
      expect(within(errorBanner).getByText(/draft_document_markdown/i)).toBeInTheDocument();
    });
  });
});

