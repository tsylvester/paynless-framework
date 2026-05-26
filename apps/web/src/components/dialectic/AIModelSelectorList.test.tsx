import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { initialAiStateValues } from '@paynless/types';
import { AIModelSelectorList } from './AIModelSelectorList';
import { mockUserTier, mockAllTiers } from '../../mocks/profile.mock';
import type { AiProvider, UserTier, AiState } from '@paynless/types';

let currentAiState: AiState;
let currentAiActions: { loadAiConfig: ReturnType<typeof vi.fn> };
let currentAuthState: { userTier: UserTier; availableTiers: UserTier[] };

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  const typesModule = await vi.importActual<typeof import('@paynless/types')>('@paynless/types');

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
    useAuthStore: mockUseAuthStore,
    initialAiStateValues: typesModule.initialAiStateValues,
  };
});

function renderWithRouter(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

function setupMocks(
  aiPartial: Partial<AiState> = {},
  authPartial: { userTier?: UserTier; availableTiers?: UserTier[] } = {},
) {
  const aiState: AiState = {
    ...initialAiStateValues,
    availableProviders: [],
    isConfigLoading: false,
    aiError: null,
    ...aiPartial,
  };

  const aiActions = {
    loadAiConfig: vi.fn(),
  };

  const authState: { userTier: UserTier; availableTiers: UserTier[] } = {
    userTier: authPartial.userTier !== undefined ? authPartial.userTier : mockUserTier,
    availableTiers: authPartial.availableTiers !== undefined ? authPartial.availableTiers : mockAllTiers,
  };

  currentAiState = aiState;
  currentAiActions = aiActions;
  currentAuthState = authState;

  return { aiState, aiActions };
}

const mockAiProvidersData: AiProvider[] = [
  {
    id: 'model1',
    name: 'GPT-4',
    provider: 'OpenAI',
    api_identifier: 'gpt-4',
    created_at: 'test',
    updated_at: 'test',
    is_active: true,
    is_enabled: true,
    is_default_embedding: false,
    is_default_generation: false,
    config: null,
    description: null,
    min_plan_tier_level: 0,
  },
];

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

describe('AIModelSelectorList', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('model above user tier renders disabled without checkable checkbox', async () => {
    setupMocks(
      { availableProviders: [providerFree, providerPremium], isConfigLoading: false },
      { userTier: tierFree, availableTiers: mockAllTiers },
    );
    renderWithRouter(<AIModelSelectorList onChange={onChange} />);
    const user = userEvent.setup();

    expect(
      within(screen.getByTestId('model-list-item-model-premium')).getByTestId(
        'tier-lock-model-premium',
      ),
    ).toBeInTheDocument();

    const premiumCheckbox = within(screen.getByTestId('model-list-item-model-premium')).getByRole(
      'checkbox',
    );
    expect(premiumCheckbox).toHaveAttribute('disabled');

    await user.click(screen.getByTestId('model-list-item-model-premium'));
    expect(onChange).not.toHaveBeenCalled();

    const freeCheckbox = within(screen.getByTestId('model-list-item-model-free')).getByRole(
      'checkbox',
    );
    expect(freeCheckbox).not.toHaveAttribute('disabled');
    await user.click(screen.getByTestId('model-list-item-model-free'));
    expect(onChange).toHaveBeenCalledWith(['model-free']);
  });

  it('tier-locked row shows upgrade CTA at row interaction point', async () => {
    setupMocks(
      { availableProviders: [providerFree, providerPremium], isConfigLoading: false },
      { userTier: tierFree, availableTiers: mockAllTiers },
    );
    renderWithRouter(<AIModelSelectorList onChange={onChange} />);
    const user = userEvent.setup();

    await user.hover(screen.getByTestId('model-list-item-model-premium'));

    const tierPlanMessages = screen.getAllByText(/This model requires a Premium plan/i);
    expect(tierPlanMessages.length).toBeGreaterThanOrEqual(1);
    const upgradeLinks = screen.getAllByTestId('upgrade-link-tier-model-premium');
    expect(upgradeLinks[0]).toHaveAttribute('href', '/subscription');
  });

  it('at max_models_per_project unchecked rows cannot be checked', async () => {
    setupMocks({ availableProviders: [providerFree, providerFreeB] }, { userTier: tierFree });
    renderWithRouter(<AIModelSelectorList onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId('model-list-item-model-free'));
    expect(onChange).toHaveBeenLastCalledWith(['model-free']);

    const callCountAfterFirstCheck: number = onChange.mock.calls.length;
    await user.click(screen.getByTestId('model-cap-row-model-free-b'));
    expect(onChange.mock.calls.length).toBe(callCountAfterFirstCheck);
    expect(onChange).toHaveBeenLastCalledWith(['model-free']);
  });

  it('at count cap hover on blocked unchecked row shows upgrade CTA at that row', async () => {
    setupMocks({ availableProviders: [providerFree, providerFreeB] }, { userTier: tierFree });
    renderWithRouter(<AIModelSelectorList onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId('model-list-item-model-free'));

    await user.hover(screen.getByTestId('model-cap-row-model-free-b'));

    const capLimitMessages = screen.getAllByText(
      /You've reached the model limit for your plan \(1\/1\)/i,
    );
    expect(capLimitMessages.length).toBeGreaterThanOrEqual(1);
    const capUpgradeLinks = screen.getAllByTestId('upgrade-link-cap-model-free-b');
    expect(capUpgradeLinks.length).toBeGreaterThanOrEqual(1);
    expect(capUpgradeLinks[0]).toHaveAttribute('href', '/subscription');
  });

  it('at cap checked row can be unchecked', async () => {
    setupMocks({ availableProviders: [providerFree, providerFreeB] }, { userTier: tierFree });
    renderWithRouter(<AIModelSelectorList onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId('model-list-item-model-free'));
    await user.click(screen.getByTestId('model-list-item-model-free'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('ultra tier has no count cap and can access premium model row', async () => {
    setupMocks(
      { availableProviders: [providerFree, providerPremium], isConfigLoading: false },
      { userTier: tierUltra },
    );
    renderWithRouter(<AIModelSelectorList onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId('model-list-item-model-free'));
    await user.click(screen.getByTestId('model-list-item-model-premium'));

    expect(onChange).toHaveBeenLastCalledWith(['model-free', 'model-premium']);
    expect(screen.queryByTestId('upgrade-link-cap-model-free')).toBeNull();
    expect(
      within(screen.getByTestId('model-list-item-model-premium')).queryByTestId(
        'tier-lock-model-premium',
      ),
    ).toBeNull();
  });
});
