import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

// Import type of the mock module for safer explicit mocking
import type * as DialecticStoreMock from '../../mocks/dialecticStore.mock';

// Explicitly mock @paynless/store to use everything from your centralized mock file
// and ensure original exports like initialDialecticStateValues are also available.
vi.mock('@paynless/store', async () => {
  const originalStoreModule = await vi.importActual<typeof import('@paynless/store')>('@paynless/store');
  const mockOverrides = await vi.importActual<typeof DialecticStoreMock>('../../mocks/dialecticStore.mock.ts');
  
  return {
    ...originalStoreModule, // Provide all actual exports first
    ...mockOverrides,       // Then override with our mock exports (useDialecticStore, selectOverlay, etc.)
  };
});

// Imports from @paynless/store will now come from the mock
import { 
    selectOverlay,
    useDialecticStore, // Import the state setter
} from '@paynless/store';
import { DialecticStage, type DialecticStateValues, type DomainOverlayDescriptor } from '@paynless/types';
import { DomainOverlayDescriptionSelector } from './DomainOverlayDescriptionSelector';
// Import the reset function from your central mock file
import { resetDialecticStoreMock } from '../../mocks/dialecticStore.mock';

// Mock the logger (remains unchanged)
vi.mock('@paynless/utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@paynless/utils')>();
    return {
        ...actual,
        logger: {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        }
    };
});

// Local mock for the action used by the component
const mockSetSelectedDomainOverlayId = vi.fn();

describe('DomainOverlayDescriptionSelector', () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;
    const originalReleasePointerCapture = HTMLElement.prototype.releasePointerCapture;

    beforeEach(() => {
        resetDialecticStoreMock(); // Reset centralized mocks
        mockSetSelectedDomainOverlayId.mockClear(); // Clear local action mock

        // Mock HTMLElement properties
        HTMLElement.prototype.scrollIntoView = vi.fn();
        HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
        HTMLElement.prototype.releasePointerCapture = vi.fn(() => {});
    });

    afterEach(() => {
        cleanup();
        HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
        HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
        HTMLElement.prototype.releasePointerCapture = originalReleasePointerCapture;
    });

    // Simplified setup function
    const setup = (testSpecificState: Partial<DialecticStateValues> & { selectOverlayOutput?: DomainOverlayDescriptor[] | null }, testId = "domain-overlay-selector") => {
        const { selectOverlayOutput = [], ...stateOverrides } = testSpecificState;

        // Configure the mock return value for the selectOverlay selector
        vi.mocked(selectOverlay).mockReturnValue(selectOverlayOutput || []);

        // Use the imported setter to configure the store's state for this test
        useDialecticStore.setState({
            ...stateOverrides,
            setSelectedDomainOverlayId: mockSetSelectedDomainOverlayId, // Ensure the action mock is in the state
        });
        
        const renderResult = render(<DomainOverlayDescriptionSelector testId={testId} />);
        const component = screen.queryByTestId(testId);

        return { ...renderResult, component };
    };

    const overlay1: DomainOverlayDescriptor = { id: 'ov1', domainTag: 'tech', description: 'Overlay Description 1', stageAssociation: DialecticStage.THESIS, overlay_values: {}, system_prompt_id: 'sp1' };
    const overlay2: DomainOverlayDescriptor = { id: 'ov2', domainTag: 'tech', description: 'Overlay Description 2', stageAssociation: DialecticStage.THESIS, overlay_values: {}, system_prompt_id: 'sp2' };
    const overlay3_no_desc: DomainOverlayDescriptor = { id: 'ov3', domainTag: 'tech', description: null, stageAssociation: DialecticStage.THESIS, overlay_values: {}, system_prompt_id: 'sp3' };

    it('should not render if selectedDomainTag is null', () => {
        const { component } = setup({ selectedDomainTag: null }, 'no-render-test');
        expect(component).not.toBeInTheDocument();
    });

    it('should render, but not show a combobox, if selectOverlayOutput is null', () => {
        const { component } = setup({ selectedDomainTag: 'tech', selectOverlayOutput: null });
        expect(component).toBeInTheDocument();
        expect(within(component!).queryByRole('combobox')).not.toBeInTheDocument();
    });
    
    it('should render, but not show a combobox, if selectOverlayOutput is empty', () => {
        const { component } = setup({ selectedDomainTag: 'tech', selectOverlayOutput: [] });
        expect(component).toBeInTheDocument();
        expect(within(component!).queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('should not render a combobox if selectOverlayOutput has only one item', () => {
        const { component } = setup({ selectedDomainTag: 'tech', selectOverlayOutput: [overlay1] });
        expect(within(component!).queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('should render if selectedDomainTag is set and more than one overlay is available', async () => {
        const user = userEvent.setup();
        const { component } = setup({ selectedDomainTag: 'tech', selectOverlayOutput: [overlay1, overlay2], selectedDomainOverlayId: null });
        
        const combobox = within(component!).getByRole('combobox');
        expect(combobox).toHaveTextContent('Choose a specific configuration...');
        
        await user.click(combobox);
        expect(await screen.findByText('Overlay Description 1')).toBeInTheDocument();
        expect(await screen.findByText('Overlay Description 2')).toBeInTheDocument();
    });

    it('displays fallback text in list if description is null', async () => {
        const user = userEvent.setup();
        const { component } = setup({ selectedDomainTag: 'tech', selectOverlayOutput: [overlay1, overlay3_no_desc], selectedDomainOverlayId: null });
        
        await user.click(within(component!).getByRole('combobox'));
        expect(await screen.findByText('Overlay Description 1')).toBeInTheDocument();
        expect(await screen.findByText(/Configuration ID: ov3/)).toBeInTheDocument();
    });

    it('calls setSelectedDomainOverlayId with the correct id on selection', async () => {
        const user = userEvent.setup();
        const { rerender, component } = setup({ 
            selectedDomainTag: 'tech', 
            selectOverlayOutput: [overlay1, overlay2],
            selectedDomainOverlayId: null 
        });

        await user.click(within(component!).getByRole('combobox'));
        await user.click(await screen.findByText('Overlay Description 2'));

        expect(mockSetSelectedDomainOverlayId).toHaveBeenCalledWith(overlay2.id);

        useDialecticStore.setState({ selectedDomainOverlayId: overlay2.id });
        rerender(<DomainOverlayDescriptionSelector testId="domain-overlay-selector"/>);

        await waitFor(() => {
            expect(within(component!).getByRole('combobox')).toHaveTextContent('Overlay Description 2');
        });
    });

    it('reflects selectedDomainOverlayId from store on initial render', async () => {
        const { component } = setup({ selectedDomainTag: 'tech', selectOverlayOutput: [overlay1, overlay2], selectedDomainOverlayId: overlay1.id });
        expect(within(component!).getByRole('combobox')).toHaveTextContent('Overlay Description 1');
    });

    it('handles selection of an item with null description and shows fallback in trigger', async () => {
        const user = userEvent.setup();
        const { rerender, component } = setup({
            selectedDomainTag: 'tech',
            selectOverlayOutput: [overlay1, overlay3_no_desc],
            selectedDomainOverlayId: null
        });

        await user.click(within(component!).getByRole('combobox'));
        await user.click(await screen.findByText(/Configuration ID: ov3/));

        expect(mockSetSelectedDomainOverlayId).toHaveBeenCalledWith(overlay3_no_desc.id);

        useDialecticStore.setState({ selectedDomainOverlayId: overlay3_no_desc.id });
        rerender(<DomainOverlayDescriptionSelector testId="domain-overlay-selector" />);
        
        await waitFor(() => {
            expect(within(component!).getByRole('combobox')).toHaveTextContent('Configuration ID: ov3');
        });
    });
}); 