import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AiModelExtendedConfig,
  AiProvidersRow,
  DialecticProject,
  DialecticRecipeEdge,
  DialecticSession,
  DialecticStage,
  DialecticStageRecipe,
  DialecticStageRecipeStep,
  GenerateContributionsResponse,
  GetSessionDetailsResponse,
  ResumePausedNsfJobsResponse,
  SelectedModels,
  StageRenderedDocumentDescriptor,
  StageRunProgressSnapshot,
  TokenWallet,
  UnifiedProjectStatus,
  UserTier,
} from '@paynless/types';
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';
import { computeCostCeiling, isJson } from '@paynless/utils';
import type {
  ComputeCostCeilingDeps,
  ComputeCostCeilingParams,
  ComputeCostCeilingPayload,
  ComputeCostCeilingStageInput,
} from '@paynless/utils';
import { getMockDialecticClient, resetApiMock } from '@paynless/api/mocks';
import { GenerateContributionButton } from './GenerateContributionButton';
import {
  mockAiProvidersRow,
  mockAiModelConfig,
  mockDialecticStage,
  mockSession,
  mockDialecticProject,
  mockDialecticProcessTemplate,
  mockDialecticStageRecipeStep,
} from '../../mocks/dialecticStore.mock';
import { mockedUseAuthStoreHookLogic } from '../../mocks/authStore.mock';
import { useAiStore, useDialecticStore, useWalletStore } from '@paynless/store';

vi.mock('@paynless/api', async () => {
  const apiMocks = await import('@paynless/api/mocks');
  return {
    api: apiMocks.api,
    initializeApiClient: vi.fn(),
    resetApiMock: apiMocks.resetApiMock,
    getMockDialecticClient: apiMocks.getMockDialecticClient,
  };
});

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  const authStoreMock = await import('../../mocks/authStore.mock');
  authStoreMock.captureRealAuthStore(actual.useAuthStore);
  return {
    ...actual,
    useAuthStore: authStoreMock.mockedUseAuthStoreHookLogic,
  };
});

let mockDialecticClient = getMockDialecticClient();

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const stageSlug = 'thesis';
const sessionId = 'test-session-id';
const projectId = 'proj-1';
const iterationNumber = 1;
const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
const runKey = `${sessionId}:${iterationNumber}`;
const maxOutputTokens = 1000;
const stageExpectedCount = 4;
const outputTokenCostRate = 2;

const integrationUserTier: UserTier = {
  level: 0,
  name: 'free',
  output_cap_tokens: maxOutputTokens,
  max_models_per_project: 1,
};

const ceilingStageInput: ComputeCostCeilingStageInput = {
  stageSlug,
  expectedCount: stageExpectedCount,
  contributions: [],
};

const ceilingDeps: ComputeCostCeilingDeps = {};
const ceilingParams: ComputeCostCeilingParams = {};
const ceilingPayload: ComputeCostCeilingPayload = {
  stages: [ceilingStageInput],
  maxOutputTokens,
  outputTokenCostRates: [outputTokenCostRate],
};

const ceilingComputationResult = computeCostCeiling(ceilingDeps, ceilingParams, ceilingPayload);

if ('error' in ceilingComputationResult) {
  throw new Error('integration fixture ceiling computation failed');
}

const expectedStageCeiling: number = ceilingComputationResult.stageCeilings[stageSlug];
const sufficientWalletBalance: string = String(expectedStageCeiling + 2000);
const lowWalletBalance: string = '0';

const thesisStage: DialecticStage = mockDialecticStage({
  id: `stage-${stageSlug}`,
  slug: stageSlug,
  display_name: 'Proposal',
  default_system_prompt_id: null,
});

const defaultSelectedModels: SelectedModels[] = [
  { id: 'model-1', displayName: 'Model 1' },
];

const modelConfig: AiModelExtendedConfig = mockAiModelConfig({
  output_token_cost_rate: outputTokenCostRate,
  hard_cap_output_tokens: maxOutputTokens,
  provider_max_output_tokens: maxOutputTokens,
});
if (!isJson(modelConfig)) {
  throw new Error('config is not a valid JSON object');
}

const catalogRow: AiProvidersRow = mockAiProvidersRow({
  id: 'model-1',
  config: modelConfig,
});

function buildSessionForIntegration(
  selectedModels: SelectedModels[] = defaultSelectedModels,
): DialecticSession {
  return mockSession({
    id: sessionId,
    project_id: projectId,
    iteration_count: iterationNumber,
    current_stage_id: thesisStage.id,
    viewing_stage_id: thesisStage.id,
    selected_models: selectedModels,
  });
}

function buildProjectForIntegration(session: DialecticSession): DialecticProject {
  const template = mockDialecticProcessTemplate({
    id: 'template-1',
    name: 'Test',
    starting_stage_id: thesisStage.id,
    stages: [thesisStage],
    transitions: [],
  });
  return mockDialecticProject({
    id: projectId,
    user_id: 'user-1',
    project_name: 'Test Project',
    process_template_id: template.id,
    dialectic_process_templates: template,
    dialectic_sessions: [session],
  });
}

function renderWithRouter(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>{children}</MemoryRouter>
    ),
  });
}

function buildStep(overrides: {
  id: string;
  step_key: string;
  step_name: string;
  job_type: 'PLAN' | 'EXECUTE' | 'RENDER';
  execution_order: number;
}): DialecticStageRecipeStep {
  return mockDialecticStageRecipeStep({
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
    outputs_required: [],
  });
}

function buildRecipe(
  steps: DialecticStageRecipeStep[],
  edges: DialecticRecipeEdge[],
  slug: string = stageSlug,
  instanceId: string = 'instance-1',
): DialecticStageRecipe {
  return { stageSlug: slug, instanceId, steps, edges };
}

function buildProgressSnapshot(
  stepStatuses: Record<string, UnifiedProjectStatus>,
  documents: Record<string, StageRenderedDocumentDescriptor> = {},
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
    jobs: [],
  };
}

function makeDocumentKey(documentKey: string, modelId: string): string {
  return `${documentKey}${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}${modelId}`;
}

function buildPersonalWallet(balance: string): TokenWallet {
  const now = new Date();
  return {
    walletId: 'wallet-1',
    userId: 'user-1',
    balance,
    currency: 'AI_TOKEN',
    createdAt: now,
    updatedAt: now,
  };
}

function resetIntegrationStores(): void {
  act(() => {
    const dialecticStoreState = useDialecticStore.getState();
    if (dialecticStoreState._resetForTesting !== undefined) {
      dialecticStoreState._resetForTesting();
    }
    useWalletStore.getState()._resetForTesting();
    useAiStore.setState({ newChatContext: 'personal' });
  });
}

function seedAuthForIntegration(): void {
  act(() => {
    mockedUseAuthStoreHookLogic.setState({
      isLoading: false,
      userTier: integrationUserTier,
      error: null,
      availableTiers: [integrationUserTier],
    });
  });
}

function setWalletBalance(balance: string): void {
  act(() => {
    useWalletStore.setState({
      personalWallet: buildPersonalWallet(balance),
      isLoadingPersonalWallet: false,
      personalWalletError: null,
      currentChatWalletDecision: null,
    });
  });
}

function setStoreForButton(
  recipe: DialecticStageRecipe,
  progress: StageRunProgressSnapshot,
  session: DialecticSession,
  selectedModels: SelectedModels[] = defaultSelectedModels,
): void {
  const currentProjectDetail: DialecticProject = buildProjectForIntegration(session);
  const template = currentProjectDetail.dialectic_process_templates;
  if (template === null || template === undefined) {
    throw new Error('integration fixture project must include dialectic_process_templates');
  }

  act(() => {
    useDialecticStore.setState({
      currentProcessTemplate: template,
      currentProjectDetail,
      activeContextSessionId: sessionId,
      viewingStageSlug: stageSlug,
      selectedModels,
      modelCatalog: [catalogRow],
      outputCapUserCustomized: false,
      stageExpectedCountsByRun: {
        [runKey]: {
          [stageSlug]: stageExpectedCount,
        },
      },
      recipesByStageSlug: { [stageSlug]: recipe },
      stageRunProgress: { [progressKey]: progress },
      generatingSessions: {},
    });
  });
}

function mockGetSessionDetailsApiResponse(session: DialecticSession): void {
  const sessionDetailsResponse: GetSessionDetailsResponse = {
    session,
    currentStageDetails: thesisStage,
    activeSeedPrompt: null,
  };
  mockDialecticClient.getSessionDetails.mockResolvedValue({
    data: sessionDetailsResponse,
    status: 200,
    error: undefined,
  });
}

async function initializeOutputCapViaSessionHydration(
  session: DialecticSession,
): Promise<void> {
  mockGetSessionDetailsApiResponse(session);
  await useDialecticStore.getState().fetchAndSetCurrentSessionDetails(sessionId);
  await waitFor(() => {
    const tokens: number | null = useDialecticStore.getState().maxOutputTokens;
    expect(tokens).toBe(maxOutputTokens);
  });
}

async function seedStoreForButtonAndInitializeCap(
  recipe: DialecticStageRecipe,
  progress: StageRunProgressSnapshot,
  selectedModels: SelectedModels[] = defaultSelectedModels,
): Promise<void> {
  const session: DialecticSession = buildSessionForIntegration(selectedModels);
  setStoreForButton(recipe, progress, session, selectedModels);
  await initializeOutputCapViaSessionHydration(session);
}

describe('GenerateContributionButton integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetApiMock();
    mockDialecticClient = getMockDialecticClient();
    resetIntegrationStores();
    seedAuthForIntegration();
    setWalletBalance(sufficientWalletBalance);

    const resumePausedNsfJobsResponse: ResumePausedNsfJobsResponse = {
      resumedCount: 1,
    };
    mockDialecticClient.resumePausedNsfJobs.mockResolvedValue({
      data: resumePausedNsfJobsResponse,
      status: 200,
      error: undefined,
    });

    const generateContributionsResponse: GenerateContributionsResponse = {
      job_ids: ['job-1'],
      sessionId,
      projectId,
      stage: stageSlug,
      iteration: iterationNumber,
      status: 'generating',
      successfulContributions: [],
      failedAttempts: [],
    };
    mockDialecticClient.generateContributions.mockResolvedValue({
      data: generateContributionsResponse,
      status: 202,
      error: undefined,
    });
  });

  it('render with progress stageStatus paused_nsf and low balance → button shows "Insufficient Balance" and is disabled', async () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    const progress = buildProgressSnapshot({ plan: 'paused_nsf' }, {});
    await seedStoreForButtonAndInitializeCap(recipe, progress);
    setWalletBalance(lowWalletBalance);

    renderWithRouter(<GenerateContributionButton />);

    const button = screen.getByRole('button', { name: /Insufficient Balance/i });
    expect(button).toBeDefined();
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('render with progress stageStatus paused_nsf and sufficient balance → button shows "Resume Proposal" and is enabled → click → resumePausedNsfJobs called with correct params', async () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    const progress = buildProgressSnapshot({ plan: 'paused_nsf' }, {});
    await seedStoreForButtonAndInitializeCap(recipe, progress);
    setWalletBalance(sufficientWalletBalance);

    const user = userEvent.setup();
    renderWithRouter(<GenerateContributionButton />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Resume Proposal/i });
      expect(button.hasAttribute('disabled')).toBe(false);
    });

    const button = screen.getByRole('button', { name: /Resume Proposal/i });
    await user.click(button);

    await waitFor(() => {
      expect(mockDialecticClient.resumePausedNsfJobs).toHaveBeenCalledTimes(1);
    });
    expect(mockDialecticClient.resumePausedNsfJobs).toHaveBeenCalledWith({
      sessionId,
      stageSlug,
      iterationNumber,
    });
  });

  it('render with progress showing no paused_nsf and low balance → button shows "Insufficient Balance" and is disabled', async () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    const progress = buildProgressSnapshot({ plan: 'not_started' }, {});
    await seedStoreForButtonAndInitializeCap(recipe, progress);
    setWalletBalance(lowWalletBalance);

    renderWithRouter(<GenerateContributionButton />);

    const button = screen.getByRole('button', { name: /Insufficient Balance/i });
    expect(button).toBeDefined();
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('render with progress showing no paused_nsf and sufficient balance → button shows "Generate Proposal" and is enabled', async () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    const progress = buildProgressSnapshot({ plan: 'not_started' }, {});
    await seedStoreForButtonAndInitializeCap(recipe, progress);

    renderWithRouter(<GenerateContributionButton />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Generate Proposal/i });
      expect(button.hasAttribute('disabled')).toBe(false);
    });
  });

  it('click generate → dialog opens → store gets stageRunProgress update with rendered document → dialog auto-closes', async () => {
    const steps: DialecticStageRecipeStep[] = [
      buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
    ];
    const recipe = buildRecipe(steps, []);
    const progress = buildProgressSnapshot({ plan: 'not_started' }, {});
    await seedStoreForButtonAndInitializeCap(recipe, progress);

    const user = userEvent.setup();
    renderWithRouter(<GenerateContributionButton />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Generate Proposal/i });
      expect(button.hasAttribute('disabled')).toBe(false);
    });

    await user.click(screen.getByRole('button', { name: /Generate Proposal/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
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
      useDialecticStore.setState({
        stageRunProgress: {
          [progressKey]: buildProgressSnapshot({ plan: 'completed' }, documentsWithRendered),
        },
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
