import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initialAiStateValues } from '@paynless/types';
import type {
  AiProvider,
  AiProvidersRow,
  ApiError,
  DialecticDomainRow,
  DialecticProcessTemplate,
  DialecticStage,
  DialecticStateValues,
  DomainProcessAssociationRow,
  SelectedModels,
} from '@paynless/types';
import {
  ComputeCostCeilingReturn,
  ComputeCostCeilingSuccessReturn,
} from '@paynless/utils';
import {
  selectSortedStages,
  useDialecticStore,
} from '@paynless/store';
import Chat from './index';
import {
  getDialecticStoreActionMock,
  initializeMockDialecticState,
  mockAiProvidersRow,
  mockDialecticDomain,
  mockDialecticProcessTemplate,
  mockDialecticStage,
  mockDomainProcessAssociationRow,
  mockSelectedModel,
} from '@/mocks/dialecticStore.mock';
import {
  mockedUseAuthStoreHookLogic,
  resetAuthStoreMock,
} from '@/mocks/authStore.mock';
import { mockSetState, resetAiStoreMock } from '@/mocks/aiStore.mock';
import { mockAllTiers, mockUserTier } from '@/mocks/profile.mock';

const subscriptionTierUnavailableMessage = 'Subscription tier is not available.';

const outputCapNotInitializedError: ApiError = {
  code: 'OUTPUT_CAP_NOT_INITIALIZED',
  message: 'Output cap is not initialized in dialectic store.',
};

const selectorPassThroughError: ApiError = {
  code: 'COUNTS_ERROR',
  message: 'Stage expected counts are unavailable.',
};

const { selectPreProjectCostCeilingMock } = vi.hoisted(() => ({
  selectPreProjectCostCeilingMock: vi.fn<
    [DialecticStateValues],
    ComputeCostCeilingReturn
  >(),
}));

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  const dialecticMock = await import('@/mocks/dialecticStore.mock');
  const authMock = await import('@/mocks/authStore.mock');
  const aiMock = await import('@/mocks/aiStore.mock');
  const walletStoreMock = await import('@/mocks/walletStore.mock');
  return {
    ...actual,
    useDialecticStore: dialecticMock.useDialecticStore,
    useAuthStore: authMock.useAuthStore,
    useAiStore: aiMock.useAiStore,
    useWalletStore: walletStoreMock.useWalletStore,
    selectActiveChatWalletInfo: walletStoreMock.selectActiveChatWalletInfo,
    selectPreProjectCostCeiling: selectPreProjectCostCeilingMock,
  };
});

const mockChatDomain: DialecticDomainRow = mockDialecticDomain({
  id: 'domain-chat-1',
  name: 'General',
  description: 'Chat onboarding domain',
});

const stageThesisForChat: DialecticStage = mockDialecticStage({
  id: 'stage-chat-thesis',
  slug: 'thesis',
  display_name: 'Proposal',
  description: 'First stage for chat onboarding cost preview.',
  default_system_prompt_id: null,
});

const processTemplateForChat: DialecticProcessTemplate =
  mockDialecticProcessTemplate({
    id: 'pt-chat-onboarding',
    name: 'Chat onboarding template',
    description: null,
    starting_stage_id: stageThesisForChat.id,
    stages: [stageThesisForChat],
    transitions: [],
  });

const mockChatDomainProcessAssociation: DomainProcessAssociationRow =
  mockDomainProcessAssociationRow({
    domain_id: mockChatDomain.id,
    process_template_id: processTemplateForChat.id,
    is_default_for_domain: true,
  });

const chatFreeProvider: AiProvider = mockAiProvidersRow({
  id: 'model-free',
  name: 'Free Model',
  api_identifier: 'model-free',
  min_plan_tier_level: 0,
  is_default_generation: false,
});

const chatCatalogEntry: AiProvidersRow = mockAiProvidersRow({
  id: chatFreeProvider.id,
  name: chatFreeProvider.name,
  api_identifier: chatFreeProvider.api_identifier,
  min_plan_tier_level: 0,
  is_default_generation: true,
  config: { provider_max_output_tokens: 8192 },
});

const chatSuccessCeiling: ComputeCostCeilingSuccessReturn = {
  stageCeilings: { thesis: 50000 },
  projectCeiling: 200000,
};

const expectedChatSelectedModel: SelectedModels = mockSelectedModel({
  id: chatFreeProvider.id,
  displayName: chatFreeProvider.name,
});

function initializeChatOnboardingTestState(
  overrides?: Partial<DialecticStateValues>,
): void {
  initializeMockDialecticState({
    domains: [mockChatDomain],
    isLoadingDomains: false,
    selectedDomain: mockChatDomain,
    selectedDomainProcessAssociation: mockChatDomainProcessAssociation,
    modelCatalog: [chatCatalogEntry],
    selectedModels: [],
    maxOutputTokens: 8192,
    isLoadingModelCatalog: false,
    isLoadingDomainProcessAssociation: false,
    isLoadingProcessTemplate: false,
    isLoadingStageExpectedCounts: false,
    currentProcessTemplate: processTemplateForChat,
    ...overrides,
  });
}

function renderChat(): ReturnType<typeof render> {
  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function selectDomainInWalkthrough(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  const domainRadio: HTMLElement = screen.getByRole('radio', {
    name: mockChatDomain.name,
  });
  const domainRow: HTMLElement | null = domainRadio.parentElement;
  if (domainRow === null || !(domainRow instanceof HTMLButtonElement)) {
    throw new Error('Expected domain row wrapper to be HTMLButtonElement');
  }
  await user.click(domainRow);
  await waitFor(() => {
    const nextButton: HTMLElement = screen.getByRole('button', { name: /Next/i });
    if (!(nextButton instanceof HTMLButtonElement)) {
      throw new Error('Expected Next control to be HTMLButtonElement');
    }
    expect(nextButton.disabled).toBe(false);
  });
}

async function advanceWalkthroughToModelStep(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await selectDomainInWalkthrough(user);
  await user.click(screen.getByRole('button', { name: /Next/i }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Models' })).not.toBeNull();
  });
}

async function selectModelInList(
  user: ReturnType<typeof userEvent.setup>,
  providerId: string,
): Promise<void> {
  await user.click(screen.getByTestId(`model-list-item-${providerId}`));
}

describe('Chat onboarding pre-project cost estimate', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    HTMLElement.prototype.scrollIntoView = vi.fn();
    resetAuthStoreMock();
    resetAiStoreMock();
    selectPreProjectCostCeilingMock.mockReset();
    selectPreProjectCostCeilingMock.mockReturnValue({
      error: outputCapNotInitializedError,
    });
    mockedUseAuthStoreHookLogic.setState({
      isLoading: false,
      userTier: mockUserTier,
      availableTiers: mockAllTiers,
      error: null,
    });
    mockSetState({
      ...initialAiStateValues,
      availableProviders: [chatFreeProvider],
      isConfigLoading: false,
      aiError: null,
    });
    initializeChatOnboardingTestState();
    vi.mocked(getDialecticStoreActionMock('initializeMaxOutputTokens')).mockClear();
    vi.mocked(getDialecticStoreActionMock('setSelectedModels')).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('syncs AIModelSelectorList selection to dialectic store selectedModels', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderChat();
    await advanceWalkthroughToModelStep(user);
    await selectModelInList(user, chatFreeProvider.id);

    await waitFor(() => {
      expect(getDialecticStoreActionMock('setSelectedModels')).toHaveBeenCalledWith(
        [expectedChatSelectedModel],
      );
    });
    expect(useDialecticStore.getState().selectedModels).toEqual([
      expectedChatSelectedModel,
    ]);
  });

  it('does not call initializeMaxOutputTokens while isLoadingModelCatalog', async () => {
    initializeChatOnboardingTestState({
      isLoadingModelCatalog: true,
      modelCatalog: [],
    });
    vi.mocked(getDialecticStoreActionMock('initializeMaxOutputTokens')).mockClear();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderChat();
    await advanceWalkthroughToModelStep(user);
    await selectModelInList(user, chatFreeProvider.id);

    await waitFor(() => {
      expect(
        screen.getByTestId('chat-onboarding-estimate-loading-notice').textContent,
      ).toContain('Loading model catalog…');
    });
    expect(getDialecticStoreActionMock('initializeMaxOutputTokens')).not.toHaveBeenCalled();
    expect(screen.queryByTestId('chat-onboarding-estimate-error-notice')).toBeNull();
  });

  it('shows loading notice while stage counts loading, not selector error', async () => {
    initializeChatOnboardingTestState({ isLoadingStageExpectedCounts: true });
    selectPreProjectCostCeilingMock.mockReturnValue({
      error: outputCapNotInitializedError,
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderChat();
    await advanceWalkthroughToModelStep(user);
    await selectModelInList(user, chatFreeProvider.id);

    await waitFor(() => {
      expect(
        screen.getByTestId('chat-onboarding-estimate-loading-notice').textContent,
      ).toContain('Loading stage expected counts…');
    });
    expect(screen.queryByTestId('chat-onboarding-estimate-error-notice')).toBeNull();
  });

  it('shows pass-through error.message when selector returns error after loading', async () => {
    selectPreProjectCostCeilingMock.mockReturnValue({ error: selectorPassThroughError });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderChat();
    await advanceWalkthroughToModelStep(user);
    await selectModelInList(user, chatFreeProvider.id);

    await waitFor(() => {
      expect(screen.getByTestId('chat-onboarding-estimate-error-notice').textContent).toBe(
        selectorPassThroughError.message,
      );
    });
    expect(screen.queryByTestId('chat-onboarding-estimate-loading-notice')).toBeNull();
  });

  it('shows tier-unavailable notice when auth loaded and userTier null, not OUTPUT_CAP_NOT_INITIALIZED', async () => {
    mockedUseAuthStoreHookLogic.setState({
      isLoading: false,
      userTier: null,
      availableTiers: mockAllTiers,
      error: null,
    });
    selectPreProjectCostCeilingMock.mockReturnValue({
      error: outputCapNotInitializedError,
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderChat();
    await advanceWalkthroughToModelStep(user);

    await waitFor(() => {
      expect(screen.getByTestId('chat-onboarding-estimate-error-notice').textContent).toBe(
        subscriptionTierUnavailableMessage,
      );
    });
    expect(screen.queryByText(outputCapNotInitializedError.message)).toBeNull();
  });

  it('shows cost preview when tier + catalog + counts ready and cap initialized', async () => {
    selectPreProjectCostCeilingMock.mockReturnValue(chatSuccessCeiling);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderChat();
    await advanceWalkthroughToModelStep(user);
    await selectModelInList(user, chatFreeProvider.id);

    await waitFor(() => {
      expect(screen.getByTestId('chat-onboarding-cost-preview')).not.toBeNull();
    });
    expect(screen.getByTestId('chat-onboarding-cost-preview').textContent).toContain(
      'Estimated token cost:',
    );
    expect(screen.getByTestId('chat-onboarding-cost-preview').textContent).toContain('200,000');
    expect(screen.getByTestId('chat-onboarding-cost-preview').textContent).toContain('50,000');
    expect(selectSortedStages(useDialecticStore.getState())[0]?.slug).toBe('thesis');
    expect(screen.queryByTestId('chat-onboarding-estimate-error-notice')).toBeNull();
    expect(screen.queryByTestId('chat-onboarding-estimate-loading-notice')).toBeNull();
  });
});
