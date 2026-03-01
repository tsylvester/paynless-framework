import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  SelectedModels,
} from '@paynless/types';
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';
import { GenerateContributionButton } from './GenerateContributionButton';
import {
  initialDialecticStateValues,
  initializeMockDialecticState,
  setDialecticStateValues,
  getDialecticStoreState,
} from '../../mocks/dialecticStore.mock';
import { selectActiveChatWalletInfo } from '../../mocks/walletStore.mock';

vi.mock('@paynless/store', async () => {
  const mockDialecticStoreUtils = await import('../../mocks/dialecticStore.mock');
  const actualPaynlessStore = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
  const walletStoreMock = await vi.importActual<typeof import('../../mocks/walletStore.mock')>('../../mocks/walletStore.mock');
  return {
    ...mockDialecticStoreUtils,
    initialWalletStateValues: actualPaynlessStore.initialWalletStateValues,
    useDialecticStore: mockDialecticStoreUtils.useDialecticStore,
    selectUnifiedProjectProgress: actualPaynlessStore.selectUnifiedProjectProgress,
    selectStageRunProgress: actualPaynlessStore.selectStageRunProgress,
    selectActiveStage: actualPaynlessStore.selectActiveStage,
    selectSessionById: actualPaynlessStore.selectSessionById,
    selectIsStageReadyForSessionIteration: actualPaynlessStore.selectIsStageReadyForSessionIteration,
    selectSelectedModels: actualPaynlessStore.selectSelectedModels,
    useWalletStore: walletStoreMock.useWalletStore,
    selectActiveChatWalletInfo: walletStoreMock.selectActiveChatWalletInfo,
    useAiStore: (selector: (state: { continueUntilComplete: boolean; newChatContext: string | null }) => unknown) => {
      return selector({ continueUntilComplete: false, newChatContext: 'personal' });
    },
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const stageSlug = 'thesis';
const sessionId = 'test-session-id';
const iterationNumber = 1;
const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

function buildStep(overrides: {
  id: string;
  step_key: string;
  step_name: string;
  job_type: 'PLAN' | 'EXECUTE' | 'RENDER';
  execution_order: number;
}): DialecticStageRecipeStep {
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
    progress: {
      completedSteps: 0,
      totalSteps: Object.keys(stepStatuses).length,
      failedSteps: 0,
    },
  };
}

function makeDocumentKey(documentKey: string, modelId: string): string {
  return `${documentKey}${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}${modelId}`;
}

function setStoreForButton(
  recipe: DialecticStageRecipe,
  progress: StageRunProgressSnapshot,
  selectedModels: SelectedModels[] = [{ id: 'model-1', displayName: 'Model 1' }]
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
    activeContextSessionId: sessionId,
    activeStageSlug: stageSlug,
    selectedModels,
    recipesByStageSlug: { [stageSlug]: recipe },
    stageRunProgress: { [progressKey]: progress },
    generatingSessions: {},
  };
  setDialecticStateValues(state);
}

describe('GenerateContributionButton integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeMockDialecticState();
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue({
      status: 'ok',
      type: 'personal',
      walletId: 'wallet-1',
      orgId: null,
      balance: '100',
      isLoadingPrimaryWallet: false,
    });
  });

  it('click generate → dialog opens → store gets stageRunProgress update with rendered document → dialog auto-closes', async () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    const progress = buildProgressSnapshot({ plan: 'not_started' }, {});
    setStoreForButton(recipe, progress);

    vi.mocked(getDialecticStoreState().generateContributions).mockResolvedValue({
      data: {
        job_ids: ['job-1'],
        sessionId,
        projectId: 'proj-1',
        stage: stageSlug,
        iteration: iterationNumber,
        status: 'generating',
        successfulContributions: [],
        failedAttempts: [],
      },
      status: 202,
    });

    const user = userEvent.setup();
    render(<GenerateContributionButton />);

    await user.click(screen.getByRole('button', { name: /Generate Thesis/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

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
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
