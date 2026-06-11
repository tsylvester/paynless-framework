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
} from 'vitest';
import type {
  AiModelExtendedConfig,
  AiProvidersRow,
  DialecticStage,
  GenerateContributionsResponse,
  GetAllStageProgressResponse,
  SelectedModels,
  TokenWallet,
  UserTier,
} from '@paynless/types';
import {
  computeCostCeiling,
  formatTokenCount,
  isApiError,
  isJson,
} from '@paynless/utils';
import type {
  ComputeCostCeilingDeps,
  ComputeCostCeilingParams,
  ComputeCostCeilingPayload,
  ComputeCostCeilingReturn,
  ComputeCostCeilingStageInput,
  FormatTokenCountDeps,
  FormatTokenCountParams,
} from '@paynless/utils';
import { initializeApiClient, _resetApiClient } from '@paynless/api';
import {
  selectCostCeiling,
  useAiStore,
  useAuthStore,
  useDialecticStore,
  useWalletStore,
} from '@paynless/store';
import { GenerateContributionButton } from './GenerateContributionButton';
import {
  mockGetAllStageProgressResponse,
  mockStageProgressEntry,
  mockAiProvidersRow,
  mockAiModelConfig,
  mockDialecticStage,
  mockSession,
  mockDialecticProject,
  mockDialecticProcessTemplate,
  mockDialecticStageRecipe,
  mockDialecticStageRecipeStep,
  mockStageRunProgressSnapshot,
} from '../../mocks/dialecticStore.mock';

vi.mock('@paynless/api', async () => {
  return await vi.importActual<typeof import('@paynless/api')>('@paynless/api');
});

vi.mock('@supabase/supabase-js', async () => {
  const supabaseMockModule =
    await import('../../../../../packages/api/src/mocks/supabase.mock.ts');
  const mockSupabaseClient = supabaseMockModule.createMockSupabaseClient();
  return {
    createClient: vi.fn(() => mockSupabaseClient),
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

const outputCapNotInitializedMessage =
  'Output cap is not initialized in dialectic store.';
const stageProgressHydrationFailedMessage = 'Stage progress hydration failed.';

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
const formatTokenCountDeps: FormatTokenCountDeps = {};
const formatTokenCountParams: FormatTokenCountParams = {};
const ceilingPayload: ComputeCostCeilingPayload = {
  stages: [ceilingStageInput],
  maxOutputTokens,
  outputTokenCostRates: [outputTokenCostRate],
};

const ceilingComputationResult = computeCostCeiling(ceilingDeps, ceilingParams, ceilingPayload);

if ('error' in ceilingComputationResult) {
  throw new Error('cost ceiling integration fixture computation failed');
}

const expectedStageCeiling: number = ceilingComputationResult.stageCeilings[stageSlug];
const expectedProjectCeiling: number = ceilingComputationResult.projectCeiling;

const expectedStageCeilingFormatResult = formatTokenCount(
  formatTokenCountDeps,
  formatTokenCountParams,
  { tokenCount: expectedStageCeiling },
);
if ('error' in expectedStageCeilingFormatResult) {
  throw new Error('expectedStageCeiling formatTokenCount failed in integration fixture');
}
const expectedStageCeilingDisplay: string =
  expectedStageCeilingFormatResult.formatted;

const sufficientWalletBalance: string = String(expectedStageCeiling + 2000);
const lowWalletBalance: string = '0';

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

const thesisStage: DialecticStage = mockDialecticStage({
  id: `stage-${stageSlug}`,
  slug: stageSlug,
  display_name: 'Proposal',
  default_system_prompt_id: null,
});

const server = setupServer();

let generateContributionsRequestCount = 0;

function resetGenerateContributionsRequestCount(): void {
  generateContributionsRequestCount = 0;
}

function getGenerateContributionsRequestCount(): number {
  return generateContributionsRequestCount;
}

function configureSupabaseAuthSession(): void {
  const mockResults = vi.mocked(createClient).mock.results;
  if (mockResults.length === 0) {
    throw new Error('Supabase mock client not initialized');
  }
  const mockSupabaseClient = mockResults[0].value;
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
      if (action === 'generateContributions') {
        generateContributionsRequestCount += 1;
        const generateContributionsResponse: GenerateContributionsResponse = {
          sessionId,
          projectId,
          stage: stageSlug,
          iteration: iterationNumber,
          status: 'pending',
          successfulContributions: [],
          failedAttempts: [],
        };
        return HttpResponse.json(generateContributionsResponse, { status: 200 });
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
      if (action === 'generateContributions') {
        generateContributionsRequestCount += 1;
        return HttpResponse.json({ message: 'Unexpected generateContributions' }, { status: 500 });
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
    const dialecticStoreState = useDialecticStore.getState();
    if (dialecticStoreState._resetForTesting !== undefined) {
      dialecticStoreState._resetForTesting();
    }
    useWalletStore.getState()._resetForTesting();
    useAiStore.setState({ newChatContext: 'personal' });
    useAuthStore.setState(useAuthStore.getInitialState());
  });
}

function seedAuthForCostCeilingIntegration(): void {
  act(() => {
    useAuthStore.setState({
      isLoading: false,
      userTier: integrationUserTier,
      error: null,
      availableTiers: [integrationUserTier],
    });
  });
}

async function initializeOutputCapFromTier(): Promise<void> {
  act(() => {
    useDialecticStore.getState().initializeMaxOutputTokens();
  });
  await waitFor(() => {
    const tokens: number | null = useDialecticStore.getState().maxOutputTokens;
    expect(tokens).not.toBeNull();
  });
  const initializedTokens: number | null = useDialecticStore.getState().maxOutputTokens;
  if (initializedTokens === null) {
    throw new Error('maxOutputTokens remained null after initializeMaxOutputTokens');
  }
  expect(initializedTokens).toBe(maxOutputTokens);
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

function seedSessionStoreForTierInitPath(): void {
  applySessionStoreSeed(false, null);
}

function seedSessionStoreWithNullMaxOutputTokens(): void {
  applySessionStoreSeed(true, null);
}

function applySessionStoreSeed(
  includeMaxOutputTokens: boolean,
  maxOutputTokensValue: number | null,
): void {
  const template = mockDialecticProcessTemplate({
    id: 'template-1',
    name: 'Test',
    starting_stage_id: thesisStage.id,
    stages: [thesisStage],
    transitions: [],
  });
  const session = mockSession({
    id: sessionId,
    project_id: projectId,
    iteration_count: iterationNumber,
    current_stage_id: thesisStage.id,
    selected_models: selectedModels,
    viewing_stage_id: thesisStage.id,
  });
  const currentProjectDetail = mockDialecticProject({
    id: projectId,
    user_id: userId,
    project_name: 'Cost Ceiling Test Project',
    process_template_id: template.id,
    dialectic_process_templates: template,
    dialectic_sessions: [session],
  });
  const recipe = mockDialecticStageRecipe({
    stageSlug,
    instanceId: 'instance-1',
    steps: [
      mockDialecticStageRecipeStep({
        id: 's1',
        step_key: 'plan',
        step_slug: 'plan',
        step_name: 'Plan',
        execution_order: 0,
        job_type: 'PLAN',
        prompt_type: 'Planner',
        output_type: 'header_context',
        granularity_strategy: 'all_to_one',
        inputs_required: [],
        outputs_required: [],
      }),
    ],
    edges: [],
  });
  const progress = mockStageRunProgressSnapshot({
    stepStatuses: { plan: 'not_started' },
    progress: {
      completedSteps: 0,
      totalSteps: 1,
      failedSteps: 0,
    },
  });

  const sessionStoreBase = {
    currentProcessTemplate: template,
    currentProjectDetail,
    activeContextSessionId: sessionId,
    viewingStageSlug: stageSlug,
    selectedModels,
    modelCatalog: [catalogRow],
    recipesByStageSlug: { [stageSlug]: recipe },
    stageRunProgress: { [progressKey]: progress },
    generatingSessions: {},
    stageExpectedCountsByRun: {},
  };

  if (includeMaxOutputTokens) {
    act(() => {
      useDialecticStore.setState({
        ...sessionStoreBase,
        maxOutputTokens: maxOutputTokensValue,
      });
    });
    return;
  }

  act(() => {
    useDialecticStore.setState(sessionStoreBase);
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
  });

  beforeEach(() => {
    vi.clearAllMocks();
    _resetApiClient();
    initializeApiClient({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });
    configureSupabaseAuthSession();
    resetIntegrationStores();
    seedAuthForCostCeilingIntegration();
    setWalletBalance(sufficientWalletBalance);
    resetGenerateContributionsRequestCount();
    registerSuccessMswHandlers();
  });

  it('success stack: API hydration → selectCostCeiling → hook → enabled generate and generateContributions on click', async () => {
    seedSessionStoreForTierInitPath();

    await hydrateStageProgressFromApi();
    await initializeOutputCapFromTier();

    const storeState = useDialecticStore.getState();
    const countsBySlug = storeState.stageExpectedCountsByRun[runKey];
    if (countsBySlug === undefined) {
      throw new Error(`stageExpectedCountsByRun missing for runKey ${runKey}`);
    }
    expect(countsBySlug[stageSlug]).toBe(stageExpectedCount);

    const ceilingResult: ComputeCostCeilingReturn = selectCostCeiling(storeState, sessionId);
    if ('error' in ceilingResult) {
      throw new Error('selectCostCeiling should return success after hydration');
    }
    expect(ceilingResult.stageCeilings[stageSlug]).toBe(expectedStageCeiling);
    expect(ceilingResult.projectCeiling).toBe(expectedProjectCeiling);

    renderWithRouter(<GenerateContributionButton />);

    await waitFor(() => {
      const stageCostEstimate = screen.getByTestId('generate-button-stage-cost-estimate');
      expect(stageCostEstimate.textContent).toContain(expectedStageCeilingDisplay);
      expect(stageCostEstimate.textContent).not.toContain(
        new Intl.NumberFormat('en-US').format(expectedStageCeiling),
      );
    });

    const button = screen.getByRole('button', { name: /Generate Proposal/i });
    expect(button.hasAttribute('disabled')).toBe(false);

    const user = userEvent.setup();
    await user.click(button);

    await waitFor(() => {
      expect(getGenerateContributionsRequestCount()).toBe(1);
    });
  });

  it('null prerequisites: missing maxOutputTokens → estimate-error callout and generateContributions not called on click', async () => {
    seedSessionStoreWithNullMaxOutputTokens();

    await hydrateStageProgressFromApi();

    const storeState = useDialecticStore.getState();
    const ceilingResult: ComputeCostCeilingReturn = selectCostCeiling(storeState, sessionId);
    expect('error' in ceilingResult).toBe(true);
    if (!('error' in ceilingResult)) {
      throw new Error('selectCostCeiling should return OUTPUT_CAP_NOT_INITIALIZED error');
    }
    expect(isApiError(ceilingResult.error)).toBe(true);
    if (!isApiError(ceilingResult.error)) {
      throw new Error('selectCostCeiling error should be ApiError');
    }
    expect(ceilingResult.error.code).toBe('OUTPUT_CAP_NOT_INITIALIZED');
    expect(ceilingResult.error.message).toBe(outputCapNotInitializedMessage);

    renderWithRouter(<GenerateContributionButton />);

    await waitFor(() => {
      expect(screen.getByTestId('generate-button-estimate-error-callout').textContent).toBe(
        outputCapNotInitializedMessage,
      );
      expect(screen.getByRole('button', { name: /Estimate Failed/i }).hasAttribute('disabled')).toBe(
        true,
      );
      expect(screen.queryByTestId('generate-button-no-estimate-callout')).toBeNull();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Estimate Failed/i }));

    expect(getGenerateContributionsRequestCount()).toBe(0);
  });

  it('API progress error: getAllStageProgress 500 → estimate-error callout and generateContributions not called on click', async () => {
    registerGetAllStageProgressErrorHandler();
    seedSessionStoreForTierInitPath();

    await expect(
      useDialecticStore.getState().hydrateAllStageProgress({
        sessionId,
        iterationNumber,
        userId,
        projectId,
      }),
    ).rejects.toBeDefined();

    const storeState = useDialecticStore.getState();
    expect(storeState.progressHydrationStatus[runKey]).toBe('failed');
    expect(storeState.stageExpectedCountsByRun[runKey]).toBeUndefined();
    const ceilingResult: ComputeCostCeilingReturn = selectCostCeiling(storeState, sessionId);
    expect('error' in ceilingResult).toBe(true);
    if (!('error' in ceilingResult)) {
      throw new Error('selectCostCeiling should return STAGE_PROGRESS_HYDRATION_FAILED error');
    }
    expect(isApiError(ceilingResult.error)).toBe(true);
    if (!isApiError(ceilingResult.error)) {
      throw new Error('selectCostCeiling error should be ApiError');
    }
    expect(ceilingResult.error.code).toBe('STAGE_PROGRESS_HYDRATION_FAILED');
    expect(ceilingResult.error.message).toBe(stageProgressHydrationFailedMessage);

    renderWithRouter(<GenerateContributionButton />);

    await waitFor(() => {
      expect(screen.getByTestId('generate-button-estimate-error-callout').textContent).toBe(
        stageProgressHydrationFailedMessage,
      );
      expect(screen.getByRole('button', { name: /Estimate Failed/i }).hasAttribute('disabled')).toBe(
        true,
      );
      expect(screen.queryByTestId('generate-button-no-estimate-callout')).toBeNull();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Estimate Failed/i }));

    expect(getGenerateContributionsRequestCount()).toBe(0);
  });

  it('insufficient wallet: balance below expectedStageCeiling → NSF callout and generateContributions not called on click', async () => {
    seedSessionStoreForTierInitPath();
    setWalletBalance(lowWalletBalance);

    await hydrateStageProgressFromApi();
    await initializeOutputCapFromTier();

    renderWithRouter(<GenerateContributionButton />);

    await waitFor(() => {
      expect(screen.getByTestId('generate-button-balance-callout')).toBeDefined();
      expect(screen.getByRole('button', { name: /Insufficient Balance/i }).hasAttribute('disabled')).toBe(
        true,
      );
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Insufficient Balance/i }));

    expect(getGenerateContributionsRequestCount()).toBe(0);
  });

  it('hook callback guard: clearing maxOutputTokens after enable blocks spend on subsequent click attempt', async () => {
    seedSessionStoreForTierInitPath();

    await hydrateStageProgressFromApi();
    await initializeOutputCapFromTier();

    renderWithRouter(<GenerateContributionButton />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generate Proposal/i }).hasAttribute('disabled')).toBe(
        false,
      );
    });

    act(() => {
      useDialecticStore.setState({ maxOutputTokens: null });
    });

    await waitFor(() => {
      expect(screen.getByTestId('generate-button-estimate-error-callout').textContent).toBe(
        outputCapNotInitializedMessage,
      );
      expect(screen.getByRole('button', { name: /Estimate Failed/i }).hasAttribute('disabled')).toBe(
        true,
      );
      expect(screen.queryByTestId('generate-button-no-estimate-callout')).toBeNull();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Estimate Failed/i }));

    expect(getGenerateContributionsRequestCount()).toBe(0);
  });
});
