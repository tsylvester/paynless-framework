import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  DialecticStateValues,
  DialecticStageRecipe,
  DialecticStageRecipeStep,
  DialecticRecipeEdge,
  DialecticStage,
  DialecticProcessTemplate,
  DialecticProject,
  DialecticSession,
  StageRunProgressSnapshot,
  StageRenderedDocumentDescriptor,
  UnifiedProjectStatus,
} from '@paynless/types';
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';
import { StageDAGProgressDialog } from './StageDAGProgressDialog.tsx';
import {
  initialDialecticStateValues,
  initializeMockDialecticState,
  setDialecticStateValues,
} from '../../mocks/dialecticStore.mock';

vi.mock('@paynless/store', async () => {
  const mockDialecticStoreUtils = await import('../../mocks/dialecticStore.mock');
  const actualPaynlessStore = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
  return {
    ...mockDialecticStoreUtils,
    useDialecticStore: mockDialecticStoreUtils.useDialecticStore,
    selectUnifiedProjectProgress: actualPaynlessStore.selectUnifiedProjectProgress,
    selectStageRunProgress: actualPaynlessStore.selectStageRunProgress,
  };
});

const stageSlug = 'thesis';
const sessionId = 'session-1';
const iterationNumber = 1;

function buildStep(
  overrides: {
    id: string;
    step_key: string;
    step_name: string;
    job_type: 'PLAN' | 'EXECUTE' | 'RENDER';
    execution_order: number;
  }
): DialecticStageRecipeStep {
  return {
    id: overrides.id,
    step_key: overrides.step_key,
    step_slug: overrides.step_key,
    step_name: overrides.step_name,
    execution_order: overrides.execution_order,
    job_type: overrides.job_type,
    prompt_type: 'Planner',
    output_type: 'header_context',
    granularity_strategy: 'all_to_one',
    inputs_required: [],
  };
}

function buildRecipe(
  steps: DialecticStageRecipeStep[],
  edges: DialecticRecipeEdge[],
  slug: string = stageSlug,
  instanceId: string = 'instance-1'
): DialecticStageRecipe {
  return { stageSlug: slug, instanceId, steps, edges };
}

function buildProgressSnapshot(
  stepStatuses: Record<string, UnifiedProjectStatus>,
  documents: Record<string, StageRenderedDocumentDescriptor> = {}
): StageRunProgressSnapshot {
  return {
    stepStatuses: { ...stepStatuses },
    documents: { ...documents },
    jobProgress: {},
    progress: { completedSteps: 0, totalSteps: Object.keys(stepStatuses).length, failedSteps: 0 },
  };
}

function makeDocumentKey(documentKey: string, modelId: string): string {
  return `${documentKey}${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}${modelId}`;
}

function setStoreForDialog(
  recipe: DialecticStageRecipe | undefined,
  progress: StageRunProgressSnapshot | undefined
): void {
  const stage: DialecticStage = {
    id: `stage-${stageSlug}`,
    slug: stageSlug,
    display_name: 'Thesis',
    description: null,
    created_at: new Date().toISOString(),
    default_system_prompt_id: null,
    expected_output_template_ids: [],
    recipe_template_id: null,
    active_recipe_instance_id: null,
  };
  const template: DialecticProcessTemplate = {
    id: 'template-1',
    name: 'Test',
    description: null,
    created_at: new Date().toISOString(),
    starting_stage_id: stage.id,
    stages: [stage],
    transitions: [],
  };
  const session: DialecticSession = {
    id: sessionId,
    project_id: 'proj-1',
    session_description: null,
    iteration_count: iterationNumber,
    current_stage_id: stage.id,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_input_reference_url: null,
    associated_chat_id: null,
    selected_models: [],
    dialectic_contributions: [],
    dialectic_session_models: [],
  };
  const currentProjectDetail: DialecticProject = {
    id: 'proj-1',
    user_id: 'user-1',
    project_name: 'Test Project',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    selected_domain_id: 'domain-1',
    dialectic_domains: { name: 'Test' },
    selected_domain_overlay_id: null,
    initial_user_prompt: null,
    initial_prompt_resource_id: null,
    repo_url: null,
    process_template_id: template.id,
    dialectic_process_templates: template,
    isLoadingProcessTemplate: false,
    processTemplateError: null,
    contributionGenerationStatus: 'idle',
    generateContributionsError: null,
    isSubmittingStageResponses: false,
    submitStageResponsesError: null,
    isSavingContributionEdit: false,
    saveContributionEditError: null,
    dialectic_sessions: [session],
  };
  const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
  const state: Partial<DialecticStateValues> = {
    ...initialDialecticStateValues,
    currentProcessTemplate: template,
    currentProjectDetail,
    recipesByStageSlug: recipe ? { [stageSlug]: recipe } : {},
    stageRunProgress: progress ? { [progressKey]: progress } : {},
  };
  setDialecticStateValues(state);
}

describe('StageDAGProgressDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    stageSlug,
    sessionId,
    iterationNumber,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    initializeMockDialecticState();
  });

  it('renders Dialog when open is true', () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    setStoreForDialog(recipe, buildProgressSnapshot({ plan: 'not_started' }));

    render(<StageDAGProgressDialog {...defaultProps} open={true} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not render dialog content when open is false', () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    setStoreForDialog(recipe, buildProgressSnapshot({ plan: 'not_started' }));

    render(<StageDAGProgressDialog {...defaultProps} open={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders an SVG element containing node rects for each step in the recipe', () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
      buildStep({ id: 's2', step_key: 'exec', step_name: 'Execute', job_type: 'EXECUTE', execution_order: 1 }),
    ];
    const recipe = buildRecipe(steps, [{ from_step_id: 's1', to_step_id: 's2' }]);
    setStoreForDialog(recipe, buildProgressSnapshot({ plan: 'not_started', exec: 'not_started' }));

    render(<StageDAGProgressDialog {...defaultProps} />);

    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
    const rects = svg?.querySelectorAll('rect') ?? [];
    expect(rects.length).toBe(2);
  });

  it('renders edge lines between connected nodes', () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
      buildStep({ id: 's2', step_key: 'exec', step_name: 'Execute', job_type: 'EXECUTE', execution_order: 1 }),
    ];
    const recipe = buildRecipe(steps, [{ from_step_id: 's1', to_step_id: 's2' }]);
    setStoreForDialog(recipe, buildProgressSnapshot({ plan: 'not_started', exec: 'not_started' }));

    render(<StageDAGProgressDialog {...defaultProps} />);

    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
    const lines = svg?.querySelectorAll('line');
    const paths = svg?.querySelectorAll('path');
    const hasEdges = (lines?.length ?? 0) > 0 || (paths?.length ?? 0) > 0;
    expect(hasEdges).toBe(true);
  });

  it('node for a not_started step has grey fill', () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    setStoreForDialog(recipe, buildProgressSnapshot({ plan: 'not_started' }));

    render(<StageDAGProgressDialog {...defaultProps} />);

    const svg = document.querySelector('svg');
    const rect = svg?.querySelector('rect');
    expect(rect).toBeInTheDocument();
    expect(rect?.getAttribute('fill')).toMatch(/#9ca3af/i);
  });

  it('node for a completed step has green fill', () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    setStoreForDialog(recipe, buildProgressSnapshot({ plan: 'completed' }));

    render(<StageDAGProgressDialog {...defaultProps} />);

    const svg = document.querySelector('svg');
    const rect = svg?.querySelector('rect');
    expect(rect).toBeInTheDocument();
    expect(rect?.getAttribute('fill')).toMatch(/#10b981/i);
  });

  it('node for a failed step has red fill', () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    setStoreForDialog(recipe, buildProgressSnapshot({ plan: 'failed' }));

    render(<StageDAGProgressDialog {...defaultProps} />);

    const svg = document.querySelector('svg');
    const rect = svg?.querySelector('rect');
    expect(rect).toBeInTheDocument();
    expect(rect?.getAttribute('fill')).toMatch(/#ef4444/i);
  });

  it('node for an in_progress step has amber fill with pulse animation class', () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    setStoreForDialog(recipe, buildProgressSnapshot({ plan: 'in_progress' }));

    render(<StageDAGProgressDialog {...defaultProps} />);

    const svg = document.querySelector('svg');
    const rect = svg?.querySelector('rect');
    expect(rect).toBeInTheDocument();
    expect(rect?.getAttribute('fill')).toMatch(/#f59e0b/i);
    expect(rect?.getAttribute('class') ?? '').toMatch(/animate|pulse/i);
  });

  it('each node displays step_name text label', () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan step', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    setStoreForDialog(recipe, buildProgressSnapshot({ plan: 'not_started' }));

    render(<StageDAGProgressDialog {...defaultProps} />);

    expect(screen.getByText('Plan step')).toBeInTheDocument();
  });

  it('auto-close: when stageRunProgress documents include a rendered and completed descriptor, onOpenChange(false) is called', async () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    const completedDescriptor: StageRenderedDocumentDescriptor = {
      status: 'completed',
      job_id: 'job-1',
      latestRenderedResourceId: 'res-1',
      modelId: 'model-1',
      versionHash: 'v1',
      lastRenderedResourceId: 'res-1',
      lastRenderAtIso: new Date().toISOString(),
    };
    const documents: Record<string, StageRenderedDocumentDescriptor> = {
      [makeDocumentKey('doc-1', 'model-1')]: completedDescriptor,
    };
    const progress = buildProgressSnapshot({ plan: 'completed' }, documents);
    setStoreForDialog(recipe, progress);

    const onOpenChange = vi.fn();
    render(<StageDAGProgressDialog {...defaultProps} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('manual dismiss: clicking close button calls onOpenChange(false)', () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    setStoreForDialog(recipe, buildProgressSnapshot({ plan: 'not_started' }));

    const onOpenChange = vi.fn();
    render(<StageDAGProgressDialog {...defaultProps} onOpenChange={onOpenChange} />);

    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('empty recipe (no steps) shows No recipe data available', () => {
    const recipe = buildRecipe([], []);
    setStoreForDialog(recipe, undefined);

    render(<StageDAGProgressDialog {...defaultProps} />);

    expect(screen.getByText('No recipe data available')).toBeInTheDocument();
  });
});
