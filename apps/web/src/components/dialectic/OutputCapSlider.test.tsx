import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi, Mock } from 'vitest';
import {
	AiProvidersRow,
	AuthStore,
	DialecticStateValues,
	NavigateFunction,
	SelectedModels,
	UserTier,
} from '@paynless/types';
import { OutputCapSlider } from './OutputCapSlider';
import { mockAllTiers, mockUserTier } from '../../mocks/profile.mock';
import {
	mockedUseAuthStoreHookLogic,
	resetAuthStoreMock,
} from '../../mocks/authStore.mock';
import {
	getDialecticStoreActionMock,
	initializeMockDialecticState,
	mockAiProvidersRow,
	mockSelectedModelsForCatalog,
	resetDialecticStoreMock,
} from '../../mocks/dialecticStore.mock';

const mockNavigate: Mock<
	Parameters<NavigateFunction>,
	ReturnType<NavigateFunction>
> = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
	const actual = await importOriginal<typeof import('react-router-dom')>();
	return {
		...actual,
		useNavigate: () => mockNavigate,
	};
});

vi.mock('@paynless/store', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@paynless/store')>();
	const authMock = await import('../../mocks/authStore.mock');
	const dialecticMock = await import('../../mocks/dialecticStore.mock');
	return {
		...actual,
		useAuthStore: authMock.useAuthStore,
		useDialecticStore: dialecticMock.useDialecticStore,
	};
});

function renderWithRouter(ui: ReactElement) {
	return render(<MemoryRouter>{ui}</MemoryRouter>);
}

function elementHasExactAggregatedText(
	element: Element | null,
	expectedText: string,
): boolean {
	if (element === null) {
		return false;
	}
	if (element.textContent !== expectedText) {
		return false;
	}
	const descendants = element.querySelectorAll('*');
	for (let index = 0; index < descendants.length; index += 1) {
		const descendant = descendants.item(index);
		if (descendant !== null) {
			if (descendant.textContent === expectedText) {
				return false;
			}
		}
	}
	return true;
}

function byExactTextContent(expectedText: string) {
	return (_content: string, element: Element | null): boolean =>
		elementHasExactAggregatedText(element, expectedText);
}

const MIN_OUTPUT_TOKENS = 1024;
const SLIDER_STEPS_PER_SEGMENT = 50;
const UPGRADE_CTA_THRESHOLD_RATIO = 0.85;
const MODEL_TRACK_MAX = 200000;

const userFacingTiers: UserTier[] = mockAllTiers.filter(
	(tier) => tier.name !== 'unreachable',
);
const tierBasic: UserTier = mockAllTiers[1];
const tierUltra: UserTier = mockAllTiers[3];

function upgradeCtaText(tierName: string): string {
	return `Upgrade to ${tierName} for larger output limits`;
}

function tierSegmentMax(tier: UserTier, trackMax: number): number {
	if (tier.output_cap_tokens === null) {
		return trackMax;
	}
	if (tier.output_cap_tokens > trackMax) {
		return trackMax;
	}
	return tier.output_cap_tokens;
}

function tokensToInternalSliderValue(tokens: number, trackMax: number): number {
	let segmentMin: number = MIN_OUTPUT_TOKENS;
	for (let tierIndex = 0; tierIndex < userFacingTiers.length; tierIndex += 1) {
		const tier: UserTier = userFacingTiers[tierIndex];
		const segmentMax: number = tierSegmentMax(tier, trackMax);
		const segmentStart: number = tierIndex;
		const segmentEnd: number = tierIndex + 1;
		const isLastSegment: boolean = tierIndex === userFacingTiers.length - 1;
		if (tokens <= segmentMax || isLastSegment) {
			if (segmentMax <= segmentMin) {
				return segmentEnd;
			}
			const segmentProgress: number =
				(tokens - segmentMin) / (segmentMax - segmentMin);
			return segmentStart + segmentProgress;
		}
		segmentMin = segmentMax;
	}
	return 0;
}

function segmentedArrowPressCount(
	fromTokens: number,
	toTokens: number,
	trackMax: number,
): number {
	const fromInternal: number = tokensToInternalSliderValue(fromTokens, trackMax);
	const toInternal: number = tokensToInternalSliderValue(toTokens, trackMax);
	const sliderStep: number = 1 / SLIDER_STEPS_PER_SEGMENT;
	return Math.ceil((toInternal - fromInternal) / sliderStep);
}

async function dragSegmentedSliderToTokens(
	fromTokens: number,
	toTokens: number,
	trackMax: number,
): Promise<void> {
	const slider = screen.getByRole('slider');
	slider.focus();
	const arrowPressCount: number = segmentedArrowPressCount(
		fromTokens,
		toTokens,
		trackMax,
	);
	for (let index = 0; index < arrowPressCount; index += 1) {
		await userEvent.keyboard('{ArrowRight}');
	}
}

function setupMockStores(
	dialecticOverrides: Partial<DialecticStateValues>,
	authOverrides: Partial<AuthStore>,
) {
	const modelCatalog: AiProvidersRow[] = [
		mockAiProvidersRow({ config: { provider_max_output_tokens: 200000 } }),
	];
	const selectedModels = mockSelectedModelsForCatalog(modelCatalog);

	resetDialecticStoreMock();
	resetAuthStoreMock();
	initializeMockDialecticState({
		modelCatalog,
		selectedModels,
		...dialecticOverrides,
	});
	act(() => {
		mockedUseAuthStoreHookLogic.setState(authOverrides);
	});
	const setMaxOutputTokens = getDialecticStoreActionMock('setMaxOutputTokens');
	return { setMaxOutputTokens };
}

describe('OutputCapSlider', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders exactly 4 tier markers from availableTiers and excludes unreachable', () => {
		expect(mockAllTiers).toHaveLength(5);
		expect(mockAllTiers[4].name).toBe('unreachable');

		setupMockStores(
			{ maxOutputTokens: 8192 },
			{ userTier: mockUserTier, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);

		for (const tier of userFacingTiers) {
			expect(
				screen.getByRole('button', { name: new RegExp(tier.name, 'i') }),
			).toBeInTheDocument();
		}

		const tierMarkerButtons = screen
			.getAllByRole('button')
			.filter((button) =>
				userFacingTiers.some((tier) =>
					button.textContent?.toLowerCase().includes(tier.name),
				),
			);
		expect(tierMarkerButtons).toHaveLength(userFacingTiers.length);
		expect(screen.queryByText(/unreachable/i)).not.toBeInTheDocument();
	});

	it('slider track max equals highest max_output_tokens from selected models catalog entries', () => {
		const modelCatalog: AiProvidersRow[] = [
			mockAiProvidersRow({ config: { provider_max_output_tokens: 200000 } }),
		];
		const selectedModels: SelectedModels[] =
			mockSelectedModelsForCatalog(modelCatalog);

		setupMockStores(
			{
				maxOutputTokens: 8192,
				modelCatalog,
				selectedModels,
			},
			{ userTier: mockUserTier, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);

		expect(screen.getByRole('slider')).toHaveAttribute(
			'aria-valuemax',
			'200000',
		);
	});

	it('slider thumb cannot exceed userTier.output_cap_tokens while track extends to model max', async () => {
		setupMockStores(
			{ maxOutputTokens: 8192 },
			{ userTier: tierBasic, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);

		const slider = screen.getByRole('slider');
		expect(slider).toHaveAttribute('aria-valuemax', '200000');

		slider.focus();
		await userEvent.keyboard('{End}');

		await waitFor(() => {
			expect(screen.getByRole('slider')).toHaveAttribute(
				'aria-valuenow',
				'32768',
			);
		});
		expect(screen.getByRole('slider')).toHaveAttribute(
			'aria-valuemax',
			'200000',
		);
	});

	it('clicking a within-tier marker calls setMaxOutputTokens with that tier output_cap_tokens', async () => {
		const { setMaxOutputTokens } = setupMockStores(
			{ maxOutputTokens: 4096 },
			{ userTier: mockUserTier, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);

		await userEvent.click(screen.getByRole('button', { name: /free/i }));

		expect(setMaxOutputTokens).toHaveBeenCalledTimes(1);
		expect(setMaxOutputTokens).toHaveBeenCalledWith(8192);
	});

	it('clicking an above-tier marker shows upgrade CTA with tier name and does not call setMaxOutputTokens', async () => {
		const { setMaxOutputTokens } = setupMockStores(
			{ maxOutputTokens: 8192 },
			{ userTier: mockUserTier, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);

		await userEvent.click(screen.getByRole('button', { name: /premium/i }));

		expect(
			screen.getByText(byExactTextContent(upgradeCtaText('premium'))),
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /^upgrade$/i })).toBeInTheDocument();
		expect(setMaxOutputTokens).not.toHaveBeenCalled();
	});

	it('upgrade CTA click calls navigate with /subscription', async () => {
		setupMockStores(
			{ maxOutputTokens: 8192 },
			{ userTier: mockUserTier, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);

		await userEvent.click(screen.getByRole('button', { name: /premium/i }));
		await userEvent.click(screen.getByRole('button', { name: /^upgrade$/i }));

		expect(mockNavigate).toHaveBeenCalledTimes(1);
		expect(mockNavigate).toHaveBeenCalledWith('/subscription');
	});

	it('ultra user thumb can reach slider track max and does not show upgrade CTA', async () => {
		const modelCatalog: AiProvidersRow[] = [
			mockAiProvidersRow({
				id: 'model-a',
				name: 'Model A',
				config: { provider_max_output_tokens: 64000 },
			}),
			mockAiProvidersRow({
				id: 'model-b',
				name: 'Model B',
				config: { provider_max_output_tokens: 100000 },
			}),
		];
		const selectedModels: SelectedModels[] =
			mockSelectedModelsForCatalog(modelCatalog);

		setupMockStores(
			{
				maxOutputTokens: 50000,
				modelCatalog,
				selectedModels,
			},
			{ userTier: tierUltra, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);

		const slider = screen.getByRole('slider');
		expect(slider).toHaveAttribute('aria-valuemax', '100000');

		slider.focus();
		await userEvent.keyboard('{End}');

		await waitFor(() => {
			expect(screen.getByRole('slider')).toHaveAttribute(
				'aria-valuenow',
				'100000',
			);
		});
		expect(screen.queryByRole('button', { name: /^upgrade$/i })).not.toBeInTheDocument();
	});

	it('when maxOutputTokens is null in store, component renders with tier default display', () => {
		setupMockStores(
			{ maxOutputTokens: null },
			{ userTier: mockUserTier, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);

		expect(screen.getAllByText('8.2k').length).toBeGreaterThan(0);
		expect(
			screen.getByText(
				byExactTextContent('Your free tier allows up to 8.2k tokens'),
			),
		).toBeInTheDocument();
	});

	it('when availableTiers is empty, component handles gracefully without tier markers', () => {
		const modelCatalog: AiProvidersRow[] = [
			mockAiProvidersRow({ config: { provider_max_output_tokens: 200000 } }),
		];

		setupMockStores(
			{
				modelCatalog,
				selectedModels: mockSelectedModelsForCatalog(modelCatalog),
			},
			{ userTier: null, availableTiers: [] },
		);

		const { container } = renderWithRouter(<OutputCapSlider />);

		expect(screen.queryByText('free')).not.toBeInTheDocument();
		expect(screen.queryByText('basic')).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /free/i })).not.toBeInTheDocument();
		expect(container.firstChild).toBeNull();
	});

	it('when selectedModels is empty, component returns null and does not render slider', () => {
		const modelCatalog: AiProvidersRow[] = [
			mockAiProvidersRow({ config: { provider_max_output_tokens: 200000 } }),
		];

		setupMockStores(
			{
				maxOutputTokens: 8192,
				modelCatalog,
				selectedModels: [],
			},
			{ userTier: mockUserTier, availableTiers: mockAllTiers },
		);

		const { container } = renderWithRouter(<OutputCapSlider />);

		expect(screen.queryByRole('slider')).not.toBeInTheDocument();
		expect(container.firstChild).toBeNull();
	});

	it('tier markers display approximate page counts and current value updates page equivalent on slider move', async () => {
		setupMockStores(
			{ maxOutputTokens: 8192 },
			{ userTier: tierBasic, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);

		expect(screen.getAllByText(/at most ~25 pages/i).length).toBeGreaterThan(0);

		await userEvent.click(screen.getByRole('button', { name: /basic/i }));

		await waitFor(() => {
			expect(screen.getAllByText(/at most ~98 pages/i).length).toBeGreaterThan(
				0,
			);
		});
	});

	it('clicking within-tier basic marker calls setMaxOutputTokens with 32768', async () => {
		const { setMaxOutputTokens } = setupMockStores(
			{ maxOutputTokens: 8192 },
			{ userTier: tierBasic, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);

		await userEvent.click(screen.getByRole('button', { name: /basic/i }));

		expect(setMaxOutputTokens).toHaveBeenCalledWith(32768);
	});

	it('shows upgrade CTA when slider enters top threshold and persists values at or below tier cap', async () => {
		const basicThumbMax: number = 32768;
		const upgradeThresholdTokens: number = Math.ceil(
			basicThumbMax * UPGRADE_CTA_THRESHOLD_RATIO,
		);
		const { setMaxOutputTokens } = setupMockStores(
			{ maxOutputTokens: 16384 },
			{ userTier: tierBasic, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);
		vi.mocked(setMaxOutputTokens).mockClear();

		await dragSegmentedSliderToTokens(
			16384,
			upgradeThresholdTokens,
			MODEL_TRACK_MAX,
		);

		await waitFor(() => {
			expect(
				screen.getByText(byExactTextContent(upgradeCtaText('premium'))),
			).toBeInTheDocument();
		});
		await waitFor(() => {
			const ariaValue: string | null = screen
				.getByRole('slider')
				.getAttribute('aria-valuenow');
			expect(ariaValue).not.toBeNull();
			expect(Number(ariaValue)).toBeGreaterThanOrEqual(upgradeThresholdTokens);
			expect(Number(ariaValue)).toBeLessThanOrEqual(basicThumbMax);
		});

		expect(setMaxOutputTokens).toHaveBeenCalled();
		const persistedCalls: number[] = vi
			.mocked(setMaxOutputTokens)
			.mock.calls.map((call) => call[0]);
		for (const persistedTokens of persistedCalls) {
			expect(persistedTokens).toBeLessThanOrEqual(basicThumbMax);
		}
		const lastPersistedTokens: number =
			persistedCalls[persistedCalls.length - 1];
		expect(lastPersistedTokens).toBeGreaterThanOrEqual(upgradeThresholdTokens);
		expect(lastPersistedTokens).toBeLessThanOrEqual(basicThumbMax);
	});

	it('shows upgrade CTA when slider is pulled past tier cap and does not persist values above tier cap', async () => {
		const basicThumbMax: number = 32768;
		const { setMaxOutputTokens } = setupMockStores(
			{ maxOutputTokens: 32000 },
			{ userTier: tierBasic, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);
		vi.mocked(setMaxOutputTokens).mockClear();

		await dragSegmentedSliderToTokens(32000, 40000, MODEL_TRACK_MAX);

		await waitFor(() => {
			expect(
				screen.getByText(byExactTextContent(upgradeCtaText('premium'))),
			).toBeInTheDocument();
		});
		await waitFor(() => {
			expect(screen.getByRole('slider')).toHaveAttribute(
				'aria-valuenow',
				String(basicThumbMax),
			);
		});

		const persistedCalls: number[] = vi
			.mocked(setMaxOutputTokens)
			.mock.calls.map((call) => call[0]);
		for (const persistedTokens of persistedCalls) {
			expect(persistedTokens).toBeLessThanOrEqual(basicThumbMax);
		}
		expect(persistedCalls.length).toBeGreaterThan(0);
		const lastPersistedTokens: number =
			persistedCalls[persistedCalls.length - 1];
		expect(lastPersistedTokens).toBeLessThanOrEqual(basicThumbMax);
	});
});
