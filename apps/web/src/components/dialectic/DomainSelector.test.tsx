import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import { useDialecticStore, initialDialecticStateValues, selectCurrentProjectDetail } from '@paynless/store';
import type { DialecticDomain, DialecticStore, ApiError, DialecticProject } from '@paynless/types';
import { DomainSelector } from './DomainSelector';

// Mock the @paynless/store
vi.mock('@paynless/store', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@paynless/store')>();
    return {
        ...actual,
        useDialecticStore: vi.fn(),
        selectDomains: actual.selectDomains,
        selectIsLoadingDomains: actual.selectIsLoadingDomains,
        selectDomainsError: actual.selectDomainsError,
        selectSelectedDomain: actual.selectSelectedDomain,
        selectCurrentProjectDetail: actual.selectCurrentProjectDetail,
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

const mockFetchDomains = vi.fn();
const mockSetSelectedDomain = vi.fn();

describe('DomainSelector', () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

    beforeEach(() => {
        vi.clearAllMocks();
        HTMLElement.prototype.scrollIntoView = vi.fn();

        const mockStore = createMockStoreState({});
        vi.mocked(useDialecticStore).mockImplementation((selector) => selector(mockStore));
    });

    afterEach(() => {
        HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
        cleanup();
    });

    const createMockStoreState = (overrides: Partial<DialecticStore>): DialecticStore => {
        return {
            ...initialDialecticStateValues,
            domains: [],
            isLoadingDomains: false,
            domainsError: null,
            selectedDomain: null,
            fetchDomains: mockFetchDomains,
            setSelectedDomain: mockSetSelectedDomain,
            _resetForTesting: vi.fn(),
            ...overrides,
        } as DialecticStore;
    };
    
    const setup = (storeStateOverrides: Partial<DialecticStore & { domains: DialecticDomain[] }> = {}) => {
        const mockStore = createMockStoreState(storeStateOverrides);
        vi.mocked(useDialecticStore).mockImplementation(<S extends DialecticStore, U>(selector: (state: S) => U) => {
            return selector(mockStore as S);
        });
        return render(<DomainSelector />);
    };

    it('renders loading state and calls fetchDomains on mount if domains are not present', () => {
        setup({ isLoadingDomains: true, domains: [] });
        expect(screen.getByText('Loading domains...')).toBeInTheDocument();
        expect(mockFetchDomains).toHaveBeenCalledTimes(1);
    });

    it('does not call fetchDomains on mount if domains are already present', () => {
        const mockDomains: DialecticDomain[] = [{ id: '1', name: 'Existing Domain', description: '', parent_domain_id: null }];
        setup({ domains: mockDomains, isLoadingDomains: false });
        expect(mockFetchDomains).not.toHaveBeenCalled();
    });

    it('renders error state if domainsError is present', () => {
        const error: ApiError = { message: 'Failed to fetch', code: 'FETCH_ERROR' };
        setup({ domainsError: error, isLoadingDomains: false });
        expect(screen.getByText(`Error loading domains: ${error.message}`)).toBeInTheDocument();
        expect(mockFetchDomains).toHaveBeenCalledTimes(1);
    });

    it('renders "No domains available" when list is empty and not loading', () => {
        setup({ domains: [], isLoadingDomains: false });
        expect(screen.getByText('No domains available.')).toBeInTheDocument();
        expect(mockFetchDomains).toHaveBeenCalledTimes(1);
    });

    const mockDomainA: DialecticDomain = { id: 'id-A', name: 'Domain A', description: 'Description A', parent_domain_id: null };
    const mockDomainB: DialecticDomain = { id: 'id-B', name: 'Domain B', description: 'Description B', parent_domain_id: null };
    
    it('renders available domains and allows selection', async () => {
        const user = userEvent.setup();
        const domainsToTest: DialecticDomain[] = [mockDomainA, mockDomainB];
        
        const { rerender } = setup({ 
            domains: domainsToTest, 
            isLoadingDomains: false, 
            selectedDomain: null,
        });

        const trigger = screen.getByRole('combobox');
        expect(trigger).toHaveTextContent('Choose domain...');
        await user.click(trigger);

        const optionA = await screen.findByText(mockDomainA.name);
        const optionB = await screen.findByText(mockDomainB.name);
        expect(optionA).toBeInTheDocument();
        expect(optionB).toBeInTheDocument();

        await user.click(optionB);

        await waitFor(() => {
            expect(mockSetSelectedDomain).toHaveBeenCalledWith(mockDomainB);
        });
        
        const updatedStoreWithSelection = createMockStoreState({
            domains: domainsToTest,
            isLoadingDomains: false,
            selectedDomain: mockDomainB,
        });
        vi.mocked(useDialecticStore).mockImplementation((selector) => selector(updatedStoreWithSelection));
        rerender(<DomainSelector />); 

        expect(screen.getByRole('combobox')).toHaveTextContent(mockDomainB.name);
    });

    it('displays the currently selected domain from the store on initial render', () => {
        const domainsToTest: DialecticDomain[] = [mockDomainA, mockDomainB];
        setup({ 
            domains: domainsToTest, 
            isLoadingDomains: false, 
            selectedDomain: mockDomainA,
        });

        expect(screen.getByRole('combobox')).toHaveTextContent(mockDomainA.name);
    });

    it('should pre-fill the domain based on project details', async () => {
        const user = userEvent.setup();
        const mockDomains: DialecticDomain[] = [mockDomainA, mockDomainB];
        const mockProject: DialecticProject = { 
            id: 'proj-1',
            project_name: 'Test Project',
            selected_domain_id: mockDomainB.id,
            // ... other required DialecticProject properties
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_id: 'user-1',
            initial_user_prompt: 'prompt',
            selected_domain_overlay_id: null,
            domain_name: 'Domain B',
            repo_url: null,
            status: 'active',
            initial_prompt_resource_id: null,
        };

        const { rerender } = setup({
            domains: mockDomains,
            currentProjectDetail: mockProject,
            selectedDomain: null, // Start with no domain selected
        });

        // The useEffect should trigger the selection
        await waitFor(() => {
            expect(mockSetSelectedDomain).toHaveBeenCalledWith(mockDomainB);
        });

        // To verify it's displayed, we update the store state as if the action was successful
        const updatedStoreWithSelection = createMockStoreState({
            domains: mockDomains,
            currentProjectDetail: mockProject,
            selectedDomain: mockDomainB,
        });
        vi.mocked(useDialecticStore).mockImplementation((selector) => selector(updatedStoreWithSelection));
        rerender(<DomainSelector />);
        
        expect(screen.getByRole('combobox')).toHaveTextContent(mockDomainB.name);
    });
}); 