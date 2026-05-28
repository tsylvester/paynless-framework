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
	AIModelCatalogEntry,
	NavigateFunction,
	SelectedModels,
	UserTier,
} from '@paynless/types';
import { useAuthStore, useDialecticStore } from '@paynless/store';
import { OutputCapSlider } from './OutputCapSlider';
import { mockAllTiers, mockUserTier } from '../../mocks/profile.mock';

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

const integrationModelCatalogEntry: AIModelCatalogEntry = {
	id: 'model-integration-1',
	provider_name: 'OpenAI',
	model_name: 'Integration Model',
	api_identifier: 'model-integration-1',
	description: null,
	strengths: null,
	weaknesses: null,
	context_window_tokens: null,
	input_token_cost_usd_millionths: null,
	output_token_cost_usd_millionths: null,
	max_output_tokens: 200000,
	is_active: true,
	created_at: '2025-01-01T00:00:00Z',
	updated_at: '2025-01-01T00:00:00Z',
	is_default_generation: false,
	min_plan_tier_level: 0,
};

const integrationSelectedModels: SelectedModels[] = [
	{
		id: integrationModelCatalogEntry.id,
		displayName: integrationModelCatalogEntry.model_name,
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
		maxOutputTokens: number | null;
	},
): void {
	act(() => {
		useAuthStore.setState({
			userTier: authOverrides.userTier,
			availableTiers: authOverrides.availableTiers,
		});
		useDialecticStore.setState({
			modelCatalog: [integrationModelCatalogEntry],
			selectedModels: integrationSelectedModels,
			maxOutputTokens: dialecticOverrides.maxOutputTokens,
		});
	});
}

function logSliderArrowPressCount(
	fromTokens: number,
	toTokens: number,
	trackMax: number,
): number {
	const logMin = Math.log(1024);
	const logMax = Math.log(trackMax);
	const logStep = (logMax - logMin) / 200;
	const fromInternal = Math.log(fromTokens);
	const toInternal = Math.log(toTokens);
	return Math.round((toInternal - fromInternal) / logStep);
}

async function dragSliderToTokens(
	fromTokens: number,
	toTokens: number,
	trackMax: number,
): Promise<void> {
	const slider = screen.getByRole('slider');
	slider.focus();
	const arrowPressCount = logSliderArrowPressCount(
		fromTokens,
		toTokens,
		trackMax,
	);
	for (let index = 0; index < arrowPressCount; index += 1) {
		await userEvent.keyboard('{ArrowRight}');
	}
}

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

	it('function → consumer: persists chosen cap to real dialectic store', async () => {
		seedIntegrationStores(
			{ userTier: mockUserTier, availableTiers: mockAllTiers },
			{ maxOutputTokens: 4096 },
		);

		renderWithRouter(<OutputCapSlider />);

		await userEvent.click(screen.getByRole('button', { name: /free/i }));

		await waitFor(() => {
			expect(useDialecticStore.getState().maxOutputTokens).toBe(8192);
		});
	});

	it('full chain: basic tier thumb cap, slider interaction, premium upgrade CTA, and subscription navigation', async () => {
		seedIntegrationStores(
			{ userTier: tierBasic, availableTiers: mockAllTiers },
			{ maxOutputTokens: 8192 },
		);

		renderWithRouter(<OutputCapSlider />);

		const slider = screen.getByRole('slider');
		expect(slider).toHaveAttribute('aria-valuemax', '200000');

		await userEvent.click(screen.getByRole('button', { name: /free/i }));
		await waitFor(() => {
			expect(useDialecticStore.getState().maxOutputTokens).toBe(8192);
		});

		await dragSliderToTokens(8192, 16384, 200000);

		await waitFor(() => {
			const sliderAfterDrag = screen.getByRole('slider');
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
			screen.getByText(byExactTextContent('Upgrade to premium')),
		).toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: /^upgrade$/i }),
		).toBeInTheDocument();

		await userEvent.click(screen.getByRole('button', { name: /^upgrade$/i }));

		expect(mockNavigate).toHaveBeenCalledTimes(1);
		expect(mockNavigate).toHaveBeenCalledWith('/subscription');
	});
});
