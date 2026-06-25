import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReactElement } from 'react';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
	type Mock,
} from 'vitest';
import type {
	AiModelExtendedConfig,
	AiProvidersRow,
	NavigateFunction,
	SelectedModels,
	UserTier,
} from '@paynless/types';
import { isJson } from '@paynless/utils';
import { useAuthStore, useDialecticStore } from '@paynless/store';
import { OutputCapSlider } from './OutputCapSlider';
import { mockAllTiers, mockUserTier } from '../../mocks/profile.mock';
import { mockAiModelConfig, mockAiProvidersRow } from '../../mocks/dialecticStore.mock';

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

const userFacingTiers: UserTier[] = mockAllTiers.filter(
	(tier) => tier.name !== 'unreachable',
);
const tierBasic: UserTier = mockAllTiers[1];

const MIN_OUTPUT_TOKENS = 1024;
const SLIDER_STEPS_PER_SEGMENT = 50;
const MODEL_TRACK_MAX = 200000;

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

const integrationModelConfig: AiModelExtendedConfig = mockAiModelConfig({
	hard_cap_output_tokens: MODEL_TRACK_MAX + 1,
	provider_max_output_tokens: MODEL_TRACK_MAX,
});
if (!isJson(integrationModelConfig)) {
	throw new Error('config is not a valid JSON object');
}

const integrationModelCatalogEntry: AiProvidersRow = mockAiProvidersRow({
	id: 'model-integration-1',
	name: 'Integration Model',
	config: integrationModelConfig,
});
	
const integrationSelectedModels: SelectedModels[] = [
	{
		id: integrationModelCatalogEntry.id,
		displayName: integrationModelCatalogEntry.name,
	},
];

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

function resetIntegrationStores(): void {
	act(() => {
		const dialecticReset = useDialecticStore.getState()._resetForTesting;
		if (dialecticReset !== undefined) {
			dialecticReset();
		}
		useAuthStore.setState(useAuthStore.getInitialState());
	});
}

function seedIntegrationStores(
	authOverrides: {
		userTier: UserTier;
		availableTiers: UserTier[];
	},
	dialecticOverrides: {
		maxOutputTokens: number;
	},
): void {
	act(() => {
		useAuthStore.setState({
			userTier: authOverrides.userTier,
			availableTiers: authOverrides.availableTiers,
			isLoading: false,
			error: null,
		});
		useDialecticStore.setState({
			modelCatalog: [integrationModelCatalogEntry],
			selectedModels: integrationSelectedModels,
			maxOutputTokens: dialecticOverrides.maxOutputTokens,
		});
	});
}

// Interaction tests seed a finite maxOutputTokens (parent-owned initializeMaxOutputTokens).
// null store cap renders output-cap-slider-blocked-notice — no draggable slider.

describe('OutputCapSlider integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetIntegrationStores();
	});

	afterEach(() => {
		resetIntegrationStores();
	});

	it('provider → function: filters unreachable tier and renders four markers', () => {
		expect(mockAllTiers).toHaveLength(5);
		expect(mockAllTiers[4].name).toBe('unreachable');

		seedIntegrationStores(
			{ userTier: mockUserTier, availableTiers: mockAllTiers },
			{ maxOutputTokens: 8192 },
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

	it('function → consumer: persists chosen cap to real dialectic store', async () => {
		const trackMax = 200000;
		const initialCap = 4096;
		expect(mockUserTier.output_cap_tokens).toBe(8192);
		const freeTierThumbMax: number = 8192;

		seedIntegrationStores(
			{ userTier: mockUserTier, availableTiers: mockAllTiers },
			{ maxOutputTokens: initialCap },
		);

		renderWithRouter(<OutputCapSlider />);

		await dragSegmentedSliderToTokens(initialCap, freeTierThumbMax, trackMax);

		const sliderAfterDrag = screen.getByRole('slider');
		await userEvent.tab();

		await waitFor(() => {
			const ariaValue = sliderAfterDrag.getAttribute('aria-valuenow');
			expect(ariaValue).not.toBeNull();
			const thumbTokens = Number(ariaValue);
			const storedCap = useDialecticStore.getState().maxOutputTokens;
			expect(storedCap).toBe(thumbTokens);
			expect(storedCap).toBeGreaterThan(initialCap);
			expect(storedCap).toBeLessThanOrEqual(freeTierThumbMax);
		});
	});

	it('full chain: basic tier thumb cap, slider interaction, premium upgrade CTA, and subscription navigation', async () => {
		seedIntegrationStores(
			{ userTier: tierBasic, availableTiers: mockAllTiers },
			{ maxOutputTokens: 8192 },
		);

		renderWithRouter(<OutputCapSlider />);

		const slider = screen.getByRole('slider');
		expect(slider.getAttribute('aria-valuemax')).toBe('200000');

		await userEvent.click(screen.getByRole('button', { name: /free/i }));
		await waitFor(() => {
			expect(useDialecticStore.getState().maxOutputTokens).toBe(8192);
		});

		await dragSegmentedSliderToTokens(8192, 16384, MODEL_TRACK_MAX);

		const sliderAfterDrag = screen.getByRole('slider');
		await userEvent.tab();

		await waitFor(() => {
			const ariaValue = sliderAfterDrag.getAttribute('aria-valuenow');
			expect(ariaValue).not.toBeNull();
			const thumbTokens = Number(ariaValue);
			const storedCap = useDialecticStore.getState().maxOutputTokens;
			expect(storedCap).toBe(thumbTokens);
			expect(storedCap).toBeGreaterThan(8192);
			expect(storedCap).toBeLessThan(32768);
		});

		await userEvent.click(screen.getByRole('button', { name: /premium/i }));

		expect(
			screen.getByText(byExactTextContent(upgradeCtaText('premium'))),
		).not.toBeNull();
		expect(
			screen.getByRole('button', { name: /^upgrade$/i }),
		).not.toBeNull();

		await userEvent.click(screen.getByRole('button', { name: /^upgrade$/i }));

		expect(mockNavigate).toHaveBeenCalledTimes(1);
		expect(mockNavigate).toHaveBeenCalledWith('/subscription');
	});
});
