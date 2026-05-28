import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi, Mock } from 'vitest';
import {
	AIModelCatalogEntry,
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
	mockAIModelCatalogEntry,
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

function setupMockStores(
	dialecticOverrides: Partial<DialecticStateValues>,
	authOverrides: Partial<AuthStore>,
) {
	const modelCatalog: AIModelCatalogEntry[] = [
		mockAIModelCatalogEntry({ max_output_tokens: 200000 }),
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

const userFacingTiers: UserTier[] = mockAllTiers.filter(
	(tier) => tier.name !== 'unreachable',
);
const tierBasic: UserTier = mockAllTiers[1];
const tierUltra: UserTier = mockAllTiers[3];

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
		const modelCatalog: AIModelCatalogEntry[] = [
			mockAIModelCatalogEntry({ max_output_tokens: 200000 }),
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
			screen.getByText(byExactTextContent('Upgrade to premium')),
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
		const modelCatalog: AIModelCatalogEntry[] = [
			mockAIModelCatalogEntry({
				id: 'model-a',
				model_name: 'Model A',
				max_output_tokens: 64000,
			}),
			mockAIModelCatalogEntry({
				id: 'model-b',
				model_name: 'Model B',
				max_output_tokens: 100000,
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
		const modelCatalog: AIModelCatalogEntry[] = [
			mockAIModelCatalogEntry({ max_output_tokens: 200000 }),
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
		const modelCatalog: AIModelCatalogEntry[] = [
			mockAIModelCatalogEntry({ max_output_tokens: 200000 }),
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

	it('shows upgrade CTA when dragging beyond basic tier cap without persisting invalid selection to store', async () => {
		const { setMaxOutputTokens } = setupMockStores(
			{ maxOutputTokens: 16384 },
			{ userTier: tierBasic, availableTiers: mockAllTiers },
		);

		renderWithRouter(<OutputCapSlider />);
		vi.mocked(setMaxOutputTokens).mockClear();

		const slider = screen.getByRole('slider');
		slider.focus();
		await userEvent.keyboard('{End}');

		await waitFor(() => {
			expect(
				screen.getByText(byExactTextContent('Upgrade to ultra')),
			).toBeInTheDocument();
		});
		await waitFor(() => {
			expect(screen.getByRole('slider')).toHaveAttribute(
				'aria-valuenow',
				'32768',
			);
		});
		expect(setMaxOutputTokens).not.toHaveBeenCalled();
	});
});
