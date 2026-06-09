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
  ChatMessage,
  CreateProjectAutoStartResult,
  DialecticDomainRow,
  DialecticProcessTemplate,
  DialecticStage,
  DialecticStore,
  DomainProcessAssociationRow,
  GetStageExpectedCountsResponse,
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
  selectCurrentChatSelectionState,
  selectPreProjectCostCeiling,
  useAiStore,
  useDialecticStore,
  useWalletStore,
} from '@paynless/store';
import { CreateProjectFromChatButton } from './CreateProjectFromChatButton';
import {
  mockAiModelConfig,
  mockAiProvidersRow,
  mockDialecticDomain,
  mockDialecticProcessTemplate,
  mockDialecticStage,
  mockDomainProcessAssociationRow,
} from '../../mocks/dialecticStore.mock';
import { toast } from 'sonner';

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
const userId = 'create-chat-cost-ceiling-user';

const domainId = 'domain-cost-ceiling-int';
const processTemplateId = 'pt-cost-ceiling-int';
const firstStageSlug = 'thesis';
const maxOutputTokens = 1000;
const outputTokenCostRate = 2;
const modelId = 'model-cost-ceiling-1';
const chatIdForIntegration = 'chat-cost-ceiling-int';

const noEstimateToastCopy =
  'No cost estimate yet. Set the output cap in Model Settings, then try again.';

const nsfToastCopy =
  'Insufficient tokens for auto-start. Top up your wallet to continue.';

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
  throw new Error('create chat cost ceiling integration fixture computation failed');
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

const integrationUserMessage: ChatMessage = {
  id: 'chat-int-msg-user',
  chat_id: chatIdForIntegration,
  role: 'user',
  content: 'Integration test user prompt',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  is_active_in_thread: true,
  ai_provider_id: null,
  system_prompt_id: null,
  token_usage: null,
  user_id: userId,
  error_type: null,
  response_to_message_id: null,
};

const integrationAssistantMessage: ChatMessage = {
  id: 'chat-int-msg-assistant',
  chat_id: chatIdForIntegration,
  role: 'assistant',
  content: 'Integration test assistant reply',
  created_at: '2024-01-01T00:00:01.000Z',
  updated_at: '2024-01-01T00:00:01.000Z',
  is_active_in_thread: true,
  ai_provider_id: modelId,
  system_prompt_id: null,
  token_usage: null,
  user_id: null,
  error_type: null,
  response_to_message_id: integrationUserMessage.id,
};

const integrationChatMessages: ChatMessage[] = [
  integrationUserMessage,
  integrationAssistantMessage,
];

const server = setupServer();

let createProjectAndAutoStartSpy: MockInstance<
  Parameters<DialecticStore['createProjectAndAutoStart']>,
  ReturnType<DialecticStore['createProjectAndAutoStart']>
>;

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

function seedChatButtonStore(maxOutputTokensOverride: number | null = maxOutputTokens): void {
  act(() => {
    useDialecticStore.setState({
      selectedDomain,
      domains: [selectedDomain],
      maxOutputTokens: maxOutputTokensOverride,
      modelCatalog: [],
      isLoadingModelCatalog: false,
    });
    useAiStore.setState({
      newChatContext: 'personal',
      currentChatId: chatIdForIntegration,
      messagesByChatId: { [chatIdForIntegration]: integrationChatMessages },
      selectedMessagesMap: {
        [chatIdForIntegration]: {
          [integrationUserMessage.id]: true,
          [integrationAssistantMessage.id]: false,
        },
      },
    });
  });
}

async function clickCreateProjectFromChatButton(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Create Project/i }));
}

describe('CreateProjectFromChatButton cost ceiling integration', () => {
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
      projectId: 'proj-chat-cost-ceiling-int',
      sessionId: 'sess-chat-cost-ceiling-int',
      hasDefaultModels: true,
    };
    createProjectAndAutoStartSpy = vi
      .spyOn(useDialecticStore.getState(), 'createProjectAndAutoStart')
      .mockResolvedValue(autoStartResult);
  });

  it('success stack: API → store → selectPreProjectCostCeiling → click gate allows autostart create', async () => {
    seedChatButtonStore();
    renderWithRouter(<CreateProjectFromChatButton />);

    expect(selectCurrentChatSelectionState(useAiStore.getState())).toBe('some');
    expect(screen.getByRole('button', { name: /Create Project/i })).toBeEnabled();

    await clickCreateProjectFromChatButton();

    await waitFor(() => {
      const storeState = useDialecticStore.getState();
      expect(storeState.selectedDomainProcessAssociation?.process_template_id).toBe(
        processTemplateId,
      );
      expect(storeState.preProjectStageExpectedCounts).toEqual(stageExpectedCountsResponse.stages);
      expect(storeState.currentProcessTemplate?.id).toBe(processTemplateId);
      expect(storeState.modelCatalog).toEqual([catalogRow]);
    });

    const ceilingResult = selectPreProjectCostCeiling(useDialecticStore.getState());
    if (ceilingResult === null || 'error' in ceilingResult) {
      throw new Error('selectPreProjectCostCeiling should return success after click orchestration');
    }
    expect(ceilingResult.stageCeilings[firstStageSlug]).toBe(expectedFirstStageCeiling);
    expect(ceilingResult.projectCeiling).toBe(expectedProjectCeiling);

    await waitFor(() => {
      expect(createProjectAndAutoStartSpy).toHaveBeenCalledTimes(1);
    });
    expect(createProjectAndAutoStartSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        processTemplateId: domainProcessAssociation.process_template_id,
        selectedDomainId: domainId,
      }),
    );
  });

  it('null prerequisites: missing maxOutputTokens → toast error and no create', async () => {
    seedChatButtonStore(null);
    renderWithRouter(<CreateProjectFromChatButton />);

    await clickCreateProjectFromChatButton();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(noEstimateToastCopy);
    });
    expect(selectPreProjectCostCeiling(useDialecticStore.getState())).toBeNull();
    expect(createProjectAndAutoStartSpy).not.toHaveBeenCalled();
  });

  it('API counts error: getStageExpectedCounts 500 → click gate fail-closes without create', async () => {
    registerStageExpectedCountsErrorHandler();
    seedChatButtonStore();
    renderWithRouter(<CreateProjectFromChatButton />);

    await clickCreateProjectFromChatButton();

    await waitFor(() => {
      const storeState = useDialecticStore.getState();
      expect(storeState.stageExpectedCountsError).not.toBeNull();
      expect(storeState.preProjectStageExpectedCounts).toBeNull();
    });

    // Real fetchStageExpectedCounts surfaces the MSW 500; selector stays null at click gate.
    expect(selectPreProjectCostCeiling(useDialecticStore.getState())).toBeNull();
    expect(createProjectAndAutoStartSpy).not.toHaveBeenCalled();
  });

  it('insufficient wallet: balance below first-stage ceiling → NSF toast and no create', async () => {
    seedChatButtonStore();
    setWalletBalance(lowWalletBalance);
    renderWithRouter(<CreateProjectFromChatButton />);

    await clickCreateProjectFromChatButton();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(nsfToastCopy);
    });
    expect(createProjectAndAutoStartSpy).not.toHaveBeenCalled();
  });
});
