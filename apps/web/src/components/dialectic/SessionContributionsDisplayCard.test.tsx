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
  EditedDocumentResource,
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

const buildEditedDocumentResource = (
  documentKey: string,
  overrides: Partial<EditedDocumentResource> = {},
): EditedDocumentResource => ({
  id: `resource-${documentKey}`,
  resource_type: 'rendered_document',
  project_id: projectId,
  session_id: sessionId,
  stage_slug: stageSlug,
  iteration_number: iterationNumber,
  document_key: documentKey,
  source_contribution_id: `contrib-source-${documentKey}`,
  storage_bucket: 'bucket',
  storage_path: `path/${documentKey}.md`,
  file_name: `${documentKey}.md`,
  mime_type: 'text/markdown',
  size_bytes: 2048,
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  ...overrides,
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
        focusedStageDocument: {
          [`${sessionId}:${stageSlug}:model-a`]: {
            modelId: 'model-a',
            documentKey: 'draft_document_outline_model_a',
          },
          [`${sessionId}:${stageSlug}:model-b`]: {
            modelId: 'model-b',
            documentKey: 'draft_document_outline_model_b',
          },
        },
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
        focusedStageDocument: {
          [`${sessionId}:${stageSlug}:model-a`]: {
            modelId: 'model-a',
            documentKey,
          },
        },
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
      const session = buildSession(contributions, ['model-a', 'model-b']);
      const project = buildProject(session, multiStageProcessTemplate);
      const recipe = buildRecipe(steps);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: stage1,
        activeStageSlug: stage1.slug,
        activeSessionDetail: session,
        selectedModelIds: session.selected_model_ids ?? [],
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

      const header = screen.getByTestId('card-header');
      expect(
        within(header).getByRole('button', { name: 'Submit Responses & Advance Stage' }),
      ).toBeDisabled();
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
      const session = buildSession(contributions, ['model-a', 'model-b']);
      const project = buildProject(session, multiStageProcessTemplate);
      const recipe = buildRecipe(steps);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: stage1,
        activeStageSlug: stage1.slug,
        activeSessionDetail: session,
        selectedModelIds: session.selected_model_ids ?? [],
        currentProjectDetail: project,
        currentProcessTemplate: multiStageProcessTemplate,
        recipesByStageSlug: {
          [stage1.slug]: recipe,
        },
        stageRunProgress: {
          [progressKey]: progress,
        },
      });

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

    it('does not display loader when global status is generating but selectedModelIds is empty and no documents exist', () => {
      // 7.b.ii: Mock store state where contributionGenerationStatus is 'generating'
      // but selectedModelIds is empty and no documents exist in stageRunProgress for the current session
      const progress = buildStageRunProgress(
        {}, // Empty stepStatuses
        {}, // Empty documents
      );

      const contributions: DialecticContribution[] = [];
      const session = buildSession(contributions, []); // Empty selectedModelIds
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
        selectedModelIds: [], // Empty
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

  describe('Resource metadata display', () => {
    it('renders document resource metadata including source_contribution_id and updated_at', () => {
      const documentKey = 'draft_document_outline_model_a';
      const sourceContributionId = 'contrib-source-123';
      const updatedAt = '2024-01-15T10:30:00.000Z';
      
      const progress = buildStageRunProgress(
        {},
        {
          [documentKey]: buildStageDocumentDescriptor('model-a'),
        },
      );

      const mockResourceMetadata = buildEditedDocumentResource(documentKey, {
        source_contribution_id: sourceContributionId,
        updated_at: updatedAt,
      });

      seedBaseStore(progress, {
        focusedStageDocument: {
          [`${sessionId}:${stageSlug}:model-a`]: {
            modelId: 'model-a',
            documentKey,
          },
        },
        stageDocumentContent: {
          [buildStageDocumentKey('model-a', documentKey)]: buildStageDocumentContent(),
        },
        stageDocumentResources: {
          [buildStageDocumentKey('model-a', documentKey)]: mockResourceMetadata,
        },
      });

      renderSessionContributionsDisplayCard();

      const card = screen.getByTestId(`stage-document-card-model-a-${documentKey}`);
      expect(card).toBeInTheDocument();
      
      // Assert resource metadata is displayed within the specific card
      // Text is split across multiple elements, so we use a function matcher scoped to the card
      // Use getAllByText since parent elements also match, then check that at least one exists
      const cardQueries = within(card);
      const sourceContributionMatches = cardQueries.getAllByText((_content, element) => {
        const hasText = element?.textContent?.includes(`Source Contribution: ${sourceContributionId}`);
        return hasText === true;
      });
      expect(sourceContributionMatches.length).toBeGreaterThan(0);
      
      const formattedDate = new Date(updatedAt).toLocaleString();
      const lastModifiedMatches = cardQueries.getAllByText((_content, element) => {
        const hasText = element?.textContent?.includes(`Last Modified: ${formattedDate}`);
        return hasText === true;
      });
      expect(lastModifiedMatches.length).toBeGreaterThan(0);
    });

    it('displays resource metadata when document is edited via saveContributionEdit', () => {
      const documentKey = 'draft_document_outline_model_a';
      const originalContributionId = 'contrib-original-789';
      const editedUpdatedAt = '2024-01-20T14:45:00.000Z';
      
      const progress = buildStageRunProgress(
        {},
        {
          [documentKey]: buildStageDocumentDescriptor('model-a'),
        },
      );

      seedBaseStore(progress, {
        focusedStageDocument: {
          [`${sessionId}:${stageSlug}:model-a`]: {
            modelId: 'model-a',
            documentKey,
          },
        },
        stageDocumentContent: {
          [buildStageDocumentKey('model-a', documentKey)]: buildStageDocumentContent({
            currentDraftMarkdown: 'Edited content',
            isDirty: true,
          }),
        },
        stageDocumentResources: {
          [buildStageDocumentKey('model-a', documentKey)]: buildEditedDocumentResource(documentKey, {
            source_contribution_id: originalContributionId,
            updated_at: editedUpdatedAt,
          }),
        },
      });

      renderSessionContributionsDisplayCard();

      const card = screen.getByTestId(`stage-document-card-model-a-${documentKey}`);
      const cardQueries = within(card);

      // Assert edited document shows updated metadata within the specific card
      // Text is split across multiple elements, so we use a function matcher scoped to the card
      // Use getAllByText since parent elements also match, then check that at least one exists
      const sourceContributionMatches = cardQueries.getAllByText((_content, element) => {
        const hasText = element?.textContent?.includes(`Source Contribution: ${originalContributionId}`);
        return hasText === true;
      });
      expect(sourceContributionMatches.length).toBeGreaterThan(0);
      
      const formattedDate = new Date(editedUpdatedAt).toLocaleString();
      const lastModifiedMatches = cardQueries.getAllByText((_content, element) => {
        const hasText = element?.textContent?.includes(`Last Modified: ${formattedDate}`);
        return hasText === true;
      });
      expect(lastModifiedMatches.length).toBeGreaterThan(0);
    });

    it('proves the card renders from stageDocumentContent and reflects resource metadata', () => {
      const documentKey = 'draft_document_outline_model_a';
      const documentContent = 'Content from stageDocumentContent';
      const sourceContributionId = 'contrib-metadata-test';
      const updatedAt = '2024-01-25T08:15:00.000Z';
      
      const progress = buildStageRunProgress(
        {},
        {
          [documentKey]: buildStageDocumentDescriptor('model-a'),
        },
      );

      seedBaseStore(progress, {
        focusedStageDocument: {
          [`${sessionId}:${stageSlug}:model-a`]: {
            modelId: 'model-a',
            documentKey,
          },
        },
        stageDocumentContent: {
          [buildStageDocumentKey('model-a', documentKey)]: buildStageDocumentContent({
            baselineMarkdown: documentContent,
            currentDraftMarkdown: documentContent,
          }),
        },
        stageDocumentResources: {
          [buildStageDocumentKey('model-a', documentKey)]: buildEditedDocumentResource(documentKey, {
            source_contribution_id: sourceContributionId,
            updated_at: updatedAt,
          }),
        },
      });

      renderSessionContributionsDisplayCard();

      // Assert card renders content from stageDocumentContent
      const textarea = screen.getByTestId(`stage-document-feedback-model-a-${documentKey}`);
      expect(textarea).toHaveValue(documentContent);

      const card = screen.getByTestId(`stage-document-card-model-a-${documentKey}`);
      const cardQueries = within(card);

      // Assert resource metadata is displayed within the specific card
      // Text is split across multiple elements, so we use a function matcher scoped to the card
      // Use getAllByText since parent elements also match, then check that at least one exists
      const sourceContributionMatches = cardQueries.getAllByText((_content, element) => {
        const hasText = element?.textContent?.includes(`Source Contribution: ${sourceContributionId}`);
        return hasText === true;
      });
      expect(sourceContributionMatches.length).toBeGreaterThan(0);
      
      const formattedDate = new Date(updatedAt).toLocaleString();
      const lastModifiedMatches = cardQueries.getAllByText((_content, element) => {
        const hasText = element?.textContent?.includes(`Last Modified: ${formattedDate}`);
        return hasText === true;
      });
      expect(lastModifiedMatches.length).toBeGreaterThan(0);
    });
  });

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
      const session = buildSession(contributions, ['model-a', 'model-b']);
      const project = buildProject(session, multiStageProcessTemplate);
      const recipe = buildRecipe(steps);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: stage1,
        activeStageSlug: stage1.slug,
        activeSessionDetail: session,
        selectedModelIds: session.selected_model_ids ?? [],
        currentProjectDetail: project,
        currentProcessTemplate: multiStageProcessTemplate,
        recipesByStageSlug: {
          [stage1.slug]: recipe,
        },
        stageRunProgress: {
          [progressKey]: progress,
        },
      });

      renderSessionContributionsDisplayCard();

      // Assert submit button is enabled based on isComplete (and not last stage)
      const footer = screen.getByTestId('card-footer');
      expect(
        within(footer).getByRole('button', { name: 'Submit Responses & Advance Stage' }),
      ).not.toBeDisabled();

      // Assert progress summary is still NOT displayed
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
      const session = buildSession(contributions, ['model-a', 'model-b']);
      const project = buildProject(session, multiStageProcessTemplate);
      const recipe = buildRecipe(steps);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: stage1,
        activeStageSlug: stage1.slug,
        activeSessionDetail: session,
        selectedModelIds: session.selected_model_ids ?? [],
        currentProjectDetail: project,
        currentProcessTemplate: multiStageProcessTemplate,
        recipesByStageSlug: {
          [stage1.slug]: recipe,
        },
        stageRunProgress: {
          [progressKey]: progress,
        },
      });

      renderSessionContributionsDisplayCard();

      // Assert submit button is disabled when isComplete is false
      const header = screen.getByTestId('card-header');
      expect(
        within(header).getByRole('button', { name: 'Submit Responses & Advance Stage' }),
      ).toBeDisabled();

      // Assert progress summary is NOT displayed
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
      const session = buildSession(contributions, ['model-a', 'model-b']);
      const project = buildProject(session, multiStageProcessTemplate);
      const steps = buildRecipeSteps();
      const recipe = buildRecipe(steps);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: synthesisStage,
        activeStageSlug: synthesisStage.slug,
        activeSessionDetail: session,
        selectedModelIds: session.selected_model_ids ?? [],
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

      // 5.b.iii: Assert button is disabled when in last stage, even if canSubmitStageResponses is true
      // Also assert button text changes to indicate it will never be active (not "Submit Responses & Advance Stage")
      const header = screen.getByTestId('card-header');
      const headerButton = within(header).getByRole('button');
      expect(headerButton).toBeDisabled();
      
      // Assert button text is NOT the standard "Submit Responses & Advance Stage" text
      // (it should be something indicating final stage, e.g., "Project Complete - Final Stage")
      expect(headerButton).not.toHaveTextContent('Submit Responses & Advance Stage');
      // Assert button text indicates it's the final stage and won't become active
      expect(headerButton.textContent).toMatch(/project complete|final stage|no further|all stages finished/i);

      // Assert footer button also has the correct text (button appears in both header and footer)
      const footer = screen.getByTestId('card-footer');
      const footerButton = within(footer).getByRole('button');
      expect(footerButton).toBeDisabled();
      expect(footerButton).not.toHaveTextContent('Submit Responses & Advance Stage');
      expect(footerButton.textContent).toMatch(/project complete|final stage|no further|all stages finished/i);

      // 5.b.iv: Assert "Project Complete" notice is displayed (appears in both header and footer)
      const notices = screen.getAllByText('Project Complete - All stages finished');
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
      const session = buildSession(contributions, ['model-a', 'model-b']);
      const project = buildProject(session, multiStageProcessTemplate);
      const steps = buildRecipeSteps();
      const recipe = buildRecipe(steps);

      setDialecticStateValues({
        activeContextProjectId: project.id,
        activeContextSessionId: session.id,
        activeContextStage: thesisStage, // Non-last stage (thesis when stages are [thesis, antithesis, synthesis])
        activeStageSlug: thesisStage.slug,
        activeSessionDetail: session,
        selectedModelIds: session.selected_model_ids ?? [],
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

      // 5.e.ii: Assert button is enabled when not in last stage and isComplete is true
      // Also assert button text remains the standard "Submit Responses & Advance Stage" text
      const footer = screen.getByTestId('card-footer');
      const button = within(footer).getByRole('button', { name: 'Submit Responses & Advance Stage' });
      expect(button).not.toBeDisabled();
      // Explicitly assert button text is the standard text (not the last stage text)
      expect(button).toHaveTextContent('Submit Responses & Advance Stage');

      // 5.e.iii: Assert "Project Complete" notice is NOT displayed when not in last stage
      expect(screen.queryByText('Project Complete - All stages finished')).not.toBeInTheDocument();
    });
  });

  describe('Step 38.j: Document highlighting filtering', () => {
    it('renders only highlighted documents when multiple documents exist for a model', () => {
      // 38.j.i: Mock store state with multiple documents in documentsByModel for a model
      // but only one document is highlighted in focusedStageDocument
      const modelId = 'model-a';
      const businessCaseKey = 'business_case';
      const featureSpecKey = 'feature_spec';
      const focusKey = `${sessionId}:${stageSlug}:${modelId}`;

      const progress = buildStageRunProgress(
        {},
        {
          [businessCaseKey]: buildStageDocumentDescriptor(modelId),
          [featureSpecKey]: buildStageDocumentDescriptor(modelId),
        },
      );

      seedBaseStore(progress, {
        focusedStageDocument: {
          [focusKey]: { modelId, documentKey: businessCaseKey },
        },
        stageDocumentContent: {
          [buildStageDocumentKey(modelId, businessCaseKey)]: buildStageDocumentContent(),
          [buildStageDocumentKey(modelId, featureSpecKey)]: buildStageDocumentContent(),
        },
      });

      renderSessionContributionsDisplayCard();

      // 38.j.ii: Assert that only the highlighted document has a Card component rendered
      expect(
        screen.getByTestId(`stage-document-card-${modelId}-${businessCaseKey}`),
      ).toBeInTheDocument();

      // 38.j.iii: Assert that the non-highlighted document does NOT have a Card component rendered
      expect(
        screen.queryByTestId(`stage-document-card-${modelId}-${featureSpecKey}`),
      ).not.toBeInTheDocument();
    });

    it('renders no document cards when no documents are highlighted', () => {
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

      // Assert that no document cards are rendered (only the "No documents generated yet" message)
      expect(
        screen.queryByTestId(`stage-document-card-${modelId}-${businessCaseKey}`),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId(`stage-document-card-${modelId}-${featureSpecKey}`),
      ).not.toBeInTheDocument();
      expect(screen.getByText('No documents generated yet.')).toBeInTheDocument();
    });

    it('renders no document cards when focusedStageDocument is undefined', () => {
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

      // Assert that no document cards are rendered
      expect(
        screen.queryByTestId(`stage-document-card-${modelId}-${businessCaseKey}`),
      ).not.toBeInTheDocument();
      expect(screen.getByText('No documents generated yet.')).toBeInTheDocument();
    });

    it('renders only highlighted documents for each model when multiple models have different highlighted documents', () => {
      // 38.j.v: Create a test case with multiple models, where each model has different highlighted documents
      const modelA = 'model-a';
      const modelB = 'model-b';
      const businessCaseKey = 'business_case';
      const featureSpecKey = 'feature_spec';
      const focusKeyA = `${sessionId}:${stageSlug}:${modelA}`;
      const focusKeyB = `${sessionId}:${stageSlug}:${modelB}`;

      const progress = buildStageRunProgress(
        {},
        {
          [`${businessCaseKey}_model_a`]: buildStageDocumentDescriptor(modelA),
          [`${featureSpecKey}_model_a`]: buildStageDocumentDescriptor(modelA),
          [`${businessCaseKey}_model_b`]: buildStageDocumentDescriptor(modelB),
          [`${featureSpecKey}_model_b`]: buildStageDocumentDescriptor(modelB),
        },
      );

      seedBaseStore(progress, {
        focusedStageDocument: {
          // model-a has business_case highlighted
          [focusKeyA]: { modelId: modelA, documentKey: `${businessCaseKey}_model_a` },
          // model-b has feature_spec highlighted
          [focusKeyB]: { modelId: modelB, documentKey: `${featureSpecKey}_model_b` },
        },
        stageDocumentContent: {
          [buildStageDocumentKey(modelA, `${businessCaseKey}_model_a`)]: buildStageDocumentContent(),
          [buildStageDocumentKey(modelA, `${featureSpecKey}_model_a`)]: buildStageDocumentContent(),
          [buildStageDocumentKey(modelB, `${businessCaseKey}_model_b`)]: buildStageDocumentContent(),
          [buildStageDocumentKey(modelB, `${featureSpecKey}_model_b`)]: buildStageDocumentContent(),
        },
      });

      renderSessionContributionsDisplayCard();

      // Verify only highlighted documents are rendered for each model
      // model-a: only business_case should be rendered
      expect(
        screen.getByTestId(`stage-document-card-${modelA}-${businessCaseKey}_model_a`),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(`stage-document-card-${modelA}-${featureSpecKey}_model_a`),
      ).not.toBeInTheDocument();

      // model-b: only feature_spec should be rendered
      expect(
        screen.getByTestId(`stage-document-card-${modelB}-${featureSpecKey}_model_b`),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(`stage-document-card-${modelB}-${businessCaseKey}_model_b`),
      ).not.toBeInTheDocument();

      // This test must fail because SessionContributionsDisplayCard currently renders all documents
      // regardless of highlighting status
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

    it('updates banner visibility when document status changes from generating to completed', () => {
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

      const { rerender } = renderSessionContributionsDisplayCard();

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

      seedBaseStore(updatedProgress, {
        generateContributionsError: null,
      });

      // Rerender with updated state
      rerender(<SessionContributionsDisplayCard />);

      // After status change, banner should NOT be displayed
      expect(screen.queryByText('Generating documents')).not.toBeInTheDocument();
    });
  });
});

