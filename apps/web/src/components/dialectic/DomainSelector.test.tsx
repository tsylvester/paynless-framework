import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import type { DialecticStore } from '@paynless/store'; // Assuming DialecticStore type is exported
import type { DomainTagDescriptor } from '@paynless/types'; // Added import
import { DomainSelector } from './DomainSelector';
import { logger } from '@paynless/utils';

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
    };
});

// Mock the logger
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

const mockFetchAvailableDomainTags = vi.fn();
const mockSetSelectedDomainTag = vi.fn();

describe('DomainSelector', () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;
    const originalReleasePointerCapture = HTMLElement.prototype.releasePointerCapture;

    beforeEach(() => {
        vi.clearAllMocks();
        HTMLElement.prototype.scrollIntoView = vi.fn();
        HTMLElement.prototype.hasPointerCapture = vi.fn((pointerId) => false);
        HTMLElement.prototype.releasePointerCapture = vi.fn((pointerId) => {}); 

        // Initial store mock for each test
        const mockStore = createMockStoreState({});
        vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    });

    afterEach(() => {
        HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
        HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
        HTMLElement.prototype.releasePointerCapture = originalReleasePointerCapture;
        cleanup(); // Clean up the DOM after each test
    });

    const createMockStoreState = (overrides: Partial<DialecticStore>): DialecticStore => {
        return {
            ...initialDialecticStateValues,
            availableDomainTags: [], // This will be an array of DomainTagDescriptor
            isLoadingDomainTags: false,
            domainTagsError: null,
            selectedDomainTag: null, // This should store the ID of the selected descriptor
            fetchAvailableDomainTags: mockFetchAvailableDomainTags,
            setSelectedDomainTag: mockSetSelectedDomainTag,
            _resetForTesting: vi.fn(),
            ...overrides,
        } as DialecticStore;
    };
    
    const setup = (storeStateOverrides: Partial<DialecticStore & { availableDomainTags: DomainTagDescriptor[] }> = {}) => { // Ensure availableDomainTags is DomainTagDescriptor[]
        const mockStore = createMockStoreState(storeStateOverrides);
        vi.mocked(useDialecticStore).mockImplementation(<S extends DialecticStore, U>(selector: (state: S) => U) => {
            return selector(mockStore as S);
        });
        return render(<DomainSelector />);
    };

    it('renders loading state and calls fetchAvailableDomainTags on mount', () => {
        setup({ isLoadingDomainTags: true });
        expect(screen.getByText('Loading domains...')).toBeInTheDocument();
        expect(mockFetchAvailableDomainTags).toHaveBeenCalledTimes(1);
    });

    it('renders error state if domainTagsError is present', () => {
        const error = new Error('Failed to fetch');
        setup({ domainTagsError: error, isLoadingDomainTags: false });
        expect(screen.getByText('Error loading domains:')).toBeInTheDocument();
        expect(screen.getByText(error.message)).toBeInTheDocument();
        expect(mockFetchAvailableDomainTags).toHaveBeenCalledTimes(1);
    });

    it('renders "No domains available" when list is empty and not loading', async () => {
        const user = userEvent.setup();
        setup({ availableDomainTags: [], isLoadingDomainTags: false });
        
        const combobox = screen.getByRole('combobox');
        // eslint-disable-next-line sonarjs/no-duplicate-string
        await user.click(combobox); // Open the select

        // Items are in a portal, so use findBy which waits for appearance
        expect(await screen.findByText('No domains available')).toBeInTheDocument();
        expect(mockFetchAvailableDomainTags).toHaveBeenCalledTimes(1);
    });

    const mockTagA: DomainTagDescriptor = { id: 'id-A', domainTag: 'TagA', description: 'Description A', stageAssociation: 'thesis' };
    const mockTagB: DomainTagDescriptor = { id: 'id-B', domainTag: 'TagB', description: 'Description B', stageAssociation: 'thesis' };
    const mockTagC: DomainTagDescriptor = { id: 'id-C', domainTag: 'TagC', description: 'Description C', stageAssociation: 'thesis' };
    const mockTagD_NoDesc: DomainTagDescriptor = { id: 'id-D', domainTag: 'TagD', description: null, stageAssociation: 'thesis' };
    const mockTagE_NoStage: DomainTagDescriptor = { id: 'id-E', domainTag: 'TagE', description: 'Description E', stageAssociation: null };
    const mockTagF_NoDesc_NoStage: DomainTagDescriptor = { id: 'id-F', domainTag: 'TagF', description: null, stageAssociation: null };

    const formatDescriptorForTest = (descriptor: DomainTagDescriptor): string => {
        let label = descriptor.domainTag;
        if (descriptor.description) {
            label += ` - ${descriptor.description}`;
        }
        if (descriptor.stageAssociation) {
            label += ` (${descriptor.stageAssociation})`;
        }
        return label;
    };

    it('renders available domain tags and allows selection', async () => {
        const user = userEvent.setup();
        const tags: DomainTagDescriptor[] = [mockTagA, mockTagB];
        const { rerender } = setup({ availableDomainTags: tags, isLoadingDomainTags: false, selectedDomainTag: null });

        expect(mockFetchAvailableDomainTags).toHaveBeenCalledTimes(1);

        const trigger = screen.getByRole('combobox');
        expect(trigger).toHaveTextContent('Select a domain');
        await user.click(trigger);

        const optionTagA = await screen.findByText(formatDescriptorForTest(mockTagA));
        const optionTagB = await screen.findByText(formatDescriptorForTest(mockTagB));
        expect(optionTagA).toBeInTheDocument();
        expect(optionTagB).toBeInTheDocument();

        await user.click(optionTagB);

        await waitFor(() => {
            expect(mockSetSelectedDomainTag).toHaveBeenCalledWith(mockTagB.id); // Expect ID
        });
        
        const updatedStoreWithSelection = createMockStoreState({
            availableDomainTags: tags,
            isLoadingDomainTags: false,
            selectedDomainTag: mockTagB.id, // Simulate selection being applied with ID
        });
        vi.mocked(useDialecticStore).mockImplementation((selector) => selector(updatedStoreWithSelection));
        rerender(<DomainSelector />); 

        // The trigger should display the formatted string of the selected item
        expect(screen.getByRole('combobox')).toHaveTextContent(formatDescriptorForTest(mockTagB));
    });

    it('displays the currently selected domain tag from the store on initial render', () => {
        const tags: DomainTagDescriptor[] = [mockTagA, mockTagB, mockTagC];
        // selectedDomainTag in the store is the ID
        setup({ availableDomainTags: tags, isLoadingDomainTags: false, selectedDomainTag: mockTagC.id });

        // The trigger should display the formatted string of the selected item
        expect(screen.getByRole('combobox')).toHaveTextContent(formatDescriptorForTest(mockTagC));
        expect(mockFetchAvailableDomainTags).toHaveBeenCalledTimes(1);
    });

    it('shows placeholder if selectedDomainTag becomes null after an initial selection', async () => {
        const tags: DomainTagDescriptor[] = [mockTagA];
        // selectedDomainTag in the store is the ID
        const { rerender } = setup({ availableDomainTags: tags, isLoadingDomainTags: false, selectedDomainTag: mockTagA.id });
        expect(screen.getByRole('combobox')).toHaveTextContent(formatDescriptorForTest(mockTagA));

        const storeWithNullSelection = createMockStoreState({
            availableDomainTags: tags,
            isLoadingDomainTags: false,
            selectedDomainTag: null, 
        });
        vi.mocked(useDialecticStore).mockImplementation((selector) => selector(storeWithNullSelection));
        
        rerender(<DomainSelector />); 

        expect(screen.getByRole('combobox')).toHaveTextContent('Select a domain');
    });

    it('correctly formats descriptors with missing parts', async () => {
        const user = userEvent.setup();
        const tags: DomainTagDescriptor[] = [mockTagD_NoDesc, mockTagE_NoStage, mockTagF_NoDesc_NoStage];
        setup({ availableDomainTags: tags, isLoadingDomainTags: false, selectedDomainTag: null });

        const trigger = screen.getByRole('combobox');
        await user.click(trigger);

        expect(await screen.findByText(formatDescriptorForTest(mockTagD_NoDesc))).toBeInTheDocument(); // TagD (thesis)
        expect(await screen.findByText(formatDescriptorForTest(mockTagE_NoStage))).toBeInTheDocument(); // TagE - Description E
        expect(await screen.findByText(formatDescriptorForTest(mockTagF_NoDesc_NoStage))).toBeInTheDocument(); // TagF
    });
}); 