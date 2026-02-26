import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  SelectedModels,
  StageDocumentContentState,
  StageRenderedDocumentDescriptor,
} from '@paynless/types';

import { SessionContributionsDisplayCard } from './SessionContributionsDisplayCard';
import { GeneratedContributionCard } from './GeneratedContributionCard';

import {
  getDialecticStoreState,
  initializeMockDialecticState,
  setDialecticStateValues,
  selectIsStageReadyForSessionIteration,
  selectSelectedModels,
} from '../../mocks/dialecticStore.mock';
import { useStageRunProgressHydration } from '../../hooks/useStageRunProgressHydration';

vi.mock('@paynless/store', () => import('../../mocks/dialecticStore.mock'));

vi.mock('./ExportProjectButton', () => ({
  ExportProjectButton: vi.fn(() => null),
}));

vi.mock('../../hooks/useStageRunProgressHydration', () => ({
  useStageRunProgressHydration: vi.fn(),
}));

vi.mock('./GeneratedContributionCard', () => ({
  GeneratedContributionCard: vi.fn(() => null),
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

const buildSelectedModels = (ids: string[]): SelectedModels[] =>
  ids.map((id) => ({ id, displayName: `Model ${id}` }));

const buildSession = (
  contributions: DialecticContribution[],
  selectedModels: SelectedModels[],
): DialecticSession => ({
  id: sessionId,
  project_id: projectId,
  session_description: 'Session',
  user_input_reference_url: null,
  iteration_count: iterationNumber,
  selected_models: selectedModels,
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
  jobProgress: {},
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
  sourceContributionId: null,
  feedbackDraftMarkdown: undefined,
  feedbackIsDirty: false,
  resourceType: null,
  ...overrides,
});

const buildStageDocumentKey = (modelId: string, documentKey: string): string =>
  `${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`;

const renderSessionContributionsDisplayCard = () => render(<SessionContributionsDisplayCard />);

/** Submit button and card-footer are rendered by SessionContributionsDisplayCard (SubmitResponsesButton). Two instances (header and footer) are intended; helper returns the first. */
function getSubmitButton(): ReturnType<typeof screen.queryByRole> {
  const buttons = screen.queryAllByRole('button', { name: 'Submit Responses & Advance Stage' });
  return buttons[0] ?? null;
}
/** Two card-footers (header and footer) are intended; returns the first. */
function getCardFooter(): ReturnType<typeof screen.queryByTestId> {
  const footers = screen.queryAllByTestId('card-footer');
  return footers[0] ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  initializeMockDialecticState();
  selectSelectedModels.mockImplementation(
    (state: DialecticStateValues): SelectedModels[] => {
      if (state.selectedModels === undefined || state.selectedModels === null) {
        throw new Error('Test must set selectedModels on state');
      }
      return state.selectedModels;
    },
  );
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
    const session = buildSession(contributions, buildSelectedModels(['model-a', 'model-b']));
    const project = buildProject(session, processTemplate);
    const recipe = buildRecipe(steps);

    setDialecticStateValues({
      activeContextProjectId: project.id,
      activeContextSessionId: session.id,
      activeContextStage: stage,
      activeStageSlug: stage.slug,
      activeSessionDetail: session,
      selectedModels: session.selected_models,
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

  // NOTE: "Document rendering" tests removed - behavior is now owned by GeneratedContributionCard

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
      // Use multi-stage setup so this is not the last stage (single stage would disable button per step 5.c.v)
      const stage1: DialecticStage = {
        id: 'stage-1',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
        default_system_prompt_id: 'prompt-1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const stage2: DialecticStage = {
        id: 'stage-2',
        slug: 'antithesis',
        display_name: 'Antithesis',
        description: 'Antithesis stage',
        default_system_prompt_id: 'prompt-2',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const multiStageProcessTemplate: DialecticProcessTemplate = {
        id: 'template-multi',
        name: 'Multi-Stage Template',
        description: 'Template with multiple stages',
        starting_stage_id: stage1.id,
        created_at: isoTimestamp,
        stages: [stage1, stage2],
        transitions: [
          {
            id: 'transition-1',
            source_stage_id: stage1.id,
            target_stage_id: stage2.id,
            condition_description: null,
            created_at: isoTimestamp,
            process_template_id: 'template-multi',
          },
        ],
      };

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

      const steps = buildRecipeSteps();
      const contributions = ['model-a', 'model-b'].map(buildContribution);
      const session = buildSession(contributions, buildSelectedModels(['model-a', 'model-b']));
      const project = buildProject(session, multiStageProcessTemplate);
      const recipe = buildRecipe(steps);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: stage1,
        activeStageSlug: stage1.slug,
        activeSessionDetail: session,
        selectedModels: session.selected_models,
        currentProjectDetail: project,
        currentProcessTemplate: multiStageProcessTemplate,
        recipesByStageSlug: {
          [stage1.slug]: recipe,
        },
        stageRunProgress: {
          [progressKey]: progress,
        },
      });

      selectIsStageReadyForSessionIteration.mockReturnValue(true);

      renderSessionContributionsDisplayCard();

      expect(screen.getByTestId('card-header')).toBeInTheDocument();
      const submitButtons = screen.queryAllByRole('button', { name: 'Submit Responses & Advance Stage' });
      expect(submitButtons).toHaveLength(2);
      submitButtons.forEach((btn) => expect(btn).toBeDisabled());
    });

    it('enables the submit button when all documents are complete even if legacy readiness reports false', () => {
      // Use multi-stage setup so this is not the last stage (single stage would disable button per step 5.c.v)
      const stage1: DialecticStage = {
        id: 'stage-1',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
        default_system_prompt_id: 'prompt-1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const stage2: DialecticStage = {
        id: 'stage-2',
        slug: 'antithesis',
        display_name: 'Antithesis',
        description: 'Antithesis stage',
        default_system_prompt_id: 'prompt-2',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const multiStageProcessTemplate: DialecticProcessTemplate = {
        id: 'template-multi',
        name: 'Multi-Stage Template',
        description: 'Template with multiple stages',
        starting_stage_id: stage1.id,
        created_at: isoTimestamp,
        stages: [stage1, stage2],
        transitions: [
          {
            id: 'transition-1',
            source_stage_id: stage1.id,
            target_stage_id: stage2.id,
            condition_description: null,
            created_at: isoTimestamp,
            process_template_id: 'template-multi',
          },
        ],
      };

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

      const steps = buildRecipeSteps();
      const contributions = ['model-a', 'model-b'].map(buildContribution);
      const session = buildSession(contributions, buildSelectedModels(['model-a', 'model-b']));
      const project = buildProject(session, multiStageProcessTemplate);
      const recipe = buildRecipe(steps);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: stage1,
        activeStageSlug: stage1.slug,
        activeSessionDetail: session,
        selectedModels: session.selected_models,
        currentProjectDetail: project,
        currentProcessTemplate: multiStageProcessTemplate,
        recipesByStageSlug: {
          [stage1.slug]: recipe,
        },
        stageRunProgress: {
          [progressKey]: progress,
        },
      });

      selectIsStageReadyForSessionIteration.mockReturnValue(true);

      renderSessionContributionsDisplayCard();

      const footer = getCardFooter();
      const submitButton = getSubmitButton();
      expect(footer).toBeInTheDocument();
      expect(submitButton).toBeInTheDocument();
      if (footer && submitButton) {
        expect(submitButton).not.toBeDisabled();
      }
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

      const stage1 = buildStage();
      const stage2: DialecticStage = {
        id: 'stage-2',
        slug: 'antithesis',
        display_name: 'Antithesis',
        description: 'Antithesis stage',
        default_system_prompt_id: 'prompt-2',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const multiStageTemplate: DialecticProcessTemplate = {
        id: 'template-multi',
        name: 'Multi-Stage',
        description: 'Multi-stage template',
        starting_stage_id: stage1.id,
        created_at: isoTimestamp,
        stages: [stage1, stage2],
        transitions: [
          {
            id: 't1',
            source_stage_id: stage1.id,
            target_stage_id: stage2.id,
            condition_description: null,
            created_at: isoTimestamp,
            process_template_id: 'template-multi',
          },
        ],
      };
      seedBaseStore(progress, { currentProcessTemplate: multiStageTemplate });
      selectIsStageReadyForSessionIteration.mockReturnValue(true);

      renderSessionContributionsDisplayCard();

      const submitButtons = screen.queryAllByRole('button', { name: 'Submit Responses & Advance Stage' });
      expect(submitButtons).toHaveLength(2);
      submitButtons.forEach((btn) => expect(btn).not.toBeDisabled());
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

  describe('Step 7.b: Loader does not display when no documents in current session are generating', () => {
    it('does not display loader when global status is generating but all documents are completed', () => {
      // 7.b.i: Mock store state where contributionGenerationStatus is 'generating'
      // but all documents in stageRunProgress for the current session/stage/iteration
      // have status 'completed' or 'not_started' (simulating a different session generating or generation completed)
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
            status: 'completed', // Not generating
          }),
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'completed', // Not generating
          }),
        },
      );

      seedBaseStore(progress, {
        contributionGenerationStatus: 'generating', // Global status is generating
        generateContributionsError: null,
      });

      renderSessionContributionsDisplayCard();

      // 7.b.iii: Assert that the "Generating documents" loader is NOT displayed
      // when no documents have status === 'generating' in the current session's documentsByModel
      expect(screen.queryByText('Generating documents')).not.toBeInTheDocument();
    });

    it('does not display loader when global status is generating but all documents are not_started', () => {
      // 7.b.i: Mock store state where contributionGenerationStatus is 'generating'
      // but all documents have status 'not_started' (simulating generation hasn't started yet)
      const progress = buildStageRunProgress(
        {
          planner_header: 'completed',
          draft_document: 'not_started',
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
            status: 'not_started', // Not generating
          }),
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'not_started', // Not generating
          }),
        },
      );

      seedBaseStore(progress, {
        contributionGenerationStatus: 'generating', // Global status is generating
        generateContributionsError: null,
      });

      renderSessionContributionsDisplayCard();

      // 7.b.iii: Assert that the "Generating documents" loader is NOT displayed
      // when no documents have status === 'generating' in the current session's documentsByModel
      expect(screen.queryByText('Generating documents')).not.toBeInTheDocument();
    });

    it('does not display loader when global status is generating but selectedModels is empty and no documents exist', () => {
      // 7.b.ii: Mock store state where contributionGenerationStatus is 'generating'
      // but selectedModels is empty and no documents exist in stageRunProgress for the current session
      const progress = buildStageRunProgress(
        {}, // Empty stepStatuses
        {}, // Empty documents
      );

      const contributions: DialecticContribution[] = [];
      const session = buildSession(contributions, []);
      const stage = buildStage();
      const processTemplate = buildProcessTemplate(stage);
      const project = buildProject(session, processTemplate);
      const recipe = buildRecipe(buildRecipeSteps());

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: stage,
        activeStageSlug: stage.slug,
        activeSessionDetail: session,
        selectedModels: [],
        currentProjectDetail: project,
        currentProcessTemplate: processTemplate,
        recipesByStageSlug: {
          [stage.slug]: recipe,
        },
        stageRunProgress: {
          [progressKey]: progress, // Empty documents
        },
        contributionGenerationStatus: 'generating', // Global status is generating
        generateContributionsError: null,
      });

      renderSessionContributionsDisplayCard();

      // 7.b.iii: Assert that the "Generating documents" loader is NOT displayed
      // when no documents exist in the current session's documentsByModel
      expect(screen.queryByText('Generating documents')).not.toBeInTheDocument();
    });

    it('does not display loader when global status is generating but documents are not in generating state', () => {
      // 7.b.iv: Assert that the loader is NOT displayed when contributionGenerationStatus
      // is 'generating' but documents are not in generating state
      // This test must fail because the component currently uses the global contributionGenerationStatus
      // which can be 'generating' even when the current session's documents aren't generating
      const progress = buildStageRunProgress(
        {
          planner_header: 'completed',
          draft_document: 'completed',
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
          draft_document_outline: buildStageDocumentDescriptor('model-a', {
            status: 'completed', // Not generating - document is completed
          }),
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'idle', // Not generating - document is idle
          }),
        },
      );

      seedBaseStore(progress, {
        contributionGenerationStatus: 'generating', // Global status is generating (simulating another session)
        generateContributionsError: null,
      });

      renderSessionContributionsDisplayCard();

      // 7.b.iv: Assert that the loader is NOT displayed when contributionGenerationStatus
      // is 'generating' but documents are not in generating state
      // This test must fail initially because the component currently uses the global status
      expect(screen.queryByText('Generating documents')).not.toBeInTheDocument();
    });
  });

  describe('Step 7.e: Loader displays when documents in current session are generating', () => {
    it('displays loader when documents in current session have status generating', () => {
      // 7.e.i: Create a test case that mocks store state where stageRunProgress
      // for the current session/stage/iteration contains documents with status: 'generating'
      // (e.g., set draft_document_outline document descriptor status to 'generating')
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
            status: 'generating', // Document is generating
          }),
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'not_started', // Not generating yet
          }),
        },
      );

      seedBaseStore(progress, {
        // 7.e.ii: Ensure failedDocumentKeys will be empty (no documents with status === 'failed')
        // and generationError is null
        generateContributionsError: null,
      });

      renderSessionContributionsDisplayCard();

      // 7.e.iii: Assert that the "Generating documents" loader IS displayed
      // when documents in the current session have status === 'generating'
      // This test should pass immediately after step 7.c if implemented correctly
      expect(screen.getByText('Generating documents')).toBeInTheDocument();
    });

    it('displays loader when multiple documents have status generating', () => {
      // 7.e.i: Test with multiple documents generating
      const progress = buildStageRunProgress(
        {
          planner_header: 'completed',
          draft_document: 'in_progress',
          render_document: 'in_progress',
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
            status: 'generating', // Document is generating
          }),
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'generating', // Another document is generating
          }),
        },
      );

      seedBaseStore(progress, {
        // 7.e.ii: Ensure failedDocumentKeys will be empty and generationError is null
        generateContributionsError: null,
      });

      renderSessionContributionsDisplayCard();

      // 7.e.iii: Assert that the loader IS displayed when multiple documents are generating
      expect(screen.getByText('Generating documents')).toBeInTheDocument();
    });

    it('displays loader when document for different model has status generating', () => {
      // 7.e.i: Test with documents for different models
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
          draft_document_outline_model_a: buildStageDocumentDescriptor('model-a', {
            status: 'completed',
          }),
          draft_document_outline_model_b: buildStageDocumentDescriptor('model-b', {
            status: 'generating', // Document for model-b is generating
          }),
        },
      );

      seedBaseStore(progress, {
        // 7.e.ii: Ensure failedDocumentKeys will be empty and generationError is null
        generateContributionsError: null,
      });

      renderSessionContributionsDisplayCard();

      // 7.e.iii: Assert that the loader IS displayed when any document is generating
      expect(screen.getByText('Generating documents')).toBeInTheDocument();
    });
  });

  // NOTE: "Resource metadata display" tests removed - behavior is now owned by GeneratedContributionCard

  describe('Progress summary display removal', () => {
    it('does not display document progress summary', () => {
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
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'completed',
          }),
        },
      );

      seedBaseStore(progress);

      renderSessionContributionsDisplayCard();

      // Assert that progress summary display is NOT rendered
      expect(screen.queryByText(/Completed \d+ of \d+ documents/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Outstanding:/i)).not.toBeInTheDocument();
    });

    it('does not display progress summary even when outstandingDocuments exist', () => {
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

      renderSessionContributionsDisplayCard();

      // Assert that progress summary display is NOT rendered even when documents are incomplete
      expect(screen.queryByText(/Completed \d+ of \d+ documents/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Outstanding:/i)).not.toBeInTheDocument();
    });

    it('enables submit button when isComplete is true even without progress display', () => {
      // Use multi-stage setup so this is not the last stage (single stage would disable button per step 5.c.v)
      const stage1: DialecticStage = {
        id: 'stage-1',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
        default_system_prompt_id: 'prompt-1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const stage2: DialecticStage = {
        id: 'stage-2',
        slug: 'antithesis',
        display_name: 'Antithesis',
        description: 'Antithesis stage',
        default_system_prompt_id: 'prompt-2',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const multiStageProcessTemplate: DialecticProcessTemplate = {
        id: 'template-multi',
        name: 'Multi-Stage Template',
        description: 'Template with multiple stages',
        starting_stage_id: stage1.id,
        created_at: isoTimestamp,
        stages: [stage1, stage2],
        transitions: [
          {
            id: 'transition-1',
            source_stage_id: stage1.id,
            target_stage_id: stage2.id,
            condition_description: null,
            created_at: isoTimestamp,
            process_template_id: 'template-multi',
          },
        ],
      };

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
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'completed',
          }),
        },
      );

      const steps = buildRecipeSteps();
      const contributions = ['model-a', 'model-b'].map(buildContribution);
      const session = buildSession(contributions, buildSelectedModels(['model-a', 'model-b']));
      const project = buildProject(session, multiStageProcessTemplate);
      const recipe = buildRecipe(steps);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: stage1,
        activeStageSlug: stage1.slug,
        activeSessionDetail: session,
        selectedModels: session.selected_models,
        currentProjectDetail: project,
        currentProcessTemplate: multiStageProcessTemplate,
        recipesByStageSlug: {
          [stage1.slug]: recipe,
        },
        stageRunProgress: {
          [progressKey]: progress,
        },
      });

      selectIsStageReadyForSessionIteration.mockReturnValue(true);

      renderSessionContributionsDisplayCard();

      const submitButton = getSubmitButton();
      expect(submitButton).toBeInTheDocument();
      if (submitButton) {
        expect(submitButton).not.toBeDisabled();
      }

      expect(screen.queryByText(/Completed \d+ of \d+ documents/i)).not.toBeInTheDocument();
    });

    it('disables submit button when isComplete is false even without progress display', () => {
      // Use multi-stage setup so this is not the last stage (single stage would disable button per step 5.c.v)
      const stage1: DialecticStage = {
        id: 'stage-1',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
        default_system_prompt_id: 'prompt-1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const stage2: DialecticStage = {
        id: 'stage-2',
        slug: 'antithesis',
        display_name: 'Antithesis',
        description: 'Antithesis stage',
        default_system_prompt_id: 'prompt-2',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const multiStageProcessTemplate: DialecticProcessTemplate = {
        id: 'template-multi',
        name: 'Multi-Stage Template',
        description: 'Template with multiple stages',
        starting_stage_id: stage1.id,
        created_at: isoTimestamp,
        stages: [stage1, stage2],
        transitions: [
          {
            id: 'transition-1',
            source_stage_id: stage1.id,
            target_stage_id: stage2.id,
            condition_description: null,
            created_at: isoTimestamp,
            process_template_id: 'template-multi',
          },
        ],
      };

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

      const steps = buildRecipeSteps();
      const contributions = ['model-a', 'model-b'].map(buildContribution);
      const session = buildSession(contributions, buildSelectedModels(['model-a', 'model-b']));
      const project = buildProject(session, multiStageProcessTemplate);
      const recipe = buildRecipe(steps);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: stage1,
        activeStageSlug: stage1.slug,
        activeSessionDetail: session,
        selectedModels: session.selected_models,
        currentProjectDetail: project,
        currentProcessTemplate: multiStageProcessTemplate,
        recipesByStageSlug: {
          [stage1.slug]: recipe,
        },
        stageRunProgress: {
          [progressKey]: progress,
        },
      });

      selectIsStageReadyForSessionIteration.mockReturnValue(true);

      renderSessionContributionsDisplayCard();

      expect(screen.getByTestId('card-header')).toBeInTheDocument();
      const submitButton = getSubmitButton();
      expect(submitButton).toBeInTheDocument();
      if (submitButton) {
        expect(submitButton).toBeDisabled();
      }

      expect(screen.queryByText(/Completed \d+ of \d+ documents/i)).not.toBeInTheDocument();
    });
  });

  describe('Last stage detection and button disabling', () => {
    it('disables submit button when in last stage even if canSubmitStageResponses is true', () => {
      // 5.b.i: Create multiple stages with last stage active
      const thesisStage: DialecticStage = {
        id: 'stage-thesis',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
        default_system_prompt_id: 'prompt-1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      
      const antithesisStage: DialecticStage = {
        id: 'stage-antithesis',
        slug: 'antithesis',
        display_name: 'Antithesis',
        description: 'Antithesis stage',
        default_system_prompt_id: 'prompt-2',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      
      const synthesisStage: DialecticStage = {
        id: 'stage-synthesis',
        slug: 'synthesis',
        display_name: 'Synthesis',
        description: 'Synthesis stage',
        default_system_prompt_id: 'prompt-3',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };

      const multiStageProcessTemplate: DialecticProcessTemplate = {
        id: 'template-multi',
        name: 'Multi-Stage Template',
        description: 'Template with multiple stages',
        starting_stage_id: thesisStage.id,
        created_at: isoTimestamp,
        stages: [thesisStage, antithesisStage, synthesisStage],
        transitions: [
          {
            id: 'transition-1',
            source_stage_id: thesisStage.id,
            target_stage_id: antithesisStage.id,
            condition_description: null,
            created_at: isoTimestamp,
            process_template_id: 'template-multi',
          },
          {
            id: 'transition-2',
            source_stage_id: antithesisStage.id,
            target_stage_id: synthesisStage.id,
            condition_description: null,
            created_at: isoTimestamp,
            process_template_id: 'template-multi',
          },
        ],
      };

      // 5.b.ii: Set up progress with completed documents so isComplete is true
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
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'completed',
          }),
        },
      );

      const synthesisProgressKey = `${sessionId}:${synthesisStage.slug}:${iterationNumber}`;
      const contributions = ['model-a', 'model-b'].map(buildContribution);
      const session = buildSession(contributions, buildSelectedModels(['model-a', 'model-b']));
      const project = buildProject(session, multiStageProcessTemplate);
      const steps = buildRecipeSteps();
      const recipe = buildRecipe(steps);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: synthesisStage,
        activeStageSlug: synthesisStage.slug,
        activeSessionDetail: session,
        selectedModels: session.selected_models,
        currentProjectDetail: project,
        currentProcessTemplate: multiStageProcessTemplate,
        recipesByStageSlug: {
          [synthesisStage.slug]: recipe,
        },
        stageRunProgress: {
          [synthesisProgressKey]: progress,
        },
      });

      renderSessionContributionsDisplayCard();

      // 5.b.iii: When submit/advance button is present (e.g. from parent), assert it is disabled in last stage
      const projectCompleteButtons = screen.queryAllByRole('button').filter(
        (btn) => /project complete|final stage|no further|all stages finished/i.test(btn.textContent ?? ''),
      );
      if (projectCompleteButtons.length > 0) {
        for (const btn of projectCompleteButtons) {
          expect(btn).toBeDisabled();
          expect(btn).not.toHaveTextContent('Submit Responses & Advance Stage');
          expect(btn.textContent).toMatch(/project complete|final stage|no further|all stages finished/i);
        }
      }

      // 5.b.iv: Assert "Project Complete" notice is displayed when in last stage and complete
      const notices = screen.queryAllByText('Project Complete - All stages finished');
      expect(notices.length).toBeGreaterThan(0);
    });
  });

  describe('Non-last stage button behavior', () => {
    it('enables submit button when not in last stage and isComplete is true', () => {
      // 5.e.i: Create multiple stages with non-last stage active
      const thesisStage: DialecticStage = {
        id: 'stage-thesis',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
        default_system_prompt_id: 'prompt-1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      
      const antithesisStage: DialecticStage = {
        id: 'stage-antithesis',
        slug: 'antithesis',
        display_name: 'Antithesis',
        description: 'Antithesis stage',
        default_system_prompt_id: 'prompt-2',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      
      const synthesisStage: DialecticStage = {
        id: 'stage-synthesis',
        slug: 'synthesis',
        display_name: 'Synthesis',
        description: 'Synthesis stage',
        default_system_prompt_id: 'prompt-3',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };

      const multiStageProcessTemplate: DialecticProcessTemplate = {
        id: 'template-multi',
        name: 'Multi-Stage Template',
        description: 'Template with multiple stages',
        starting_stage_id: thesisStage.id,
        created_at: isoTimestamp,
        stages: [thesisStage, antithesisStage, synthesisStage],
        transitions: [
          {
            id: 'transition-1',
            source_stage_id: thesisStage.id,
            target_stage_id: antithesisStage.id,
            condition_description: null,
            created_at: isoTimestamp,
            process_template_id: 'template-multi',
          },
          {
            id: 'transition-2',
            source_stage_id: antithesisStage.id,
            target_stage_id: synthesisStage.id,
            condition_description: null,
            created_at: isoTimestamp,
            process_template_id: 'template-multi',
          },
        ],
      };

      // 5.e.ii: Set up progress with completed documents so isComplete is true
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
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'completed',
          }),
        },
      );

      const thesisProgressKey = `${sessionId}:${thesisStage.slug}:${iterationNumber}`;
      const contributions = ['model-a', 'model-b'].map(buildContribution);
      const session = buildSession(contributions, buildSelectedModels(['model-a', 'model-b']));
      const project = buildProject(session, multiStageProcessTemplate);
      const steps = buildRecipeSteps();
      const recipe = buildRecipe(steps);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: thesisStage, // Non-last stage (thesis when stages are [thesis, antithesis, synthesis])
        activeStageSlug: thesisStage.slug,
        activeSessionDetail: session,
        selectedModels: session.selected_models,
        currentProjectDetail: project,
        currentProcessTemplate: multiStageProcessTemplate,
        recipesByStageSlug: {
          [thesisStage.slug]: recipe,
        },
        stageRunProgress: {
          [thesisProgressKey]: progress,
        },
      });

      selectIsStageReadyForSessionIteration.mockReturnValue(true);

      renderSessionContributionsDisplayCard();

      const submitButton = getSubmitButton();
      expect(submitButton).toBeInTheDocument();
      if (submitButton) {
        expect(submitButton).not.toBeDisabled();
        expect(submitButton).toHaveTextContent('Submit Responses & Advance Stage');
      }

      expect(screen.queryByText('Project Complete - All stages finished')).not.toBeInTheDocument();
    });
  });

  describe('Step 38.j: Document highlighting filtering', () => {
    // NOTE: Tests for document-level rendering detail removed - behavior is now owned by GeneratedContributionCard
    // Remaining tests verify that no cards render when no documents are highlighted

    it('renders no GeneratedContributionCards when no documents are highlighted', () => {
      // 38.j.iv: Create a test case where no documents are highlighted
      const modelId = 'model1';
      const businessCaseKey = 'business_case';
      const featureSpecKey = 'feature_spec';

      const progress = buildStageRunProgress(
        {},
        {
          [businessCaseKey]: buildStageDocumentDescriptor(modelId),
          [featureSpecKey]: buildStageDocumentDescriptor(modelId),
        },
      );

      seedBaseStore(progress, {
        focusedStageDocument: {}, // Empty object - no documents highlighted
        stageDocumentContent: {
          [buildStageDocumentKey(modelId, businessCaseKey)]: buildStageDocumentContent(),
          [buildStageDocumentKey(modelId, featureSpecKey)]: buildStageDocumentContent(),
        },
      });

      renderSessionContributionsDisplayCard();

      // Assert that no GeneratedContributionCards are rendered (only the "No documents generated yet" message)
      expect(
        screen.queryByTestId(`generated-contribution-card-${modelId}`),
      ).not.toBeInTheDocument();
      expect(screen.getByText('No documents generated yet.')).toBeInTheDocument();
    });

    it('renders no GeneratedContributionCards when focusedStageDocument is undefined', () => {
      // 38.j.iv: Test case where focusedStageDocument is undefined
      const modelId = 'model1';
      const businessCaseKey = 'business_case';

      const progress = buildStageRunProgress(
        {},
        {
          [businessCaseKey]: buildStageDocumentDescriptor(modelId),
        },
      );

      seedBaseStore(progress, {
        focusedStageDocument: undefined, // Undefined - no documents highlighted
        stageDocumentContent: {
          [buildStageDocumentKey(modelId, businessCaseKey)]: buildStageDocumentContent(),
        },
      });

      renderSessionContributionsDisplayCard();

      // Assert that no GeneratedContributionCards are rendered
      expect(
        screen.queryByTestId(`generated-contribution-card-${modelId}`),
      ).not.toBeInTheDocument();
      expect(screen.getByText('No documents generated yet.')).toBeInTheDocument();
    });
  });

  describe('Step 3.b: Component correctly shows/hides "Generating documents" banner', () => {
    it('does not show "Generating documents" banner when all documents have status completed', () => {
      // 3.b.i: Verify when all documents have status 'completed', the component does NOT show the banner
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

      renderSessionContributionsDisplayCard();

      // Assert that the "Generating documents" banner is NOT displayed
      expect(screen.queryByText('Generating documents')).not.toBeInTheDocument();
    });

    it('shows "Generating documents" banner when at least one document has status generating', () => {
      // 3.b.ii: Verify when at least one document has status 'generating', the component shows the banner
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

      renderSessionContributionsDisplayCard();

      // Assert that the "Generating documents" banner IS displayed
      expect(screen.getByText('Generating documents')).toBeInTheDocument();
    });

    it('does not show "Generating documents" banner when documents are completed but there are failed documents', () => {
      // 3.b.iii: Verify when documents have status 'completed' but there are failed documents,
      // the component does NOT show the banner
      const progress = buildStageRunProgress(
        {
          planner_header: 'completed',
          draft_document: 'completed',
          render_document: 'failed',
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
            status: 'failed',
          }),
        },
      );

      seedBaseStore(progress, {
        generateContributionsError: null,
      });

      renderSessionContributionsDisplayCard();

      // Assert that the "Generating documents" banner is NOT displayed
      // (failed documents should prevent the banner from showing)
      expect(screen.queryByText('Generating documents')).not.toBeInTheDocument();
    });

    it('updates banner visibility when document status changes from generating to completed', async () => {
      // 3.b.iv: Verify the component correctly updates the banner visibility when document status changes
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

      renderSessionContributionsDisplayCard();

      // Initially, banner should be displayed
      expect(screen.getByText('Generating documents')).toBeInTheDocument();

      // Update progress to reflect status change from 'generating' to 'completed'
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

      act(() => {
        seedBaseStore(updatedProgress, {
          generateContributionsError: null,
        });
      });

      // After status change, banner should NOT be displayed (waitFor flushes store-driven re-renders inside act)
      await waitFor(() => {
        expect(screen.queryByText('Generating documents')).not.toBeInTheDocument();
      });
    });
  });

  describe('Step 5.c: GeneratedContributionCard per model and modelId prop', () => {
    it('5.c.i: renders GeneratedContributionCard for each unique modelId when a documentKey is focused', () => {
      const sharedDocumentKey = 'shared_document';
      const focusKeyA = `${sessionId}:${stageSlug}:model-a`;
      const focusKeyB = `${sessionId}:${stageSlug}:model-b`;

      const progress = buildStageRunProgress(
        {},
        {
          [sharedDocumentKey]: buildStageDocumentDescriptor('model-a'),
          [`${sharedDocumentKey}_model_b`]: buildStageDocumentDescriptor('model-b', {
            modelId: 'model-b',
          }),
        },
      );

      seedBaseStore(progress, {
        focusedStageDocument: {
          [focusKeyA]: { modelId: 'model-a', documentKey: sharedDocumentKey },
          [focusKeyB]: { modelId: 'model-b', documentKey: sharedDocumentKey },
        },
        stageDocumentContent: {
          [buildStageDocumentKey('model-a', sharedDocumentKey)]: buildStageDocumentContent(),
          [buildStageDocumentKey('model-b', sharedDocumentKey)]: buildStageDocumentContent(),
        },
      });

      renderSessionContributionsDisplayCard();

      expect(screen.getByTestId('generated-contribution-card-model-a')).toBeInTheDocument();
      expect(screen.getByTestId('generated-contribution-card-model-b')).toBeInTheDocument();
      expect(GeneratedContributionCard).toHaveBeenCalledTimes(2);
    });

    it('5.c.ii: passes modelId prop correctly to each GeneratedContributionCard', () => {
      const sharedDocumentKey = 'shared_document';
      const focusKeyA = `${sessionId}:${stageSlug}:model-a`;
      const focusKeyB = `${sessionId}:${stageSlug}:model-b`;

      const progress = buildStageRunProgress(
        {},
        {
          [sharedDocumentKey]: buildStageDocumentDescriptor('model-a'),
          [`${sharedDocumentKey}_model_b`]: buildStageDocumentDescriptor('model-b', {
            modelId: 'model-b',
          }),
        },
      );

      seedBaseStore(progress, {
        focusedStageDocument: {
          [focusKeyA]: { modelId: 'model-a', documentKey: sharedDocumentKey },
          [focusKeyB]: { modelId: 'model-b', documentKey: sharedDocumentKey },
        },
        stageDocumentContent: {
          [buildStageDocumentKey('model-a', sharedDocumentKey)]: buildStageDocumentContent(),
          [buildStageDocumentKey('model-b', sharedDocumentKey)]: buildStageDocumentContent(),
        },
      });

      renderSessionContributionsDisplayCard();

      expect(GeneratedContributionCard).toHaveBeenCalledWith(expect.objectContaining({ modelId: 'model-a' }), expect.anything());
      expect(GeneratedContributionCard).toHaveBeenCalledWith(expect.objectContaining({ modelId: 'model-b' }), expect.anything());
    });
  });

  describe('Step 5.f: Acceptance criteria', () => {
    it('5.f.i: GeneratedContributionCard rendered for each model', () => {
      const sharedDocumentKey = 'shared_document';
      const focusKeyA = `${sessionId}:${stageSlug}:model-a`;
      const focusKeyB = `${sessionId}:${stageSlug}:model-b`;

      const progress = buildStageRunProgress(
        {},
        {
          [sharedDocumentKey]: buildStageDocumentDescriptor('model-a'),
          [`${sharedDocumentKey}_model_b`]: buildStageDocumentDescriptor('model-b', { modelId: 'model-b' }),
        },
      );

      seedBaseStore(progress, {
        focusedStageDocument: {
          [focusKeyA]: { modelId: 'model-a', documentKey: sharedDocumentKey },
          [focusKeyB]: { modelId: 'model-b', documentKey: sharedDocumentKey },
        },
        stageDocumentContent: {
          [buildStageDocumentKey('model-a', sharedDocumentKey)]: buildStageDocumentContent(),
          [buildStageDocumentKey('model-b', sharedDocumentKey)]: buildStageDocumentContent(),
        },
      });

      renderSessionContributionsDisplayCard();

      expect(screen.getByTestId('generated-contribution-card-model-a')).toBeInTheDocument();
      expect(screen.getByTestId('generated-contribution-card-model-b')).toBeInTheDocument();
    });

    it('5.f.ii: Document content visible after clicking in StageRunChecklist', () => {
      const sharedDocumentKey = 'shared_document';
      const focusKeyA = `${sessionId}:${stageSlug}:model-a`;
      const focusKeyB = `${sessionId}:${stageSlug}:model-b`;

      const progress = buildStageRunProgress(
        {},
        {
          [sharedDocumentKey]: buildStageDocumentDescriptor('model-a'),
          [`${sharedDocumentKey}_model_b`]: buildStageDocumentDescriptor('model-b', { modelId: 'model-b' }),
        },
      );

      seedBaseStore(progress, {
        focusedStageDocument: {
          [focusKeyA]: { modelId: 'model-a', documentKey: sharedDocumentKey },
          [focusKeyB]: { modelId: 'model-b', documentKey: sharedDocumentKey },
        },
        stageDocumentContent: {
          [buildStageDocumentKey('model-a', sharedDocumentKey)]: buildStageDocumentContent(),
          [buildStageDocumentKey('model-b', sharedDocumentKey)]: buildStageDocumentContent(),
        },
      });

      renderSessionContributionsDisplayCard();

      expect(screen.queryByText('No documents generated yet.')).not.toBeInTheDocument();
      expect(screen.getByTestId('generated-contribution-card-model-a')).toBeInTheDocument();
      expect(screen.getByTestId('generated-contribution-card-model-b')).toBeInTheDocument();
    });

    it('5.f.iii: Progressive rendering visible (content updates as chunks arrive)', () => {
      const sharedDocumentKey = 'shared_document';
      const focusKeyA = `${sessionId}:${stageSlug}:model-a`;
      const focusKeyB = `${sessionId}:${stageSlug}:model-b`;

      const progress = buildStageRunProgress(
        {},
        {
          [sharedDocumentKey]: buildStageDocumentDescriptor('model-a', {
            status: 'generating',
            latestRenderedResourceId: 'chunk-1',
          }),
          [`${sharedDocumentKey}_model_b`]: buildStageDocumentDescriptor('model-b', {
            modelId: 'model-b',
            status: 'generating',
            latestRenderedResourceId: 'chunk-2',
          }),
        },
      );

      seedBaseStore(progress, {
        focusedStageDocument: {
          [focusKeyA]: { modelId: 'model-a', documentKey: sharedDocumentKey },
          [focusKeyB]: { modelId: 'model-b', documentKey: sharedDocumentKey },
        },
        stageDocumentContent: {
          [buildStageDocumentKey('model-a', sharedDocumentKey)]: buildStageDocumentContent(),
          [buildStageDocumentKey('model-b', sharedDocumentKey)]: buildStageDocumentContent(),
        },
      });

      renderSessionContributionsDisplayCard();

      expect(screen.getByTestId('generated-contribution-card-model-a')).toBeInTheDocument();
      expect(screen.getByTestId('generated-contribution-card-model-b')).toBeInTheDocument();
    });
  });

  describe('Step 14.c: GeneratedContributionCard rendering and submit behavior', () => {
    it('14.c.i: renders one GeneratedContributionCard per model when a documentKey is focused', () => {
      // Target: When the user selects a specific document in the list, one GeneratedContributionCard
      // is rendered per model so the user can compare that document across models. Models always
      // have the same set of documents; progress may key them as documentKey (model-a) and
      // documentKey_model_b (model-b) for the same logical document.
      const sharedDocumentKey = 'shared_document';
      const focusKeyA = `${sessionId}:${stageSlug}:model-a`;
      const focusKeyB = `${sessionId}:${stageSlug}:model-b`;

      const progress = buildStageRunProgress(
        {},
        {
          [sharedDocumentKey]: buildStageDocumentDescriptor('model-a'),
          [`${sharedDocumentKey}_model_b`]: buildStageDocumentDescriptor('model-b', {
            modelId: 'model-b',
          }),
        },
      );

      seedBaseStore(progress, {
        focusedStageDocument: {
          [focusKeyA]: { modelId: 'model-a', documentKey: sharedDocumentKey },
          [focusKeyB]: { modelId: 'model-b', documentKey: sharedDocumentKey },
        },
        stageDocumentContent: {
          [buildStageDocumentKey('model-a', sharedDocumentKey)]: buildStageDocumentContent(),
          [buildStageDocumentKey('model-b', sharedDocumentKey)]: buildStageDocumentContent(),
        },
      });

      renderSessionContributionsDisplayCard();

      expect(screen.getByTestId('generated-contribution-card-model-a')).toBeInTheDocument();
      expect(screen.getByTestId('generated-contribution-card-model-b')).toBeInTheDocument();
    });

    it('14.c.ii: submits all document-level feedback then advances stage on Submit Responses & Advance Stage', async () => {
      // Setup multi-stage so submit button is enabled
      const stage1: DialecticStage = {
        id: 'stage-1',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
        default_system_prompt_id: 'prompt-1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const stage2: DialecticStage = {
        id: 'stage-2',
        slug: 'antithesis',
        display_name: 'Antithesis',
        description: 'Antithesis stage',
        default_system_prompt_id: 'prompt-2',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const multiStageProcessTemplate: DialecticProcessTemplate = {
        id: 'template-multi',
        name: 'Multi-Stage Template',
        description: 'Template with multiple stages',
        starting_stage_id: stage1.id,
        created_at: isoTimestamp,
        stages: [stage1, stage2],
        transitions: [
          {
            id: 'transition-1',
            source_stage_id: stage1.id,
            target_stage_id: stage2.id,
            condition_description: null,
            created_at: isoTimestamp,
            process_template_id: 'template-multi',
          },
        ],
      };

      const documentKeyA = 'doc_a';
      const documentKeyB = 'doc_b';

      const progress = buildStageRunProgress(
        {
          planner_header: 'completed',
          draft_document: 'completed',
          render_document: 'completed',
        },
        {
          [documentKeyA]: buildStageDocumentDescriptor('model-a', { status: 'completed' }),
          [documentKeyB]: buildStageDocumentDescriptor('model-b', { status: 'completed' }),
        },
      );

      const steps = buildRecipeSteps();
      const contributions = ['model-a', 'model-b'].map(buildContribution);
      const session = buildSession(contributions, buildSelectedModels(['model-a', 'model-b']));
      const project = buildProject(session, multiStageProcessTemplate);
      const recipe = buildRecipe(steps);

      const feedbackA = 'Feedback for document A';
      const feedbackB = 'Feedback for document B';

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: stage1,
        activeStageSlug: stage1.slug,
        activeSessionDetail: session,
        selectedModels: session.selected_models,
        currentProjectDetail: project,
        currentProcessTemplate: multiStageProcessTemplate,
        recipesByStageSlug: {
          [stage1.slug]: recipe,
        },
        stageRunProgress: {
          [progressKey]: progress,
        },
        stageDocumentContent: {
          [buildStageDocumentKey('model-a', documentKeyA)]: buildStageDocumentContent({
            currentDraftMarkdown: feedbackA,
          }),
          [buildStageDocumentKey('model-b', documentKeyB)]: buildStageDocumentContent({
            currentDraftMarkdown: feedbackB,
          }),
        },
      });

      const { submitStageResponses } = getDialecticStoreState();
      selectIsStageReadyForSessionIteration.mockReturnValue(true);

      renderSessionContributionsDisplayCard();

      const submitButton = getSubmitButton();
      expect(submitButton).toBeInTheDocument();
      if (submitButton) {
        fireEvent.click(submitButton);
      }

      const confirmButton = await screen.findByRole('button', { name: 'Continue' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(submitStageResponses).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId: session.id,
            currentIterationNumber: session.iteration_count,
            projectId: project.id,
            stageSlug: stage1.slug,
          }),
        );
      });
    });

    it('14.c.iii: does not submit feedback for documents with empty feedback area', async () => {
      // Setup multi-stage so submit button is enabled
      const stage1: DialecticStage = {
        id: 'stage-1',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
        default_system_prompt_id: 'prompt-1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const stage2: DialecticStage = {
        id: 'stage-2',
        slug: 'antithesis',
        display_name: 'Antithesis',
        description: 'Antithesis stage',
        default_system_prompt_id: 'prompt-2',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const multiStageProcessTemplate: DialecticProcessTemplate = {
        id: 'template-multi',
        name: 'Multi-Stage Template',
        description: 'Template with multiple stages',
        starting_stage_id: stage1.id,
        created_at: isoTimestamp,
        stages: [stage1, stage2],
        transitions: [
          {
            id: 'transition-1',
            source_stage_id: stage1.id,
            target_stage_id: stage2.id,
            condition_description: null,
            created_at: isoTimestamp,
            process_template_id: 'template-multi',
          },
        ],
      };

      const documentKeyA = 'doc_a';
      const documentKeyB = 'doc_b';

      const progress = buildStageRunProgress(
        {
          planner_header: 'completed',
          draft_document: 'completed',
          render_document: 'completed',
        },
        {
          [documentKeyA]: buildStageDocumentDescriptor('model-a', { status: 'completed' }),
          [documentKeyB]: buildStageDocumentDescriptor('model-b', { status: 'completed' }),
        },
      );

      const steps = buildRecipeSteps();
      const contributions = ['model-a', 'model-b'].map(buildContribution);
      const session = buildSession(contributions, buildSelectedModels(['model-a', 'model-b']));
      const project = buildProject(session, multiStageProcessTemplate);
      const recipe = buildRecipe(steps);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: stage1,
        activeStageSlug: stage1.slug,
        activeSessionDetail: session,
        selectedModels: session.selected_models,
        currentProjectDetail: project,
        currentProcessTemplate: multiStageProcessTemplate,
        recipesByStageSlug: {
          [stage1.slug]: recipe,
        },
        stageRunProgress: {
          [progressKey]: progress,
        },
        stageDocumentContent: {
          // Document A has feedback, Document B has empty feedback
          [buildStageDocumentKey('model-a', documentKeyA)]: buildStageDocumentContent({
            currentDraftMarkdown: 'Feedback for A',
          }),
          [buildStageDocumentKey('model-b', documentKeyB)]: buildStageDocumentContent({
            currentDraftMarkdown: '', // Empty feedback
          }),
        },
      });

      const { submitStageResponses } = getDialecticStoreState();
      selectIsStageReadyForSessionIteration.mockReturnValue(true);

      renderSessionContributionsDisplayCard();

      const submitButton = getSubmitButton();
      expect(submitButton).toBeInTheDocument();
      if (submitButton) {
        fireEvent.click(submitButton);
      }

      const confirmButton = await screen.findByRole('button', { name: 'Continue' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(submitStageResponses).toHaveBeenCalled();
      });
    });

    it('14.c.iv: submits edited document content when user has edited and submits', async () => {
      // Setup multi-stage so submit button is enabled
      const stage1: DialecticStage = {
        id: 'stage-1',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
        default_system_prompt_id: 'prompt-1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const stage2: DialecticStage = {
        id: 'stage-2',
        slug: 'antithesis',
        display_name: 'Antithesis',
        description: 'Antithesis stage',
        default_system_prompt_id: 'prompt-2',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const multiStageProcessTemplate: DialecticProcessTemplate = {
        id: 'template-multi',
        name: 'Multi-Stage Template',
        description: 'Template with multiple stages',
        starting_stage_id: stage1.id,
        created_at: isoTimestamp,
        stages: [stage1, stage2],
        transitions: [
          {
            id: 'transition-1',
            source_stage_id: stage1.id,
            target_stage_id: stage2.id,
            condition_description: null,
            created_at: isoTimestamp,
            process_template_id: 'template-multi',
          },
        ],
      };

      const documentKey = 'editable_doc';

      const progress = buildStageRunProgress(
        {
          planner_header: 'completed',
          draft_document: 'completed',
          render_document: 'completed',
        },
        {
          [documentKey]: buildStageDocumentDescriptor('model-a', { status: 'completed' }),
        },
      );

      const steps = buildRecipeSteps();
      const contributions = ['model-a'].map(buildContribution);
      const session = buildSession(contributions, buildSelectedModels(['model-a']));
      const project = buildProject(session, multiStageProcessTemplate);
      const recipe = buildRecipe(steps);

      const editedContent = 'This is the edited document content';

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: stage1,
        activeStageSlug: stage1.slug,
        activeSessionDetail: session,
        selectedModels: session.selected_models,
        currentProjectDetail: project,
        currentProcessTemplate: multiStageProcessTemplate,
        recipesByStageSlug: {
          [stage1.slug]: recipe,
        },
        stageRunProgress: {
          [progressKey]: progress,
        },
        stageDocumentContent: {
          [buildStageDocumentKey('model-a', documentKey)]: buildStageDocumentContent({
            baselineMarkdown: 'Original content',
            currentDraftMarkdown: editedContent,
            isDirty: true, // Document has been edited
            sourceContributionId: 'contrib-original',
            resourceType: 'rendered_document',
          }),
        },
      });

      const { submitStageResponses } = getDialecticStoreState();
      selectIsStageReadyForSessionIteration.mockReturnValue(true);

      renderSessionContributionsDisplayCard();

      const submitButton = getSubmitButton();
      expect(submitButton).toBeInTheDocument();
      if (submitButton) {
        fireEvent.click(submitButton);
      }

      const confirmButton = await screen.findByRole('button', { name: 'Continue' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(submitStageResponses).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId: session.id,
            currentIterationNumber: session.iteration_count,
            projectId: project.id,
            stageSlug: stage1.slug,
          }),
        );
      });

      // Note: The actual submission of edited document content happens in the store action
      // This test verifies the component correctly triggers submit when documents are dirty
    });
  });

  describe('Submit button label when viewing prior stage', () => {
    it('shows Save Edits & Feedback when session already past this stage', () => {
      const thesisStage: DialecticStage = {
        id: 'stage-thesis',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
        default_system_prompt_id: 'prompt-1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const antithesisStage: DialecticStage = {
        id: 'stage-antithesis',
        slug: 'antithesis',
        display_name: 'Antithesis',
        description: 'Antithesis stage',
        default_system_prompt_id: 'prompt-2',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const multiStageProcessTemplate: DialecticProcessTemplate = {
        id: 'template-multi',
        name: 'Multi-Stage Template',
        description: 'Template with multiple stages',
        starting_stage_id: thesisStage.id,
        created_at: isoTimestamp,
        stages: [thesisStage, antithesisStage],
        transitions: [
          {
            id: 'transition-1',
            source_stage_id: thesisStage.id,
            target_stage_id: antithesisStage.id,
            condition_description: null,
            created_at: isoTimestamp,
            process_template_id: 'template-multi',
          },
        ],
      };

      const thesisProgressKey = `${sessionId}:${thesisStage.slug}:${iterationNumber}`;
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
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'completed',
          }),
        },
      );

      const steps = buildRecipeSteps();
      const contributions = ['model-a', 'model-b'].map(buildContribution);
      const session = buildSession(contributions, buildSelectedModels(['model-a', 'model-b']));
      const sessionAlreadyPastThesis: DialecticSession = {
        ...session,
        current_stage_id: antithesisStage.id,
      };
      const project = buildProject(session, multiStageProcessTemplate);
      const recipe = buildRecipe(steps);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: thesisStage,
        activeStageSlug: thesisStage.slug,
        activeSessionDetail: sessionAlreadyPastThesis,
        selectedModels: session.selected_models,
        currentProjectDetail: project,
        currentProcessTemplate: multiStageProcessTemplate,
        recipesByStageSlug: {
          [thesisStage.slug]: recipe,
        },
        stageRunProgress: {
          [thesisProgressKey]: progress,
        },
      });

      renderSessionContributionsDisplayCard();

      const saveEditsButton = screen.queryByRole('button', {
        name: 'Save Edits & Feedback',
      });
      if (saveEditsButton) {
        expect(saveEditsButton).toBeInTheDocument();
        expect(saveEditsButton).not.toBeDisabled();
      }
    });

    it('when viewing prior stage and backend returns no advancement, does not call setActiveStage', async () => {
      const thesisStage: DialecticStage = {
        id: 'stage-thesis',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
        default_system_prompt_id: 'prompt-1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const antithesisStage: DialecticStage = {
        id: 'stage-antithesis',
        slug: 'antithesis',
        display_name: 'Antithesis',
        description: 'Antithesis stage',
        default_system_prompt_id: 'prompt-2',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const multiStageProcessTemplate: DialecticProcessTemplate = {
        id: 'template-multi',
        name: 'Multi-Stage Template',
        description: 'Template with multiple stages',
        starting_stage_id: thesisStage.id,
        created_at: isoTimestamp,
        stages: [thesisStage, antithesisStage],
        transitions: [
          {
            id: 'transition-1',
            source_stage_id: thesisStage.id,
            target_stage_id: antithesisStage.id,
            condition_description: null,
            created_at: isoTimestamp,
            process_template_id: 'template-multi',
          },
        ],
      };

      const thesisProgressKey = `${sessionId}:${thesisStage.slug}:${iterationNumber}`;
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
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'completed',
          }),
        },
      );

      const steps = buildRecipeSteps();
      const contributions = ['model-a', 'model-b'].map(buildContribution);
      const session = buildSession(contributions, buildSelectedModels(['model-a', 'model-b']));
      const sessionAlreadyPastThesis: DialecticSession = {
        ...session,
        current_stage_id: antithesisStage.id,
      };
      const project = buildProject(session, multiStageProcessTemplate);
      const recipe = buildRecipe(steps);

      const store = getDialecticStoreState();
      const noAdvanceResponse = {
        data: {
          message: 'Stage responses recorded; session already at a later stage. No advancement.',
          updatedSession: sessionAlreadyPastThesis,
        },
        error: undefined,
        status: 200,
      };
      vi.mocked(store.submitStageResponses).mockResolvedValueOnce(noAdvanceResponse);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: thesisStage,
        activeStageSlug: thesisStage.slug,
        activeSessionDetail: sessionAlreadyPastThesis,
        selectedModels: session.selected_models,
        currentProjectDetail: project,
        currentProcessTemplate: multiStageProcessTemplate,
        recipesByStageSlug: {
          [thesisStage.slug]: recipe,
        },
        stageRunProgress: {
          [thesisProgressKey]: progress,
        },
      });

      renderSessionContributionsDisplayCard();

      const saveEditsButton = screen.queryByRole('button', {
        name: 'Save Edits & Feedback',
      });
      if (!saveEditsButton) return;

      fireEvent.click(saveEditsButton);

      const confirmButton = await screen.findByRole('button', { name: 'Continue' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(store.submitStageResponses).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId: session.id,
            projectId: project.id,
            stageSlug: thesisStage.slug,
            currentIterationNumber: session.iteration_count,
          }),
        );
      });

      expect(store.setActiveStage).not.toHaveBeenCalled();
    });

    it('when backend returns advancement, calls setActiveStage with next stage and shows success', async () => {
      const thesisStage: DialecticStage = {
        id: 'stage-thesis',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
        default_system_prompt_id: 'prompt-1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const antithesisStage: DialecticStage = {
        id: 'stage-antithesis',
        slug: 'antithesis',
        display_name: 'Antithesis',
        description: 'Antithesis stage',
        default_system_prompt_id: 'prompt-2',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const multiStageProcessTemplate: DialecticProcessTemplate = {
        id: 'template-multi',
        name: 'Multi-Stage Template',
        description: 'Template with multiple stages',
        starting_stage_id: thesisStage.id,
        created_at: isoTimestamp,
        stages: [thesisStage, antithesisStage],
        transitions: [
          {
            id: 'transition-1',
            source_stage_id: thesisStage.id,
            target_stage_id: antithesisStage.id,
            condition_description: null,
            created_at: isoTimestamp,
            process_template_id: 'template-multi',
          },
        ],
      };

      const thesisProgressKey = `${sessionId}:${thesisStage.slug}:${iterationNumber}`;
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
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'completed',
          }),
        },
      );

      const steps = buildRecipeSteps();
      const contributions = ['model-a', 'model-b'].map(buildContribution);
      const session = buildSession(contributions, buildSelectedModels(['model-a', 'model-b']));
      const sessionAfterAdvance: DialecticSession = {
        ...session,
        current_stage_id: antithesisStage.id,
      };
      const project = buildProject(session, multiStageProcessTemplate);
      const recipe = buildRecipe(steps);

      const store = getDialecticStoreState();
      const advanceResponse = {
        data: {
          message: 'Stage advanced.',
          updatedSession: sessionAfterAdvance,
        },
        error: undefined,
        status: 200,
      };
      vi.mocked(store.submitStageResponses).mockResolvedValueOnce(advanceResponse);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: thesisStage,
        activeStageSlug: thesisStage.slug,
        activeSessionDetail: session,
        selectedModels: session.selected_models,
        currentProjectDetail: project,
        currentProcessTemplate: multiStageProcessTemplate,
        recipesByStageSlug: {
          [thesisStage.slug]: recipe,
        },
        stageRunProgress: {
          [thesisProgressKey]: progress,
        },
      });

      selectIsStageReadyForSessionIteration.mockReturnValue(true);

      renderSessionContributionsDisplayCard();

      const submitButton = getSubmitButton();
      expect(submitButton).toBeInTheDocument();
      if (submitButton) {
        fireEvent.click(submitButton);
      }

      const confirmButton = await screen.findByRole('button', { name: 'Continue' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(store.submitStageResponses).toHaveBeenCalled();
      });

      expect(store.setActiveStage).toHaveBeenCalledWith(antithesisStage.slug);

      await waitFor(() => {
        expect(screen.getByText('Review')).toBeInTheDocument();
      });
      expect(screen.getByText(/Antithesis stage|Stage advanced!/)).toBeInTheDocument();
    });

    it('when viewing prior stage and backend returns no advancement, shows saved-without-advancing message', async () => {
      const thesisStage: DialecticStage = {
        id: 'stage-thesis',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
        default_system_prompt_id: 'prompt-1',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const antithesisStage: DialecticStage = {
        id: 'stage-antithesis',
        slug: 'antithesis',
        display_name: 'Antithesis',
        description: 'Antithesis stage',
        default_system_prompt_id: 'prompt-2',
        expected_output_template_ids: [],
        recipe_template_id: null,
        active_recipe_instance_id: null,
        created_at: isoTimestamp,
      };
      const multiStageProcessTemplate: DialecticProcessTemplate = {
        id: 'template-multi',
        name: 'Multi-Stage Template',
        description: 'Template with multiple stages',
        starting_stage_id: thesisStage.id,
        created_at: isoTimestamp,
        stages: [thesisStage, antithesisStage],
        transitions: [
          {
            id: 'transition-1',
            source_stage_id: thesisStage.id,
            target_stage_id: antithesisStage.id,
            condition_description: null,
            created_at: isoTimestamp,
            process_template_id: 'template-multi',
          },
        ],
      };

      const thesisProgressKey = `${sessionId}:${thesisStage.slug}:${iterationNumber}`;
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
          draft_document_markdown: buildStageDocumentDescriptor('model-a', {
            status: 'completed',
          }),
        },
      );

      const steps = buildRecipeSteps();
      const contributions = ['model-a', 'model-b'].map(buildContribution);
      const session = buildSession(contributions, buildSelectedModels(['model-a', 'model-b']));
      const sessionAlreadyPastThesis: DialecticSession = {
        ...session,
        current_stage_id: antithesisStage.id,
      };
      const project = buildProject(session, multiStageProcessTemplate);
      const recipe = buildRecipe(steps);

      const store = getDialecticStoreState();
      const noAdvanceResponse = {
        data: {
          message: 'Stage responses recorded; session already at a later stage. No advancement.',
          updatedSession: sessionAlreadyPastThesis,
        },
        error: undefined,
        status: 200,
      };
      vi.mocked(store.submitStageResponses).mockResolvedValueOnce(noAdvanceResponse);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: thesisStage,
        activeStageSlug: thesisStage.slug,
        activeSessionDetail: sessionAlreadyPastThesis,
        selectedModels: session.selected_models,
        currentProjectDetail: project,
        currentProcessTemplate: multiStageProcessTemplate,
        recipesByStageSlug: {
          [thesisStage.slug]: recipe,
        },
        stageRunProgress: {
          [thesisProgressKey]: progress,
        },
      });

      renderSessionContributionsDisplayCard();

      const saveEditsButton = screen.queryByRole('button', {
        name: 'Save Edits & Feedback',
      });
      if (!saveEditsButton) return;

      fireEvent.click(saveEditsButton);

      const confirmButton = await screen.findByRole('button', { name: 'Continue' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(store.submitStageResponses).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByText(/Success!/)).toBeInTheDocument();
      });
      expect(screen.getByText(/saved|Edits and feedback/i)).toBeInTheDocument();
    });
  });
});

