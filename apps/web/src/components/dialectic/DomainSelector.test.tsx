import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import type { DomainTagDescriptor, DialecticStore, ApiError, DomainOverlayDescriptor } from '@paynless/types';
import { DomainSelector } from './DomainSelector';

// Mock the @paynless/store
vi.mock('@paynless/store', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@paynless/store')>();
    return {
        ...actual,
        useDialecticStore: vi.fn(),
        selectAvailableDomainTags: actual.selectAvailableDomainTags,
        selectIsLoadingDomainTags: actual.selectIsLoadingDomainTags,
        selectDomainTagsError: actual.selectDomainTagsError,
        selectSelectedDomainTag: actual.selectSelectedDomainTag,
        selectSelectedStageAssociation: actual.selectSelectedStageAssociation,
        selectSelectedDomainOverlayId: actual.selectSelectedDomainOverlayId,
        selectOverlay: actual.selectOverlay,
    };
});

// Mock the logger
vi.mock('@paynless/utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@paynless/utils')>();
    return {
        ...actual,
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        }
    };
});

const mockFetchAvailableDomainTags = vi.fn();
const mockSetSelectedDomainTag = vi.fn();
const mockFetchAvailableDomainOverlays = vi.fn();
const mockSetSelectedDomainOverlayId = vi.fn();

describe('DomainSelector', () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;
    const originalReleasePointerCapture = HTMLElement.prototype.releasePointerCapture;

    beforeEach(() => {
        vi.clearAllMocks();
        HTMLElement.prototype.scrollIntoView = vi.fn();
        HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
        HTMLElement.prototype.releasePointerCapture = vi.fn(() => {});

        const mockStore = createMockStoreState({});
        vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    });

    afterEach(() => {
        HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
        HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
        HTMLElement.prototype.releasePointerCapture = originalReleasePointerCapture;
        cleanup();
    });

    const createMockStoreState = (overrides: Partial<DialecticStore>): DialecticStore => {
        return {
            ...initialDialecticStateValues,
            availableDomainTags: [],
            isLoadingDomainTags: false,
            domainTagsError: null,
            selectedDomainTag: null,
            selectedStageAssociation: 'thesis_stage',
            selectedDomainOverlayId: null,
            availableDomainOverlays: [],
            
            fetchAvailableDomainTags: mockFetchAvailableDomainTags,
            setSelectedDomainTag: mockSetSelectedDomainTag,
            fetchAvailableDomainOverlays: mockFetchAvailableDomainOverlays,
            setSelectedDomainOverlayId: mockSetSelectedDomainOverlayId,
            
            _resetForTesting: vi.fn(),
            ...overrides,
        } as DialecticStore;
    };
    
    const setup = (storeStateOverrides: Partial<DialecticStore & { availableDomainTags: DomainTagDescriptor[], availableDomainOverlays?: DomainOverlayDescriptor[] }> = {}) => {
        const mockStore = createMockStoreState(storeStateOverrides);
        vi.mocked(useDialecticStore).mockImplementation(<S extends DialecticStore, U>(selector: (state: S) => U) => {
            return selector(mockStore as S);
        });
        return render(<DomainSelector />);
    };

    it('renders loading state and calls fetchAvailableDomainTags on mount', () => {
        setup({ isLoadingDomainTags: true, selectedStageAssociation: 'thesis_stage' });
        expect(screen.getByText('Loading domains...')).toBeInTheDocument();
        expect(mockFetchAvailableDomainTags).toHaveBeenCalledTimes(1);
        expect(mockFetchAvailableDomainOverlays).toHaveBeenCalledWith('thesis_stage'); 
    });

    it('renders error state if domainTagsError is present', () => {
        const error: ApiError = { message: 'Failed to fetch', code: 'FETCH_ERROR' };
        setup({ domainTagsError: error, isLoadingDomainTags: false, selectedStageAssociation: 'thesis_stage' });
        expect(screen.getByText(`Error loading domains: ${error.message}`)).toBeInTheDocument();
        expect(mockFetchAvailableDomainTags).toHaveBeenCalledTimes(1);
        expect(mockFetchAvailableDomainOverlays).toHaveBeenCalledWith('thesis_stage'); 
    });

    it('renders "No domains available" when list is empty and not loading', async () => {
        setup({ availableDomainTags: [], isLoadingDomainTags: false, selectedStageAssociation: 'some_stage_with_no_tags' });
        
        expect(screen.getByText('No domains available for the current stage.')).toBeInTheDocument();
        expect(mockFetchAvailableDomainTags).toHaveBeenCalledTimes(1);
        expect(mockFetchAvailableDomainOverlays).toHaveBeenCalledWith('some_stage_with_no_tags');
    });

    const mockTagA: DomainTagDescriptor = { id: 'id-A', domainTag: 'tag_a', description: 'Description A', stageAssociation: 'thesis_stage' };
    const mockTagB: DomainTagDescriptor = { id: 'id-B', domainTag: 'tag_b', description: 'Description B', stageAssociation: 'thesis_stage' };
    const mockTagC: DomainTagDescriptor = { id: 'id-C', domainTag: 'tag_c', description: 'Description C', stageAssociation: 'thesis_stage' };
    const mockTagD_NoDesc: DomainTagDescriptor = { id: 'id-D', domainTag: 'tag_d_no_desc', description: null, stageAssociation: 'another_stage' };
    const mockTagE_NoStage: DomainTagDescriptor = { id: 'id-E', domainTag: 'tag_e_no_stage', description: 'Description E', stageAssociation: null };
    const mockTagF_NoDesc_NoStage: DomainTagDescriptor = { id: 'id-F', domainTag: 'tag_f_all_missing', description: null, stageAssociation: null };

    const getExpectedItemDisplay = (descriptor: DomainTagDescriptor): string => {
        if (!descriptor || !descriptor.domainTag) return '';
        return descriptor.domainTag
            .toLowerCase()
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    it('renders available domain tags and allows selection, resetting overlay ID', async () => {
        const user = userEvent.setup();
        const tagsToTest: DomainTagDescriptor[] = [mockTagA, mockTagB];
        
        const { rerender } = setup({ 
            availableDomainTags: tagsToTest, 
            isLoadingDomainTags: false, 
            selectedDomainTag: null,
            selectedStageAssociation: 'thesis_stage'
        });

        expect(mockFetchAvailableDomainTags).toHaveBeenCalledTimes(1);
        expect(mockFetchAvailableDomainOverlays).toHaveBeenCalledWith('thesis_stage');

        const trigger = screen.getByRole('combobox');
        expect(trigger).toHaveTextContent('Choose domain...');
        await user.click(trigger);

        const optionTagA = await screen.findByText(getExpectedItemDisplay(mockTagA));
        const optionTagB = await screen.findByText(getExpectedItemDisplay(mockTagB));
        expect(optionTagA).toBeInTheDocument();
        expect(optionTagB).toBeInTheDocument();

        await user.click(optionTagB);

        await waitFor(() => {
            expect(mockSetSelectedDomainTag).toHaveBeenCalledWith(mockTagB.domainTag); 
            expect(mockSetSelectedDomainOverlayId).toHaveBeenCalledWith(null);
        });
        
        const updatedStoreWithSelection = createMockStoreState({
            availableDomainTags: tagsToTest,
            isLoadingDomainTags: false,
            selectedDomainTag: mockTagB.domainTag, 
            selectedStageAssociation: 'thesis_stage',
            selectedDomainOverlayId: null 
        });
        vi.mocked(useDialecticStore).mockImplementation((selector) => selector(updatedStoreWithSelection));
        rerender(<DomainSelector />); 

        expect(screen.getByRole('combobox')).toHaveTextContent(getExpectedItemDisplay(mockTagB));
    });

    it('displays the currently selected domain tag from the store on initial render', () => {
        const tagsToTest: DomainTagDescriptor[] = [mockTagA, mockTagB, mockTagC];
        setup({ 
            availableDomainTags: tagsToTest, 
            isLoadingDomainTags: false, 
            selectedDomainTag: mockTagC.domainTag, 
            selectedStageAssociation: 'thesis_stage' 
        });

        expect(screen.getByRole('combobox')).toHaveTextContent(getExpectedItemDisplay(mockTagC));
        expect(mockFetchAvailableDomainTags).toHaveBeenCalledTimes(1);
        expect(mockFetchAvailableDomainOverlays).toHaveBeenCalledWith('thesis_stage');
    });

    it('correctly formats descriptors with missing parts', async () => {
        const user = userEvent.setup();
        const tagsToTest: DomainTagDescriptor[] = [mockTagD_NoDesc, mockTagE_NoStage, mockTagF_NoDesc_NoStage];
        const { rerender } = setup({ 
            availableDomainTags: tagsToTest, 
            isLoadingDomainTags: false, 
            selectedDomainTag: null,
            selectedStageAssociation: 'another_stage'
        });
        expect(mockFetchAvailableDomainOverlays).toHaveBeenCalledWith('another_stage');

        const trigger = screen.getByRole('combobox');
        await user.click(trigger);
        const optionTagD = await screen.findByText(getExpectedItemDisplay(mockTagD_NoDesc));
        expect(optionTagD).toBeInTheDocument();
        expect(screen.queryByText(getExpectedItemDisplay(mockTagE_NoStage))).not.toBeInTheDocument();
        expect(screen.queryByText(getExpectedItemDisplay(mockTagF_NoDesc_NoStage))).not.toBeInTheDocument();

        await user.click(optionTagD);
        await waitFor(() => {
            expect(mockSetSelectedDomainTag).toHaveBeenCalledWith(mockTagD_NoDesc.domainTag);
            expect(mockSetSelectedDomainOverlayId).toHaveBeenCalledWith(null);
        });

        const updatedStoreWithSelection = createMockStoreState({
            availableDomainTags: tagsToTest,
            isLoadingDomainTags: false,
            selectedDomainTag: mockTagD_NoDesc.domainTag, 
            selectedStageAssociation: 'another_stage',
            selectedDomainOverlayId: null
        });
        vi.mocked(useDialecticStore).mockImplementation((selector) => selector(updatedStoreWithSelection));
        rerender(<DomainSelector />); 
        expect(screen.getByRole('combobox')).toHaveTextContent(getExpectedItemDisplay(mockTagD_NoDesc));
    });

    it('auto-selects single overlay when a domain tag with one overlay is chosen', async () => {
        const user = userEvent.setup();
        const singleOverlay: DomainOverlayDescriptor = { 
            id: 'overlay-single-id', 
            domainTag: 'tag_a',
            stageAssociation: 'thesis_stage',
            description: 'Single Overlay Desc', 
        };

        const mockOverlaysArray = [singleOverlay];

        const { rerender } = setup({ 
            availableDomainTags: [mockTagA], 
            isLoadingDomainTags: false, 
            selectedDomainTag: null,
            selectedStageAssociation: 'thesis_stage',
            availableDomainOverlays: mockOverlaysArray,
        });

        const trigger = screen.getByRole('combobox');
        await user.click(trigger);
        const optionTagA = await screen.findByText(getExpectedItemDisplay(mockTagA));
        await user.click(optionTagA);

        await waitFor(() => {
            expect(mockSetSelectedDomainTag).toHaveBeenCalledWith(mockTagA.domainTag);
            expect(mockSetSelectedDomainOverlayId).toHaveBeenCalledWith(null); 
        });

        const storeAfterTagSelection = createMockStoreState({
            availableDomainTags: [mockTagA],
            selectedDomainTag: mockTagA.domainTag,
            selectedStageAssociation: 'thesis_stage',
            availableDomainOverlays: mockOverlaysArray,
            selectedDomainOverlayId: null,
        });
        vi.mocked(useDialecticStore).mockImplementation((selector) => selector(storeAfterTagSelection));
        
        rerender(<DomainSelector />);

        await waitFor(() => {
            expect(mockSetSelectedDomainOverlayId).toHaveBeenCalledWith(singleOverlay.id);
        });
    });

    it('does not auto-select if multiple overlays are available', async () => {
        const user = userEvent.setup();
        const multiOverlay1: DomainOverlayDescriptor = { id: 'overlay-multi-1', domainTag: 'tag_a', stageAssociation: 'thesis_stage', description: 'Multi 1' };
        const multiOverlay2: DomainOverlayDescriptor = { id: 'overlay-multi-2', domainTag: 'tag_a', stageAssociation: 'thesis_stage', description: 'Multi 2' };
        const mockMultipleOverlaysArray = [multiOverlay1, multiOverlay2];

        const { rerender } = setup({ 
            availableDomainTags: [mockTagA], 
            selectedDomainTag: null,
            selectedStageAssociation: 'thesis_stage',
            availableDomainOverlays: mockMultipleOverlaysArray,
        });
        
        const trigger = screen.getByRole('combobox');
        await user.click(trigger);
        const optionTagA = await screen.findByText(getExpectedItemDisplay(mockTagA));
        await user.click(optionTagA);

        await waitFor(() => {
            expect(mockSetSelectedDomainTag).toHaveBeenCalledWith(mockTagA.domainTag);
            expect(mockSetSelectedDomainOverlayId).toHaveBeenCalledWith(null);
        });
        
        mockSetSelectedDomainOverlayId.mockClear();

        const storeAfterTagSelectionWithMultipleOverlays = createMockStoreState({
            availableDomainTags: [mockTagA],
            selectedDomainTag: mockTagA.domainTag,
            selectedStageAssociation: 'thesis_stage',
            availableDomainOverlays: mockMultipleOverlaysArray,
            selectedDomainOverlayId: null, 
        });
        vi.mocked(useDialecticStore).mockImplementation((selector) => selector(storeAfterTagSelectionWithMultipleOverlays));

        rerender(<DomainSelector />); 

        await new Promise(resolve => setTimeout(resolve, 200)); 
        expect(mockSetSelectedDomainOverlayId).not.toHaveBeenCalled(); 
    });
}); 