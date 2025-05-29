import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import type { DialecticStore } from '@paynless/store'; // Assuming DialecticStore type is exported
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
            availableDomainTags: [],
            isLoadingDomainTags: false,
            domainTagsError: null,
            selectedDomainTag: null,
            fetchAvailableDomainTags: mockFetchAvailableDomainTags,
            setSelectedDomainTag: mockSetSelectedDomainTag,
            _resetForTesting: vi.fn(),
            ...overrides,
        } as DialecticStore;
    };
    
    const setup = (storeStateOverrides: Partial<DialecticStore> = {}) => {
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
        await user.click(combobox); // Open the select

        // Items are in a portal, so use findBy which waits for appearance
        expect(await screen.findByText('No domains available')).toBeInTheDocument();
        expect(mockFetchAvailableDomainTags).toHaveBeenCalledTimes(1);
    });

    it('renders available domain tags and allows selection', async () => {
        const user = userEvent.setup();
        const tags = ['TagA', 'TagB'];
        const { rerender } = setup({ availableDomainTags: tags, isLoadingDomainTags: false, selectedDomainTag: null });

        expect(mockFetchAvailableDomainTags).toHaveBeenCalledTimes(1);

        const trigger = screen.getByRole('combobox');
        expect(trigger).toHaveTextContent('Select a domain');
        await user.click(trigger);

        // Use findByText for items that might appear asynchronously or in a portal
        const optionTagA = await screen.findByText('TagA');
        const optionTagB = await screen.findByText('TagB');
        expect(optionTagA).toBeInTheDocument();
        expect(optionTagB).toBeInTheDocument();

        await user.click(optionTagB);

        await waitFor(() => {
            expect(mockSetSelectedDomainTag).toHaveBeenCalledWith('TagB');
        });
        
        // Update the store mock to reflect selection AND re-render the component with the new store state
        const updatedStoreWithSelection = createMockStoreState({
            availableDomainTags: tags,
            isLoadingDomainTags: false,
            selectedDomainTag: 'TagB', // Simulate selection being applied
        });
        vi.mocked(useDialecticStore).mockImplementation((selector) => selector(updatedStoreWithSelection));
        rerender(<DomainSelector />); 

        expect(screen.getByRole('combobox')).toHaveTextContent('TagB');
    });

    it('displays the currently selected domain tag from the store on initial render', () => {
        const tags = ['TagA', 'TagB', 'TagC'];
        setup({ availableDomainTags: tags, isLoadingDomainTags: false, selectedDomainTag: 'TagC' });

        expect(screen.getByRole('combobox')).toHaveTextContent('TagC');
        expect(mockFetchAvailableDomainTags).toHaveBeenCalledTimes(1);
    });

    it('shows placeholder if selectedDomainTag becomes null after an initial selection', async () => {
        const tags = ['TagA'];
        const { rerender } = setup({ availableDomainTags: tags, isLoadingDomainTags: false, selectedDomainTag: 'TagA' });
        expect(screen.getByRole('combobox')).toHaveTextContent('TagA');

        // Simulate the store updating to have selectedDomainTag as null
        const storeWithNullSelection = createMockStoreState({
            availableDomainTags: tags,
            isLoadingDomainTags: false,
            selectedDomainTag: null, 
        });
        vi.mocked(useDialecticStore).mockImplementation((selector) => selector(storeWithNullSelection));
        
        rerender(<DomainSelector />); 

        expect(screen.getByRole('combobox')).toHaveTextContent('Select a domain');
    });
}); 