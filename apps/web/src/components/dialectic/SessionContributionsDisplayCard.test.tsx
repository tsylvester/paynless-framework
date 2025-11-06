import { render, screen, within } from '@testing-library/react';
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
} from '@paynless/types';

import { SessionContributionsDisplayCard } from './SessionContributionsDisplayCard';

import {
  initializeMockDialecticState,
  setDialecticStateValues,
  selectIsStageReadyForSessionIteration,
  submitStageDocumentFeedback,
} from '../../mocks/dialecticStore.mock';
import { useStageRunProgressHydration } from '../../hooks/useStageRunProgressHydration';

vi.mock('@paynless/store', () => import('../../mocks/dialecticStore.mock'));

vi.mock('./StageRunChecklist', () => ({
  StageRunChecklist: vi.fn(({ modelId, onDocumentSelect }) => (
    <div>
      <h2
        onClick={() =>
          onDocumentSelect({
            modelId,
            documentKey: 'draft_document_outline',
            stepKey: 'draft_document',
          })
        }
      >
        Stage Run Checklist for {modelId}
      </h2>
      <button
        onClick={() =>
          submitStageDocumentFeedback({
            session_id: sessionId,
            project_id: projectId,
            stage_slug: stageSlug,
            iteration_number: iterationNumber,
            model_id: modelId,
            document_key: 'draft_document_outline',
            feedback_content: 'Test feedback',
            feedback_type: 'user_provided_feedback_v1',
          })
        }
      >
        Save Feedback for {modelId}
      </button>
    </div>
  )),
}));

vi.mock('./GeneratedContributionCard', () => ({
  GeneratedContributionCard: vi.fn(({ modelId, children }) => (
    <div data-testid={`generated-contribution-card-${modelId}`}>{children}</div>
  )),
}));

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

  describe('Multi-model rendering', () => {
    it('renders a GeneratedContributionCard for each selected model', async () => {
      const progress = buildStageRunProgress({}, {});
      seedBaseStore(progress);

      renderSessionContributionsDisplayCard();

      const { GeneratedContributionCard } = await import('./GeneratedContributionCard');
      expect(GeneratedContributionCard).toHaveBeenCalledTimes(2);
      expect(GeneratedContributionCard).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: 'model-a' }),
        expect.anything(),
      );
      expect(GeneratedContributionCard).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: 'model-b' }),
        expect.anything(),
      );

      expect(screen.getByTestId('generated-contribution-card-model-a')).toBeInTheDocument();
      expect(screen.getByTestId('generated-contribution-card-model-b')).toBeInTheDocument();
    });
  });

  describe('Stage checklist integration', () => {
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

    it('renders a GeneratedContributionCard for each model, each containing a StageRunChecklist', async () => {
      const progress = buildStageRunProgress(
        {
          planner_header: 'completed',
          draft_document: 'completed',
          render_document: 'completed',
        },
        {},
      );

      seedBaseStore(progress);

      renderSessionContributionsDisplayCard();

      expect(screen.getByTestId('generated-contribution-card-model-a')).toBeInTheDocument();
      expect(screen.getByTestId('generated-contribution-card-model-b')).toBeInTheDocument();
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
});

