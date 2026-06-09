import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createClient } from '@supabase/supabase-js';
import {
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import type {
  AiModelExtendedConfig,
  AiProvidersRow,
  DialecticProcessTemplate,
  DialecticProject,
  DialecticRecipeEdge,
  DialecticSession,
  DialecticStage,
  DialecticStageRecipe,
  DialecticStageRecipeStep,
  DialecticStore,
  GenerateContributionsResponse,
  GetAllStageProgressResponse,
  ResumePausedNsfJobsResponse,
  SelectedModels,
  StageRunProgressSnapshot,
  TokenWallet,
  UnifiedProjectStatus,
} from '@paynless/types';
import {
  computeCostCeiling,
  buildComputeCostCeilingDeps,
  buildComputeCostCeilingParams,
  buildComputeCostCeilingPayload,
  buildComputeCostCeilingStageInput,
  isJson,
} from '@paynless/utils';
import type { ComputeCostCeilingStageInput } from '@paynless/utils';
import { initializeApiClient, _resetApiClient } from '@paynless/api';
import {
  selectCostCeiling,
  useAiStore,
  useDialecticStore,
  useWalletStore,
} from '@paynless/store';
import { GenerateContributionButton } from './GenerateContributionButton';
import {
  mockGetAllStageProgressResponse,
  mockStageProgressEntry,
  mockAiProvidersRow,
  mockAiModelConfig,
} from '../../mocks/dialecticStore.mock';

vi.mock('@paynless/api', async () => {
  return await vi.importActual<typeof import('@paynless/api')>('@paynless/api');
});

vi.mock('@supabase/supabase-js', () => {
  const mockClient = {
    auth: {
      getSession: vi.fn(),
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  };
  return {
    createClient: vi.fn(() => mockClient),
    SupabaseClient: vi.fn(),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const MOCK_SUPABASE_URL = 'http://mock-supabase.co';
const MOCK_ANON_KEY = 'mock-anon-key';
const MOCK_FUNCTIONS_URL = `${MOCK_SUPABASE_URL}/functions/v1`;
const MOCK_ACCESS_TOKEN = 'mock-test-access-token-local';

const stageSlug = 'thesis';
const sessionId = 'cost-ceiling-session-id';
const projectId = 'cost-ceiling-project-id';
const userId = 'cost-ceiling-user-id';
const iterationNumber = 1;
const runKey = `${sessionId}:${iterationNumber}`;
const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
const maxOutputTokens = 1000;
const stageExpectedCount = 4;
const outputTokenCostRate = 2;

const ceilingStages: ComputeCostCeilingStageInput[] = [
  buildComputeCostCeilingStageInput({
    stageSlug,
    expectedCount: stageExpectedCount,
    contributions: [],
  }),
];

const ceilingComputationResult = computeCostCeiling(
  buildComputeCostCeilingDeps(),
  buildComputeCostCeilingParams(),
  buildComputeCostCeilingPayload({
    stages: ceilingStages,
    maxOutputTokens,
    outputTokenCostRates: [outputTokenCostRate],
  }),
);

if ('error' in ceilingComputationResult) {
  throw new Error('cost ceiling integration fixture computation failed');
}

const expectedStageCeiling: number = ceilingComputationResult.stageCeilings[stageSlug];
const expectedProjectCeiling: number = ceilingComputationResult.projectCeiling;
const sufficientWalletBalance: string = String(expectedStageCeiling + 2000);
const lowWalletBalance: string = '0';

const modelConfig: AiModelExtendedConfig = mockAiModelConfig({
  output_token_cost_rate: outputTokenCostRate,
});
if (!isJson(modelConfig)) {
  throw new Error('config is not a valid JSON object');
}

const catalogRow: AiProvidersRow = mockAiProvidersRow({
  id: 'model-1',
  config: modelConfig,
});

const selectedModels: SelectedModels[] = [{ id: 'model-1', displayName: 'Model 1' }];

const successProgressResponse: GetAllStageProgressResponse = mockGetAllStageProgressResponse({
  dagProgress: { completedStages: 0, totalStages: 1 },
  stages: [
    mockStageProgressEntry({
      stageSlug,
      expectedCount: stageExpectedCount,
      status: 'not_started',
      modelCount: 1,
      progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 },
      steps: [{ stepKey: 'plan', status: 'not_started' }],
      documents: [],
      jobs: [],
      edges: [],
    }),
  ],
});

const mockThesisStage: DialecticStage = {
  id: `stage-${stageSlug}`,
  slug: stageSlug,
  display_name: 'Proposal',
  description: null,
  created_at: new Date().toISOString(),
  default_system_prompt_id: null,
  expected_output_template_ids: [],
  recipe_template_id: null,
  active_recipe_instance_id: null,
  minimum_balance: 100000,
};

const server = setupServer();

let generateContributionsSpy: MockInstance<
  Parameters<DialecticStore['generateContributions']>,
  ReturnType<DialecticStore['generateContributions']>
>;
let resumePausedNsfJobsSpy: MockInstance<
  Parameters<DialecticStore['resumePausedNsfJobs']>,
  ReturnType<DialecticStore['resumePausedNsfJobs']>
>;

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function configureSupabaseAuthSession(): void {
  const mockSupabaseClient = vi.mocked(createClient).mock.results[0]?.value;
  if (mockSupabaseClient === undefined) {
    throw new Error('Supabase mock client not initialized');
  }
  vi.mocked(mockSupabaseClient.auth.getSession).mockResolvedValue({
    data: {
      session: {
        access_token: MOCK_ACCESS_TOKEN,
        refresh_token: 'mock-refresh-token',
        user: { id: userId },
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Date.now() / 1000 + 3600,
      },
    },
    error: null,
  });
}

function registerSuccessMswHandlers(): void {
  server.use(
    http.post(`${MOCK_FUNCTIONS_URL}/dialectic-service`, async ({ request }) => {
      const body = await request.json();
      if (body == null || typeof body !== 'object' || !('action' in body)) {
        return HttpResponse.json({ message: 'Invalid request body' }, { status: 400 });
      }
      const action: unknown = body['action'];
      if (typeof action !== 'string') {
        return HttpResponse.json({ message: 'Invalid request body' }, { status: 400 });
      }
      if (action === 'getAllStageProgress') {
        return HttpResponse.json(successProgressResponse, { status: 200 });
      }
      if (action === 'listModelCatalog') {
        return HttpResponse.json([catalogRow], { status: 200 });
      }
      return HttpResponse.json({ message: `Unhandled action: ${action}` }, { status: 500 });
    }),
  );
}

function registerGetAllStageProgressErrorHandler(): void {
  server.use(
    http.post(`${MOCK_FUNCTIONS_URL}/dialectic-service`, async ({ request }) => {
      const body = await request.json();
      if (body == null || typeof body !== 'object' || !('action' in body)) {
        return HttpResponse.json({ message: 'Invalid request body' }, { status: 400 });
      }
      const action: unknown = body['action'];
      if (typeof action !== 'string') {
        return HttpResponse.json({ message: 'Invalid request body' }, { status: 400 });
      }
      if (action === 'getAllStageProgress') {
        return HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 });
      }
      if (action === 'listModelCatalog') {
        return HttpResponse.json([catalogRow], { status: 200 });
      }
      return HttpResponse.json({ message: `Unhandled action: ${action}` }, { status: 500 });
    }),
  );
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
  instanceId: string = 'instance-1',
): DialecticStageRecipe {
  return { stageSlug: slug, instanceId, steps, edges };
}

function buildProgressSnapshot(
  stepStatuses: Record<string, UnifiedProjectStatus>,
): StageRunProgressSnapshot {
  return {
    stepStatuses: { ...stepStatuses },
    documents: {},
    jobProgress: {},
    progress: {
      completedSteps: 0,
      totalSteps: Object.keys(stepStatuses).length,
      failedSteps: 0,
    },
    jobs: [],
  };
}

function buildPersonalWallet(balance: string): TokenWallet {
  const now = new Date();
  return {
    walletId: 'wallet-1',
    userId,
    balance,
    currency: 'AI_TOKEN',
    createdAt: now,
    updatedAt: now,
  };
}

function resetIntegrationStores(): void {
  act(() => {
    useDialecticStore.getState()._resetForTesting?.();
    useWalletStore.getState()._resetForTesting();
    useAiStore.setState({ newChatContext: 'personal' });
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

function seedSessionStore(maxOutputTokensOverride: number | null = maxOutputTokens): void {
  const template: DialecticProcessTemplate = {
    id: 'template-1',
    name: 'Test',
    description: null,
    created_at: new Date().toISOString(),
    starting_stage_id: mockThesisStage.id,
    stages: [mockThesisStage],
    transitions: [],
  };
  const session: DialecticSession = {
    id: sessionId,
    project_id: projectId,
    session_description: null,
    iteration_count: iterationNumber,
    current_stage_id: mockThesisStage.id,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_input_reference_url: null,
    associated_chat_id: null,
    selected_models: selectedModels,
    dialectic_contributions: [],
    dialectic_session_models: [],
    viewing_stage_id: mockThesisStage.id,
  };
  const currentProjectDetail: DialecticProject = {
    id: projectId,
    user_id: userId,
    project_name: 'Cost Ceiling Test Project',
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
  const steps: DialecticStageRecipeStep[] = [
    buildStep({ id: 's1', step_key: 'plan', step_name: 'Plan', job_type: 'PLAN', execution_order: 0 }),
  ];
  const recipe = buildRecipe(steps, []);
  const progress = buildProgressSnapshot({ plan: 'not_started' });

  act(() => {
    useDialecticStore.setState({
      currentProcessTemplate: template,
      currentProjectDetail,
      activeContextSessionId: sessionId,
      viewingStageSlug: stageSlug,
      selectedModels,
      maxOutputTokens: maxOutputTokensOverride,
      modelCatalog: [catalogRow],
      recipesByStageSlug: { [stageSlug]: recipe },
      stageRunProgress: { [progressKey]: progress },
      generatingSessions: {},
      stageExpectedCountsByRun: {},
    });
  });
}

async function hydrateStageProgressFromApi(): Promise<void> {
  await useDialecticStore.getState().hydrateAllStageProgress({
    sessionId,
    iterationNumber,
    userId,
    projectId,
  });
}

describe('GenerateContributionButton cost ceiling integration', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' });
  });

  afterAll(() => {
    server.close();
  });

  afterEach(() => {
    server.resetHandlers();
    _resetApiClient();
    generateContributionsSpy.mockRestore();
    resumePausedNsfJobsSpy.mockRestore();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    _resetApiClient();
    initializeApiClient({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });
    configureSupabaseAuthSession();
    resetIntegrationStores();
    setWalletBalance(sufficientWalletBalance);
    registerSuccessMswHandlers();

    const generateContributionsResponse: GenerateContributionsResponse = {
      sessionId,
      projectId,
      stage: stageSlug,
      iteration: iterationNumber,
      status: 'pending',
      successfulContributions: [],
      failedAttempts: [],
    };
    generateContributionsSpy = vi
      .spyOn(useDialecticStore.getState(), 'generateContributions')
      .mockResolvedValue({
        data: generateContributionsResponse,
        status: 200,
        error: undefined,
      });
    const resumePausedNsfJobsResponse: ResumePausedNsfJobsResponse = {
      resumedCount: 0,
    };
    resumePausedNsfJobsSpy = vi
      .spyOn(useDialecticStore.getState(), 'resumePausedNsfJobs')
      .mockResolvedValue({
        data: resumePausedNsfJobsResponse,
        status: 200,
        error: undefined,
      });
  });

  it('success stack: API hydration → selectCostCeiling → hook → enabled generate and generateContributions on click', async () => {
    seedSessionStore();

    await hydrateStageProgressFromApi();

    const storeState = useDialecticStore.getState();
    expect(storeState.stageExpectedCountsByRun[runKey]?.[stageSlug]).toBe(stageExpectedCount);

    const ceilingResult = selectCostCeiling(storeState, sessionId);
    expect(ceilingResult).not.toBeNull();
    if (ceilingResult === null || 'error' in ceilingResult) {
      throw new Error('selectCostCeiling should return success after hydration');
    }
    expect(ceilingResult.stageCeilings[stageSlug]).toBe(expectedStageCeiling);
    expect(ceilingResult.projectCeiling).toBe(expectedProjectCeiling);

    renderWithRouter(<GenerateContributionButton />);

    await waitFor(() => {
      expect(screen.getByTestId('generate-button-stage-cost-estimate')).toHaveTextContent(
        formatTokenCount(expectedStageCeiling),
      );
    });

    const button = screen.getByRole('button', { name: /Generate Proposal/i });
    expect(button).toBeEnabled();

    const user = userEvent.setup();
    await user.click(button);

    await waitFor(() => {
      expect(generateContributionsSpy).toHaveBeenCalledTimes(1);
    });
    expect(resumePausedNsfJobsSpy).not.toHaveBeenCalled();
  });

  it('null prerequisites: missing maxOutputTokens → no-estimate callout and generateContributions not called on click', async () => {
    seedSessionStore(null);

    await hydrateStageProgressFromApi();

    renderWithRouter(<GenerateContributionButton />);

    await waitFor(() => {
      expect(screen.getByTestId('generate-button-no-estimate-callout')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /No Estimate/i })).toBeDisabled();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));

    expect(generateContributionsSpy).not.toHaveBeenCalled();
  });

  it('API progress error: getAllStageProgress 500 → no-estimate callout and generateContributions not called on click', async () => {
    registerGetAllStageProgressErrorHandler();
    seedSessionStore();

    await hydrateStageProgressFromApi();

    // Real hydrateAllStageProgress catches the MSW 500, sets progressHydrationStatus[runKey] to failed,
    // and leaves stageExpectedCountsByRun[runKey] unset; selectCostCeiling returns null at countsBySlug.
    const storeState = useDialecticStore.getState();
    expect(storeState.progressHydrationStatus[runKey]).toBe('failed');
    expect(storeState.stageExpectedCountsByRun[runKey]).toBeUndefined();
    expect(selectCostCeiling(storeState, sessionId)).toBeNull();

    renderWithRouter(<GenerateContributionButton />);

    await waitFor(() => {
      expect(screen.getByTestId('generate-button-no-estimate-callout')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /No Estimate/i })).toBeDisabled();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));

    expect(generateContributionsSpy).not.toHaveBeenCalled();
  });

  it('insufficient wallet: balance below expectedStageCeiling → NSF callout and generateContributions not called on click', async () => {
    seedSessionStore();
    setWalletBalance(lowWalletBalance);

    await hydrateStageProgressFromApi();

    renderWithRouter(<GenerateContributionButton />);

    await waitFor(() => {
      expect(screen.getByTestId('generate-button-balance-callout')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Insufficient Balance/i })).toBeDisabled();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));

    expect(generateContributionsSpy).not.toHaveBeenCalled();
  });

  it('hook callback guard: clearing maxOutputTokens after enable blocks spend on subsequent click attempt', async () => {
    seedSessionStore();

    await hydrateStageProgressFromApi();

    renderWithRouter(<GenerateContributionButton />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generate Proposal/i })).toBeEnabled();
    });

    act(() => {
      useDialecticStore.setState({ maxOutputTokens: null });
    });

    await waitFor(() => {
      expect(screen.getByTestId('generate-button-no-estimate-callout')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /No Estimate/i })).toBeDisabled();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));

    expect(generateContributionsSpy).not.toHaveBeenCalled();
  });
});
