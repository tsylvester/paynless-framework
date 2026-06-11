import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import {
  initializeMockDialecticState,
  setDialecticStateValues,
  getDialecticStoreActionMock,
  mockDialecticDomain,
  mockDialecticStage,
  mockDialecticProcessTemplate,
  mockAiProvidersRow,
  mockDomainProcessAssociationRow,
} from '@/mocks/dialecticStore.mock';
import { mockSetState, resetAiStoreMock } from '@/mocks/aiStore.mock';
import {
  mockedUseAuthStoreHookLogic,
  mockSetAuthIsLoading,
  resetAuthStoreMock,
} from '@/mocks/authStore.mock';
import { mockAllTiers, mockUserTier } from '@/mocks/profile.mock';
import { selectActiveChatWalletInfo } from '@paynless/store';
import type {
  ActiveChatWalletInfo,
  AiProvidersRow,
  ApiError,
  ChatMessage,
  CreateProjectAutoStartResult,
  DialecticDomainRow,
  DialecticProcessTemplate,
  DialecticStage,
  DialecticStateValues,
  DomainProcessAssociationRow,
  FetchProcessAssociationPayload,
} from '@paynless/types';
import {
  ComputeCostCeilingReturn,
  ComputeCostCeilingSuccessReturn,
} from '@paynless/utils';
import { toast } from 'sonner';

import { CreateProjectFromChatButton } from './CreateProjectFromChatButton.tsx';
import { buildComputeCostCeilingErrorReturn } from '../../../../../packages/utils/src/computeCostCeiling/computeCostCeiling.mock';

const mockNavigate = vi.fn();
const mockFormatChatMessagesAsPrompt = vi.fn();

const { selectPreProjectCostCeilingMock } = vi.hoisted(() => ({
  selectPreProjectCostCeilingMock: vi.fn<
    [DialecticStateValues],
    ComputeCostCeilingReturn
  >(() => ({
    stageCeilings: { thesis: 120000 },
    projectCeiling: 350000,
  })),
}));

vi.mock('@paynless/store', async (importOriginal) => {
  const dialecticMock = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>(
    '@/mocks/dialecticStore.mock',
  );
  const actual = await importOriginal<typeof import('@paynless/store')>();
  const walletStoreMock = await vi.importActual<typeof import('@/mocks/walletStore.mock')>(
    '@/mocks/walletStore.mock',
  );
  const aiStoreMock = await vi.importActual<typeof import('@/mocks/aiStore.mock')>(
    '@/mocks/aiStore.mock',
  );
  const authStoreMock = await vi.importActual<typeof import('@/mocks/authStore.mock')>(
    '@/mocks/authStore.mock',
  );
  return {
    ...dialecticMock,
    useAuthStore: authStoreMock.useAuthStore,
    useAiStore: aiStoreMock.useMockedAiStoreHookLogic,
    useWalletStore: walletStoreMock.useWalletStore,
    selectActiveChatWalletInfo: walletStoreMock.selectActiveChatWalletInfo,
    initialWalletStateValues: actual.initialWalletStateValues,
    initialDialecticStateValues: actual.initialDialecticStateValues,
    selectSelectedChatMessages: actual.selectSelectedChatMessages,
    selectCurrentChatSelectionState: actual.selectCurrentChatSelectionState,
    selectDomains: actual.selectDomains,
    selectSelectedDomain: actual.selectSelectedDomain,
    selectDefaultGenerationModels: actual.selectDefaultGenerationModels,
    selectPreProjectCostCeiling: selectPreProjectCostCeilingMock,
  };
});

vi.mock('@/utils/formatChatMessagesAsPrompt', () => ({
  formatChatMessagesAsPrompt: (messages: ChatMessage[]) => mockFormatChatMessagesAsPrompt(messages),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

const autostartSuccessCeiling: ComputeCostCeilingSuccessReturn = {
  stageCeilings: { thesis: 120000 },
  projectCeiling: 350000,
};

const firstStageCeilingForAutostartTest = 120000;

const outputCapNotInitializedError: ApiError = {
  code: 'OUTPUT_CAP_NOT_INITIALIZED',
  message: 'Output cap is not initialized in dialectic store.',
};

const subscriptionTierUnavailableMessage = 'Subscription tier is not available.';

const nsfToastCopy =
  'Insufficient tokens for auto-start. Top up your wallet to continue.';

const defaultWalletInfo: ActiveChatWalletInfo = {
  status: 'ok',
  type: 'personal',
  walletId: 'wallet-1',
  orgId: null,
  balance: '300000',
  isLoadingPrimaryWallet: false,
};

const autostartCatalogEntryOverrides: Partial<AiProvidersRow> = {
  provider: 'Provider',
  description: null,
  config: null,
  created_at: '',
  updated_at: '',
  is_default_embedding: false,
  min_plan_tier_level: 0,
};

const stageThesisForChatAutostart: DialecticStage = mockDialecticStage({
  id: 'stage-thesis-chat',
  slug: 'thesis',
  display_name: 'Proposal',
  default_system_prompt_id: null,
});

const processTemplateGeneral: DialecticProcessTemplate = mockDialecticProcessTemplate({
  id: 'pt-general',
  name: 'Chat autostart template',
  description: null,
  starting_stage_id: stageThesisForChatAutostart.id,
  stages: [stageThesisForChatAutostart],
  transitions: [],
});

const generalDomain: DialecticDomainRow = mockDialecticDomain({
  id: 'domain-general',
  name: 'General',
  description: '',
});

const otherDomain: DialecticDomainRow = mockDialecticDomain({
  id: 'domain-other',
  name: 'Other',
  description: '',
});

const mockGeneralAssociation: DomainProcessAssociationRow = mockDomainProcessAssociationRow({
  domain_id: generalDomain.id,
  is_default_for_domain: true,
  process_template_id: 'pt-general',
});

const mockOtherAssociation: DomainProcessAssociationRow = mockDomainProcessAssociationRow({
  domain_id: otherDomain.id,
  is_default_for_domain: true,
  process_template_id: 'pt-other',
});

const defaultCatalogWithDefaultModel: AiProvidersRow[] = [
  mockAiProvidersRow({
    ...autostartCatalogEntryOverrides,
    id: 'dft',
    name: 'Default',
    api_identifier: 'dft',
    is_default_generation: true,
    is_active: true,
    config: { provider_max_output_tokens: 200000 },
  }),
];

const catalogNoDefaultGeneration: AiProvidersRow[] = [
  mockAiProvidersRow({
    ...autostartCatalogEntryOverrides,
    id: 'm1',
    name: 'Model 1',
    api_identifier: 'm1',
    is_default_generation: false,
    is_active: true,
    config: { provider_max_output_tokens: 200000 },
  }),
];

const chatIdForSelection = 'chat-1';

function seedChatSelectionForTest(
  messages: ChatMessage[],
  selectionState: 'all' | 'some' | 'none' | 'empty',
): void {
  if (selectionState === 'empty') {
    mockSetState({
      currentChatId: chatIdForSelection,
      messagesByChatId: { [chatIdForSelection]: [] },
      selectedMessagesMap: {},
      newChatContext: 'personal',
    });
    return;
  }

  const selectionByMessageId: Record<string, boolean> = {};
  if (selectionState === 'none') {
    for (const message of messages) {
      selectionByMessageId[message.id] = false;
    }
  } else if (selectionState === 'all') {
    for (const message of messages) {
      selectionByMessageId[message.id] = true;
    }
  } else {
    for (let index = 0; index < messages.length; index++) {
      selectionByMessageId[messages[index].id] = index === 0;
    }
  }

  mockSetState({
    currentChatId: chatIdForSelection,
    messagesByChatId: { [chatIdForSelection]: messages },
    selectedMessagesMap: { [chatIdForSelection]: selectionByMessageId },
    newChatContext: 'personal',
  });
}

function makeChatMessage(overrides: { id: string; role: string; content: string }): ChatMessage {
  return {
    id: overrides.id,
    chat_id: 'chat-1',
    role: overrides.role,
    content: overrides.content,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    is_active_in_thread: true,
    ai_provider_id: null,
    system_prompt_id: null,
    token_usage: null,
    user_id: null,
    error_type: null,
    response_to_message_id: null,
  };
}

function initializeAutostartChatHappyPath(
  overrides?: Partial<DialecticStateValues>,
): void {
  selectPreProjectCostCeilingMock.mockReturnValue(autostartSuccessCeiling);
  vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);
  mockedUseAuthStoreHookLogic.setState({
    isLoading: false,
    userTier: mockUserTier,
    availableTiers: mockAllTiers,
    error: null,
  });
  initializeMockDialecticState({
    domains: [generalDomain, otherDomain],
    selectedDomain: generalDomain,
    selectedDomainProcessAssociation: mockGeneralAssociation,
    modelCatalog: defaultCatalogWithDefaultModel,
    maxOutputTokens: 8192,
    isLoadingModelCatalog: false,
    isLoadingDomainProcessAssociation: false,
    isLoadingProcessTemplate: false,
    isLoadingStageExpectedCounts: false,
    currentProcessTemplate: processTemplateGeneral,
    isAutoStarting: false,
    autoStartStep: null,
    ...overrides,
  });
}

function wireFetchProcessAssociationMock(): void {
  vi.mocked(getDialecticStoreActionMock('fetchProcessAssociation')).mockImplementation(
    async (payload: FetchProcessAssociationPayload) => {
      let association: DomainProcessAssociationRow | null = null;
      if (payload.domainId === generalDomain.id) {
        association = mockGeneralAssociation;
      } else if (payload.domainId === otherDomain.id) {
        association = mockOtherAssociation;
      }
      setDialecticStateValues({ selectedDomainProcessAssociation: association });
    },
  );
}

let mockSelectedMessages: ChatMessage[];
let mockSelectionState: 'all' | 'some' | 'none' | 'empty';

describe('CreateProjectFromChatButton', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetAuthStoreMock();
    mockedUseAuthStoreHookLogic.setState({
      isLoading: false,
      userTier: mockUserTier,
      availableTiers: mockAllTiers,
      error: null,
    });
    mockSelectedMessages = [
      makeChatMessage({ id: '1', role: 'user', content: 'First user line\nSecond line' }),
      makeChatMessage({ id: '2', role: 'assistant', content: 'Reply' }),
    ];
    mockSelectionState = 'some';
    mockFormatChatMessagesAsPrompt.mockReturnValue('User: First user line\n\nAssistant: Reply');

    selectPreProjectCostCeilingMock.mockReturnValue(autostartSuccessCeiling);

    initializeMockDialecticState({
      domains: [generalDomain, otherDomain],
      selectedDomain: null,
      isAutoStarting: false,
      autoStartStep: null,
    });

    const { initializeMockWalletStore } = await import('@/mocks/walletStore.mock');
    initializeMockWalletStore();
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(defaultWalletInfo);
    wireFetchProcessAssociationMock();

    resetAiStoreMock();
    seedChatSelectionForTest(mockSelectedMessages, mockSelectionState);
  });

  it('renders a button with text "Create Project"', () => {
    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    const createButton: HTMLElement = screen.getByRole('button', { name: /Create Project/i });
    if (!(createButton instanceof HTMLButtonElement)) {
      throw new Error('Expected create button to be HTMLButtonElement');
    }
    expect(createButton).toBeDefined();
  });

  it('button is disabled when selection state is "none"', () => {
    mockSelectionState = 'none';
    seedChatSelectionForTest(mockSelectedMessages, mockSelectionState);
    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    const createButton: HTMLElement = screen.getByRole('button', { name: /Create Project/i });
    if (!(createButton instanceof HTMLButtonElement)) {
      throw new Error('Expected create button to be HTMLButtonElement');
    }
    expect(createButton.disabled).toBe(true);
  });

  it('button is disabled when selection state is "empty"', () => {
    mockSelectionState = 'empty';
    seedChatSelectionForTest(mockSelectedMessages, mockSelectionState);
    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    const createButton: HTMLElement = screen.getByRole('button', { name: /Create Project/i });
    if (!(createButton instanceof HTMLButtonElement)) {
      throw new Error('Expected create button to be HTMLButtonElement');
    }
    expect(createButton.disabled).toBe(true);
  });

  it('button is disabled when isAutoStarting is true', () => {
    setDialecticStateValues({ isAutoStarting: true, autoStartStep: 'Creating project…' });
    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    const createButton: HTMLElement = screen.getByTestId('create-project-from-chat-button');
    if (!(createButton instanceof HTMLButtonElement)) {
      throw new Error('Expected create button to be HTMLButtonElement');
    }
    expect(createButton.disabled).toBe(true);
  });

  it('button is enabled when selection state is "all" and not auto-starting', () => {
    mockSelectionState = 'all';
    seedChatSelectionForTest(mockSelectedMessages, mockSelectionState);
    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    const createButton: HTMLElement = screen.getByRole('button', { name: /Create Project/i });
    if (!(createButton instanceof HTMLButtonElement)) {
      throw new Error('Expected create button to be HTMLButtonElement');
    }
    expect(createButton.disabled).toBe(false);
  });

  it('button is enabled when selection state is "some" and not auto-starting', () => {
    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    const createButton: HTMLElement = screen.getByRole('button', { name: /Create Project/i });
    if (!(createButton instanceof HTMLButtonElement)) {
      throw new Error('Expected create button to be HTMLButtonElement');
    }
    expect(createButton.disabled).toBe(false);
  });

  it('on click, calls fetchDomains if domains array is empty', async () => {
    const user = userEvent.setup();
    initializeMockDialecticState({
      domains: [],
      selectedDomain: null,
      isAutoStarting: false,
      autoStartStep: null,
    });
    const fetchDomainsMock = getDialecticStoreActionMock('fetchDomains');
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(fetchDomainsMock).toHaveBeenCalled();
    });
  });

  it('on click, uses selectedDomain.id as selectedDomainId when a domain is already selected', async () => {
    const user = userEvent.setup();
    initializeAutostartChatHappyPath({
      selectedDomain: otherDomain,
      selectedDomainProcessAssociation: mockOtherAssociation,
      domains: [generalDomain, otherDomain],
    });
    const createProjectAndAutoStartMock = getDialecticStoreActionMock('createProjectAndAutoStart');
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(createProjectAndAutoStartMock).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(createProjectAndAutoStartMock).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedDomainId: 'domain-other',
          processTemplateId: 'pt-other',
          idempotencyKey: expect.any(String),
          sessionIdempotencyKey: expect.any(String),
        }),
      );
    });
  });

  it('on click, shows error toast when selectedDomain is null (domain comes from selector, no fallback)', async () => {
    const user = userEvent.setup();
    setDialecticStateValues({ selectedDomain: null, domains: [generalDomain, otherDomain] });

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(getDialecticStoreActionMock('createProjectAndAutoStart')).not.toHaveBeenCalled();
  });

  it('on click, shows error toast if no domain can be resolved (empty domains list, no selectedDomain)', async () => {
    const user = userEvent.setup();
    initializeMockDialecticState({
      domains: [],
      selectedDomain: null,
      isAutoStarting: false,
      autoStartStep: null,
    });
    vi.mocked(getDialecticStoreActionMock('fetchDomains')).mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it('on click, calls formatChatMessagesAsPrompt with the selected messages', async () => {
    const user = userEvent.setup();
    seedChatSelectionForTest(mockSelectedMessages, 'all');
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(mockFormatChatMessagesAsPrompt).toHaveBeenCalledWith(mockSelectedMessages);
    });
  });

  it('on click, derives projectName from first user message content (first line, truncated to 50 chars)', async () => {
    const user = userEvent.setup();
    const longFirstLine = 'a'.repeat(60);
    mockSelectedMessages = [
      makeChatMessage({ id: '1', role: 'user', content: `${longFirstLine}\nsecond` }),
    ];
    seedChatSelectionForTest(mockSelectedMessages, mockSelectionState);
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    const createProjectAndAutoStartMock = getDialecticStoreActionMock('createProjectAndAutoStart');
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(createProjectAndAutoStartMock).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(createProjectAndAutoStartMock).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: longFirstLine.slice(0, 50),
          selectedDomainId: 'domain-general',
          processTemplateId: 'pt-general',
          idempotencyKey: expect.any(String),
          sessionIdempotencyKey: expect.any(String),
        }),
      );
    });
  });

  it('on click, calls createProjectAndAutoStart with projectName, initialUserPrompt, selectedDomainId, processTemplateId, idempotencyKey, and sessionIdempotencyKey', async () => {
    const user = userEvent.setup();
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    const createProjectAndAutoStartMock = getDialecticStoreActionMock('createProjectAndAutoStart');
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(createProjectAndAutoStartMock).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(createProjectAndAutoStartMock).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: expect.any(String),
          initialUserPrompt: expect.any(String),
          selectedDomainId: 'domain-general',
          processTemplateId: 'pt-general',
          idempotencyKey: expect.any(String),
          sessionIdempotencyKey: expect.any(String),
        }),
      );
    });
  });

  it('on click, passes distinct idempotencyKey and sessionIdempotencyKey (permanent keys from UI)', async () => {
    const user = userEvent.setup();
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    const createProjectAndAutoStartMock = getDialecticStoreActionMock('createProjectAndAutoStart');
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(createProjectAndAutoStartMock).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(createProjectAndAutoStartMock).toHaveBeenCalledTimes(1);
      const payload: { idempotencyKey: string; sessionIdempotencyKey: string } =
        vi.mocked(createProjectAndAutoStartMock).mock.calls[0][0];
      expect(payload.idempotencyKey).toBeTruthy();
      expect(payload.sessionIdempotencyKey).toBeTruthy();
      expect(payload.idempotencyKey).not.toBe(payload.sessionIdempotencyKey);
    });
  });

  it('on success with sessionId !== null and hasDefaultModels true, navigates to /dialectic/${projectId}/session/${sessionId} with state: { autoStartGeneration: true }', async () => {
    const user = userEvent.setup();
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-123',
      sessionId: 'sess-456',
      hasDefaultModels: true,
    };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dialectic/proj-123/session/sess-456', {
        state: { autoStartGeneration: true },
      });
    });
  });

  it('on success with sessionId !== null and hasDefaultModels false, navigates to /dialectic/${projectId}/session/${sessionId} without autoStartGeneration state', async () => {
    const user = userEvent.setup();
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-123',
      sessionId: 'sess-456',
      hasDefaultModels: false,
    };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      const navCall = mockNavigate.mock.calls[0];
      expect(navCall[0]).toBe('/dialectic/proj-123/session/sess-456');
      expect(navCall[1]?.state?.autoStartGeneration).not.toBe(true);
    });
  });

  it('on success with sessionId === null, navigates to /dialectic/${projectId}', async () => {
    const user = userEvent.setup();
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-only',
      sessionId: null,
      hasDefaultModels: false,
    };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dialectic/proj-only');
    });
  });

  it('on error from createProjectAndAutoStart, shows error toast and remains on chat page', async () => {
    const user = userEvent.setup();
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValue({
      projectId: '',
      sessionId: null,
      hasDefaultModels: false,
      error: { message: 'Server error', code: 'SERVER_ERROR' },
    });

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Server error');
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('displays loading spinner and autoStartStep text while isAutoStarting is true', () => {
    setDialecticStateValues({
      isAutoStarting: true,
      autoStartStep: 'Creating project…',
    });
    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    expect(document.body.contains(screen.getByText('Creating project…'))).toBe(true);
  });

  it('does not call createDialecticProject directly (only calls createProjectAndAutoStart)', async () => {
    const user = userEvent.setup();
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    const createDialecticProjectMock = getDialecticStoreActionMock('createDialecticProject');
    const createProjectAndAutoStartMock = getDialecticStoreActionMock('createProjectAndAutoStart');
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(createProjectAndAutoStartMock).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(createProjectAndAutoStartMock).toHaveBeenCalled();
    });
    expect(createDialecticProjectMock).not.toHaveBeenCalled();
  });

  it('on click, calls fetchProcessAssociation with selected domain id', async () => {
    const user = userEvent.setup();
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    const fetchProcessAssociationMock = getDialecticStoreActionMock('fetchProcessAssociation');
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(fetchProcessAssociationMock).toHaveBeenCalledWith({
        domainId: generalDomain.id,
      });
    });
  });

  it('on click with default generation models, calls fetchProcessTemplate and fetchStageExpectedCounts before create', async () => {
    const user = userEvent.setup();
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    const fetchProcessTemplateMock = getDialecticStoreActionMock('fetchProcessTemplate');
    const fetchStageExpectedCountsMock = getDialecticStoreActionMock('fetchStageExpectedCounts');
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(fetchProcessTemplateMock).toHaveBeenCalledWith('pt-general');
      expect(fetchStageExpectedCountsMock).toHaveBeenCalledWith({
        processTemplateId: 'pt-general',
        modelCount: 1,
      });
    });
  });

  it('on click, does not call createProjectAndAutoStart when association is null after fetch', async () => {
    const user = userEvent.setup();
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    vi.mocked(getDialecticStoreActionMock('fetchProcessAssociation')).mockImplementation(async () => {
      setDialecticStateValues({ selectedDomainProcessAssociation: null });
    });

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(getDialecticStoreActionMock('createProjectAndAutoStart')).not.toHaveBeenCalled();
  });

  it('on click, does not call createProjectAndAutoStart when cost estimate returns error', async () => {
    const user = userEvent.setup();
    const estimateError: ApiError = { message: 'Invalid payload', code: 'INVALID_PAYLOAD' };
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    selectPreProjectCostCeilingMock.mockReturnValue(
      buildComputeCostCeilingErrorReturn({ error: { message: estimateError.message, code: estimateError.code } }),
    );

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(estimateError.message);
    });
    expect(getDialecticStoreActionMock('createProjectAndAutoStart')).not.toHaveBeenCalled();
  });

  it('on click, does not call createProjectAndAutoStart when wallet balance is below first-stage ceiling', async () => {
    const user = userEvent.setup();
    const lowBalanceWalletInfo: ActiveChatWalletInfo = {
      status: 'ok',
      type: 'personal',
      walletId: 'wallet-1',
      orgId: null,
      balance: String(firstStageCeilingForAutostartTest - 1),
      isLoadingPrimaryWallet: false,
    };
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    vi.mocked(selectActiveChatWalletInfo).mockReturnValue(lowBalanceWalletInfo);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(nsfToastCopy);
    });
    expect(getDialecticStoreActionMock('createProjectAndAutoStart')).not.toHaveBeenCalled();
  });

  it('on click with no default generation models, still calls createProjectAndAutoStart with processTemplateId and skips counts fetch', async () => {
    const user = userEvent.setup();
    initializeAutostartChatHappyPath({
      domains: [generalDomain],
      modelCatalog: catalogNoDefaultGeneration,
    });
    const fetchStageExpectedCountsMock = getDialecticStoreActionMock('fetchStageExpectedCounts');
    const createProjectAndAutoStartMock = getDialecticStoreActionMock('createProjectAndAutoStart');
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-no-defaults',
      sessionId: 'sess-no-defaults',
      hasDefaultModels: false,
    };
    vi.mocked(createProjectAndAutoStartMock).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(createProjectAndAutoStartMock).toHaveBeenCalledWith(
        expect.objectContaining({
          processTemplateId: 'pt-general',
        }),
      );
    });
    expect(fetchStageExpectedCountsMock).not.toHaveBeenCalled();
  });

  it('does not call createProjectAndAutoStart when selectPreProjectCostCeiling returns OUTPUT_CAP_NOT_INITIALIZED', async () => {
    const user = userEvent.setup();
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    selectPreProjectCostCeilingMock.mockReturnValue({
      error: outputCapNotInitializedError,
    });

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(outputCapNotInitializedError.message);
    });
    expect(toast.error).not.toHaveBeenCalledWith(
      'No cost estimate yet. Set the output cap in Model Settings, then try again.',
    );
    expect(getDialecticStoreActionMock('createProjectAndAutoStart')).not.toHaveBeenCalled();
  });

  it('calls initializeMaxOutputTokens on mount when isCapInitReady', async () => {
    initializeMockDialecticState({
      domains: [generalDomain, otherDomain],
      selectedDomain: generalDomain,
      modelCatalog: defaultCatalogWithDefaultModel,
      isLoadingModelCatalog: false,
      isAutoStarting: false,
      autoStartStep: null,
    });
    mockedUseAuthStoreHookLogic.setState({
      isLoading: false,
      userTier: mockUserTier,
      availableTiers: mockAllTiers,
      error: null,
    });

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(getDialecticStoreActionMock('initializeMaxOutputTokens')).toHaveBeenCalledTimes(1);
    });

    vi.clearAllMocks();

    initializeMockDialecticState({
      domains: [generalDomain, otherDomain],
      selectedDomain: generalDomain,
      modelCatalog: [],
      isLoadingModelCatalog: true,
      isAutoStarting: false,
      autoStartStep: null,
    });
    mockedUseAuthStoreHookLogic.setState({
      isLoading: false,
      userTier: mockUserTier,
      availableTiers: mockAllTiers,
      error: null,
    });

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );

    expect(getDialecticStoreActionMock('initializeMaxOutputTokens')).not.toHaveBeenCalled();
  });

  it('on click autostart path calls initializeMaxOutputTokens before fetchProcessTemplate', async () => {
    const user = userEvent.setup();
    const invocationOrder: string[] = [];

    function wireAutostartInvocationOrderSpies(): void {
      const initializeMaxOutputTokensMock = getDialecticStoreActionMock('initializeMaxOutputTokens');
      const fetchProcessTemplateMock = getDialecticStoreActionMock('fetchProcessTemplate');
      vi.mocked(initializeMaxOutputTokensMock).mockImplementation(() => {
        invocationOrder.push('initializeMaxOutputTokens');
        return { ok: true };
      });
      vi.mocked(fetchProcessTemplateMock).mockImplementation(async (templateId: string) => {
        invocationOrder.push('fetchProcessTemplate');
        void templateId;
      });
    }

    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    wireAutostartInvocationOrderSpies();
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );

    const initializeMaxOutputTokensMock = getDialecticStoreActionMock('initializeMaxOutputTokens');
    await waitFor(() => {
      expect(initializeMaxOutputTokensMock).toHaveBeenCalledTimes(1);
    });

    invocationOrder.length = 0;
    vi.mocked(initializeMaxOutputTokensMock).mockClear();
    vi.mocked(getDialecticStoreActionMock('fetchProcessTemplate')).mockClear();
    wireAutostartInvocationOrderSpies();

    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(invocationOrder).toEqual(['initializeMaxOutputTokens', 'fetchProcessTemplate']);
    });
    expect(initializeMaxOutputTokensMock).toHaveBeenCalledTimes(1);
  });

  it('while auth isLoading on click, toasts Loading subscription tier and does not create', async () => {
    const user = userEvent.setup();
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    selectPreProjectCostCeilingMock.mockReturnValue({
      error: outputCapNotInitializedError,
    });
    mockSetAuthIsLoading(true);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Loading subscription tier…');
    });
    expect(toast.error).not.toHaveBeenCalledWith(outputCapNotInitializedError.message);
    expect(getDialecticStoreActionMock('createProjectAndAutoStart')).not.toHaveBeenCalled();
  });

  it('while isLoadingStageExpectedCounts after orchestration, toasts loading copy not selector error', async () => {
    const user = userEvent.setup();
    initializeAutostartChatHappyPath({
      domains: [generalDomain],
      isLoadingStageExpectedCounts: true,
    });
    selectPreProjectCostCeilingMock.mockReturnValue({
      error: outputCapNotInitializedError,
    });

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Loading stage expected counts…');
    });
    expect(toast.error).not.toHaveBeenCalledWith(outputCapNotInitializedError.message);
    expect(getDialecticStoreActionMock('createProjectAndAutoStart')).not.toHaveBeenCalled();
  });

  it('on click when userTier null after auth load, toasts Subscription tier is not available not selector error', async () => {
    const user = userEvent.setup();
    initializeAutostartChatHappyPath({ domains: [generalDomain] });
    mockedUseAuthStoreHookLogic.setState({
      isLoading: false,
      userTier: null,
      availableTiers: mockAllTiers,
      error: null,
    });
    selectPreProjectCostCeilingMock.mockReturnValue({
      error: outputCapNotInitializedError,
    });

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(subscriptionTierUnavailableMessage);
    });
    expect(toast.error).not.toHaveBeenCalledWith(outputCapNotInitializedError.message);
    expect(getDialecticStoreActionMock('createProjectAndAutoStart')).not.toHaveBeenCalled();
  });
});
