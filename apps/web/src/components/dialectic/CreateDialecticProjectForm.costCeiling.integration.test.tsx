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
  SelectedModels,
  TokenWallet,
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
  selectPreProjectCostCeiling,
  useAiStore,
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
      capabilities: { platform: 'web' as const },
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

const domainId = 'domain-cost-ceiling-int';
const processTemplateId = 'pt-cost-ceiling-int';
const firstStageSlug = 'thesis';
const maxOutputTokens = 1000;
const outputTokenCostRate = 2;
const modelId = 'model-cost-ceiling-1';

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
  (entry) =>
    buildComputeCostCeilingStageInput({
      stageSlug: entry.stageSlug,
      expectedCount: entry.expectedCount,
      contributions: [],
    }),
);

const outputTokenCostRates: number[] = [outputTokenCostRate];

const ceilingComputationResult = computeCostCeiling(
  buildComputeCostCeilingDeps(),
  buildComputeCostCeilingParams(),
  buildComputeCostCeilingPayload({
    stages: ceilingStages,
    maxOutputTokens,
    outputTokenCostRates,
  }),
);

if ('error' in ceilingComputationResult) {
  throw new Error('create form cost ceiling integration fixture computation failed');
}

const expectedFirstStageCeiling: number =
  ceilingComputationResult.stageCeilings[firstStageSlug];
const expectedProjectCeiling: number = ceilingComputationResult.projectCeiling;
const sufficientWalletBalance: string = String(expectedFirstStageCeiling + 2000);
const lowWalletBalance: string = String(expectedFirstStageCeiling - 1);

const modelConfig: AiModelExtendedConfig = mockAiModelConfig({
  output_token_cost_rate: outputTokenCostRate,
});
if (!isJson(modelConfig)) {
  throw new Error('model config is not a valid JSON object');
}

const catalogRow: AiProvidersRow = mockAiProvidersRow({
  id: modelId,
  name: 'Default Model',
  is_default_generation: true,
  is_active: true,
  config: modelConfig,
});

const selectedModels: SelectedModels[] = [{ id: modelId, displayName: 'Default Model' }];

const server = setupServer();

let createProjectAndAutoStartSpy: MockInstance<
  Parameters<DialecticStore['createProjectAndAutoStart']>,
  ReturnType<DialecticStore['createProjectAndAutoStart']>
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

function seedPreProjectFormStore(maxOutputTokensOverride: number | null = maxOutputTokens): void {
  act(() => {
    useDialecticStore.setState({
      selectedDomain,
      domains: [selectedDomain],
      selectedModels,
      maxOutputTokens: maxOutputTokensOverride,
    });
  });
}

async function waitForCostPreview(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId('create-project-cost-preview')).toHaveTextContent(
      formatTokenCount(expectedProjectCeiling),
    );
    expect(screen.getByTestId('create-project-cost-preview')).toHaveTextContent(
      formatTokenCount(expectedFirstStageCeiling),
    );
  });
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

  it('success stack: API → store → selectPreProjectCostCeiling → preview → afford autostart submit', async () => {
    seedPreProjectFormStore();
    renderWithRouter(<CreateDialecticProjectForm />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading models/i)).not.toBeInTheDocument();
    });

    await waitFor(() => {
      const storeState = useDialecticStore.getState();
      expect(storeState.selectedDomainProcessAssociation?.process_template_id).toBe(
        processTemplateId,
      );
      expect(storeState.preProjectStageExpectedCounts).toEqual(stageExpectedCountsResponse.stages);
      expect(storeState.currentProcessTemplate?.id).toBe(processTemplateId);
    });

    const ceilingResult = selectPreProjectCostCeiling(useDialecticStore.getState());
    if (ceilingResult === null || 'error' in ceilingResult) {
      throw new Error('selectPreProjectCostCeiling should return success after API hydration');
    }
    expect(ceilingResult.stageCeilings[firstStageSlug]).toBe(expectedFirstStageCeiling);
    expect(ceilingResult.projectCeiling).toBe(expectedProjectCeiling);

    await waitForCostPreview();

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Autostart/i })).toBeChecked();
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

  it('null prerequisites: missing maxOutputTokens → no-estimate notice and Autostart off', async () => {
    seedPreProjectFormStore(null);
    renderWithRouter(<CreateDialecticProjectForm />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading models/i)).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('create-project-no-estimate-notice')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /Autoconfig/i })).toHaveAttribute(
        'aria-checked',
        'mixed',
      );
    });

    expect(selectPreProjectCostCeiling(useDialecticStore.getState())).toBeNull();
    expect(screen.queryByTestId('create-project-cost-preview')).not.toBeInTheDocument();
  });

  it('API counts error: getStageExpectedCounts 500 → no-estimate notice and Autostart off', async () => {
    registerStageExpectedCountsErrorHandler();
    seedPreProjectFormStore();
    renderWithRouter(<CreateDialecticProjectForm />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading models/i)).not.toBeInTheDocument();
    });

    await waitFor(() => {
      const storeState = useDialecticStore.getState();
      expect(storeState.stageExpectedCountsError).not.toBeNull();
      expect(storeState.preProjectStageExpectedCounts).toBeNull();
    });

    // Real fetchStageExpectedCounts surfaces the MSW 500; selector stays null at counts.
    expect(selectPreProjectCostCeiling(useDialecticStore.getState())).toBeNull();

    await waitFor(() => {
      expect(screen.getByTestId('create-project-no-estimate-notice')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /Autoconfig/i })).toHaveAttribute(
        'aria-checked',
        'mixed',
      );
    });
  });

  it('insufficient wallet: Autoconfig default, top-up link, Create enabled, autoconfig submit allowed', async () => {
    seedPreProjectFormStore();
    setWalletBalance(lowWalletBalance);
    renderWithRouter(<CreateDialecticProjectForm />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading models/i)).not.toBeInTheDocument();
    });

    await waitForCostPreview();

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Autoconfig/i })).toHaveAttribute(
        'aria-checked',
        'mixed',
      );
      expect(screen.getByTestId('create-project-autostart-top-up-link')).toHaveAttribute(
        'href',
        '/subscription?tab=top-up',
      );
    });

    expect(screen.getByRole('button', { name: /Create Project/i })).toBeEnabled();

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
});
