import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import { useDialecticStore } from '@paynless/store';
import type { DialecticDomain, DialecticStore, ApiError } from '@paynless/types';
import { DomainMultiSelector } from './DomainMultiSelector';

// Mock the @paynless/store
vi.mock('@paynless/store', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@paynless/store')>();
    return {
        ...actual,
        useDialecticStore: vi.fn(),
        selectDomains: actual.selectDomains,
        selectIsLoadingDomains: actual.selectIsLoadingDomains,
        selectDomainsError: actual.selectDomainsError,
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
const mockOnSelectionChange = vi.fn();

describe('DomainMultiSelector', () => {
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
            domains: [],
            isLoadingDomains: false,
            domainsError: null,
            fetchDomains: mockFetchDomains,
            ...overrides,
        } as DialecticStore;
    };
    
    const setup = (storeStateOverrides: Partial<DialecticStore & { domains: DialecticDomain[] }> = {}, props = {}) => {
        const mockStore = createMockStoreState(storeStateOverrides);
        vi.mocked(useDialecticStore).mockImplementation(<S extends DialecticStore, U>(selector: (state: S) => U) => {
            return selector(mockStore as S);
        });
        
        const defaultProps = {
            selectedDomainId: '',
            onSelectionChange: mockOnSelectionChange,
            placeholder: "Select a domain...",
            ...props
        };
        
        return render(<DomainMultiSelector {...defaultProps} />);
    };

    const mockDomainA: DialecticDomain = { 
        id: 'id-A', 
        name: 'Domain A', 
        description: 'Description A', 
        parent_domain_id: null,
        is_enabled: true
    };
    const mockDomainB: DialecticDomain = { 
        id: 'id-B', 
        name: 'Domain B', 
        description: 'Description B', 
        parent_domain_id: null,
        is_enabled: true
    };

    it('renders loading state when isLoading is true', () => {
        setup({ isLoadingDomains: true, domains: [] });
        expect(screen.getByText('Loading domains...')).toBeInTheDocument();
        expect(mockFetchDomains).not.toHaveBeenCalled();
    });

    it('renders error state if domainsError is present', () => {
        const error: ApiError = { message: 'Failed to fetch', code: 'FETCH_ERROR' };
        setup({ domainsError: error, isLoadingDomains: false });
        expect(screen.getByText(`Error loading domains: ${error.message}`)).toBeInTheDocument();
        expect(mockFetchDomains).not.toHaveBeenCalled();
    });

    it('fetches domains and renders "No domains available" when list is empty and not loading', () => {
        setup({ domains: [], isLoadingDomains: false });
        expect(screen.getByText('No domains available.')).toBeInTheDocument();
        expect(mockFetchDomains).toHaveBeenCalledTimes(1);
    });

    it('does not call fetchDomains on mount if domains are already present', () => {
        const mockDomains: DialecticDomain[] = [mockDomainA];
        setup({ domains: mockDomains, isLoadingDomains: false });
        expect(mockFetchDomains).not.toHaveBeenCalled();
    });

    it('renders available domains as radio list and allows single selection', async () => {
        const user = userEvent.setup();
        const domainsToTest: DialecticDomain[] = [mockDomainA, mockDomainB];
        
        setup({ 
            domains: domainsToTest, 
            isLoadingDomains: false,
        });

        // Check that the placeholder is shown
        expect(screen.getByText('Select a domain...')).toBeInTheDocument();
        
        // Check that domains are rendered with descriptions
        expect(screen.getByText(mockDomainA.name)).toBeInTheDocument();
        expect(screen.getByText(mockDomainA.description as string)).toBeInTheDocument();
        expect(screen.getByText(mockDomainB.name)).toBeInTheDocument();
        expect(screen.getByText(mockDomainB.description as string)).toBeInTheDocument();

        // Select Domain A by clicking its radio button
        const radioA = screen.getByDisplayValue('id-A');
        await user.click(radioA);

        await waitFor(() => {
            expect(mockOnSelectionChange).toHaveBeenCalledWith('id-A');
        });
    });

    it('displays selected count when multiple domains are selected', () => {
        const domainsToTest: DialecticDomain[] = [mockDomainA, mockDomainB];
        setup({ 
            domains: domainsToTest, 
            isLoadingDomains: false,
        }, {
            selectedDomainIds: ['id-A', 'id-B']
        });

        expect(screen.getByRole('button')).toHaveTextContent('2 domains selected');
    });

    it('displays single domain name when only one is selected', () => {
        const domainsToTest: DialecticDomain[] = [mockDomainA, mockDomainB];
        setup({ 
            domains: domainsToTest, 
            isLoadingDomains: false,
        }, {
            selectedDomainIds: ['id-A']
        });

        expect(screen.getByRole('button')).toHaveTextContent('Domain A');
    });

    it('shows checkmarks for selected domains', async () => {
        const user = userEvent.setup();
        const domainsToTest: DialecticDomain[] = [mockDomainA, mockDomainB];
        
        setup({ 
            domains: domainsToTest, 
            isLoadingDomains: false,
        }, {
            selectedDomainIds: ['id-A']
        });

        const trigger = screen.getByRole('button');
        await user.click(trigger);

        // Should show checkmark for selected domain
        const domainARow = screen.getByText(mockDomainA.name).closest('[role="menuitemcheckbox"]');
        expect(domainARow).toHaveAttribute('data-state', 'checked');
        
        const domainBRow = screen.getByText(mockDomainB.name).closest('[role="menuitemcheckbox"]');
        expect(domainBRow).toHaveAttribute('data-state', 'unchecked');
    });

    it('allows deselecting domains', async () => {
        const user = userEvent.setup();
        const domainsToTest: DialecticDomain[] = [mockDomainA, mockDomainB];
        
        setup({ 
            domains: domainsToTest, 
            isLoadingDomains: false,
        }, {
            selectedDomainIds: ['id-A', 'id-B']
        });

        const trigger = screen.getByRole('button');
        await user.click(trigger);

        // Deselect Domain A
        const optionA = await screen.findByText(mockDomainA.name);
        await user.click(optionA);

        await waitFor(() => {
            expect(mockOnSelectionChange).toHaveBeenCalledWith(['id-B']);
        });
    });

    it('displays selection count in footer when domains are selected', async () => {
        const user = userEvent.setup();
        const domainsToTest: DialecticDomain[] = [mockDomainA, mockDomainB];
        
        setup({ 
            domains: domainsToTest, 
            isLoadingDomains: false,
        }, {
            selectedDomainIds: ['id-A', 'id-B']
        });

        const trigger = screen.getByRole('button');
        await user.click(trigger);

        expect(screen.getByText('2 selected')).toBeInTheDocument();
    });

    it('can be disabled', () => {
        const domainsToTest: DialecticDomain[] = [mockDomainA];
        setup({ 
            domains: domainsToTest, 
            isLoadingDomains: false,
        }, {
            disabled: true
        });

        expect(screen.getByRole('button')).toBeDisabled();
    });
});
