import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
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
    useDialecticStore, 
    selectOverlay, // This is now vi.fn() from the mock
    // selectSelectedDomainTag, // Actual selector via the mock - not directly used in tests, covered by useDialecticStore mock
    // selectSelectedDomainOverlayId, // Actual selector via the mock - not directly used in tests, covered by useDialecticStore mock
    initialDialecticStateValues // Actual initial state via the mock
} from '@paynless/store';
import type { DialecticStateValues, DialecticStore, DomainOverlayDescriptor } from '@paynless/types';
import { DomainOverlayDescriptionSelector } from './DomainOverlayDescriptionSelector';
// Import the reset function from your central mock file
import { resetDialecticStoreMocks } from '../../mocks/dialecticStore.mock'; // Corrected path

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
        resetDialecticStoreMocks(); // Reset centralized mocks
        mockSetSelectedDomainOverlayId.mockClear(); // Clear local action mock

        // Mock HTMLElement properties
        HTMLElement.prototype.scrollIntoView = vi.fn();
        HTMLElement.prototype.hasPointerCapture = vi.fn((_pointerId) => false); // _pointerId is intentionally unused
        HTMLElement.prototype.releasePointerCapture = vi.fn((_pointerId) => {}); // _pointerId is intentionally unused
    });

    afterEach(() => {
        HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
        HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
        HTMLElement.prototype.releasePointerCapture = originalReleasePointerCapture;
        cleanup();
    });

    // Simplified setup function
    const setup = (testSpecificState: Partial<DialecticStateValues> & { selectOverlayOutput?: DomainOverlayDescriptor[] | null }) => {
        const { selectOverlayOutput = [], ...stateOverrides } = testSpecificState;

        // Configure the mock return value for the selectOverlay selector (which is a vi.fn() from the central mock)
        vi.mocked(selectOverlay).mockReturnValue(selectOverlayOutput || []);

        // Create a mock store state for this specific test run
        // This state will be provided to the actual selectors (selectSelectedDomainTag, etc.)
        const mockStoreForTest: DialecticStore = {
            ...initialDialecticStateValues,
            // Apply test-specific state overrides
            selectedDomainTag: stateOverrides.selectedDomainTag !== undefined ? stateOverrides.selectedDomainTag : null,
            selectedDomainOverlayId: stateOverrides.selectedDomainOverlayId !== undefined ? stateOverrides.selectedDomainOverlayId : null,
            selectedStageAssociation: stateOverrides.selectedStageAssociation !== undefined ? stateOverrides.selectedStageAssociation : null,
            availableDomainOverlays: stateOverrides.availableDomainOverlays !== undefined ? stateOverrides.availableDomainOverlays : [],
            // Include other state properties from DialecticStateValues with defaults if not overridden
            contributionContentCache: stateOverrides.contributionContentCache || {},
            availableDomainTags: stateOverrides.availableDomainTags || [],
            isLoadingDomainTags: stateOverrides.isLoadingDomainTags || false,
            domainTagsError: stateOverrides.domainTagsError || null,
            projects: stateOverrides.projects || [],
            isLoadingProjects: stateOverrides.isLoadingProjects || false,
            projectsError: stateOverrides.projectsError || null,
            currentProjectDetail: stateOverrides.currentProjectDetail || null,
            isLoadingProjectDetail: stateOverrides.isLoadingProjectDetail || false,
            projectDetailError: stateOverrides.projectDetailError || null,
            modelCatalog: stateOverrides.modelCatalog || [],
            isLoadingModelCatalog: stateOverrides.isLoadingModelCatalog || false,
            modelCatalogError: stateOverrides.modelCatalogError || null,
            isCreatingProject: stateOverrides.isCreatingProject || false,
            createProjectError: stateOverrides.createProjectError || null,
            isStartingSession: stateOverrides.isStartingSession || false,
            startSessionError: stateOverrides.startSessionError || null,

            // Include the action used by the component
            setSelectedDomainOverlayId: mockSetSelectedDomainOverlayId,
            
            // Add other actions from DialecticActions as vi.fn() to satisfy DialecticStore type
            // Aligned with apps/web/src/mocks/dialecticStore.mock.ts
            fetchContributionContent: vi.fn(),
            fetchAvailableDomainTags: vi.fn(),
            setSelectedDomainTag: vi.fn(),
            fetchDialecticProjects: vi.fn(),
            fetchDialecticProjectDetails: vi.fn(),
            fetchAIModelCatalog: vi.fn(),
            createDialecticProject: vi.fn(),
            startDialecticSession: vi.fn(),
            uploadProjectResourceFile: vi.fn(),
            resetCreateProjectError: vi.fn(),
            resetProjectDetailsError: vi.fn(),
            // Assuming DialecticStore might have these from previous edits, if not, they can be removed if they cause type errors
            fetchAvailableDomainOverlays: vi.fn(),
            setSelectedStageAssociation: vi.fn(), 
            _resetForTesting: vi.fn(), // if part of the type, else remove
        };

        // Mock the useDialecticStore implementation for this test
        // Define the typed mock implementation to avoid JSX parsing issues with generics
        const mockImplementationForTest = <TResult,>(selectorFn: (state: DialecticStore) => TResult): TResult => selectorFn(mockStoreForTest);
        vi.mocked(useDialecticStore).mockImplementation(mockImplementationForTest);

        return render(<DomainOverlayDescriptionSelector />);
    };

    const overlay1: DomainOverlayDescriptor = { id: 'ov1', domainTag: 'tech', description: 'Overlay Description 1', stageAssociation: 'thesis' };
    const overlay2: DomainOverlayDescriptor = { id: 'ov2', domainTag: 'tech', description: 'Overlay Description 2', stageAssociation: 'thesis' };
    const overlay3_no_desc: DomainOverlayDescriptor = { id: 'ov3', domainTag: 'tech', description: null, stageAssociation: 'thesis' };


    it('should not render if selectedDomainTag is null', () => {
        setup({ 
            selectedDomainTag: null, 
            selectOverlayOutput: [overlay1, overlay2], 
            selectedStageAssociation: 'thesis' 
        });
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('should not render if selectOverlayOutput is null or empty', () => {
        setup({ 
            selectedDomainTag: 'tech', 
            selectOverlayOutput: null, 
            selectedStageAssociation: 'thesis' 
        });
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        
        setup({ 
            selectedDomainTag: 'tech', 
            selectOverlayOutput: [], 
            selectedStageAssociation: 'thesis' 
        });
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('should not render if selectOverlayOutput has only one item', () => {
        setup({ 
            selectedDomainTag: 'tech', 
            selectOverlayOutput: [overlay1], 
            selectedStageAssociation: 'thesis' 
        });
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('should render if selectedDomainTag is set and more than one overlay is available', async () => {
        const user = userEvent.setup();
        setup({ 
            selectedDomainTag: 'tech', 
            selectedStageAssociation: 'thesis', 
            selectOverlayOutput: [overlay1, overlay2], 
            selectedDomainOverlayId: null 
        });
        
        const combobox = screen.getByRole('combobox');
        expect(combobox).toBeInTheDocument();
        expect(combobox).toHaveTextContent('Choose a specific configuration...');
        
        await user.click(combobox);
        expect(await screen.findByText('Overlay Description 1')).toBeInTheDocument();
        expect(await screen.findByText('Overlay Description 2')).toBeInTheDocument();
    });

    it('displays fallback text if description is null', async () => {
        const user = userEvent.setup();
        setup({ 
            selectedDomainTag: 'tech', 
            selectedStageAssociation: 'thesis', 
            selectOverlayOutput: [overlay1, overlay3_no_desc], 
            selectedDomainOverlayId: null 
        });
        await user.click(screen.getByRole('combobox'));
        expect(await screen.findByText('Configuration ID: ov3')).toBeInTheDocument();
    });

    it('calls setSelectedDomainOverlayId with the correct id on selection', async () => {
        const user = userEvent.setup();
        // Get rerender from setup
        const { rerender } = setup({ 
            selectedDomainTag: 'tech', 
            selectedStageAssociation: 'thesis', 
            selectOverlayOutput: [overlay1, overlay2], 
            selectedDomainOverlayId: null 
        });
        
        await user.click(screen.getByRole('combobox'));
        const option2 = await screen.findByText('Overlay Description 2');
        await user.click(option2);

        await waitFor(() => {
            expect(mockSetSelectedDomainOverlayId).toHaveBeenCalledWith(overlay2.id);
        });

        // Update store mock for rerender to reflect the selection
        const newMockStoreStateForRerender: DialecticStore = {
            ...initialDialecticStateValues,
            selectedDomainTag: 'tech',
            selectedStageAssociation: 'thesis',
            selectedDomainOverlayId: overlay2.id, // Reflect the selection
            availableDomainOverlays: [overlay1, overlay2], 
            // Fill in other necessary state properties and actions as in other tests
            setSelectedDomainOverlayId: mockSetSelectedDomainOverlayId,
            fetchContributionContent: vi.fn(),
            fetchAvailableDomainTags: vi.fn(),
            setSelectedDomainTag: vi.fn(),
            fetchDialecticProjects: vi.fn(),
            fetchDialecticProjectDetails: vi.fn(),
            fetchAIModelCatalog: vi.fn(),
            createDialecticProject: vi.fn(),
            startDialecticSession: vi.fn(),
            uploadProjectResourceFile: vi.fn(),
            resetCreateProjectError: vi.fn(),
            resetProjectDetailsError: vi.fn(),
            fetchAvailableDomainOverlays: vi.fn(),
            setSelectedStageAssociation: vi.fn(), 
            _resetForTesting: vi.fn(),
        };

        vi.mocked(selectOverlay).mockReturnValue([overlay1, overlay2]);
        const mockImplementationForRerender = <TResult,>(selectorFn: (state: DialecticStore) => TResult): TResult => selectorFn(newMockStoreStateForRerender);
        vi.mocked(useDialecticStore).mockImplementation(mockImplementationForRerender);

        rerender(<DomainOverlayDescriptionSelector />);

        // After selection and rerender, the trigger should display the selected item's text
        expect(screen.getByRole('combobox')).toHaveTextContent('Overlay Description 2');
    });

    it('reflects selectedDomainOverlayId from store on initial render', () => {
        setup({ 
            selectedDomainTag: 'tech', 
            selectedStageAssociation: 'thesis', 
            selectOverlayOutput: [overlay1, overlay2], 
            selectedDomainOverlayId: overlay1.id 
        });
        expect(screen.getByRole('combobox')).toHaveTextContent('Overlay Description 1');
    });

    it('handles selection of an item with null description (shows Default Overlay in trigger)', async () => {
        const user = userEvent.setup();
        const { rerender } = setup({ 
            selectedDomainTag: 'tech', 
            selectedStageAssociation: 'thesis', 
            selectOverlayOutput: [overlay1, overlay3_no_desc], 
            selectedDomainOverlayId: null 
        });
        
        await user.click(screen.getByRole('combobox'));
        const option3 = await screen.findByText('Configuration ID: ov3');
        await user.click(option3);

        await waitFor(() => {
            expect(mockSetSelectedDomainOverlayId).toHaveBeenCalledWith(overlay3_no_desc.id);
        });

        // Update store mock for rerender
        const newMockStoreStateForRerender: DialecticStore = {
            ...initialDialecticStateValues,
            selectedDomainTag: 'tech',
            selectedStageAssociation: 'thesis',
            selectedDomainOverlayId: overlay3_no_desc.id,
            availableDomainOverlays: [overlay1, overlay3_no_desc], // ensure this is available for selectOverlay if it were real
             // Include all actions to satisfy DialecticStore type
            setSelectedDomainOverlayId: mockSetSelectedDomainOverlayId,
            fetchContributionContent: vi.fn(),
            fetchAvailableDomainTags: vi.fn(),
            setSelectedDomainTag: vi.fn(),
            fetchDialecticProjects: vi.fn(),
            fetchDialecticProjectDetails: vi.fn(),
            fetchAIModelCatalog: vi.fn(),
            createDialecticProject: vi.fn(),
            startDialecticSession: vi.fn(),
            uploadProjectResourceFile: vi.fn(),
            resetCreateProjectError: vi.fn(),
            resetProjectDetailsError: vi.fn(),
            fetchAvailableDomainOverlays: vi.fn(),
            setSelectedStageAssociation: vi.fn(), 
            _resetForTesting: vi.fn(),
        };
        
        // Configure the selectOverlay mock for the new state
        vi.mocked(selectOverlay).mockReturnValue([overlay1, overlay3_no_desc]); // Or filter as needed if selectOverlay logic was complex
        
        // Define the typed mock implementation for the rerender scenario
        const mockImplementationForRerender = <TResult,>(selectorFn: (state: DialecticStore) => TResult): TResult => selectorFn(newMockStoreStateForRerender);
        vi.mocked(useDialecticStore).mockImplementation(mockImplementationForRerender);
        
        rerender(<DomainOverlayDescriptionSelector />);

        expect(screen.getByRole('combobox')).toHaveTextContent('Configuration ID: ov3');
    });

    it('handles selection of an item with null description (shows Configuration ID: ov3 in trigger)', async () => {
        const user = userEvent.setup();
        const { rerender } = setup({ 
            selectedDomainTag: 'tech', 
            selectedStageAssociation: 'thesis', 
            selectOverlayOutput: [overlay1, overlay3_no_desc], 
            selectedDomainOverlayId: null 
        });
        
        await user.click(screen.getByRole('combobox'));
        const option3 = await screen.findByText('Configuration ID: ov3');
        await user.click(option3);

        await waitFor(() => {
            expect(mockSetSelectedDomainOverlayId).toHaveBeenCalledWith(overlay3_no_desc.id);
        });

        // Update store mock for rerender
        const newMockStoreStateForRerender: DialecticStore = {
            ...initialDialecticStateValues,
            selectedDomainTag: 'tech',
            selectedStageAssociation: 'thesis',
            selectedDomainOverlayId: overlay3_no_desc.id,
            availableDomainOverlays: [overlay1, overlay3_no_desc], // ensure this is available for selectOverlay if it were real
             // Include all actions to satisfy DialecticStore type
            setSelectedDomainOverlayId: mockSetSelectedDomainOverlayId,
            fetchContributionContent: vi.fn(),
            fetchAvailableDomainTags: vi.fn(),
            setSelectedDomainTag: vi.fn(),
            fetchDialecticProjects: vi.fn(),
            fetchDialecticProjectDetails: vi.fn(),
            fetchAIModelCatalog: vi.fn(),
            createDialecticProject: vi.fn(),
            startDialecticSession: vi.fn(),
            uploadProjectResourceFile: vi.fn(),
            resetCreateProjectError: vi.fn(),
            resetProjectDetailsError: vi.fn(),
            fetchAvailableDomainOverlays: vi.fn(),
            setSelectedStageAssociation: vi.fn(), 
            _resetForTesting: vi.fn(),
        };
        
        // Configure the selectOverlay mock for the new state
        vi.mocked(selectOverlay).mockReturnValue([overlay1, overlay3_no_desc]); // Or filter as needed if selectOverlay logic was complex
        
        // Define the typed mock implementation for the rerender scenario
        const mockImplementationForRerender = <TResult,>(selectorFn: (state: DialecticStore) => TResult): TResult => selectorFn(newMockStoreStateForRerender);
        vi.mocked(useDialecticStore).mockImplementation(mockImplementationForRerender);
        
        rerender(<DomainOverlayDescriptionSelector />);

        expect(screen.getByRole('combobox')).toHaveTextContent('Configuration ID: ov3');
    });
}); 