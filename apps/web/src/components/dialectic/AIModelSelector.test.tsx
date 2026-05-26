import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { initialDialecticStateValues } from '@paynless/store';
import { initialAiStateValues } from '@paynless/types';
import { AIModelSelector } from './AIModelSelector';
import { mockUserTier, mockAllTiers } from '../../mocks/profile.mock';
import type { AiProvider, DialecticStateValues, AiState, SelectedModels, AIModelCatalogEntry, UserTier } from '@paynless/types';

// Store references to mock implementations that can be updated
let currentDialecticState: DialecticStateValues;
let currentDialecticActions: {
  setModelMultiplicity: ReturnType<typeof vi.fn>;
  fetchAIModelCatalog: ReturnType<typeof vi.fn>;
  setSelectedModels: ReturnType<typeof vi.fn>;
};
let currentAiState: AiState;
let currentAiActions: { loadAiConfig: ReturnType<typeof vi.fn> };
let currentAuthState: { userTier: UserTier; availableTiers: UserTier[] };

// Mock the Zustand stores
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  const typesModule = await vi.importActual<typeof import('@paynless/types')>('@paynless/types');

  const mockUseDialecticStore = vi.fn((selector?: (state: DialecticStateValues & typeof currentDialecticActions) => unknown) => {
    if (selector) {
      return selector({ ...currentDialecticState, ...currentDialecticActions });
    }
    return { ...currentDialecticState, ...currentDialecticActions };
  });

  const mockUseAiStore = vi.fn((selector?: (state: AiState & typeof currentAiActions) => unknown) => {
    if (selector) {
      return selector({ ...currentAiState, ...currentAiActions });
    }
    return { ...currentAiState, ...currentAiActions };
  });

  const mockUseAuthStore = vi.fn((selector?: (state: typeof currentAuthState) => unknown) => {
    if (selector) {
      return selector(currentAuthState);
    }
    return currentAuthState;
  });

  return {
    ...actual,
    useAiStore: mockUseAiStore,
    useDialecticStore: mockUseDialecticStore,
    useAuthStore: mockUseAuthStore,
    initialAiStateValues: typesModule.initialAiStateValues,
  };
});

function renderWithRouter(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// Helper function to set up mock store states and actions
const setupMockStores = (
  initialDialecticConfig: Partial<DialecticStateValues> = {},
  initialAiConfig: Partial<AiState> = {},
  initialAuthConfig: { userTier?: UserTier; availableTiers?: UserTier[] } = {}
) => {
  const dialecticState: DialecticStateValues = {
    ...initialDialecticStateValues,
    selectedModels: [],
    ...initialDialecticConfig,
  };

  const aiState: AiState = {
    ...initialAiStateValues,
    availableProviders: [],
    isConfigLoading: false,
    aiError: null,
    ...initialAiConfig,
  };

  const dialecticActions = {
    setModelMultiplicity: vi.fn(),
    fetchAIModelCatalog: vi.fn(),
    setSelectedModels: vi.fn(),
  };

  const aiActions = {
    loadAiConfig: vi.fn(),
  };

  const authState: { userTier: UserTier; availableTiers: UserTier[] } = {
    userTier: initialAuthConfig.userTier !== undefined ? initialAuthConfig.userTier : mockUserTier,
    availableTiers: initialAuthConfig.availableTiers !== undefined ? initialAuthConfig.availableTiers : mockAllTiers,
  };

  currentDialecticState = dialecticState;
  currentDialecticActions = dialecticActions;
  currentAiState = aiState;
  currentAiActions = aiActions;
  currentAuthState = authState;

  return { dialecticState, dialecticActions, aiState, aiActions };
};

const mockAiProvidersData: AiProvider[] = [
  { id: 'model1', name: 'GPT-4', provider: 'OpenAI', api_identifier: 'gpt-4', created_at: 'test', updated_at: 'test', is_active: true, is_enabled: true, is_default_embedding: false, is_default_generation: false, config: null, description: null, min_plan_tier_level: 0 },
  { id: 'model2', name: 'Claude 3', provider: 'Anthropic', api_identifier: 'claude-3', created_at: 'test', updated_at: 'test', is_active: true, is_enabled: true, is_default_embedding: false, is_default_generation: false, config: null, description: null, min_plan_tier_level: 0 },
];

const modelIdToDisplayName: Record<string, string> = {
  model1: 'GPT-4',
  model2: 'Claude 3',
  model3: 'Gemini',
  'model-free': 'Free Model',
  'model-free-b': 'Free B',
  'model-premium': 'Premium Model',
};

function selectedModelsFromIds(ids: string[]): SelectedModels[] {
  return ids.map((id) => ({ id, displayName: modelIdToDisplayName[id] ?? id }));
}

function catalogEntry(overrides: Partial<AIModelCatalogEntry>): AIModelCatalogEntry {
  const base: AIModelCatalogEntry = {
    id: 'base-id',
    provider_name: 'Provider',
    model_name: 'Base Model',
    api_identifier: 'api-id',
    description: null,
    strengths: null,
    weaknesses: null,
    context_window_tokens: null,
    input_token_cost_usd_millionths: null,
    output_token_cost_usd_millionths: null,
    max_output_tokens: null,
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    is_default_generation: false,
    min_plan_tier_level: 0,
  };
  return { ...base, ...overrides };
}

const tierFree: UserTier = mockUserTier;
const tierUltra: UserTier = mockAllTiers[3];

const providerFree: AiProvider = {
  ...mockAiProvidersData[0],
  id: 'model-free',
  name: 'Free Model',
  api_identifier: 'model-free',
  min_plan_tier_level: 0,
};

const providerFreeB: AiProvider = {
  ...mockAiProvidersData[0],
  id: 'model-free-b',
  name: 'Free B',
  api_identifier: 'model-free-b',
  min_plan_tier_level: 0,
};

const providerPremium: AiProvider = {
  ...mockAiProvidersData[0],
  id: 'model-premium',
  name: 'Premium Model',
  api_identifier: 'model-premium',
  min_plan_tier_level: 20,
};

const tierUltraAuthConfig: { userTier: UserTier; availableTiers: UserTier[] } = {
  userTier: tierUltra,
  availableTiers: mockAllTiers,
};

describe('AIModelSelector', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  test('renders loading state initially when isConfigLoading is true', async () => {
    setupMockStores({}, { isConfigLoading: true, availableProviders: [] });
    renderWithRouter(<AIModelSelector />);
    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('Loading models...')).toBeInTheDocument();
  });

  test('calls loadAiConfig on mount if providers not available and not loading', () => {
    const { aiActions } = setupMockStores({}, { availableProviders: [], isConfigLoading: false, aiError: null });
    renderWithRouter(<AIModelSelector />);
    expect(aiActions.loadAiConfig).toHaveBeenCalledTimes(1);
  });

  test('does not call loadAiConfig if providers already loaded', () => {
    const { aiActions } = setupMockStores({}, { availableProviders: mockAiProvidersData, isConfigLoading: false, aiError: null });
    renderWithRouter(<AIModelSelector />);
    expect(aiActions.loadAiConfig).not.toHaveBeenCalled();
  });

  test('renders error state from aiStore', async () => {
    const errorMsg = 'Failed to load AI providers';
    setupMockStores({}, { aiError: errorMsg, isConfigLoading: false, availableProviders: [] });
    renderWithRouter(<AIModelSelector />);
    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findByText(`Error: ${errorMsg}`)).toBeInTheDocument();
  });

  test('renders no models available message', async () => {
    setupMockStores({}, { availableProviders: [], isConfigLoading: false, aiError: null });
    renderWithRouter(<AIModelSelector />);
    expect(screen.getByText('No models available')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('No models available to select.')).toBeInTheDocument();
  });

  test('renders available providers and allows selection', async () => {
    const { dialecticActions } = setupMockStores(
      { selectedModels: selectedModelsFromIds([]) },
      { availableProviders: mockAiProvidersData, isConfigLoading: false }
    );
    renderWithRouter(<AIModelSelector />);
    const user = userEvent.setup();

    expect(screen.getByText('Click to select AI models')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Select AI Models/i }));

    await waitFor(async () => {
      expect(screen.getByText('GPT-4')).toBeInTheDocument();
      expect(screen.getByText('Claude 3')).toBeInTheDocument();
    });

    const gpt4Item = await screen.findByTestId('model-item-model1');
    const incrementButton = within(gpt4Item).getByRole('button', { name: /Increment/i });
    await user.click(incrementButton);

    expect(dialecticActions.setModelMultiplicity).toHaveBeenCalledWith(
      { id: 'model1', displayName: 'GPT-4' },
      1,
    );
  });

  test('main list (selected model badges in trigger) shows semantic display names, not model_id', () => {
    setupMockStores(
      {
        selectedModels: [
          { id: 'model1', displayName: 'model1' },
          { id: 'model2', displayName: 'model2' },
        ],
      },
      { availableProviders: mockAiProvidersData, isConfigLoading: false }
    );
    renderWithRouter(<AIModelSelector />);

    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('Claude 3')).toBeInTheDocument();
    expect(screen.queryByText('model1')).not.toBeInTheDocument();
    expect(screen.queryByText('model2')).not.toBeInTheDocument();
  });

  test('displays selected models summary correctly', () => {
    let unmount: () => void;

    setupMockStores({ selectedModels: [] }, { availableProviders: mockAiProvidersData });
    ({ unmount } = renderWithRouter(<AIModelSelector />));
    expect(screen.getByText('Click to select AI models')).toBeInTheDocument();
    unmount();

    setupMockStores({ selectedModels: selectedModelsFromIds(['model1']) }, { availableProviders: mockAiProvidersData });
    ({ unmount } = renderWithRouter(<AIModelSelector />));
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.queryByText('Claude 3')).not.toBeInTheDocument();
    unmount();

    setupMockStores(
      { selectedModels: selectedModelsFromIds(['model1', 'model1']) },
      { availableProviders: mockAiProvidersData },
      tierUltraAuthConfig
    );
    ({ unmount } = renderWithRouter(<AIModelSelector />));
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('Claude 3')).not.toBeInTheDocument();
    unmount();

    setupMockStores(
      { selectedModels: selectedModelsFromIds(['model1', 'model2']) },
      { availableProviders: mockAiProvidersData },
      tierUltraAuthConfig
    );
    ({ unmount } = renderWithRouter(<AIModelSelector />));
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('Claude 3')).toBeInTheDocument();
    unmount();

    setupMockStores(
      { selectedModels: selectedModelsFromIds(['model1', 'model1', 'model2']) },
      { availableProviders: mockAiProvidersData },
      tierUltraAuthConfig
    );
    ({ unmount } = renderWithRouter(<AIModelSelector />));
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Claude 3')).toBeInTheDocument();
    unmount();

    const geminiModel: AiProvider = { id: 'model3', name: 'Gemini', provider: 'Google', api_identifier: 'gemini', created_at: 'test', updated_at: 'test', is_active: true, is_enabled: true, is_default_embedding: false, is_default_generation: false, config: null, description: null, min_plan_tier_level: 0 };
    const manyProviders: AiProvider[] = [...mockAiProvidersData, geminiModel];

    setupMockStores(
      { selectedModels: selectedModelsFromIds(['model1', 'model2', 'model3']) },
      { availableProviders: manyProviders },
      tierUltraAuthConfig
    );
    ({ unmount } = renderWithRouter(<AIModelSelector />));
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('Claude 3')).toBeInTheDocument();
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    unmount();

    setupMockStores(
      { selectedModels: selectedModelsFromIds(['model1', 'model1', 'model2', 'model3']) },
      { availableProviders: manyProviders },
      tierUltraAuthConfig
    );
    ({ unmount } = renderWithRouter(<AIModelSelector />));
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Claude 3')).toBeInTheDocument();
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    unmount();
  });

  test('renders MultiplicitySelector for each model in the dropdown', async () => {
    setupMockStores(
      { selectedModels: [] },
      { availableProviders: mockAiProvidersData, isConfigLoading: false }
    );
    renderWithRouter(<AIModelSelector />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Select AI Models/i }));

    for (const provider of mockAiProvidersData) {
      const modelItem = await screen.findByTestId(`model-item-${provider.id}`);
      expect(within(modelItem).getByRole('button', { name: /Increment/i })).toBeInTheDocument();
      expect(within(modelItem).getByRole('button', { name: /Decrement/i })).toBeInTheDocument();
      expect(within(modelItem).getByText('0')).toBeInTheDocument();
    }
  });

  test('incrementing multiplicity calls setModelMultiplicity correctly', async () => {
    const { dialecticActions } = setupMockStores(
      { selectedModels: [] },
      { availableProviders: [mockAiProvidersData[0]], isConfigLoading: false }
    );
    const { unmount, container } = renderWithRouter(<AIModelSelector />);
    const user = userEvent.setup();
    await user.click(within(container).getByRole('button', { name: /Select AI Models/i }));

    const modelItem = await screen.findByTestId(`model-item-${mockAiProvidersData[0].id}`);
    const incrementButton = within(modelItem).getByRole('button', { name: /Increment/i });

    await user.click(incrementButton);
    expect(dialecticActions.setModelMultiplicity).toHaveBeenCalledWith(
      { id: mockAiProvidersData[0].id, displayName: mockAiProvidersData[0].name },
      1,
    );

    await user.keyboard('{Escape}');
    unmount();

    const { dialecticActions: secondPhaseActions } = setupMockStores(
      { selectedModels: selectedModelsFromIds([mockAiProvidersData[0].id]) },
      { availableProviders: [mockAiProvidersData[0]], isConfigLoading: false },
      tierUltraAuthConfig
    );
    const { container: newContainer, unmount: newUnmount } = renderWithRouter(<AIModelSelector />);
    await user.click(within(newContainer).getByRole('button', { name: /Select AI Models/i }));

    const updatedModelItem = await screen.findByTestId(`model-item-${mockAiProvidersData[0].id}`);
    const updatedIncrementButton = within(updatedModelItem).getByRole('button', { name: /Increment/i });

    await user.click(updatedIncrementButton);
    expect(secondPhaseActions.setModelMultiplicity).toHaveBeenCalledWith(
      { id: mockAiProvidersData[0].id, displayName: mockAiProvidersData[0].name },
      2,
    );
    expect(secondPhaseActions.setModelMultiplicity).toHaveBeenCalledTimes(1);
    newUnmount();
  });

  test('decrementing multiplicity calls setModelMultiplicity correctly', async () => {
    const { dialecticActions: firstPhaseActions } = setupMockStores(
      { selectedModels: selectedModelsFromIds([mockAiProvidersData[0].id, mockAiProvidersData[0].id]) },
      { availableProviders: [mockAiProvidersData[0]], isConfigLoading: false },
      tierUltraAuthConfig
    );
    const { container, unmount } = renderWithRouter(<AIModelSelector />);
    const user = userEvent.setup();

    await user.click(within(container).getByRole('button', { name: /Select AI Models/i }));

    const modelItem = await screen.findByTestId(`model-item-${mockAiProvidersData[0].id}`);
    const decrementButton = within(modelItem).getByRole('button', { name: /Decrement/i });

    await user.click(decrementButton);
    expect(firstPhaseActions.setModelMultiplicity).toHaveBeenCalledWith(
      { id: mockAiProvidersData[0].id, displayName: mockAiProvidersData[0].name },
      1,
    );
    expect(firstPhaseActions.setModelMultiplicity).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    unmount();

    const { dialecticActions: secondPhaseActions } = setupMockStores(
      { selectedModels: selectedModelsFromIds([mockAiProvidersData[0].id]) },
      { availableProviders: [mockAiProvidersData[0]], isConfigLoading: false }
    );
    const { container: newContainer, unmount: newUnmount } = renderWithRouter(<AIModelSelector />);
    await user.click(within(newContainer).getByRole('button', { name: /Select AI Models/i }));

    const updatedModelItem = await screen.findByTestId(`model-item-${mockAiProvidersData[0].id}`);
    const updatedDecrementButton = within(updatedModelItem).getByRole('button', { name: /Decrement/i });

    await user.click(updatedDecrementButton);
    expect(secondPhaseActions.setModelMultiplicity).toHaveBeenCalledWith(
      { id: mockAiProvidersData[0].id, displayName: mockAiProvidersData[0].name },
      0,
    );
    expect(secondPhaseActions.setModelMultiplicity).toHaveBeenCalledTimes(1);
    newUnmount();
  });

  test('dropdown is disabled when disabled prop is true', () => {
    setupMockStores({}, { availableProviders: mockAiProvidersData });
    renderWithRouter(<AIModelSelector disabled={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  test('dropdown is NOT disabled when loading, so loading message can be shown', () => {
    setupMockStores({}, { availableProviders: [], isConfigLoading: true });
    renderWithRouter(<AIModelSelector />);
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  test('dropdown is disabled when no models and not loading (and no error)', () => {
    setupMockStores({}, { availableProviders: [], isConfigLoading: false, aiError: null });
    renderWithRouter(<AIModelSelector />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  test('dropdown is NOT disabled if there is an error, even if no models', () => {
    setupMockStores({}, { availableProviders: [], isConfigLoading: false, aiError: 'Some error' });
    renderWithRouter(<AIModelSelector />);
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  test('when modelCatalog is empty and isLoadingModelCatalog is false, fetchAIModelCatalog is called on mount', () => {
    const { dialecticActions } = setupMockStores(
      { modelCatalog: [], isLoadingModelCatalog: false },
      { availableProviders: [], isConfigLoading: false }
    );
    renderWithRouter(<AIModelSelector />);
    expect(dialecticActions.fetchAIModelCatalog).toHaveBeenCalledTimes(1);
  });

  test('when modelCatalog is non-empty, fetchAIModelCatalog is NOT called on mount', () => {
    const { dialecticActions } = setupMockStores(
      {
        modelCatalog: [catalogEntry({ id: 'm1', model_name: 'Model One', is_default_generation: true, is_active: true })],
        isLoadingModelCatalog: false,
      },
      { availableProviders: mockAiProvidersData, isConfigLoading: false }
    );
    renderWithRouter(<AIModelSelector />);
    expect(dialecticActions.fetchAIModelCatalog).not.toHaveBeenCalled();
  });

  test('when selectedModels is empty, defaultModels is non-empty, and activeContextSessionId is null, setSelectedModels is called with the default models', () => {
    const defaultModels: SelectedModels[] = [
      { id: 'default-1', displayName: 'Default One' },
    ];
    const { dialecticActions } = setupMockStores(
      {
        modelCatalog: [catalogEntry({ id: 'default-1', model_name: 'Default One', is_default_generation: true, is_active: true })],
        isLoadingModelCatalog: false,
        selectedModels: [],
        activeContextSessionId: null,
      },
      { availableProviders: mockAiProvidersData, isConfigLoading: false }
    );
    renderWithRouter(<AIModelSelector />);
    expect(dialecticActions.setSelectedModels).toHaveBeenCalledTimes(1);
    expect(dialecticActions.setSelectedModels).toHaveBeenCalledWith(defaultModels);
  });

  test('when selectedModels is already non-empty, setSelectedModels is NOT called for defaults', () => {
    const { dialecticActions } = setupMockStores(
      {
        modelCatalog: [catalogEntry({ id: 'default-1', model_name: 'Default One', is_default_generation: true, is_active: true })],
        isLoadingModelCatalog: false,
        selectedModels: selectedModelsFromIds(['model1']),
        activeContextSessionId: null,
      },
      { availableProviders: mockAiProvidersData, isConfigLoading: false }
    );
    renderWithRouter(<AIModelSelector />);
    expect(dialecticActions.setSelectedModels).not.toHaveBeenCalled();
  });

  test('when activeContextSessionId is set, setSelectedModels is NOT called for defaults even if selectedModels is empty', () => {
    const { dialecticActions } = setupMockStores(
      {
        modelCatalog: [catalogEntry({ id: 'default-1', model_name: 'Default One', is_default_generation: true, is_active: true })],
        isLoadingModelCatalog: false,
        selectedModels: [],
        activeContextSessionId: 'session-123',
      },
      { availableProviders: mockAiProvidersData, isConfigLoading: false }
    );
    renderWithRouter(<AIModelSelector />);
    expect(dialecticActions.setSelectedModels).not.toHaveBeenCalled();
  });

  test('after defaults are applied once, clearing all models does NOT re-apply defaults', () => {
    const dialecticConfig: Partial<DialecticStateValues> = {
      modelCatalog: [catalogEntry({ id: 'default-1', model_name: 'Default One', is_default_generation: true, is_active: true })],
      isLoadingModelCatalog: false,
      selectedModels: [],
      activeContextSessionId: null,
    };
    const { dialecticActions } = setupMockStores(
      { ...dialecticConfig },
      { availableProviders: mockAiProvidersData, isConfigLoading: false }
    );
    const { rerender } = renderWithRouter(<AIModelSelector />);
    expect(dialecticActions.setSelectedModels).toHaveBeenCalledTimes(1);
    dialecticActions.setSelectedModels.mockClear();

    setupMockStores(
      { ...dialecticConfig, selectedModels: [] },
      { availableProviders: mockAiProvidersData, isConfigLoading: false }
    );
    rerender(<MemoryRouter><AIModelSelector /></MemoryRouter>);
    expect(dialecticActions.setSelectedModels).not.toHaveBeenCalled();
  });

  test('model above user tier renders disabled without multiplicity controls', async () => {
    setupMockStores(
      {},
      { availableProviders: [providerFree, providerPremium], isConfigLoading: false },
      { userTier: tierFree, availableTiers: mockAllTiers }
    );
    renderWithRouter(<AIModelSelector />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Select AI Models/i }));

    expect(within(screen.getByTestId('model-item-model-premium')).queryByRole('button', { name: /Increment/i })).toBeNull();
    expect(within(screen.getByTestId('model-item-model-premium')).getByTestId('tier-lock-model-premium')).toBeInTheDocument();
    expect(within(screen.getByTestId('model-item-model-free')).getByRole('button', { name: /Increment/i })).toBeInTheDocument();
  });

  test('tier-locked row shows upgrade CTA with link to subscription at lock interaction point', async () => {
    setupMockStores(
      {},
      { availableProviders: [providerFree, providerPremium], isConfigLoading: false },
      { userTier: tierFree, availableTiers: mockAllTiers }
    );
    renderWithRouter(<AIModelSelector />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Select AI Models/i }));

    const premiumItem = screen.getByTestId('model-item-model-premium');
    await user.hover(within(premiumItem).getByTestId('tier-lock-model-premium'));

    const tierPlanMessages = screen.getAllByText(/This model requires a Premium plan/i);
    expect(tierPlanMessages.length).toBeGreaterThanOrEqual(1);
    const upgradeLinks = screen.getAllByTestId('upgrade-link-tier-model-premium');
    expect(upgradeLinks[0]).toHaveAttribute('href', '/subscription');
  });

  test('at max_models_per_project unselected models cannot increment', async () => {
    const { dialecticActions } = setupMockStores(
      { selectedModels: selectedModelsFromIds(['model-free']) },
      { availableProviders: [providerFree, providerFreeB] },
      { userTier: tierFree }
    );
    renderWithRouter(<AIModelSelector />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Select AI Models/i }));

    const freeBItem = screen.getByTestId('model-item-model-free-b');
    const incrementButton = within(freeBItem).queryByRole('button', { name: /Increment/i });
    if (incrementButton !== null) {
      expect(incrementButton).toBeDisabled();
      await user.click(incrementButton);
    }
    expect(dialecticActions.setModelMultiplicity).not.toHaveBeenCalled();
  });

  test('at count cap hover on disabled increment on unselected row shows upgrade CTA at control', async () => {
    const { dialecticActions } = setupMockStores(
      { selectedModels: selectedModelsFromIds(['model-free']) },
      { availableProviders: [providerFree, providerFreeB] },
      { userTier: tierFree }
    );
    renderWithRouter(<AIModelSelector />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Select AI Models/i }));

    const freeBItem = screen.getByTestId('model-item-model-free-b');
    expect(within(freeBItem).getByTestId('model-cap-controls-model-free-b')).toBeInTheDocument();

    const incrementButton = within(freeBItem).getByRole('button', { name: /Increment/i });
    await user.hover(incrementButton);

    const capLimitMessages = screen.getAllByText(
      /You've reached the model limit for your plan \(1\/1\)/i,
    );
    expect(capLimitMessages.length).toBeGreaterThanOrEqual(1);
    const capUpgradeLinks = screen.getAllByTestId('upgrade-link-cap-model-free-b');
    expect(capUpgradeLinks.length).toBeGreaterThanOrEqual(1);
    expect(capUpgradeLinks[0]).toHaveAttribute('href', '/subscription');
    expect(screen.queryByTestId('model-limit-footer')).toBeNull();

    await user.click(incrementButton);
    expect(dialecticActions.setModelMultiplicity).not.toHaveBeenCalled();
  });

  test('at cap selected model can decrement; disabled increment shows count-cap CTA at control', async () => {
    const { dialecticActions: decrementActions } = setupMockStores(
      { selectedModels: selectedModelsFromIds(['model-free']) },
      { availableProviders: [providerFree] },
      { userTier: tierFree }
    );
    const { unmount: unmountAfterDecrement } = renderWithRouter(<AIModelSelector />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Select AI Models/i }));

    const freeItem = screen.getByTestId('model-item-model-free');
    await user.click(within(freeItem).getByRole('button', { name: /Decrement/i }));
    expect(decrementActions.setModelMultiplicity).toHaveBeenCalledWith(
      { id: 'model-free', displayName: 'Free Model' },
      0,
    );
    unmountAfterDecrement();

    setupMockStores(
      { selectedModels: selectedModelsFromIds(['model-free']) },
      { availableProviders: [providerFree] },
      { userTier: tierFree }
    );
    const { unmount: unmountAfterHover } = renderWithRouter(<AIModelSelector />);
    await user.click(screen.getByRole('button', { name: /Select AI Models/i }));

    const cappedFreeItem = screen.getByTestId('model-item-model-free');
    await user.hover(within(cappedFreeItem).getByRole('button', { name: /Increment/i }));
    const capUpgradeLinks = screen.getAllByTestId('upgrade-link-cap-model-free');
    expect(capUpgradeLinks.length).toBeGreaterThanOrEqual(1);
    expect(capUpgradeLinks[0]).toHaveAttribute('href', '/subscription');
    unmountAfterHover();

    const { dialecticActions: incrementActions } = setupMockStores(
      { selectedModels: selectedModelsFromIds(['model-free']) },
      { availableProviders: [providerFree] },
      { userTier: tierFree }
    );
    renderWithRouter(<AIModelSelector />);
    await user.click(screen.getByRole('button', { name: /Select AI Models/i }));
    await user.click(within(screen.getByTestId('model-item-model-free')).getByRole('button', { name: /Increment/i }));
    expect(incrementActions.setModelMultiplicity).not.toHaveBeenCalled();
  });

  test('ultra tier max_models_per_project null imposes no count limit', async () => {
    const { dialecticActions: firstActions } = setupMockStores(
      { selectedModels: [] },
      { availableProviders: [providerFree], isConfigLoading: false },
      { userTier: tierUltra, availableTiers: mockAllTiers }
    );
    const { unmount, container } = renderWithRouter(<AIModelSelector />);
    const user = userEvent.setup();
    await user.click(within(container).getByRole('button', { name: /Select AI Models/i }));
    await user.click(within(screen.getByTestId('model-item-model-free')).getByRole('button', { name: /Increment/i }));
    expect(firstActions.setModelMultiplicity).toHaveBeenCalledWith(
      { id: 'model-free', displayName: 'Free Model' },
      1,
    );
    unmount();

    const { dialecticActions: secondActions } = setupMockStores(
      { selectedModels: selectedModelsFromIds(['model-free']) },
      { availableProviders: [providerFree], isConfigLoading: false },
      { userTier: tierUltra, availableTiers: mockAllTiers }
    );
    const { unmount: unmount2, container: container2 } = renderWithRouter(<AIModelSelector />);
    await user.click(within(container2).getByRole('button', { name: /Select AI Models/i }));
    await user.click(within(screen.getByTestId('model-item-model-free')).getByRole('button', { name: /Increment/i }));
    expect(secondActions.setModelMultiplicity).toHaveBeenCalledWith(
      { id: 'model-free', displayName: 'Free Model' },
      2,
    );
    unmount2();

    const { dialecticActions: thirdActions } = setupMockStores(
      { selectedModels: selectedModelsFromIds(['model-free', 'model-free']) },
      { availableProviders: [providerFree], isConfigLoading: false },
      { userTier: tierUltra, availableTiers: mockAllTiers }
    );
    renderWithRouter(<AIModelSelector />);
    await user.click(screen.getByRole('button', { name: /Select AI Models/i }));
    await user.click(within(screen.getByTestId('model-item-model-free')).getByRole('button', { name: /Increment/i }));
    expect(thirdActions.setModelMultiplicity).toHaveBeenCalledWith(
      { id: 'model-free', displayName: 'Free Model' },
      3,
    );
    expect(screen.queryByTestId('upgrade-link-cap-model-free')).toBeNull();
  });

  test('ultra user can access highest-tier model row', async () => {
    setupMockStores(
      {},
      { availableProviders: [providerFree, providerPremium], isConfigLoading: false },
      { userTier: tierUltra, availableTiers: mockAllTiers }
    );
    renderWithRouter(<AIModelSelector />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Select AI Models/i }));

    const premiumItem = screen.getByTestId('model-item-model-premium');
    expect(within(premiumItem).getByRole('button', { name: /Increment/i })).toBeInTheDocument();
    expect(within(premiumItem).queryByTestId('tier-lock-model-premium')).toBeNull();
  });
});

describe('AIModelSelector Pulsing animation', () => {
  const getPulsingButton = () => {
    return screen.getByRole('button', { name: /Select AI Models/i });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  test('applies pulsing animation when no models selected, not disabled, not loading, no error, and providers exist', () => {
    setupMockStores(
      { selectedModels: [] },
      {
        availableProviders: mockAiProvidersData,
        isConfigLoading: false,
        aiError: null,
      }
    );
    renderWithRouter(<AIModelSelector disabled={false} />);
    const pulsingButton = getPulsingButton();
    expect(pulsingButton).toHaveClass('ring-2', 'ring-primary', 'animate-pulse');
  });

  test('does NOT apply pulsing animation if models ARE selected', () => {
    setupMockStores(
      { selectedModels: selectedModelsFromIds(['model1']) },
      { availableProviders: mockAiProvidersData, isConfigLoading: false, aiError: null }
    );
    renderWithRouter(<AIModelSelector disabled={false} />);
    const pulsingButton = getPulsingButton();
    expect(pulsingButton).not.toHaveClass('animate-pulse');
  });

  test('does NOT apply pulsing animation if disabled by prop', () => {
    setupMockStores(
      { selectedModels: [] },
      { availableProviders: mockAiProvidersData, isConfigLoading: false, aiError: null }
    );
    renderWithRouter(<AIModelSelector disabled={true} />);
    const pulsingButton = getPulsingButton();
    expect(pulsingButton).not.toHaveClass('animate-pulse');
  });

  test('does NOT apply pulsing animation if config is loading', () => {
    setupMockStores(
      { selectedModels: [] },
      { availableProviders: mockAiProvidersData, isConfigLoading: true, aiError: null }
    );
    renderWithRouter(<AIModelSelector disabled={false} />);
    const pulsingButton = getPulsingButton();
    expect(pulsingButton).not.toHaveClass('animate-pulse');
  });

  test('does NOT apply pulsing animation if there is an AI error', () => {
    setupMockStores(
      { selectedModels: [] },
      { availableProviders: mockAiProvidersData, isConfigLoading: false, aiError: 'Some Error' }
    );
    renderWithRouter(<AIModelSelector disabled={false} />);
    const pulsingButton = getPulsingButton();
    expect(pulsingButton).not.toHaveClass('animate-pulse');
  });

  test('does NOT apply pulsing animation if there are no available providers', () => {
    setupMockStores(
      { selectedModels: [] },
      { availableProviders: [], isConfigLoading: false, aiError: null }
    );
    renderWithRouter(<AIModelSelector disabled={false} />);
    const button = screen.getByRole('button', { name: /Select AI Models/i });
    expect(button).toBeDisabled();
    expect(button).not.toHaveClass('animate-pulse');
  });
});
