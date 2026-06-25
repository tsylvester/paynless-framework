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
  CreateProjectAutoStartResult,
  DialecticDomainRow,
  DialecticProcessTemplate,
  DialecticStage,
  DialecticStore,
  DomainProcessAssociationRow,
  GetStageExpectedCountsResponse,
  Json,
  SelectedModels,
  TokenWallet,
  UserTier,
} from '@paynless/types';
import {
  computeCostCeiling,
  formatTokenCount,
  isJson,
  FormatTokenCountDeps,
  FormatTokenCountParams,
} from '@paynless/utils';
import type {
  ComputeCostCeilingDeps,
  ComputeCostCeilingParams,
  ComputeCostCeilingPayload,
  ComputeCostCeilingStageInput,
} from '@paynless/utils';
import { initializeApiClient, _resetApiClient } from '@paynless/api';
import {
  selectPreProjectCostCeiling,
  useAiStore,
  useAuthStore,
  useDialecticStore,
  useWalletStore,
} from '@paynless/store';
import { CreateDialecticProjectForm } from './CreateDialecticProjectForm';
import {
  mockAiModelConfig,
  mockAiProvidersRow,
  mockDialecticDomain,
  mockDialecticProcessTemplate,
  mockDialecticStage,
  mockDomainProcessAssociationRow,
} from '../../mocks/dialecticStore.mock';
import type { TextInputAreaProps } from '@/components/common/TextInputArea';

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

vi.mock('@paynless/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/platform')>();
  return {
    ...actual,
    usePlatform: vi.fn(() => ({
      capabilities: { platform: 'web' },
    })),
    platformEventEmitter: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    },
  };
});

vi.mock('@/components/common/TextInputArea', () => ({
  TextInputArea: vi.fn((props: TextInputAreaProps) => (
    <div data-testid={props.dataTestId || 'mock-text-input-area'}>
      <textarea
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        disabled={props.disabled}
      />
    </div>
  )),
}));

vi.mock('@/components/dialectic/DomainSelector', () => ({
  DomainSelector: vi.fn(() => <div data-testid="mock-domain-selector">Mock Domain Selector</div>),
}));

vi.mock('@/components/dialectic/AIModelSelector', () => ({
  AIModelSelector: vi.fn(() => <div data-testid="mock-ai-model-selector">Mock AI Model Selector</div>),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const MOCK_SUPABASE_URL = 'http://mock-supabase.co';
const MOCK_ANON_KEY = 'mock-anon-key';
const MOCK_FUNCTIONS_URL = `${MOCK_SUPABASE_URL}/functions/v1`;
const MOCK_ACCESS_TOKEN = 'mock-test-access-token-local';
const userId = 'create-form-cost-ceiling-user';

const subscriptionTierUnavailableMessage = 'Subscription tier is not available.';

const domainId = 'domain-cost-ceiling-int';
const processTemplateId = 'pt-cost-ceiling-int';
const firstStageSlug = 'thesis';
const tierOutputCapTokens = 1000;
const outputTokenCostRate = 2;
const modelId = 'model-cost-ceiling-1';

const integrationUserTier: UserTier = {
  level: 0,
  name: 'free',
  output_cap_tokens: tierOutputCapTokens,
  max_models_per_project: 1,
};

const thesisStage: DialecticStage = mockDialecticStage({
  id: 'stage-thesis-int',
  slug: firstStageSlug,
  display_name: 'Proposal',
  default_system_prompt_id: null,
});

const antithesisStage: DialecticStage = mockDialecticStage({
  id: 'stage-antithesis-int',
  slug: 'antithesis',
  display_name: 'Review',
  default_system_prompt_id: null,
});

const processTemplate: DialecticProcessTemplate = mockDialecticProcessTemplate({
  id: processTemplateId,
  name: 'Cost ceiling integration template',
  starting_stage_id: thesisStage.id,
  stages: [thesisStage, antithesisStage],
  transitions: [],
});

const selectedDomain: DialecticDomainRow = mockDialecticDomain({
  id: domainId,
  name: 'General',
});

const domainProcessAssociation: DomainProcessAssociationRow = mockDomainProcessAssociationRow({
  domain_id: domainId,
  process_template_id: processTemplateId,
  is_default_for_domain: true,
});

const stageExpectedCountsResponse: GetStageExpectedCountsResponse = {
  stages: [
    { stageSlug: firstStageSlug, expectedCount: 5 },
    { stageSlug: 'antithesis', expectedCount: 3 },
  ],
  totalStages: 2,
};

const ceilingStages: ComputeCostCeilingStageInput[] = stageExpectedCountsResponse.stages.map(
  (entry) => {
    const stageInput: ComputeCostCeilingStageInput = {
      stageSlug: entry.stageSlug,
      expectedCount: entry.expectedCount,
      contributions: [],
    };
    return stageInput;
  },
);

const rawModelConfig: AiModelExtendedConfig = mockAiModelConfig({
  output_token_cost_rate: outputTokenCostRate,
  hard_cap_output_tokens: tierOutputCapTokens,
  provider_max_output_tokens: tierOutputCapTokens,
});
if (!isJson(rawModelConfig)) {
  throw new Error('model config is not a valid JSON object');
}
const catalogConfig: Json = rawModelConfig;

const bindingModelCap: number = tierOutputCapTokens;

const expectedInitializedMaxOutputTokens: number = Math.min(
  tierOutputCapTokens,
  bindingModelCap,
);

const ceilingDeps: ComputeCostCeilingDeps = {};
const ceilingParams: ComputeCostCeilingParams = {};
const ceilingPayload: ComputeCostCeilingPayload = {
  stages: ceilingStages,
  maxOutputTokens: expectedInitializedMaxOutputTokens,
  outputTokenCostRates: [outputTokenCostRate],
};

const ceilingComputationResult = computeCostCeiling(ceilingDeps, ceilingParams, ceilingPayload);

if ('error' in ceilingComputationResult) {
  throw new Error('create form cost ceiling integration fixture computation failed');
}

const expectedFirstStageCeiling: number =
  ceilingComputationResult.stageCeilings[firstStageSlug];
const expectedProjectCeiling: number = ceilingComputationResult.projectCeiling;
const sufficientWalletBalance: string = String(expectedFirstStageCeiling + 2000);
const lowWalletBalance: string = String(expectedFirstStageCeiling - 1);

const largeTierOutputCapTokens: number = 7803;
const largeOutputTokenCostRate: number = 1;

const largeStageExpectedCountsResponse: GetStageExpectedCountsResponse = {
  stages: [
    { stageSlug: firstStageSlug, expectedCount: 5 },
    { stageSlug: 'antithesis', expectedCount: 141 },
  ],
  totalStages: 2,
};

const largeCeilingStages: ComputeCostCeilingStageInput[] =
  largeStageExpectedCountsResponse.stages.map((entry) => {
    const stageInput: ComputeCostCeilingStageInput = {
      stageSlug: entry.stageSlug,
      expectedCount: entry.expectedCount,
      contributions: [],
    };
    return stageInput;
  });

const largeCeilingPayload: ComputeCostCeilingPayload = {
  stages: largeCeilingStages,
  maxOutputTokens: largeTierOutputCapTokens,
  outputTokenCostRates: [largeOutputTokenCostRate],
};

const largeCeilingComputationResult = computeCostCeiling(
  ceilingDeps,
  ceilingParams,
  largeCeilingPayload,
);

if ('error' in largeCeilingComputationResult) {
  throw new Error('large ceiling integration fixture computation failed');
}

const expectedLargeFirstStageCeiling: number =
  largeCeilingComputationResult.stageCeilings[firstStageSlug];
const expectedLargeProjectCeiling: number = largeCeilingComputationResult.projectCeiling;

const integrationUserTierLargeCap: UserTier = {
  level: 1,
  name: 'pro',
  output_cap_tokens: largeTierOutputCapTokens,
  max_models_per_project: 1,
};

const formatTokenCountDeps: FormatTokenCountDeps = {};
const formatTokenCountParams: FormatTokenCountParams = {};

const catalogRow: AiProvidersRow = mockAiProvidersRow({
  id: modelId,
  name: 'Default Model',
  is_default_generation: true,
  is_active: true,
  config: catalogConfig,
});

const defaultSelectedModels: SelectedModels[] = [
  { id: modelId, displayName: 'Default Model' },
];

const emptySelectedModels: SelectedModels[] = [];

const tierOutputCap8192: number = 8192;
const modelOutputCap4096: number = 4096;
const modelOutputCap8192: number = 8192;

const integrationUserTier8192: UserTier = {
  level: 1,
  name: 'pro',
  output_cap_tokens: tierOutputCap8192,
  max_models_per_project: 1,
};

const noDefaultGenerationModelsInitErrorMessage =
  'No default generation models are available in the catalog.';

const server = setupServer();

let createProjectAndAutoStartSpy: MockInstance<
  Parameters<DialecticStore['createProjectAndAutoStart']>,
  ReturnType<DialecticStore['createProjectAndAutoStart']>
>;

function expectedFormattedTokenCount(tokenCount: number): string {
  const formatResult = formatTokenCount(formatTokenCountDeps, formatTokenCountParams, {
    tokenCount,
  });
  if ('error' in formatResult) {
    throw new Error(`formatTokenCount failed for token count ${tokenCount}`);
  }
  return formatResult.formatted;
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

function buildCatalogConfigForModelCap(modelCap: number): Json {
  const rawConfig: AiModelExtendedConfig = mockAiModelConfig({
    output_token_cost_rate: outputTokenCostRate,
    hard_cap_output_tokens: modelCap,
    provider_max_output_tokens: modelCap,
  });
  if (!isJson(rawConfig)) {
    throw new Error('model config is not a valid JSON object');
  }
  return rawConfig;
}

function buildCatalogRowForModelCap(modelCap: number): AiProvidersRow {
  return mockAiProvidersRow({
    id: modelId,
    name: 'Default Model',
    is_default_generation: true,
    is_active: true,
    config: buildCatalogConfigForModelCap(modelCap),
  });
}

function registerSuccessMswHandlersForCatalogRow(row: AiProvidersRow): void {
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
      if (action === 'listModelCatalog') {
        return HttpResponse.json([row], { status: 200 });
      }
      if (action === 'fetchProcessAssociation') {
        return HttpResponse.json(domainProcessAssociation, { status: 200 });
      }
      if (action === 'fetchProcessTemplate') {
        return HttpResponse.json(processTemplate, { status: 200 });
      }
      if (action === 'getStageExpectedCounts') {
        return HttpResponse.json(stageExpectedCountsResponse, { status: 200 });
      }
      return HttpResponse.json({ message: `Unhandled action: ${action}` }, { status: 500 });
    }),
  );
}

function registerSuccessMswHandlers(): void {
  registerSuccessMswHandlersForCatalogRow(catalogRow);
}

function registerLargeCeilingMswHandlers(): void {
  const largeRawModelConfig: AiModelExtendedConfig = mockAiModelConfig({
    output_token_cost_rate: largeOutputTokenCostRate,
    hard_cap_output_tokens: largeTierOutputCapTokens,
    provider_max_output_tokens: largeTierOutputCapTokens,
  });
  if (!isJson(largeRawModelConfig)) {
    throw new Error('large catalog config is not a valid JSON object');
  }
  const largeCatalogConfig: Json = largeRawModelConfig;

  const largeCatalogRow: AiProvidersRow = mockAiProvidersRow({
    id: modelId,
    name: 'Default Model',
    is_default_generation: true,
    is_active: true,
    config: largeCatalogConfig,
  });

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
      if (action === 'listModelCatalog') {
        return HttpResponse.json([largeCatalogRow], { status: 200 });
      }
      if (action === 'fetchProcessAssociation') {
        return HttpResponse.json(domainProcessAssociation, { status: 200 });
      }
      if (action === 'fetchProcessTemplate') {
        return HttpResponse.json(processTemplate, { status: 200 });
      }
      if (action === 'getStageExpectedCounts') {
        return HttpResponse.json(largeStageExpectedCountsResponse, { status: 200 });
      }
      return HttpResponse.json({ message: `Unhandled action: ${action}` }, { status: 500 });
    }),
  );
}

function registerNoDefaultGenerationModelsMswHandlers(): void {
  const nonDefaultCatalogRow: AiProvidersRow = mockAiProvidersRow({
    id: modelId,
    name: 'Default Model',
    is_default_generation: false,
    is_active: true,
    config: catalogConfig,
  });

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
      if (action === 'listModelCatalog') {
        return HttpResponse.json([nonDefaultCatalogRow], { status: 200 });
      }
      if (action === 'fetchProcessAssociation') {
        return HttpResponse.json(domainProcessAssociation, { status: 200 });
      }
      if (action === 'fetchProcessTemplate') {
        return HttpResponse.json(processTemplate, { status: 200 });
      }
      if (action === 'getStageExpectedCounts') {
        return HttpResponse.json(stageExpectedCountsResponse, { status: 200 });
      }
      return HttpResponse.json({ message: `Unhandled action: ${action}` }, { status: 500 });
    }),
  );
}

function registerStageExpectedCountsErrorHandler(): void {
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
      if (action === 'listModelCatalog') {
        return HttpResponse.json([catalogRow], { status: 200 });
      }
      if (action === 'fetchProcessAssociation') {
        return HttpResponse.json(domainProcessAssociation, { status: 200 });
      }
      if (action === 'fetchProcessTemplate') {
        return HttpResponse.json(processTemplate, { status: 200 });
      }
      if (action === 'getStageExpectedCounts') {
        return HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 });
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
    useDialecticStore.getState()._resetForTesting?.();
    useWalletStore.getState()._resetForTesting();
    useAiStore.setState({ newChatContext: 'personal' });
    useAuthStore.setState(useAuthStore.getInitialState());
  });
}

function seedAuthForCostCeilingIntegration(params: {
  isLoading: boolean;
  userTier: UserTier | null;
  error: Error | null;
}): void {
  act(() => {
    useAuthStore.setState({
      isLoading: params.isLoading,
      userTier: params.userTier,
      error: params.error,
      availableTiers: [integrationUserTier],
    });
  });
}

function seedPreProjectFormStore(models: SelectedModels[]): void {
  act(() => {
    useDialecticStore.setState({
      selectedDomain,
      domains: [selectedDomain],
      selectedModels: models,
    });
  });
}

async function waitForHydrationComplete(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByTestId('create-project-estimate-loading-notice')).toBeNull();
  });
}

async function waitForCostPreview(): Promise<void> {
  await waitFor(() => {
    const preview = screen.getByTestId('create-project-cost-preview');
    expect(preview.textContent).toContain(
      expectedFormattedTokenCount(expectedProjectCeiling),
    );
    expect(preview.textContent).toContain(
      expectedFormattedTokenCount(expectedFirstStageCeiling),
    );
  });
}

function expectSetupModeDemotionText(expectedMessage: string): void {
  const setupModeElement: HTMLElement = screen.getByTestId('create-project-setup-mode');
  const setupColumn: HTMLElement | null = setupModeElement.closest('div.shrink-0');
  expect(setupColumn).not.toBeNull();
  if (setupColumn === null) {
    return;
  }
  const demotionParagraphs: NodeListOf<HTMLParagraphElement> =
    setupColumn.querySelectorAll('p.text-sm.text-muted-foreground');
  const demotionMessages: string[] = [];
  demotionParagraphs.forEach((element: HTMLParagraphElement) => {
    if (element.textContent !== null) {
      demotionMessages.push(element.textContent);
    }
  });
  expect(demotionMessages).toContain(expectedMessage);
}

describe('CreateDialecticProjectForm cost ceiling integration', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' });
  });

  afterAll(() => {
    server.close();
  });

  afterEach(() => {
    server.resetHandlers();
    _resetApiClient();
    createProjectAndAutoStartSpy.mockRestore();
    mockNavigate.mockClear();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    _resetApiClient();
    initializeApiClient({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });
    configureSupabaseAuthSession();
    resetIntegrationStores();
    seedAuthForCostCeilingIntegration({
      isLoading: false,
      userTier: integrationUserTier,
      error: null,
    });
    setWalletBalance(sufficientWalletBalance);
    registerSuccessMswHandlers();

    const autoStartResult: CreateProjectAutoStartResult = {
      projectId: 'proj-cost-ceiling-int',
      sessionId: 'sess-cost-ceiling-int',
      hasDefaultModels: true,
    };
    createProjectAndAutoStartSpy = vi
      .spyOn(useDialecticStore.getState(), 'createProjectAndAutoStart')
      .mockResolvedValue(autoStartResult);
  });

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

  it('tier output_cap_tokens 8192 and model cap 4096 → maxOutputTokens 4096 after mount without popover', async () => {
    seedAuthForCostCeilingIntegration({
      isLoading: false,
      userTier: integrationUserTier8192,
      error: null,
    });
    registerSuccessMswHandlersForCatalogRow(buildCatalogRowForModelCap(modelOutputCap4096));
    seedPreProjectFormStore(defaultSelectedModels);
    renderWithRouter(<CreateDialecticProjectForm />);

    await waitForHydrationComplete();

    await waitFor(() => {
      expect(useDialecticStore.getState().maxOutputTokens).toBe(modelOutputCap4096);
    });
  });

  it('tier output_cap_tokens 8192 and model cap 8192 → maxOutputTokens 8192 after mount without popover', async () => {
    seedAuthForCostCeilingIntegration({
      isLoading: false,
      userTier: integrationUserTier8192,
      error: null,
    });
    registerSuccessMswHandlersForCatalogRow(buildCatalogRowForModelCap(modelOutputCap8192));
    seedPreProjectFormStore(defaultSelectedModels);
    renderWithRouter(<CreateDialecticProjectForm />);

    await waitForHydrationComplete();

    await waitFor(() => {
      expect(useDialecticStore.getState().maxOutputTokens).toBe(modelOutputCap8192);
    });
  });

  it('tier + catalog hydrated, popover closed → maxOutputTokens set → cost preview', async () => {
    seedPreProjectFormStore(defaultSelectedModels);
    renderWithRouter(<CreateDialecticProjectForm />);

    await waitForHydrationComplete();

    await waitFor(() => {
      expect(useDialecticStore.getState().maxOutputTokens).toBe(expectedInitializedMaxOutputTokens);
    });

    const ceilingResult = selectPreProjectCostCeiling(useDialecticStore.getState());
    if ('error' in ceilingResult) {
      throw new Error('selectPreProjectCostCeiling should return success after tier init and API hydration');
    }
    expect(ceilingResult.stageCeilings[firstStageSlug]).toBe(expectedFirstStageCeiling);
    expect(ceilingResult.projectCeiling).toBe(expectedProjectCeiling);

    await waitForCostPreview();

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Autostart/i }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });
  });

  it('success stack: API → store → selectPreProjectCostCeiling → preview → afford autostart submit', async () => {
    seedPreProjectFormStore(defaultSelectedModels);
    renderWithRouter(<CreateDialecticProjectForm />);

    await waitForHydrationComplete();

    await waitFor(() => {
      const storeState = useDialecticStore.getState();
      expect(storeState.maxOutputTokens).toBe(expectedInitializedMaxOutputTokens);
      expect(storeState.selectedDomainProcessAssociation?.process_template_id).toBe(
        processTemplateId,
      );
      expect(storeState.preProjectStageExpectedCounts).toEqual(stageExpectedCountsResponse.stages);
      expect(storeState.currentProcessTemplate?.id).toBe(processTemplateId);
    });

    const ceilingResult = selectPreProjectCostCeiling(useDialecticStore.getState());
    if ('error' in ceilingResult) {
      throw new Error('selectPreProjectCostCeiling should return success after API hydration');
    }
    expect(ceilingResult.stageCeilings[firstStageSlug]).toBe(expectedFirstStageCeiling);
    expect(ceilingResult.projectCeiling).toBe(expectedProjectCeiling);

    await waitForCostPreview();

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Autostart/i }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(createProjectAndAutoStartSpy).toHaveBeenCalledTimes(1);
    });
    expect(createProjectAndAutoStartSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        processTemplateId: domainProcessAssociation.process_template_id,
        selectedDomainId: domainId,
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining('/dialectic/proj-cost-ceiling-int/session/sess-cost-ceiling-int'),
      expect.objectContaining({
        state: expect.objectContaining({ autoStartGeneration: true }),
      }),
    );
  });

  it('null prerequisites: userTier null → subscription tier unavailable footer, not OUTPUT_CAP_NOT_INITIALIZED', async () => {
    seedAuthForCostCeilingIntegration({
      isLoading: false,
      userTier: null,
      error: null,
    });
    seedPreProjectFormStore(defaultSelectedModels);
    renderWithRouter(<CreateDialecticProjectForm />);

    await waitForHydrationComplete();

    await waitFor(() => {
      expect(screen.getByTestId('create-project-estimate-error-notice').textContent).toBe(
        subscriptionTierUnavailableMessage,
      );
    });
    expect(screen.queryByText('Output cap is not initialized in dialectic store.')).toBeNull();
    expect(screen.queryByTestId('create-project-no-estimate-notice')).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Autoconfig/i }).getAttribute('aria-checked')).toBe(
      'mixed',
    );
    expectSetupModeDemotionText(subscriptionTierUnavailableMessage);
    expect(screen.queryByTestId('create-project-cost-preview')).toBeNull();
  });

  it('null prerequisites: auth still loading → loading notice only', async () => {
    seedAuthForCostCeilingIntegration({
      isLoading: true,
      userTier: integrationUserTier,
      error: null,
    });
    seedPreProjectFormStore(defaultSelectedModels);
    renderWithRouter(<CreateDialecticProjectForm />);

    await waitFor(() => {
      expect(screen.getByTestId('create-project-estimate-loading-notice').textContent).toContain(
        'Loading subscription tier…',
      );
    });
    expect(screen.queryByTestId('create-project-estimate-error-notice')).toBeNull();
    expect(screen.queryByTestId('create-project-no-estimate-notice')).toBeNull();
  });

  it('null prerequisites: tier loaded and catalog ready but cap init fails → pass-through init error', async () => {
    registerNoDefaultGenerationModelsMswHandlers();
    seedPreProjectFormStore(emptySelectedModels);
    renderWithRouter(<CreateDialecticProjectForm />);

    await waitForHydrationComplete();

    await waitFor(() => {
      expect(screen.getByTestId('create-project-estimate-error-notice').textContent).toBe(
        noDefaultGenerationModelsInitErrorMessage,
      );
      expect(useDialecticStore.getState().maxOutputTokens).toBeNull();
    });
    expect(screen.queryByTestId('create-project-no-estimate-notice')).toBeNull();
    expect(screen.queryByTestId('create-project-cost-preview')).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Autoconfig/i }).getAttribute('aria-checked')).toBe(
      'mixed',
    );
    expectSetupModeDemotionText(noDefaultGenerationModelsInitErrorMessage);
  });

  it('API counts error: getStageExpectedCounts 500 → selector error reference and estimate-error notice', async () => {
    registerStageExpectedCountsErrorHandler();
    seedPreProjectFormStore(defaultSelectedModels);
    renderWithRouter(<CreateDialecticProjectForm />);

    await waitForHydrationComplete();

    await waitFor(() => {
      const storeState = useDialecticStore.getState();
      expect(storeState.stageExpectedCountsError).not.toBeNull();
      expect(storeState.preProjectStageExpectedCounts).toBeNull();
    });

    const storeState = useDialecticStore.getState();
    const stageExpectedCountsError = storeState.stageExpectedCountsError;
    if (stageExpectedCountsError === null) {
      throw new Error('stageExpectedCountsError should be set after API 500');
    }

    const ceilingResult = selectPreProjectCostCeiling(storeState);
    if (!('error' in ceilingResult)) {
      throw new Error('selectPreProjectCostCeiling should return error when stage counts fail');
    }
    expect(ceilingResult.error).toBe(stageExpectedCountsError);

    await waitFor(() => {
      expect(screen.getByTestId('create-project-estimate-error-notice').textContent).toBe(
        stageExpectedCountsError.message,
      );
    });
    expect(screen.queryByTestId('create-project-no-estimate-notice')).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Autoconfig/i }).getAttribute('aria-checked')).toBe(
      'mixed',
    );
  });

  it('insufficient wallet: Autoconfig default, top-up link, Create enabled, autoconfig submit allowed', async () => {
    seedPreProjectFormStore(defaultSelectedModels);
    setWalletBalance(lowWalletBalance);
    renderWithRouter(<CreateDialecticProjectForm />);

    await waitForHydrationComplete();

    await waitForCostPreview();

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Autoconfig/i }).getAttribute('aria-checked')).toBe(
        'mixed',
      );
      expect(screen.getByTestId('create-project-autostart-top-up-link').getAttribute('href')).toBe(
        '/subscription?tab=top-up',
      );
    });

    const createProjectButton: HTMLElement = screen.getByRole('button', { name: /Create Project/i });
    if (!(createProjectButton instanceof HTMLButtonElement)) {
      throw new Error('Expected create project control to be HTMLButtonElement');
    }
    expect(createProjectButton.disabled).toBe(false);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(createProjectAndAutoStartSpy).toHaveBeenCalledTimes(1);
    });
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining('/dialectic/proj-cost-ceiling-int/session/sess-cost-ceiling-int'),
      expect.objectContaining({
        state: expect.objectContaining({ autoStartGeneration: false }),
      }),
    );
  });

  it('cost preview shows abbreviated token counts for large ceilings', async () => {
    registerLargeCeilingMswHandlers();
    seedAuthForCostCeilingIntegration({
      isLoading: false,
      userTier: integrationUserTierLargeCap,
      error: null,
    });
    seedPreProjectFormStore(defaultSelectedModels);
    renderWithRouter(<CreateDialecticProjectForm />);

    await waitForHydrationComplete();

    await waitFor(() => {
      expect(useDialecticStore.getState().maxOutputTokens).toBe(largeTierOutputCapTokens);
    });

    const ceilingResult = selectPreProjectCostCeiling(useDialecticStore.getState());
    if ('error' in ceilingResult) {
      throw new Error('selectPreProjectCostCeiling should return success for large ceiling fixture');
    }
    expect(ceilingResult.stageCeilings[firstStageSlug]).toBe(expectedLargeFirstStageCeiling);
    expect(ceilingResult.projectCeiling).toBe(expectedLargeProjectCeiling);

    await waitFor(() => {
      const preview = screen.getByTestId('create-project-cost-preview');
      expect(preview.textContent).toContain('39K');
      expect(preview.textContent).not.toContain('39,015');
      expect(preview.textContent).toContain('1.1M');
      expect(preview.textContent).not.toContain('1,139,238');
    });
  });
});
