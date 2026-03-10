import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { StageDAGProgressDialog } from './StageDAGProgressDialog';
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
const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

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
  const state: Partial<DialecticStateValues> = {
    ...initialDialecticStateValues,
    currentProcessTemplate: template,
    currentProjectDetail,
    recipesByStageSlug: recipe ? { [stageSlug]: recipe } : {},
    stageRunProgress: progress ? { [progressKey]: progress } : {},
  };
  setDialecticStateValues(state);
}

describe('StageDAGProgressDialog integration', () => {
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

  it('store seeded with recipe (steps + edges) and stageRunProgress → Dialog renders correct node count and colors', () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
      buildStep({ id: 's2', step_key: 'exec', step_name: 'Execute', job_type: 'EXECUTE', execution_order: 1 }),
      buildStep({ id: 's3', step_key: 'render', step_name: 'Render', job_type: 'RENDER', execution_order: 2 }),
    ];
    const edges: DialecticRecipeEdge[] = [
      { from_step_id: 's1', to_step_id: 's2' },
      { from_step_id: 's2', to_step_id: 's3' },
    ];
    const recipe = buildRecipe(steps, edges);
    const progress = buildProgressSnapshot({
      plan: 'completed',
      exec: 'in_progress',
      render: 'not_started',
    });
    setStoreForDialog(recipe, progress);

    render(<StageDAGProgressDialog {...defaultProps} />);

    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
    const rects = svg?.querySelectorAll('rect') ?? [];
    expect(rects.length).toBe(3);

    const rectList = Array.from(rects);
    const greenRects = rectList.filter((r) => r.getAttribute('fill')?.match(/#10b981/i));
    const amberRects = rectList.filter((r) => r.getAttribute('fill')?.match(/#f59e0b/i));
    const greyRects = rectList.filter((r) => r.getAttribute('fill')?.match(/#9ca3af/i));
    expect(greenRects.length).toBe(1);
    expect(amberRects.length).toBe(1);
    expect(greyRects.length).toBe(1);
  });

  it('store stageRunProgress updated mid-render → node color transitions from grey to green', async () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    const progress = buildProgressSnapshot({ plan: 'not_started' });
    setStoreForDialog(recipe, progress);

    const { rerender } = render(<StageDAGProgressDialog {...defaultProps} />);

    let svg = document.querySelector('svg');
    let rect = svg?.querySelector('rect');
    expect(rect?.getAttribute('fill')).toMatch(/#9ca3af/i);

    act(() => {
      setDialecticStateValues({
        stageRunProgress: {
          [progressKey]: buildProgressSnapshot({ plan: 'completed' }),
        },
      });
    });
    rerender(<StageDAGProgressDialog {...defaultProps} />);

    await waitFor(() => {
      svg = document.querySelector('svg');
      rect = svg?.querySelector('rect');
      expect(rect?.getAttribute('fill')).toMatch(/#10b981/i);
    });
  });

  it('store stageRunProgress.documents gains a rendered+completed entry → Dialog auto-closes', async () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    const progress = buildProgressSnapshot({ plan: 'completed' }, {});
    setStoreForDialog(recipe, progress);

    const onOpenChange = vi.fn();
    render(<StageDAGProgressDialog {...defaultProps} onOpenChange={onOpenChange} />);

    const completedDescriptor: StageRenderedDocumentDescriptor = {
      status: 'completed',
      job_id: 'job-1',
      latestRenderedResourceId: 'res-1',
      modelId: 'model-1',
      versionHash: 'v1',
      lastRenderedResourceId: 'res-1',
      lastRenderAtIso: new Date().toISOString(),
    };
    const documentsWithRendered: Record<string, StageRenderedDocumentDescriptor> = {
      [makeDocumentKey('doc-1', 'model-1')]: completedDescriptor,
    };

    act(() => {
      setDialecticStateValues({
        stageRunProgress: {
          [progressKey]: buildProgressSnapshot({ plan: 'completed' }, documentsWithRendered),
        },
      });
    });

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
