import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initialAiStateValues } from '@paynless/types';
import { AIModelSelectorList } from './AIModelSelectorList';
import { mockUserTier, mockAllTiers } from '../../mocks/profile.mock';
import { mockAiProvidersRow } from '../../mocks/dialecticStore.mock';
import {
  mockedUseAuthStoreHookLogic,
  resetAuthStoreMock,
} from '../../mocks/authStore.mock';
import { getAiStoreState, mockSetState, resetAiStoreMock } from '../../mocks/aiStore.mock';
import type { AiProvider, UserTier, AiState, AiProvidersRow } from '@paynless/types';

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  const authMock = await import('../../mocks/authStore.mock');
  const aiMock = await import('../../mocks/aiStore.mock');
  return {
    ...actual,
    useAuthStore: authMock.useAuthStore,
    useAiStore: aiMock.useAiStore,
  };
});

function renderWithRouter(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const testProviderOverrides: Partial<AiProvidersRow> = {
  created_at: 'test',
  updated_at: 'test',
  config: null,
  description: null,
  is_active: true,
  is_enabled: true,
  is_default_embedding: false,
  is_default_generation: false,
};

function mockTestAiProvider(overrides: Partial<AiProvidersRow>): AiProvider {
  return mockAiProvidersRow({ ...testProviderOverrides, ...overrides });
}

function setupMocks(
  aiPartial: Partial<AiState> = {},
  authPartial: {
    userTier?: UserTier | null;
    availableTiers?: UserTier[];
    isLoading?: boolean;
    error?: Error | null;
  } = {},
) {
  resetAuthStoreMock();
  resetAiStoreMock();
  act(() => {
    mockSetState({
      ...initialAiStateValues,
      availableProviders: [],
      isConfigLoading: false,
      aiError: null,
      ...aiPartial,
    });
    mockedUseAuthStoreHookLogic.setState({
      userTier: authPartial.userTier !== undefined ? authPartial.userTier : mockUserTier,
      availableTiers: authPartial.availableTiers !== undefined ? authPartial.availableTiers : mockAllTiers,
      isLoading: authPartial.isLoading !== undefined ? authPartial.isLoading : false,
      error: authPartial.error !== undefined ? authPartial.error : null,
    });
  });
  return { loadAiConfig: getAiStoreState().loadAiConfig };
}

const tierFree: UserTier = mockUserTier;
const tierUltra: UserTier = mockAllTiers[3];

const providerFree: AiProvider = mockTestAiProvider({
  id: 'model-free',
  name: 'Free Model',
  api_identifier: 'model-free',
  min_plan_tier_level: 0,
});

const providerFreeB: AiProvider = mockTestAiProvider({
  id: 'model-free-b',
  name: 'Free B',
  api_identifier: 'model-free-b',
  min_plan_tier_level: 0,
});

const providerPremium: AiProvider = mockTestAiProvider({
  id: 'model-premium',
  name: 'Premium Model',
  api_identifier: 'model-premium',
  min_plan_tier_level: 20,
});

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
      { isLoading: false, userTier: tierFree, availableTiers: mockAllTiers },
    );
    renderWithRouter(<AIModelSelectorList onChange={onChange} />);
    const user = userEvent.setup();

    expect(
      within(screen.getByTestId('model-list-item-model-premium')).getByTestId(
        'tier-lock-model-premium',
      ),
    ).not.toBeNull();

    const premiumCheckbox = within(screen.getByTestId('model-list-item-model-premium')).getByRole(
      'checkbox',
    );
    expect(premiumCheckbox.hasAttribute('disabled')).toBe(true);

    await user.click(screen.getByTestId('model-list-item-model-premium'));
    expect(onChange).not.toHaveBeenCalled();

    const freeCheckbox = within(screen.getByTestId('model-list-item-model-free')).getByRole(
      'checkbox',
    );
    expect(freeCheckbox.hasAttribute('disabled')).toBe(false);
    await user.click(screen.getByTestId('model-list-item-model-free'));
    expect(onChange).toHaveBeenCalledWith(['model-free']);
  });

  it('tier-locked row shows upgrade CTA at row interaction point', async () => {
    setupMocks(
      { availableProviders: [providerFree, providerPremium], isConfigLoading: false },
      { isLoading: false, userTier: tierFree, availableTiers: mockAllTiers },
    );
    renderWithRouter(<AIModelSelectorList onChange={onChange} />);
    const user = userEvent.setup();

    await user.hover(screen.getByTestId('model-list-item-model-premium'));

    const tierPlanMessages = screen.getAllByText(/This model requires a Premium plan/i);
    expect(tierPlanMessages.length).toBeGreaterThanOrEqual(1);
    const upgradeLinks = screen.getAllByTestId('upgrade-link-tier-model-premium');
    expect(upgradeLinks[0].getAttribute('href')).toBe('/subscription');
  });

  it('at max_models_per_project unchecked rows cannot be checked', async () => {
    setupMocks(
      { availableProviders: [providerFree, providerFreeB] },
      { isLoading: false, userTier: tierFree },
    );
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
    setupMocks(
      { availableProviders: [providerFree, providerFreeB] },
      { isLoading: false, userTier: tierFree },
    );
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
    expect(capUpgradeLinks[0].getAttribute('href')).toBe('/subscription');
  });

  it('at cap checked row can be unchecked', async () => {
    setupMocks(
      { availableProviders: [providerFree, providerFreeB] },
      { isLoading: false, userTier: tierFree },
    );
    renderWithRouter(<AIModelSelectorList onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId('model-list-item-model-free'));
    await user.click(screen.getByTestId('model-list-item-model-free'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('ultra tier has no count cap and can access premium model row', async () => {
    setupMocks(
      { availableProviders: [providerFree, providerPremium], isConfigLoading: false },
      { isLoading: false, userTier: tierUltra },
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

  it('shows loading notice while auth isLoading', async () => {
    setupMocks(
      { availableProviders: [providerFree, providerPremium] },
      { isLoading: true, userTier: tierFree },
    );
    renderWithRouter(<AIModelSelectorList onChange={onChange} />);
    const user = userEvent.setup();

    expect(screen.getByTestId('ai-model-selector-list-loading-notice').textContent).toBe(
      'Loading subscription tier…',
    );
    expect(screen.queryByTestId(/^tier-lock-/)).toBeNull();
    expect(screen.queryByTestId(/^model-list-item-/)).toBeNull();

    const clickableSurfaces = screen.queryAllByRole('button');
    for (const surface of clickableSurfaces) {
      await user.click(surface);
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows tier unavailable notice when auth loaded and userTier is null', () => {
    setupMocks(
      { availableProviders: [providerFree] },
      { isLoading: false, userTier: null, availableTiers: mockAllTiers },
    );
    renderWithRouter(<AIModelSelectorList onChange={onChange} />);

    expect(screen.getByTestId('ai-model-selector-list-tier-unavailable-notice').textContent).toBe(
      'Subscription tier is not available.',
    );
    expect(screen.queryByTestId(/^model-list-item-/)).toBeNull();
    expect(screen.queryByTestId(/^tier-lock-/)).toBeNull();
  });

  it('does not synthesize level-0 tier when userTier is null', () => {
    setupMocks(
      { availableProviders: [providerFree, providerPremium] },
      { isLoading: false, userTier: null, availableTiers: mockAllTiers },
    );
    renderWithRouter(<AIModelSelectorList onChange={onChange} />);

    expect(screen.getByTestId('ai-model-selector-list-tier-unavailable-notice')).not.toBeNull();
    expect(screen.queryByTestId('tier-lock-model-premium')).toBeNull();
    expect(screen.queryByTestId(/^model-list-item-/)).toBeNull();
  });

  it('shows auth error message in tier unavailable notice when auth loaded and authStore.error is set', () => {
    const tierFetchError: Error = new Error('Profile tier fetch failed.');
    setupMocks(
      { availableProviders: [providerFree, providerPremium] },
      { isLoading: false, userTier: tierFree, error: tierFetchError },
    );
    renderWithRouter(<AIModelSelectorList onChange={onChange} />);

    expect(screen.getByTestId('ai-model-selector-list-tier-unavailable-notice').textContent).toBe(
      'Profile tier fetch failed.',
    );
    expect(screen.queryByTestId(/^tier-lock-/)).toBeNull();
    expect(screen.queryByTestId(/^model-list-item-/)).toBeNull();
  });
});
