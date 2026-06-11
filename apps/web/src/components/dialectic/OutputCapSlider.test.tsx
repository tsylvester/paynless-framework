import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FormEvent, ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi, Mock } from 'vitest';
import {
	AiProvidersRow,
	AuthStore,
	DialecticStateValues,
	Json,
	NavigateFunction,
	AiModelExtendedConfig,
	SelectedModels,
	UserTier,
} from '@paynless/types';
import { isJson } from '@paynless/utils';
import { OutputCapSlider } from './OutputCapSlider';
import { mockAllTiers, mockUserTier } from '../../mocks/profile.mock';
import {
	mockSetAuthError,
	mockSetAuthIsLoading,
	mockedUseAuthStoreHookLogic,
	resetAuthStoreMock,
} from '../../mocks/authStore.mock';
import {
	getDialecticStoreActionMock,
	initializeMockDialecticState,
	mockAiModelConfig,
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

const modelConfig: AiModelExtendedConfig = mockAiModelConfig({
	hard_cap_output_tokens: MODEL_TRACK_MAX + 1,
	provider_max_output_tokens: MODEL_TRACK_MAX,
});
if (!isJson(modelConfig)) {
	throw new Error('config is not a valid JSON object');
}

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
	if (!isJson(modelConfig)) {
		throw new Error('config is not a valid JSON object');
	}
	const modelCatalog: AiProvidersRow[] = [
		mockAiProvidersRow({
			config: modelConfig,
		}),
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
			).not.toBeNull();
		}

		const tierMarkerButtons = screen
			.getAllByRole('button')
			.filter((button) =>
				userFacingTiers.some((tier) =>
					button.textContent?.toLowerCase().includes(tier.name),
				),
			);
		expect(tierMarkerButtons).toHaveLength(userFacingTiers.length);
		expect(screen.queryByText(/unreachable/i)).toBeNull();
	});

	it('slider track max equals highest max_output_tokens from selected models catalog entries', () => {
		if (!isJson(modelConfig)) {
			throw new Error('config is not a valid JSON object');
		}
		const modelCatalog: AiProvidersRow[] = [
			mockAiProvidersRow({
				config: modelConfig,
			}),
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

		expect(screen.getByRole('slider').getAttribute('aria-valuemax')).toBe('200000');
	});

	it('slider thumb cannot exceed userTier.output_cap_tokens while track extends to model max', async () => {
		setupMockStores(
			{ maxOutputTokens: 8192 },
			{ userTier: tierBasic, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);

		const slider = screen.getByRole('slider');
		expect(slider.getAttribute('aria-valuemax')).toBe('200000');

		slider.focus();
		await userEvent.keyboard('{End}');

		await waitFor(() => {
			expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('32768');
		});
		expect(screen.getByRole('slider').getAttribute('aria-valuemax')).toBe('200000');
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
		).not.toBeNull();
		expect(screen.getByRole('button', { name: /^upgrade$/i })).not.toBeNull();
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

	it('upgrade CTA click does not submit containing project form or trigger autostart', async () => {
		const autoStartProject: Mock<[], void> = vi.fn();
		const submitHandler: Mock<[FormEvent<HTMLFormElement>], void> = vi.fn(
			(event: FormEvent<HTMLFormElement>) => {
				event.preventDefault();
				autoStartProject();
			},
		);
		setupMockStores(
			{ maxOutputTokens: 8192 },
			{ userTier: mockUserTier, availableTiers: mockAllTiers },
		);

		renderWithRouter(
			<form onSubmit={submitHandler}>
				<OutputCapSlider />
				<button type="submit">Create Project</button>
			</form>,
		);

		await userEvent.click(screen.getByRole('button', { name: /premium/i }));
		await userEvent.click(screen.getByRole('button', { name: /^upgrade$/i }));

		expect(mockNavigate).toHaveBeenCalledTimes(1);
		expect(mockNavigate).toHaveBeenCalledWith('/subscription');
		expect(submitHandler).not.toHaveBeenCalled();
		expect(autoStartProject).not.toHaveBeenCalled();
	});

	it('ultra user thumb can reach slider track max and does not show upgrade CTA', async () => {
		const modelAConfig = mockAiModelConfig({
			hard_cap_output_tokens: 100000,
			provider_max_output_tokens: 64000,
		});
		if (!isJson(modelAConfig)) {
			throw new Error('config is not a valid JSON object');
		}
		const modelBConfig = mockAiModelConfig({
			hard_cap_output_tokens: MODEL_TRACK_MAX,
			provider_max_output_tokens: 100000,
		});
		if (!isJson(modelBConfig)) {
			throw new Error('config is not a valid JSON object');
		}
		const modelCatalog: AiProvidersRow[] = [
			mockAiProvidersRow({
				id: 'model-a',
				name: 'Model A',
				config: modelAConfig,
			}),
			mockAiProvidersRow({
				id: 'model-b',
				name: 'Model B',
				config: modelBConfig,
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
		expect(slider.getAttribute('aria-valuemax')).toBe('100000');

		slider.focus();
		await userEvent.keyboard('{End}');

		await waitFor(() => {
			expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('100000');
		});
		expect(screen.queryByRole('button', { name: /^upgrade$/i })).toBeNull();
	});

	it('when maxOutputTokens is null in store, shows blocked notice and does not call setMaxOutputTokens', () => {
		const { setMaxOutputTokens } = setupMockStores(
			{ maxOutputTokens: null },
			{ userTier: mockUserTier, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);

		expect(
			screen.getByTestId('output-cap-slider-blocked-notice'),
		).not.toBeNull();
		expect(screen.getByTestId('output-cap-slider-blocked-notice').textContent).toContain('Output cap is not initialized in dialectic store.');
		expect(screen.queryByRole('slider')).toBeNull();
		expect(setMaxOutputTokens).not.toHaveBeenCalled();
	});

	it('when availableTiers is empty, component handles gracefully without tier markers', () => {
		if (!isJson(modelConfig)) {
			throw new Error('config is not a valid JSON object');
		}
		const modelCatalog: AiProvidersRow[] = [
			mockAiProvidersRow({
				config: modelConfig,
			}),
		];

		setupMockStores(
			{
				maxOutputTokens: 8192,
				modelCatalog,
				selectedModels: mockSelectedModelsForCatalog(modelCatalog),
			},
			{ userTier: mockUserTier, availableTiers: [] },
		);

		const { container } = renderWithRouter(<OutputCapSlider />);

		expect(
			screen.getByTestId('output-cap-slider-blocked-notice'),
		).not.toBeNull();
		expect(screen.getByTestId('output-cap-slider-blocked-notice').textContent).toContain('Subscription tiers are not loaded.');
		expect(container.firstChild).not.toBeNull();
		expect(screen.queryByRole('button', { name: /free/i })).toBeNull();
		expect(screen.queryByRole('button', { name: /basic/i })).toBeNull();
	});

	it('when selectedModels is empty, shows blocked notice and does not render slider', () => {
		if (!isJson(modelConfig)) {
			throw new Error('config is not a valid JSON object');
		}
		const modelCatalog: AiProvidersRow[] = [
			mockAiProvidersRow({
				config: modelConfig,
			}),
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

		expect(
			screen.getByTestId('output-cap-slider-blocked-notice'),
		).not.toBeNull();
		expect(screen.getByTestId('output-cap-slider-blocked-notice').textContent).toContain('No models selected.');
		expect(screen.queryByRole('slider')).toBeNull();
		expect(container.firstChild).not.toBeNull();
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
			).not.toBeNull();
		});
		await waitFor(() => {
			const ariaValue: string | null = screen
				.getByRole('slider')
				.getAttribute('aria-valuenow');
			expect(ariaValue).not.toBeNull();
			expect(Number(ariaValue)).toBeGreaterThanOrEqual(upgradeThresholdTokens);
			expect(Number(ariaValue)).toBeLessThanOrEqual(basicThumbMax);
		});

		await waitFor(() => {
			expect(setMaxOutputTokens).toHaveBeenCalled();
		});
		let persistedCalls: number[] = vi
			.mocked(setMaxOutputTokens)
			.mock.calls.map((call) => call[0]);
		for (const persistedTokens of persistedCalls) {
			expect(persistedTokens).toBeLessThanOrEqual(basicThumbMax);
		}

		await userEvent.tab();

		await waitFor(() => {
			expect(setMaxOutputTokens).toHaveBeenCalled();
		});
		persistedCalls = vi
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
			).not.toBeNull();
		});
		await waitFor(() => {
			expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe(
				String(basicThumbMax),
			);
		});

		await waitFor(() => {
			expect(setMaxOutputTokens).toHaveBeenCalled();
		});
		let persistedCalls: number[] = vi
			.mocked(setMaxOutputTokens)
			.mock.calls.map((call) => call[0]);
		for (const persistedTokens of persistedCalls) {
			expect(persistedTokens).toBeLessThanOrEqual(basicThumbMax);
		}
		expect(persistedCalls.length).toBeGreaterThan(0);

		await userEvent.tab();

		await waitFor(() => {
			expect(setMaxOutputTokens).toHaveBeenCalled();
		});
		persistedCalls = vi
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

	it('shows blocked notice when only selected model has config that fails isAiModelExtendedConfig', () => {
		const malformedConfig: Json = { provider_max_output_tokens: MODEL_TRACK_MAX };
		if (!isJson(malformedConfig)) {
			throw new Error('config is not a valid JSON object');
		}
		const modelCatalog: AiProvidersRow[] = [
			mockAiProvidersRow({
				id: 'model-invalid-config',
				config: malformedConfig,
			}),
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

		const { container } = renderWithRouter(<OutputCapSlider />);

		expect(
			screen.getByTestId('output-cap-slider-blocked-notice'),
		).not.toBeNull();
		expect(screen.getByTestId('output-cap-slider-blocked-notice').textContent).toContain(
			'Model catalog config invalid for model id model-invalid-config.',
		);
		expect(screen.queryByRole('slider')).toBeNull();
		expect(container.firstChild).not.toBeNull();
	});

	it('slider track max is 200000 when selected model has valid full config with provider_max_output_tokens 200000', () => {
		if (!isJson(modelConfig)) {
			throw new Error('config is not a valid JSON object');
		}
		const modelCatalog: AiProvidersRow[] = [
			mockAiProvidersRow({
				config: modelConfig,
			}),
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

		expect(screen.getByRole('slider').getAttribute('aria-valuemax')).toBe('200000');
	});

	it('does not call setMaxOutputTokens on mount when maxOutputTokens already initialized', () => {
		const { setMaxOutputTokens } = setupMockStores(
			{ maxOutputTokens: 8192 },
			{ userTier: mockUserTier, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);

		expect(screen.getByRole('slider')).not.toBeNull();
		expect(setMaxOutputTokens).not.toHaveBeenCalled();
	});

	it('shows loading notice while auth isLoading', () => {
		setupMockStores(
			{ maxOutputTokens: 8192 },
			{ userTier: mockUserTier, availableTiers: mockAllTiers },
		);
		mockSetAuthIsLoading(true);

		renderWithRouter(<OutputCapSlider />);

		expect(
			screen.getByTestId('output-cap-slider-loading-notice'),
		).not.toBeNull();
		expect(screen.getByTestId('output-cap-slider-loading-notice').textContent).toContain('Loading subscription tier…');
		expect(screen.queryByRole('slider')).toBeNull();
		expect(
			screen.queryByTestId('output-cap-slider-blocked-notice'),
		).toBeNull();
	});

	it('when userTier is null and auth not loading, shows tier unavailable blocked notice', () => {
		setupMockStores(
			{ maxOutputTokens: 8192 },
			{ userTier: null, isLoading: false, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);

		expect(
			screen.getByTestId('output-cap-slider-blocked-notice'),
		).not.toBeNull();
		expect(screen.getByTestId('output-cap-slider-blocked-notice').textContent).toContain('Subscription tier is not available.');
		expect(screen.queryByRole('slider')).toBeNull();
	});

	it('when auth error is set and not loading, shows pass-through blocked notice', () => {
		setupMockStores(
			{ maxOutputTokens: 8192 },
			{ userTier: mockUserTier, availableTiers: mockAllTiers },
		);
		mockSetAuthError(new Error('Profile fetch failed.'));

		renderWithRouter(<OutputCapSlider />);

		expect(
			screen.getByTestId('output-cap-slider-blocked-notice'),
		).not.toBeNull();
		expect(
			screen.getByTestId('output-cap-slider-blocked-notice').textContent,
		).toContain('Profile fetch failed.');
		expect(screen.queryByRole('slider')).toBeNull();
	});
});
